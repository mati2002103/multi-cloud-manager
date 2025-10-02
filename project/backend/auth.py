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
SUBSCRIPTION_SCOPE = ["https://management.azure.com/.default"]



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
        result = _build_msal_app().acquire_token_by_authorization_code(
            request.args["code"],
            scopes=SCOPE,
            redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
        )
        if "id_token_claims" in result:
            user = result["id_token_claims"]
            # jeśli to pierwsze logowanie
            if "users" not in session:
                session["users"] = []
            if user not in session["users"]:
                session["users"].append(user)
            # Ustaw aktualnego usera
            session["user"] = user
        return result
    return None


def acquire_subscription_token():
    app = _build_msal_app()
    result = app.acquire_token_for_client(scopes=SUBSCRIPTION_SCOPE)
    return result.get("access_token")

def get_user():
    return session.get("user")