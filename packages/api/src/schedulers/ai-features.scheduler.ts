import cron from 'node-cron';
import { aiService } from '../services/ai.service.js';
import { aiConfigRepository } from '../repositories/ai-config.repository.js';
import db from '../db/index.js';

// Track last run dates to avoid duplicate runs
const lastResolutionDate: Record<string, string> = {};
const lastTriageDate: Record<string, string> = {};
const lastContradictionDate: Record<string, string> = {};
const lastSynthesisDate: Record<string, string> = {};
const lastStalenessDate: Record<string, string> = {};

/**
 * Daily features: Thread Resolution Prompt + Observation Triage
 */
async function runDailyFeatures(): Promise<void> {
  const { rows: workspaces } = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM ai_config WHERE enabled = true`,
  );

  const today = new Date().toISOString().split('T')[0];

  for (const ws of workspaces) {
    const config = await aiConfigRepository.getByWorkspace(ws.workspace_id);
    if (!config) continue;

    // Thread Resolution Prompts
    if (config.thread_resolution_prompt && lastResolutionDate[ws.workspace_id] !== today) {
      try {
        const { rows: staleThreads } = await db.query<{ id: string }>(
          `SELECT t.id FROM threads t
           WHERE t.workspace_id = $1
             AND t.status = 'open'
             AND t.created_at < NOW() - INTERVAL '7 days'
             AND NOT EXISTS (
               SELECT 1 FROM comments c
               WHERE c.thread_id = t.id AND c.created_at > NOW() - INTERVAL '3 days'
             )
             AND NOT EXISTS (
               SELECT 1 FROM comments c
               WHERE c.thread_id = t.id AND c.tags @> ARRAY['resolution-prompt']::text[]
                 AND c.created_at > NOW() - INTERVAL '7 days'
             )
           ORDER BY t.created_at ASC
           LIMIT 5`,
          [ws.workspace_id],
        );

        for (const thread of staleThreads) {
          try {
            await aiService.nudgeStaleThread(thread.id, ws.workspace_id);
            console.log(`Resolution prompt sent for thread ${thread.id}`);
          } catch (err) {
            console.error(`Resolution prompt failed for thread ${thread.id}:`, err);
          }
        }

        lastResolutionDate[ws.workspace_id] = today;
      } catch (err) {
        console.error(`Resolution prompt scan failed for workspace ${ws.workspace_id}:`, err);
      }
    }

    // Observation Triage
    if (config.auto_triage && lastTriageDate[ws.workspace_id] !== today) {
      try {
        const { rows: busyThreads } = await db.query<{ id: string }>(
          `SELECT t.id FROM threads t
           WHERE t.workspace_id = $1
             AND t.status = 'open'
             AND (SELECT COUNT(*) FROM comments c WHERE c.thread_id = t.id AND c.type = 'observation') >= 10
             AND NOT EXISTS (
               SELECT 1 FROM comments c
               WHERE c.thread_id = t.id AND c.tags @> ARRAY['observation-triage']::text[]
                 AND c.created_at > NOW() - INTERVAL '7 days'
             )
           ORDER BY t.comment_count DESC
           LIMIT 3`,
          [ws.workspace_id],
        );

        for (const thread of busyThreads) {
          try {
            await aiService.triageObservations(thread.id, ws.workspace_id);
            console.log(`Observation triage completed for thread ${thread.id}`);
          } catch (err) {
            console.error(`Observation triage failed for thread ${thread.id}:`, err);
          }
        }

        lastTriageDate[ws.workspace_id] = today;
      } catch (err) {
        console.error(`Observation triage scan failed for workspace ${ws.workspace_id}:`, err);
      }
    }
  }
}

/**
 * Periodic features: Contradiction Detection (every 3 days)
 */
async function runContradictionDetection(): Promise<void> {
  const now = new Date();
  // Run every 3 days: day-of-year mod 3 === 0
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  if (dayOfYear % 3 !== 0) return;

  const periodKey = `${now.getFullYear()}-D${dayOfYear}`;

  const { rows: workspaces } = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM ai_config WHERE enabled = true`,
  );

  for (const ws of workspaces) {
    if (lastContradictionDate[ws.workspace_id] === periodKey) continue;

    const config = await aiConfigRepository.getByWorkspace(ws.workspace_id);
    if (!config?.contradiction_detection) continue;

    try {
      const { rows: topics } = await db.query<{ id: string }>(
        `SELECT t.id FROM topics t
         WHERE t.workspace_id = $1
           AND (SELECT COUNT(*) FROM artifacts a WHERE a.topic_id = t.id AND a.status = 'accepted') >= 10`,
        [ws.workspace_id],
      );

      for (const topic of topics) {
        try {
          await aiService.detectContradictions(topic.id, ws.workspace_id);
          console.log(`Contradiction detection completed for topic ${topic.id}`);
        } catch (err) {
          console.error(`Contradiction detection failed for topic ${topic.id}:`, err);
        }
      }

      lastContradictionDate[ws.workspace_id] = periodKey;
    } catch (err) {
      console.error(`Contradiction detection scan failed for workspace ${ws.workspace_id}:`, err);
    }
  }
}

