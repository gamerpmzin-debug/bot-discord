// Mock brabo que aceita qualquer coisa
const fakeQuery = {
  from: () => fakeQuery,
  where: () => fakeQuery,
  set: () => fakeQuery,
  values: () => fakeQuery,
  returning: () => Promise.resolve([]),
  groupBy: () => fakeQuery,
  orderBy: () => fakeQuery,
  limit: () => fakeQuery,
  then: (resolve: any) => resolve([])
};

export const db: any = {
  select: () => fakeQuery,
  insert: () => fakeQuery,
  update: () => fakeQuery,
  delete: () => fakeQuery,
};

// Tabelas fake que retornam qualquer propriedade
export const sessionsTable: any = {};
export const bankTransactionsTable: any = {};
export const usersTable: any = {};

export default db;
