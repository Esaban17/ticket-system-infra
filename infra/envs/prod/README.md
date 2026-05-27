# Ambiente `prod` — código de referencia, NO aprovisionado en AWS

> **No ejecutar `terraform apply` con este `tfvars` durante el ciclo del curso.**
> Ver decisión `D-003` en `docs/decisiones.md`.

Este ambiente existe como código para demostrar el patrón multi-ambiente y
documentar cómo se promovería el sistema a producción real. Durante el ciclo
Mayo–Junio 2026 **solo se aprovisiona `dev`** (ver `infra/envs/dev/`).

## Diferencias clave vs `dev`

| Recurso | dev | prod |
|---|---|---|
| RDS instance | `t4g.micro` single-AZ | `t4g.small` multi-AZ |
| EKS node group | 1–2 nodos `t3.medium` | 2–4 nodos `t3.medium` |
| Lambda memory | 128 MB | 256 MB |
| Lambda timeout | 30 s | 60 s |
| Bucket suffix | `galileo-pdds` | `galileo-pdds-prod` |

## Uso permitido durante el curso

- `terraform plan -var-file=envs/prod/prod.tfvars` para evidenciar el diff
  que produciría un apply real (defensa de D5, presentación final).
- `terraform validate` desde CI para garantizar que el código sigue siendo
  válido aunque no se aplique.
- `terraform test` (cuando se cubran módulos con tests propios).

## Uso prohibido

- `terraform apply` — incurriría en costos significativos no presupuestados
  (~$200+/mes adicionales). Si en algún momento se desea aprovisionar prod,
  debe abrirse un RFC nuevo y obtener aprobación explícita.
