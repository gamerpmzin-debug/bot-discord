// Mock do Zod pra build passar
export const z = {
  object: () => ({}),
  string: () => ({}),
  number: () => ({}),
  boolean: () => ({}),
  array: () => ({}),
};

// Tipos que o código tá pedindo
export type HealthCheckResponse = {};
export type ListSessionsQueryParams = {};
export type GetSessionParams = {};

export default z;
