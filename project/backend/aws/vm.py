from flask import jsonify, request, session
from .utils import get_aws_credentials
import traceback
import json
import base64
import time

from botocore.exceptions import ClientError


def list_ec2_instances():
    """List EC2 instances across all enabled regions."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    try:
        base = __ec2_client(creds, "us-east-1")
        regions_resp = base.describe_regions(AllRegions=False)
        regions = [r["RegionName"] for r in regions_resp.get("Regions", []) if r.get("RegionName")]

        instances = []
        for region in regions:
            ec2 = __ec2_client(creds, region)
            paginator = ec2.get_paginator("describe_instances")
            for page in paginator.paginate():
                for reservation in page.get("Reservations", []):
                    for inst in reservation.get("Instances", []):
                        name = None
                        for tag in inst.get("Tags", []):
                            if tag.get("Key") == "Name":
                                name = tag.get("Value")
                                break
                        instances.append({
                            "instanceId": inst["InstanceId"],
                            "name": name or inst["InstanceId"],
                            "state": inst.get("State", {}).get("Name", "unknown"),
                            "instanceType": inst.get("InstanceType", "—"),
                            "region": region,
                            "availabilityZone": inst.get("Placement", {}).get("AvailabilityZone", "—"),
                            "launchTime": inst.get("LaunchTime").isoformat() if inst.get("LaunchTime") else None,
                        })
        return jsonify({"value": instances}), 200
    except Exception as e:
        print(f"[ERROR] list_ec2_instances: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def get_ec2_instance_details(instance_id):
    """Get single EC2 instance details by instance ID (searches across regions)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    try:
        base = __ec2_client(creds, "us-east-1")
        regions_resp = base.describe_regions(AllRegions=False)
        regions = [r["RegionName"] for r in regions_resp.get("Regions", []) if r.get("RegionName")]

        for region in regions:
            ec2 = __ec2_client(creds, region)
            try:
                resp = ec2.describe_instances(InstanceIds=[instance_id])
            except Exception:
                continue
            for reservation in resp.get("Reservations", []):
                for inst in reservation.get("Instances", []):
                    name = None
                    for tag in inst.get("Tags", []):
                        if tag.get("Key") == "Name":
                            name = tag.get("Value")
                            break
                    iam_prof = inst.get("IamInstanceProfile") or {}
                    return jsonify({
                        "instanceId": inst["InstanceId"],
                        "name": name or inst["InstanceId"],
                        "state": inst.get("State", {}).get("Name", "unknown"),
                        "instanceType": inst.get("InstanceType", "—"),
                        "region": region,
                        "availabilityZone": inst.get("Placement", {}).get("AvailabilityZone", "—"),
                        "launchTime": inst.get("LaunchTime").isoformat() if inst.get("LaunchTime") else None,
                        "privateIpAddress": inst.get("PrivateIpAddress"),
                        "publicIpAddress": inst.get("PublicIpAddress"),
                        "iamInstanceProfileArn": iam_prof.get("Arn"),
                        "iamInstanceProfileId": iam_prof.get("Id"),
                    }), 200
        return jsonify({"error": f"Instance '{instance_id}' not found"}), 404
    except Exception as e:
        print(f"[ERROR] get_ec2_instance_details: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def list_ec2_amis():
    """Return safe, current AMI IDs for a region (via EC2 DescribeImages)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "us-east-1").strip()

    try:
        ec2 = __ec2_client(creds, region)

        def latest_image(owner, name_pattern, label):
            resp = ec2.describe_images(
                Owners=[owner],
                Filters=[
                    {"Name": "name", "Values": [name_pattern]},
                    {"Name": "state", "Values": ["available"]},
                    {"Name": "architecture", "Values": ["x86_64"]},
                    {"Name": "root-device-type", "Values": ["ebs"]},
                    {"Name": "virtualization-type", "Values": ["hvm"]},
                ],
            )
            images = resp.get("Images", [])
            if not images:
                return None
            images.sort(key=lambda x: x.get("CreationDate", ""), reverse=True)
            img = images[0]
            return {
                "label": label,
                "imageId": img.get("ImageId"),
                "name": img.get("Name"),
                "creationDate": img.get("CreationDate"),
            }

        # Owner IDs / aliases:
        # - Amazon Linux: owner alias "amazon"
        # - Ubuntu: Canonical owner ID 099720109477
        candidates = [
            latest_image("amazon", "al2023-ami-*-kernel-*-x86_64", "Amazon Linux 2023 (x86_64)"),
            latest_image("amazon", "amzn2-ami-hvm-*-x86_64-gp2", "Amazon Linux 2 (x86_64)"),
            latest_image("099720109477", "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*", "Ubuntu 22.04 LTS (amd64)"),
            latest_image("099720109477", "ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*", "Ubuntu 20.04 LTS (amd64)"),
        ]
        amis = [c for c in candidates if c and c.get("imageId")]
        return jsonify({"value": amis, "region": region}), 200
    except Exception as e:
        print(f"[ERROR] list_ec2_amis: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def list_ec2_instance_types():
    """List EC2 instance types (optionally only Free Tier eligible) for a region."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "us-east-1").strip()
    free_tier_only = (request.args.get("freeTierOnly") or "true").lower() in ("1", "true", "yes", "y")

    try:
        ec2 = __ec2_client(creds, region)
        paginator = ec2.get_paginator("describe_instance_types")
        paginate_kwargs = {}
        if free_tier_only:
            paginate_kwargs["Filters"] = [{"Name": "free-tier-eligible", "Values": ["true"]}]

        types_out = []
        for page in paginator.paginate(**paginate_kwargs):
            for it in page.get("InstanceTypes", []):
                types_out.append({
                    "instanceType": it.get("InstanceType"),
                    "freeTierEligible": it.get("FreeTierEligible"),
                    "currentGeneration": it.get("CurrentGeneration"),
                    "supportedUsageClasses": it.get("SupportedUsageClasses", []),
                })

        # Sort with most common, smallest first-ish (t2.micro etc) by name
        types_out = [t for t in types_out if t.get("instanceType")]
        types_out.sort(key=lambda x: x["instanceType"])
        return jsonify({"value": types_out, "region": region, "freeTierOnly": free_tier_only}), 200
    except Exception as e:
        print(f"[ERROR] list_ec2_instance_types: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


MCM_EC2_SSM_ROLE_NAME = "MCM-EC2-SSM-CW"
MCM_EC2_SSM_PROFILE_NAME = "MCM-EC2-SSM-CW"
_SSM_MANAGED_POLICY_ARN = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
_CW_AGENT_POLICY_ARN = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"


def _sts_client(creds):
    import boto3
    return boto3.client(
        "sts",
        region_name="us-east-1",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _iam_client(creds):
    import boto3
    return boto3.client(
        "iam",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _ec2_ssm_bootstrap_user_data() -> str:
    """Base64-encoded user data: install/enable SSM Agent (Amazon Linux + Ubuntu)."""
    script = r"""#!/bin/bash
exec > >(tee /var/log/mcm-ssm-bootstrap.log) 2>&1
set -euo pipefail
if [[ -f /etc/os-release ]]; then . /etc/os-release; fi
bootstrap_amzn() {
  if command -v dnf &>/dev/null; then
    dnf install -y amazon-ssm-agent 2>/dev/null || true
  elif command -v yum &>/dev/null; then
    yum install -y amazon-ssm-agent 2>/dev/null || true
  fi
  systemctl enable amazon-ssm-agent 2>/dev/null || true
  systemctl restart amazon-ssm-agent 2>/dev/null || true
}
bootstrap_ubuntu() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y wget
  wget -q https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/debian_amd64/amazon-ssm-agent.deb -O /tmp/ssm.deb
  dpkg -i /tmp/ssm.deb || apt-get -f install -y
  systemctl enable amazon-ssm-agent 2>/dev/null || true
  systemctl restart amazon-ssm-agent 2>/dev/null || true
}
case "${ID:-}" in
  amzn) bootstrap_amzn ;;
  ubuntu) bootstrap_ubuntu ;;
  *)
    if systemctl list-unit-files 2>/dev/null | grep -q amazon-ssm-agent; then
      systemctl enable amazon-ssm-agent 2>/dev/null || true
      systemctl restart amazon-ssm-agent 2>/dev/null || true
    fi
    ;;
esac
"""
    return base64.b64encode(script.encode("utf-8")).decode("ascii")


def _ensure_ec2_ssm_instance_profile(creds: dict) -> str:
    """
    Tworzy lub używa istniejącego profilu instancji z rolami SSM + CloudWatch Agent.
    Wymaga m.in. iam:CreateRole, iam:CreateInstanceProfile, iam:PassRole przy RunInstances.
    """
    _sts_client(creds).get_caller_identity()
    iam = _iam_client(creds)
    trust = json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"Service": "ec2.amazonaws.com"},
                    "Action": "sts:AssumeRole",
                }
            ],
        }
    )

    try:
        iam.create_role(
            RoleName=MCM_EC2_SSM_ROLE_NAME,
            AssumeRolePolicyDocument=trust,
            Description="multi-cloud-manager: EC2 SSM + CloudWatch Agent",
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "EntityAlreadyExists":
            raise

    for policy_arn in (_SSM_MANAGED_POLICY_ARN, _CW_AGENT_POLICY_ARN):
        try:
            iam.attach_role_policy(RoleName=MCM_EC2_SSM_ROLE_NAME, PolicyArn=policy_arn)
        except Exception:
            pass

    try:
        iam.create_instance_profile(InstanceProfileName=MCM_EC2_SSM_PROFILE_NAME)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "EntityAlreadyExists":
            raise

    try:
        iam.add_role_to_instance_profile(
            InstanceProfileName=MCM_EC2_SSM_PROFILE_NAME,
            RoleName=MCM_EC2_SSM_ROLE_NAME,
        )
    except ClientError as e:
        err = e.response.get("Error", {}) or {}
        code = err.get("Code", "")
        msg = (err.get("Message") or "").lower()
        if code not in ("LimitExceeded", "EntityAlreadyExists") and "already" not in msg and "cannot exceed" not in msg:
            raise

    time.sleep(8)
    return MCM_EC2_SSM_PROFILE_NAME


def attach_ec2_ssm_profile(instance_id: str):
    """
    Dołącza profil IAM (SSM + CloudWatch Agent) do instancji bez profilu.
    Działa tylko gdy instancja nie ma jeszcze żadnego profilu IAM.
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    region = (data.get("region") or request.args.get("region") or "").strip()

    if region:
        ec2_lookup = __ec2_client(creds, region)
        try:
            resp = ec2_lookup.describe_instances(InstanceIds=[instance_id])
        except Exception:
            return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionie {region}."}), 404
        inst = None
        for reservation in resp.get("Reservations", []):
            for i in reservation.get("Instances", []):
                inst = i
                break
            if inst:
                break
        if not inst:
            return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionie {region}."}), 404
    else:
        region, inst = _find_instance_region(instance_id, creds)
        if not region or not inst:
            return jsonify({"error": f"Nie znaleziono instancji '{instance_id}'."}), 404

    if inst.get("IamInstanceProfile"):
        return jsonify({
            "error": "Instancja ma już przypisany profil IAM. Nadaj roli tego profilu politykę AmazonSSMManagedInstanceCore lub zmień profil w konsoli AWS.",
            "iamInstanceProfileArn": (inst.get("IamInstanceProfile") or {}).get("Arn"),
        }), 400

    try:
        profile_name = _ensure_ec2_ssm_instance_profile(creds)
    except Exception as e:
        return jsonify({
            "error": "Nie udało się utworzyć lub odczytać profilu IAM dla SSM.",
            "details": str(e),
        }), 400

    try:
        ec2 = __ec2_client(creds, region)
        ec2.associate_iam_instance_profile(
            InstanceId=instance_id,
            IamInstanceProfile={"Name": profile_name},
        )
    except Exception as e:
        print(f"[ERROR] attach_ec2_ssm_profile: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "message": "Dołączono profil IAM (SSM + CloudWatch Agent). Odczekaj 1–3 min i odśwież status agenta.",
        "instanceId": instance_id,
        "iamInstanceProfileName": profile_name,
        "region": region,
        "hint": "Na Ubuntu bez zainstalowanego agenta SSM zrób instalację po SSH (pakiet .deb z dokumentacji AWS) lub utwórz nową instancję z tej aplikacji.",
    }), 200


def create_ec2_instance():
    """Create an EC2 instance. POST body: instanceName, instanceType, imageId, region (optional), skipSsmBootstrap (optional)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "Brak danych w ciele żądania."}), 400

    instance_name = (data.get("instanceName") or data.get("vmName") or "").strip()
    instance_type = data.get("instanceType", "t2.micro")
    image_id = data.get("imageId")
    region = data.get("region", "us-east-1")
    skip_ssm_bootstrap = bool(data.get("skipSsmBootstrap") or data.get("skip_ssm_bootstrap"))

    if not instance_name:
        return jsonify({"error": "Pole 'instanceName' jest wymagane."}), 400
    if not image_id:
        return jsonify({"error": "Pole 'imageId' (AMI) jest wymagane."}), 400

    try:
        ec2 = __ec2_client(creds, region)
        params = {
            "ImageId": image_id,
            "InstanceType": instance_type,
            "MinCount": 1,
            "MaxCount": 1,
            "TagSpecifications": [
                {
                    "ResourceType": "instance",
                    "Tags": [{"Key": "Name", "Value": instance_name}],
                }
            ],
        }

        profile_name = None
        if not skip_ssm_bootstrap:
            try:
                profile_name = _ensure_ec2_ssm_instance_profile(creds)
            except Exception as e:
                return jsonify({
                    "error": "Nie udało się przygotować profilu IAM dla SSM (potrzebne m.in. iam:CreateRole, iam:CreateInstanceProfile, iam:PassRole dla roli MCM-EC2-SSM-CW).",
                    "details": str(e),
                }), 400
            params["IamInstanceProfile"] = {"Name": profile_name}
            params["UserData"] = _ec2_ssm_bootstrap_user_data()

        response = None
        for attempt in range(5):
            try:
                response = ec2.run_instances(**params)
                break
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ("InvalidIamInstanceProfile.NotFound", "InvalidIamInstanceProfile") and attempt < 4:
                    time.sleep(6)
                    continue
                raise

        instances = (response or {}).get("Instances", [])
        if not instances:
            return jsonify({"error": "RunInstances nie zwróciło żadnej instancji."}), 500
        instance_id = instances[0]["InstanceId"]
        return jsonify({
            "message": f"Instancja EC2 '{instance_name}' została utworzona (ID: {instance_id}).",
            "instanceId": instance_id,
            "name": instance_name,
            "iamInstanceProfileName": profile_name,
            "ssmBootstrapUserData": bool(profile_name),
        }), 201
    except Exception as e:
        # Provide a friendlier message for common misconfiguration
        msg = str(e)
        if "InvalidParameterCombination" in msg and "Free Tier" in msg:
            return jsonify({"error": "Wybrany typ instancji nie jest Free Tier eligible. Wybierz typ z listy Free Tier (np. t2.micro) lub zmień konto/ustawienia."}), 400
        print(f"[ERROR] create_ec2_instance: {e}\n{traceback.format_exc()}")
        return jsonify({"error": msg}), 500


