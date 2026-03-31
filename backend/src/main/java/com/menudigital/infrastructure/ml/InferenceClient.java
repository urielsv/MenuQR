package com.menudigital.infrastructure.ml;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

import java.util.List;

@RegisterRestClient(configKey = "inference-api")
@Path("/predict")
public interface InferenceClient {

    @POST
    RecommendResponse predictRecommendations(RecommendRequest request);

    class RecommendRequest {
        public List<String> items_in_cart;
        public String tenant_id;
    }

    class RecommendResponse {
        public List<String> recommended_items;
    }
}
