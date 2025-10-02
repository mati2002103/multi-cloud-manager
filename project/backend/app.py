from flask import Flask, session, redirect, url_for, jsonify
from dotenv import load_dotenv
import os
import auth
import requests

# Load environment variables
load_dotenv()


app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "super-secret-key")


APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@app.route("/api/user")
def api_user():
    """Sprawdza, czy użytkownik jest zalogowany"""
    user = auth.get_user()
    if not user:
        return jsonify({"logged_in": False}), 200
    return jsonify({"logged_in": True, "name": user.get("name")}), 200

@app.route("/api/accounts")
def api_accounts():
    """Zwraca listę wszystkich zalogowanych kont"""
    users = session.get("users", [])
    return jsonify(users), 200

@app.route("/api/login")
def login():
    """Przekierowuje do logowania Microsoft"""
    return redirect(auth.build_auth_url())


@app.route(auth.REDIRECT_PATH)
def authorized():
    """Obsługa powrotu z Microsoft i zapisanie sesji"""
    result = auth.acquire_token()
    if not result:
        return jsonify({"error": "Nie udalo sie zalogowac"}), 401
    return redirect(FRONTEND_URL + "/dashboard")


@app.route("/api/logout")
def logout():
    """Czyści sesję i wylogowuje"""
    session.clear()
    return jsonify({"message": "Wylogowano"}), 200

@app.route("/api/subscriptions")
def api_subscriptions():
    token = auth.acquire_subscription_token()
    if not token:
        return jsonify({"error": "Brak tokenu"}), 401

    headers = {"Authorization": f"Bearer {token}"}
    url = "https://management.azure.com/subscriptions?api-version=2020-01-01"
    resp = requests.get(url, headers=headers)
    return jsonify(resp.json()), resp.status_code


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
