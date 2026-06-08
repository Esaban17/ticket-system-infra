# ---------------------------------------------------------------------------
# EKS module (Optional Track 1 — Delivery 2 §3.5).
#
# Wraps terraform-aws-modules/eks v20.x to provision:
#   - An EKS control plane
#   - At least 1 managed node group with min/max/desired/instance_types as
#     variables (rubric requirement)
#
# VPC placement: uses subnets supplied by the caller. Delivery 2 acceptable
# placeholder is the default VPC subnets; Delivery 3 will replace with a
# dedicated VPC.
# ---------------------------------------------------------------------------

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  vpc_id = var.vpc_id

  # Node groups + workload ENIs (and the ALBs surfaced by the AWS Load
  # Balancer Controller) live across all supplied subnets. The controller
  # picks public vs private using the kubernetes.io/role/* tags applied by
  # the network module, so we pass the union here.
  subnet_ids = concat(var.subnet_ids, var.public_subnet_ids)

  # Control-plane ENIs are pinned to the PRIVATE subnets only — they have
  # no need to live in public subnets and this avoids burning a public IP
  # per AZ.
  control_plane_subnet_ids = var.subnet_ids

  # Public endpoint enabled so kubectl from the developer's laptop works
  # without a bastion. Private endpoint also enabled so node groups talk to
  # the control plane via the VPC.
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    default = {
      min_size       = var.node_min_size
      max_size       = var.node_max_size
      desired_size   = var.node_desired_size
      instance_types = var.node_instance_types

      # Deliverable F: the node group lives ONLY in the private subnets (no
      # public IPs). This overrides the cluster-level subnet_ids (which also
      # lists the public subnets for ALB placement) for this node group.
      subnet_ids = var.subnet_ids

      # Attach app-sg (in addition to the cluster/node managed SGs) so pods
      # inherit the web-sg→app-sg ingress and app-sg→db-sg egress paths.
      vpc_security_group_ids = var.node_security_group_ids

      labels = {
        environment = var.environment
        role        = "general"
      }
    }
  }

  tags = {
    Environment = var.environment
    Track       = "eks"
  }
}
