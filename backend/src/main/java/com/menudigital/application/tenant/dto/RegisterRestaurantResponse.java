package com.menudigital.application.tenant.dto;

public record RegisterRestaurantResponse(
    String token,
    String tenantId,
    String restaurantName
) {}
