from flask import jsonify, session,request
from googleapiclient.discovery import build
from .utils import SessionCredentials, list_gcp_projects 
from google.cloud import monitoring_v3
from google.cloud import logging_v2
import traceback
from datetime import datetime, timedelta
import pytz

def find_gcp_container_details(container_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401
    try:
        credentials = SessionCredentials(gcp_account)
        # Używamy API Cloud Run
        run_client = build('run', 'v1', credentials=credentials)
    except Exception as e:
        print(f"[ERROR] Błąd tworzenia poświadczeń GCP (Cloud Run): {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Błąd poświadczeń GCP: {str(e)}"}), 500

    try:
        projects_list = list_gcp_projects(credentials)
        if not projects_list:
            return jsonify({"error": "Nie znaleziono żadnych projektów GCP."}), 404
        
        project_id_list = [p["projectId"] for p in projects_list if "projectId" in p]

    except Exception as e:
        print(f"[ERROR] Nie można pobrać listy projektów: {e}")
        return jsonify({"error": f"Błąd podczas pobierania listy projektów: {e}"}), 500

    print(f"[INFO] Przeszukiwanie {len(project_id_list)} projektów dla Cloud Run: {container_name}")

    for project_id in project_id_list:
        try:
            # Użyj 'locations/-' aby przeszukać wszystkie regiony w danym projekcie
            parent_path = f"projects/{project_id}/locations/-"
            
            request = run_client.projects().locations().services().list(parent=parent_path)
            response = request.execute()
            
            services = response.get('items', [])
            for service in services:
                # Nazwa usługi jest w 'metadata'->'name'
                service_name_only = service.get('metadata', {}).get('name')
                
                if service_name_only == container_name:
                    # Znaleziono!
                    region = service.get('metadata', {}).get('labels', {}).get('cloud.googleapis.com/location', 'unknown-region')
                    full_resource_name = service.get('metadata', {}).get('selfLink', 'unknown-link')
                    
                    container_details = {
                        "projectId": project_id,
                        "region": region,
                        "serviceName": service_name_only,
                        # resourceName jest używane do budowania filtrów LQL/MQL
                        "resourceName": full_resource_name, 
                        "url": service.get('status', {}).get('url')
                    }
                    return jsonify(container_details), 200

        except Exception as e:
            # Zignoruj błędy "API not enabled" i idź dalej
            if "has not been used" in str(e) or "accessNotConfigured" in str(e):
                print(f"[INFO] Cloud Run API prawdopodobnie nie jest włączone lub dostępne w projekcie {project_id}.")
            else:
                print(f"[WARN] Błąd podczas przeszukiwania projektu {project_id} (Cloud Run): {e}")
            continue 

    return jsonify({"error": f"Nie znaleziono usługi Cloud Run o nazwie '{container_name}' w żadnym projekcie."}), 404

def get_gcp_container_available_metrics(project_id: str, region: str, container_name: str):
    available_metrics = [
    {
        "type": "run.googleapis.com/request_count", 
        "displayName": "Liczba żądań", 
        "unit": "count"
    },
    {
        "type": "run.googleapis.com/request_latencies", 
        "displayName": "Opóźnienia żądań", 
        "unit": "ms"
    },
    {
        "type": "run.googleapis.com/container/instance_count", 
        "displayName": "Liczba instancji", 
        "unit": "count"
    }
    ]
    
    
    return jsonify({"metrics": available_metrics}), 200



