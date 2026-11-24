import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'IntelliCore REST API',
      version: '2.0.0',
      description: 'API documentation for IntelliCore Modular Monolith Platform (Phase 1 Foundation)',
      contact: {
        name: 'IntelliCore Engineering Team',
        email: 'Info@IntelliCoreTechnologies.in',
        url: 'https://intellicoretechnologies.in'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Future development Firebase ID token or session JWT'
        }
      },
      schemas: {
        StandardSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string', example: 'Operation succeeded' },
            requestId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        StandardErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'RESOURCE_NOT_FOUND' },
                message: { type: 'string', example: 'The requested resource was not found.' }
              }
            },
            requestId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./backend/src/routes/*.js']
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;

