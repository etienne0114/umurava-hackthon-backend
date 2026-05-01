// Vercel serverless function entry point
// This file is executed by Vercel's serverless runtime

// Load environment variables
require('dotenv').config();

// Import the compiled Express app
// The dist folder is created during vercel-build
const app = require('../dist/server.js').default;

// Export for Vercel serverless
module.exports = app;