def get_gcp_container_metric_data(project_id: str, region: str, container_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Brak danych JSON w ciele żądania"}), 400
        
        metric_type = data.get("metricType")
        timespan_minutes = int(data.get("timespanMinutes", 60))

        if not metric_type:
            return jsonify({"error": "Brak 'metricType' w ciele żądania"}), 400

        credentials = SessionCredentials(gcp_account)
        client = monitoring_v3.MetricServiceClient(credentials=credentials)

        now = datetime.utcnow().replace(tzinfo=pytz.UTC)
        interval = monitoring_v3.TimeInterval(
            end_time=now,
            start_time=now - timedelta(minutes=timespan_minutes)
        )

        project_name = f"projects/{project_id}"
        
        filter_query = (
            f'metric.type = "{metric_type}" AND '
            f'resource.type = "cloud_run_revision" AND '
            f'resource.labels.service_name = "{container_name}" AND '
            f'resource.labels.location = "{region}"'
        )

        aggregation_alignment = monitoring_v3.Aggregation.Aligner.ALIGN_MEAN
        if "count" in metric_type.lower():
             aggregation_alignment = monitoring_v3.Aggregation.Aligner.ALIGN_SUM
        elif "latencies" in metric_type.lower():
             aggregation_alignment = monitoring_v3.Aggregation.Aligner.ALIGN_PERCENTILE_95

        req = {
            "name": project_name,
            "filter": filter_query,
            "interval": interval,
            "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
            "aggregation": {
                "alignment_period": {"seconds": 60 * 1}, 
                "per_series_aligner": aggregation_alignment
            }
        }
        
        query_result = client.list_time_series(request=req)

        data_points = []
        
        for series in query_result:
            for point in series.points:
                value = None
                if point.value.double_value != 0.0:
                    value = point.value.double_value
                elif point.value.int64_value != 0:
                    value = point.value.int64_value
                elif point.value.bool_value:
                    value = 1
                else:
                    value = 0.0
                
                if value is not None:
                    if "utilization" in metric_type.lower():
                        value = value * 100
                        
                    data_points.append({
                        "timestamp": point.interval.end_time.isoformat(),
                        "average": round(value, 4) 
                    })

        data_points.sort(key=lambda x: x['timestamp']) 
        
        return jsonify({"data": data_points}), 200

    except Exception as e:
        print(f"[ERROR] Nie można pobrać metryki {metric_type} dla {container_name}: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

def query_gcp_container_logs(project_id: str, container_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    data = request.get_json()
    if not data or not data.get("lqlQuery"):
        return jsonify({"error": "Brak 'lqlQuery' w ciele żądania"}), 400
        
    lql_query = data.get("lqlQuery")

    service_filter = f'resource.labels.service_name="{container_name}"'
    if service_filter not in lql_query:
        return jsonify({"error": f"Zapytanie LQL musi zawierać filtr: {service_filter}"}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        client = logging_v2.Client(credentials=credentials, project=project_id)
        
        entries_iterator = client.list_entries(
            filter_=lql_query,
            order_by=logging_v2.DESCENDING,
            page_size=100
        )
        
        columns_set = set(["timestamp", "severity", "payload"])
        rows_data = []
        
        for entry in entries_iterator:
            row = {
                "timestamp": entry.timestamp.isoformat(),
                "severity": entry.severity,
            }
            payload = entry.payload

            if isinstance(payload, dict):
                for key, value in payload.items():
                    columns_set.add(key)
                    row[key] = str(value)
            elif isinstance(payload, str):
                row["payload"] = payload
            else:
                row["payload"] = str(payload) if payload is not None else "N/A"
            
            rows_data.append(row)
            
        if not rows_data:
            return jsonify({"columns": [], "rows": []}), 200

        columns = sorted(list(columns_set))
        final_rows = []
        for row in rows_data:
            final_rows.append([row.get(col_name, "") for col_name in columns])

        return jsonify({"columns": columns, "rows": final_rows}), 200

    except Exception as e:
        print(f"[ERROR] Błąd podczas wykonywania zapytania LQL: {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Błąd podczas wykonywania zapytania LQL: {str(e)}"}), 500
    
def list_gcp_container_alerts(project_id: str, container_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    try:
        credentials = SessionCredentials(gcp_account)
        client = monitoring_v3.AlertPolicyServiceClient(credentials=credentials)
        project_name = f"projects/{project_id}"
        
        request = monitoring_v3.ListAlertPoliciesRequest(name=project_name)
        policies = client.list_alert_policies(request=request)
        
        container_alerts = []
        filter_str_1 = f'resource.labels.service_name = "{container_name}"'
        filter_str_2 = f'resource.type = "cloud_run_revision"'
        
        for policy in policies:
            found = False
            for condition in policy.conditions:
                filter_text = ""
                if condition.condition_threshold and condition.condition_threshold.filter:
                    filter_text = condition.condition_threshold.filter
                elif condition.condition_absent and condition.condition_absent.filter:
                    filter_text = condition.condition_absent.filter
                
                if filter_str_1 in filter_text and filter_str_2 in filter_text:
                    found = True
                    break
            
            if found:
                container_alerts.append({
                    "name": policy.name.split('/')[-1],
                    "displayName": policy.display_name,
                    "enabled": policy.enabled,
                    "description": policy.documentation.content if policy.documentation else "Brak opisu."
                })
                
        return jsonify({"value": container_alerts}), 200
        
    except Exception as e:
        print(f"[ERROR] Błąd podczas listowania alertów: {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Błąd podczas listowania alertów: {str(e)}"}), 500

def create_gcp_container_alert(project_id: str, region: str, container_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400
        
    display_name = data.get("alertName")
    metric_type = data.get("metricType")
    threshold = data.get("threshold")
    
    if not all([display_name, metric_type, threshold]):
        return jsonify({"error": "Wymagane pola: alertName, metricType, threshold"}), 400


    try:
        credentials = SessionCredentials(gcp_account)
        client = monitoring_v3.AlertPolicyServiceClient(credentials=credentials)
        project_name = f"projects/{project_id}"

        condition = monitoring_v3.AlertPolicy.Condition(
            display_name=f"{metric_type} > {threshold} przez 5 minut",
            condition_threshold=monitoring_v3.AlertPolicy.Condition.MetricThreshold(
                filter=(
                    f'metric.type = "{metric_type}" AND '
                    f'resource.type = "cloud_run_revision" AND '
                    f'resource.labels.service_name = "{container_name}" AND '
                    f'resource.labels.location = "{region}"'
                ),
                aggregations=[
                    monitoring_v3.Aggregation(
                        alignment_period={"seconds": 60},
                        per_series_aligner=monitoring_v3.Aggregation.Aligner.ALIGN_MEAN,
                    )
                ],
                comparison=monitoring_v3.ComparisonType.COMPARISON_GT,
                threshold_value=float(threshold),
                duration={"seconds": 300}, # 5 minut
                trigger=monitoring_v3.AlertPolicy.Condition.Trigger(count=1),
            ),
        )

        policy = monitoring_v3.AlertPolicy(
            display_name=display_name,
            combiner=monitoring_v3.AlertPolicy.ConditionCombinerType.AND,
            conditions=[condition],
        )
        
        request_data = monitoring_v3.CreateAlertPolicyRequest(
            name=project_name,
            alert_policy=policy
        )
        created_policy = client.create_alert_policy(request=request_data)

        return jsonify({
            "message": f"Utworzono alert '{created_policy.display_name}'. (Uwaga: nie skonfigurowano kanałów notyfikacji).",
            "name": created_policy.name.split('/')[-1],
            "displayName": created_policy.display_name
        }), 201

    except Exception as e:
        return jsonify({"error": f"Błąd podczas tworzenia alertu: {str(e)}"}), 500

def delete_gcp_container_alert(project_id: str, alert_name: str):
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    print(f"Logika [containermonitor]: Usuwanie alertu {alert_name} w {project_id}")
    try:
        credentials = SessionCredentials(gcp_account)
        client = monitoring_v3.AlertPolicyServiceClient(credentials=credentials)
        policy_full_name = f"projects/{project_id}/alertPolicies/{alert_name}"
        
        request_data = monitoring_v3.DeleteAlertPolicyRequest(name=policy_full_name)
        client.delete_alert_policy(request=request_data)
        
        return jsonify({"message": f"Alert '{alert_name}' został pomyślnie usunięty."}), 200
        
    except Exception as e:
        print(f"[ERROR] Błąd podczas usuwania alertu: {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Błąd podczas usuwania alertu: {str(e)}"}), 500