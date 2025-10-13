from flask import jsonify, request, session,send_file
from .utils import FlaskCredential
from io import BytesIO

from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.storage import StorageManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.storage.blob import BlobServiceClient

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
    
def list_blob_containers(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")

    if not all([account_name, account_key]):
        return jsonify({"error": "Brak danych konta"}), 400

    try:
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )

        containers = blob_service.list_containers()
        result = [{"name": c.name, "last_modified": c.last_modified.isoformat()} for c in containers]

        return jsonify({"value": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def create_blob_container(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")
    container_name = data.get("containerName")

    if not all([account_name, account_key, container_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )

        blob_service.create_container(container_name)
        return jsonify({"message": f"Kontener '{container_name}' utworzony"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def delete_blob_container(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")
    container_name = data.get("containerName")

    if not all([account_name, account_key, container_name]):
        return jsonify({"error": "Brak wymaganych danych"}), 400

    try:
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )

        blob_service.delete_container(container_name)
        return jsonify({"message": f"Kontener '{container_name}' usunięty"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def list_blobs(storage_account_id):
    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")
    container_name = data.get("containerName")

    blob_service = BlobServiceClient(
        account_url=f"https://{account_name}.blob.core.windows.net",
        credential=account_key
    )
    container_client = blob_service.get_container_client(container_name)
    blobs = container_client.list_blobs()
    result = [{"name": b.name, "size": b.size, "last_modified": b.last_modified.isoformat()} for b in blobs]
    return jsonify({"value": result})



def upload_blob(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    account_name = request.form.get("accountName")
    account_key = request.form.get("accountKey")
    container_name = request.form.get("containerName")
    file = request.files.get("file")
    try:
        if not all([account_name, account_key, container_name, file]):
            return jsonify({"error": "Brak wymaganych danych"}), 400
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )
        blob_client = blob_service.get_blob_client(container=container_name, blob=file.filename)
        blob_client.upload_blob(file.stream, overwrite=True)
        return jsonify({"message": f"Plik '{file.filename}' został przesłany"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
def download_blob(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")
    container_name = data.get("containerName")
    blob_name = data.get("blobName")    
    try:
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )
        blob_client = blob_service.get_blob_client(container=container_name, blob=blob_name)
        stream = blob_client.download_blob()
        blob_data = stream.readall()

        return send_file(
            BytesIO(blob_data),
            download_name=blob_name,
            as_attachment=True
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
def delete_blob(storage_account_id):
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json()
    account_name = data.get("accountName")
    account_key = data.get("accountKey")
    container_name = data.get("containerName")
    blob_name = data.get("blobName")    
    try:
        blob_service = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=account_key
        )
        blob_client = blob_service.get_blob_client(container=container_name, blob=blob_name)
        blob_client.delete_blob()
        return jsonify({"message": f"Blob '{blob_name}' został usunięty"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    pass



