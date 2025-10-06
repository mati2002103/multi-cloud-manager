from flask import jsonify, request, session
from azure.mgmt.resource import ResourceManagementClient
from azure.identity import ClientSecretCredential
from azure.mgmt.subscription import SubscriptionClient

from .utils import FlaskCredential


def list_resource_groups():
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

def create_resource_group():
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

def rg_contents():
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

def rg_delete():
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
