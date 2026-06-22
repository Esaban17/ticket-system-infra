terraform {
  required_version = "~> 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # Kubernetes + Helm providers drive the in-cluster resources for
    # Deliverable C (ALB Controller helm release, app Deployment/Service,
    # kubernetes_ingress_v1) and Deliverable D (ServiceAccount/IRSA, ConfigMap,
    # Secret, seed Job). They are authenticated against the EKS cluster created
    # by module.eks using a short-lived token from aws_eks_cluster_auth.
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
    # kubectl provider (alekc/kubectl) is used exclusively for the KEDA
    # ScaledObject CRD instance. Unlike kubernetes_manifest, kubectl_manifest
    # does NOT validate the CRD schema at plan time — validation is deferred to
    # apply, when helm_release.keda has already installed the ScaledObject CRD.
    # This lets terraform plan succeed before KEDA is deployed (ADR 0011).
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# El provider kubernetes autentica contra EKS llamando a `aws eks get-token` en
# cada request al API server (exec plugin). Esto evita que el token estático de
# aws_eks_cluster_auth expire a mitad de un apply largo (TTL ~15 min), lo que
# causaba "Error: Unauthorized" en resources con wait_for_completion = true
# (p.ej. kubernetes_job.db_seed) cuando el apply superaba esos 15 minutos.
# Los runners ubuntu-latest ya tienen AWS CLI v2; configure-aws-credentials@v4
# exporta las credenciales como env vars que aws eks get-token consume.
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.region]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.region]
    }
  }
}

provider "kubectl" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.region]
  }
}
