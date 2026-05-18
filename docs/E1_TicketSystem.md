# Sistema de Tickets e Incidentes — Entrega # 1 
**Universidad Galileo · Postgrado en Diseño y Desarrollo de Software · Infraestructura en la Nube**
**Ciclo Mayo–Junio 2026**

**Equipo:**
- Luis André Morales
- Erick Estuardo Saban

---

## Qué cambió desde la entrega anterior
_Primera entrega — no hay versión anterior._

---

## 1. Resumen Ejecutivo

Las empresas de tecnología medianas (50–200 ingenieros) que operan múltiples servicios en producción enfrentan un problema recurrente: **los incidentes y solicitudes operativas llegan por canales informales** (Slack, correo, mensajes directos) y **no existe una forma sistemática de priorizarlos ni rastrearlos**. A esa escala, un equipo de operaciones/SRE ya no puede depender de la memoria colectiva ni del triaging manual — los incidentes se pierden, se duplican, o se atienden en el orden equivocado.

El **Sistema de Tickets e Incidentes** es una plataforma backend que centraliza el registro, clasificación, asignación y seguimiento de incidentes operativos y solicitudes de servicio. Cualquier rol técnico de la organización puede abrir un ticket; el equipo de operaciones/SRE lo recibe con prioridad calculada automáticamente y con escalamiento automático si no hay respuesta dentro del SLA definido.

**Lo que evita o automatiza:**
- Evita que incidentes críticos queden enterrados en hilos de Slack sin responsable asignado.
- Automatiza la priorización según tipo y severidad declarada, eliminando el triaging manual.
- Automatiza el escalamiento cuando un ticket de alta prioridad supera el tiempo de respuesta acordado.
- Genera trazabilidad completa: cada cambio de estado, asignación y comentario queda registrado con autor y timestamp.

---

## 2. Actores

### Actores primarios
Interactúan directamente con el sistema para cumplir su objetivo principal.

| Actor | Rol | Interacción principal |
|---|---|---|
| **Reportante** | Cualquier persona con rol técnico en la organización (desarrollador, QA, analista) | Abre tickets, adjunta evidencia, consulta el estado de sus reportes |
| **Agente de Operaciones / SRE** | Miembro del equipo de ops responsable de resolver incidentes | Recibe tickets asignados, actualiza estado, registra resolución, escala si es necesario |
| **Administrador del sistema** | Responsable de configurar el sistema (SLAs, categorías, usuarios, equipos) | Gestiona configuración, consulta reportes globales, define reglas de escalamiento |

### Actores de soporte
Sistemas externos con los que el sistema se integra para cumplir su función.

| Actor | Tipo | Propósito |
|---|---|---|
| **Servicio de notificaciones (Email / Slack)** | Sistema externo | Envía alertas a reportantes y agentes cuando cambia el estado de un ticket o se produce un escalamiento |
| **Servicio de autenticación (Identity Provider)** | Sistema externo | Autentica a los usuarios; provee identidad y rol para control de acceso |
| **Almacenamiento de archivos (S3)** | Servicio cloud interno | Persiste adjuntos (capturas, logs, archivos de diagnóstico) asociados a tickets |

---

## 3. Casos de Uso Priorizados

### Criterios de prioridad
- **P0 — Crítico:** El sistema no funciona sin esto. Es el núcleo de la propuesta de valor.
- **P1 — Importante:** Agrega valor significativo; sin esto el sistema es limitado pero funciona.
- **P2 — Deseable:** Mejora la experiencia pero puede diferirse sin afectar el flujo principal.

---

**CU-01 · Abrir un ticket de incidente** `P0`

> _Como reportante, quiero registrar un incidente con título, descripción, severidad y adjuntos, para que el equipo de operaciones tenga el contexto necesario para resolverlo._

**Criterio de éxito:** El ticket queda creado con estado `Abierto`, número único asignado (`TKT-XXXX`), timestamp de creación, severidad seleccionada y adjuntos almacenados. El reportante recibe confirmación inmediata con el número de ticket.

