from flask import jsonify, session,request
from google.cloud import compute_v1
from google.api_core import exceptions
from .utils import SessionCredentials ,list_gcp_projects 

def list_gcp_vpcs():
    accounts = session.get("accounts", [])
    gcp_account = next((acc for acc in accounts if acc.get("provider") == "gcp"), None)
    if not gcp_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta GCP w sesji"}), 401
    if not gcp_account.get("refresh_token"):
         return jsonify({"error": "Brak kompletnych tokenów w sesji."}), 401

    all_vpcs_with_subnets = []
    try:
        credentials = SessionCredentials(gcp_account)
        projects = list_gcp_projects(credentials)
        if not projects:
            return jsonify({"value": [], "message": "Nie znaleziono projektów GCP."})

        networks_client = compute_v1.NetworksClient(credentials=credentials)
        subnetworks_client = compute_v1.SubnetworksClient(credentials=credentials)

        for proj_dict in projects:
            project_id = proj_dict.get("projectId")
            if not project_id:
                continue

            try:
                network_request = compute_v1.ListNetworksRequest(project=project_id)
                networks_in_project = list(networks_client.list(request=network_request))

                all_subnets_in_project = {} 
                try:
                    subnet_request = compute_v1.AggregatedListSubnetworksRequest(project=project_id)
                    subnet_iterator = subnetworks_client.aggregated_list(request=subnet_request)
                    for region, response in subnet_iterator:
                        if response.subnetworks:
                            all_subnets_in_project[region] = list(response.subnetworks)
                except Exception as subnet_list_error:
                    print(f"Ostrzeżenie: Nie udało się pobrać subnetów dla projektu {project_id}: {subnet_list_error}")

                
                for network in networks_in_project:
                    vpc_data = {
                        "provider": "GCP",
                        "name": network.name,
                        "id": network.id,
                        "description": network.description,
                        "subnetMode": network.auto_create_subnetworks,
                        "routingMode": str(network.routing_config.routing_mode) if network.routing_config and network.routing_config.routing_mode else "UNKNOWN",                        
                        "projectId": project_id,
                        "subnets": [] 
                    }

                    network_url_suffix = f"/{network.name}" 
                    for region, subnets_in_region in all_subnets_in_project.items():
                        for subnet in subnets_in_region:
                            if subnet.network.endswith(network_url_suffix):
                                vpc_data["subnets"].append({
                                    "name": subnet.name,
                                    "region": region.split('/')[-1],
                                    "ipCidrRange": subnet.ip_cidr_range,
                                })
                    
                    all_vpcs_with_subnets.append(vpc_data)

            except exceptions.Forbidden as e:
                 print(f"Ostrzeżenie: Brak uprawnień do listowania sieci w projekcie {project_id}. {e}")
                 continue 
            except Exception as project_error:
                print(f"Ostrzeżenie: Błąd podczas przetwarzania projektu {project_id}: {project_error}")
                continue

        return jsonify({"value": all_vpcs_with_subnets})
    except Exception as e:
        return jsonify({"error": f"Wystąpił ogólny błąd podczas listowania sieci VPC: {str(e)}"}), 500
    

def create_gcp_vpc():
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
    vpc_name = data.get("vpcName")
    description = data.get("description", "")
    routing_mode = data.get("routingMode", "REGIONAL")

    if not all([project_id, vpc_name]):
        return jsonify({"error": "Pola 'projectId' oraz 'vpcName' są wymagane."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        networks_client = compute_v1.NetworksClient(credentials=credentials)

        network_resource = compute_v1.Network(
            name=vpc_name,
            description=description, 
            auto_create_subnetworks=False,
            routing_config=compute_v1.NetworkRoutingConfig(
                 routing_mode=routing_mode.upper() 
            ),
        )

        vpc_create_request = compute_v1.InsertNetworkRequest(
            project=project_id,
            network_resource=network_resource,
        )

        operation = networks_client.insert(request=vpc_create_request)
        print(f"Rozpoczęto tworzenie sieci VPC '{vpc_name}' w projekcie '{project_id}'...")
        
        operation.result() 

        return jsonify({"message": f"Sieć VPC '{vpc_name}' została pomyślnie utworzona."}), 201

    except exceptions.Conflict:
        return jsonify({"error": f"Sieć VPC o nazwie '{vpc_name}' już istnieje w projekcie '{project_id}'."}), 409
    except exceptions.Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do tworzenia sieci VPC w projekcie '{project_id}'. Szczegóły: {e}"}), 403
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500
    

def create_gcp_subnet():
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
    vpc_name = data.get("vpcName") 
    subnet_name = data.get("subnetName")
    ip_cidr_range = data.get("ipCidrRange") 

    if not all([project_id, region, vpc_name, subnet_name, ip_cidr_range]):
        return jsonify({"error": "Pola 'projectId', 'region', 'vpcName', 'subnetName' oraz 'ipCidrRange' są wymagane."}), 400

    try:
        credentials = SessionCredentials(gcp_account)
        subnetworks_client = compute_v1.SubnetworksClient(credentials=credentials)

        network_url = f"projects/{project_id}/global/networks/{vpc_name}"

        subnet_resource = compute_v1.Subnetwork(
            name=subnet_name,
            ip_cidr_range=ip_cidr_range,
            network=network_url,
        )

        sub_create_request = compute_v1.InsertSubnetworkRequest(
            project=project_id,
            region=region,
            subnetwork_resource=subnet_resource,
        )

        operation = subnetworks_client.insert(request=sub_create_request)
        print(f"Rozpoczęto tworzenie subnetu '{subnet_name}' w regionie '{region}'...")

        operation.result() 

        return jsonify({"message": f"Subnet '{subnet_name}' został pomyślnie utworzony w sieci '{vpc_name}'."}), 201

    except exceptions.Conflict:
        return jsonify({"error": f"Subnet o nazwie '{subnet_name}' już istnieje w regionie '{region}'."}), 409
    except exceptions.Forbidden as e:
        return jsonify({"error": f"Brak uprawnień do tworzenia subnetu w projekcie '{project_id}' lub sieci '{vpc_name}'. Szczegóły: {e}"}), 403
    except exceptions.NotFound:
         return jsonify({"error": f"Sieć VPC '{vpc_name}' nie została znaleziona w projekcie '{project_id}'."}), 404
    except Exception as e:
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd serwera: {str(e)}"}), 500