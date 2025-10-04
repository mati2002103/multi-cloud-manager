import os
import msal
from flask import session, request
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
REDIRECT_PATH = "/getAToken"
SCOPE = ["https://management.azure.com/.default"]

def build_msal_app():
    return msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET
    )

def build_auth_url():
    return build_msal_app().get_authorization_request_url(
        SCOPE,
        redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
    )

def acquire_token():
    code = request.args.get("code")
    if not code:
        return None
    result = build_msal_app().acquire_token_by_authorization_code(
        code,
        scopes=SCOPE,
        redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
    )
    if "id_token_claims" in result:
        session["user"] = result["id_token_claims"]
    return result

def get_user():
    return session.get("user")
