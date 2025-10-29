from flask import jsonify, session
import traceback
from datetime import datetime, timedelta
from azure.core.exceptions import HttpResponseError
from azure.monitor.query import MetricsQueryClient, MetricAggregationType
from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.subscription import SubscriptionClient
from .utils import FlaskCredential
from azure.mgmt.loganalytics import LogAnalyticsManagementClient
from azure.core.exceptions import HttpResponseError, ResourceNotFoundError
import traceback

def parse_resource_id(resource_id):
    parts = resource_id.strip("/").split("/")
    return {
        "subscription": parts[1],
        "resource_group": parts[3],
        "provider": parts[5],
        "resource_type": parts[6],
        "resource_name": parts[7]
    }

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
                ws_parts = parse_resource_id(workspace_resource_id)
                ws_sub_id = ws_parts.get("subscription")
                ws_rg = ws_parts.get("resource_group")
                ws_name = ws_parts.get("resource_name")

                if not all([ws_sub_id, ws_rg, ws_name]):
                    return jsonify({"error": f"Nieprawidłowe ID Log Analytics Workspace: {workspace_resource_id}"}), 500

                log_analytics_client = LogAnalyticsManagementClient(credential, ws_sub_id)
                workspace = log_analytics_client.workspaces.get(ws_rg, ws_name)

                result = {
                    "id": workspace.id,
                    "name": workspace.name,
                    "location": workspace.location,
                    "workspaceGuid": workspace.customer_id 
                }
                return jsonify({"value": result}), 200
            
            except ResourceNotFoundError:
                return jsonify({"error": f"Powiązany Workspace ({workspace_resource_id}) nie został znaleziony."}), 404
        
        else:
            return jsonify({"value": None}), 200

    except HttpResponseError as e:
         return jsonify({"error": f"Błąd Azure API: {str(e)}"}), e.status_code or 500
    except Exception as e:
       print(f"--- KRYTYCZNY BŁĄD w get_aci_linked_workspace --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500