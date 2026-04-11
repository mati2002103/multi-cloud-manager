from flask import Blueprint
from .storage import (
    list_aws_buckets,
    create_aws_bucket,
    delete_aws_bucket,
    list_aws_bucket_objects,
    upload_aws_object,
    download_aws_object,
    delete_aws_object,
)
from .vm import (
    list_ec2_instances,
    get_ec2_instance_details,
    create_ec2_instance,
    list_ec2_amis,
    list_ec2_instance_types,
    start_ec2_instance,
    stop_ec2_instance,
    terminate_ec2_instance,
    rename_ec2_instance,
    attach_ec2_ssm_profile,
)
from .ec2_monitor import (
    get_available_metrics,
    get_metric_data,
    list_log_groups,
    query_logs,
    get_ec2_agent_status,
    install_ec2_agent,
    list_ec2_alerts,
    create_ec2_alert,
    delete_ec2_alert,
)
from .vpc import list_aws_vpcs, create_aws_vpc, list_aws_subnets, create_aws_subnet
from .containers import (
    list_ecs_services,
    create_ecs_service,
    delete_ecs_service,
    restart_ecs_service,
    get_available_ecs_metrics,
    get_ecs_metric_data,
    list_ecs_log_groups,
    query_ecs_logs,
    list_ecs_alerts,
    create_ecs_alert,
    delete_ecs_alert,
)

aws_api = Blueprint("aws_api", __name__)

# EC2 instances
aws_api.route("/api/aws/ec2/list", methods=["GET"])(list_ec2_instances)
aws_api.route("/api/aws/ec2/<string:instance_id>/details", methods=["GET"])(get_ec2_instance_details)
aws_api.route("/api/aws/ec2/amis", methods=["GET"])(list_ec2_amis)
aws_api.route("/api/aws/ec2/instance-types", methods=["GET"])(list_ec2_instance_types)
aws_api.route("/api/aws/ec2/create", methods=["POST"])(create_ec2_instance)
aws_api.route("/api/aws/ec2/<string:instance_id>/start", methods=["POST"])(start_ec2_instance)
aws_api.route("/api/aws/ec2/<string:instance_id>/stop", methods=["POST"])(stop_ec2_instance)
aws_api.route("/api/aws/ec2/<string:instance_id>/terminate", methods=["DELETE"])(terminate_ec2_instance)
aws_api.route("/api/aws/ec2/<string:instance_id>/rename", methods=["POST"])(rename_ec2_instance)
aws_api.route("/api/aws/ec2/<string:instance_id>/attach-ssm-profile", methods=["POST"])(attach_ec2_ssm_profile)

# EC2 CloudWatch monitoring
aws_api.route("/api/aws/ec2/<string:instance_id>/available-metrics", methods=["GET"])(get_available_metrics)
aws_api.route("/api/aws/ec2/<string:instance_id>/metrics", methods=["POST"])(get_metric_data)
aws_api.route("/api/aws/logs/log-groups", methods=["GET"])(list_log_groups)
aws_api.route("/api/aws/ec2/<string:instance_id>/logs/query", methods=["POST"])(query_logs)
aws_api.route("/api/aws/ec2/<string:instance_id>/agent-status", methods=["GET"])(get_ec2_agent_status)
aws_api.route("/api/aws/ec2/<string:instance_id>/install-agent", methods=["POST"])(install_ec2_agent)

# EC2 Alerts (CloudWatch)
aws_api.route("/api/aws/ec2/<string:instance_id>/alerts", methods=["GET"])(list_ec2_alerts)
aws_api.route("/api/aws/ec2/<string:instance_id>/create-alert", methods=["POST"])(create_ec2_alert)
aws_api.route("/api/aws/ec2/<string:instance_id>/alerts/<string:alert_name>", methods=["DELETE"])(delete_ec2_alert)

# S3 Buckets
aws_api.route("/api/aws/list_buckets", methods=["GET"])(list_aws_buckets)
aws_api.route("/api/aws/create_bucket", methods=["POST"])(create_aws_bucket)
aws_api.route("/api/aws/delete_bucket", methods=["DELETE"])(delete_aws_bucket)

# S3 Objects inside bucket
aws_api.route("/api/aws/bucket/objects", methods=["GET"])(list_aws_bucket_objects)
aws_api.route("/api/aws/bucket/objects", methods=["POST"])(upload_aws_object)
aws_api.route("/api/aws/bucket/objects/download", methods=["GET"])(download_aws_object)
aws_api.route("/api/aws/bucket/objects", methods=["DELETE"])(delete_aws_object)

# VPC / Subnets
aws_api.route("/api/aws/vpcs", methods=["GET"])(list_aws_vpcs)
aws_api.route("/api/aws/vpc/create", methods=["POST"])(create_aws_vpc)
aws_api.route("/api/aws/vpc/<string:vpc_id>/subnets", methods=["GET"])(list_aws_subnets)
aws_api.route("/api/aws/vpc/<string:vpc_id>/subnet/create", methods=["POST"])(create_aws_subnet)

# ECS Containers
aws_api.route("/api/aws/ecs/services", methods=["GET"])(list_ecs_services)
aws_api.route("/api/aws/ecs/create", methods=["POST"])(create_ecs_service)
aws_api.route("/api/aws/ecs/restart", methods=["POST"])(restart_ecs_service)
aws_api.route("/api/aws/ecs/delete", methods=["DELETE"])(delete_ecs_service)

# ECS Monitoring
aws_api.route("/api/aws/ecs/available-metrics", methods=["GET"])(get_available_ecs_metrics)
aws_api.route("/api/aws/ecs/metrics", methods=["POST"])(get_ecs_metric_data)
aws_api.route("/api/aws/ecs/log-groups", methods=["GET"])(list_ecs_log_groups)
aws_api.route("/api/aws/ecs/logs/query", methods=["POST"])(query_ecs_logs)

# ECS Alerts (CloudWatch)
aws_api.route("/api/aws/ecs/alerts", methods=["GET"])(list_ecs_alerts)
aws_api.route("/api/aws/ecs/create-alert", methods=["POST"])(create_ecs_alert)
aws_api.route("/api/aws/ecs/alerts/<string:alert_name>", methods=["DELETE"])(delete_ecs_alert)