---

**CU-02 · Clasificar y asignar un ticket** `P0`

> _Como agente de operaciones, quiero ver la cola de tickets abiertos ordenada por prioridad y asignar un ticket a un agente, para que cada incidente tenga un responsable claro._

**Criterio de éxito:** El ticket cambia a estado `En progreso`, queda asociado al agente asignado con timestamp. El reportante recibe notificación de que su ticket fue tomado e indica quién lo atiende.

---

**CU-03 · Actualizar estado y registrar resolución** `P0`

> _Como agente de operaciones, quiero actualizar el estado de un ticket y registrar la causa raíz y solución aplicada, para dejar trazabilidad completa del incidente._

**Criterio de éxito:** Cada cambio de estado queda registrado con autor, timestamp y comentario obligatorio. Al pasar a `Resuelto`, el campo de causa raíz y solución aplicada es requerido. El reportante recibe notificación automática.

---

**CU-04 · Escalamiento automático por SLA vencido** `P0`

> _Como sistema, quiero detectar tickets de alta prioridad que no han sido atendidos dentro del tiempo de SLA y escalarlos automáticamente al siguiente nivel, para garantizar que ningún incidente crítico quede sin respuesta._

**Criterio de éxito:** Transcurrido el umbral de SLA sin cambio de estado, el sistema reasigna el ticket al nivel de escalamiento siguiente y notifica al agente y al administrador. El evento queda registrado en el historial del ticket.

---

**CU-05 · Consultar historial y trazabilidad de un ticket** `P1`

> _Como reportante o agente, quiero ver el historial completo de un ticket (cambios de estado, comentarios, asignaciones, adjuntos), para entender qué pasó y cuándo._

**Criterio de éxito:** El historial muestra cada evento ordenado cronológicamente con autor, timestamp y descripción del cambio. Los adjuntos son accesibles desde el mismo historial.

---

**CU-06 · Filtrar y buscar tickets en la cola** `P1`

> _Como agente de operaciones, quiero filtrar la cola de tickets por estado, prioridad, categoría y agente asignado, para encontrar rápidamente los tickets relevantes sin revisar la lista completa._

**Criterio de éxito:** Los filtros combinados retornan resultados en menos de 2 segundos. El estado de los filtros aplicados se mantiene visible en la interfaz.

---

**CU-07 · Consultar reporte de resolución por período** `P2`

> _Como administrador, quiero ver un reporte de tickets resueltos en un período dado (cantidad, tiempo promedio de resolución, distribución por categoría y agente), para evaluar el desempeño del equipo._

**Criterio de éxito:** El reporte se genera para cualquier rango de fechas y muestra métricas agregadas. Puede descargarse como archivo.

---

**CU-08 · Abrir una solicitud de servicio (no incidente)** `P2`

> _Como reportante, quiero registrar una solicitud de servicio rutinaria (accesos, configuraciones, cambios no urgentes) separada de los incidentes, para que el equipo la atienda sin mezclarla con la cola de incidentes críticos._

**Criterio de éxito:** La solicitud se crea con tipo `Solicitud` y flujo diferenciado del incidente. Queda en una cola separada visible para los agentes.

---

## 4. Funcionalidades Específicas del Proyecto

Las siguientes funcionalidades definen lo concreto del sistema — no el enunciado genérico, sino las decisiones específicas que lo diferencian.

### 4.1 Creación de tickets con severidad y tipo
El formulario de creación exige clasificar cada reporte en dos dimensiones:
- **Tipo:** `Incidente` (algo que está roto) o `Solicitud` (algo que se necesita).
- **Severidad:** `Crítica`, `Alta`, `Media`, `Baja`.

La severidad, combinada con el tipo, determina la prioridad calculada automáticamente y el SLA aplicable. Cada ticket se crea con un número único autoincremental (`TKT-XXXX`), timestamp UTC y el ID del reportante extraído del token de autenticación.

