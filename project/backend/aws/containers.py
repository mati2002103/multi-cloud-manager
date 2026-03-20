from flask import jsonify, request
import traceback
from datetime import datetime, timedelta
import re

from .utils import get_aws_credentials


def _ecs_client(region: str, creds: dict):
    import boto3

    return boto3.client(
        "ecs",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _ec2_client(region: str, creds: dict):
    import boto3

    return boto3.client(
        "ec2",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _logs_client(region: str, creds: dict):
    import boto3

    return boto3.client(
        "logs",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _cw_client(region: str, creds: dict):
    import boto3

    return boto3.client(
        "cloudwatch",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def _ecs_sanitize_name(name: str, default_value: str) -> str:
    """
    ECS family/service/container names are strict about allowed characters.
    We keep it simple: [a-zA-Z0-9-_] with lowercase and collapse invalid chars into '-'.
    """
    name = (name or "").strip()
    safe = re.sub(r"[^a-zA-Z0-9\-_]+", "-", name).strip("-").lower()
    safe = safe[:255]
    return safe if safe else default_value


def _ensure_ecs_task_execution_role(creds: dict, region: str, role_base_name: str) -> str:
    """
    If the user doesn't provide an execution role ARN, create (or reuse) a role
    with the standard AWS-managed policy for ECS task execution.
    """
    """
    Avoids iam:GetRole because the assumed role often lacks iam:GetRole permission.
    We create-or-ensure the role and construct ARN using sts:GetCallerIdentity.
    """
    import boto3
    import json
    from botocore.exceptions import ClientError

    sts = boto3.client(
        "sts",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )
    ident = sts.get_caller_identity()
    account_id = ident.get("Account")

    role_name = _ecs_sanitize_name(role_base_name, "ecs-task-execution-role")[:64]
    role_arn = f"arn:aws:iam::{account_id}:role/{role_name}"

    iam = boto3.client(
        "iam",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )

    # ECS managed policy:
    managed_policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }
        ],
    }

    created = False
    try:
        resp = iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Auto-created by multi-cloud-manager for ECS task execution.",
        )
        created = True
        role_arn = resp.get("Role", {}).get("Arn", role_arn)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        # If already exists, we can still return ARN and continue.
        if code not in ("EntityAlreadyExists", "EntityAlreadyExistsException"):
            # If it's an AccessDenied, it's probably still okay to return ARN.
            # ECS will fail later if the role is truly unusable.
            pass

    # Best-effort attach managed policy (ignore if already attached / access denied).
    try:
        iam.attach_role_policy(RoleName=role_name, PolicyArn=managed_policy_arn)
    except Exception:
        pass

    if not role_arn:
        raise RuntimeError("Nie udało się wyznaczyć ARN execution role.")
    return role_arn


def _choose_available_vpc_cidr(ec2, candidates):
    existing = set()
    resp = ec2.describe_vpcs()
    for v in resp.get("Vpcs", []):
        cidr = v.get("CidrBlock")
        if cidr:
            existing.add(cidr)
    for cidr in candidates:
        if cidr not in existing:
            return cidr
    # Fallback: return first candidate even if it conflicts (AWS will throw).
    return candidates[0] if candidates else "10.0.0.0/16"


def _cidr_for_subnet_from_vpc(vpc_cidr_block: str, subnet_octet3: int = 1):
    """
    Very simple conversion for typical VPC /16 -> subnet /24.
    Example: 10.0.0.0/16 -> 10.0.1.0/24
    """
    if not vpc_cidr_block or "/" not in vpc_cidr_block:
        return "10.0.1.0/24"
    ip, mask = vpc_cidr_block.split("/", 1)
    octets = ip.split(".")
    if len(octets) < 2:
        return "10.0.1.0/24"
    if len(octets) < 4:
        octets = (octets + ["0", "0", "0"])[:4]
    # Use first two octets from VPC and set third octet.
    o1, o2 = octets[0], octets[1]
    return f"{o1}.{o2}.{subnet_octet3}.0/24"


