# gcp/routes.py

from flask import Blueprint, session, jsonify
from .utils import api_gcp_projects,api_gcp_accounts

gcp_api = Blueprint("gcp_api", __name__)

gcp_api.route("/api/account/google/projects", methods=["GET"])(api_gcp_projects)
gcp_api.route("/api/account/gcp", methods=["GET"])(api_gcp_projects)

