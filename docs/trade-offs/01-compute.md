# 01 · Compute — Lambda vs ECS Fargate vs EC2

## Contexto

Delivery 2 exige un módulo Terraform en `infra/modules/compute/` que provisione **un** recurso de cómputo entre EC2, Lambda o ECS Fargate (allowed equivalences del PDF, sección 3.1). El sistema de tickets diseñado en E1 (Infraestructura en la Nube) define dos cargas de cómputo:

- **API REST síncrona** — recibe `POST /tickets`, `PATCH /tickets/{id}/state`, etc. RBAC en cada endpoint.
- **Workers async** — procesan eventos de SQS para notificaciones por email y escalamiento por SLA vencido.

Como el equipo también entra al **EKS Track** (Deliverable E opcional, +40 pts), la API REST irá sobre EKS. Queda libre el módulo `compute` para el worker async.

## Opciones consideradas

| Opción | Cómo encaja | Costo operativo |
|---|---|---|
| **EC2 + launch template** | Instancia siempre encendida que hace polling de SQS. Requiere AMI, user-data, healthchecks. | Alto — paga 24/7 y mantienes parches del SO |
| **ECS Fargate task + service** | Contenedor que hace polling de SQS. No hay nodos que manejar. | Medio — paga por task hora, infraestructura redundante con EKS |
| **Lambda con event source mapping a SQS** | Función que se invoca cuando llegan mensajes. AWS escala automáticamente. | Bajo — paga sólo por invocación (free tier muy generoso) |

## Criterios

1. **Alineación con E1.** El E1 menciona "SQS + workers para notificaciones y escalamiento" — un patrón evento-driven, no un servidor de larga vida.
2. **No redundancia con EKS.** Si la API ya corre en EKS, poner workers en ECS Fargate duplica el plano de contenedores.
3. **Rubric: IAM sin wildcards.** El recurso elegido debe poder ejecutarse con permisos finamente granulares.
4. **Costo en cuenta de estudiante.** Lambda dentro del free tier ⇒ ~$0/mes; un t3.micro EC2 24/7 ⇒ ~$8/mes; Fargate 0.25 vCPU 24/7 ⇒ ~$9/mes.
5. **Velocidad de iteración para el curso.** Lambda se redeploya cambiando el zip, sin imagen Docker.

## Decisión

**AWS Lambda (`python3.12`, 128 MB, timeout 30s).**

La función representa el **worker async** del sistema: en este momento es un placeholder (`index.py` que retorna `{"statusCode": 200}`), pero el módulo expone los inputs necesarios para que en Delivery 4 se conecte como event source de la cola SQS.

## Consecuencias

✅ **Positivas**
- IAM role específico: sólo `logs:CreateLogStream`, `logs:PutLogEvents` sobre el ARN exacto del log group, más el managed policy `AWSLambdaVPCAccessExecutionRole` para ENIs (rubric: "no wildcards en política propia").
- Lambda **dentro de la default VPC** con su propio Security Group, lo que permite que RDS limite ingress al SG del compute (cumple rubric DB: "no 0.0.0.0/0").
- Cost = $0 hasta 1M invocaciones/mes.

⚠️ **Negativas**
- Lambda VPC-attached agrega ~1–5s de cold start. Aceptable para workers async.
- Para invocaciones síncronas masivas (API REST) Lambda no es la mejor opción — pero esa carga vive en EKS.
- El paquete `index.py` se genera con `archive_file`; cambios al código requieren `terraform apply` para resubir el zip.
