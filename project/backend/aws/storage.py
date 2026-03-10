import boto3
from flask import jsonify, request, session, send_file
from .utils import get_aws_credentials
from io import BytesIO
from botocore.exceptions import ClientError


def _format_bytes(size_bytes):
    if size_bytes == 0:
        return "0 Bytes"
    if size_bytes >= (1024**4):
        return f"{size_bytes / (1024**4):.2f} TiB"
    if size_bytes >= (1024**3):
        return f"{size_bytes / (1024**3):.2f} GiB"
    if size_bytes >= (1024**2):
        return f"{size_bytes / (1024**2):.2f} MiB"
    if size_bytes >= 1024:
        return f"{size_bytes / 1024:.2f} KiB"
    return f"{size_bytes:.0f} Bytes"


def _get_s3_client(region=None):
    """Helper to get an S3 client using assumed role credentials."""
    creds = get_aws_credentials()
    kwargs = {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
    }
    if region:
        kwargs["region_name"] = region
    return boto3.client("s3", **kwargs), boto3.resource("s3", **kwargs)


def list_aws_buckets():
    """List all S3 buckets accessible via the assumed role."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    try:
        s3_client, _ = _get_s3_client()
        response = s3_client.list_buckets()

        buckets = []
        for b in response.get("Buckets", []):
            bucket_name = b["Name"]

            # Get bucket region
            try:
                loc = s3_client.get_bucket_location(Bucket=bucket_name)
                region = loc.get("LocationConstraint") or "us-east-1"
            except Exception:
                region = "unknown"

            bucket_client = s3_client
            if region != "unknown":
                bucket_client, _ = _get_s3_client(region=region)

            # Get bucket size and object count directly from S3
            object_count = "N/A"
            total_size = "N/A"
            try:
                paginator = bucket_client.get_paginator("list_objects_v2")
                total_objects = 0
                total_bytes = 0
                for page in paginator.paginate(Bucket=bucket_name):
                    contents = page.get("Contents", [])
                    total_objects += len(contents)
                    total_bytes += sum(obj.get("Size", 0) for obj in contents)

                object_count = total_objects
                total_size = _format_bytes(total_bytes)
            except Exception as e:
                print(f"[WARN] Could not calculate size/count for {bucket_name}: {e}")

            # Get versioning status
            try:
                versioning = bucket_client.get_bucket_versioning(Bucket=bucket_name)
                versioning_status = versioning.get("Status", "Disabled")
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ["AccessDenied", "AllAccessDisabled"]:
                    versioning_status = "Brak uprawnień"
                else:
                    versioning_status = "N/A"
            except Exception:
                versioning_status = "N/A"

            # Get encryption
            try:
                enc = bucket_client.get_bucket_encryption(Bucket=bucket_name)
                rules = enc.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
                if rules:
                    encryption = rules[0].get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm", "N/A")
                else:
                    encryption = "None"
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ["ServerSideEncryptionConfigurationNotFoundError", "NoSuchBucket"]:
                    encryption = "None"
                elif code in ["AccessDenied", "AllAccessDisabled"]:
                    encryption = "Brak uprawnień"
                else:
                    encryption = "N/A"
            except Exception:
                encryption = "N/A"

            buckets.append({
                "name": bucket_name,
                "region": region,
                "creationDate": b["CreationDate"].isoformat() if b.get("CreationDate") else None,
                "objectCount": object_count,
                "totalSize": total_size,
                "versioning": versioning_status,
                "encryption": encryption,
            })

        return jsonify({"value": buckets})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def create_aws_bucket():
    """Create a new S3 bucket."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    data = request.get_json()
    bucket_name = data.get("bucketName")
    region = data.get("region", "eu-west-1")
    versioning = data.get("versioning", False)

    if not bucket_name:
        return jsonify({"error": "Nazwa bucketa jest wymagana."}), 400

    try:
        s3_client, _ = _get_s3_client(region=region)

        create_params = {"Bucket": bucket_name}
        # us-east-1 does not accept LocationConstraint
        if region and region != "us-east-1":
            create_params["CreateBucketConfiguration"] = {
                "LocationConstraint": region
            }

        s3_client.create_bucket(**create_params)

        if versioning:
            s3_client.put_bucket_versioning(
                Bucket=bucket_name,
                VersioningConfiguration={"Status": "Enabled"},
            )

        return jsonify({
            "message": f"Bucket '{bucket_name}' został pomyślnie utworzony w regionie '{region}'."
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def delete_aws_bucket():
    """Delete an S3 bucket (optionally force-deleting all objects)."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    data = request.get_json()
    bucket_name = data.get("bucketName")
    force_delete = data.get("force", False)

    if not bucket_name:
        return jsonify({"error": "Nazwa bucketa jest wymagana."}), 400

    try:
        s3_client, s3_resource = _get_s3_client()
        bucket = s3_resource.Bucket(bucket_name)

        if force_delete:
            bucket.object_versions.all().delete()
            bucket.objects.all().delete()

        bucket.delete()

        return jsonify({
            "message": f"Bucket '{bucket_name}' został pomyślnie usunięty."
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def list_aws_bucket_objects():
    """List objects in an S3 bucket."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    bucket_name = request.args.get("bucketName")
    if not bucket_name:
        return jsonify({"error": "Parametr 'bucketName' jest wymagany."}), 400

    try:
        s3_client, _ = _get_s3_client()
        paginator = s3_client.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket_name)

        objects = []
        for page in pages:
            for obj in page.get("Contents", []):
                objects.append({
                    "name": obj["Key"],
                    "size": obj["Size"],
                    "lastModified": obj["LastModified"].isoformat(),
                    "storageClass": obj.get("StorageClass", "STANDARD"),
                })

        return jsonify({"value": objects})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def upload_aws_object():
    """Upload a file to an S3 bucket."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    if "file" not in request.files:
        return jsonify({"error": "Brak pliku w żądaniu."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Nie wybrano pliku."}), 400

    bucket_name = request.form.get("bucketName")
    if not bucket_name:
        return jsonify({"error": "Parametr 'bucketName' jest wymagany."}), 400

    try:
        s3_client, _ = _get_s3_client()
        s3_client.upload_fileobj(file, bucket_name, file.filename)

        return jsonify({
            "message": f"Plik '{file.filename}' został pomyślnie wysłany do bucketa '{bucket_name}'."
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def download_aws_object():
    """Download a file from an S3 bucket."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    bucket_name = request.args.get("bucketName")
    object_key = request.args.get("objectKey")

    if not all([bucket_name, object_key]):
        return jsonify({"error": "Parametry 'bucketName' i 'objectKey' są wymagane."}), 400

    try:
        s3_client, _ = _get_s3_client()

        file_buffer = BytesIO()
        s3_client.download_fileobj(bucket_name, object_key, file_buffer)
        file_buffer.seek(0)

        # Extract filename from key (could be a path like folder/file.txt)
        filename = object_key.split("/")[-1] if "/" in object_key else object_key

        return send_file(
            file_buffer,
            download_name=filename,
            as_attachment=True,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def delete_aws_object():
    """Delete an object from an S3 bucket."""
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    if not aws_account:
        return jsonify({"error": "Nie znaleziono aktywnego konta AWS w sesji"}), 401

    data = request.get_json()
    bucket_name = data.get("bucketName")
    object_key = data.get("objectKey")

    if not all([bucket_name, object_key]):
        return jsonify({"error": "Pola 'bucketName' i 'objectKey' są wymagane."}), 400

    try:
        s3_client, _ = _get_s3_client()
        s3_client.delete_object(Bucket=bucket_name, Key=object_key)

        return jsonify({
            "message": f"Obiekt '{object_key}' został pomyślnie usunięty z bucketa '{bucket_name}'."
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
