from flask import jsonify, request, session
from .utils import FlaskCredential

from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.storage import StorageManagementClient
from azure.mgmt.resource import ResourceManagementClient

from enum import Enum

class StorageType(Enum):
    BLOB = "Blob Storage"
    FILES = "Azure Files"
    OTHER = "Other (Tables, Queues)"
    MULTI = "Blob + Files + Queues + Tables"
    UNKNOWN = "Unknown"

def classify_storage_type(kind: str) -> StorageType:
    if kind in ["BlobStorage", "BlockBlobStorage"]:
        return StorageType.BLOB
    elif kind == "FileStorage":
        return StorageType.FILES
    elif kind == "Storage":
        return StorageType.OTHER
    elif kind == "StorageV2":
        return StorageType.MULTI
    else:
        return StorageType.UNKNOWN



def list_storage_accounts():
    
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            subscription_id = sub.subscription_id
            storage_acc_client = StorageManagementClient(credential, subscription_id,api_version="2025-06-01")
            resource_client = ResourceManagementClient(credential, subscription_id)
            for rg in resource_client.resource_groups.list():
                    accounts = storage_acc_client.storage_accounts.list_by_resource_group(rg.name)
                    for acc in accounts:
                        keys = storage_acc_client.storage_accounts.list_keys(rg.name, acc.name)
                        props = storage_acc_client.storage_accounts.get_properties(rg.name, acc.name)
                        items.append({
                            "name": acc.name,
                            "resourceGroup": rg.name,
                            "location": acc.location,
                            "Keys": keys.keys[0].value,
                            "sku": props.sku.name,
                            "accessTier": props.access_tier,
                            "storageType": classify_storage_type(props.kind).value,
                            "httpsOnly": props.enable_https_traffic_only,
                            "subscriptionId": subscription_id
                        })

        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
def create_storage_account():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("rgName")
    account_name = data.get("accountName")
    location = data.get("location", "westeurope")
    sku = {"name": data.get("sku", "Standard_LRS")}
    kind = data.get("kind", "StorageV2")    
    access_tier = data.get("accessTier", "Hot")
    enable_https_traffic_only = data.get("enable_https_traffic_only", True)
    if not all([subscription_id, rg_name, location,account_name,sku,kind ,access_tier,enable_https_traffic_only]):
        return jsonify({"error": "Brak wymaganych danych"}), 400
    try:
        credential = FlaskCredential()
        storage_client = StorageManagementClient(credential, subscription_id)
        result = storage_client.storage_accounts.begin_create(
            resource_group_name=rg_name,
            account_name=account_name,
            parameters={
            "location": location,
            "sku": sku,
            "kind": kind,
            "access_tier": access_tier,
            "enable_https_traffic_only": enable_https_traffic_only
        }
        ).result()
        return jsonify({
            "message": f"Storage account '{account_name}' utworzony pomyślnie",
            "storageAccID": result.id
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500       

def delete_storage_account():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    subscription_id = data.get("subscriptionId")
    rg_name = data.get("resourceGroup")
    account_name = data.get("accountName")
    if not all([subscription_id, rg_name, account_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        credential = FlaskCredential()
        storage_client = StorageManagementClient(credential, subscription_id)

        storage_client.storage_accounts.delete(
            resource_group_name=rg_name,
            account_name=account_name
        )

        return jsonify({
            "message": f"Storage account '{account_name}' został usunięty"
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500