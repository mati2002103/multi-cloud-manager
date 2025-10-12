from flask import jsonify, request, session
from .utils import FlaskCredential

from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.containerinstance.models import (
    ContainerGroup,
    Container,
    ResourceRequests,
    ResourceRequirements,
    OperatingSystemTypes,
    IpAddress,
    Port,
    ContainerPort,
    ContainerGroupNetworkProtocol,
    ImageRegistryCredential
)

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
                        "image": cn.containers[0].image if cn.containers else "unknown",
                        "subscriptionId": subscription_id
                    })

        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def create_container():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    location = data.get("location", "westeurope")
    cn_name = data.get("cnName")
    image = data.get("image")
    cpu = data.get("cpu", 1.0)
    memory = data.get("memory", 1.5)
    port = data.get("port", 80)
    registry = data.get("registry")  

    if not all([subscription_id, rg_name, location, cn_name, image]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        client = ContainerInstanceManagementClient(credential, subscription_id)

        container_resource_requests = ResourceRequests(cpu=cpu, memory_in_gb=memory)
        container_resource_requirements = ResourceRequirements(requests=container_resource_requests)

        container = Container(
            name=cn_name,
            image=image,
            resources=container_resource_requirements,
            ports=[ContainerPort(port=port)]
        )

        ip_address = IpAddress(
            ports=[Port(protocol=ContainerGroupNetworkProtocol.TCP, port=port)],
            type="Public"
        )

        registry_credentials = []
        if registry:
            registry_credentials.append(ImageRegistryCredential(
                server=registry.get("server"),
                username=registry.get("username"),
                password=registry.get("password")
            ))

        group = ContainerGroup(
            location=location,
            containers=[container],
            os_type=OperatingSystemTypes.LINUX,
            restart_policy="Always",
            ip_address=ip_address,
            image_registry_credentials=registry_credentials
        )

        result = client.container_groups.begin_create_or_update(
            resource_group_name=rg_name,
            container_group_name=cn_name,
            container_group=group
        ).result()

        return jsonify({
            "message": f"Kontener '{cn_name}' utworzony pomyślnie",
            "containerId": result.id
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
def restart_container():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
   

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    resource_group = data.get("resourceGroup")
    container_name = data.get("containerName")

    if not all([subscription_id, resource_group, container_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        client = ContainerInstanceManagementClient(credential, subscription_id)

        client.container_groups.begin_restart(resource_group, container_name).wait()

        return jsonify({"message": f"Kontener '{container_name}' został zrestartowany"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def delete_container():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    resource_group = data.get("resourceGroup")
    container_name = data.get("containerName")

    if not all([subscription_id, resource_group, container_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        client = ContainerInstanceManagementClient(credential, subscription_id)

        client.container_groups.begin_delete(resource_group, container_name).wait()

        return jsonify({"message": f"Kontener '{container_name}' został usunięty"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500