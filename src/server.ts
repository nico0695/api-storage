import './config.js';
import { createApp, initializeDatabase } from './app.js';
import { logger } from './utils/logger.js';
const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();

    // Create and start Express app
    const app = await createApp();

    app.listen(PORT, () => {
      logger.info({ port: PORT }, `Server running on http://localhost:${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health');
      logger.info('  POST /files/upload');
      logger.info('  GET  /files');
      logger.info('  DELETE /files/:id');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
