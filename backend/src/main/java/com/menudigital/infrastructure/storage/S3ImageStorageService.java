package com.menudigital.infrastructure.storage;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.InputStream;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class S3ImageStorageService {
    
    @ConfigProperty(name = "aws.s3.bucket", defaultValue = "menudigital-images")
    String bucketName;
    
    @ConfigProperty(name = "aws.s3.region", defaultValue = "us-east-1")
    String region;
    
    @ConfigProperty(name = "aws.s3.endpoint-override")
    Optional<String> endpointOverride;
    
    @ConfigProperty(name = "aws.s3.public-url")
    Optional<String> publicUrl;
    
    @ConfigProperty(name = "aws.dynamodb.access-key", defaultValue = "local")
    String accessKey;
    
    @ConfigProperty(name = "aws.dynamodb.secret-key", defaultValue = "local")
    String secretKey;
    
    public String upload(InputStream inputStream, String contentType, long contentLength, String tenantId) {
        String key = "menus/" + tenantId + "/" + UUID.randomUUID() + getExtension(contentType);
        
        S3Client s3Client = buildClient();
        
        try {
            PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType(contentType)
                .build();
            
            s3Client.putObject(request, RequestBody.fromInputStream(inputStream, contentLength));
            
            if (publicUrl.isPresent() && !publicUrl.get().isBlank()) {
                return publicUrl.get() + "/" + bucketName + "/" + key;
            }
            
            if (endpointOverride.isPresent() && !endpointOverride.get().isBlank()) {
                return endpointOverride.get() + "/" + bucketName + "/" + key;
            }
            
            return String.format("https://%s.s3.%s.amazonaws.com/%s", bucketName, region, key);
        } finally {
            s3Client.close();
        }
    }
    
    private S3Client buildClient() {
        var builder = S3Client.builder()
            .region(Region.of(region));
        
        if (endpointOverride.isPresent() && !endpointOverride.get().isBlank()) {
            builder.endpointOverride(URI.create(endpointOverride.get()));
            builder.forcePathStyle(true);
            builder.credentialsProvider(StaticCredentialsProvider.create(
                AwsBasicCredentials.create(accessKey, secretKey)
            ));
        } else {
            builder.credentialsProvider(DefaultCredentialsProvider.create());
        }
        
        return builder.build();
    }
    
    private String getExtension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            default -> "";
        };
    }
}
