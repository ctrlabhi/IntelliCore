# IntelliCore REST API Specification

**Base URL:** `http://localhost:3000/api/v1`  
**Interactive Documentation (Swagger UI):** `http://localhost:3000/api-docs`  
**OpenAPI Specification:** OpenAPI 3.0.3  

---

## 1. Response Envelope Format

All API responses follow a uniform, predictable JSON envelope.

### 1.1 Success Response Schema
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional operational summary message",
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 1.2 Error Response Schema
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource could not be found."
  },
  "requestId": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

---

## 2. Implemented Phase 1 Endpoints

### 2.1 `GET /health`
- **Summary:** Fast application liveness probe.
- **Description:** Verifies that the Node.js Express process is active and accepting connections.
- **Response:** HTTP 200 OK
```json
{
  "status": "UP",
  "service": "intellicore-api",
  "version": "2.0.0",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 2.2 `GET /ready`
- **Summary:** Infrastructure readiness probe.
- **Description:** Executes an active query (`SELECT 1`) against MySQL via Prisma to verify database connectivity.
- **Success Response:** HTTP 200 OK
```json
{
  "status": "READY",
  "database": "CONNECTED",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```
- **Failure Response (Database Unavailable):** HTTP 503 Service Unavailable
```json
{
  "status": "NOT_READY",
  "database": "DISCONNECTED",
  "timestamp": "2026-11-24T07:30:00.000Z"
}
```

### 2.3 `GET /api/v1`
- **Summary:** API version root metadata.
- **Description:** Returns API version, documentation link, and available system capabilities.
- **Response:** HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "api": "IntelliCore REST API",
    "version": "v1",
    "environment": "development",
    "docs": "/api-docs"
  },
  "requestId": "...",
  "timestamp": "..."
}
```

### 2.4 `GET /api/v1/health`
- **Summary:** Versioned API health diagnostic.
- **Description:** Detailed health status including process uptime, memory usage, and database state.
- **Response:** HTTP 200 OK

---

## 3. Swagger & OpenAPI Documentation

Interactive Swagger documentation is served directly from the application at:
- **`http://localhost:3000/api-docs`**

The specification documents only implemented endpoints. Planned business modules will be added as they are developed in future phases.

