import 'dotenv/config';
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Overall counts
  const tables = ['workspaces', 'principals', 'topics', 'threads', 'comments', 'artifacts', 'tasks', 'audit_logs'];
  console.log('=== TABLE COUNTS ===');
  for (const t of tables) {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${rows[0].count}`);
  }

  // 2. Thread analysis
  console.log('\n=== THREADS ===');
  const { rows: threads } = await pool.query(`
    SELECT t.id, t.title, t.type, t.status, t.comment_count, t.created_at,
           p.display_name as creator, p.kind as creator_kind,
           tp.name as topic_name
    FROM threads t
    JOIN principals p ON t.created_by = p.id
    JOIN topics tp ON t.topic_id = tp.id
    ORDER BY t.created_at DESC
  `);
  for (const t of threads) {
    console.log(`  [${t.status}] ${t.type} | ${t.comment_count} comments | ${t.creator} (${t.creator_kind}) | ${t.topic_name} | "${t.title.substring(0,80)}" | ${new Date(t.created_at).toISOString().substring(0,10)}`);
  }

  // 3. Comment analysis - types, authors, lengths
  console.log('\n=== COMMENT ANALYSIS ===');
  const { rows: commentStats } = await pool.query(`
    SELECT p.kind as creator_kind, p.display_name,
           c.type, COUNT(*) as count,
           AVG(LENGTH(c.body)) as avg_length,
           MIN(LENGTH(c.body)) as min_length,
           MAX(LENGTH(c.body)) as max_length
    FROM comments c
    JOIN principals p ON c.created_by = p.id
    GROUP BY p.kind, p.display_name, c.type
    ORDER BY count DESC
  `);
  for (const s of commentStats) {
    console.log(`  ${s.creator_kind}/${s.display_name} | ${s.type} | count: ${s.count} | avg_len: ${Math.round(s.avg_length)} | range: ${s.min_length}-${s.max_length}`);
  }

  // 4. Artifact analysis
  console.log('\n=== ARTIFACTS ===');
  const { rows: artifacts } = await pool.query(`
    SELECT a.id, a.title, a.type, a.status, a.version,
           LENGTH(a.body) as body_length,
           p.display_name as creator, p.kind as creator_kind,
           tp.name as topic_name,
           a.thread_id,
           a.created_at
    FROM artifacts a
    JOIN principals p ON a.created_by = p.id
    JOIN topics tp ON a.topic_id = tp.id
    ORDER BY a.created_at DESC
  `);
  for (const a of artifacts) {
    console.log(`  [${a.status}] ${a.type} | v${a.version} | ${a.body_length} chars | ${a.creator} (${a.creator_kind}) | ${a.topic_name} | thread:${a.thread_id ? 'yes' : 'no'} | "${a.title.substring(0,70)}" | ${new Date(a.created_at).toISOString().substring(0,10)}`);
  }

  // 5. Task analysis
  console.log('\n=== TASKS ===');
  const { rows: tasks } = await pool.query(`
    SELECT t.id, t.title, t.status, t.priority,
           p.display_name as creator, p.kind as creator_kind,
           t.created_at
    FROM tasks t
    JOIN principals p ON t.created_by = p.id
    ORDER BY t.created_at DESC
  `);
  for (const t of tasks) {
    console.log(`  [${t.status}] ${t.priority} | ${t.creator} (${t.creator_kind}) | "${t.title.substring(0,80)}" | ${new Date(t.created_at).toISOString().substring(0,10)}`);
  }

  // 6. Activity patterns - comments per day
  console.log('\n=== ACTIVITY BY DATE ===');
  const { rows: activity } = await pool.query(`
    SELECT DATE(created_at) as day, COUNT(*) as comments
    FROM comments
    GROUP BY DATE(created_at)
    ORDER BY day
  `);
  for (const a of activity) {
    console.log(`  ${new Date(a.day).toISOString().substring(0,10)}: ${a.comments} comments`);
  }

  // 7. Thread status distribution
  console.log('\n=== THREAD STATUS ===');
  const { rows: threadStatus } = await pool.query(`
    SELECT status, COUNT(*) FROM threads GROUP BY status
  `);
  for (const s of threadStatus) {
    console.log(`  ${s.status}: ${s.count}`);
  }

  // 8. Who creates what - principal activity
  console.log('\n=== PRINCIPAL ACTIVITY ===');
  const { rows: principals } = await pool.query(`
    SELECT p.id, p.handle, p.display_name, p.kind, p.trust_tier,
      (SELECT COUNT(*) FROM threads WHERE created_by = p.id) as threads_created,
      (SELECT COUNT(*) FROM comments WHERE created_by = p.id) as comments_created,
      (SELECT COUNT(*) FROM artifacts WHERE created_by = p.id) as artifacts_created,
      (SELECT COUNT(*) FROM tasks WHERE created_by = p.id) as tasks_created
    FROM principals p
  `);
  for (const p of principals) {
    console.log(`  ${p.kind}/${p.handle} (tier ${p.trust_tier}) | threads:${p.threads_created} comments:${p.comments_created} artifacts:${p.artifacts_created} tasks:${p.tasks_created}`);
  }

  // 9. Topics with their actual usage
  console.log('\n=== TOPIC USAGE ===');
  const { rows: topicUsage } = await pool.query(`
    SELECT tp.name,
      (SELECT COUNT(*) FROM threads WHERE topic_id = tp.id) as threads,
      (SELECT COUNT(*) FROM artifacts WHERE topic_id = tp.id) as artifacts,
      (SELECT COUNT(*) FROM tasks WHERE topic_id = tp.id) as tasks
    FROM topics tp
  `);
  for (const t of topicUsage) {
    console.log(`  ${t.name}: ${t.threads} threads, ${t.artifacts} artifacts, ${t.tasks} tasks`);
  }

  // 10. Comment depth analysis (nested replies)
  console.log('\n=== COMMENT DEPTH ===');
  const { rows: depth } = await pool.query(`
    SELECT depth, COUNT(*) FROM comments GROUP BY depth ORDER BY depth
  `);
  for (const d of depth) {
    console.log(`  depth ${d.depth}: ${d.count}`);
  }

  // 11. Tags usage
  console.log('\n=== TAG USAGE ===');
  const { rows: tags } = await pool.query(`
    SELECT unnest(tags) as tag, COUNT(*) as uses
    FROM (
      SELECT tags FROM threads WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
      UNION ALL
      SELECT tags FROM comments WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
      UNION ALL
      SELECT tags FROM artifacts WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
    ) t
    GROUP BY tag
    ORDER BY uses DESC
    LIMIT 30
  `);
  for (const t of tags) {
    console.log(`  ${t.tag}: ${t.uses}`);
  }

  // 12. Artifact lifecycle - any that went through draft->proposed->accepted?
  console.log('\n=== ARTIFACT VERSIONS ===');
  const { rows: versions } = await pool.query(`
    SELECT status, version, COUNT(*) FROM artifacts GROUP BY status, version ORDER BY status, version
  `);
  for (const v of versions) {
    console.log(`  ${v.status} v${v.version}: ${v.count}`);
  }

  // 13. Thread types distribution
  console.log('\n=== THREAD TYPES ===');
  const { rows: threadTypes } = await pool.query(`
    SELECT type, COUNT(*) FROM threads GROUP BY type
  `);
  for (const t of threadTypes) {
    console.log(`  ${t.type}: ${t.count}`);
  }

  // 14. Search vector population check
  console.log('\n=== SEARCH VECTORS ===');
  const { rows: svThreads } = await pool.query(`SELECT COUNT(*) as total, COUNT(search_vector) as indexed FROM threads`);
  const { rows: svComments } = await pool.query(`SELECT COUNT(*) as total, COUNT(search_vector) as indexed FROM comments`);
  const { rows: svArtifacts } = await pool.query(`SELECT COUNT(*) as total, COUNT(search_vector) as indexed FROM artifacts`);
  console.log(`  threads: ${svThreads[0].indexed}/${svThreads[0].total} indexed`);
  console.log(`  comments: ${svComments[0].indexed}/${svComments[0].total} indexed`);
  console.log(`  artifacts: ${svArtifacts[0].indexed}/${svArtifacts[0].total} indexed`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
