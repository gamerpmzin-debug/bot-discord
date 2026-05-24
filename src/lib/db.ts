// Mock do banco pra build passar
export const db = {
  select: () => ({ from: () => ({ where: () => [] }) }),
  insert: () => ({ values: () => ({ returning: () => [] }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: () => [] }) }) }),
};

// Tabelas que o código tá pedindo
export const sessionsTable = {};
export const bankTransactionsTable = {};
export const usersTable = {};

export default db;
