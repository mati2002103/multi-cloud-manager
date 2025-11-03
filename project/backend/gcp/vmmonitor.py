from flask import jsonify, request,session
from googleapiclient.discovery import build
from .utils import SessionCredentials, list_gcp_projects 
from google.cloud import monitoring_v3
from datetime import datetime, timedelta
import pytz
import traceback

def find_vm_by_name(vm_name: str):
    accounts = session.get("accounts", [])
    gcp_account = None
    for acc in accounts:
        if acc.get("provider") == "gcp" and acc.get("refresh_token"):
            gcp_account = acc
            break
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 404
    if not isinstance(gcp_account.get("access_token"), str) or not gcp_account.get("refresh_token"):
        return jsonify({"error": "Brak kompletnych lub poprawnych tokenów w sesji. Proszę zalogować się ponownie."}), 401
    
    try:
        credentials = SessionCredentials(gcp_account)
        compute = build('compute', 'v1', credentials=credentials)
    except Exception as e:
        print(f"[ERROR] Błąd tworzenia poświadczeń GCP: {e}")
        return jsonify({"error": f"Błąd poświadczeń GCP: {str(e)}"}), 500
    
    try:
        projects_list_of_dicts = list_gcp_projects(credentials)
        if not projects_list_of_dicts:
            return jsonify({"error": "Nie znaleziono żadnych projektów GCP lub błąd autoryzacji"}), 404
        
        project_id_list = [p["projectId"] for p in projects_list_of_dicts if "projectId" in p]
        
    except Exception as e:
        print(f"[ERROR] Nie można pobrać listy projektów: {e}")
        return jsonify({"error": f"Błąd podczas pobierania listy projektów: {e}"}), 500

    print(f"[INFO] Przeszukiwanie {len(project_id_list)} projektów dla VM: {vm_name}")

    for project_id in project_id_list:
        try:
            req = compute.instances().aggregatedList(project=project_id)
            
            while req is not None:
                response = req.execute()
                
                for zone_name, zone_data in response.get('items', {}).items():
                    if 'instances' in zone_data:
                        for instance in zone_data['instances']:
                            if instance['name'] == vm_name:
                                zone = zone_name.split('/')[-1] 
                                
                                vm_details = {
                                    "projectId": project_id,
                                    "zone": zone,
                                    "vmName": instance['name'],
                                    "instanceId": instance['id'],
                                    "status": instance.get('status'),
                                    "machineType": instance.get('machineType').split('/')[-1],
                                    "resourceId": f"projects/{project_id}/zones/{zone}/instances/{instance['name']}"
                                }
                                return jsonify(vm_details), 200 # ZMIANA: Zwróć JSON
                
                req = compute.instances().aggregatedList_next(previous_request=req, previous_response=response)
        
        except Exception as e:
            print(f"[WARN] Błąd podczas przeszukiwania projektu {project_id}: {e}")
            continue 

    return jsonify({"error": f"Nie znaleziono maszyny wirtualnej o nazwie '{vm_name}'"}), 404


def get_available_metrics(project_id: str, instance_id: str):
    agentless_metrics = [
        {"type": "compute.googleapis.com/instance/cpu/utilization", "displayName": "Użycie CPU", "unit": "%"},
        {"type": "compute.googleapis.com/instance/network/received_bytes_count", "displayName": "Sieć (Odebrane)", "unit": "bajty"},
        {"type": "compute.googleapis.com/instance/network/sent_bytes_count", "displayName": "Sieć (Wysłane)", "unit": "bajty"},
        {"type": "compute.googleapis.com/instance/disk/read_bytes_count", "displayName": "Dysk (Odczyt)", "unit": "bajty"},
        {"type": "compute.googleapis.com/instance/disk/write_bytes_count", "displayName": "Dysk (Zapis)", "unit": "bajty"}
    ]
    
    agent_metrics = [
        {"type": "agent.googleapis.com/memory/percent_used", "displayName": "Użycie pamięci (Agent)", "unit": "%"},
        {"type": "agent.googleapis.com/disk/percent_used", "displayName": "Użycie dysku (Agent)", "unit": "%"}
    ]
    
    return jsonify({"metrics": agentless_metrics + agent_metrics}), 200


