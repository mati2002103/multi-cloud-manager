from flask import jsonify, request, session, send_file
from .utils import FlaskCredential
from io import BytesIO
from datetime import datetime, timedelta  # <-- DODANO

from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.storage import StorageManagementClient
from azure.mgmt.resource import ResourceManagementClient
from azure.mgmt.monitor import MonitorManagementClient  # <-- DODANO
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
            
            # --- ZMIANY W TEJ SEKCJI ---
            
            # 1. Poprawiona wersja API na działającą
            storage_acc_client = StorageManagementClient(credential, subscription_id, api_version="2025-06-01")
            
            resource_client = ResourceManagementClient(credential, subscription_id)
            
            # 2. Dodany klient monitorowania do pobierania metryk (Użycia)
            monitor_client = MonitorManagementClient(credential, subscription_id)
            
            # --- KONIEC ZMIAN ---
            
            for rg in resource_client.resource_groups.list():
                    accounts = storage_acc_client.storage_accounts.list_by_resource_group(rg.name)
                    for acc in accounts:
                        keys = storage_acc_client.storage_accounts.list_keys(rg.name, acc.name)
                        props = storage_acc_client.storage_accounts.get_properties(rg.name, acc.name)

                        # --- NOWA LOGIKA POBIERANIA UŻYCIA ---
                        usage_str = "N/A"
                        try:
                            # Zapytanie o metrykę UsedCapacity z ostatniego dnia
                            metric_result = monitor_client.metrics.list(
                                resource_uri=props.id,  # Używamy ID z obiektu 'props'
                                timespan=f"{datetime.utcnow() - timedelta(days=1)}/{datetime.utcnow()}",
                                interval="PT1H",
                                metricnames="UsedCapacity",
                                aggregation="Average"
                            )
                            # Bezpieczne sprawdzanie danych
                            if metric_result.value and len(metric_result.value) > 0:
                                timeseries = metric_result.value[0].timeseries
                                # Sprawdź, czy istnieje seria czasowa
                                if timeseries and len(timeseries) > 0:
                                    data = timeseries[0].data
                                    # Sprawdź, czy są jakiekolwiek punkty danych
                                    if data and len(data) > 0:
                                        # Bezpiecznie pobierz ostatnią wartość 'average'
                                        last_data_point = data[-1]
                                        capacity_bytes = last_data_point.average
                                        
                                        if capacity_bytes is not None:
                                            # Formatowanie
                                            if capacity_bytes == 0:
                                                usage_str = "0 Bytes"
                                            elif capacity_bytes > (1024**4): # TB
                                                usage_str = f"{capacity_bytes / (1024**4):.2f} TiB"
                                            elif capacity_bytes > (1024**3): # GB
                                                usage_str = f"{capacity_bytes / (1024**3):.2f} GiB"
                                            elif capacity_bytes > (1024**2): # MB
                                                usage_str = f"{capacity_bytes / (1024**2):.2f} MiB"
                                            else:
                                                usage_str = f"{capacity_bytes:.0f} Bytes"
                                        else:
                                            usage_str = "N/A (no data)"
                                    else:
                                        usage_str = "N/A (no data)" 
                                else:
                                    usage_str = "N/A (no series)" 
                            else:
                                usage_str = "N/A (no value)" 
                        except Exception as e:
                            print(f"[ERROR] Metryka dla {acc.name} ({props.id}): {e}")
                            usage_str = f"Error: {str(e)}"
                                                

                        items.append({
                            "name": acc.name,
                            "resourceGroup": rg.name,
                            "location": acc.location,
                            "Keys": keys.keys[0].value,
                            "sku": props.sku.name,
                            "accessTier": props.access_tier,  # To już tu było
                            "storageType": classify_storage_type(props.kind).value,  # To już tu było
                            "httpsOnly": props.enable_https_traffic_only,
                            "subscriptionId": subscription_id,
                            
                            # --- NOWE POLA DODANE DO ODPOWIEDZI ---
                            "usage": usage_str,
                            "publicAccess": "Włączony" if props.allow_blob_public_access else "Wyłączony"
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