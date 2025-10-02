import os
import msal
from flask import session, request
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Azure App Registration config (backend / daemon)
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")

if not all([CLIENT_ID, CLIENT_SECRET, TENANT_ID]):
    raise ValueError("Missing required environment variables. Check .env.")

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
REDIRECT_PATH = "/getAToken"

# Scopes do interaktywnego logowania (np. pokazać nazwę użytkownika)
SCOPE = ["User.Read"]

# ARM /.default – przy app-only używa tego SDK; zostawiamy dla kompletności
ARM_SCOPE_DEFAULT = ["https://management.azure.com/.default"]

def _build_msal_app(cache=None):
    return msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
        token_cache=cache,
    )

def build_auth_url(prompt=None):
    extra = {}
    if prompt:
        extra["prompt"] = prompt # "login"
        extra["response_mode"] = "form_post"
        extra["state"] = os.urandom(16).hex()
        extra["nonce"] = os.urandom(16).hex()
        extra["claims"] = '{"id_token":{"max_age":60}}' # reauth jeśli auth_time starszy niż 60 s
    return _build_msal_app().get_authorization_request_url(
    SCOPE,
    redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}",
    **extra
    )

def acquire_token():
    if "code" in request.args:
        result = _build_msal_app().acquire_token_by_authorization_code(
            request.args["code"],
            scopes=SCOPE,
            redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}",
        )
        if "id_token_claims" in result:
            user = result["id_token_claims"]
            session.setdefault("users", [])
            if user not in session["users"]:
                session["users"].append(user)
            session["user"] = user
        return result
    return None

def get_user():
    return session.get("user")
