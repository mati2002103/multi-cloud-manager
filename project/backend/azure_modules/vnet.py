from flask import jsonify, request, session
from .utils import FlaskCredential
from azure.mgmt.network import NetworkManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.subscription import SubscriptionClient


def list_vnets():
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

def vnet_create():
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
