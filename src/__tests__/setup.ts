/**
 * Test Setup File
 * Configures the test environment before running tests
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables first
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

// If GEMINI_API_KEY is not set in .env.test, try loading from .env
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

// Set test timeout
jest.setTimeout(180000); // 3 minutes for E2E tests

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
