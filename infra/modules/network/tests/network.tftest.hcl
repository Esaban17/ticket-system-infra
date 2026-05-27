# ---------------------------------------------------------------------------
# network.tftest.hcl — terraform test para módulo network (BL-107/108/109)
#
# Ejecutar desde infra/modules/network/:
#   terraform init -backend=false
#   terraform test
#
# Todos los runs usan command = plan (no se requieren credenciales AWS).
# Los datos de región se mockean porque data "aws_region" "current" requiere
# un provider configurado — se inyecta via mock_provider.
# ---------------------------------------------------------------------------

# Variables base para todos los runs
variables {
  name_prefix        = "ticket-system-dev"
  environment        = "dev"
  vpc_cidr           = "10.20.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
  cluster_name       = ""
  interface_endpoint_services = [
    "ecr.api",
    "ecr.dkr",
    "secretsmanager",
    "logs",
    "sqs",
  ]
  tags = {}
}

# Mock del provider AWS para evitar llamadas reales a la API de AWS.
# terraform test en modo plan mockea los data sources automáticamente.
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      name = "us-east-1"
    }
  }
}

# ---------------------------------------------------------------------------
# Run 1: VPC — CIDR y configuración DNS
# ---------------------------------------------------------------------------
run "vpc_cidr_and_dns" {
  command = plan

  assert {
    condition     = aws_vpc.this.cidr_block == "10.20.0.0/16"
    error_message = "El CIDR de la VPC debe ser 10.20.0.0/16 (BL-107 default)"
  }

  assert {
    condition     = aws_vpc.this.enable_dns_hostnames == true
    error_message = "La VPC debe tener enable_dns_hostnames = true"
  }

  assert {
    condition     = aws_vpc.this.enable_dns_support == true
    error_message = "La VPC debe tener enable_dns_support = true"
  }
}

# ---------------------------------------------------------------------------
# Run 2: subnets — cantidad y distribución (2 public + 2 private para 2 AZs)
# ---------------------------------------------------------------------------
run "subnet_count" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == 2
    error_message = "Deben crearse exactamente 2 subnets públicas (una por AZ)"
  }

  assert {
    condition     = length(aws_subnet.private) == 2
    error_message = "Deben crearse exactamente 2 subnets privadas (una por AZ)"
  }
}

# ---------------------------------------------------------------------------
# Run 3: subnets públicas — CIDRs esperados y map_public_ip_on_launch
# Fórmula: cidrsubnet("10.20.0.0/16", 8, index)
#   index 0 → 10.20.0.0/24
#   index 1 → 10.20.1.0/24
# ---------------------------------------------------------------------------
run "public_subnet_cidrs" {
  command = plan

  assert {
    condition     = aws_subnet.public[0].cidr_block == "10.20.0.0/24"
    error_message = "La primera subnet pública debe ser 10.20.0.0/24"
  }

  assert {
    condition     = aws_subnet.public[1].cidr_block == "10.20.1.0/24"
    error_message = "La segunda subnet pública debe ser 10.20.1.0/24"
  }

  assert {
    condition     = aws_subnet.public[0].map_public_ip_on_launch == true
    error_message = "Las subnets públicas deben asignar IP pública en el lanzamiento"
  }
}

# ---------------------------------------------------------------------------
# Run 4: subnets privadas — CIDRs esperados (offset +10)
# Fórmula: cidrsubnet("10.20.0.0/16", 8, index + 10)
#   index 0 → 10.20.10.0/24
#   index 1 → 10.20.11.0/24
# ---------------------------------------------------------------------------
run "private_subnet_cidrs" {
  command = plan

  assert {
    condition     = aws_subnet.private[0].cidr_block == "10.20.10.0/24"
    error_message = "La primera subnet privada debe ser 10.20.10.0/24"
  }

  assert {
    condition     = aws_subnet.private[1].cidr_block == "10.20.11.0/24"
    error_message = "La segunda subnet privada debe ser 10.20.11.0/24"
  }
}

