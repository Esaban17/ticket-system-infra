# ---------------------------------------------------------------------------
# Remote state backend — values come from the bootstrap workspace outputs.
#
# Terraform backend blocks CANNOT reference variables or locals (language
# constraint), so these strings are hardcoded. To rotate the backend, edit
# this file and re-run `terraform init -migrate-state`.
#
# Bootstrap workspace: infra/bootstrap/
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {
    bucket         = "ticket-system-tfstate-galileo-pdds"
    key            = "infra/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ticket-system-tflock"
    encrypt        = true
  }
}
