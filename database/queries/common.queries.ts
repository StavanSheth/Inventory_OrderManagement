/**
 * Centralized parameterized query definitions for database operations.
 */
export const COMMON_QUERIES = {
  PRAGMA_FOREIGN_KEYS_ON: 'PRAGMA foreign_keys = ON;',
  PRAGMA_CHECK_FOREIGN_KEYS: 'PRAGMA foreign_keys;',
  LIST_TABLES: `
    SELECT name FROM sqlite_master 
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'
    ORDER BY name ASC;
  `,
  LIST_INDEXES: `
    SELECT name, tbl_name FROM sqlite_master 
    WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC;
  `,
};
