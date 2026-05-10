/**
 * auto-migrate.ts  — PostgreSQL Edition
 * Roda migrações de schema automaticamente no startup do servidor.
 * Idempotente: seguro de executar múltiplas vezes.
 *
 * Diferenças chave vs MySQL:
 *  - SERIAL / BIGSERIAL em vez de INT AUTO_INCREMENT
 *  - BOOLEAN em vez de TINYINT(1)
 *  - TEXT em vez de LONGTEXT
 *  - CREATE INDEX IF NOT EXISTS em vez de INDEX inline no CREATE TABLE
 *  - ON CONFLICT DO NOTHING em vez de INSERT IGNORE
 *  - ALTER COLUMN ... TYPE em vez de MODIFY COLUMN
 *  - Sem ENGINE=InnoDB / CHARSET / COLLATE
 */
export declare function runAutoMigrations(): Promise<void>;
//# sourceMappingURL=auto-migrate.d.ts.map