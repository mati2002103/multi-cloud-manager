from google.oauth2.credentials import Credentials
from google.cloud.exceptions import Conflict, Forbidden
from google.cloud import storage,resourcemanager_v3
from flask import session,jsonify,request
from .utils import SessionCredentials,list_gcp_projects
from google.auth.transport.requests import Request


def list_gcp_buckets():
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
        all_projects_with_buckets = []
        
        projects = list_gcp_projects(credentials) 

        for project in projects:
            current_project_buckets = []
            project_id = project.get("projectId")
            try:
                storage_client = storage.Client(project=project_id, credentials=credentials)
                
                for bucket in storage_client.list_buckets():
                    current_project_buckets.append({
                        "name": bucket.name,
                        "location": bucket.location,
                        "storageClass": bucket.storage_class,
                        "timeCreated": bucket.time_created.isoformat() if bucket.time_created else None,
                    })

                if current_project_buckets:
                    all_projects_with_buckets.append({
                        "projectId": project_id,
                        "displayName": project.get("name"),
                        "buckets": current_project_buckets
                    })

            except Exception as e:
                print(f"Pominięto projekt {project.get('projectId')} z powodu błędu: {e}")
                continue
        
        return jsonify({"value": all_projects_with_buckets})
        
    except Exception as e:
        return jsonify({"error": f"Wystąpił ogólny błąd: {str(e)}"}), 500
    
def delete_gcp_bucket():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400
        
    bucket_name = data.get("bucketName")
    force_delete = data.get("force", False)
    project_id = data.get("projectId")

    if not bucket_name:
        return jsonify({"error": "Nazwa bucketa ('bucketName') jest wymagana."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        credentials.refresh(Request())
        storage_client = storage.Client(project=project_id, credentials=credentials)
        bucket = storage_client.get_bucket(bucket_name)

        if force_delete:
            blobs = list(bucket.list_blobs())
            bucket.delete_blobs(blobs)
        bucket.delete()
        
        return jsonify({"message": f"Bucket '{bucket_name}' został pomyślnie usunięty."}), 200

    except Conflict:
        return jsonify({"error": f"Bucket '{bucket_name}' nie jest pusty. Opróżnij go lub użyj opcji usuwania z zawartością."}), 409
    except Forbidden:
        return jsonify({"error": f"Brak uprawnień do usunięcia bucketa '{bucket_name}'. Sprawdź, czy logowałeś się z pełnymi uprawnieniami (nie read-only)."}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500
    
def create_gcp_bucket():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400
        
    bucket_name = data.get("bucketName")
    project_id = data.get("projectId")
    storage_class = data.get("storageClass", "STANDARD")
    location = data.get("location") 

    if not all([bucket_name, project_id, location]):
        return jsonify({"error": "Pola 'bucketName', 'projectId' oraz 'location' są wymagane."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        credentials.refresh(Request())

        storage_client = storage.Client(project=project_id, credentials=credentials)

        bucket = storage_client.bucket(bucket_name)
        bucket.storage_class = storage_class
        
        bucket.iam_configuration.uniform_bucket_level_access_enabled = True

        new_bucket = storage_client.create_bucket(bucket, location=location)
        
        return jsonify({
            "message": f"Bucket '{new_bucket.name}' został pomyślnie utworzony w lokalizacji '{new_bucket.location}'."
        }), 201 

    except Conflict:
        return jsonify({"error": f"Nazwa bucketa '{bucket_name}' jest już zajęta. Nazwy bucketów muszą być unikalne globalnie."}), 409
    except Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do tworzenia bucketa w projekcie '{project_id}'. Sprawdź uprawnienia IAM. Szczegóły: {e}"}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500
