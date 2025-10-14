from flask import Blueprint

from .azure_auth import azure_auth,get_user
from .gcp_auth import gcp_auth

auth_bp = Blueprint("auth_bp", __name__)
auth_bp.register_blueprint(azure_auth)
auth_bp.register_blueprint(gcp_auth)