def _choose_availability_zone(ec2):
    azs = ec2.describe_availability_zones(
        Filters=[{"Name": "state", "Values": ["available"]}]
    ).get("AvailabilityZones", [])
    for az in azs:
        name = az.get("ZoneName")
        if name:
            return name
    # Fallback to common pattern.
    return None


def _ensure_internet_gateway_and_route(ec2, vpc_id: str, subnet_id: str):
    # Create IGW
    igw_resp = ec2.create_internet_gateway()
    igw_id = igw_resp.get("InternetGateway", {}).get("InternetGatewayId")
    if not igw_id:
        raise RuntimeError("Nie udało się utworzyć InternetGatewayId.")

    # Attach IGW to VPC (best-effort)
    try:
        ec2.attach_internet_gateway(InternetGatewayId=igw_id, VpcId=vpc_id)
    except Exception:
        pass

    # Route table with default route to IGW
    rt_resp = ec2.create_route_table(VpcId=vpc_id)
    route_table_id = rt_resp.get("RouteTable", {}).get("RouteTableId")
    if not route_table_id:
        raise RuntimeError("Nie udało się utworzyć route table.")

    ec2.create_route(
        RouteTableId=route_table_id,
        DestinationCidrBlock="0.0.0.0/0",
        GatewayId=igw_id,
    )
    ec2.associate_route_table(RouteTableId=route_table_id, SubnetId=subnet_id)