### 4.2 Priorización automática basada en severidad y tipo
Al crear un ticket, el sistema calcula automáticamente su prioridad en la cola combinando tipo y severidad. Un incidente crítico siempre encabeza la cola sobre cualquier solicitud, independientemente de cuándo fue creado. Esta lógica corre en el backend — el agente ve la cola ya ordenada, sin triaging manual.

### 4.3 Escalamiento automático por SLA con múltiples niveles
Cada combinación tipo/severidad tiene un SLA de primera respuesta configurado por el administrador (ejemplo: incidente crítico → 15 minutos, incidente alto → 1 hora). Un proceso asíncrono revisa periódicamente los tickets abiertos sin actividad; cuando detecta un SLA vencido, cambia el nivel de escalamiento del ticket (L1 → L2 → L3), notifica al agente asignado y al administrador, y registra el evento en el historial.

### 4.4 Historial de eventos inmutable
Cada acción sobre un ticket (creación, cambio de estado, asignación, comentario, escalamiento, adjunto) genera un evento registrado con autor, timestamp UTC y descripción. Este historial no puede editarse ni eliminarse. Es la fuente de verdad para auditoría y postmortems.

### 4.5 Adjuntos asociados a tickets con acceso temporal seguro
Al crear o comentar un ticket, el reportante o agente puede adjuntar archivos (capturas de pantalla, logs, archivos de configuración). Los archivos se almacenan en S3, separados de los metadatos del ticket en base de datos. Cada adjunto se accede mediante una URL prefirmada con expiración para evitar acceso no autorizado permanente.

### 4.6 Notificaciones asíncronas por evento a múltiples canales
El sistema notifica por email y/o Slack (según preferencia del usuario) en los siguientes eventos: ticket creado, ticket asignado, cambio de estado, comentario agregado, y escalamiento disparado. Las notificaciones se envían de forma asíncrona — no bloquean la respuesta de la API.

### 4.7 Control de acceso por rol (RBAC)
Tres roles con permisos diferenciados:
- **Reportante:** puede crear tickets, ver y comentar sus propios tickets, consultar estado.
- **Agente:** puede ver toda la cola, asignar, cambiar estado, comentar cualquier ticket.
- **Administrador:** acceso completo más configuración de SLAs, categorías, usuarios y reportes.

Los permisos se validan en cada endpoint del API; el rol se extrae del token de autenticación.

---

## Anexo IA

### Qué le pedimos a la IA
- Ayuda para estructurar el resumen ejecutivo a partir de las decisiones de dominio tomadas por el equipo.
- Generación de un primer borrador de los casos de uso con formato de user story.
- Sugerencia de funcionalidades específicas para un sistema de tickets orientado a incidentes de producción en empresa mediana.
- Revisión de consistencia entre actores, casos de uso y funcionalidades.

### Qué aceptamos y editamos
- El resumen ejecutivo fue generado con IA y editado para reflejar el contexto específico de empresa mediana (50–200 ingenieros) y el foco en trazabilidad y priorización como problemas centrales.
- Las user stories fueron generadas como borrador y ajustadas para que los criterios de éxito fueran verificables y concretos, no genéricos.
- La tabla de mapeo a conceptos del curso fue sugerida por IA y editada para incluir los servicios AWS específicos (ECS Fargate, RDS, SQS, S3) que el equipo ya había decidido en el contexto del curso de Automatización.

### Qué descartamos y por qué
- La IA propuso integración con PagerDuty y Datadog como funcionalidades dentro del scope. Lo descartamos porque agrega complejidad de integración externa sin ejercitar los componentes del curso — se movió explícitamente al out-of-scope.
- La IA sugirió un caso de uso de dashboard en tiempo real con WebSockets. Lo descartamos porque introduce complejidad de infraestructura no justificada por el dominio en esta fase.
- La IA propuso SLAs diferenciados por cliente. Lo descartamos porque el contexto es una empresa interna con una sola organización; no es un producto multi-tenant.
