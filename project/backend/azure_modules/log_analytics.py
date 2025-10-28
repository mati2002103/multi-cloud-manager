from flask import jsonify, request, session, Response
from .utils import FlaskCredential
from .vm import find_vm_by_name

from azure.identity import ClientSecretCredential

from azure.mgmt.loganalytics import LogAnalyticsManagementClient
from azure.mgmt.monitor import MonitorManagementClient
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.monitor.models import (
    DataCollectionRuleResource,
    PerfCounterDataSource,
    WindowsEventLogDataSource, 
    SyslogDataSource,
    LogAnalyticsDestination,
    DataFlow
)
from azure.monitor.query import LogsQueryClient,LogsQueryStatus
from datetime import timedelta,datetime
import csv
import io
import os
import traceback


CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")

def list_log_analytics():
    subscription_id = request.args.get("subscriptionId")

    if not subscription_id:
        return jsonify({"error": "Parametr 'subscriptionId' jest wymagany."}), 400

    try:
        credential = FlaskCredential()
        client = LogAnalyticsManagementClient(credential, subscription_id)

        workspaces = client.workspaces.list()

        result = []
        for ws in workspaces:
            sku_name = ws.sku.name if ws.sku else None
            retention = ws.retention_in_days if hasattr(ws, 'retention_in_days') else None
            
            result.append({
                "name": ws.name,
                "id": ws.id,
                "location": ws.location,
                "workspaceGuid": ws.customer_id,
                "sku": sku_name,
                "retentionInDays": retention,
                "resourceGroup": ws.id.split('/')[4] 
            })

        return jsonify({"value": result}), 200
        
    except HttpResponseError as e:
         return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


