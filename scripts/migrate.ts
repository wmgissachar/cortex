import 'dotenv/config';
import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

async function createDatabase() {
  // Connect without database to create it
  const connectionString = process.env.DATABASE_URL!;
  const url = new URL(connectionString);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: url.toString() });

  try {
    // Check if database exists
    const { rows } = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (rows.length === 0) {
      console.log(`Creating database: ${dbName}`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log('Database created successfully');
    } else {
      console.log(`Database ${dbName} already exists`);
    }
  } finally {
    await adminPool.end();
  }
}

async function runMigrations() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check if migrations table exists
    const { rows } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'schema_migrations'
      )
    `);

    if (!rows[0].exists) {
      console.log('Creating schema_migrations table...');
      await pool.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    // Get applied migrations
    const { rows: appliedRows } = await pool.query<{ version: string }>(
      `SELECT version FROM schema_migrations ORDER BY version`
    );
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    // Get migration files
    const migrationsDir = join(__dirname, '..', 'packages', 'api', 'src', 'db', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      const version = file.replace('.sql', '');

      if (appliedVersions.has(version)) {
        console.log(`Migration ${version} already applied, skipping`);
        continue;
      }

      console.log(`Applying migration: ${version}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        await pool.query(sql);
        await pool.query(
          `INSERT INTO schema_migrations (version) VALUES ($1)`,
          [version]
        );
        console.log(`Migration ${version} applied successfully`);
      } catch (error) {
        console.error(`Migration ${version} failed:`, error);
        throw error;
      }
    }

    console.log('All migrations completed');
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('Starting database migrations...');
  console.log(`Database URL: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@')}`);

  await createDatabase();
  await runMigrations();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
