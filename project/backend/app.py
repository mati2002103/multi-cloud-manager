from flask import Flask, session, redirect, jsonify, request
from flask_cors import CORS


from dotenv import load_dotenv
import os
import auth

from azure.identity import ClientSecretCredential
from azure.core.credentials import AccessToken,TokenCredential
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.core.exceptions import ResourceNotFoundError






load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super-secret-key")

CORS(app, supports_credentials=True, origins=["http://localhost:3000"])


CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

def get_subscription_client(tenant_id):
    cred = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )
    return SubscriptionClient(cred)

class FlaskCredential(TokenCredential):
    def get_token(self, *scopes, **kwargs):
        token = session.get("access_token")
        if not token:
            raise Exception("Brak tokenu w sesji")
        return AccessToken(token, expires_on=9999999999)

@app.route("/api/login")
def login():
    return redirect(auth.build_auth_url())

@app.route(auth.REDIRECT_PATH)
def authorized():
    result = auth.acquire_token()
    if not result:
        return jsonify({"error": "Nie udało się zalogować"}), 401

    session["access_token"] = result.get("access_token")
    user = auth.get_user()
    display_name = user.get("name") or user.get("preferred_username") or "Azure account"

    try:
        sub_client = get_subscription_client(TENANT_ID)
        subs = [s.subscription_id for s in sub_client.subscriptions.list()]
    except Exception:
        subs = []

    session["accounts"] = [{
        "provider": "azure",
        "tenantId": TENANT_ID,
        "displayName": display_name,
        "subscriptions": subs
    }]

    return redirect(FRONTEND_URL + "/dashboard")

@app.route("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Wylogowano"}), 200

@app.route("/api/accounts")
def api_accounts():
    accounts = session.get("accounts", []) 
    return jsonify(accounts), 200

@app.route("/api/user")
def api_user():
    user = auth.get_user()
    if not user: 
        return jsonify({"logged_in": False}), 200 
    return jsonify({"logged_in": True, "name": user.get("name")}), 200

@app.route("/api/subscriptions")
def api_subscriptions():
    accounts = session.get("accounts", [])
    items = []
    for acc in accounts:
        if acc.get("provider") != "azure":
            continue
        try:
            client = get_subscription_client(acc["tenantId"])
            for s in client.subscriptions.list():
                items.append({
                    "provider": "azure",
                    "tenantId": acc["tenantId"],
                    "subscriptionId": s.subscription_id,
                    "displayName": s.display_name
                })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"value": items})

@app.route("/api/resource_groups")
def api_resource_groups():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            rg_client = ResourceManagementClient(credential, sub.subscription_id)
            for rg in rg_client.resource_groups.list():
                items.append({
                    "subscriptionId": sub.subscription_id,
                    "resourceGroup": rg.name,
                    "location": rg.location
                })
        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/create_rg", methods=["POST"])
