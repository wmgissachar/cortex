import 'dotenv/config';
import pg from 'pg';
import argon2 from 'argon2';

const { Pool } = pg;

// Argon2id configuration per spec
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 parallel threads
};

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Starting database seed...');

    // Check if workspace already exists
    const { rows: existingWorkspaces } = await pool.query(
      `SELECT id FROM workspaces LIMIT 1`
    );

    let workspaceId: string;

    if (existingWorkspaces.length > 0) {
      workspaceId = existingWorkspaces[0].id;
      console.log(`Using existing workspace: ${workspaceId}`);
    } else {
      // Create default workspace
      const { rows: workspaceRows } = await pool.query<{ id: string }>(
        `INSERT INTO workspaces (name, description, settings)
         VALUES ('Default Workspace', 'The default Cortex workspace', '{"allow_agent_auto_publish": true}')
         RETURNING id`
      );
      workspaceId = workspaceRows[0].id;
      console.log(`Created workspace: ${workspaceId}`);
    }

    // Check if admin user exists
    const { rows: existingAdmin } = await pool.query(
      `SELECT id FROM principals WHERE handle = 'admin' AND workspace_id = $1`,
      [workspaceId]
    );

    if (existingAdmin.length > 0) {
      console.log('Admin user already exists, skipping');
    } else {
      // Create admin user
      const passwordHash = await argon2.hash('admin123', ARGON2_OPTIONS);
      const { rows: adminRows } = await pool.query<{ id: string }>(
        `INSERT INTO principals (workspace_id, kind, handle, display_name, email, password_hash, trust_tier)
         VALUES ($1, 'human', 'admin', 'Administrator', 'admin@cortex.local', $2, 2)
         RETURNING id`,
        [workspaceId, passwordHash]
      );
      console.log(`Created admin user: ${adminRows[0].id}`);
      console.log('  Email: admin@cortex.local');
      console.log('  Password: admin123');
    }

    // Create cortex_analyst agent principal (used by AI service for plan threads, critiques, etc.)
    const { rows: existingAnalyst } = await pool.query(
      `SELECT id FROM principals WHERE handle = 'cortex_analyst' AND workspace_id = $1`,
      [workspaceId]
    );

    if (existingAnalyst.length > 0) {
      console.log('cortex_analyst agent already exists, skipping');
    } else {
      const { rows: analystRows } = await pool.query<{ id: string }>(
        `INSERT INTO principals (workspace_id, kind, handle, display_name, trust_tier)
         VALUES ($1, 'agent', 'cortex_analyst', 'Cortex Analyst', 2)
         RETURNING id`,
        [workspaceId]
      );
      console.log(`Created cortex_analyst agent: ${analystRows[0].id}`);
    }

    // Ensure ai_config exists for this workspace (migration 004 seeds from existing
    // workspaces, but on fresh install the workspace doesn't exist yet when migrations run)
    await pool.query(
      `INSERT INTO ai_config (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId]
    );
    console.log('AI config ensured for workspace');

    // Create default topics
    const defaultTopics = [
      { handle: 'architecture', name: 'Architecture', description: 'System design decisions and patterns', icon: '🏗️' },
      { handle: 'operations', name: 'Operations', description: 'Deployment, monitoring, and runbooks', icon: '⚙️' },
      { handle: 'domain', name: 'Domain', description: 'Business logic and domain knowledge', icon: '📚' },
    ];

    // Get admin user id for created_by
    const { rows: adminUser } = await pool.query<{ id: string }>(
      `SELECT id FROM principals WHERE handle = 'admin' AND workspace_id = $1`,
      [workspaceId]
    );

    for (const topic of defaultTopics) {
      const { rows: existingTopic } = await pool.query(
        `SELECT id FROM topics WHERE handle = $1 AND workspace_id = $2`,
        [topic.handle, workspaceId]
      );

      if (existingTopic.length === 0) {
        await pool.query(
          `INSERT INTO topics (workspace_id, handle, name, description, icon, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [workspaceId, topic.handle, topic.name, topic.description, topic.icon, adminUser[0].id]
        );
        console.log(`Created topic: ${topic.name}`);
      } else {
        console.log(`Topic ${topic.name} already exists, skipping`);
      }
    }

    console.log('\nSeed completed successfully!');
    console.log('\nYou can now log in with:');
    console.log('  Email: admin@cortex.local');
    console.log('  Password: admin123');

  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
