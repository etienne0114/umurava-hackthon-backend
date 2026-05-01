// Root-level Vercel serverless function for backend deployment
// This is the entry point that Vercel will find and execute

// Set VERCEL environment variable
process.env.VERCEL = '1';

// Import the compiled Express app
let app;
try {
  // Load from dist (same directory level as api/)
  app = require('../dist/server.js').default;
  console.log('[Vercel] Successfully loaded Express app from dist/server.js');
} catch (error) {
  console.error('[Vercel] Failed to load Express app:', error.message);
  console.error('[Vercel] Error stack:', error.stack);
  
  // Return a helpful error response
  module.exports = (req, res) => {
    res.status(500).json({
      error: 'Failed to load backend application',
      message: error.message,
      hint: 'Check Vercel build logs for compilation errors'
    });
  };
  return;
}

// Verify app is valid
if (!app || typeof app !== 'function') {
  console.error('[Vercel] Invalid Express app export');
  module.exports = (req, res) => {
    res.status(500).json({
      error: 'Invalid Express application',
      hint: 'The dist/server.js must export an Express app as default'
    });
  };
} else {
  // Export the Express app for Vercel
  module.exports = app;
  console.log('[Vercel] Express app exported successfully');
}
