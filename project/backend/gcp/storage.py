from google.oauth2.credentials import Credentials
from google.cloud import storage

def list_gcp_buckets(access_token: str):
    credentials = Credentials(
        token=access_token,
        scopes=['https://www.googleapis.com/auth/cloud-platform.read-only'] 
    )