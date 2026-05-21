"""
Placeholder handler for the ticket-system async worker.

In Delivery 4 this function will be wired as the event source consumer for an
SQS queue. For Delivery 2 we only need a deployable, invokable Lambda so the
infrastructure rubric can be evaluated (resource provisioned + IAM scoped).
"""


def handler(event, context):
    print(f"ticket-system worker invoked. event keys: {list(event.keys())}")
    return {
        "statusCode": 200,
        "body": "ticket-system worker placeholder — Delivery 2",
    }
