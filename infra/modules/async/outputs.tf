# ---------------------------------------------------------------------------
# async module — outputs.
# ---------------------------------------------------------------------------

output "queue_url" {
  description = "URL of the main SQS queue. Used by the producer (SendMessage) and consumed by the consumer Deployment as the SQS_QUEUE_URL environment variable."
  value       = aws_sqs_queue.main.url
}

output "queue_arn" {
  description = "ARN of the main SQS queue. Scoped in the consumer IRSA policy (sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes) and the producer IRSA policy (sqs:SendMessage). No wildcard ARNs."
  value       = aws_sqs_queue.main.arn
}

output "queue_name" {
  description = "Name of the main SQS queue. Used by the KEDA ScaledObject trigger and in evidence capture commands."
  value       = aws_sqs_queue.main.name
}

output "dlq_url" {
  description = "URL of the dead-letter queue. Used by operators to inspect and replay messages that failed maxReceiveCount delivery attempts."
  value       = aws_sqs_queue.dlq.url
}

output "dlq_arn" {
  description = "ARN of the dead-letter queue."
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_name" {
  description = "Name of the dead-letter queue. Used as the QueueName dimension of the CloudWatch DLQ alarm in the observability module."
  value       = aws_sqs_queue.dlq.name
}
