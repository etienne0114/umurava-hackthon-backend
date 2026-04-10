import { Request, Response, NextFunction } from 'express';
import { screeningService } from '../services/screening.service';
import { APIError } from '../middleware/errorHandler';

export class ScreeningController {
  async startScreening(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, options } = req.body;

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const session = await screeningService.startScreening(jobId, options);

      res.status(201).json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async getScreeningStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await screeningService.getScreeningStatus(sessionId);

      if (!session) {
        const error: APIError = new Error('Screening session not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async getScreeningResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const results = await screeningService.getScreeningResults(jobId, limit);

      res.json({
        success: true,
        data: results,
        meta: {
          count: results.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async regenerateScreening(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, applicantIds } = req.body;

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const session = await screeningService.regenerateScreening(jobId, applicantIds);

      res.status(201).json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const screeningController = new ScreeningController();
