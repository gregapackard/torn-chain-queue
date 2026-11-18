#!/usr/bin/env python3
"""One capacity-hunter pass. Only A1.Flex, 2 OCPU/12 GB; no paid fallback."""
import os
import sys
import tempfile

import oci

NAME = "chain-manager-core"
SHAPE = "VM.Standard.A1.Flex"
OCPUS = 2
MEMORY_GB = 12
BOOT_GB = 50


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing {name}")
    return value


def report_success(instance_id):
    """Tell the workflow to disable future scheduled attempts."""
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write("provisioned=true\\n".replace("\\n", "\n"))
            handle.write(f"instance_id={instance_id}\\n".replace("\\n", "\n"))


def main():
    region = required("OCI_REGION")
    compartment = required("OCI_COMPARTMENT_OCID")
    subnet = required("OCI_SUBNET_OCID")
    ssh_key = required("OCI_SSH_PUBLIC_KEY")
    private_key = required("OCI_API_PRIVATE_KEY").replace("\\n", "\n")
    if not ssh_key.startswith(("ssh-ed25519 ", "ssh-rsa ", "ecdsa-sha2-")):
        raise ValueError("OCI_SSH_PUBLIC_KEY must be an OpenSSH public key")
    with tempfile.NamedTemporaryFile(mode="w", delete=False) as keyfile:
        keyfile.write(private_key)
        key_path = keyfile.name
    os.chmod(key_path, 0o600)
    try:
        cfg = {
            "user": required("OCI_USER_OCID"),
            "tenancy": required("OCI_TENANCY_OCID"),
            "fingerprint": required("OCI_API_FINGERPRINT"),
            "key_file": key_path,
            "region": region,
        }
        oci.config.validate_config(cfg)
        compute = oci.core.ComputeClient(cfg, retry_strategy=oci.retry.NoneRetryStrategy())
        identity = oci.identity.IdentityClient(cfg)
        network = oci.core.VirtualNetworkClient(cfg)
        subnet_obj = network.get_subnet(subnet).data
        if subnet_obj.compartment_id != compartment:
            raise ValueError("Subnet is not in the configured compartment")
        if subnet_obj.prohibit_public_ip_on_vnic:
            raise ValueError("Subnet prohibits public IP addresses; choose a public subnet")
        existing = oci.pagination.list_call_get_all_results(
            compute.list_instances, compartment, display_name=NAME
        ).data
        active = [i for i in existing if i.lifecycle_state not in ("TERMINATED", "TERMINATING")]
        if active:
            for i in active:
                print(f"Existing instance {i.id} state={i.lifecycle_state}; no launch attempted")
            report_success(active[0].id)
            return
        # Safety: never consume resources beyond the documented Always Free A1 allowance.
        all_instances = oci.pagination.list_call_get_all_results(
            compute.list_instances, compartment
        ).data
        used = [i for i in all_instances if i.shape == SHAPE and
                i.lifecycle_state not in ("TERMINATED", "TERMINATING")]
        if used:
            raise RuntimeError("Other active A1 instances found in compartment; refusing to assume free quota")
        domains = oci.pagination.list_call_get_all_results(
            identity.list_availability_domains, compartment
        ).data
        images = oci.pagination.list_call_get_all_results(
            compute.list_images, compartment, operating_system="Canonical Ubuntu",
            shape=SHAPE
        ).data
        compatible = [i for i in images if "24.04" in (i.operating_system_version or "")
                      and ("aarch64" in (i.display_name or "").lower()
                           or "arm" in (i.display_name or "").lower())]
        if not compatible:
            raise RuntimeError("No Ubuntu 24.04 ARM image found; refusing an unverified image")
        compatible.sort(key=lambda i: i.time_created or "", reverse=True)
        image_id = compatible[0].id
        print(f"Selected image {compatible[0].display_name}")
        if not domains:
            raise RuntimeError("No availability domains returned")
        for ad in domains:
            print(f"Trying availability domain: {ad.name}", flush=True)
            details = oci.core.models.LaunchInstanceDetails(
                availability_domain=ad.name,
                compartment_id=compartment,
                display_name=NAME,
                shape=SHAPE,
                shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(
                    ocpus=OCPUS, memory_in_gbs=MEMORY_GB),
                source_details=oci.core.models.InstanceSourceViaImageDetails(
                    image_id=image_id, boot_volume_size_in_gbs=BOOT_GB),
                create_vnic_details=oci.core.models.CreateVnicDetails(
                    subnet_id=subnet, assign_public_ip=True),
                metadata={"ssh_authorized_keys": ssh_key},
                freeform_tags={"managed-by": "github-actions", "project": "torn-chain-queue"},
            )
            try:
                result = compute.launch_instance(details).data
                print(f"CREATED instance OCID: {result.id}")
                print("Provisioning accepted. Check OCI Console for public IP and RUNNING state.")
                report_success(result.id)
                return
            except oci.exceptions.ServiceError as exc:
                msg = str(exc.message or "")
                if (exc.code in ("OutOfHostCapacity", "OutOfCapacity")
                    or "out of host capacity" in msg.lower()
                    or "out of capacity" in msg.lower()):
                    print(f"No capacity in {ad.name}; will try next AD")
                    continue
                if exc.status == 429:
                    print("Rate limited. Stopping this pass; next scheduled run will retry.")
                    return
                raise
        print("No A1 capacity available. Next scheduled workflow run will retry.")
    finally:
        os.unlink(key_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PROVISIONING ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