# ---------------------------------------------------------------------------
# Run 5: tags de subnets públicas — ELB y Tier
# El AWS Load Balancer Controller requiere kubernetes.io/role/elb = 1
# ---------------------------------------------------------------------------
run "public_subnet_tags" {
  command = plan

  assert {
    condition     = aws_subnet.public[0].tags["kubernetes.io/role/elb"] == "1"
    error_message = "Subnets públicas deben tener tag kubernetes.io/role/elb = '1'"
  }

  assert {
    condition     = aws_subnet.public[0].tags["Tier"] == "public"
    error_message = "Subnets públicas deben tener tag Tier = 'public'"
  }

  assert {
    condition     = aws_subnet.public[1].tags["kubernetes.io/role/elb"] == "1"
    error_message = "Todas las subnets públicas deben tener tag kubernetes.io/role/elb = '1'"
  }
}

# ---------------------------------------------------------------------------
# Run 6: tags de subnets privadas — internal-ELB y Tier
# ---------------------------------------------------------------------------
run "private_subnet_tags" {
  command = plan

  assert {
    condition     = aws_subnet.private[0].tags["kubernetes.io/role/internal-elb"] == "1"
    error_message = "Subnets privadas deben tener tag kubernetes.io/role/internal-elb = '1'"
  }

  assert {
    condition     = aws_subnet.private[0].tags["Tier"] == "private"
    error_message = "Subnets privadas deben tener tag Tier = 'private'"
  }

  assert {
    condition     = aws_subnet.private[1].tags["kubernetes.io/role/internal-elb"] == "1"
    error_message = "Todas las subnets privadas deben tener tag kubernetes.io/role/internal-elb = '1'"
  }
}

# ---------------------------------------------------------------------------
# Run 7: cluster_name — cuando se provee, los tags de EKS aparecen en subnets
# ---------------------------------------------------------------------------
run "cluster_name_tags_applied" {
  command = plan

  variables {
    cluster_name = "ticket-system-dev-eks"
  }

  assert {
    condition     = aws_subnet.public[0].tags["kubernetes.io/cluster/ticket-system-dev-eks"] == "shared"
    error_message = "Cuando cluster_name está definido, subnets deben tener tag kubernetes.io/cluster/<name> = 'shared'"
  }

  assert {
    condition     = aws_subnet.private[0].tags["kubernetes.io/cluster/ticket-system-dev-eks"] == "shared"
    error_message = "Subnets privadas también deben tener el tag del cluster cuando cluster_name está definido"
  }
}

# ---------------------------------------------------------------------------
# Run 8: Ruta pública default — CIDR destino 0.0.0.0/0
# Nota: en modo plan, los IDs de recursos (route_table_id, gateway_id) son
# "unknown until apply" y no pueden usarse en condiciones. Verificamos el
# CIDR de destino, que sí es conocido en plan (valor literal del código).
# ---------------------------------------------------------------------------
run "public_route_to_igw" {
  command = plan

  assert {
    condition     = aws_route.public_default.destination_cidr_block == "0.0.0.0/0"
    error_message = "La ruta pública default debe apuntar a 0.0.0.0/0"
  }
}

# ---------------------------------------------------------------------------
# Run 9: Internet Gateway — existe exactamente 1 IGW adjunto a la VPC
# El vpc_id también es unknown en plan; verificamos que el recurso se declara.
# ---------------------------------------------------------------------------
run "internet_gateway_declared" {
  command = plan

  # El recurso aws_internet_gateway.this existe en el plan
  assert {
    condition     = aws_internet_gateway.this != null
    error_message = "El módulo debe declarar un Internet Gateway"
  }
}

# ---------------------------------------------------------------------------
# Run 10: NAT Gateway — confirma que se declara el recurso (single-AZ)
# Atributos como allocation_id son unknown en plan; verificamos existencia.
# ---------------------------------------------------------------------------
run "nat_gateway_declared" {
  command = plan

  assert {
    condition     = aws_nat_gateway.this != null
    error_message = "El módulo debe declarar un NAT Gateway"
  }
}

# ---------------------------------------------------------------------------
# Run 11 (renombrado): rutas privadas — count == az_count, CIDR 0.0.0.0/0
# nat_gateway_id es unknown en plan; se verifica CIDR y conteo.
# ---------------------------------------------------------------------------
run "private_routes_count_and_cidr" {
  command = plan

  assert {
    condition     = length(aws_route.private_default) == 2
    error_message = "Deben existir exactamente 2 rutas privadas default (una por AZ)"
  }

  assert {
    condition     = aws_route.private_default[0].destination_cidr_block == "0.0.0.0/0"
    error_message = "Las rutas privadas default deben apuntar a 0.0.0.0/0"
  }

  assert {
    condition     = aws_route.private_default[1].destination_cidr_block == "0.0.0.0/0"
    error_message = "Todas las rutas privadas deben apuntar a 0.0.0.0/0"
  }
}

