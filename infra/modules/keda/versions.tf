terraform {
  required_providers {
    # alekc/kubectl is used for kubectl_manifest (ScaledObject) because
    # kubernetes_manifest validates CRDs at plan time, which fails before
    # the KEDA Helm chart installs the ScaledObject CRD (ADR 0011).
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.0"
    }
  }
}
