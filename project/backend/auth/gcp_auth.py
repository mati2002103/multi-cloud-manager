from flask import Blueprint, session, redirect, request, jsonify
import os
import requests as http_requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

gcp_auth = Blueprint("gcp_auth", __name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

@gcp_auth.route("/api/login/google")
def login_google():
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        "&access_type=offline"
        "&prompt=consent%20select_account"
    )
    return redirect(url)

@gcp_auth.route("/google/callback")
def google_callback():
    code = request.args.get("code")
    if not code:
        return jsonify({"error": "Brak kodu Google"}), 401

    token_res = http_requests.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    })

    if token_res.status_code != 200:
        return jsonify({"error": "Błąd wymiany kodu"}), 500

    token_data = token_res.json()
    id_token_str = token_data.get("id_token")
    access_token = token_data.get("access_token")

    try:
        idinfo = id_token.verify_oauth2_token(id_token_str, google_requests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        return jsonify({"error": f"Błąd weryfikacji tokenu: {str(e)}"}), 401

    gcp_account = {
        "provider": "gcp",
        "email": idinfo.get("email"),
        "displayName": idinfo.get("name"),
        "access_token": access_token
    }

    session.setdefault("accounts", []).append(gcp_account)

    return redirect(os.getenv("FRONTEND_URL", "http://localhost:3000") + "/dashboard")
