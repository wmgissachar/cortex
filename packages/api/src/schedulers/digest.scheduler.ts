import cron from 'node-cron';
import { aiService } from '../services/ai.service.js';
import db from '../db/index.js';
import type { AiPersona } from '@cortex/shared';

// Track last digest date per workspace to avoid duplicate runs
const lastDigestDate: Record<string, string> = {};

/**
 * Check all AI-enabled workspaces and trigger daily digest
 * if the current time matches their configured daily_digest_time.
 */
async function checkAndRunDigests(): Promise<void> {
  const { rows } = await db.query<{
    workspace_id: string;
    daily_digest_time: string;
  }>(
    `SELECT workspace_id, daily_digest_time FROM ai_config WHERE enabled = true`,
  );

  if (rows.length === 0) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  for (const row of rows) {
    // Skip if already ran today for this workspace
    if (lastDigestDate[row.workspace_id] === today) continue;

    // Parse configured time (e.g., "07:00")
    const [targetHour, targetMinute] = row.daily_digest_time.split(':').map(Number);

    // Check if we're within the 5-minute window of the target time
    const targetTotalMinutes = targetHour * 60 + targetMinute;
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const diff = currentTotalMinutes - targetTotalMinutes;

    if (diff >= 0 && diff < 5) {
      console.log(`Triggering daily digest for workspace ${row.workspace_id}`);
      try {
        await aiService.triggerJob(
          'scribe' as AiPersona,
          row.workspace_id, // targetId = workspaceId for digest
          row.workspace_id,
          { feature: 'daily-digest', targetType: 'workspace' },
        );
        lastDigestDate[row.workspace_id] = today;
        console.log(`Daily digest completed for workspace ${row.workspace_id}`);
      } catch (err) {
        console.error(`Daily digest failed for workspace ${row.workspace_id}:`, err);
      }
    }
  }
}

/**
 * Start the digest scheduler. Checks every 5 minutes.
 * Called once at server startup.
 */
export function startDigestScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await checkAndRunDigests();
    } catch (err) {
      console.error('Digest scheduler error:', err);
    }
  });

  console.log('Digest scheduler started (checks every 5 minutes)');
}