# ---------------------------------------------------------------------------
# Run 12 (renombrado): S3 Gateway endpoint — tipo Gateway
# route_table_ids es una lista de IDs computados (unknown en plan).
# Solo verificamos el tipo (valor conocido desde el código fuente).
# ---------------------------------------------------------------------------
run "s3_gateway_endpoint_type" {
  command = plan

  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway"
    error_message = "El endpoint de S3 debe ser de tipo Gateway (sin costo por ENI)"
  }
}

# ---------------------------------------------------------------------------
# Run 12: interface endpoints — count = 5 (ecr.api, ecr.dkr, secretsmanager, logs, sqs)
# ---------------------------------------------------------------------------
run "interface_endpoints_count" {
  command = plan

  assert {
    condition     = length(aws_vpc_endpoint.interface) == 5
    error_message = "Deben crearse exactamente 5 interface VPC endpoints (BL-109)"
  }
}

# ---------------------------------------------------------------------------
# Run 13: interface endpoints — todos son de tipo Interface con private DNS
# ---------------------------------------------------------------------------
run "interface_endpoints_type_and_dns" {
  command = plan

  assert {
    condition = alltrue([
      for ep in aws_vpc_endpoint.interface : ep.vpc_endpoint_type == "Interface"
    ])
    error_message = "Todos los endpoints de interfaz deben ser de tipo Interface"
  }

  assert {
    condition = alltrue([
      for ep in aws_vpc_endpoint.interface : ep.private_dns_enabled == true
    ])
    error_message = "Todos los interface endpoints deben tener private_dns_enabled = true"
  }
}

# ---------------------------------------------------------------------------
# Run 14: Security Group de endpoints — permite HTTPS (443) desde el CIDR de la VPC
# ---------------------------------------------------------------------------
run "endpoint_sg_https_ingress" {
  command = plan

  assert {
    condition     = aws_security_group_rule.vpc_endpoints_ingress_https.from_port == 443
    error_message = "La regla de ingreso al SG de endpoints debe ser desde el puerto 443"
  }

  assert {
    condition     = aws_security_group_rule.vpc_endpoints_ingress_https.to_port == 443
    error_message = "La regla de ingreso al SG de endpoints debe ser hasta el puerto 443"
  }

  assert {
    condition     = aws_security_group_rule.vpc_endpoints_ingress_https.protocol == "tcp"
    error_message = "La regla de ingreso al SG de endpoints debe usar protocolo TCP"
  }

  assert {
    condition     = contains(aws_security_group_rule.vpc_endpoints_ingress_https.cidr_blocks, aws_vpc.this.cidr_block)
    error_message = "La regla de ingreso debe permitir solo el CIDR de la VPC"
  }
}

# ---------------------------------------------------------------------------
# Run 15: interface endpoints usan exactamente 1 SG (el del módulo)
# En plan, aws_security_group.vpc_endpoints.id es unknown; verificamos conteo.
# ---------------------------------------------------------------------------
run "interface_endpoints_have_one_sg" {
  command = plan

  assert {
    condition = alltrue([
      for ep in aws_vpc_endpoint.interface : length(ep.security_group_ids) == 1
    ])
    error_message = "Cada interface endpoint debe tener exactamente 1 SG asignado (el del módulo)"
  }
}

# ---------------------------------------------------------------------------
# Run 16: CIDR VPC custom — verifica que la parametrización funciona
# ---------------------------------------------------------------------------
run "custom_vpc_cidr" {
  command = plan

  variables {
    vpc_cidr           = "172.16.0.0/16"
    availability_zones = ["us-east-1a", "us-east-1b"]
  }

  assert {
    condition     = aws_vpc.this.cidr_block == "172.16.0.0/16"
    error_message = "El CIDR custom de la VPC debe reflejarse en el plan"
  }
}