def create_log_analytics():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    workspace_name = data.get("workspaceName")
    location = data.get("location") or "westeurope"
    sku = data.get("sku") or "PerGB2018"
    retention = data.get("retentionInDays") or 30

    if not all([subscription_id, rg_name, workspace_name]):
        return jsonify({"error": "subscriptionId, rgName i workspaceName są wymagane"}), 400

    try:
        credential = FlaskCredential()
        client = LogAnalyticsManagementClient(credential, subscription_id)

        try:
            existing = client.workspaces.get(rg_name, workspace_name)
            return jsonify({
                "message": "Workspace już istnieje",
                "workspace": {
                    "name": existing.name,
                    "id": existing.id,
                    "location": existing.location
                }
            }), 200
        except ResourceNotFoundError:
            pass  

        ws_params = {
            "location": location,
            "sku": {"name": sku},
            "retention_in_days": retention
        }

        poller = client.workspaces.begin_create_or_update(rg_name, workspace_name, ws_params)
        ws = poller.result() 
        return jsonify({
            "message": "Workspace utworzony",
            "workspace": {
                "name": ws.name,
                "id": ws.id,
                "location": ws.location
            }
        }), 201

    except HttpResponseError as e:
        return jsonify({"error": f"Azure error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    


def list_dcr(vm_id):
    target_workspace_id = request.args.get("workspaceId") 

    try:
        credential = FlaskCredential()
        vm_info = find_vm_by_name(vm_id, credential)
        if not vm_info:
            return jsonify({"error": f"Nie znaleziono maszyny wirtualnej o nazwie '{vm_id}'."}), 404
        
        vm_resource_id = vm_info.get("resourceId")
        subscription_id = vm_info.get("subscriptionId")

        if not vm_resource_id or not subscription_id:
             return jsonify({"error": f"Nie udało się uzyskać pełnego ID zasobu lub ID subskrypcji dla VM '{vm_id}'."}), 500

        monitor_client = MonitorManagementClient(credential, subscription_id)
        associations = monitor_client.data_collection_rule_associations.list_by_resource(
            resource_uri=vm_resource_id 
        )

        result = []
        for assoc in associations:
            dcr_id = assoc.data_collection_rule_id
            if not dcr_id: continue

            should_add = True 
            
            if target_workspace_id:
                try:
                    parts = dcr_id.split('/')
                    dcr_rg = parts[4] 
                    dcr_name = parts[8]                    
                    dcr_details = monitor_client.data_collection_rules.get(dcr_rg, dcr_name)                    
                    dcr_destination_ws_id = None
                    if (dcr_details.destinations and 
                        dcr_details.destinations.log_analytics and 
                        len(dcr_details.destinations.log_analytics) > 0):
                        dcr_destination_ws_id = dcr_details.destinations.log_analytics[0].workspace_resource_id                    
                    if dcr_destination_ws_id != target_workspace_id:
                        should_add = False                        
                except Exception as detail_error:
                    print(f"Ostrzeżenie: Błąd podczas pobierania szczegółów DCR {dcr_id}: {detail_error}")
                    should_add = False 

            if should_add:
                dcr_name_only = dcr_id.split('/')[-1]
                result.append({
                    "associationName": assoc.name,
                    "dcrId": dcr_id,
                    "dcrName": dcr_name_only,
                    "description": getattr(assoc, "description", "")
                })

        return jsonify({"value": result}), 200

    except HttpResponseError as e:
         return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500
    
ASSOCIATION_API_VERSION = "2021-09-01-preview"

def create_dcr_and_associate_vm():
    data = request.get_json() or {}
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup") 
    dcr_name = data.get("dcrName")
    location = data.get("location") 
    workspace_id = data.get("workspaceId")
    vm_resource_id = data.get("vmResourceId") 
    
    collect_performance = data.get("collectPerformance", True) 
    collect_system_logs = data.get("collectSystemLogs", True)

    if not all([subscription_id, rg_name, dcr_name, location, workspace_id, vm_resource_id]):
        return jsonify({"error": "Wymagane: subscriptionId, resourceGroup, dcrName, location, workspaceId, vmResourceId"}), 400

    if not collect_performance and not collect_system_logs:
         return jsonify({"error": "Musisz wybrać co najmniej jedno źródło danych (Performance Counters lub System Logs)."}), 400

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, subscription_id)
        resource_client = ResourceManagementClient(credential, subscription_id) 
        compute_client = ComputeManagementClient(credential, subscription_id)

        try:
            vm_parts = vm_resource_id.split('/')
            vm_rg = vm_parts[4]
            vm_name = vm_parts[8]
            vm_details = compute_client.virtual_machines.get(vm_rg, vm_name, expand='instanceView')
            os_type = vm_details.storage_profile.os_disk.os_type
            print(f"DEBUG: Wykryto typ OS dla VM '{vm_name}': {os_type}")
        except Exception as os_check_error:
            print(f"Ostrzeżenie: Nie udało się określić typu OS dla VM {vm_resource_id}: {os_check_error}")
            return jsonify({"error": f"Nie można określić typu systemu operacyjnego VM: {os_check_error}"}), 500

        data_sources = {}
        data_flows = []
        la_destination_name = "laDestination" 

        if collect_performance:
            perf_source_name = "perfCounters"
            perf_stream_name = "Microsoft-Perf"
            counters = [
                 "\\Processor(_Total)\\% Processor Time", 
                 "\\Memory\\Available MBytes", 
                 "/builtin/memory/availablememorymbytes" 
            ]
            data_sources["performance_counters"] = [
                PerfCounterDataSource(
                    name=perf_source_name, streams=[perf_stream_name],
                    sampling_frequency_in_seconds=60, counter_specifiers=counters
                )
            ]
            data_flows.append(DataFlow(streams=[perf_stream_name], destinations=[la_destination_name]))

        if collect_system_logs:
            if os_type == "Windows":
                event_source_name = "windowsEventLogs"
                event_stream_name = "Microsoft-WindowsEvent"
                data_sources["windows_event_logs"] = [
                    WindowsEventLogDataSource(
                        name=event_source_name, streams=[event_stream_name],
                        x_path_queries=["System!*[System[(Level=1 or Level=2 or Level=3)]]", "Application!*[System[(Level=1 or Level=2 or Level=3)]]"] 
                    )
                ]
                data_flows.append(DataFlow(streams=[event_stream_name], destinations=[la_destination_name]))
            elif os_type == "Linux":
                syslog_source_name = "linuxSyslog"
                syslog_stream_name = "Microsoft-Syslog"
                data_sources["syslog"] = [
                    SyslogDataSource(
                        name=syslog_source_name, streams=[syslog_stream_name],
                        facility_names=["*"], log_levels=["*"] 
                    )
                ]
                data_flows.append(DataFlow(streams=[syslog_stream_name], destinations=[la_destination_name]))

        dcr_config = DataCollectionRuleResource(
            location=location, data_sources=data_sources,
            destinations={"log_analytics": [LogAnalyticsDestination(name=la_destination_name, workspace_resource_id=workspace_id)]},
            data_flows=data_flows
        )
        print(f"Tworzenie DCR '{dcr_name}' w RG '{rg_name}'...")
        dcr = monitor_client.data_collection_rules.create(
            resource_group_name=rg_name, data_collection_rule_name=dcr_name, body=dcr_config
        )
        
        print(f"DCR '{dcr.name}' utworzony (ID: {dcr.id}).")

        association_name = f"{vm_name}-{dcr_name}-assoc" 
        association_resource_id = f"{vm_resource_id}/providers/Microsoft.Insights/dataCollectionRuleAssociations/{association_name}"
        association_payload = {"properties": {"dataCollectionRuleId": dcr.id}}
        
        print(f"Tworzenie skojarzenia '{association_name}' dla VM '{vm_name}'...")
        poller_assoc = resource_client.resources.begin_create_or_update_by_id(
            resource_id=association_resource_id, api_version=ASSOCIATION_API_VERSION, parameters=association_payload
        )
        association = poller_assoc.result()
        print(f"Skojarzenie '{association.name}' utworzone.")

        return jsonify({
            "message": f"DCR '{dcr.name}' utworzony i pomyślnie skojarzony z VM.",
            "dcrId": dcr.id, "associationId": association.id
        }), 201

    except HttpResponseError as e:
        error_details = e.message
        try:
            error_body = e.response.json()
            if error_body and 'error' in error_body and 'message' in error_body['error']:
                error_details = error_body['error']['message']
        except:
            pass
        return jsonify({"error": f"Azure API error: {error_details}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500
    
    
def export_vm_logs_csv(vm_id):
    workspace_guid = request.args.get("workspaceGuid") 
    log_type = request.args.get("type", "heartbeat").lower()
    timespan_hours = int(request.args.get("hours", 1))

    if not workspace_guid:
         return jsonify({"error": "Wymagany jest parametr 'workspaceGuid' (sam GUID)."}), 400

    try:
        credential = ClientSecretCredential(
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET
        )
        client = LogsQueryClient(credential)
        
    except Exception as e:
        print(f"--- BŁĄD UWIERZYTELNIANIA --- \n{traceback.format_exc()}\n")
        return jsonify({"error": f"Błąd uwierzytelniania aplikacji: {str(e)}"}), 500

    try:
        if log_type == "perf":
            query = f"""
            Perf
            | where Computer == '{vm_id}'
            | where CounterName == '% Processor Time' or CounterName == 'Available MBytes Memory'
            | where InstanceName == '_Total' or InstanceName == 'Memory' or InstanceName == 'total'
            | summarize AverageValue = avg(CounterValue) by TimeGenerated, CounterName
            | order by TimeGenerated desc
            | top 500 by TimeGenerated
            """
        else: 
            query = f"""
            Heartbeat
            | where Computer == '{vm_id}'
            | top 500 by TimeGenerated desc
            | project TimeGenerated, Computer, Category, OSType, OSName, Version, ResourceId
            """

        
        response = client.query_workspace(
            workspace_id=workspace_guid,
            query=query,
            timespan=timedelta(hours=timespan_hours)
        )

        if response.status == LogsQueryStatus.SUCCESS and response.tables:
            table = response.tables[0]
            if not table.rows:
                return jsonify({"message": "Nie znaleziono danych."}), 200 
            output = io.StringIO()
            writer = csv.writer(output,delimiter=';')

            header = table.columns
            writer.writerow(header)
            
            for row in table.rows:
                row_data = [str(item) if isinstance(item, (datetime, timedelta)) else item for item in row]
                writer.writerow(row_data)

            csv_content = output.getvalue()
            output.close()
            print(f"{vm_id}_{log_type}_logs.csv")#
            return Response(
                csv_content,
                mimetype="text/csv",
                headers={"Content-Disposition": f"attachment;filename={vm_id}_{log_type}_logs.csv"}
            )
          

        else:
             return jsonify({"error": "Nie udało się wykonać zapytania KQL.", "details": str(response.partial_error)}), 500

    except HttpResponseError as e:
       print(f"--- BŁĄD HTTP (API) --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"Azure API error during query: {str(e)}"}), e.status_code or 500
    except Exception as e:
       print(f"--- KRYTYCZNY BŁĄD --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"An unexpected error occurred during log export: {str(e)}"}), 500
    

def query_vm_logs(vm_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    workspace_guid = data.get("workspaceGuid")
    kql_query = data.get("kqlQuery")

    if not workspace_guid or not kql_query:
        return jsonify({"error": "Wymagane są 'workspaceGuid' i 'kqlQuery'."}), 400

   
    dangerous_keywords = ['delete', 'update', 'modify', 'insert', 'drop']
    if any(keyword in kql_query.lower() for keyword in dangerous_keywords):
        return jsonify({"error": "Zapytanie zawiera niedozwolone słowa kluczowe (np. delete, update)."}), 400
    
    if f"Computer == '{vm_id}'" not in kql_query and f"Computer == \"{vm_id}\"" not in kql_query:
         return jsonify({"error": f"Zapytanie musi zawierać filtr 'where Computer == \"{vm_id}\"'."}), 400
    

    try:
        credential = ClientSecretCredential(
            tenant_id=TENANT_ID,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET
        )
        client = LogsQueryClient(credential)
    except Exception as e:
        print(f"--- BŁĄD UWIERZYTELNIANIA --- \n{traceback.format_exc()}\n")
        return jsonify({"error": f"Błąd uwierzytelniania aplikacji: {str(e)}"}), 500

    try:
        print(f"Executing Custom KQL Query: {kql_query} on GUID: {workspace_guid}")
        
        response = client.query_workspace(
            workspace_id=workspace_guid,
            query=kql_query,
            timespan=timedelta(days=1) 
        )

        if response.status == LogsQueryStatus.SUCCESS and response.tables:
            table = response.tables[0]
            if not table.rows:
                return jsonify({"message": "Zapytanie nie zwróciło danych.", "value": []}), 200

            header = table.columns
            result_list = []
            for row in table.rows:
                row_data = [str(item) if isinstance(item, (datetime, timedelta)) else item for item in row]
                result_list.append(dict(zip(header, row_data)))
            
            return jsonify({"value": result_list}) 
        else:
             return jsonify({"error": "Nie udało się wykonać zapytania KQL.", "details": str(response.partial_error)}), 500

    except HttpResponseError as e:
       print(f"--- BŁĄD HTTP (API) --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"Azure API error during query: {str(e)}"}), e.status_code or 500
    except Exception as e:
       print(f"--- KRYTYCZNY BŁĄD --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"An unexpected error occurred during query execution: {str(e)}"}), 500