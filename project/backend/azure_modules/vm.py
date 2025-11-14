from flask import jsonify, request, session
from .utils import FlaskCredential

from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.core.exceptions import ResourceNotFoundError
from azure.mgmt.subscription import SubscriptionClient


def find_vm_by_name(vm_id, credential):
    sub_client = SubscriptionClient(credential)
    for sub in sub_client.subscriptions.list():
        compute_client = ComputeManagementClient(
            credential, sub.subscription_id)
        for vm in compute_client.virtual_machines.list_all():
            if vm.name == vm_id:
                return {
                    "subscriptionId": sub.subscription_id,
                    "resourceGroup": vm.id.split("/")[4],
                    "location": vm.location,
                    "resourceId": vm.id
                }
    return None


def _get_vm_client_and_rg(vm_id, credential):
    vm_info = find_vm_by_name(vm_id, credential)
    if not vm_info:
        return None, None, None
    sub_id = vm_info["subscriptionId"]
    rg = vm_info["resourceGroup"]
    compute_client = ComputeManagementClient(credential, sub_id)
    return compute_client, rg, vm_info


def list_virtual_machines():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            compute_client = ComputeManagementClient(
                credential, sub.subscription_id)
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


def create_vm():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    location = data.get("location")
    vm_name = data.get("vmName")

    if not all([subscription_id, rg_name, location, vm_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()

        resource_client = ResourceManagementClient(credential, subscription_id)
        try:
            resource_client.resource_groups.get(rg_name)
        except ResourceNotFoundError:
            resource_client.resource_groups.create_or_update(
                rg_name, {"location": location})

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
        return jsonify({"error": str(e)}), 500


def delete_vm():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    vm_name = data.get("vmName")

    if not all([subscription_id, rg_name, vm_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        compute_client = ComputeManagementClient(credential, subscription_id)
        network_client = NetworkManagementClient(credential, subscription_id)

        vm = compute_client.virtual_machines.get(rg_name, vm_name)
        os_disk_name = vm.storage_profile.os_disk.name
        nic_id = vm.network_profile.network_interfaces[0].id
        nic_name = nic_id.split("/")[-1]

        compute_client.virtual_machines.begin_delete(rg_name, vm_name).result()

        compute_client.disks.begin_delete(rg_name, os_disk_name).result()

        network_client.network_interfaces.begin_delete(
            rg_name, nic_name).result()

        nic = network_client.network_interfaces.get(rg_name, nic_name)
        ip_id = nic.ip_configurations[0].public_ip_address.id
        ip_name = ip_id.split("/")[-1]

        network_client.public_ip_addresses.begin_delete(
            rg_name, ip_name).result()

        return jsonify({
            "message": f"VM '{vm_name}' oraz powiązane zasoby zostały usunięte pomyślnie"
        }), 200

    except ResourceNotFoundError:
        return jsonify({"error": f"VM '{vm_name}' nie istnieje"}), 404
    except Exception as e:
        return jsonify({"error": str(e)})
