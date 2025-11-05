from flask import Blueprint
from .utils import api_gcp_projects, api_gcp_accounts
from .storage import (list_gcp_buckets, delete_gcp_bucket, create_gcp_bucket,
                    list_bucket_blobs, upload_blob_to_bucket, download_blob_from_bucket,
                    delete_blob_from_bucket)
from .vm import list_gcp_vms, delete_gcp_vm, create_gcp_vm
from .containers import list_gcp_containers, delete_gcp_container, create_gcp_container
from .vpcs import list_gcp_vpcs, create_gcp_vpc, create_gcp_subnet

from .vmmonitor import (
    find_vm_by_name, get_available_metrics, get_metric_timeseries,
    get_vm_agent_status, install_ops_agent, query_lql_logs, 
    list_vm_alerts, create_gcp_alert, delete_gcp_alert
)

from .containermonitor import (
    find_gcp_container_details,get_gcp_container_available_metrics,get_gcp_container_metric_data,query_gcp_container_logs,
    list_gcp_container_alerts,create_gcp_container_alert,delete_gcp_container_alert
)
gcp_api = Blueprint("gcp_api", __name__)

# account and projects
gcp_api.route("/api/account/google/projects", methods=["GET"])(api_gcp_projects)
gcp_api.route("/api/account/gcp", methods=["GET"])(api_gcp_accounts)

# storage
gcp_api.route("/api/projects/list_buckets", methods=["GET"])(list_gcp_buckets)
gcp_api.route("/api/projects/delete_bucket", methods=["DELETE"])(delete_gcp_bucket)
gcp_api.route("/api/projects/create_bucket", methods=["POST"])(create_gcp_bucket)

# blobs inside bucket
gcp_api.route("/api/gcp/buckets/blobs", methods=["GET"])(list_bucket_blobs)
gcp_api.route("/api/gcp/buckets/blobs", methods=["POST"])(upload_blob_to_bucket)
gcp_api.route("/api/gcp/buckets/blobs/download", methods=["GET"])(download_blob_from_bucket)
gcp_api.route("/api/gcp/buckets/blobs", methods=["DELETE"])(delete_blob_from_bucket)

# vms
gcp_api.route("/api/gcp/list_vms", methods=["GET"])(list_gcp_vms)
gcp_api.route("/api/gcp/delete_gcp_vm", methods=["DELETE"])(delete_gcp_vm)
gcp_api.route("/api/gcp/create_gcp_vms", methods=["POST"])(create_gcp_vm)

# containers 
gcp_api.route("/api/gcp/list_containers", methods=["GET"])(list_gcp_containers)
gcp_api.route("/api/gcp/delete_container", methods=["DELETE"])(delete_gcp_container)
gcp_api.route("/api/gcp/create_container", methods=["POST"])(create_gcp_container)

# vpcs
gcp_api.route("/api/gcp/list_gcp_vpcs", methods=["GET"])(list_gcp_vpcs)
gcp_api.route("/api/gcp/create_gcp_vpc", methods=["POST"])(create_gcp_vpc)

# subnet
gcp_api.route("/api/gcp/create_gcp_subnet", methods=["POST"])(create_gcp_subnet)

#VM monitor
gcp_api.route("/api/gcp/vm/by-name/<string:vm_name>/details", methods=["GET"])(find_vm_by_name)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/available-metrics", methods=["GET"])(get_available_metrics)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/metrics", methods=["POST"])(get_metric_timeseries)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/agent-status", methods=["GET"])(get_vm_agent_status)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/install-agent", methods=["POST"])(install_ops_agent)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/logs/query", methods=["POST"])(query_lql_logs)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/alerts", methods=["GET"])(list_vm_alerts)
gcp_api.route("/api/gcp/vm/<string:project_id>/<string:instance_id>/create-alert", methods=["POST"])(create_gcp_alert)
gcp_api.route("/api/gcp/vm/<string:project_id>/alerts/<string:alert_name>", methods=["DELETE"])(delete_gcp_alert)

#Container Monitor
gcp_api.route("/api/gcp/container/by-name/<string:container_name>/details", methods=["GET"])(find_gcp_container_details)
gcp_api.route("/api/gcp/container/<string:project_id>/<string:region>/<string:container_name>/available-metrics", methods=["GET"])(get_gcp_container_available_metrics)
gcp_api.route("/api/gcp/container/<string:project_id>/<string:region>/<string:container_name>/metrics", methods=["POST"])(get_gcp_container_metric_data)
gcp_api.route("/api/gcp/container/<string:project_id>/<string:container_name>/logs/query", methods=["POST"])(query_gcp_container_logs)
gcp_api.route("/api/gcp/container/<string:project_id>/<string:container_name>/alerts", methods=["GET"])(list_gcp_container_alerts)
gcp_api.route("/api/gcp/container/<string:project_id>/<string:region>/<string:container_name>/create-alert", methods=["POST"])(create_gcp_container_alert)
gcp_api.route("/api/gcp/container/<string:project_id>/alerts/<string:alert_name>", methods=["DELETE"])(delete_gcp_container_alert)