from google.cloud import compute_v1
from flask import jsonify, session,request
from .utils import SessionCredentials, list_gcp_projects
from google.cloud.exceptions import Conflict, Forbidden,NotFound

def list_gcp_vms():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)

    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    try:
        credentials = SessionCredentials(gcp_account)
        instances_client = compute_v1.InstancesClient(credentials=credentials)
        projects = list_gcp_projects(credentials)
        
        all_vms_across_projects = []

        for proj in projects:
            project_id = proj.get("projectId")
            if not project_id:
                continue

            request = compute_v1.AggregatedListInstancesRequest(project=project_id)    

            for zone, scoped_list in instances_client.aggregated_list(request=request):
                instances = scoped_list.instances
                if instances:
                    for instance in instances:
                        all_vms_across_projects.append({
                            "provider": "GCP",
                            "name": instance.name,
                            "id": instance.id,
                            "status": instance.status,
                            "location": zone.split('/')[-1],
                            "machineType": instance.machine_type.split('/')[-1],
                            "projectId": project_id
                        })

        return jsonify({"value": all_vms_across_projects})

    except Exception as e:
        return jsonify({"error": f"Wystąpił błąd podczas listowania maszyn wirtualnych: {str(e)}"}), 500
    
def delete_gcp_vm():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    
    data = request.get_json()
    project_id = data.get("projectId")
    zone = data.get("zone") 
    vm_name = data.get("vmName")

    if not all([project_id, zone, vm_name]):
        return jsonify({"error": "Pola 'projectId', 'zone' oraz 'vmName' są wymagane."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        instances_client = compute_v1.InstancesClient(credentials=credentials)
        
        vmToDelete = compute_v1.DeleteInstanceRequest(
            project=project_id,
            zone=zone,
            instance=vm_name,
        )

        operation = instances_client.delete(request=vmToDelete)
        
        operation.result()

        return jsonify({"message": f"Rozpoczęto usuwanie maszyny wirtualnej '{vm_name}'."}), 200

    except NotFound:
        return jsonify({"error": f"Maszyna wirtualna '{vm_name}' nie została znaleziona."}), 404
    except Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do usunięcia maszyny wirtualnej '{vm_name}'. Szczegóły: {e}"}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500
    
def create_gcp_vm():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji. Proszę zalogować się ponownie."}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400
        
    project_id = data.get("projectId")
    zone = data.get("zone") 
    vm_name = data.get("vmName")
    vm_type = data.get("machineType","e2-medium") 
    source_image = data.get("sourceImage", "projects/debian-cloud/global/images/family/debian-12")

    if not all([project_id, zone, vm_name]):
        return jsonify({"error": "Pola 'projectId', 'zone' oraz 'vmName' są wymagane."}), 400
    
    try:
        credentials = SessionCredentials(gcp_account)
        instances_client = compute_v1.InstancesClient(credentials=credentials)
        
        machine_type_path = f"zones/{zone}/machineTypes/{vm_type}"

        boot_disk = compute_v1.AttachedDisk(
            boot=True,
            auto_delete=True,
            initialize_params=compute_v1.AttachedDiskInitializeParams(
                source_image=source_image,
                disk_size_gb=10,
            ),
        )

        network_interface = compute_v1.NetworkInterface(
            name="global/networks/default",
            access_configs=[compute_v1.AccessConfig(name="External NAT")],
        )

        instance_config = compute_v1.Instance(
            name=vm_name,
            machine_type=machine_type_path,
            disks=[boot_disk],
            network_interfaces=[network_interface],
        )

        request_body = compute_v1.InsertInstanceRequest(
            project=project_id,
            zone=zone,
            instance_resource=instance_config,
        )

        operation = instances_client.insert(request=request_body)
        operation.result() 

        return jsonify({"message": f"Maszyna wirtualna '{vm_name}' została pomyślnie utworzona."}), 201

    except Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do tworzenia VM w projekcie '{project_id}'. Szczegóły: {e}"}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500