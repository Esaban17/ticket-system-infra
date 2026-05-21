# Trade-offs · Plataforma de Tickets

Análisis de las decisiones arquitectónicas tomadas durante el Delivery 2 del curso *Optimizations and Performance*. Cada documento sigue el mismo formato:

1. **Contexto** — qué problema resuelve la decisión
2. **Opciones consideradas** — alternativas reales
3. **Criterios de evaluación** — qué pesa más
4. **Decisión** — la opción elegida
5. **Consecuencias** — qué implica (positivas y negativas)

Las decisiones se referencian desde `infra/docs/delivery-2-summary.md` (puntos 1, 2 y 5 del rubric).

| # | Decisión | Elección |
|---|---|---|
| [01](./01-compute.md) | Servicio de compute (módulo principal) | **AWS Lambda** (worker async) |
| [02](./02-storage.md) | Configuración del bucket S3 (lifecycle / encryption / policy) | **SSE-S3 + lifecycle scoped + SSL-only** |
| [03](./03-database.md) | Motor de base de datos | **RDS PostgreSQL 16** |
| [04](./04-eks-track.md) | Entrar al EKS Track opcional (+40 pts) | **Sí, con default VPC como placeholder** |
| [05](./05-state-backend.md) | Backend remoto y patrón de bootstrap | **S3 + DynamoDB lock, bootstrap workspace separado** |