def api_create_resource_group():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    location = data.get("location")

    if not all([subscription_id, rg_name, location]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    credential = FlaskCredential()
    resource_client = ResourceManagementClient(credential, subscription_id)

    try:
        rg_result = resource_client.resource_groups.create_or_update(
            rg_name,
            {"location": location}
        )
        return jsonify({
            "message": f"Utworzono RG: {rg_result.name} w {rg_result.location}"
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/resource_group_contents", methods=["GET"])
def api_rg_contents():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    subscription_id = request.args.get("subscriptionId")
    rg_name = request.args.get("rgName")

    if not subscription_id or not rg_name:
        return jsonify({"error": "Brak wymaganych parametrów"}), 400

    try:
        credential = FlaskCredential()
        resource_client = ResourceManagementClient(credential, subscription_id)

        resources = resource_client.resources.list_by_resource_group(rg_name)
        items = []
        for res in resources:
            items.append({
                "name": res.name,
                "type": res.type,
                "location": res.location,
                "id": res.id
            })

        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/resource_group_delete", methods=["DELETE"])
def api_rg_delete():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")

    if not subscription_id or not rg_name:
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        resource_client = ResourceManagementClient(credential, subscription_id)

        poller = resource_client.resource_groups.begin_delete(rg_name)
        poller.result()

        return jsonify({"message": f"✅ Usunięto grupę zasobów: {rg_name}"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vnets")
def api_vnet():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)
    
    items = []
    try:
        for sub in sub_client.subscriptions.list():
            subscription_id = sub.subscription_id
            rg_client = ResourceManagementClient(credential, subscription_id)
            nt_client = NetworkManagementClient(credential, subscription_id)
            for rg in rg_client.resource_groups.list():
                  rg_name = rg.name
                  for vnet in nt_client.virtual_networks.list(rg_name):
                    vnet_name = vnet.name
                    vnet_info = {
                        "subscriptionId": subscription_id,
                        "resourceGroup": rg_name,
                        "network": vnet_name,
                        "subnets": []
                    }
                    for subnet in nt_client.subnets.list(rg_name, vnet_name):
                        vnet_info["subnets"].append(subnet.name)
                    items.append(vnet_info)
        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vnetsCreate", methods=["POST"])
def api_vnet_create():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    vnet = data.get("vnetName")
    rg = data.get("rgName")
    location = data.get("location")

   

    if not all([subscription_id, rg, location]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    credential = FlaskCredential()
    network_client = NetworkManagementClient(credential, subscription_id)

    try:
        # Provision the virtual network and wait for completion
        nt_result = network_client.virtual_networks.begin_create_or_update(
        rg,
        vnet,
        {
            "location": location,
            "address_space": {"address_prefixes": ["10.0.0.0/16"]},
        },
        )
        return jsonify({
            "message": f"Utworzono vnet: {vnet} w {location}"
        }), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/subnetCreate", methods=["POST"])
def api_subnet_create():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg = data.get("rgName")
    vnet = data.get("vnetName")
    subnet_name = data.get("subnetName")
    address_prefix = data.get("addressPrefix", "10.0.1.0/24")  # domyślny zakres

    if not all([subscription_id, rg, vnet, subnet_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        network_client = NetworkManagementClient(credential, subscription_id)

        poller = network_client.subnets.begin_create_or_update(
            rg,
            vnet,
            subnet_name,
            {"address_prefix": address_prefix}
        )
        result = poller.result()

        return jsonify({
            "message": f"✅ Utworzono subnet: {subnet_name} w VNet: {vnet}",
            "subnet": result.name
        }), 200

    except Exception as e:
         return jsonify({"error": str(e)}), 500
            

@app.route("/api/virtual_machines")
def api_virtual_machines():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            compute_client = ComputeManagementClient(credential, sub.subscription_id)
            for vm in compute_client.virtual_machines.list_all():
                items.append({
                    "subscriptionId": sub.subscription_id,
                    "name": vm.name,
                    "location": vm.location,
                    "resourceGroup": vm.id.split("/")[4]
                })
        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/create_vm", methods=["POST"])
def api_create_vm():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    location = data.get("location")
    vm_name = data.get("vmName")

    if not all([subscription_id, rg_name, location,vm_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400


    
    try:
        credential = FlaskCredential()

        resource_client = ResourceManagementClient(credential, subscription_id)
        try:
            resource_client.resource_groups.get(rg_name)
        except ResourceNotFoundError:
            resource_client.resource_groups.create_or_update(rg_name, {"location": location})

        # Create Network Resources
        network_client = NetworkManagementClient(credential, subscription_id)
        vnet_name = f"{vm_name}-vnet"
        subnet_name = f"{vm_name}-subnet"
        ip_name = f"{vm_name}-ip"
        nic_name = f"{vm_name}-nic"

        # Public IP
        ip_params = {
            "location": location,
            "sku": {"name": "Standard"},
            "public_ip_allocation_method": "Static"
        }
        ip_result = network_client.public_ip_addresses.begin_create_or_update(
            rg_name, ip_name, ip_params).result()

        # VNet
        vnet_params = {
            "location": location,
            "address_space": {"address_prefixes": ["10.0.0.0/16"]}
        }
        network_client.virtual_networks.begin_create_or_update(
            rg_name, vnet_name, vnet_params).result()

        # Subnet
        subnet_params = {"address_prefix": "10.0.0.0/24"}
        subnet_result = network_client.subnets.begin_create_or_update(
            rg_name, vnet_name, subnet_name, subnet_params).result()

        # NIC
        nic_params = {
            "location": location,
            "ip_configurations": [{
                "name": "ipconfig1",
                "subnet": {"id": subnet_result.id},
                "public_ip_address": {"id": ip_result.id}
            }]
        }
        nic_result = network_client.network_interfaces.begin_create_or_update(
            rg_name, nic_name, nic_params).result()

        #  Create VM
        compute_client = ComputeManagementClient(credential, subscription_id)
        vm_params = {
            "location": location,
            "storage_profile": {
                "image_reference": {
                    "publisher": "Canonical",
                    "offer": "UbuntuServer",
                    "sku": "18.04-LTS",
                    "version": "latest"
                }
            },
            "hardware_profile": {
                "vm_size": "Standard_B1s"
            },
            "os_profile": {
                "computer_name": vm_name,
                "admin_username": "azureuser",
                "admin_password": "Azure123456!"  # Tylko do testów!
            },
            "network_profile": {
                "network_interfaces": [{
                    "id": nic_result.id,
                    "primary": True
                }]
            }
        }

        vm_result = compute_client.virtual_machines.begin_create_or_update(
            rg_name, vm_name, vm_params).result()

        return jsonify({
            "message": f"VM '{vm_name}' utworzona pomyślnie",
            "vmId": vm_result.id
        }), 200

    except Exception as e:
        app.logger.error(f"Błąd tworzenia VM: {e}")
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
