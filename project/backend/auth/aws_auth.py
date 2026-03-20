from flask import Blueprint, session, request, jsonify
import boto3
import os
import traceback
from botocore.exceptions import ClientError

aws_auth = Blueprint("aws_auth", __name__)

# Wczytaj poświadczenia SWOJEGO serwera z .env
AWS_SERVER_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SERVER_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_SERVER_ACCOUNT_ID = os.getenv("AWS_ACCOUNT_ID") 
APP_EXTERNAL_ID = "multi-cloud-manager-app-v1-secret" 

@aws_auth.route("/api/account/aws/config", methods=["GET"])
def get_aws_config_info():
    """
    Zwraca publiczne dane potrzebne do skonfigurowania roli IAM przez użytkownika.
    """
    if not AWS_SERVER_ACCOUNT_ID:
        return jsonify({"error": "Konfiguracja serwera jest niekompletna (brak AWS_ACCOUNT_ID)"}), 500
        
    return jsonify({
        "awsAccountId": AWS_SERVER_ACCOUNT_ID,
        "externalId": APP_EXTERNAL_ID
    }), 200

@aws_auth.route("/api/account/aws/add", methods=["POST"])
def add_aws_account():
    data = request.get_json()
    role_arn_from_user = data.get("roleArn")

    if not role_arn_from_user:
        return jsonify({"error": "Brak 'roleArn' w ciele żądania"}), 400

    try:
        sts_client = boto3.client(
            'sts',
            aws_access_key_id=AWS_SERVER_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SERVER_SECRET_KEY,
            region_name='us-east-1'
        )
        
        print(f"Próba przejęcia roli: {role_arn_from_user}")
        assumed_role_object = sts_client.assume_role(
            RoleArn=role_arn_from_user,
            RoleSessionName="MultiCloudManagerVerification",
            ExternalId=APP_EXTERNAL_ID
        )
        
        temp_credentials = assumed_role_object['Credentials']
        
        ec2_client = boto3.client(
            'ec2',
            aws_access_key_id=temp_credentials['AccessKeyId'],
            aws_secret_access_key=temp_credentials['SecretAccessKey'],
            aws_session_token=temp_credentials['SessionToken'],
            region_name='us-east-1' 
        )
        
        ec2_client.describe_regions()
        print("Weryfikacja poświadczeń AWS zakończona sukcesem.")

        user_account_id = role_arn_from_user.split(':')[4]
        
        new_aws_account = {
            "provider": "aws",
            "displayName": f"AWS Account ({user_account_id})",
            "roleArn": role_arn_from_user,
            "externalId": APP_EXTERNAL_ID,
            "accountId": user_account_id
        }

        accounts = session.get("accounts", [])
        
        account_found = False
        for i, acc in enumerate(accounts):
            if (acc.get("provider") == "aws" and 
                acc.get("roleArn") == role_arn_from_user):
                accounts[i] = new_aws_account
                account_found = True
                break
        if not account_found:
            accounts.append(new_aws_account)

        session["accounts"] = accounts
        # Allow AWS-only login: if no user in session yet, set a minimal user so frontend sees logged_in
        if not session.get("user"):
            session["user"] = {"name": "Konto AWS"}
        session.modified = True

        return jsonify({"message": f"Konto AWS {user_account_id} pomyślnie dodane."}), 201

    except ClientError as e:
        print(f"Błąd ClientError podczas assume_role: {e}\n{traceback.format_exc()}")
        if e.response['Error']['Code'] == 'AccessDenied':
            return jsonify({"error": "Odmowa dostępu. Sprawdź, czy ARN roli, ID Twojego konta oraz ExternalId są poprawne."}), 403
        return jsonify({"error": f"Błąd AWS: {str(e)}"}), 400
    except Exception as e:
        print(f"Błąd ogólny podczas dodawania konta AWS: {e}\n{traceback.format_exc()}")
        return jsonify({"error": f"Wystąpił nieoczekiwany błąd: {str(e)}"}), 500