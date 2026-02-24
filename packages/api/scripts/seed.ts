import 'dotenv/config';
import pg from 'pg';
import argon2 from 'argon2';

const { Pool } = pg;

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Seeding database...');

    // Create default workspace
    const { rows: workspaceRows } = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name, description)
       VALUES ('Default Workspace', 'The default Cortex workspace')
       ON CONFLICT DO NOTHING
       RETURNING id`
    );

    let workspaceId: string;
    if (workspaceRows.length > 0) {
      workspaceId = workspaceRows[0].id;
      console.log(`Created workspace: ${workspaceId}`);
    } else {
      // Workspace exists, get its ID
      const { rows } = await pool.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE name = 'Default Workspace'`
      );
      workspaceId = rows[0].id;
      console.log(`Using existing workspace: ${workspaceId}`);
    }

    // Hash password for admin user
    const passwordHash = await argon2.hash('admin123', ARGON2_OPTIONS);

    // Create admin user
    const { rows: userRows } = await pool.query<{ id: string }>(
      `INSERT INTO principals (workspace_id, kind, handle, display_name, email, password_hash, trust_tier)
       VALUES ($1, 'human', 'admin', 'Admin User', 'admin@cortex.local', $2, 2)
       ON CONFLICT (workspace_id, email) DO UPDATE SET password_hash = $2
       RETURNING id`,
      [workspaceId, passwordHash]
    );

    console.log(`Admin user created/updated: ${userRows[0].id}`);
    console.log('\n=== Login Credentials ===');
    console.log('Email: admin@cortex.local');
    console.log('Password: admin123');
    console.log('=========================\n');

    // Create a sample topic
    const { rows: topicRows } = await pool.query<{ id: string }>(
      `INSERT INTO topics (workspace_id, handle, name, description, icon, created_by)
       VALUES ($1, 'general', 'General', 'General discussions and documentation', '📚', $2)
       ON CONFLICT (workspace_id, handle) DO NOTHING
       RETURNING id`,
      [workspaceId, userRows[0].id]
    );

    if (topicRows.length > 0) {
      console.log(`Created topic 'General': ${topicRows[0].id}`);

      // Create a sample thread
      const { rows: threadRows } = await pool.query<{ id: string }>(
        `INSERT INTO threads (workspace_id, topic_id, title, type, body, created_by)
         VALUES ($1, $2, 'Welcome to Cortex', 'discussion',
                 'This is the first thread in your Cortex knowledge base. Use it to discuss and document your projects.',
                 $3)
         RETURNING id`,
        [workspaceId, topicRows[0].id, userRows[0].id]
      );

      console.log(`Created welcome thread: ${threadRows[0].id}`);
    }

    console.log('Seeding complete!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
