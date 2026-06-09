# ADR 0007 — Disponibilidad de RDS: Single-AZ en dev, Multi-AZ recomendado en prod

**Fecha:** 2026-06-09
**Estado:** Aceptado
**Owner:** Estuardo (BL-139)
**Cierra:** Q7 (`docs/preguntas-abiertas.md`)
**Relacionado:** `docs/trade-offs/03-database.md`, `D-003` (`docs/decisiones.md`)

---

## Contexto

El módulo de base de datos (`infra/modules/database`) aprovisiona una instancia
**Amazon RDS PostgreSQL 16**. El recurso `aws_db_instance.this` expone el campo
`multi_az` parametrizado por la variable `var.multi_az`
(`infra/modules/database/variables.tf:55-59`), declarada como requisito de rúbrica
de la Entrega 2: la variable debe existir aunque su valor sea `false` en dev.

Durante E2 se asumió Single-AZ sin formalizar la decisión, dejando **Q7**
("RDS sizing y AZ") cerrada solo parcialmente. Este ADR formaliza la postura
por ambiente y cierra Q7.

El subnet group ya cumple el requisito de **≥2 subnets en distintas AZs**
(`infra/modules/database/main.tf:20-24` y validación en
`variables.tf:21-24`), por lo que habilitar Multi-AZ es exclusivamente un cambio
de valor de variable: no requiere reaprovisionar red ni el subnet group.

## Opciones consideradas

| Opción | `multi_az` | Costo aprox. | HA / Failover |
|---|---|---|---|
| **A — Single-AZ (dev)** | `false` | ~12 USD/mes (`db.t4g.micro`) | Sin standby; una caída de AZ implica downtime hasta restaurar |
| **B — Multi-AZ (prod)** | `true` | ~2x del Single-AZ equivalente | Standby síncrono en otra AZ; failover automático |

En dev se usa además la instancia más barata (`db.t4g.micro`); en prod se sube a
`db.t4g.small` para tráfico productivo (ver `infra/envs/prod/README.md`).

## Criterios de evaluación

1. **Costo en cuenta de estudiante.** Dev acumula costo durante todo el ciclo;
   `db.t4g.micro` Single-AZ minimiza el gasto (~12 USD/mes). Multi-AZ duplicaría
   ese costo sin aportar valor en un ambiente que no tiene SLA de disponibilidad.
2. **Disponibilidad (HA).** Producción real requiere tolerar la pérdida de una AZ
   completa. Multi-AZ mantiene un standby síncrono y promueve automáticamente.
3. **RPO / RTO.** Multi-AZ ofrece **RPO ~0** (réplica síncrona, sin pérdida de
   transacciones confirmadas) y **RTO ~60-120 s** con failover automático
   gestionado por RDS. Single-AZ no garantiza ninguno de los dos ante caída de AZ.
4. **Reversibilidad.** El subnet group ya abarca ≥2 AZs, así que pasar a Multi-AZ
   es un solo cambio de variable, sin tocar el código del módulo.

## Decisión

- **Dev:** Single-AZ — `db_multi_az = false` en
  `infra/envs/dev/dev.tfvars:12`. Se prioriza costo; el ambiente no tiene
  requisito de disponibilidad.
- **Prod (recomendado):** Multi-AZ — `db_multi_az = true` en
  `infra/envs/prod/prod.tfvars`. Se prioriza HA y failover automático. El
  ambiente `prod` existe como código de referencia y **no se aprovisiona**
  durante el curso (ver `D-003`), pero su `tfvars` ya refleja esta decisión.

La variable `var.multi_az` del módulo conserva su `default = false` para que un
consumidor que no lo especifique caiga en la opción más barata y segura por costo.

## Consecuencias

✅ **Positivas**

- Dev mantiene el costo de RDS en ~12 USD/mes durante todo el ciclo.
- Prod queda documentado y cableado para HA: `RPO ~0`, `RTO ~60-120 s` con
  failover automático ante pérdida de AZ.
- Promover dev→prod respecto a disponibilidad es un cambio de un solo valor de
  variable; el subnet group ≥2 AZs ya soporta el standby.
- Q7 queda cerrada y trazada al código (`var.multi_az`, ambos `tfvars`).

⚠️ **Negativas / trade-offs aceptados**

- Dev no tolera la caída de una AZ: una interrupción de la AZ donde vive la
  instancia implica downtime hasta que RDS la restaure. Aceptable porque dev no
  tiene SLA.
- Multi-AZ en prod duplica el costo de cómputo de RDS frente al Single-AZ
  equivalente. Aceptable como costo de disponibilidad en producción.
- Esta decisión cubre **HA dentro de una región** (Multi-AZ). No cubre DR
  multi-región ni read replicas; quedan fuera de alcance y se evaluarían en un
  RFC posterior si surge el requisito.

## Implementación (sin cambios de infraestructura en este ADR)

Este ADR es **solo documentación**; no modifica ningún `.tf` ni `.tfvars`. El
estado actual del código ya implementa la decisión:

- `infra/modules/database/variables.tf:55-59` — variable `multi_az` (`default = false`).
- `infra/modules/database/main.tf:67` — `multi_az = var.multi_az` en `aws_db_instance.this`.
- `infra/envs/dev/dev.tfvars:12` — `db_multi_az = false`.
- `infra/envs/prod/prod.tfvars` — `db_multi_az = true`.
