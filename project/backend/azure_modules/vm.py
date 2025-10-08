from flask import jsonify, request, session
from .utils import FlaskCredential

from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.compute import ComputeManagementClient
from azure.mgmt.network import NetworkManagementClient
from azure.core.exceptions import ResourceNotFoundError
from azure.mgmt.subscription import SubscriptionClient
from azure.monitor.query import MetricsQueryClient, MetricAggregationType






def find_vm_by_name(vm_id, credential):
    sub_client = SubscriptionClient(credential)
    for sub in sub_client.subscriptions.list():
        compute_client = ComputeManagementClient(credential, sub.subscription_id)
        for vm in compute_client.virtual_machines.list_all():
            if vm.name == vm_id:
                return {
                    "subscriptionId": sub.subscription_id,
                    "resourceGroup": vm.id.split("/")[4],
                    "resourceId": vm.id
                }
    return None


def list_virtual_machines():
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

def create_vm():
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

        network_client.network_interfaces.begin_delete(rg_name, nic_name).result()

        nic = network_client.network_interfaces.get(rg_name, nic_name)
        ip_id = nic.ip_configurations[0].public_ip_address.id
        ip_name = ip_id.split("/")[-1]

        network_client.public_ip_addresses.begin_delete(rg_name, ip_name).result()

        return jsonify({
            "message": f"VM '{vm_name}' oraz powiązane zasoby zostały usunięte pomyślnie"
        }), 200

    except ResourceNotFoundError:
        return jsonify({"error": f"VM '{vm_name}' nie istnieje"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}) 
    
def vm_az_monitor_metrics(vm_id):
    from flask import jsonify, session
    import traceback
    from azure.identity import DefaultAzureCredential
    from datetime import datetime, timedelta
    #if "access_token" not in session:
        #return jsonify({"error": "Unauthorized"}), 401

    try:
        credential = DefaultAzureCredential()
    except Exception as e:
        print("❌ Błąd tworzenia poświadczeń:", traceback.format_exc())
        return jsonify({"error": f"Błąd poświadczeń: {str(e)}"}), 500

    try:
        vm_info = find_vm_by_name(vm_id, credential)
        if not vm_info:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404
    except Exception as e:
        print("❌ Błąd wyszukiwania VM:", traceback.format_exc())
        return jsonify({"error": f"Błąd wyszukiwania VM: {str(e)}"}), 500

    try:
        resource_id = vm_info.get("resourceId")
        if not resource_id:
            subscription_id = vm_info.get("subscriptionId")
            rg_name = vm_info.get("resourceGroup")
            if not all([subscription_id, rg_name]):
                return jsonify({"error": "Brakuje subscriptionId lub resourceGroup"}), 400
            resource_id = f"/subscriptions/{subscription_id}/resourceGroups/{rg_name}/providers/Microsoft.Compute/virtualMachines/{vm_id}"
    except Exception as e:
        print("❌ Błąd budowania resourceId:", traceback.format_exc())
        return jsonify({"error": f"Błąd budowania resourceId: {str(e)}"}), 500

    print("Resource ID:", resource_id)
    print("Zapytanie metryk dla:", vm_id)

    
    try:
        client = MetricsQueryClient(credential)
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=1)
        metric_names = [
            "Percentage CPU",
            "Available Memory Percentage",
            "Available Memory Bytes",
            "CPU Credits Consumed",
        ]
        response = client.query_resource(
            resource_uri=resource_id,
            metric_names=metric_names,
            timespan=(start_time, end_time),
            interval="PT5M",
            aggregations=[MetricAggregationType.AVERAGE]
        )
    except Exception as e:
        print("❌ Błąd zapytania metryk:", traceback.format_exc())
        return jsonify({"error": f"Błąd zapytania metryk: {str(e)}"}), 500

    try:
        metrics_data = []
        for metric in response.metrics:
            datapoints = []
            for series in metric.timeseries:
                for val in series.data:
                    if val.average is not None:
                        datapoints.append({
                            "timestamp": val.timestamp.isoformat(),
                            "average": round(val.average, 2)
                        })
            metrics_data.append({
                "name": getattr(metric, "name", None) or getattr(metric, "name_", "unknown"),
                "unit": getattr(metric, "unit", "unknown"),
                "data": datapoints
            })
    except Exception as e:
        print("❌ Błąd parsowania metryk:", traceback.format_exc())
        return jsonify({"error": f"Błąd parsowania metryk: {str(e)}"}), 500

    try:
        return jsonify({
            "vm": vm_id,
            "subscriptionId": vm_info.get("subscriptionId", "N/A"),
            "resourceGroup": vm_info.get("resourceGroup", "N/A"),
            "resourceId": resource_id,
            "metrics": metrics_data
        }), 200
    except Exception as e:
        print("❌ Błąd serializacji odpowiedzi:", traceback.format_exc())
        return jsonify({"error": f"Błąd serializacji odpowiedzi: {str(e)}"}), 500
    
