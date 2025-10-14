from flask import jsonify,session
from google.oauth2.credentials import Credentials
import googleapiclient.discovery
from google.auth.transport.requests import Request

def list_gcp_projects(access_token: str):
    credentials = Credentials(
        token=access_token,
        scopes=['https://www.googleapis.com/auth/cloudplatform.read-only'] 
    )

    try:
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

    except Exception as e:
        print(f"Błąd podczas listowania projektów GCP: {e}")
        raise

def api_gcp_accounts():
    
    all_accounts = session.get("accounts", [])
    gcp_accounts_with_details = []
    
    for acc in all_accounts:
        if acc.get("provider") != "gcp":
            continue
            
        access_token = acc.get("access_token")
        
        gcp_account_data = acc.copy() 
        gcp_account_data["projects"] = []
        
        if not access_token:
            gcp_account_data["error"] = "Brak aktywnego access_token do GCP."
            gcp_accounts_with_details.append(gcp_account_data)
            continue
            
        try:
            projects = list_gcp_projects(access_token)
            
            gcp_account_data["projects"] = projects
            
        except Exception as e:
            error_msg = f"Błąd listowania projektów: {str(e)}"
            gcp_account_data["error"] = error_msg
            print(error_msg) 
            
        if "access_token" in gcp_account_data:
            del gcp_account_data["access_token"]
            
        gcp_accounts_with_details.append(gcp_account_data)
        
    return jsonify({"value": gcp_accounts_with_details})

def api_gcp_projects():
    
    accounts = session.get("accounts", [])
    
    gcp_projects = []
    
    # 2. Iteruj przez konta i wyodrębnij tylko konta GCP
    for acc in accounts:
        if acc.get("provider") != "gcp":
            continue
            
        access_token = acc.get("access_token")
        
        if not access_token:
            # Pomiń konto bez tokenu dostępu (co nie powinno się zdarzyć)
            continue
            
        try:
            # 3. Wywołaj funkcję z utils.py
            projects = list_gcp_projects(access_token)
            gcp_projects.extend(projects)
            
        except Exception as e:
            return jsonify({
                "error": f"Błąd listowania projektów dla konta {acc.get('email')}: {str(e)}"
            }), 500
            
    return jsonify({"value": gcp_projects})


