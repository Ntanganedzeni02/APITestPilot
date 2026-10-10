// Synthetic, credential-free specifications. No hosted data or live API targets.
const response = {
  description: 'Declared result',
  content: {
    'application/json': {
      schema: { type: 'object', properties: { id: { type: 'integer' } } },
    },
  },
};
export const projectSpecifications = [
  {
    name: 'Weather observations',
    document: {
      openapi: '3.0.3',
      info: { title: 'Weather API', version: '1' },
      paths: { '/observations': { get: { responses: { '200': response } } } },
    },
  },
  {
    name: 'Authenticated library',
    document: {
      openapi: '3.1.0',
      info: { title: 'Library API', version: '1' },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      },
      security: [{ bearer: [] }],
      paths: {
        '/books/{isbn}': {
          get: {
            parameters: [
              {
                name: 'isbn',
                in: 'path',
                required: true,
                schema: { type: 'string', minLength: 10 },
              },
              {
                name: 'edition',
                in: 'query',
                schema: { type: 'integer', minimum: 1 },
              },
            ],
            responses: {
              '200': response,
              '404': { description: 'Book not found' },
            },
          },
        },
      },
    },
  },
  {
    name: 'Inventory mutations',
    document: {
      openapi: '3.0.3',
      info: { title: 'Inventory API', version: '1' },
      paths: {
        '/stock': {
          post: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['quantity'],
                    properties: { quantity: { type: 'integer', minimum: 1 } },
                  },
                },
              },
            },
            responses: { '201': response },
          },
        },
        '/stock/{id}': {
          put: {
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['quantity'],
                    properties: { quantity: { type: 'integer', minimum: 0 } },
                  },
                },
              },
            },
            responses: { '200': response },
          },
        },
      },
    },
  },
];
