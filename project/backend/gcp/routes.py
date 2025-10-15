from flask import Blueprint, session, jsonify
from .utils import api_gcp_projects,api_gcp_accounts
from .storage import list_gcp_buckets,delete_gcp_bucket,create_gcp_bucket,list_bucket_blobs

gcp_api = Blueprint("gcp_api", __name__)


#account and projects
gcp_api.route("/api/account/google/projects", methods=["GET"])(api_gcp_projects)
gcp_api.route("/api/account/gcp", methods=["GET"])(api_gcp_accounts)

#storage
gcp_api.route("/api/projects/list_buckets", methods=["GET"])(list_gcp_buckets)
gcp_api.route("/api/projects/delete_bucket",methods=["DELETE"])(delete_gcp_bucket)
gcp_api.route("/api/projects/create_bucket",methods=["POST"])(create_gcp_bucket)

#blobs inside bucket
gcp_api.route("/api/projects/<bucket_name>/list_bucket_blobs", methods=["GET"])(list_bucket_blobs)
