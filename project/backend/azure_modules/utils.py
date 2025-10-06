from flask import session,jsonify


from dotenv import load_dotenv
import os
from auth.routes import get_user

from azure.core.credentials import AccessToken, TokenCredential
from azure.identity import ClientSecretCredential
from azure.mgmt.subscription import SubscriptionClient

load_dotenv()



CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
TENANT_ID = os.getenv("AZURE_TENANT_ID")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def get_subscription_client(tenant_id):
    cred = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )
    return SubscriptionClient(cred)

class FlaskCredential(TokenCredential):
    def get_token(self, *scopes, **kwargs):
        token = session.get("access_token")
        if not token:
            raise Exception("Brak tokenu w sesji")
        return AccessToken(token, expires_on=9999999999)


def logout():
    session.clear()
    return jsonify({"message": "Wylogowano"}), 200

def api_accounts():
    accounts = session.get("accounts", []) 
    return jsonify(accounts), 200

def api_user():
    user = get_user()
    if not user: 
        return jsonify({"logged_in": False}), 200 
    return jsonify({"logged_in": True, "name": user.get("name")}), 200

def api_subscriptions():
    accounts = session.get("accounts", [])
    items = []
    for acc in accounts:
        if acc.get("provider") != "azure":
            continue
        try:
            client = get_subscription_client(acc["tenantId"])
            for s in client.subscriptions.list():
                items.append({
                    "provider": "azure",
                    "tenantId": acc["tenantId"],
                    "subscriptionId": s.subscription_id,
                    "displayName": s.display_name
                })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"value": items})


    
    