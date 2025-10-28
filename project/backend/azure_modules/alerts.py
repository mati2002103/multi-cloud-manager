from flask import jsonify, request, session
from .utils import FlaskCredential
from azure.mgmt.monitor import MonitorManagementClient
from azure.core.exceptions import HttpResponseError

from azure.mgmt.monitor.models import (
    MetricAlertResource,
    MetricAlertSingleResourceMultipleMetricCriteria,
    MetricCriteria,
    ActionGroupResource,
    EmailReceiver
)
import os
import traceback

CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")

def create_metric_alert():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    subscription_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup")
    location = data.get("location") 
    vm_resource_id = data.get("vmResourceId")
    alert_name = data.get("alertName")
    metric_name = data.get("metricName")
    threshold = data.get("threshold")
    notify_email = data.get("notifyEmail")

    if not all([subscription_id, rg_name, location, vm_resource_id, alert_name, metric_name, threshold, notify_email]):
        return jsonify({"error": "Wymagane są wszystkie pola: subscriptionId, rg_name, location, vmResourceId, alertName, metricName, threshold, notifyEmail."}), 400

    try:
        credential = FlaskCredential()
        monitor_client = MonitorManagementClient(credential, subscription_id)

        action_group_name = f"ag-{alert_name}"
        print(f"Tworzenie grupy akcji: {action_group_name}...")
        
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
        print(f"Utworzono grupę akcji (ID: {action_group.id}).")

        print(f"Tworzenie reguły alertu: {alert_name}...")
        
        alert_resource = MetricAlertResource(
            location=location,
            description=f"Alert dla {metric_name} > {threshold} na maszynie {vm_resource_id.split('/')[-1]}",
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
                { "action_group_id": action_group.id }
            ]
        )

        alert_rule = monitor_client.metric_alerts.create_or_update(
            resource_group_name=rg_name,
            rule_name=alert_name,
            parameters=alert_resource
        )
        print(f"Utworzono regułę alertu (ID: {alert_rule.id}).")
        
        return jsonify({
            "message": f"Pomyślnie utworzono alert '{alert_name}' i grupę akcji '{action_group_name}'.",
            "alertRuleId": alert_rule.id,
            "actionGroupId": action_group.id
        }), 201

    except HttpResponseError as e:
       print(f"--- BŁĄD HTTP (API) --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"Azure API error: {str(e)}"}), e.status_code or 500
    except Exception as e:
       print(f"--- KRYTYCZNY BŁĄD --- \n{traceback.format_exc()}\n")
       return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500