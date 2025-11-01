from flask import jsonify, request, session
from .utils import FlaskCredential
from azure.mgmt.monitor import MonitorManagementClient
from azure.core.exceptions import HttpResponseError
import os
import traceback
from .vm import find_vm_by_name # Potrzebujemy tego do znalezienia VM

# ZMIANA: Poprawione importy modeli
from azure.mgmt.monitor.models import (
    MetricAlertResource,
    MetricAlertSingleResourceMultipleMetricCriteria,
    MetricCriteria, 
    ActionGroupResource,
    EmailReceiver,
    MetricAlertAction
    
)

CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")

def list_alerts_for_vm(vm_id):
    try:
        credential = FlaskCredential()
        vm_info = find_vm_by_name(vm_id, credential)
        if not vm_info:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404

        subscription_id = vm_info.get("subscriptionId")
        rg_name = vm_info.get("resourceGroup")
        vm_resource_id = vm_info.get("resourceId")

        if not all([subscription_id, rg_name, vm_resource_id]):
            return jsonify({"error": "Nie udało się pobrać pełnych informacji o VM."}), 500

        monitor_client = MonitorManagementClient(credential, subscription_id)
        all_alerts = monitor_client.metric_alerts.list_by_resource_group(rg_name)

        vm_alerts = [
            {
                "name": alert.name,
                "description": alert.description,
                "severity": alert.severity,
                "enabled": alert.enabled,
                "scopes": alert.scopes,
                "evaluationFrequency": str(alert.evaluation_frequency),
                "windowSize": str(alert.window_size)
            }
            for alert in all_alerts
            if vm_resource_id in alert.scopes
        ]

        return jsonify({"value": vm_alerts}), 200

    except HttpResponseError as e:
        return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