/**
 * Monthly features: Topic Synthesis (1st) + Staleness Detection (15th)
 */
async function runMonthlyFeatures(): Promise<void> {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const thisMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;

  const { rows: workspaces } = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM ai_config WHERE enabled = true`,
  );

  for (const ws of workspaces) {
    const config = await aiConfigRepository.getByWorkspace(ws.workspace_id);
    if (!config) continue;

    // Topic Synthesis — 1st of month
    if (dayOfMonth === 1 && lastSynthesisDate[ws.workspace_id] !== thisMonth) {
      try {
        const { rows: topics } = await db.query<{ id: string }>(
          `SELECT t.id FROM topics t
           WHERE t.workspace_id = $1
             AND (SELECT COUNT(*) FROM threads th WHERE th.topic_id = t.id AND th.status = 'resolved') >= 5`,
          [ws.workspace_id],
        );

        for (const topic of topics) {
          try {
            await aiService.generateTopicSynthesis(topic.id, ws.workspace_id);
            console.log(`Topic synthesis completed for topic ${topic.id}`);
          } catch (err) {
            console.error(`Topic synthesis failed for topic ${topic.id}:`, err);
          }
        }

        lastSynthesisDate[ws.workspace_id] = thisMonth;
      } catch (err) {
        console.error(`Topic synthesis scan failed for workspace ${ws.workspace_id}:`, err);
      }
    }

    // Staleness Detection — 1st and 15th of month (biweekly)
    const stalenessKey = `${thisMonth}-${dayOfMonth <= 15 ? 'A' : 'B'}`;
    if ((dayOfMonth === 1 || dayOfMonth === 15) && config.staleness_detection && lastStalenessDate[ws.workspace_id] !== stalenessKey) {
      try {
        const { rows: topics } = await db.query<{ id: string }>(
          `SELECT t.id FROM topics t
           WHERE t.workspace_id = $1
             AND (SELECT COUNT(*) FROM artifacts a WHERE a.topic_id = t.id AND a.status = 'accepted') >= 15`,
          [ws.workspace_id],
        );

        for (const topic of topics) {
          try {
            await aiService.detectStaleness(topic.id, ws.workspace_id);
            console.log(`Staleness detection completed for topic ${topic.id}`);
          } catch (err) {
            console.error(`Staleness detection failed for topic ${topic.id}:`, err);
          }
        }

        lastStalenessDate[ws.workspace_id] = stalenessKey;
      } catch (err) {
        console.error(`Staleness detection scan failed for workspace ${ws.workspace_id}:`, err);
      }
    }
  }
}

/**
 * Start the AI features scheduler. Checks every 5 minutes.
 * Handles daily (resolution prompt, observation triage),
 * weekly (contradiction detection), and monthly (synthesis, staleness) features.
 */
export function startAiFeaturesScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runDailyFeatures();
    } catch (err) {
      console.error('AI daily features scheduler error:', err);
    }

    try {
      await runContradictionDetection();
    } catch (err) {
      console.error('AI contradiction detection scheduler error:', err);
    }

    try {
      await runMonthlyFeatures();
    } catch (err) {
      console.error('AI monthly features scheduler error:', err);
    }
  });

  console.log('AI features scheduler started (checks every 5 minutes)');
}
