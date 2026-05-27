# Runbook — migración de default VPC a VPC dedicada (BL-110)

Aplica al promover el branch `feature/BL-107-network-module` a un workspace `dev` que ya tenía recursos en la **default VPC** (estado de Delivery 2). En un workspace virgen, basta con `terraform apply` y no hay migración que hacer.

## Problema

Los recursos con SG/subnets atadas a la default VPC (RDS, Lambda ENIs, EKS nodos) no se pueden "mover" a otra VPC con `terraform state mv`. Cambiar el `vpc_id`/`subnet_ids` de un `aws_db_instance` fuerza destroy-and-recreate; cambiar el SG de la Lambda también recrea sus ENIs.

## Pasos para `dev`

1. **Snapshot manual de RDS** antes de cualquier `apply`: `aws rds create-db-snapshot --db-instance-identifier ticket-system-dev-pg --db-snapshot-identifier ticket-system-dev-pre-vpc-migration`. Esperar `available`.
2. Avisar a Luis André: ventana de ~20-30 min en la que el endpoint Postgres y la Lambda quedan abajo.
3. `terraform plan` — confirmar que se ven 1 VPC, 4 subnets, IGW, NAT, 5 VPC endpoints **nuevos**, y RDS/Lambda marcados como `-/+ replace`. Si se ve algo más raro, parar y revisar.
4. `terraform apply`. RDS tarda 5-10 min en recrearse vacío.
5. Restaurar datos desde el snapshot del paso 1: `aws rds restore-db-instance-from-db-snapshot ...` apuntando al nuevo subnet group, o usar `pg_restore` si el volumen es chico.
6. Verificar: `aws rds describe-db-instances` → `PubliclyAccessible=false`, subnet group apunta a las `private` del módulo network.

## Para `prod`

No aplica todavía — `prod` se levanta en greenfield contra esta VPC. Si en el futuro hay que migrar prod, este runbook no es suficiente: requiere replicación lógica (pglogical o DMS) para evitar downtime.
