from flask import jsonify, request, session
import traceback
from datetime import datetime

from .utils import get_aws_credentials


def _ec2_client(region: str, creds: dict):
    import boto3

    return boto3.client(
        "ec2",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def list_aws_vpcs():
    """
    List VPCs across enabled regions for the active AWS account in session.
    Returns VPCs with basic subnets for the Networks page.
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    try:
        base_ec2 = _ec2_client("us-east-1", creds)
        regions_resp = base_ec2.describe_regions(AllRegions=False)
        regions = [r["RegionName"] for r in regions_resp.get("Regions", []) if r.get("RegionName")]

        out = []
        for region in regions:
            ec2 = _ec2_client(region, creds)
            vpc_paginator = ec2.get_paginator("describe_vpcs")
            for page in vpc_paginator.paginate():
                for vpc in page.get("Vpcs", []):
                    vpc_id = vpc.get("VpcId")
                    if not vpc_id:
                        continue

                    # Filter out default VPCs (user request).
                    if vpc.get("IsDefault") is True or vpc.get("isDefault") is True:
                        continue

                    tags = vpc.get("Tags", []) or []
                    vpc_name = next((t.get("Value") for t in tags if t.get("Key") == "Name"), None)
                    cidr_block = None
                    for opt in vpc.get("CidrBlockAssociationSet", []) or []:
                        cidr_block = opt.get("CidrBlock")
                        break
                    if not cidr_block:
                        cidr_block = vpc.get("CidrBlock")

                    # Subnets in this VPC
                    subnet_resp = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])
                    subnets = []
                    for sn in subnet_resp.get("Subnets", []):
                        sn_id = sn.get("SubnetId")
                        sn_tags = sn.get("Tags", []) or []
                        sn_name = next((t.get("Value") for t in sn_tags if t.get("Key") == "Name"), None)
                        subnets.append({
                            "subnetId": sn_id,
                            "name": sn_name or sn_id,
                            "ipCidrRange": sn.get("CidrBlock"),
                            "availabilityZone": sn.get("AvailabilityZone"),
                            # Helps the frontend warn about "public" vs "private" subnet usage.
                            "mapPublicIpOnLaunch": sn.get("MapPublicIpOnLaunch"),
                        })

                    out.append({
                        "id": vpc_id,  # keep consistent with GCP UI key usage
                        "vpcId": vpc_id,
                        "name": vpc_name or vpc_id,
                        "region": region,
                        "cidrBlock": cidr_block,
                        "subnets": subnets,
                    })

        return jsonify({"value": out}), 200
    except Exception as e:
        print(f"[ERROR] list_aws_vpcs: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_aws_vpc():
    """
    Create VPC.
    POST body:
      - region (required)
      - vpcName (required)
      - cidrBlock (required) e.g. 10.0.0.0/16
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "us-east-1").strip()
    vpc_name = (data.get("vpcName") or "").strip()
    cidr_block = (data.get("cidrBlock") or "").strip()

    if not region:
        return jsonify({"error": "Brak 'region'."}), 400
    if not vpc_name:
        return jsonify({"error": "Brak 'vpcName'."}), 400
    if not cidr_block:
        return jsonify({"error": "Brak 'cidrBlock'."}), 400

    try:
        ec2 = _ec2_client(region, creds)
        resp = ec2.create_vpc(CidrBlock=cidr_block, TagSpecifications=[
            {"ResourceType": "vpc", "Tags": [{"Key": "Name", "Value": vpc_name}]}
        ])
        vpc_id = resp.get("Vpc", {}).get("VpcId")
        if not vpc_id:
            return jsonify({"error": "Nie udało się uzyskać VPC id."}), 500

        # Enable DNS support/hostnames for better usability
        try:
            ec2.modify_vpc_attribute(VpcId=vpc_id, EnableDnsSupport={"Value": True})
            ec2.modify_vpc_attribute(VpcId=vpc_id, EnableDnsHostnames={"Value": True})
        except Exception:
            pass

        return jsonify({
            "message": f"VPC '{vpc_name}' utworzone.",
            "vpcId": vpc_id,
        }), 201
    except Exception as e:
        print(f"[ERROR] create_aws_vpc: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def list_aws_subnets(vpc_id: str):
    """
    List subnets for a specific VPC.
    Query params:
      - region (required, recommended)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "us-east-1").strip()
    if not vpc_id:
        return jsonify({"error": "Brak vpcId."}), 400

    try:
        ec2 = _ec2_client(region, creds)
        resp = ec2.describe_subnets(Filters=[{"Name": "vpc-id", "Values": [vpc_id]}])
        subnets = []
        for sn in resp.get("Subnets", []):
            tags = sn.get("Tags", []) or []
            name = next((t.get("Value") for t in tags if t.get("Key") == "Name"), None)
            subnets.append({
                "subnetId": sn.get("SubnetId"),
                "name": name or sn.get("SubnetId"),
                "ipCidrRange": sn.get("CidrBlock"),
                "availabilityZone": sn.get("AvailabilityZone"),
                "mapPublicIpOnLaunch": sn.get("MapPublicIpOnLaunch"),
                "region": region,
            })
        return jsonify({"value": subnets}), 200
    except Exception as e:
        print(f"[ERROR] list_aws_subnets: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_aws_subnet(vpc_id: str):
    """
    Create subnet.
    POST body:
      - region (required)
      - subnetName (required)
      - cidrBlock (required)
      - availabilityZone (optional)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip()
    subnet_name = (data.get("subnetName") or "").strip()
    cidr_block = (data.get("cidrBlock") or "").strip()
    availability_zone = (data.get("availabilityZone") or "").strip() or None
    map_public_ip_on_launch_raw = data.get("mapPublicIpOnLaunch", False)
    map_public_ip_on_launch = (
        str(map_public_ip_on_launch_raw).lower() in ("1", "true", "yes", "y")
        if map_public_ip_on_launch_raw is not None
        else False
    )

    if not vpc_id:
        return jsonify({"error": "Brak vpcId."}), 400
    if not region:
        return jsonify({"error": "Brak 'region'."}), 400
    if not subnet_name:
        return jsonify({"error": "Brak 'subnetName'."}), 400
    if not cidr_block:
        return jsonify({"error": "Brak 'cidrBlock'."}), 400

    try:
        ec2 = _ec2_client(region, creds)

        params = {
            "VpcId": vpc_id,
            "CidrBlock": cidr_block,
            "TagSpecifications": [
                {"ResourceType": "subnet", "Tags": [{"Key": "Name", "Value": subnet_name}]}
            ],
        }
        if availability_zone:
            params["AvailabilityZone"] = availability_zone

        resp = ec2.create_subnet(**params)
        subnet_id = resp.get("Subnet", {}).get("SubnetId")
        if not subnet_id:
            return jsonify({"error": "Nie udało się uzyskać subnet id."}), 500

        # Optional: enable public IP mapping on instances started in this subnet.
        try:
            ec2.modify_subnet_attribute(
                SubnetId=subnet_id,
                MapPublicIpOnLaunch={"Value": bool(map_public_ip_on_launch)},
            )
        except Exception:
            pass

        return jsonify({
            "message": f"Subnet '{subnet_name}' utworzony.",
            "subnetId": subnet_id,
        }), 201
    except Exception as e:
        print(f"[ERROR] create_aws_subnet: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

