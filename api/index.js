// Vercel serverless function entry point
// This file is executed by Vercel's serverless runtime

// Load environment variables first
require('dotenv').config();

// Set VERCEL environment variable to prevent server.listen() from being called
process.env.VERCEL = '1';

// Import the compiled Express app
// The dist folder is created during vercel-build
let app;
try {
  app = require('../dist/server.js').default;
  console.log('Successfully loaded Express app from dist/server.js');
} catch (error) {
  console.error('Failed to load Express app:', error);
  throw error;
}

// Verify app is an Express application
if (!app || typeof app !== 'function') {
  throw new Error('Invalid Express app export from dist/server.js');
}

// Export for Vercel serverless
module.exports = app;
