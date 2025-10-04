from flask import Flask, session, redirect, jsonify, request
from dotenv import load_dotenv
import os
import auth
from azure.identity import ClientSecretCredential
from azure.core.credentials import AccessToken,TokenCredential
from azure.mgmt.subscription import SubscriptionClient
from azure.mgmt.resource import ResourceManagementClient
from flask_cors import CORS




load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super-secret-key")

CORS(app, supports_credentials=True, origins=["http://localhost:3000"])


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

@app.route("/api/login")
def login():
    return redirect(auth.build_auth_url())

@app.route(auth.REDIRECT_PATH)
def authorized():
    result = auth.acquire_token()
    if not result:
        return jsonify({"error": "Nie udało się zalogować"}), 401

    session["access_token"] = result.get("access_token")
    user = auth.get_user()
    display_name = user.get("name") or user.get("preferred_username") or "Azure account"

    try:
        sub_client = get_subscription_client(TENANT_ID)
        subs = [s.subscription_id for s in sub_client.subscriptions.list()]
    except Exception:
        subs = []

    session["accounts"] = [{
        "provider": "azure",
        "tenantId": TENANT_ID,
        "displayName": display_name,
        "subscriptions": subs
    }]

    return redirect(FRONTEND_URL + "/dashboard")

@app.route("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Wylogowano"}), 200

@app.route("/api/accounts")
def api_accounts():
    accounts = session.get("accounts", []) 
    return jsonify(accounts), 200

@app.route("/api/user")
def api_user():
    user = auth.get_user()
    if not user: 
        return jsonify({"logged_in": False}), 200 
    return jsonify({"logged_in": True, "name": user.get("name")}), 200

@app.route("/api/subscriptions")
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

@app.route("/api/resource_groups")
def api_resource_groups():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    credential = FlaskCredential()
    sub_client = SubscriptionClient(credential)

    items = []
    try:
        for sub in sub_client.subscriptions.list():
            rg_client = ResourceManagementClient(credential, sub.subscription_id)
            for rg in rg_client.resource_groups.list():
                items.append({
                    "subscriptionId": sub.subscription_id,
                    "resourceGroup": rg.name,
                    "location": rg.location
                })
        return jsonify({"value": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/create_rg")
def api_create_resource_groups():
    if "access_token" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    sub_client = SubscriptionClient(credential)
    credential = FlaskCredential()
    for sub in sub_client.subscriptions.list():
        print(sub.subscription_id, sub.display_name)

        # Inicjalizacja klienta zasobów
        resource_client = ResourceManagementClient(credential, sub.subscription_id)

        # Tworzenie nowej grupy zasobów
        rg_name = "my-new-resource-group"
        location = "westeurope"  # lub np. "eastus", "northeurope"

        rg_result = resource_client.resource_groups.create_or_update(
            rg_name,
            {
                "location": location
            }
        )
    return redirect(FRONTEND_URL + "/api/resource_groups") 



if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
