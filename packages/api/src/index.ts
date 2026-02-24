import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { generateRequestId } from './utils/request-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerAuthPlugin } from './middleware/authenticate.js';
import { authRoutes } from './routes/auth.js';
import { topicsRoutes } from './routes/topics.js';
import { threadsRoutes } from './routes/threads.js';
import { commentsRoutes } from './routes/comments.js';
import { artifactsRoutes } from './routes/artifacts.js';
import { tasksRoutes } from './routes/tasks.js';
import { searchRoutes } from './routes/search.js';
import { activityRoutes } from './routes/activity.js';
import { knowledgeLinksRoutes } from './routes/knowledge-links.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { aiRoutes } from './routes/ai.js';
import { eventsRoutes } from './routes/events.js';
import { checkConnection, runMigrations, db } from './db/index.js';
import { registerAiListeners } from './listeners/ai-listeners.js';
import { startDigestScheduler } from './schedulers/digest.scheduler.js';
import { startAiFeaturesScheduler } from './schedulers/ai-features.scheduler.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Create Fastify instance
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    genReqId: generateRequestId,
    // Agentic AI research can take 10+ minutes
    connectionTimeout: 1200000,  // 20 min
    keepAliveTimeout: 1200000,   // 20 min
  });

  // Register CORS
  await app.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
  });

  // Register auth plugin (decorates request with user)
  registerAuthPlugin(app);

  // Add request ID to all requests
  app.addHook('onRequest', async (request, reply) => {
    (request as unknown as { requestId: string }).requestId = request.id;
  });

  // Set error handler
  app.setErrorHandler(errorHandler);

  // Health check endpoint
  app.get('/health', async () => {
    const dbConnected = await checkConnection();
    return {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
    };
  });

  // API version prefix
  app.register(
    async (api) => {
      // Auth routes
      await api.register(authRoutes, { prefix: '/auth' });

      // Core CRUD routes
      await api.register(topicsRoutes, { prefix: '/topics' });
      await api.register(threadsRoutes, { prefix: '/threads' });
      await api.register(commentsRoutes); // Mixed prefixes handled internally
      await api.register(artifactsRoutes, { prefix: '/artifacts' });
      await api.register(tasksRoutes, { prefix: '/tasks' });
      await api.register(searchRoutes, { prefix: '/search' });
      await api.register(activityRoutes, { prefix: '/activity' });
      await api.register(knowledgeLinksRoutes, { prefix: '/knowledge-links' });
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(aiRoutes, { prefix: '/ai' });
      await api.register(eventsRoutes, { prefix: '/events' });
    },
    { prefix: '/v1' }
  );

  // Check database connection
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database. Check DATABASE_URL.');
    process.exit(1);
  }

  console.log('Database connected successfully');

  // Clean up zombie AI jobs from previous server instance
  try {
    const { rowCount } = await db.query(
      `UPDATE ai_jobs SET status = 'failed' WHERE status = 'running' AND created_at < NOW() - INTERVAL '30 minutes'`
    );
    if (rowCount && rowCount > 0) {
      console.log(`Cleaned ${rowCount} zombie AI job(s) from previous server instance`);
    }
  } catch (e) {
    console.error('Failed to clean zombie jobs:', e);
  }

  // Run migrations if needed
  if (process.env.RUN_MIGRATIONS === 'true') {
    await runMigrations();
  }

  // Start AI event listeners and digest scheduler
  registerAiListeners();
  startDigestScheduler();
  startAiFeaturesScheduler();

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Prevent silent crashes from unhandled errors during agentic execution
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION — server staying alive:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION — server staying alive:', reason);
});

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
