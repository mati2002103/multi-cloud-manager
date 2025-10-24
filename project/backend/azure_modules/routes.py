from flask import Blueprint

from .rg import list_resource_groups, create_resource_group,rg_contents, rg_delete
from .vnet import list_vnets, vnet_create
from .subnet import subnet_create
from .vmmonitor import vm_az_monitor_metrics,agent_status,ensure_ama
from .vm import list_virtual_machines, create_vm,delete_vm
from .containers import list_containers,create_container,delete_container,restart_container
from .log_analytics import create_log_analytics,list_log_analytics,list_dcr,create_dcr_and_associate_vm,export_vm_logs_csv
from .storage import (
    list_storage_accounts,create_storage_account,delete_storage_account,
    list_blob_containers,create_blob_container,delete_blob_container,
    list_blobs,upload_blob,download_blob,delete_blob

)
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

#Storage Accounts
azure_bp_module.route("/api/list_storage_accounts")(list_storage_accounts)
azure_bp_module.route("/api/create_storage_account", methods=["POST"])(create_storage_account)
azure_bp_module.route("/api/delete_storage_account", methods=["DELETE"])(delete_storage_account)

#Blob Storage
azure_bp_module.route("/api/<storage_account_id>/list_blob_containers", methods=["POST"])(list_blob_containers)
azure_bp_module.route("/api/<storage_account_id>/create_blob_container", methods=["POST"])(create_blob_container)
azure_bp_module.route("/api/<storage_account_id>/delete_blob_container", methods=["DELETE"])(delete_blob_container)

#Blobs
azure_bp_module.route("/api/<storage_account_id>/list_blobs", methods=["POST"])(list_blobs)
azure_bp_module.route("/api/<storage_account_id>/upload_blob", methods=["POST"])(upload_blob)
azure_bp_module.route("/api/<storage_account_id>/delete_blob", methods=["DELETE"])(delete_blob)
azure_bp_module.route("/api/<storage_account_id>/download_blob", methods=["POST"])(download_blob)

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
azure_bp_module.route("/api/<vm_id>/dcr_list", methods=["GET"])(list_dcr)
azure_bp_module.route("/api/create_dcr_and_associate_for_vm", methods=["POST"])(create_dcr_and_associate_vm)

#logs
azure_bp_module.route("/api/vm/<vm_id>/logs/export", methods=["GET"])(export_vm_logs_csv)
#azure_bp_module.route("/api/vm/<vm_id>/logs/query",methods=["POST"])()

#containers
azure_bp_module.route("/api/list_containers", methods=["GET"])(list_containers)
azure_bp_module.route("/api/create_container", methods=["POST"])(create_container)
azure_bp_module.route("/api/delete_container", methods=["DELETE"])(delete_container)
azure_bp_module.route("/api/restart_container", methods=["POST"])(restart_container)

# Session
azure_bp_module.route("/api/user")(api_user)
azure_bp_module.route("/api/subscriptions")(api_subscriptions)
azure_bp_module.route("/api/accounts")(api_accounts)
azure_bp_module.route("/api/logout")(logout)






            

