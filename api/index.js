// Vercel serverless function entry point
require('dotenv').config();

process.env.VERCEL = '1';

let app;
try {
  app = require('../dist/server.js').default;
} catch (error) {
  console.error('Failed to load Express app:', error);
  throw error;
}

if (!app || typeof app !== 'function') {
  throw new Error('Invalid Express app export from dist/server.js');
}

// Lazy DB connection: ensure Mongoose is connected before processing each request.
// Vercel serverless containers can be reused (warm) or recycled (cold start).
// On cold start the module-level connectDatabase() in server.js fires, but it is
// async — it may not have resolved before the first request arrives.  This wrapper
// guarantees the connection is established (or throws a 503) before Express sees
// the request.
const { connectDatabase } = require('../dist/config/database.js');

const handler = async (req, res) => {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('DB connection failed on request:', err);
    res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' });
    return;
  }
  app(req, res);
};

module.exports = handler;
