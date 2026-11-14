#!/usr/bin/env python3
"""Conservative OCI Always Free A1 capacity provisioning.

Only launch with explicit ENABLE_LAUNCH=true. Never terminate resources.
Requires OCI CLI authenticated by GitHub Actions and scoped OCI IAM policy.
"""
import json, os, subprocess, sys, time

def need(name):
    value=os.environ.get(name,"").strip()
    if not value: raise RuntimeError("Missing configuration: "+name)
    return value

def cli(*args):
    p=subprocess.run(["oci",*args,"--output","json"],capture_output=True,text=True,timeout=90)
    if p.returncode:
        raise RuntimeError((p.stderr or p.stdout)[-700:])
    return json.loads(p.stdout)

def main():
    compartment=need("OCI_COMPARTMENT_OCID")
    subnet=need("OCI_SUBNET_OCID")
    image=need("OCI_IMAGE_OCID")
    name=os.environ.get("OCI_INSTANCE_NAME","chain-manager-core")
    if name!="chain-manager-core": raise RuntimeError("Unexpected instance name")
    ssh=need("OCI_SSH_PUBLIC_KEY")
    if not ssh.startswith(("ssh-ed25519 ","ssh-rsa ")):
        raise RuntimeError("OCI_SSH_PUBLIC_KEY must be a public SSH key")
    if os.environ.get("ENABLE_LAUNCH")!="true":
        print("DRY RUN: configuration present; no instance will be created.")
        return
    # OCI CLI's regional tenancy compartment lists all instances across ADs.
    instances=cli("compute","instance","list","--compartment-id",compartment)["data"]
    existing=[x for x in instances if x.get("display-name")==name and x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
    if existing:
        print("Instance already exists; no new instance will be launched.")
        return
    domains=cli("iam","availability-domain","list","--compartment-id",compartment)["data"]
    if not domains: raise RuntimeError("No availability domains")
    # Strict Always Free maximum: 1 OCPU, 6 GB RAM; 50 GB boot.
    # Confirm OCI console marks image/shape/storage Always Free before enabling.
    for ad in domains:
        domain=ad["name"]
        try:
            result=cli("compute","instance","launch",
                "--compartment-id",compartment,
                "--availability-domain",domain,
                "--shape","VM.Standard.A1.Flex",
                "--shape-config",json.dumps({"ocpus":1,"memoryInGBs":6}),
                "--display-name",name,
                "--subnet-id",subnet,
                "--assign-public-ip","true",
                "--image-id",image,
                "--boot-volume-size-in-gbs","50",
                "--ssh-authorized-keys-file",os.environ["OCI_SSH_PUBLIC_KEY_FILE"])
            instance=result.get("data",{})
            print("LAUNCHED in",domain,"OCID:",instance.get("id","unknown"))
            if os.environ.get("GITHUB_OUTPUT"):
                with open(os.environ["GITHUB_OUTPUT"],"a",encoding="utf-8") as f:
                    f.write("created=true\n")
            return
        except RuntimeError as exc:
            error=str(exc)
            # Only retry across ADs for genuine capacity shortages.
            if "Out of host capacity" in error or "OutOfHostCapacity" in error or "out of capacity" in error.lower():
                print("Capacity unavailable in",domain)
                continue
            raise
    print("No A1 capacity in any availability domain; will retry next run.")

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("ERROR:",exc,file=sys.stderr)
        sys.exit(1)
