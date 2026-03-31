# DynamoDB Table Design

## Table: menudigital-events
Billing: PAY_PER_REQUEST (on-demand)

### Keys
| Key  | Type   | Pattern                          |
|------|--------|----------------------------------|
| PK   | String | TENANT#{tenantId}                |
| SK   | String | EVENT#{timestamp_iso}#{uuid}     |

### GSIs
| Index        | PK        | SK                        | Use case                    |
|--------------|-----------|---------------------------|-----------------------------|
| GSI-EventType| tenantId  | eventTypeTimestamp        | Filter events by type+time  |
| GSI-Item     | itemId    | timestamp                 | Per-item view analytics     |

### Item attributes
- `PK` (String): Partition key
- `SK` (String): Sort key
- `tenantId` (String): Restaurant tenant ID
- `eventType` (String): MENU_VIEW, ITEM_VIEW, SECTION_VIEW, FILTER_USED
- `eventTypeTimestamp` (String): "{eventType}#{timestamp}" for GSI
- `itemId` (String, optional): Menu item ID for ITEM_VIEW events
- `sectionId` (String, optional): Menu section ID for SECTION_VIEW events
- `sessionId` (String): Anonymous session identifier
- `timestamp` (String): ISO-8601 timestamp
- `metadata` (Map, optional): Additional context (e.g., filter name)

### Example item
```json
{
  "PK": "TENANT#550e8400-e29b-41d4-a716-446655440000",
  "SK": "EVENT#2024-03-15T13:45:22.123Z#7c9e6679-7425",
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "ITEM_VIEW",
  "eventTypeTimestamp": "ITEM_VIEW#2024-03-15T13:45:22.123Z",
  "itemId": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "timestamp": "2024-03-15T13:45:22.123Z",
  "metadata": {}
}
```

### Query examples

**All events for tenant in last 30 days:**
```
KeyConditionExpression: PK = :pk AND SK BETWEEN :from AND :to
:pk = "TENANT#abc"
:from = "EVENT#2024-02-14"
:to = "EVENT#2024-03-16"
```

**All ITEM_VIEW events for tenant:**
```
Index: GSI-EventType
KeyConditionExpression: tenantId = :tid AND begins_with(eventTypeTimestamp, "ITEM_VIEW#")
```

**All views for a specific item:**
```
Index: GSI-Item
KeyConditionExpression: itemId = :itemId AND timestamp BETWEEN :from AND :to
```

### Access Patterns

1. **Dashboard analytics**: Query by tenant + time range, aggregate in application
2. **Realtime stats**: Query last 60 minutes for a tenant
3. **Item popularity**: Query GSI-Item for specific item view counts
4. **Filter usage**: Query all FILTER_USED events and group by metadata.filter

### Capacity Planning

For a restaurant with:
- 1,000 menu views/day
- 3,000 item views/day (avg 3 items viewed per menu view)
- 500 section views/day
- 100 filter uses/day

**Daily writes**: ~4,600 items
**Monthly writes**: ~140,000 items
**30-day storage**: ~50 MB (assuming ~350 bytes per item)

On-demand pricing estimate: ~$0.50/month for this volume

## Table: menudigital-segments
Billing: PAY_PER_REQUEST (on-demand)

### Keys
| Key  | Type   | Pattern                          |
|------|--------|----------------------------------|
| PK   | String | TENANT#{tenantId}                |
| SK   | String | DATE#{yyyy-mm-dd}                |

### Item attributes
- `PK` (String): Partition key (Tenant ID)
- `SK` (String): Sort key (Date string)
- `tenantId` (String): Restaurant tenant ID
- `date` (String): ISO-date of the segmentation analysis
- `segments` (List[Map]): List of calculated segments with their stats e.g., `[{"name": "Explorers", "percentage": 40.5, "avgItemsViewed": 12.3}, ...]`

### Query examples
**Latest segments for tenant:**
```
KeyConditionExpression: PK = :pk AND begins_with(SK, "DATE#")
ScanIndexForward = false (Limit: 1)
```
