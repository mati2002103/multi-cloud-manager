from flask import jsonify, request, session
from .utils import FlaskCredential
from .vm import find_vm_by_name

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
from datetime import timedelta




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
            os_type = vm_details.storage_profile.os_disk.os_type.value
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
        poller_dcr = monitor_client.data_collection_rules.begin_create(
            resource_group_name=rg_name, data_collection_rule_name=dcr_name, body=dcr_config
        )
        dcr = poller_dcr.result()
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
    
def logs_basic():
    from azure.identity import DefaultAzureCredential
    workspace_id = request.args.get("workspaceId")
    query_type = request.args.get("queryType", "heartbeat")

    if not workspace_id:
        return jsonify({"error": "Brak workspaceId"}), 400

    try:
        credential = DefaultAzureCredential()
        client = LogsQueryClient(credential)

        if query_type == "heartbeat":
            query = "Heartbeat | top 10 by TimeGenerated desc"
        elif query_type == "perf":
            query = "Perf | where ObjectName == 'Processor' | top 10 by TimeGenerated desc"
        else:
            return jsonify({"error": "Nieznany queryType"}), 400

        result = client.query_workspace(
            workspace_id,
            query,
            timespan=timedelta(hours=1)
        )

        rows = []
        if result.status == LogsQueryStatus.SUCCESS and result.tables:
            table = result.tables[0]
            for row in table.rows:
                rows.append(dict(zip([col.name for col in table.columns], row)))

        return jsonify({"value": rows}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500