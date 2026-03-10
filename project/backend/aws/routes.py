from flask import Blueprint
from .storage import (
    list_aws_buckets,
    create_aws_bucket,
    delete_aws_bucket,
    list_aws_bucket_objects,
    upload_aws_object,
    download_aws_object,
    delete_aws_object,
)

aws_api = Blueprint("aws_api", __name__)

# S3 Buckets
aws_api.route("/api/aws/list_buckets", methods=["GET"])(list_aws_buckets)
aws_api.route("/api/aws/create_bucket", methods=["POST"])(create_aws_bucket)
aws_api.route("/api/aws/delete_bucket", methods=["DELETE"])(delete_aws_bucket)

# S3 Objects inside bucket
aws_api.route("/api/aws/bucket/objects", methods=["GET"])(list_aws_bucket_objects)
aws_api.route("/api/aws/bucket/objects", methods=["POST"])(upload_aws_object)
aws_api.route("/api/aws/bucket/objects/download", methods=["GET"])(download_aws_object)
aws_api.route("/api/aws/bucket/objects", methods=["DELETE"])(delete_aws_object)
