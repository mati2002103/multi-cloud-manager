from flask import Blueprint, session, redirect, request, jsonify
import os
import requests as http_requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
TOKEN_URI = "https://oauth2.googleapis.com/token"

gcp_auth = Blueprint("gcp_auth", __name__)


@gcp_auth.route("/api/login/google")
def login_google():
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        "&response_type=code"
        "&scope=openid%20email%20profile%20https://www.googleapis.com/auth/cloud-platform"
        "&access_type=offline"
        "&prompt=consent%20select_account"
    )
    return redirect(url)


@gcp_auth.route("/google/callback")
def google_callback():
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "Brak kodu autoryzacyjnego Google w odpowiedzi"}), 401

    token_res = http_requests.post(TOKEN_URI, data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    })

    if token_res.status_code != 200:
        error_details = token_res.json()
        return jsonify({"error": "Błąd wymiany kodu na token", "details": error_details}), 500

    token_data = token_res.json()
    id_token_str = token_data.get("id_token")
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    try:
        idinfo = id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10
        )
    except Exception as e:
        return jsonify({"error": "Błąd weryfikacji tokenu ID", "details": str(e)}), 401

    session["user"] = idinfo
    session["access_token"] = access_token

    new_gcp_account = {
        "provider": "gcp",
        "email": idinfo.get("email"),
        "displayName": idinfo.get("name"),
        "access_token": access_token,
        "refresh_token": refresh_token
    }

    accounts = session.setdefault("accounts", [])

    account_found = False
    for i, acc in enumerate(accounts):
        if acc.get("email") == new_gcp_account["email"] and acc.get("provider") == "gcp":
            accounts[i] = new_gcp_account
            account_found = True
            break

    if not account_found:
        accounts.append(new_gcp_account)

    session.modified = True
    print("Redirecting http://localhost:3000/dashboard")
    return redirect(f"http://localhost:3000/dashboard")#