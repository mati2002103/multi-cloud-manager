from flask import Blueprint

from .rg import list_resource_groups, create_resource_group,rg_contents, rg_delete
from .vnet import list_vnets, vnet_create
from .subnet import subnet_create
from .vm import list_virtual_machines, create_vm,delete_vm,vm_az_monitor_metrics,ensure_ama,agent_status,create_log_analytics,list_log_analytics,list_dcr,create_dcr,logs_basic
from .utils import api_user, api_subscriptions, logout, api_accounts

azure_bp_module = Blueprint("azure_module", __name__)

#rg
azure_bp_module.route("/api/resource_groups")(list_resource_groups)
azure_bp_module.route("/api/create_rg", methods=["POST"])(create_resource_group)
azure_bp_module.route("/api/resource_group_contents", methods=["GET"])(rg_contents)
azure_bp_module.route("/api/resource_group_delete", methods=["DELETE"])(rg_delete)

#Vnet
azure_bp_module.route("/api/vnets")(list_vnets)
azure_bp_module.route("/api/vnetsCreate", methods=["POST"])(vnet_create)

# Subnet
azure_bp_module.route("/api/subnetCreate", methods=["POST"])(subnet_create)



# VM
azure_bp_module.route("/api/virtual_machines")(list_virtual_machines)
azure_bp_module.route("/api/vmsCreate", methods=["POST"])(create_vm)
azure_bp_module.route("/api/vmsDelete", methods=["DELETE"])(delete_vm)

#VM monitoring
azure_bp_module.route("/api/vm/<vm_id>/metrics", methods=["POST"])(vm_az_monitor_metrics)
azure_bp_module.route("/api/vm/<vm_id>/agent-status", methods=["GET"])(agent_status)
azure_bp_module.route("/api/vm/<vm_id>/ensure-ama", methods=["POST"])(ensure_ama)


#log analytics
azure_bp_module.route("/api/log_analytics", methods=["POST"])(create_log_analytics)
azure_bp_module.route("/api/log_analytics", methods=["GET"])(list_log_analytics)

#dcr
azure_bp_module.route("/api/dcr_list", methods=["GET"])(list_dcr)
azure_bp_module.route("/api/dcr_create", methods=["POST"])(create_dcr)
azure_bp_module.route("/api/logs_basic", methods=["GET"])(logs_basic)


# Session
azure_bp_module.route("/api/user")(api_user)
azure_bp_module.route("/api/subscriptions")(api_subscriptions)
azure_bp_module.route("/api/accounts")(api_accounts)
azure_bp_module.route("/api/logout")(logout)



            

