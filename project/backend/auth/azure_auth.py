from flask import Blueprint, session, redirect, jsonify, request
import msal
import os
from azure.identity import ClientSecretCredential
from azure.mgmt.subscription import SubscriptionClient



azure_auth = Blueprint("azure_auth", __name__)

AUTHORITY = f"https://login.microsoftonline.com/{os.getenv('AZURE_TENANT_ID')}"
SCOPE = ["https://management.azure.com/.default"]
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")
REDIRECT_PATH = "/getAToken"

def build_msal_app():
    return msal.ConfidentialClientApplication(CLIENT_ID, authority=AUTHORITY, client_credential=CLIENT_SECRET)

def get_user():
    return session.get("user")

@azure_auth.route("/api/login/azure")
def login():
    url = build_msal_app().get_authorization_request_url(
        SCOPE, redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
    )
    return redirect(url)

@azure_auth.route(REDIRECT_PATH)
def authorized():
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "Brak kodu"}), 401

    result = build_msal_app().acquire_token_by_authorization_code(
        code, scopes=SCOPE, redirect_uri=f"{APP_BASE_URL}{REDIRECT_PATH}"
    )
    
    if "id_token_claims" in result:
        
        session["user"] = result["id_token_claims"]
        session["access_token"] = result.get("access_token")

        tenant_id = os.getenv("AZURE_TENANT_ID")
        client_id = os.getenv("AZURE_CLIENT_ID")
        client_secret = os.getenv("AZURE_CLIENT_SECRET")
        
        cred = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret
        )
        
        sub_client = SubscriptionClient(cred)
        try:
            subs = [s.subscription_id for s in sub_client.subscriptions.list()]
        except Exception as e:
            print(f"Błąd listowania subskrypcji Azure: {e}")
            subs = []

        display_name = session["user"].get("name") or session["user"].get("preferred_username") or "Azure account"

        azure_account = {
            "provider": "azure",
            "tenantId": tenant_id,
            "displayName": display_name,
            "subscriptions": subs
        }

        current_accounts = session.get("accounts", [])
        
        filtered_accounts = [
            acc for acc in current_accounts 
            if not (acc.get("provider") == "azure" and acc.get("tenantId") == tenant_id)
        ]
        
        filtered_accounts.append(azure_account)
        
        session["accounts"] = filtered_accounts
        session.modified = True 

        print(f"DEBUG: Zapisano nowe/zaktualizowane konto Azure: {display_name}. Konta w sesji: {len(session['accounts'])}")
        
    return redirect("http://localhost:3000/dashboard")