package com.menudigital.application.service;

import com.menudigital.application.dto.AnalyticsDashboardDTO;
import com.menudigital.application.dto.CustomerSegmentsDTO;
import com.menudigital.infrastructure.dynamodb.DynamoDBEventRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

@ApplicationScoped
public class AnalyticsService {

    @Inject
    DynamoDBEventRepository repository;

    public AnalyticsDashboardDTO getDashboardAnalytics(String tenantId, Instant from, Instant to) {
        List<Map<String, AttributeValue>> items = repository.getEventsForTenant(tenantId, from, to);

        int totalMenuViews = 0;
        int totalItemViews = 0;
        Map<String, Integer> itemCounts = new HashMap<>();
        Map<Integer, Integer> hourlyViews = new HashMap<>();

        for (Map<String, AttributeValue> item : items) {
            String evtType = item.get("eventType").s();
            String timestampStr = item.get("timestamp").s();
            Instant timestamp = Instant.parse(timestampStr);
            int hour = ZonedDateTime.ofInstant(timestamp, ZoneId.of("UTC")).getHour();

            if ("MENU_VIEW".equals(evtType)) {
                totalMenuViews++;
                hourlyViews.put(hour, hourlyViews.getOrDefault(hour, 0) + 1);
            } else if ("ITEM_VIEW".equals(evtType)) {
                totalItemViews++;
                String itemId = item.get("itemId").s();
                itemCounts.put(itemId, itemCounts.getOrDefault(itemId, 0) + 1);
            }
        }

        List<AnalyticsDashboardDTO.ItemVisit> topItems = itemCounts.entrySet().stream()
                .map(e -> new AnalyticsDashboardDTO.ItemVisit(e.getKey(), e.getValue()))
                .sorted((a, b) -> Integer.compare(b.views, a.views)) // desc
                .limit(5)
                .collect(Collectors.toList());

        AnalyticsDashboardDTO dto = new AnalyticsDashboardDTO();
        dto.totalItemViews = totalItemViews;
        dto.totalMenuViews = totalMenuViews;
        dto.topItems = topItems;
        dto.viewsByHour = hourlyViews;
        return dto;
    }

    public CustomerSegmentsDTO getLatestSegments(String tenantId) {
        List<Map<String, AttributeValue>> items = repository.getLatestSegmentsForTenant(tenantId);
        CustomerSegmentsDTO dto = new CustomerSegmentsDTO();

        if (items.isEmpty()) {
            return dto;
        }

        Map<String, AttributeValue> item = items.get(0);
        dto.date = item.get("date").s();
        
        List<AttributeValue> sList = item.get("segments").l();
        
        dto.segments = sList.stream().map(av -> {
            Map<String, AttributeValue> s = av.m();
            CustomerSegmentsDTO.Segment seg = new CustomerSegmentsDTO.Segment();
            seg.name = s.get("name").s();
            seg.percentage = Double.parseDouble(s.get("percentage").n());
            seg.count = Integer.parseInt(s.get("count").n());
            seg.avgItemsViewed = Double.parseDouble(s.get("avgItemsViewed").n());
            return seg;
        }).collect(Collectors.toList());

        return dto;
    }
}
