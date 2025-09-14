import os
import msal
from flask import session, redirect, url_for, request
from dotenv import load_dotenv #type: ignore

# Load environment variables
load_dotenv()

# Dane konfiguracyjne z Azure App Registration
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")

# Validate environment variables
if not all([CLIENT_ID, CLIENT_SECRET, TENANT_ID]):
    raise ValueError("Missing required environment variables. Check your .env file.")

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
REDIRECT_PATH = "/getAToken"
SCOPE = ["User.Read"]

def _build_msal_app(cache=None):
    return msal.ConfidentialClientApplication(
        CLIENT_ID, authority=AUTHORITY,
        client_credential=CLIENT_SECRET, token_cache=cache)


def build_auth_url():
    return _build_msal_app().get_authorization_request_url(
        SCOPE,
        redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
    )

def acquire_token():
    if "code" in request.args:
        cache = None
        result = _build_msal_app(cache).acquire_token_by_authorization_code(
            request.args["code"],
            scopes=SCOPE,
            redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
        )
        if "id_token_claims" in result:
            session["user"] = result["id_token_claims"]
        return result
    return None


def get_user():
    return session.get("user")