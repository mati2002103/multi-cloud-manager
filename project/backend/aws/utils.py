import boto3
import os
from flask import session

AWS_SERVER_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SERVER_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

def get_aws_credentials():
    accounts = session.get("accounts", [])
    aws_account = next((acc for acc in accounts if acc.get("provider") == "aws"), None)
    
    if not aws_account:
        raise Exception("Brak aktywnego konta AWS w sesji.")
        
    role_arn = aws_account.get("roleArn")
    external_id = aws_account.get("externalId")
    
    if not role_arn or not external_id:
        raise Exception("Niekompletne dane konta AWS w sesji (brak roleArn lub externalId).")

    sts_client = boto3.client(
        'sts',
        aws_access_key_id=AWS_SERVER_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SERVER_SECRET_KEY
    )
    
    assumed_role_object = sts_client.assume_role(
        RoleArn=role_arn,
        RoleSessionName="MultiCloudManagerAPISession",
        ExternalId=external_id
    )
    
    return assumed_role_object['Credentials']