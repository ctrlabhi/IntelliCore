import swaggerJsdoc from 'swagger-jsdoc';
import { phase04Paths } from './phase04OpenApi.js';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'IntelliCore REST API',
      version: '2.0.0',
      description: 'IntelliCore V2.0 operations, onboarding and internship lifecycle',
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
          description: 'IntelliCore development Firebase ID token'
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
  apis: ['./backend/src/routes/*.js', './backend/src/modules/**/*.js']
};

export const swaggerSpec = swaggerJsdoc(options);
Object.assign(swaggerSpec.paths, phase04Paths);
export default swaggerSpec;

