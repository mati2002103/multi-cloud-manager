from flask import jsonify, session,request
from google.cloud import run_v2
from .utils import SessionCredentials 
from .vm import list_gcp_projects 
from google.api_core import exceptions

GCP_REGIONS = ["europe-west1", "europe-central2"] 

def list_gcp_containers():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji."}), 401

    all_services = []
    try:
        credentials = SessionCredentials(gcp_account)

        projects = list_gcp_projects(credentials)
        if not projects:
            return jsonify({"value": [], "message": "Nie znaleziono projektów GCP dla tego konta."})

        for proj_dict in projects:
            project_id = proj_dict.get("projectId")
            if not project_id:
                continue

            for region in GCP_REGIONS:
                try:
                    client_options = {"api_endpoint": f"{region}-run.googleapis.com"}
                    client = run_v2.ServicesClient(credentials=credentials, client_options=client_options)
                    request = run_v2.ListServicesRequest(parent=f"projects/{project_id}/locations/{region}")

                    for service in client.list_services(request=request):
                        all_services.append({
                            "provider": "GCP",
                            "name": service.name.split('/')[-1],
                            "id": service.name,
                            "region": region,
                            "url": service.uri,
                            "created": service.create_time.isoformat() if service.create_time else None,
                            "updated": service.update_time.isoformat() if service.update_time else None,
                            "projectId": project_id 
                        })
                except Exception as region_error:
                    print(f"Ostrzeżenie: Nie udało się pobrać usług z projektu {project_id} w regionie {region}: {region_error}")
                    continue 

        return jsonify({"value": all_services})

    except Exception as e:
        return jsonify({"error": f"Wystąpił błąd podczas listowania usług Cloud Run: {str(e)}"}), 500
    
def delete_gcp_container():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    data = request.get_json()
    project_id = data.get("projectId")
    region = data.get("region")
    service_name = data.get("serviceName") 

    if not all([project_id, region, service_name]):
        return jsonify({"error": "Pola 'projectId', 'region' oraz 'serviceName' są wymagane."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        client_options = {"api_endpoint": f"{region}-run.googleapis.com"}
        client = run_v2.ServicesClient(credentials=credentials, client_options=client_options)
        
        service_path = f"projects/{project_id}/locations/{region}/services/{service_name}"
        
        delete_request = run_v2.DeleteServiceRequest(name=service_path)
        
        operation = client.delete_service(request=delete_request)
        
        operation.result() 

        return jsonify({"message": f"Rozpoczęto usuwanie usługi Cloud Run '{service_name}'."}), 200
        
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500
    
def create_gcp_container():
    
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji."}), 401

   
    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    project_id = data.get("projectId")
    region = data.get("region")
    service_name = data.get("serviceName")
    image_uri = data.get("imageUri","us-docker.pkg.dev/cloudrun/container/hello") 
    container_port_str = data.get("containerPort", "8080") 

    
    if not all([project_id, region, service_name, image_uri]):
        return jsonify({"error": "Pola 'projectId', 'region', 'serviceName' oraz 'imageUri' są wymagane."}), 400

    try:
        container_port = int(container_port_str)
    except ValueError:
        return jsonify({"error": "Pole 'containerPort' musi być liczbą."}), 400

    
    try:
        credentials = SessionCredentials(gcp_account)
        client_options = {"api_endpoint": f"{region}-run.googleapis.com"}
        client = run_v2.ServicesClient(credentials=credentials, client_options=client_options)

        parent = f"projects/{project_id}/locations/{region}"

        
        service_config = run_v2.Service(
            template=run_v2.RevisionTemplate(
                containers=[
                    run_v2.Container(
                        image=image_uri,
                        ports=[run_v2.ContainerPort(container_port=container_port)],
                    )
                ],
                scaling=run_v2.RevisionScaling(min_instance_count=0, max_instance_count=1),
            ),
            
            ingress=run_v2.IngressTraffic.INGRESS_TRAFFIC_ALL
        )

        create_request = run_v2.CreateServiceRequest(
            parent=parent,
            service=service_config,
            service_id=service_name, 
        )

        operation = client.create_service(request=create_request)
        print(f"Rozpoczęto tworzenie usługi Cloud Run '{service_name}'...")
        
      
        response = operation.result()

        return jsonify({
            "message": f"Usługa Cloud Run '{response.name.split('/')[-1]}' została pomyślnie utworzona.",
            "url": response.uri
            }), 201

    except exceptions.AlreadyExists:
         return jsonify({"error": f"Usługa Cloud Run o nazwie '{service_name}' już istnieje w regionie '{region}'."}), 409
    except exceptions.Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do tworzenia usługi Cloud Run w projekcie '{project_id}'. Szczegóły: {e}"}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500