def get_metric_timeseries(project_id: str, instance_id: str):
    accounts = session.get("accounts", [])
    gcp_account = None
    for acc in accounts:
        if acc.get("provider") == "gcp" and acc.get("refresh_token"):
            gcp_account = acc
            break
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 404
    if not isinstance(gcp_account.get("access_token"), str) or not gcp_account.get("refresh_token"):
        return jsonify({"error": "Brak kompletnych lub poprawnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

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
        filter_query = f'metric.type = "{metric_type}" AND resource.labels.instance_id = "{instance_id}"'

        req = {
            "name": project_name,
            "filter": filter_query,
            "interval": interval,
            "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
            "aggregation": {
                "alignment_period": {"seconds": 60 * 5}, 
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_MEAN
            }
        }
        
        query_result = client.list_time_series(request=req)

        data_points = []
        
        for series in query_result:
            for point in series.points:
                value = None
                
                if hasattr(point.value, 'double_value') and (point.value.double_value != 0 or metric_type == "compute.googleapis.com/instance/cpu/utilization"):
                    value = point.value.double_value
                elif hasattr(point.value, 'int64_value') and point.value.int64_value != 0:
                    value = point.value.int64_value
                elif hasattr(point.value, 'bool_value'):
                    value = 1 if point.value.bool_value else 0
                
                if value is not None:
                    data_points.append({
                        "timestamp": point.interval.end_time.isoformat(),
                        "average": round(value, 4) 
                    })

        data_points.sort(key=lambda x: x["timestamp"]) 
        
        return jsonify({"data": data_points}), 200

    except Exception as e:
        error_message = str(e)
        print(f"[ERROR] Nie można pobrać metryki {metric_type} dla {instance_id}: {error_message}\n{traceback.format_exc()}")
        
        if "which_oneof" in error_message:
             error_message = "Błąd atrybutu 'which_oneof'. Sprawdź wersję biblioteki google-cloud-monitoring."
             
        return jsonify({"error": error_message}), 500

def get_vm_agent_status(project_id: str, instance_id: str):
    print(f"Logika [vmmonitor]: Sprawdzanie statusu agenta dla {instance_id}")
    # TODO: Zaimplementować logikę sprawdzania agenta
    return jsonify({"hasOpsAgent": False, "message": "Logika do implementacji"}), 200

def install_ops_agent(project_id: str, instance_id: str):
    print(f"Logika [vmmonitor]: Instalacja agenta dla {instance_id}")
    # TODO: Zaimplementować logikę instalacji agenta
    return jsonify({"message": "Instalacja Ops Agent nie jest jeszcze zaimplementowana."}), 200

def query_lql_logs(project_id: str, instance_id: str):
    data = request.get_json()
    if not data or not data.get("lqlQuery"):
        return jsonify({"error": "Brak 'lqlQuery' w ciele żądania"}), 400
        
    lql_query = data.get("lqlQuery")
    print(f"Logika [vmmonitor]: Wykonywanie zapytania LQL w {project_id}: {lql_query[:50]}...")
    # TODO: Zaimplementować logikę Cloud Logging
    return jsonify({"value": [], "message": "Logika do implementacji"}), 200

def list_vm_alerts(project_id: str, instance_id: str):
    # Filtrowanie alertów dla konkretnej VM w GCP wymaga filtrowania po 'resource.labels.instance_id'
    instance_filter = f'resource.labels.instance_id = "{instance_id}"'
    print(f"Logika [vmmonitor]: Listowanie alertów w {project_id} z filtrem: {instance_filter}")
    # TODO: Zaimplementować logikę listowania alertów
    return jsonify({"value": [], "message": "Logika do implementacji"}), 200

def create_gcp_alert(project_id: str, instance_id: str):
    print(f"Logika [vmmonitor]: Tworzenie alertu dla {instance_id}")
    # TODO: Zaimplementować logikę tworzenia alertów
    return jsonify({"message": "Logika do implementacji"}), 201

def delete_gcp_alert(project_id: str, alert_name: str):
    print(f"Logika [vmmonitor]: Usuwanie alertu {alert_name}")
    # TODO: Zaimplementować logikę usuwania alertów
    return jsonify({"message": "Logika do implementacji"}), 200