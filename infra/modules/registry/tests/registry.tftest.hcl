# ---------------------------------------------------------------------------
# registry.tftest.hcl — terraform test para módulo registry (BL-101)
#
# Ejecutar desde infra/modules/registry/:
#   terraform init -backend=false
#   terraform test
#
# Todos los runs usan command = plan (no se requieren credenciales AWS).
# ---------------------------------------------------------------------------

# Variables mínimas requeridas para que el módulo planifique sin error.
variables {
  env             = "dev"
  name_prefix     = "ticket-system"
  repository_name = "ticket-system-api"
  max_tagged_images    = 10
  untagged_expiry_days = 7
}

# ---------------------------------------------------------------------------
# Run 1: atributos de seguridad del repositorio ECR
# BL-101 exige IMMUTABLE, scan_on_push=true, AES256.
# ---------------------------------------------------------------------------
run "security_attributes" {
  command = plan

  assert {
    condition     = aws_ecr_repository.this.image_tag_mutability == "IMMUTABLE"
    error_message = "ECR repository debe tener image_tag_mutability = IMMUTABLE (BL-101)"
  }

  assert {
    condition     = aws_ecr_repository.this.image_scanning_configuration[0].scan_on_push == true
    error_message = "ECR repository debe tener scan_on_push = true (BL-101)"
  }

  assert {
    condition     = aws_ecr_repository.this.encryption_configuration[0].encryption_type == "AES256"
    error_message = "ECR repository debe usar cifrado AES256 en reposo (BL-101)"
  }
}

# ---------------------------------------------------------------------------
# Run 2: nombre del repositorio usa el valor de la variable
# ---------------------------------------------------------------------------
run "repository_name_default" {
  command = plan

  assert {
    condition     = aws_ecr_repository.this.name == "ticket-system-api"
    error_message = "El nombre del repositorio debe ser el valor de var.repository_name"
  }
}

# ---------------------------------------------------------------------------
# Run 3: tags del repositorio incluyen Name y Component
# ---------------------------------------------------------------------------
run "repository_tags" {
  command = plan

  assert {
    condition     = aws_ecr_repository.this.tags["Name"] == "ticket-system-api"
    error_message = "El tag Name debe coincidir con var.repository_name"
  }

  assert {
    condition     = aws_ecr_repository.this.tags["Component"] == "registry"
    error_message = "El tag Component debe ser 'registry'"
  }
}

# ---------------------------------------------------------------------------
# Run 4: política de lifecycle — regla 1 (untagged, priority 1, 7 días)
# ---------------------------------------------------------------------------
run "lifecycle_policy_untagged_rule" {
  command = plan

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].rulePriority == 1
    error_message = "La primera regla de lifecycle debe tener rulePriority = 1"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.tagStatus == "untagged"
    error_message = "La primera regla debe aplicar a imágenes untagged"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countType == "sinceImagePushed"
    error_message = "La primera regla debe expirar por antigüedad (sinceImagePushed)"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countNumber == 7
    error_message = "Las imágenes untagged deben expirar a los 7 días (BL-101 default)"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countUnit == "days"
    error_message = "La unidad de tiempo de la regla untagged debe ser 'days'"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].action.type == "expire"
    error_message = "La acción de la regla untagged debe ser 'expire'"
  }
}

# ---------------------------------------------------------------------------
# Run 5: política de lifecycle — regla 2 (tagged, priority 2, 10 imágenes)
# ---------------------------------------------------------------------------
run "lifecycle_policy_tagged_rule" {
  command = plan

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].rulePriority == 2
    error_message = "La segunda regla de lifecycle debe tener rulePriority = 2"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].selection.tagStatus == "tagged"
    error_message = "La segunda regla debe aplicar a imágenes tagged"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].selection.countType == "imageCountMoreThan"
    error_message = "La segunda regla debe expirar por conteo (imageCountMoreThan)"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].selection.countNumber == 10
    error_message = "Deben retenerse exactamente 10 imágenes tagged (BL-101)"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].selection.tagPatternList == ["*"]
    error_message = "El tagPatternList debe ser ['*'] para capturar cualquier tag"
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].action.type == "expire"
    error_message = "La acción de la regla tagged debe ser 'expire'"
  }
}

# ---------------------------------------------------------------------------
# Run 6: max_tagged_images custom — verifica que el valor se propaga al plan
# ---------------------------------------------------------------------------
run "custom_max_tagged_images" {
  command = plan

  variables {
    max_tagged_images = 5
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[1].selection.countNumber == 5
    error_message = "El valor custom de max_tagged_images=5 debe propagarse a la lifecycle policy"
  }
}

# ---------------------------------------------------------------------------
# Run 7: untagged_expiry_days custom — verifica que el valor se propaga al plan
# ---------------------------------------------------------------------------
run "custom_untagged_expiry_days" {
  command = plan

  variables {
    untagged_expiry_days = 14
  }

  assert {
    condition = jsondecode(aws_ecr_lifecycle_policy.this.policy).rules[0].selection.countNumber == 14
    error_message = "El valor custom de untagged_expiry_days=14 debe propagarse a la lifecycle policy"
  }
}

# ---------------------------------------------------------------------------
# Run 8: la política de lifecycle referencia el repositorio correcto
# ---------------------------------------------------------------------------
run "lifecycle_policy_targets_repository" {
  command = plan

  assert {
    condition     = aws_ecr_lifecycle_policy.this.repository == aws_ecr_repository.this.name
    error_message = "La lifecycle policy debe estar asociada al repositorio ECR del módulo"
  }
}

# ---------------------------------------------------------------------------
# Run 9: repositorio con nombre custom
# ---------------------------------------------------------------------------
run "custom_repository_name" {
  command = plan

  variables {
    repository_name = "ticket-system-worker"
  }

  assert {
    condition     = aws_ecr_repository.this.name == "ticket-system-worker"
    error_message = "El nombre del repositorio debe reflejar el valor custom de var.repository_name"
  }
}
