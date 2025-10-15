from flask import jsonify, session
from google.oauth2.credentials import Credentials
import googleapiclient.discovery
import requests
import os
from datetime import datetime, timedelta

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
TOKEN_URI = "https://oauth2.googleapis.com/token"

class SessionCredentials(Credentials):
    def __init__(self, account_info):
        access_token = account_info.get("access_token")
        self._refresh_token = account_info.get("refresh_token")
        self.account_email = account_info.get("email")

        super().__init__(
            access_token,
            refresh_token=self._refresh_token,
            token_uri=TOKEN_URI,
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=['https://www.googleapis.com/auth/cloud-platform.read-only']
        )

    def refresh(self, request):
        if not self._refresh_token:
            raise ValueError("Brak refresh_token. Nie można odświeżyć poświadczeń.")

        response = requests.post(self.token_uri, data={
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'refresh_token': self._refresh_token,
            'grant_type': 'refresh_token'
        })

        if response.status_code != 200:
            error_details = response.json()
            print(f"BŁĄD: Nie udało się odświeżyć tokenu: {error_details}")
            raise ConnectionError("Nie udało się odświeżyć tokenu.")

        new_token_data = response.json()
        self.token = new_token_data['access_token']
        self.expiry = datetime.utcnow() + timedelta(seconds=new_token_data['expires_in'])
        print(f"DEBUG: Token dla {self.account_email} został pomyślnie odświeżony.")

        self._update_token_in_session()

    def _update_token_in_session(self):
        accounts = session.get("accounts", [])
        for acc in accounts:
            if acc.get("email") == self.account_email:
                acc['access_token'] = self.token
                session.modified = True
                print(f"DEBUG: Zaktualizowano token w sesji dla {self.account_email}.")
                break

def list_gcp_projects(credentials: Credentials):
    service = googleapiclient.discovery.build(
        'cloudresourcemanager', 'v1', credentials=credentials
    )
    request = service.projects().list(filter='lifecycleState:ACTIVE')
    response = request.execute()
    
    projects_list = []
    for project in response.get('projects', []):
        projects_list.append({
            "provider": "gcp",
            "projectId": project.get("projectId"),
            "projectNumber": project.get("projectNumber"),
            "displayName": project.get("name"),
            "lifecycleState": project.get("lifecycleState")
        })
    return projects_list

def api_gcp_accounts():
    all_accounts = session.get("accounts", [])
    gcp_accounts_with_details = []

    for acc in all_accounts:
        if acc.get("provider") != "gcp":
            continue

        gcp_account_data = acc.copy()
        if not acc.get("access_token") or not acc.get("refresh_token"):
            gcp_account_data["error"] = "Brak kompletnych tokenów do uwierzytelnienia."
        else:
            try:
                credentials = SessionCredentials(acc)
                projects = list_gcp_projects(credentials)
                gcp_account_data["projects"] = projects
            except Exception as e:
                gcp_account_data["error"] = f"Błąd listowania projektów: {e}"
        
        gcp_account_data.pop("access_token", None)
        gcp_account_data.pop("refresh_token", None)
            
        gcp_accounts_with_details.append(gcp_account_data)
            
    return jsonify({"value": gcp_accounts_with_details})

def api_gcp_projects():
    accounts = session.get("accounts", [])
    gcp_projects = []

    for acc in accounts:
        if acc.get("provider") != "gcp" or not acc.get("refresh_token"):
            continue
            
        try:
            credentials = SessionCredentials(acc)
            projects = list_gcp_projects(credentials)
            gcp_projects.extend(projects)
            
        except Exception as e:
            print(f"Błąd listowania projektów dla konta {acc.get('email')}: {str(e)}")
            return jsonify({
                "error": f"Błąd listowania projektów dla konta {acc.get('email')}: {str(e)}"
            }), 500
            
    return jsonify({"value": gcp_projects})