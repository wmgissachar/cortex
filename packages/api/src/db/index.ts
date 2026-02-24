import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lazy pool initialization
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

export const db = {
  query: <T = unknown>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> => {
    return getPool().query<T>(text, params);
  },

  getClient: (): Promise<pg.PoolClient> => {
    return getPool().connect();
  },

  transaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  close: (): Promise<void> => {
    if (pool) {
      return pool.end();
    }
    return Promise.resolve();
  },
};

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');

  const migrationsDir = join(__dirname, 'migrations');
  const migrationFile = join(migrationsDir, '001_initial_schema.sql');

  try {
    // Check if migrations table exists
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      )`
    );

    if (!rows[0].exists) {
      // Create migrations tracking table
      await db.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    // Check if migration already applied
    const { rows: appliedRows } = await db.query<{ version: string }>(
      `SELECT version FROM schema_migrations WHERE version = '001_initial_schema'`
    );

    if (appliedRows.length === 0) {
      // Read and execute migration
      const sql = readFileSync(migrationFile, 'utf-8');
      await db.query(sql);

      // Record migration
      await db.query(
        `INSERT INTO schema_migrations (version) VALUES ('001_initial_schema')`
      );

      console.log('Migration 001_initial_schema applied successfully');
    } else {
      console.log('Migration 001_initial_schema already applied');
    }

    // Migration 002: Knowledge links
    const migration002 = '002_knowledge_links';
    const { rows: applied002 } = await db.query<{ version: string }>(
      `SELECT version FROM schema_migrations WHERE version = $1`, [migration002]
    );
    if (applied002.length === 0) {
      const sql002 = readFileSync(join(migrationsDir, '002_knowledge_links.sql'), 'utf-8');
      await db.query(sql002);
      await db.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration002]);
      console.log(`Migration ${migration002} applied successfully`);
    } else {
      console.log(`Migration ${migration002} already applied`);
    }

    // Migration 003: Thread summary + last_seen_at
    const migration003 = '003_thread_summary';
    const { rows: applied003 } = await db.query<{ version: string }>(
      `SELECT version FROM schema_migrations WHERE version = $1`, [migration003]
    );
    if (applied003.length === 0) {
      const sql003 = readFileSync(join(migrationsDir, '003_thread_summary.sql'), 'utf-8');
      await db.query(sql003);
      await db.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration003]);
      console.log(`Migration ${migration003} applied successfully`);
    } else {
      console.log(`Migration ${migration003} already applied`);
    }

    // Migration 004: AI tables
    const migration004 = '004_ai_tables';
    const { rows: applied004 } = await db.query<{ version: string }>(
      `SELECT version FROM schema_migrations WHERE version = $1`, [migration004]
    );
    if (applied004.length === 0) {
      const sql004 = readFileSync(join(migrationsDir, '004_ai_tables.sql'), 'utf-8');
      await db.query(sql004);
      await db.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration004]);
      console.log(`Migration ${migration004} applied successfully`);
      await seedAnalystPrincipal();
    } else {
      console.log(`Migration ${migration004} already applied`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function seedAnalystPrincipal(): Promise<void> {
  try {
    const { rows: workspaces } = await db.query<{ id: string }>(`SELECT id FROM workspaces LIMIT 1`);
    if (workspaces.length === 0) {
      console.log('No workspace found, skipping cortex-analyst seed');
      return;
    }
    const workspaceId = workspaces[0].id;

    const { rows: existing } = await db.query<{ id: string }>(
      `SELECT id FROM principals WHERE handle = 'cortex_analyst' AND workspace_id = $1`,
      [workspaceId]
    );
    if (existing.length > 0) {
      console.log('cortex-analyst principal already exists');
      return;
    }

    const { generateApiKey, hashApiKey } = await import('../utils/password.js');
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);

    await db.query(
      `INSERT INTO principals (workspace_id, kind, handle, display_name, trust_tier, api_key_hash)
       VALUES ($1, 'agent', 'cortex_analyst', 'Cortex Analyst', 1, $2)`,
      [workspaceId, apiKeyHash]
    );

    console.log('Created cortex-analyst principal');
    console.log(`  API Key: ${apiKey}`);
    console.log('  Save this key to .env as AI_ANALYST_API_KEY if needed for external testing');
  } catch (error) {
    console.error('Failed to seed cortex-analyst principal:', error);
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    await db.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export default db;
