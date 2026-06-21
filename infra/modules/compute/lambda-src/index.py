"""
Report-generator Lambda — ticket-system async infrastructure (Delivery 4, Deliverable C).

Invoked daily by the EventBridge Scheduler. Lists objects written by the async
consumer to the S3 bucket and writes a JSON summary report to the same bucket
under the key 'reports/async-summary-<invocation-id>.json'.

IAM requirements (least-privilege, no wildcards):
  - s3:ListBucket on the bucket ARN
  - s3:PutObject  on <bucket>/*

Environment variables (injected by the ConfigMap or Lambda config):
  BUCKET_NAME   — name of the S3 bucket (from module.storage output)
  AWS_REGION    — AWS region (standard Lambda variable, always present)
"""

import json
import os
import boto3


def handler(event, context):
    bucket = os.environ.get("BUCKET_NAME", "")
    region = os.environ.get("AWS_REGION", "us-east-1")

    if not bucket:
        print("ERROR: BUCKET_NAME env var is not set")
        return {"statusCode": 500, "body": "BUCKET_NAME not configured"}

    s3 = boto3.client("s3", region_name=region)

    # Count async messages processed by the consumer (objects in async/ prefix).
    try:
        paginator = s3.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=bucket, Prefix="async/")
        object_count = sum(page.get("KeyCount", 0) for page in pages)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR listing objects: {exc}")
        object_count = -1

    # Build summary report.
    invocation_id = context.aws_request_id if context else "local"
    report = {
        "report_type": "async_summary",
        "invocation_id": invocation_id,
        "bucket": bucket,
        "async_objects_found": object_count,
        "generated_by": "report-generator-lambda",
    }

    # Write report to S3.
    report_key = f"reports/async-summary-{invocation_id}.json"
    try:
        s3.put_object(
            Bucket=bucket,
            Key=report_key,
            Body=json.dumps(report, indent=2),
            ContentType="application/json",
        )
        print(f"Report written to s3://{bucket}/{report_key}")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR writing report: {exc}")
        return {"statusCode": 500, "body": str(exc)}

    print(json.dumps(report))
    return {"statusCode": 200, "body": json.dumps(report)}
