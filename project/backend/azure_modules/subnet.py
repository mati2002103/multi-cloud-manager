from flask import jsonify, request, session
from .utils import FlaskCredential
from azure.mgmt.network import NetworkManagementClient


def subnet_create():
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