def list_ecs_services():
    """List ECS services across enabled regions for active AWS session account."""
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
            ecs = _ecs_client(region, creds)

            # List clusters
            cluster_arns = []
            next_token = None
            while True:
                resp = ecs.list_clusters(nextToken=next_token) if next_token else ecs.list_clusters()
                cluster_arns.extend(resp.get("clusterArns", []))
                next_token = resp.get("nextToken")
                if not next_token:
                    break

            for cluster_arn in cluster_arns:
                cluster_name = cluster_arn.split("/")[-1]

                service_arns = []
                next_token_svc = None
                while True:
                    resp = (
                        ecs.list_services(cluster=cluster_arn, nextToken=next_token_svc)
                        if next_token_svc
                        else ecs.list_services(cluster=cluster_arn)
                    )
                    service_arns.extend(resp.get("serviceArns", []))
                    next_token_svc = resp.get("nextToken")
                    if not next_token_svc:
                        break

                if not service_arns:
                    continue

                # describe_services accepts up to 10 services per call
                for i in range(0, len(service_arns), 10):
                    chunk = service_arns[i : i + 10]
                    desc = ecs.describe_services(cluster=cluster_arn, services=chunk)
                    for svc in desc.get("services", []):
                        out.append({
                            "region": region,
                            "clusterName": cluster_name,
                            "serviceName": svc.get("serviceName"),
                            "status": svc.get("status"),
                            "desiredCount": svc.get("desiredCount"),
                            "runningCount": svc.get("runningCount"),
                            "taskDefinition": (svc.get("taskDefinition") or "").split("/")[-1],
                        })

        return jsonify({"value": out}), 200
    except Exception as e:
        print(f"[ERROR] list_ecs_services: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_ecs_service():
    """
    Create ECS Fargate service.
    POST body:
      - region (required)
      - clusterName (optional, default: multi-cloud-manager-ecs)
      - serviceName (required)
      - containerName (optional, default: serviceName)
      - containerImage (required)
      - containerPort (required, e.g. 80)
      - desiredCount (optional, default 1)
      - taskCpu (optional, default 256)
      - taskMemory (optional, default 512)
      - vpcId (required)
      - subnetIds (required array)
      - executionRoleArn (required)
      - taskRoleArn (optional)
      - assignPublicIp (optional, default true)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip()
    cluster_name = (data.get("clusterName") or "multi-cloud-manager-ecs").strip()
    service_name = (data.get("serviceName") or "").strip()
    container_name = (data.get("containerName") or service_name).strip()
    container_image = (data.get("containerImage") or "").strip()
    container_port = int(data.get("containerPort", 80))
    desired_count = int(data.get("desiredCount", 1))
    task_cpu = str(data.get("taskCpu", "256"))
    task_memory = str(data.get("taskMemory", "512"))
    vpc_id = (data.get("vpcId") or "").strip()
    subnet_ids = data.get("subnetIds") or []
    execution_role_arn = (data.get("executionRoleArn") or "").strip()
    task_role_arn = (data.get("taskRoleArn") or "").strip() or None
    assign_public_ip = str(data.get("assignPublicIp", "true")).lower() in ("1", "true", "yes", "y")

    if not region:
        return jsonify({"error": "Brak 'region'."}), 400
    if not service_name:
        return jsonify({"error": "Brak 'serviceName'."}), 400
    if not container_image:
        return jsonify({"error": "Brak 'containerImage'."}), 400
    if subnet_ids and not isinstance(subnet_ids, list):
        return jsonify({"error": "Pole 'subnetIds' musi być listą."}), 400

    # Sanitize names to avoid ECS validation errors (family/service/etc).
    cluster_name_safe = _ecs_sanitize_name(cluster_name, "multi-cloud-manager-ecs")
    service_name_safe = _ecs_sanitize_name(service_name, "ecs-service")
    container_name_safe = _ecs_sanitize_name(container_name, service_name_safe)

    # If user didn't provide execution role ARN, auto-create/reuse one.
    if not execution_role_arn:
        try:
            execution_role_arn = _ensure_ecs_task_execution_role(creds, region, service_name_safe + "-execution")
        except Exception as e:
            return jsonify({"error": f"Nie udało się auto-utworzyć executionRoleArn: {str(e)}"}), 400

    ecs = _ecs_client(region, creds)
    ec2 = _ec2_client(region, creds)
    logs = _logs_client(region, creds)

    # Create cluster if needed
    try:
        ecs.create_cluster(clusterName=cluster_name_safe)
    except Exception:
        # Ignore already-exists / describe exceptions.
        pass

    try:
        # Security group (open containerPort ingress)
        from botocore.exceptions import ClientError

        # Auto-create network if missing.
        # Goal: make ECS creation "one click" even if user didn't pick VPC/subnets.
        if not vpc_id or not subnet_ids:
            # If subnetIds were provided without vpcId, infer vpcId from first subnet.
            if not vpc_id and subnet_ids:
                sn_resp = ec2.describe_subnets(SubnetIds=subnet_ids)
                sn0 = (sn_resp.get("Subnets", []) or [None])[0]
                if sn0:
                    vpc_id = sn0.get("VpcId") or vpc_id

            # Create VPC if still missing.
            if not vpc_id:
                candidates = ["10.0.0.0/16", "172.31.0.0/16", "192.168.0.0/16"]
                cidr_choice = _choose_available_vpc_cidr(ec2, candidates)
                vpc_resp = ec2.create_vpc(
                    CidrBlock=cidr_choice,
                    TagSpecifications=[
                        {
                            "ResourceType": "vpc",
                            "Tags": [{"Key": "Name", "Value": f"ecs-auto-vpc-{cluster_name_safe}"}],
                        }
                    ],
                )
                vpc_id = vpc_resp.get("Vpc", {}).get("VpcId")
                if not vpc_id:
                    return jsonify({"error": "Nie udało się utworzyć VPC."}), 400

                # Enable DNS for better awsvpc usability.
                try:
                    ec2.modify_vpc_attribute(
                        VpcId=vpc_id, EnableDnsSupport={"Value": True}
                    )
                    ec2.modify_vpc_attribute(
                        VpcId=vpc_id, EnableDnsHostnames={"Value": True}
                    )
                except Exception:
                    pass

            # Create at least one public subnet if missing.
            if not subnet_ids:
                vpc_desc = ec2.describe_vpcs(VpcIds=[vpc_id])
                vpc0 = (vpc_desc.get("Vpcs", []) or [None])[0]
                vpc_cidr = vpc0.get("CidrBlock") if vpc0 else None
                subnet_cidr = _cidr_for_subnet_from_vpc(vpc_cidr) if vpc_cidr else "10.0.1.0/24"
                az = _choose_availability_zone(ec2) or "us-east-1a"

                sn_resp = ec2.create_subnet(
                    VpcId=vpc_id,
                    CidrBlock=subnet_cidr,
                    AvailabilityZone=az,
                    TagSpecifications=[
                        {
                            "ResourceType": "subnet",
                            "Tags": [{"Key": "Name", "Value": f"ecs-auto-subnet-{cluster_name_safe}"}],
                        }
                    ],
                )
                subnet_id = sn_resp.get("Subnet", {}).get("SubnetId")
                if not subnet_id:
                    return jsonify({"error": "Nie udało się utworzyć subnetu."}), 400

                # Make it public-ish for Fargate if desired.
                try:
                    ec2.modify_subnet_attribute(
                        SubnetId=subnet_id,
                        MapPublicIpOnLaunch={"Value": bool(assign_public_ip)},
                    )
                except Exception:
                    pass

                # Ensure outbound internet route for image pulls.
                try:
                    _ensure_internet_gateway_and_route(ec2, vpc_id, subnet_id)
                except Exception:
                    # If route creation fails, ECS may still fail later; keep error details.
                    pass

                subnet_ids = [subnet_id]

        # Best-effort: if user wants public IP, ensure subnet attribute is set.
        if assign_public_ip and isinstance(subnet_ids, list) and subnet_ids:
            for sid in subnet_ids:
                try:
                    ec2.modify_subnet_attribute(
                        SubnetId=sid,
                        MapPublicIpOnLaunch={"Value": True},
                    )
                except Exception:
                    pass

        sg_name = _ecs_sanitize_name(service_name_safe + "-sg", f"{service_name_safe}-sg")[:255]
        sg_id = None
        try:
            sg_resp = ec2.create_security_group(
                GroupName=sg_name,
                Description=f"SG for ECS service {service_name_safe}",
                VpcId=vpc_id,
            )
            sg_id = sg_resp.get("GroupId")
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code != "InvalidGroup.Duplicate":
                raise

            # Reuse existing SG.
            groups_resp = ec2.describe_security_groups(
                Filters=[
                    {"Name": "group-name", "Values": [sg_name]},
                    {"Name": "vpc-id", "Values": [vpc_id]},
                ]
            )
            groups = groups_resp.get("SecurityGroups", [])
            if groups:
                sg_id = groups[0].get("GroupId")

        if not sg_id:
            return jsonify({"error": "Nie udało się utworzyć ani znaleźć Security Group."}), 500

        try:
            ec2.authorize_security_group_ingress(
                GroupId=sg_id,
                IpPermissions=[{
                    "IpProtocol": "tcp",
                    "FromPort": container_port,
                    "ToPort": container_port,
                    "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
                }],
            )
        except Exception:
            pass

        # Ensure log group exists
        log_group = f"/ecs/{service_name_safe}"
        try:
            logs.create_log_group(logGroupName=log_group)
        except Exception:
            pass

        family = f"{service_name_safe}-task"
        container_def = {
            "name": container_name_safe,
            "image": container_image,
            "essential": True,
            "portMappings": [{
                "containerPort": container_port,
                "protocol": "tcp",
            }],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group": log_group,
                    "awslogs-region": region,
                    "awslogs-stream-prefix": service_name_safe,
                },
            },
        }

        ecs = _ecs_client(region, creds)  # re-create to ensure consistent
        register_kwargs = {
            "family": family,
            "requiresCompatibilities": ["FARGATE"],
            "networkMode": "awsvpc",
            "cpu": task_cpu,
            "memory": task_memory,
            "executionRoleArn": execution_role_arn,
            "containerDefinitions": [container_def],
        }
        if task_role_arn:
            register_kwargs["taskRoleArn"] = task_role_arn

        td_resp = ecs.register_task_definition(**register_kwargs)
        task_def_arn = td_resp.get("taskDefinition", {}).get("taskDefinitionArn")
        if not task_def_arn:
            return jsonify({"error": "Nie udało się zarejestrować task definition."}), 500

        service_resp = ecs.create_service(
            cluster=cluster_name_safe,
            serviceName=service_name_safe,
            taskDefinition=task_def_arn,
            desiredCount=desired_count,
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": subnet_ids,
                    "securityGroups": [sg_id],
                    "assignPublicIp": "ENABLED" if assign_public_ip else "DISABLED",
                }
            },
        )

        return jsonify({
            "message": f"ECS service '{service_name_safe}' utworzony.",
            "serviceArn": service_resp.get("service", {}).get("serviceArn"),
            "clusterName": cluster_name_safe,
            "region": region,
            "logGroup": log_group,
        }), 201
    except Exception as e:
        print(f"[ERROR] create_ecs_service: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 400


def delete_ecs_service():
    """Delete ECS service. Body: region, clusterName, serviceName."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip()
    cluster_name = (data.get("clusterName") or "").strip()
    service_name = (data.get("serviceName") or "").strip()

    if not all([region, cluster_name, service_name]):
        return jsonify({"error": "Wymagane pola: region, clusterName, serviceName"}), 400

    try:
        ecs = _ecs_client(region, creds)
        ecs.delete_service(cluster=cluster_name, service=service_name, force=True)
        return jsonify({"message": f"ECS service '{service_name}' usunięty."}), 200
    except Exception as e:
        print(f"[ERROR] delete_ecs_service: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def restart_ecs_service():
    """Force new deployment. Body: region, clusterName, serviceName."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip()
    cluster_name = (data.get("clusterName") or "").strip()
    service_name = (data.get("serviceName") or "").strip()

    if not all([region, cluster_name, service_name]):
        return jsonify({"error": "Wymagane pola: region, clusterName, serviceName"}), 400

    try:
        ecs = _ecs_client(region, creds)
        ecs.update_service(cluster=cluster_name, service=service_name, forceNewDeployment=True)
        return jsonify({"message": f"ECS service '{service_name}' zrestartowany."}), 200
    except Exception as e:
        print(f"[ERROR] restart_ecs_service: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


# -------------------- Monitoring --------------------

ECS_AVAILABLE_METRICS = [
    {"type": "CPUUtilization", "displayName": "Użycie CPU", "unit": "Percent"},
    {"type": "MemoryUtilization", "displayName": "Użycie Memory", "unit": "Percent"},
    {"type": "RunningTaskCount", "displayName": "Liczba uruchomionych tasków", "unit": "Count"},
    {"type": "DesiredTaskCount", "displayName": "Docelowa liczba tasków", "unit": "Count"},
]


def get_available_ecs_metrics():
    try:
        get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"metrics": ECS_AVAILABLE_METRICS}), 200


def get_ecs_metric_data():
    """
    POST body:
      - region
      - clusterName
      - serviceName
      - metricType
      - timespanMinutes
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip()
    cluster_name = (data.get("clusterName") or "").strip()
    service_name = (data.get("serviceName") or "").strip()
    metric_name = data.get("metricType")
    timespan_minutes = int(data.get("timespanMinutes", 60))

    if not all([region, cluster_name, service_name, metric_name]):
        return jsonify({"error": "Wymagane: region, clusterName, serviceName, metricType."}), 400

    metric_info = next((m for m in ECS_AVAILABLE_METRICS if m["type"] == metric_name), None)
    unit = metric_info["unit"] if metric_info else "None"
    # Count metrics (Running/Desired tasks) behave better with Maximum.
    # Utilization metrics generally work with Average.
    stat = "Average"
    if metric_name in ("RunningTaskCount", "DesiredTaskCount"):
        stat = "Maximum"

    try:
        cw = _cw_client(region, creds)
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=timespan_minutes)
        period = max(60, (timespan_minutes * 60) // 60)

        response = cw.get_metric_data(
            MetricDataQueries=[
                {
                    "Id": "m1",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/ECS",
                            "MetricName": metric_name,
                            "Dimensions": [
                                {"Name": "ClusterName", "Value": cluster_name},
                                {"Name": "ServiceName", "Value": service_name},
                            ],
                        },
                        "Period": period,
                        "Stat": stat,
                        # Unit is optional but helps interpret.
                        "Unit": unit,
                    },
                    "ReturnData": True,
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
        )

        results = response.get("MetricDataResults", [{}])[0]
        datapoints = results.get("Values", []) or []
        timestamps = results.get("Timestamps", []) or []

        out = []
        for ts, val in zip(timestamps, datapoints):
            if val is None:
                continue
            out.append({"timestamp": ts.isoformat(), "average": round(float(val), 4)})
        out.sort(key=lambda x: x["timestamp"])
        return jsonify({"data": out}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] get_ecs_metric_data: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def list_ecs_log_groups():
    """List CloudWatch Logs groups for an ECS service (prefix /ecs/<serviceName>)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "").strip() or "us-east-1"
    service_name = (request.args.get("serviceName") or "").strip()
    if not service_name:
        return jsonify({"error": "Brak 'serviceName'."}), 400

    try:
        logs = _logs_client(region, creds)
        prefix = f"/ecs/{service_name}"
        groups = []

        paginator = logs.get_paginator("describe_log_groups")
        for page in paginator.paginate():
            for g in page.get("logGroups", []):
                name = g.get("logGroupName")
                if name and name.startswith(prefix):
                    groups.append({"logGroupName": name, "storedBytes": g.get("storedBytes", 0)})

        # If nothing found, try to create the expected log group once.
        if not groups:
            try:
                logs.create_log_group(logGroupName=prefix)
                groups = [{"logGroupName": prefix, "storedBytes": 0}]
            except Exception:
                pass

        return jsonify({"value": groups}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] list_ecs_log_groups: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def query_ecs_logs():
    """
    POST body:
      - region
      - logGroupName
      - filterPattern (optional)
      - startTimeMinutes (optional)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}

    region = (data.get("region") or "").strip() or "us-east-1"
    log_group_name = (data.get("logGroupName") or "").strip()
    filter_pattern = data.get("filterPattern", "")
    if filter_pattern is None:
        filter_pattern = ""
    filter_pattern = str(filter_pattern).strip()
    if filter_pattern in ('""', "''"):
        filter_pattern = ""
    # If wrapped in quotes, drop outer quotes (common UI input mistake).
    if len(filter_pattern) >= 2 and (
        (filter_pattern[0] == '"' and filter_pattern[-1] == '"')
        or (filter_pattern[0] == "'" and filter_pattern[-1] == "'")
    ):
        inner = filter_pattern[1:-1].strip()
        filter_pattern = inner

    try:
        start_time_minutes = int(data.get("startTimeMinutes", 60))
    except Exception:
        start_time_minutes = 60

    if not log_group_name:
        return jsonify({"error": "Brak 'logGroupName'."}), 400

    try:
        logs = _logs_client(region, creds)
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=start_time_minutes)
        start_ts = int(start_time.timestamp() * 1000)
        end_ts = int(end_time.timestamp() * 1000)

        kwargs = {
            "logGroupName": log_group_name,
            "startTime": start_ts,
            "endTime": end_ts,
            "limit": 100,
        }
        if filter_pattern:
            kwargs["filterPattern"] = filter_pattern

        try:
            response = logs.filter_log_events(**kwargs)
            events = response.get("events", []) or []
            if not isinstance(events, list):
                events = []
        except Exception as e:
            # If log group was missing, try to create it once.
            try:
                logs.create_log_group(logGroupName=log_group_name)
            except Exception:
                pass
            # Retry after best-effort creation.
            response = logs.filter_log_events(**kwargs)
            events = response.get("events", []) or []
            if not isinstance(events, list):
                events = []

        columns = ["timestamp", "message", "logStreamName"]
        rows = []
        for evt in events:
            if not isinstance(evt, dict):
                continue
            ts_ms = evt.get("timestamp")
            dt = (
                datetime.utcfromtimestamp(ts_ms / 1000.0).isoformat() + "Z"
                if ts_ms
                else ""
            )
            rows.append([dt, evt.get("message", ""), evt.get("logStreamName", "")])

        return jsonify({"columns": columns, "rows": rows}), 200
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[ERROR] query_ecs_logs: {e}\n{tb}")
        return jsonify({"error": str(e), "details": tb[-1500:]}), 500


def list_ecs_alerts():
    """
    List CloudWatch alarms for ECS service.
    Query params: region, clusterName, serviceName
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "").strip() or "us-east-1"
    cluster_name = (request.args.get("clusterName") or "").strip()
    service_name = (request.args.get("serviceName") or "").strip()

    if not cluster_name or not service_name:
        return jsonify({"error": "Wymagane: clusterName i serviceName."}), 400

    prefix = f"ecs-{cluster_name}-{service_name}-"

    try:
        import boto3
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )

        alarms = []
        next_token = None
        while True:
            kwargs = {"AlarmNamePrefix": prefix, "MaxRecords": 100}
            if next_token:
                kwargs["NextToken"] = next_token
            resp = cw.describe_alarms(**kwargs)
            for a in resp.get("MetricAlarms", []):
                alarms.append({
                    "name": a.get("AlarmName"),
                    "displayName": a.get("AlarmName"),
                    "description": a.get("AlarmDescription"),
                    "enabled": a.get("ActionsEnabled", True),
                    "state": a.get("StateValue"),
                    "metricType": a.get("MetricName"),
                })
            next_token = resp.get("NextToken")
            if not next_token:
                break

        return jsonify({"value": alarms}), 200
    except Exception as e:
        print(f"[ERROR] list_ecs_alerts: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_ecs_alert():
    """
    Create CloudWatch alarm for ECS service.
    POST body:
      - region
      - clusterName
      - serviceName
      - alertName (optional)
      - metricType (must be in ECS_AVAILABLE_METRICS[].type)
      - threshold
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or "").strip() or "us-east-1"
    cluster_name = (data.get("clusterName") or "").strip()
    service_name = (data.get("serviceName") or "").strip()
    alert_name = (data.get("alertName") or "").strip()
    metric_type = (data.get("metricType") or "").strip()
    threshold = data.get("threshold")

    if not all([cluster_name, service_name, metric_type]):
        return jsonify({"error": "Wymagane: region, clusterName, serviceName, metricType."}), 400
    try:
        threshold_val = float(threshold)
    except Exception:
        return jsonify({"error": "Pole 'threshold' musi być liczbą."}), 400

    metric_info = next((m for m in ECS_AVAILABLE_METRICS if m["type"] == metric_type), None)
    if not metric_info:
        return jsonify({"error": "Nieobsługiwana metryka dla ECS."}), 400

    prefix = f"ecs-{cluster_name}-{service_name}-"
    if not alert_name:
        alert_name = f"{prefix}{metric_type}-gt-{threshold_val}"
    elif not alert_name.startswith(prefix):
        alert_name = f"{prefix}{alert_name}"

    description = f"{metric_type} > {threshold_val} dla ECS {cluster_name}/{service_name}"

    try:
        import boto3
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        cw.put_metric_alarm(
            AlarmName=alert_name,
            AlarmDescription=description,
            Namespace="AWS/ECS",
            MetricName=metric_type,
            Dimensions=[
                {"Name": "ClusterName", "Value": cluster_name},
                {"Name": "ServiceName", "Value": service_name},
            ],
            Statistic="Average",
            Period=60,
            EvaluationPeriods=1,
            Threshold=threshold_val,
            ComparisonOperator="GreaterThanThreshold",
            TreatMissingData="notBreaching",
            ActionsEnabled=False,
            AlarmActions=[],
            OKActions=[],
        )

        return jsonify({"message": "Alarm ECS utworzony.", "name": alert_name}), 201
    except Exception as e:
        print(f"[ERROR] create_ecs_alert: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def delete_ecs_alert(alert_name):
    """
    Delete CloudWatch alarm for ECS.
    DELETE uses query param: region (required for regional alarm deletion)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "").strip() or "us-east-1"
    alarm_name = (alert_name or "").strip()

    if not alarm_name:
        return jsonify({"error": "Brak 'alert_name'."}), 400

    try:
        import boto3
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        cw.delete_alarms(AlarmNames=[alarm_name])
        return jsonify({"message": "Alarm usunięty.", "name": alarm_name}), 200
    except Exception as e:
        print(f"[ERROR] delete_ecs_alert: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

