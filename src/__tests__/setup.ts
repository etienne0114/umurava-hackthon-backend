/**
 * Test Setup File
 * Configures the test environment before running tests
 */

import dotenv from 'dotenv';
import path from 'path';
import supertest from 'supertest';
import http from 'http';

// Load test environment variables first
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

// If GEMINI_API_KEY is not set in .env.test, try loading from .env
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

// Set test timeout
jest.setTimeout(180000); // 3 minutes for E2E tests

const TEST_SERVER_HOST = process.env.TEST_SERVER_HOST || '127.0.0.1';

supertest.Test.prototype.serverAddress = function (app: any, path: string) {
  const server: http.Server = this._server || app;
  const addr = server.address ? server.address() : null;
  if (!addr) {
    this._server = app.listen(0, TEST_SERVER_HOST);
  }
  const boundServer: http.Server = this._server || app;
  const boundAddr = boundServer.address ? boundServer.address() : null;
  if (!boundAddr) {
    throw new Error('Unable to determine test server address');
  }
  const protocol = boundServer instanceof http.Server ? 'https' : 'http';
  return `${protocol}://${TEST_SERVER_HOST}:${boundAddr.port}${path}`;
};

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
