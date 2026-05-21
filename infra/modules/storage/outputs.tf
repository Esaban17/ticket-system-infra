output "bucket_id" {
  description = "Name (id) of the S3 bucket. Use this when constructing s3:// URIs or wiring upstream services."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket. Referenced by IAM policies of compute resources that need to read/write objects."
  value       = aws_s3_bucket.this.arn
}

output "bucket_domain_name" {
  description = "Regional domain name of the bucket (e.g., my-bucket.s3.us-east-1.amazonaws.com). Useful for generating presigned URLs."
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}
