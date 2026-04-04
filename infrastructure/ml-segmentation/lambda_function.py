import json
import os
import datetime
import boto3
from collections import defaultdict
import numpy as np
from sklearn.cluster import KMeans

# Initialize clients
dynamodb = boto3.client('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
EVENTS_TABLE = os.environ.get('EVENTS_TABLE', 'menudigital-events')
SEGMENTS_TABLE = os.environ.get('SEGMENTS_TABLE', 'menudigital-segments')

def handler(event, context):
    try:
        # Example logic: Get yesterday's date
        yesterday = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
        date_str = yesterday.strftime('%Y-%m-%d')
        
        # Here we would normally query all tenants, but for simplicity we assume one or iterate them
        tenants = get_all_tenants()
        for tenant in tenants:
            process_tenant_segments(tenant, date_str)
            
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Segmentation completed successfully'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def get_all_tenants():
    # In a real scenario, fetch all active tenant IDs. 
    # For now, we return a mock tenant or query a Tenant table.
    return ["550e8400-e29b-41d4-a716-446655440000"]

def process_tenant_segments(tenant_id, date_str):
    # Query events for the given tenant
    # Note: Scanning or querying large datasets needs pagination in a real app
    # For simplicity, let's mock the event extraction process
    print(f"Processing tenant: {tenant_id} for date: {date_str}")
    
    response = dynamodb.query(
        TableName=EVENTS_TABLE,
        KeyConditionExpression="PK = :pk AND SK BETWEEN :start_sk AND :end_sk",
        ExpressionAttributeValues={
            ':pk': {'S': f"TENANT#{tenant_id}"},
            ':start_sk': {'S': f"EVENT#{date_str}T00:00:00.000Z"},
            ':end_sk': {'S': f"EVENT#{date_str}T23:59:59.999Z"}
        }
    )
    
    events = response.get('Items', [])
    if not events:
        print("No events found. Skipping.")
        return
        
    # Group events by sessionId
    sessions = defaultdict(list)
    for ev in events:
        sid = ev.get('sessionId', {}).get('S', 'unknown')
        sessions[sid].append(ev)
        
    # Extract features for each session:
    # 1. total_events
    # 2. total_item_views
    session_features = []
    session_ids = []
    
    for sid, evs in sessions.items():
        total_events = len(evs)
        item_views = sum(1 for e in evs if e.get('eventType', {}).get('S') == 'ITEM_VIEW')
        session_features.append([total_events, item_views])
        session_ids.append(sid)
        
    # clustering requires at least N samples
    X = np.array(session_features)
    n_clusters = 3 if len(X) >= 3 else len(X)
    
    if n_clusters == 0:
        return
        
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X)
    
    # Calculate stats for segments
    segments = []
    for i in range(n_clusters):
        cluster_points = X[labels == i]
        count = len(cluster_points)
        percentage = (count / len(X)) * 100
        avg_events = np.mean(cluster_points[:, 0])
        avg_items = np.mean(cluster_points[:, 1])
        
        name = determine_segment_name(avg_events, avg_items)
        
        segments.append({
            "M": {
                "name": {"S": name},
                "percentage": {"N": str(round(percentage, 2))},
                "count": {"N": str(count)},
                "avgItemsViewed": {"N": str(round(avg_items, 2))}
            }
        })
        
    # Save to DynamoDB
    dynamodb.put_item(
        TableName=SEGMENTS_TABLE,
        Item={
            'PK': {'S': f"TENANT#{tenant_id}"},
            'SK': {'S': f"DATE#{date_str}"},
            'tenantId': {'S': tenant_id},
            'date': {'S': date_str},
            'segments': {'L': segments}
        }
    )
    print(f"Saved segments: {segments}")

def determine_segment_name(avg_events, avg_items):
    if avg_items > 5:
        return "Exploradores de Menú"
    elif avg_events <= 2:
        return "Decididos / Rápidos"
    else:
        return "Usuarios Regulares"


if __name__ == "__main__":
    import sys
    result = handler({}, None)
    body = result.get("body", "")
    print(body if isinstance(body, str) else json.dumps(result))
    sys.exit(0 if result.get("statusCode") == 200 else 1)
