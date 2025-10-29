from flask import jsonify, session, request, Response
import traceback
from datetime import datetime, timedelta
from azure.core.exceptions import HttpResponseError
from azure.monitor.query import MetricsQueryClient, MetricAggregationType
from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.subscription import SubscriptionClient
from .utils import FlaskCredential
from azure.mgmt.loganalytics import LogAnalyticsManagementClient
from azure.core.exceptions import HttpResponseError, ResourceNotFoundError
from azure.identity import ClientSecretCredential
from azure.monitor.query import LogsQueryClient, LogsQueryStatus

import traceback
import io
import os
import csv


CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")

def parse_resource_id(resource_id):
    parts = resource_id.strip("/").split("/")
    return {
        "subscription": parts[1],
        "resource_group": parts[3],
        "provider": parts[5],
        "resource_type": parts[6],
        "resource_name": parts[7]
    }

def get_app_credential():
    return ClientSecretCredential(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )

def _find_container_details(container_name, credential):
    accounts = session.get("accounts", [])
    azure_account = next((acc for acc in accounts if acc.get("provider") == "azure"), None)
    if not azure_account:
        return None
    
    subscriptions = azure_account.get("subscriptions", [])
    if not subscriptions:
         sub_client = SubscriptionClient(credential)
         subscriptions = [s.subscription_id for s in sub_client.subscriptions.list()]

    for sub_id in subscriptions:
        try:
            aci_client = ContainerInstanceManagementClient(credential, sub_id)
            container_groups = aci_client.container_groups.list()
            for cg in container_groups:
                if cg.name == container_name:
                    return {
                        "subscriptionId": sub_id,
                        "resourceGroup": cg.id.split('/')[4],
                        "resourceId": cg.id,
                        "location": cg.location,
                        "containerName": cg.name
                    }
        except Exception as e:
            print(f"Ostrzeżenie: Nie udało się przeszukać subskrypcji {sub_id} pod kątem kontenerów. Błąd: {e}")
            continue 
            
    return None 

def aci_monitor_metrics(container_group_name):
    
    try:
        credential = FlaskCredential()
    except Exception as e:
         return jsonify({"error": f"Błąd uwierzytelniania: {str(e)}"}), 401
    
    try:
        aci_info = _find_container_details(container_group_name, credential)
        if not aci_info:
            return jsonify({"error": f"Nie znaleziono kontenera ACI o nazwie '{container_group_name}'."}), 404
        
        resource_id = aci_info.get("resourceId")
        
        client = MetricsQueryClient(credential)
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=1)
        metric_names = ["CpuUsage", "MemoryUsage"] 
        
        response = client.query_resource(
            resource_uri=resource_id,
            metric_names=metric_names,
            timespan=(start_time, end_time),
            interval="PT1M", 
            aggregations=[MetricAggregationType.AVERAGE]
        )
        
        metrics_data = []
        for metric in response.metrics:
            datapoints = []
            for series in metric.timeseries:
                for val in series.data:
                    if val.average is not None:
                        datapoints.append({"timestamp": val.timestamp.isoformat(), "average": round(val.average, 2)})
            metrics_data.append({
                "name": metric.name,
                "unit": str(metric.unit),
                "data": datapoints
            })
            
        aci_info["metrics"] = metrics_data
        return jsonify(aci_info), 200

    except HttpResponseError as e:
        print(f"--- BŁĄD HTTP (API) --- \n{traceback.format_exc()}\n")
        return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        print(f"--- KRYTYCZNY BŁĄD --- \n{traceback.format_exc()}\n")
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500
    
