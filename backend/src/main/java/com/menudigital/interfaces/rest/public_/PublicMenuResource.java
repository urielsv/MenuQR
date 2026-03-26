package com.menudigital.interfaces.rest.public_;

import com.menudigital.application.menu.GetPublicMenuUseCase;
import com.menudigital.application.menu.dto.MenuDTOs.*;
import com.menudigital.domain.menu.Menu;
import com.menudigital.domain.menu.MenuItem;
import com.menudigital.domain.menu.MenuSection;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/menu")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "Public Menu", description = "Public endpoints for viewing menus (no auth required)")
public class PublicMenuResource {
    
    @Inject
    GetPublicMenuUseCase getPublicMenuUseCase;
    
    @GET
    @Path("/{slug}")
    @Operation(summary = "Get public menu", description = "Returns the menu for a restaurant by slug. Only shows available items.")
    @APIResponse(responseCode = "200", description = "Menu found")
    @APIResponse(responseCode = "404", description = "Menu not found")
    public Response getMenu(@Parameter(description = "Restaurant URL slug") @PathParam("slug") String slug) {
        return getPublicMenuUseCase.execute(slug)
            .map(this::toMenuResponse)
            .map(Response::ok)
            .map(Response.ResponseBuilder::build)
            .orElseGet(() -> Response.status(Response.Status.NOT_FOUND)
                .entity(new ErrorResponse("NOT_FOUND", "Menu not found"))
                .build());
    }
    
    private MenuResponse toMenuResponse(Menu menu) {
        return new MenuResponse(
            menu.getTenantId() != null ? menu.getTenantId().toString() : null,
            menu.getRestaurantName(),
            menu.getSlug(),
            menu.getSortedSections().stream()
                .map(this::toSectionResponse)
                .toList()
        );
    }
    
    private SectionResponse toSectionResponse(MenuSection section) {
        return new SectionResponse(
            section.getId().toString(),
            section.getName(),
            section.getDisplayOrder(),
            section.getItems().stream()
                .map(this::toItemResponse)
                .toList()
        );
    }
    
    private ItemResponse toItemResponse(MenuItem item) {
        return new ItemResponse(
            item.getId().toString(),
            item.getSectionId().toString(),
            item.getName(),
            item.getDescription(),
            item.getPrice().toPlainString(),
            item.getImageUrl(),
            item.isAvailable(),
            item.getDietaryTags(),
            item.getDisplayOrder()
        );
    }
    
    public record ErrorResponse(String code, String message) {}
}
