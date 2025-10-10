from flask import jsonify, request, session
from .utils import FlaskCredential


from azure.mgmt.loganalytics import LogAnalyticsManagementClient
from azure.mgmt.monitor import MonitorManagementClient
from azure.loganalytics import LogAnalyticsDataClient
from azure.loganalytics.models import QueryBody
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError
from azure.mgmt.monitor.models import (
    DataCollectionRuleResource,
    PerfCounterDataSource,
    LogAnalyticsDestination,
    DataFlow
)
from azure.monitor.query import LogsQueryClient
from azure.monitor.query import LogsQueryStatus
from datetime import timedelta




def list_log_analytics():
    subscription_id = request.args.get("subscriptionId")
    rg_name = request.args.get("rgName")

    if not subscription_id or not rg_name:
        return jsonify({"error": "Brak parametru subscriptionId lub rgName"}), 400

    try:
        credential = FlaskCredential()
        client = LogAnalyticsManagementClient(credential, subscription_id)

        workspaces = client.workspaces.list_by_resource_group(rg_name)
        result = []
        for ws in workspaces:
            result.append({
                "name": ws.name,
                "id": ws.id,
                "location": ws.location,
                "sku": getattr(ws, "sku", None).name if getattr(ws, "sku", None) else None,
                "retentionInDays": getattr(ws, "retention_in_days", None)
            })

        return jsonify({"value": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500



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
    


def list_dcr():
    subscription_id = request.args.get("subscriptionId")
    rg_name = request.args.get("rgName")
    if not subscription_id or not rg_name:
        return jsonify({"error": "Brak subscriptionId lub rgName"}), 400

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, subscription_id)
        dcrs = monitor_client.data_collection_rules.list_by_resource_group(rg_name)

        result = []
        for dcr in dcrs:
            result.append({
                "name": dcr.name,
                "id": dcr.id,
                "location": dcr.location,
                "description": getattr(dcr, "description", "")
            })

        return jsonify({"value": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500



def create_dcr():
    data = request.get_json() or {}
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup")
    workspace_id = data.get("workspaceId")
    vm_id = data.get("vmResourceId")

    if not all([subscription_id, rg_name, workspace_id, vm_id]):
        return jsonify({"error": "Wymagane: subscriptionId, resourceGroup, workspaceId, vmResourceId"}), 400

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, subscription_id)
        dcr_name = f"dcr-{vm_id.split('/')[-1]}"
        dcr_config = DataCollectionRuleResource(
        location="westeurope",
        data_sources={
            "performance_counters": [
                PerfCounterDataSource(
                    name="cpu",
                    streams=["Microsoft-Perf"],
                    sampling_frequency_in_seconds=60,
                    counter_specifiers=["\\Processor(_Total)\\% Processor Time"]
                        )
                    ]
                },
                destinations={
                    "log_analytics": [
                        LogAnalyticsDestination(
                            name="laDest",
                            workspace_resource_id=workspace_id
                        )
                    ]
                },
                data_flows=[
                    DataFlow(
                        streams=["Microsoft-Perf"],
                        destinations=["laDest"]
                    )
                ]
            )

        dcr = monitor_client.data_collection_rules.create(
                rg_name,
                dcr_name,
                dcr_config
            )


        return jsonify({
            "message": f"DCR '{dcr_name}' utworzony i przypisany do VM",
            "dcrId": dcr.id
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

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