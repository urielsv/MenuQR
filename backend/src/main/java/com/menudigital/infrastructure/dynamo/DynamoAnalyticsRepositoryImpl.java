package com.menudigital.infrastructure.dynamo;

import com.menudigital.domain.analytics.AnalyticsRepository;
import com.menudigital.domain.analytics.EventType;
import com.menudigital.domain.analytics.InteractionEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
public class DynamoAnalyticsRepositoryImpl implements AnalyticsRepository {
    
    /** LSI: misma partición que la tabla (`PK`); sort key alternativo para filtrar por tipo + tiempo. */
    private static final String LSI_EVENT_TYPE = "LSI-EventType";
    private static final String GSI_ITEM = "GSI-Item";
    
    @Inject
    DynamoDbClient dynamoDbClient;
    
    @ConfigProperty(name = "aws.dynamodb.table", defaultValue = "menudigital-events")
    String tableName;
    
    @Override
    public void save(InteractionEvent event) {
        String pk = "TENANT#" + event.tenantId();
        String sk = "EVENT#" + event.timestamp().toString() + "#" + event.id();
        String eventTypeTimestamp = event.eventType().name() + "#" + event.timestamp().toString();
        
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("PK", AttributeValue.builder().s(pk).build());
        item.put("SK", AttributeValue.builder().s(sk).build());
        item.put("tenantId", AttributeValue.builder().s(event.tenantId()).build());
        item.put("eventType", AttributeValue.builder().s(event.eventType().name()).build());
        item.put("eventTypeTimestamp", AttributeValue.builder().s(eventTypeTimestamp).build());
        item.put("sessionId", AttributeValue.builder().s(event.sessionId()).build());
        item.put("timestamp", AttributeValue.builder().s(event.timestamp().toString()).build());
        
        if (event.itemId() != null && !event.itemId().isBlank()) {
            item.put("itemId", AttributeValue.builder().s(event.itemId()).build());
        }
        if (event.sectionId() != null && !event.sectionId().isBlank()) {
            item.put("sectionId", AttributeValue.builder().s(event.sectionId()).build());
        }
        
        if (event.metadata() != null && !event.metadata().isEmpty()) {
            Map<String, AttributeValue> metadataMap = event.metadata().entrySet().stream()
                .collect(Collectors.toMap(
                    Map.Entry::getKey,
                    e -> AttributeValue.builder().s(e.getValue()).build()
                ));
            item.put("metadata", AttributeValue.builder().m(metadataMap).build());
        }
        
        PutItemRequest request = PutItemRequest.builder()
            .tableName(tableName)
            .item(item)
            .build();
        
        dynamoDbClient.putItem(request);
    }
    
    @Override
    public List<InteractionEvent> findByTenantAndPeriod(String tenantId, Instant from, Instant to) {
        String pk = "TENANT#" + tenantId;
        String skFrom = "EVENT#" + from.toString();
        String skTo = "EVENT#" + to.toString() + "~";
        
        Map<String, AttributeValue> expressionValues = new HashMap<>();
        expressionValues.put(":pk", AttributeValue.builder().s(pk).build());
        expressionValues.put(":skFrom", AttributeValue.builder().s(skFrom).build());
        expressionValues.put(":skTo", AttributeValue.builder().s(skTo).build());
        
        QueryRequest request = QueryRequest.builder()
            .tableName(tableName)
            .keyConditionExpression("PK = :pk AND SK BETWEEN :skFrom AND :skTo")
            .expressionAttributeValues(expressionValues)
            .build();
        
        QueryResponse response = dynamoDbClient.query(request);
        return response.items().stream()
            .map(this::toInteractionEvent)
            .toList();
    }
    
    @Override
    public List<InteractionEvent> findByTenantTypeAndPeriod(String tenantId, EventType eventType, Instant from, Instant to) {
        String pk = "TENANT#" + tenantId;
        String eventTypeFrom = eventType.name() + "#" + from.toString();
        String eventTypeTo = eventType.name() + "#" + to.toString() + "~";
        
        Map<String, AttributeValue> expressionValues = new HashMap<>();
        expressionValues.put(":pk", AttributeValue.builder().s(pk).build());
        expressionValues.put(":etFrom", AttributeValue.builder().s(eventTypeFrom).build());
        expressionValues.put(":etTo", AttributeValue.builder().s(eventTypeTo).build());
        
        QueryRequest request = QueryRequest.builder()
            .tableName(tableName)
            .indexName(LSI_EVENT_TYPE)
            .keyConditionExpression("PK = :pk AND eventTypeTimestamp BETWEEN :etFrom AND :etTo")
            .expressionAttributeValues(expressionValues)
            .build();
        
        QueryResponse response = dynamoDbClient.query(request);
        return response.items().stream()
            .map(this::toInteractionEvent)
            .toList();
    }
    
    @Override
    public List<InteractionEvent> findByItemAndPeriod(String itemId, Instant from, Instant to) {
        Map<String, AttributeValue> expressionValues = new HashMap<>();
        expressionValues.put(":itemId", AttributeValue.builder().s(itemId).build());
        expressionValues.put(":from", AttributeValue.builder().s(from.toString()).build());
        expressionValues.put(":to", AttributeValue.builder().s(to.toString() + "~").build());
        
        QueryRequest request = QueryRequest.builder()
            .tableName(tableName)
            .indexName(GSI_ITEM)
            .keyConditionExpression("itemId = :itemId AND #ts BETWEEN :from AND :to")
            .expressionAttributeNames(Map.of("#ts", "timestamp"))
            .expressionAttributeValues(expressionValues)
            .build();
        
        QueryResponse response = dynamoDbClient.query(request);
        return response.items().stream()
            .map(this::toInteractionEvent)
            .toList();
    }
    
    private InteractionEvent toInteractionEvent(Map<String, AttributeValue> item) {
        Map<String, String> metadata = new HashMap<>();
        if (item.containsKey("metadata") && item.get("metadata").m() != null) {
            item.get("metadata").m().forEach((k, v) -> metadata.put(k, v.s()));
        }
        
        String id = item.containsKey("SK") ? 
            item.get("SK").s().replaceFirst("EVENT#.*#", "") : 
            UUID.randomUUID().toString();
        
        return new InteractionEvent(
            id,
            getStringOrNull(item, "tenantId"),
            EventType.valueOf(getStringOrNull(item, "eventType")),
            getStringOrNull(item, "itemId"),
            getStringOrNull(item, "sectionId"),
            getStringOrNull(item, "sessionId"),
            Instant.parse(getStringOrNull(item, "timestamp")),
            metadata
        );
    }
    
    private String getStringOrNull(Map<String, AttributeValue> item, String key) {
        return item.containsKey(key) ? item.get(key).s() : null;
    }
}
