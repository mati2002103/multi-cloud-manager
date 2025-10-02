from flask import Flask, session, redirect, jsonify, request
from dotenv import load_dotenv
import os
import auth

# Azure SDK
from azure.identity import ClientSecretCredential
from azure.mgmt.subscription import SubscriptionClient


from urllib.parse import quote



# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super-secret-key")

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")

def _subscription_client_for_tenant(tenant_id: str) -> SubscriptionClient:
    cred = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )
    return SubscriptionClient(cred)


@app.route("/api/aad-signout")
def aad_signout():
    # Czyść lokalną sesję aplikacji (opcjonalnie, możesz zostawić jeśli chcesz zachować listę kont)
    # session.clear()

    app_base = APP_BASE_URL.rstrip("/")
    post_logout = f"{app_base}/api/after-aad-logout"
    logout_url = (
        "https://login.microsoftonline.com/common/oauth2/v2.0/logout"
        f"?post_logout_redirect_uri={quote(post_logout, safe='')}"
    )
    # Zwracamy prostą stronę z JS, która w nowej karcie odpali logout,
    # a po krótkim czasie otworzy okno logowania z prompt=login
    html = f"""
    <html>
      <head><meta charset="utf-8"/></head>
      <body>
        <script>
          // Otwórz AAD logout w nowej karcie (czyści sesję po stronie Microsoft)
          window.open("{logout_url}", "_blank", "noopener,noreferrer");

          // Po krótkiej pauzie wróć do dodawania konta z wymuszonym logowaniem
          setTimeout(function(){{
            window.location.href = "/api/login?prompt=login";
          }}, 1200);
        </script>
        <p>Kończenie sesji AAD...</p>
      </body>
    </html>
    """
    return html, 200

@app.route("/api/after-aad-logout")
def after_aad_logout():
    # Docelowy redirect po stronie AAD; można od razu kierować do /api/login?prompt=login
    return redirect("/api/login?prompt=login")


@app.route("/api/user")
def api_user():
    user = auth.get_user()
    if not user:
        return jsonify({"logged_in": False}), 200
    return jsonify({"logged_in": True, "name": user.get("name")}), 200

@app.route("/api/accounts")
def api_accounts():
    # Zwracamy listę zapisanych kont (multi-cloud w przyszłości)
    accounts = session.get("accounts", [])
    return jsonify(accounts), 200

@app.route("/api/login")
def login():
    # Dodawanie nowego konta Azure – wymuś ekran wyboru konta
    prompt = request.args.get("prompt")
    return redirect(auth.build_auth_url(prompt=prompt))

@app.route(auth.REDIRECT_PATH)
def authorized():
    # Po powrocie z logowania dopisz konto Azure do session["accounts"]
    result = auth.acquire_token()
    if not result:
        return jsonify({"error": "Nie udalo sie zalogowac"}), 401

    # Wyciągnij podstawowe identyfikatory konta/tenanta
    claims = result.get("id_token_claims", {}) or {}
    tenant_id = claims.get("tid")
    display_name = claims.get("name") or claims.get("preferred_username") or "Azure account"

    if not tenant_id:
        return jsonify({"error": "Brak tenant_id w tokenie"}), 400

    # Opcjonalnie natychmiast zbuduj listę subów, aby pokazać w UI od razu
    try:
        sub_client = _subscription_client_for_tenant(tenant_id)
        subs = [s.subscription_id for s in sub_client.subscriptions.list()]
    except Exception:
        subs = []

    # Zapisz konto do sesji, unikając duplikatów
    account_entry = {
        "provider": "azure",
        "key": f"azure:{tenant_id}",
        "displayName": display_name,
        "tenantId": tenant_id,
        "subscriptions": subs,  # może być puste jeśli SP nie ma ról
    }
    accounts = session.get("accounts", [])
    if not any(a.get("provider") == "azure" and a.get("tenantId") == tenant_id for a in accounts):
        accounts.append(account_entry)
        session["accounts"] = accounts

    return redirect(FRONTEND_URL + "/dashboard")

@app.route("/api/logout")
def logout():
    session.clear()
    return jsonify({"message": "Wylogowano"}), 200

@app.route("/api/subscriptions")
def api_subscriptions():
    # Agregacja subskrypcji ze wszystkich zapisanych kont Azure
    accounts = session.get("accounts", [])
    items = []
    try:
        for acc in accounts:
            if acc.get("provider") != "azure":
                continue
            tenant_id = acc.get("tenantId")
            if not tenant_id:
                continue
            client = _subscription_client_for_tenant(tenant_id)
            for s in client.subscriptions.list():
                items.append({
                    "provider": "azure",
                    "tenantId": tenant_id,
                    "subscriptionId": s.subscription_id,
                    "displayName": s.display_name,
                })
        return jsonify({"value": items}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
