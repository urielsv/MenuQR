package com.menudigital.application.shared;

import com.menudigital.domain.tenant.TenantId;
import jakarta.enterprise.context.RequestScoped;

@RequestScoped
public class TenantContext {
    
    private TenantId tenantId;
    private String restaurantName;
    
    public TenantId getTenantId() {
        return tenantId;
    }
    
    public void setTenantId(TenantId tenantId) {
        this.tenantId = tenantId;
    }
    
    public String getRestaurantName() {
        return restaurantName;
    }
    
    public void setRestaurantName(String restaurantName) {
        this.restaurantName = restaurantName;
    }
}
