# Oracle A1 capacity checker (development)

**Not active until merged into the default branch and explicitly enabled.** GitHub scheduled workflows run from the default branch. The workflow also has a hard enable switch.

## Before enabling
1. Confirm the selected OCI region, image, subnet, boot volume and A1 shape are **Always Free eligible** in the Oracle console. OCI capacity and Always Free entitlement are separate questions.
2. Create a **new OCI API signing key** for a restricted automation identity; do not reuse or upload your VM SSH private key. Configure OCI IAM to allow only necessary instance list/launch, availability domain list, and VNIC/subnet use in the chosen compartment. Restrict resources and budget where possible.
3. Add repository Actions **secrets**: `OCI_API_PRIVATE_KEY` (full OCI API private signing key), `OCI_USER_OCID`, `OCI_API_FINGERPRINT`, `OCI_TENANCY_OCID`.
4. Add repository Actions **variables**: `OCI_REGION`, `OCI_COMPARTMENT_OCID`, `OCI_SUBNET_OCID`, `OCI_IMAGE_OCID`, `OCI_SSH_PUBLIC_KEY` (public key ONLY).
5. Set `OCI_CAPACITY_CHECK_ENABLED=true` to permit the checker to run. Initially leave `OCI_ENABLE_LAUNCH` unset to test dry-run. When the cost/permissions are verified, set `OCI_ENABLE_LAUNCH=true`.
6. The workflow checks every six hours and stops launching when an instance named `chain-manager-core` exists in the compartment. It tries each AD only for an OCI host-capacity error. It never terminates anything.

## Important constraints
- It provisions **1 OCPU / 6 GB / 50 GB boot**, not 2/12. OCI may still bill for excess boot-volume allocations, IP usage, or other resources. Confirm total tenancy Always Free storage/compute usage before enabling.
- GitHub Actions cannot enforce OCI billing limits. Set an OCI budget and alerts and review quotas before activation.
- This is a capacity *provisioner*, not a read-only monitor. With `OCI_ENABLE_LAUNCH=true` it will create a VM automatically when capacity appears.
- The duplicate-name check prevents ordinary repeat creation but is not a globally atomic uniqueness constraint. Do not run another provisioning automation simultaneously.
- The image must be ARM64 compatible and in the selected region; subnet must support chosen AD and public IPv4.
- The original Blackwire instance is not modified.
- GitHub's scheduled workflows on the default branch require merging this workflow; keep code review and explicit approval for that merge.