def create_metric_alert(vm_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    try:
        credential = FlaskCredential()
        vm_info = find_vm_by_name(vm_id, credential)
        if not vm_info:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404

        subscription_id = vm_info.get("subscriptionId")
        rg_name = vm_info.get("resourceGroup")
        #location = vm_info.get("location")
        vm_resource_id = vm_info.get("resourceId")

        if not all([subscription_id, rg_name, vm_resource_id]):
            return jsonify({"error": "Nie udało się pobrać pełnych informacji o VM (Sub, RG, Location, ID)."}), 500

        alert_name = data.get("alertName")
        metric_name = data.get("metricName")
        threshold = data.get("threshold")
        notify_email = data.get("notifyEmail")

        if not all([alert_name, metric_name, threshold, notify_email]):
            return jsonify({"error": "Wymagane pola w JSON: alertName, metricName, threshold, notifyEmail."}), 400

        monitor_client = MonitorManagementClient(credential, subscription_id)

        action_group_name = f"ag-{alert_name}"
        action_group_resource = ActionGroupResource(
            location="global",
            group_short_name=action_group_name[:12],
            enabled=True,
            email_receivers=[
                EmailReceiver(
                    name=f"email-to-{notify_email.split('@')[0]}",
                    email_address=notify_email,
                    use_common_alert_schema=True
                )
            ]
        )

        action_group = monitor_client.action_groups.create_or_update(
            resource_group_name=rg_name,
            action_group_name=action_group_name,
            action_group=action_group_resource
        )

        alert_resource = MetricAlertResource(
            location="global",
            description=f"Alert dla {metric_name} > {threshold} na maszynie {vm_id}",
            severity=3,
            enabled=True,
            scopes=[vm_resource_id],
            evaluation_frequency="PT1M",
            window_size="PT5M",
            criteria=MetricAlertSingleResourceMultipleMetricCriteria(
                all_of=[
                    MetricCriteria(
                        name="HighMetricCriterion",
                        metric_name=metric_name,
                        operator="GreaterThan",
                        time_aggregation="Average",
                        threshold=float(threshold)
                    )
                ]
            ),
            actions=[
                {"action_group_id": action_group.id}
            ]
        )

        alert_rule = monitor_client.metric_alerts.create_or_update(
            resource_group_name=rg_name,
            rule_name=alert_name,
            parameters=alert_resource
        )

        return jsonify({
            "message": f"Pomyślnie utworzono alert '{alert_name}' i grupę akcji '{action_group_name}'.",
            "alertRuleId": alert_rule.id,
            "actionGroupId": action_group.id
        }), 201

    except HttpResponseError as e:
        return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

def delete_alert_for_vm(vm_id, alert_name):
    try:
        credential = FlaskCredential()
        vm_info = find_vm_by_name(vm_id, credential)
        if not vm_info:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404

        subscription_id = vm_info.get("subscriptionId")
        rg_name = vm_info.get("resourceGroup")

        if not all([subscription_id, rg_name]):
            return jsonify({"error": "Nie udało się pobrać informacji o VM (Sub, RG)."}), 500

        monitor_client = MonitorManagementClient(credential, subscription_id)

        monitor_client.metric_alerts.delete(
            resource_group_name=rg_name,
            rule_name=alert_name
        )

        return jsonify({"message": f"Alert '{alert_name}' został usunięty."}), 200

    except HttpResponseError as e:
        return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
    

def list_container_alerts(container_group_name):
    credential = FlaskCredential()
    sub_id = request.args.get("sub_id")
    rg_name = request.args.get("rg_name")
    monitor_client = MonitorManagementClient(credential, sub_id)
    
    resource_id = f"/subscriptions/{sub_id}/resourceGroups/{rg_name}/providers/Microsoft.ContainerInstance/containerGroups/{container_group_name}"
    alerts = monitor_client.metric_alerts.list_by_resource_group(rg_name)

    linked_alerts = []
    for alert in alerts:
        if alert.scopes and resource_id in alert.scopes:
            linked_alerts.append({
                "name": alert.name,
                "description": alert.description,
                "enabled": alert.enabled,
                "severity": alert.severity,
                "criteria": str(alert.criteria),
                "scopes": alert.scopes
            })

    return jsonify({"alerts": linked_alerts}), 200

def create_container_alert(container_group_name):
    data = request.get_json()
    sub_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup")
    action_group_id = data.get("actionGroupId")  
    threshold = data.get("threshold", 80)
    metric_name = data.get("metricName", "CpuUsage")
    operator = data.get("operator", "GreaterThan")
    time_window = data.get("timeWindow", "PT5M")
    evaluation_frequency = data.get("evaluationFrequency", "PT1M")

    if not sub_id or not rg_name or not action_group_id:
        return jsonify({"error": "Brakuje wymaganych parametrów: subscriptionId, resourceGroup, actionGroupId"}), 400

    resource_id = f"/subscriptions/{sub_id}/resourceGroups/{rg_name}/providers/Microsoft.ContainerInstance/containerGroups/{container_group_name}"

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, sub_id)

        alert_name = f"{container_group_name}-cpu-alert"
        criteria = MetricAlertSingleResourceMultipleMetricCriteria(
            all_of=[
                MetricCriteria(
                    name="HighCPU",
                    metric_name=metric_name,
                    operator=operator,
                    time_aggregation="Average",
                    threshold=threshold
                )
            ]
        )

        alert = MetricAlertResource(
            location="global",
            description=f"Alert for {metric_name} > {threshold}%",
            severity=2,
            enabled=True,
            scopes=[resource_id],
            evaluation_frequency=evaluation_frequency,
            window_size=time_window,
            criteria=criteria,
            actions=[
                MetricAlertAction(
                    action_group_id=action_group_id
                )
            ]
        )

        result = monitor_client.metric_alerts.create_or_update(
            resource_group_name=rg_name,
            rule_name=alert_name,
            parameters=alert
        )

        return jsonify({"message": "Alert utworzony pomyślnie.", "alertName": result.name}), 201

    except Exception as e:
        return jsonify({"error": f"Błąd podczas tworzenia alertu: {str(e)}"}), 500
    


def delete_container_alert(container_group_name):
    data = request.get_json()
    sub_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup")
    alert_name = data.get("alertName")

    if not sub_id or not rg_name or not alert_name:
        return jsonify({"error": "Brakuje wymaganych parametrów: subscriptionId, resourceGroup, alertName"}), 400

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, sub_id)

        monitor_client.metric_alerts.delete(
            resource_group_name=rg_name,
            rule_name=alert_name
        )

        return jsonify({"message": f"Alert '{alert_name}' został usunięty."}), 200

    except Exception as e:
        return jsonify({"error": f"Błąd podczas usuwania alertu: {str(e)}"}), 500