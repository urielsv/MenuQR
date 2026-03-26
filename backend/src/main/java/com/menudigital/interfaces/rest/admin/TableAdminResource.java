package com.menudigital.interfaces.rest.admin;

import com.menudigital.application.shared.TenantContext;
import com.menudigital.domain.table.RestaurantTable;
import com.menudigital.domain.table.TableRepository;
import com.menudigital.domain.table.TableSession;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.List;
import java.util.UUID;

@Path("/api/admin/tables")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
@Tag(name = "Table Management", description = "Manage restaurant tables and QR codes")
@SecurityRequirement(name = "jwt")
public class TableAdminResource {
    
    @Inject
    TableRepository tableRepository;
    
    @Inject
    TenantContext tenantContext;
    
    @GET
    @Operation(summary = "List all tables")
    public Response listTables() {
        List<TableResponse> tables = tableRepository.findByTenantId(tenantContext.getTenantId())
            .stream()
            .map(this::toResponse)
            .toList();
        return Response.ok(tables).build();
    }
    
    @GET
    @Path("/{id}")
    @Operation(summary = "Get table by ID")
    public Response getTable(@PathParam("id") UUID id) {
        return tableRepository.findById(id)
            .filter(t -> t.getTenantId().equals(tenantContext.getTenantId()))
            .map(t -> Response.ok(toResponse(t)).build())
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    @POST
    @Transactional
    @Operation(summary = "Create a new table")
    public Response createTable(@Valid CreateTableRequest request) {
        if (tableRepository.existsByTableNumber(tenantContext.getTenantId(), request.tableNumber())) {
            return Response.status(Response.Status.CONFLICT)
                .entity(new ErrorResponse("TABLE_EXISTS", "Table number already exists"))
                .build();
        }
        
        RestaurantTable table = RestaurantTable.create(
            tenantContext.getTenantId(),
            request.tableNumber(),
            request.tableName(),
            request.capacity()
        );
        
        tableRepository.save(table);
        return Response.status(Response.Status.CREATED).entity(toResponse(table)).build();
    }
    
    @PUT
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Update table")
    public Response updateTable(@PathParam("id") UUID id, @Valid UpdateTableRequest request) {
        return tableRepository.findById(id)
            .filter(t -> t.getTenantId().equals(tenantContext.getTenantId()))
            .map(table -> {
                table.setTableName(request.tableName());
                table.setCapacity(request.capacity());
                table.setActive(request.active());
                tableRepository.update(table);
                return Response.ok(toResponse(table)).build();
            })
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    @DELETE
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Delete table")
    public Response deleteTable(@PathParam("id") UUID id) {
        return tableRepository.findById(id)
            .filter(t -> t.getTenantId().equals(tenantContext.getTenantId()))
            .map(table -> {
                tableRepository.delete(id);
                return Response.noContent().build();
            })
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    @POST
    @Path("/{id}/regenerate-qr")
    @Transactional
    @Operation(summary = "Regenerate QR code token for table")
    public Response regenerateQr(@PathParam("id") UUID id) {
        return tableRepository.findById(id)
            .filter(t -> t.getTenantId().equals(tenantContext.getTenantId()))
            .map(table -> {
                table.regenerateQrToken();
                tableRepository.update(table);
                return Response.ok(toResponse(table)).build();
            })
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    @POST
    @Path("/{id}/session")
    @Transactional
    @Operation(summary = "Create a new table session (waiter starts session)")
    public Response createSession(@PathParam("id") UUID id) {
        return tableRepository.findById(id)
            .filter(t -> t.getTenantId().equals(tenantContext.getTenantId()))
            .map(table -> {
                tableRepository.findActiveSessionByTableId(id)
                    .ifPresent(session -> tableRepository.deactivateSession(session.getId()));
                
                TableSession session = TableSession.create(id, tenantContext.getTenantId(), "waiter");
                tableRepository.saveSession(session);
                return Response.ok(toSessionResponse(session, table.getTableNumber())).build();
            })
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    @DELETE
    @Path("/{id}/session")
    @Transactional
    @Operation(summary = "End active table session")
    public Response endSession(@PathParam("id") UUID id) {
        return tableRepository.findActiveSessionByTableId(id)
            .map(session -> {
                tableRepository.deactivateSession(session.getId());
                return Response.noContent().build();
            })
            .orElse(Response.status(Response.Status.NOT_FOUND).build());
    }
    
    private TableResponse toResponse(RestaurantTable table) {
        var activeSession = tableRepository.findActiveSessionByTableId(table.getId());
        return new TableResponse(
            table.getId().toString(),
            table.getTableNumber(),
            table.getTableName(),
            table.getCapacity(),
            table.getQrCodeToken(),
            table.isActive(),
            activeSession.map(s -> s.getSessionCode()).orElse(null),
            activeSession.map(s -> s.isValid()).orElse(false)
        );
    }
    
    private SessionResponse toSessionResponse(TableSession session, String tableNumber) {
        return new SessionResponse(
            session.getId().toString(),
            tableNumber,
            session.getSessionCode(),
            session.getStartedAt().toString(),
            session.getExpiresAt().toString()
        );
    }
    
    public record CreateTableRequest(
        @NotBlank String tableNumber,
        String tableName,
        @Positive int capacity
    ) {}
    
    public record UpdateTableRequest(
        String tableName,
        @Positive int capacity,
        boolean active
    ) {}
    
    public record TableResponse(
        String id,
        String tableNumber,
        String tableName,
        int capacity,
        String qrCodeToken,
        boolean active,
        String activeSessionCode,
        boolean hasActiveSession
    ) {}
    
    public record SessionResponse(
        String id,
        String tableNumber,
        String sessionCode,
        String startedAt,
        String expiresAt
    ) {}
    
    public record ErrorResponse(String code, String message) {}
}
