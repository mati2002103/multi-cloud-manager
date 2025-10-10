from flask import jsonify, request, session
from .utils import FlaskCredential

from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.subscription import SubscriptionClient


def list_containers():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            subscription_id = sub.subscription_id
            container_client = ContainerInstanceManagementClient(credential, subscription_id)
            resource_client = ResourceManagementClient(credential, subscription_id)

            for rg in resource_client.resource_groups.list():
                for cn in container_client.container_groups.list_by_resource_group(rg.name):
                    details = container_client.container_groups.get(rg.name, cn.name)
                    items.append({
                        "name": cn.name,
                        "resourceGroup": rg.name,
                        "location": cn.location,
                        "status": details.instance_view.state,
                        "image": cn.containers[0].image if cn.containers else "unknown"
                    })

        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