def _find_instance_region(instance_id: str, creds: dict):
    """Search across enabled regions to find the region that contains instance_id."""
    base = __ec2_client(creds, "us-east-1")
    regions_resp = base.describe_regions(AllRegions=False)
    regions = [r["RegionName"] for r in regions_resp.get("Regions", []) if r.get("RegionName")]

    for region in regions:
        ec2 = __ec2_client(creds, region)
        try:
            resp = ec2.describe_instances(InstanceIds=[instance_id])
        except Exception:
            continue

        for reservation in resp.get("Reservations", []):
            for inst in reservation.get("Instances", []):
                return region, inst
    return None, None


def start_ec2_instance(instance_id: str):
    """Start EC2 instance (searches region if not provided)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    region = (data.get("region") or request.args.get("region") or "").strip()
    if not region:
        region, _ = _find_instance_region(instance_id, creds)
    if not region:
        return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionach."}), 404

    try:
        ec2 = __ec2_client(creds, region)
        ec2.start_instances(InstanceIds=[instance_id])
        return jsonify({"message": f"Instancja '{instance_id}' uruchomiona.", "region": region}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] start_ec2_instance: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def stop_ec2_instance(instance_id: str):
    """Stop EC2 instance (searches region if not provided)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    region = (data.get("region") or request.args.get("region") or "").strip()
    if not region:
        region, _ = _find_instance_region(instance_id, creds)
    if not region:
        return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionach."}), 404

    try:
        ec2 = __ec2_client(creds, region)
        ec2.stop_instances(InstanceIds=[instance_id])
        return jsonify({"message": f"Instancja '{instance_id}' zatrzymana.", "region": region}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] stop_ec2_instance: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def terminate_ec2_instance(instance_id: str):
    """Terminate EC2 instance (searches region if not provided)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    # For DELETE we may not have JSON body (frontend sends no body).
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    region = (data.get("region") or request.args.get("region") or "").strip()
    if not region:
        region, _ = _find_instance_region(instance_id, creds)
    if not region:
        return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionach."}), 404

    try:
        ec2 = __ec2_client(creds, region)
        ec2.terminate_instances(InstanceIds=[instance_id])
        return jsonify({"message": f"Instancja '{instance_id}' usunięta (terminate).", "region": region}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] terminate_ec2_instance: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def rename_ec2_instance(instance_id: str):
    """Rename EC2 instance by updating the Name tag."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    region = (data.get("region") or request.args.get("region") or "").strip()
    new_name = (data.get("newName") or data.get("instanceName") or "").strip()

    if not new_name:
        return jsonify({"error": "Pole 'newName' jest wymagane."}), 400

    if not region:
        region, _ = _find_instance_region(instance_id, creds)
    if not region:
        return jsonify({"error": f"Nie znaleziono instancji '{instance_id}' w regionach."}), 404

    try:
        ec2 = __ec2_client(creds, region)
        ec2.create_tags(Resources=[instance_id], Tags=[{"Key": "Name", "Value": new_name}])
        return jsonify({"message": f"Nazwa instancji zaktualizowana.", "region": region, "instanceId": instance_id}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] rename_ec2_instance: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def __ec2_client(creds, region):
    import boto3
    return boto3.client(
        "ec2",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )
