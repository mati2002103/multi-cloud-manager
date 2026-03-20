from flask import jsonify, request, session
from .utils import get_aws_credentials
from datetime import datetime, timedelta
import traceback


# CloudWatch EC2 metrics (namespace AWS/EC2, dimension InstanceId)
EC2_AVAILABLE_METRICS = [
    {"name": "CPUUtilization", "displayName": "Użycie CPU", "unit": "Percent"},
    {"name": "NetworkIn", "displayName": "Sieć (Odebrane)", "unit": "Bytes"},
    {"name": "NetworkOut", "displayName": "Sieć (Wysłane)", "unit": "Bytes"},
    {"name": "DiskReadBytes", "displayName": "Dysk (Odczyt)", "unit": "Bytes"},
    {"name": "DiskWriteBytes", "displayName": "Dysk (Zapis)", "unit": "Bytes"},
    {"name": "StatusCheckFailed", "displayName": "Status Check Failed", "unit": "Count"},
    {"name": "StatusCheckFailed_Instance", "displayName": "Status Check Failed (Instance)", "unit": "Count"},
    {"name": "StatusCheckFailed_System", "displayName": "Status Check Failed (System)", "unit": "Count"},
]


def _sanitize_filter_pattern(filter_pattern):
    """
    CloudWatch Logs filterPattern is picky.
    If frontend sends values like '""', AWS throws:
      InvalidParameterException: Invalid character(s) in term '""'
    """
    if filter_pattern is None:
        return ""
    s = str(filter_pattern).strip()
    if s in ('""', "''"):
        return ""
    # If expression is wrapped in quotes, drop outer quotes.
    if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
        inner = s[1:-1].strip()
        return inner
    return s


def _ssm_client(region: str, creds: dict):
    import boto3
    return boto3.client(
        "ssm",
        region_name=region,
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds.get("SessionToken"),
    )


def get_available_metrics(instance_id):
    """Return list of available CloudWatch metrics for EC2 (same shape as GCP)."""
    try:
        get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401
    metrics = [
        {"type": m["name"], "displayName": m["displayName"], "unit": m["unit"]}
        for m in EC2_AVAILABLE_METRICS
    ]
    return jsonify({"metrics": metrics}), 200


def get_metric_data(instance_id):
    """Get CloudWatch metric time series for the given instance and metric type (POST body: metricType, timespanMinutes)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    metric_name = data.get("metricType") or data.get("metricName")
    region = data.get("region") or request.args.get("region") or "us-east-1"
    timespan_minutes = int(data.get("timespanMinutes", 60))
    if not metric_name:
        return jsonify({"error": "Brak 'metricType' w ciele żądania"}), 400

    metric_info = next((m for m in EC2_AVAILABLE_METRICS if m["name"] == metric_name), None)
    unit = metric_info["unit"] if metric_info else "None"

    try:
        import boto3
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=timespan_minutes)
        period = max(60, (timespan_minutes * 60) // 60)

        response = cw.get_metric_data(
            MetricDataQueries=[
                {
                    "Id": "m1",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/EC2",
                            "MetricName": metric_name,
                            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
                        },
                        "Period": period,
                        "Stat": "Average",
                        "Unit": unit,
                    },
                    "ReturnData": True,
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
        )

        datapoints = response.get("MetricDataResults", [{}])[0].get("Values", [])
        timestamps = response.get("MetricDataResults", [{}])[0].get("Timestamps", [])
        result_data = []
        for i, ts in enumerate(timestamps):
            val = datapoints[i] if i < len(datapoints) else None
            if val is not None:
                result_data.append({
                    "timestamp": ts.isoformat(),
                    "average": round(float(val), 4),
                })
        result_data.sort(key=lambda x: x["timestamp"])
        return jsonify({"data": result_data}), 200
    except Exception as e:
        print(f"[ERROR] get_metric_data EC2: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def list_log_groups():
    """List CloudWatch Logs log groups (for dropdown in monitor UI)."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401
    region = request.args.get("region") or "us-east-1"
    # Optional: when monitoring a specific instance, create an expected log group
    # so the UI has something to pick.
    instance_id = (request.args.get("instanceId") or request.args.get("instance_id") or "").strip()
    try:
        import boto3
        logs = boto3.client(
            "logs",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        groups = []
        paginator = logs.get_paginator("describe_log_groups")
        for page in paginator.paginate():
            for g in page.get("logGroups", []):
                groups.append({"logGroupName": g["logGroupName"], "storedBytes": g.get("storedBytes", 0)})

        if instance_id:
            expected = f"/ec2/{instance_id}"
            # Best-effort create.
            try:
                logs.create_log_group(logGroupName=expected)
            except Exception:
                pass
            if not any(g.get("logGroupName") == expected for g in groups):
                groups.insert(0, {"logGroupName": expected, "storedBytes": 0})

        return jsonify({"value": groups}), 200
    except Exception as e:
        print(f"[ERROR] list_log_groups: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def query_logs(instance_id):
    """Query CloudWatch Logs: POST body { logGroupName, filterPattern?, startTimeMinutes? }.
    If logGroupName is omitted, tries common EC2 log group names. Filter pattern can include instance id."""
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    log_group_name = data.get("logGroupName")
    filter_pattern = _sanitize_filter_pattern(data.get("filterPattern", ""))
    start_time_minutes = int(data.get("startTimeMinutes", 60))
    region = data.get("region") or request.args.get("region") or "us-east-1"

    if not log_group_name:
        return jsonify({"error": "Wymagane jest 'logGroupName' w ciele żądania"}), 400

    try:
        import boto3
        logs = boto3.client(
            "logs",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
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

        response = logs.filter_log_events(**kwargs)
        events = response.get("events", [])
        columns = ["timestamp", "message", "logStreamName"]
        rows = []
        for evt in events:
            ts = evt.get("timestamp")
            dt = datetime.utcfromtimestamp(ts / 1000.0).isoformat() + "Z" if ts else ""
            rows.append([dt, evt.get("message", ""), evt.get("logStreamName", "")])
        return jsonify({"columns": columns, "rows": rows}), 200
    except Exception as e:
        print(f"[ERROR] query_logs EC2: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def get_ec2_agent_status(instance_id):
    """
    Check SSM availability and CloudWatch Agent service status on EC2.
    Query params: region (optional)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "us-east-1").strip()
    try:
        ssm = _ssm_client(region, creds)

        info_resp = ssm.describe_instance_information(
            Filters=[{"Key": "InstanceIds", "Values": [instance_id]}]
        )
        info_list = info_resp.get("InstanceInformationList", []) or []
        if not info_list:
            return jsonify({
                "ssmConnected": False,
                "agentInstalled": False,
                "status": "SSM unavailable",
                "details": "Instancja nie jest zarządzana przez SSM (brak AmazonSSMManagedInstanceCore lub agent SSM nieaktywny).",
            }), 200

        ping_status = info_list[0].get("PingStatus")
        if ping_status != "Online":
            return jsonify({
                "ssmConnected": False,
                "agentInstalled": False,
                "status": f"SSM {ping_status}",
                "details": "SSM Agent nie jest online.",
            }), 200

        command_id = None
        out = ""
        combined = ""
        try:
            cmd_resp = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={
                    "commands": [
                        "if systemctl is-active amazon-cloudwatch-agent >/dev/null 2>&1; then echo CW_AGENT_ACTIVE; "
                        "elif [ -f /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl ]; then echo CW_AGENT_INSTALLED; "
                        "else echo CW_AGENT_MISSING; fi"
                    ]
                },
                TimeoutSeconds=30,
            )
            command_id = cmd_resp["Command"]["CommandId"]

            # Best-effort immediate check.
            inv = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
            out = (inv.get("StandardOutputContent") or "").strip()
            combined = f"{out}\n{inv.get('StandardErrorContent', '')}".strip()
        except Exception as e:
            # Don't fail the whole endpoint just because we can't run a quick check.
            return jsonify({
                "ssmConnected": True,
                "agentInstalled": None,
                "status": "⚠️ SSM Online, ale brak możliwości sprawdzenia CloudWatch Agent (SendCommand/CommandInvocation).",
                "details": str(e),
            }), 200

        if "CW_AGENT_ACTIVE" in out:
            return jsonify({
                "ssmConnected": True,
                "agentInstalled": True,
                "status": "✅ CloudWatch Agent aktywny",
                "details": combined,
            }), 200
        if "CW_AGENT_INSTALLED" in out:
            return jsonify({
                "ssmConnected": True,
                "agentInstalled": True,
                "status": "⚠️ Agent zainstalowany, ale nieaktywny",
                "details": combined,
            }), 200
        return jsonify({
            "ssmConnected": True,
            "agentInstalled": False,
            "status": "❌ CloudWatch Agent brak",
            "details": combined or "Brak agenta CloudWatch.",
        }), 200
    except Exception as e:
        print(f"[ERROR] get_ec2_agent_status: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def install_ec2_agent(instance_id):
    """
    Install and configure CloudWatch Agent on EC2 using SSM.
    POST body/query params:
      - region (optional)
      - logGroupName (optional, default: /ec2/<instance_id>)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}

    region = (data.get("region") or request.args.get("region") or "us-east-1").strip()
    log_group_name = (data.get("logGroupName") or request.args.get("logGroupName") or f"/ec2/{instance_id}").strip()

    try:
        ssm = _ssm_client(region, creds)

        # Avoid sending SSM commands to instances not managed by SSM.
        info_resp = ssm.describe_instance_information(
            Filters=[{"Key": "InstanceIds", "Values": [instance_id]}]
        )
        info_list = info_resp.get("InstanceInformationList", []) or []
        if not info_list:
            return jsonify({
                "error": "Instancja nie jest zarządzana przez SSM (brak online w describe_instance_information).",
                "ssmConnected": False,
                "hint": "Upewnij się, że instancja ma rolę z 'AmazonSSMManagedInstanceCore' oraz że SSM agent jest uruchomiony na instancji.",
            }), 400

        ping_status = (info_list[0] or {}).get("PingStatus")
        if ping_status != "Online":
            return jsonify({
                "error": f"Instancja jest zarządzana przez SSM, ale PingStatus={ping_status}.",
                "ssmConnected": False,
            }), 400

        # Ensure log group exists first.
        import boto3
        logs = boto3.client(
            "logs",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        try:
            logs.create_log_group(logGroupName=log_group_name)
        except Exception:
            pass

        # Install + configure CW Agent (Amazon Linux + Ubuntu/Debian best-effort).
        cw_config = (
            '{\n'
            '  "logs": {\n'
            '    "logs_collected": {\n'
            '      "files": {\n'
            '        "collect_list": [\n'
            '          {\n'
            '            "file_path": "/var/log/messages",\n'
            '            "log_group_name": "' + log_group_name + '",\n'
            '            "log_stream_name": "{instance_id}/messages"\n'
            '          },\n'
            '          {\n'
            '            "file_path": "/var/log/syslog",\n'
            '            "log_group_name": "' + log_group_name + '",\n'
            '            "log_stream_name": "{instance_id}/syslog"\n'
            '          }\n'
            '        ]\n'
            '      }\n'
            '    }\n'
            '  },\n'
            '  "metrics": {\n'
            '    "append_dimensions": {"InstanceId": "${aws:InstanceId}"},\n'
            '    "metrics_collected": {"mem": {"measurement": ["mem_used_percent"]}, "disk": {"measurement": ["used_percent"], "resources": ["*"]}}\n'
            '  }\n'
            '}'
        )

        commands = [
            "set -e",
            "if command -v yum >/dev/null 2>&1; then sudo yum install -y amazon-cloudwatch-agent || true; fi",
            "if command -v dnf >/dev/null 2>&1; then sudo dnf install -y amazon-cloudwatch-agent || true; fi",
            "if command -v apt-get >/dev/null 2>&1; then sudo apt-get update -y || true; sudo apt-get install -y amazon-cloudwatch-agent || true; fi",
            "sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
            "cat <<'EOF' | sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json >/dev/null",
            cw_config,
            "EOF",
            "if [ -x /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl ]; then "
            "sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 "
            "-c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s; fi",
            "sudo systemctl enable amazon-cloudwatch-agent || true",
            "sudo systemctl restart amazon-cloudwatch-agent || true",
            "echo CW_AGENT_INSTALL_DONE",
        ]

        cmd_resp = ssm.send_command(
            InstanceIds=[instance_id],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": commands},
            TimeoutSeconds=180,
        )
        command_id = cmd_resp["Command"]["CommandId"]
        return jsonify({
            "message": "Zlecono instalację/konfigurację CloudWatch Agent przez SSM.",
            "commandId": command_id,
            "logGroupName": log_group_name,
            "region": region,
        }), 202
    except Exception as e:
        print(f"[ERROR] install_ec2_agent: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def list_ec2_alerts(instance_id):
    """
    List CloudWatch alarms for EC2 instance.
    Optional query param: region
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "").strip() or "us-east-1"
    prefix = f"ec2-{instance_id}-"

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
        print(f"[ERROR] list_ec2_alerts: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def create_ec2_alert(instance_id):
    """
    Create CloudWatch alarm for EC2 instance.
    POST body:
      - alertName
      - metricType (must be one of EC2_AVAILABLE_METRICS[].name)
      - threshold
      - region (optional, defaults to query/body region)
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    data = request.get_json() or {}
    region = (data.get("region") or request.args.get("region") or "").strip() or "us-east-1"
    alert_name = (data.get("alertName") or "").strip()
    metric_type = (data.get("metricType") or "").strip()
    threshold = data.get("threshold")

    if not metric_type:
        return jsonify({"error": "Brak 'metricType' w ciele żądania."}), 400
    try:
        threshold_val = float(threshold)
    except Exception:
        return jsonify({"error": "Pole 'threshold' musi być liczbą."}), 400

    metric_info = next((m for m in EC2_AVAILABLE_METRICS if m["name"] == metric_type), None)
    if not metric_info:
        return jsonify({"error": "Nieobsługiwana metryka dla EC2."}), 400

    prefix = f"ec2-{instance_id}-"
    if not alert_name:
        alert_name = f"{prefix}{metric_type}-gt-{threshold_val}"
    elif not alert_name.startswith(prefix):
        # enforce naming prefix so list endpoint can reliably find it
        alert_name = f"{prefix}{alert_name}"

    description = f"{metric_type} > {threshold_val} dla EC2 {instance_id}"

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
            Namespace="AWS/EC2",
            MetricName=metric_type,
            Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
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

        return jsonify({"message": "Alarm EC2 utworzony.", "name": alert_name}), 201
    except Exception as e:
        print(f"[ERROR] create_ec2_alert: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500


def delete_ec2_alert(instance_id, alert_name):
    """
    Delete CloudWatch alarm.
    DELETE uses alert_name (AlarmName in CloudWatch).
    Optional query param: region
    """
    try:
        creds = get_aws_credentials()
    except Exception as e:
        return jsonify({"error": str(e)}), 401

    region = (request.args.get("region") or "").strip() or "us-east-1"
    prefix = f"ec2-{instance_id}-"

    # Allow user passing raw alert name; enforce prefix for safety.
    final_alarm_name = alert_name.strip()
    if not final_alarm_name.startswith(prefix):
        final_alarm_name = f"{prefix}{final_alarm_name}"

    try:
        import boto3
        cw = boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds.get("SessionToken"),
        )
        cw.delete_alarms(AlarmNames=[final_alarm_name])
        return jsonify({"message": "Alarm usunięty.", "name": final_alarm_name}), 200
    except Exception as e:
        print(f"[ERROR] delete_ec2_alert: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
