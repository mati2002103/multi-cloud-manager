from flask import Blueprint, session, jsonify
from .utils import api_gcp_projects,api_gcp_accounts
from .storage import (list_gcp_buckets,delete_gcp_bucket,create_gcp_bucket,
                    list_bucket_blobs,upload_blob_to_bucket,download_blob_from_bucket,
                    delete_blob_from_bucket)

from .vm import list_gcp_vms,delete_gcp_vm,create_gcp_vm
from .containers import list_gcp_containers,delete_gcp_container,create_gcp_container
from .vpcs import list_gcp_vpcs,create_gcp_vpc,create_gcp_subnet

gcp_api = Blueprint("gcp_api", __name__)


#account and projects
gcp_api.route("/api/account/google/projects", methods=["GET"])(api_gcp_projects)
gcp_api.route("/api/account/gcp", methods=["GET"])(api_gcp_accounts)

#storage
gcp_api.route("/api/projects/list_buckets", methods=["GET"])(list_gcp_buckets)
gcp_api.route("/api/projects/delete_bucket",methods=["DELETE"])(delete_gcp_bucket)
gcp_api.route("/api/projects/create_bucket",methods=["POST"])(create_gcp_bucket)

#blobs inside bucket
gcp_api.route("/api/gcp/buckets/blobs", methods=["GET"])(list_bucket_blobs)
gcp_api.route("/api/gcp/buckets/blobs", methods=["POST"])(upload_blob_to_bucket)
gcp_api.route("/api/gcp/buckets/blobs/download", methods=["GET"])(download_blob_from_bucket)
gcp_api.route("/api/gcp/buckets/blobs", methods=["DELETE"])(delete_blob_from_bucket)

#vms
gcp_api.route("/api/gcp/list_vms", methods=["GET"])(list_gcp_vms)
gcp_api.route("/api/gcp/delete_gcp_vm", methods=["DELETE"])(delete_gcp_vm)
gcp_api.route("/api/gcp/create_gcp_vms", methods=["POST"])(create_gcp_vm)

#containers 
gcp_api.route("/api/gcp/list_containers", methods=["GET"])(list_gcp_containers)
gcp_api.route("/api/gcp/delete_container", methods=["DELETE"])(delete_gcp_container)
gcp_api.route("/api/gcp/create_container", methods=["POST"])(create_gcp_container)

#vpcs
gcp_api.route("/api/gcp/list_gcp_vpcs", methods=["GET"])(list_gcp_vpcs)
gcp_api.route("/api/gcp/create_gcp_vpc", methods=["POST"])(create_gcp_vpc)

#subnet
gcp_api.route("/api/gcp/create_gcp_subnet", methods=["POST"])(create_gcp_subnet)
