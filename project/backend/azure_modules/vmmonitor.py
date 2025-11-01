from flask import jsonify, request, session
from .utils import FlaskCredential

from .vm import find_vm_by_name,_get_vm_client_and_rg

from azure.core.exceptions import  HttpResponseError
from azure.monitor.query import MetricsQueryClient, MetricAggregationType






def vm_az_monitor_metrics(vm_id):
    from flask import jsonify, session
    import traceback
    from datetime import datetime, timedelta

    if "access_token" not in session:
         return jsonify({"error": "Unauthorized"}), 401

    try:
        credential = FlaskCredential()
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
            "location": vm_info.get("location","N/A"),
            "resourceId": resource_id,
            "metrics": metrics_data
        }), 200
    except Exception as e:
        print("❌ Błąd serializacji odpowiedzi:", traceback.format_exc())
        return jsonify({"error": f"Błąd serializacji odpowiedzi: {str(e)}"}), 500


def agent_status(vm_id):
    if "access_token" not in session:
       return jsonify({"error": "Unauthorized"}), 401

    try:
        credential = FlaskCredential()
        compute_client, rg, vm_info = _get_vm_client_and_rg(vm_id, credential)
        if not compute_client:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404

        vm = compute_client.virtual_machines.get(rg, vm_id)

       
        ext_list_result = compute_client.virtual_machine_extensions.list(rg, vm_id)
        exts = ext_list_result.value  

        ext_names = [e.name for e in exts]

        has_ama_linux = any(
            "AzureMonitorLinuxAgent" in (e.name + e.type) for e in exts
        )
        has_ama_windows = any(
            "AzureMonitorWindowsAgent" in (e.name + e.type) for e in exts
        )
        has_mma = any(
            "MicrosoftMonitoringAgent" in (e.name + e.type) for e in exts
        )

        return jsonify({
            "vm": vm_id,
            "subscriptionId": vm_info["subscriptionId"],
            "resourceGroup": rg,
            "extensions": ext_names,
            "hasMMA": has_mma,
            "hasAMA_Linux": has_ama_linux,
            "hasAMA_Windows": has_ama_windows
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def ensure_ama(vm_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        credential = FlaskCredential()
        compute_client, rg, vm_info = _get_vm_client_and_rg(vm_id, credential)
        if not compute_client:
            return jsonify({"error": f"VM '{vm_id}' not found"}), 404

        vm = compute_client.virtual_machines.get(rg, vm_id)
        os_type = getattr(vm.storage_profile.os_disk, "os_type", None) or vm.os_profile and getattr(
            vm.os_profile, "windows_configuration", None) and "Windows" or "Linux"

        if hasattr(vm, "os_profile") and getattr(vm.os_profile, "windows_configuration", None):
            os_type = "Windows"
        else:
            os_type = "Linux"

        exts = [
            e.name for e in compute_client.virtual_machine_extensions.list(rg, vm_id)]
        if "AzureMonitorWindowsAgent" in exts or "AzureMonitorLinuxAgent" in exts:
            return jsonify({"message": "AMA already installed", "extensions": exts}), 200

        if os_type == "Windows":
            ext_name = "AzureMonitorWindowsAgent"
            publisher = "Microsoft.Azure.Monitor"
            ext_props = {
                "location": vm.location,
                "publisher": publisher,
                "virtual_machine_extension_type": ext_name,
                "type_handler_version": "1.0",
                "auto_upgrade_minor_version": True,
                "settings": {}
            }
        else:
            ext_name = "AzureMonitorLinuxAgent"
            publisher = "Microsoft.Azure.Monitor"
            ext_props = {
                "location": vm.location,
                "publisher": publisher,
                "virtual_machine_extension_type": ext_name,
                "type_handler_version": "1.0",
                "auto_upgrade_minor_version": True,
                "settings": {}
            }

        poller = compute_client.virtual_machine_extensions.begin_create_or_update(
            rg, vm_id, ext_name, ext_props
        )
        result = poller.result()
        return jsonify({
            "message": "AMA installed",
            "extension": result.name
        }), 200

    except HttpResponseError as hre:
        return jsonify({"error": f"Azure error: {str(hre)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
