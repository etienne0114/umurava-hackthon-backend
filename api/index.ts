// Vercel serverless entry point.
// @vercel/node compiles this TypeScript file directly using its built-in
// compiler — no tsc / dist/ build step is required on Vercel.

// Must be set before server.ts is imported so connectDatabase() knows
// to run in serverless mode (no setInterval, small pool, no process.exit).
process.env.VERCEL = '1';

import type { Request, Response, NextFunction } from 'express';
import app from '../src/server';
import { connectDatabase } from '../src/config/database';

export default async function handler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await connectDatabase();
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' });
    return;
  }
  // Express Application implements RequestHandler — callable as (req, res, next)
  app(req, res, next);
}