def get_aci_linked_workspace(container_group_name):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        credential = FlaskCredential()
        
        aci_info = _find_container_details(container_group_name, credential)
        if not aci_info:
            return jsonify({"error": f"Nie znaleziono kontenera ACI o nazwie '{container_group_name}'."}), 404
        
        sub_id = aci_info.get("subscriptionId")
        rg_name = aci_info.get("resourceGroup")
        
        aci_client = ContainerInstanceManagementClient(credential, sub_id)
        container_group = aci_client.container_groups.get(rg_name, container_group_name)

        if (container_group.diagnostics and 
            container_group.diagnostics.log_analytics and 
            container_group.diagnostics.log_analytics.workspace_id):
            
            workspace_resource_id = container_group.diagnostics.log_analytics.workspace_id
            

            try:
                parts = workspace_resource_id.split('/')
                
                if '/' not in workspace_resource_id:
                    log_analytics_client = LogAnalyticsManagementClient(credential, sub_id)
                    workspaces = log_analytics_client.workspaces.list_by_resource_group(rg_name)

                    for ws in workspaces:
                        if ws.customer_id == workspace_resource_id:
                            result = {
                                "id": ws.id,
                                "name": ws.name,
                                "location": ws.location,
                                "workspaceGuid": ws.customer_id
                            }
                    return jsonify({"value": result}), 200

            except (ResourceNotFoundError, IndexError) as e:
                print(f"BŁĄD: Nie udało się pobrać workspace'a (ResourceNotFound/IndexError): {e}")
                return jsonify({"error": f"Powiązany Workspace ({workspace_resource_id}) nie został znaleziony lub ma nieprawidłowe ID."}), 404
        
        else:
            print(f"DEBUG: Kontener '{container_group_name}' nie ma powiązanego workspace'a.")
            return jsonify({"value": None}), 200

    except HttpResponseError as e:
         return jsonify({"error": f"Błąd Azure API: {str(e)}"}), e.status_code or 500
    except Exception as e:
       print(f"--- KRYTYCZNY BŁĄD w get_aci_linked_workspace --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500#



def export_aci_logs_csv(container_group_name):
    workspace_guid = request.args.get("workspaceGuid")
    timespan_hours = int(request.args.get("hours", 1))
    log_type = request.args.get("type", "container").lower()

    if not workspace_guid:
        return jsonify({"error": "Wymagany jest parametr 'workspaceGuid'."}), 400

    try:
        credential = ClientSecretCredential(
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET
        )
        client = LogsQueryClient(credential)
    except Exception as e:
        return jsonify({"error": f"Błąd uwierzytelniania: {str(e)}"}), 500

    try:
        if log_type == "container":
            query = f"""
            ContainerInstanceLog_CL
            | where ContainerGroup_s == '{container_group_name}'
            | top 500 by TimeGenerated desc
            """
        else:
            return jsonify({"error": f"Nieobsługiwany typ logów: {log_type}"}), 400

        response = client.query_workspace(
            workspace_id=workspace_guid,
            query=query,
            timespan=timedelta(hours=timespan_hours)
        )

        if response.status == LogsQueryStatus.SUCCESS and response.tables:
            table = response.tables[0]
            if not table.rows:
                return jsonify({"message": "Brak danych logów."}), 200

            output = io.StringIO()
            writer = csv.writer(output, delimiter=';')
            writer.writerow(table.columns)
            for row in table.rows:
                row_data = [item.isoformat() if isinstance(item, datetime) else str(item) for item in row]
                writer.writerow(row_data)

            csv_content = output.getvalue()
            output.close()

            return Response(
                csv_content,
                mimetype="text/csv",
                headers={"Content-Disposition": f"attachment;filename={container_group_name}_logs.csv"}
            )
        else:
            return jsonify({"error": "Nie udało się pobrać logów.", "details": str(response.partial_error)}), 500

    except Exception as e:
        return jsonify({"error": f"Błąd podczas eksportu logów: {str(e)}"}), 500

def run_kql_query(container_group_name):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    workspace_guid = data.get("workspaceGuid")
    kql_query = data.get("kqlQuery")

    if not workspace_guid or not kql_query:
        return jsonify({"error": "Wymagane są 'workspaceGuid' i 'kqlQuery'."}), 400

    dangerous_keywords = ['delete', 'update', 'modify', 'insert', 'drop']
    if any(keyword in kql_query.lower() for keyword in dangerous_keywords):
        return jsonify({"error": "Zapytanie zawiera niedozwolone słowa kluczowe."}), 400

    if f"ContainerGroup_s == '{container_group_name}'" not in kql_query and f"ContainerGroup_s == \"{container_group_name}\"" not in kql_query:
        return jsonify({"error": f"Zapytanie musi zawierać filtr 'ContainerGroup_s == \"{container_group_name}\"'."}), 400

    try:
        credential = ClientSecretCredential(
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET
        )
        client = LogsQueryClient(credential)
    except Exception as e:
        return jsonify({"error": f"Błąd uwierzytelniania: {str(e)}"}), 500

    try:
        response = client.query_workspace(
            workspace_id=workspace_guid,
            query=kql_query,
            timespan=timedelta(days=1)
        )

        if response.status == LogsQueryStatus.SUCCESS and response.tables:
            table = response.tables[0]
            if not table.rows:
                return jsonify({"columns": [], "rows": []}), 200

            columns = table.columns
            rows = [
                [item.isoformat() if isinstance(item, datetime) else str(item) for item in row]
                for row in table.rows
            ]

            return jsonify({"columns": columns, "rows": rows}), 200
        else:
            return jsonify({"error": "Nie udało się wykonać zapytania.", "details": str(response.partial_error)}), 500

    except Exception as e:
        return jsonify({"error": f"Błąd podczas wykonania zapytania: {str(e)}"}), 500