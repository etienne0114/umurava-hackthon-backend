import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { jobService, CreateJobDTO } from '../services/job.service';
import { APIError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export class JobController {
  async createJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobData: CreateJobDTO = {
        ...req.body,
        createdBy: new mongoose.Types.ObjectId(req.user!.userId) as any,
        company: req.body.company,
      };
      const job = await jobService.createJob(jobData);

      res.status(201).json({
        success: true,
        data: job,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getAllJobs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as any;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const role = req.user!.role;
      const userId = req.user!.userId;

      // Company users see only their own jobs; talent sees all active jobs
      const createdBy = role === 'company' ? userId : undefined;
      const effectiveStatus = role === 'talent' ? (status || 'active') : status;

      const { jobs, total } = await jobService.getAllJobs({
        status: effectiveStatus,
        limit,
        offset,
        createdBy,
      });

      res.json({
        success: true,
        data: jobs,
        meta: { total, limit, offset, timestamp: new Date().toISOString() },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getJobById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = await jobService.getJobById(jobId);

      if (!job) {
        const error: APIError = new Error('Job not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({
        success: true,
        data: job,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user!.userId;

      // Ensure the company owns this job
      const existing = await jobService.getJobById(jobId);
      if (!existing) {
        const error: APIError = new Error('Job not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }
      const ownerId = (existing.createdBy as any)._id?.toString() || existing.createdBy.toString();
      if (ownerId !== userId) {
        const error: APIError = new Error('You do not own this job');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      const job = await jobService.updateJob(jobId, req.body);

      res.json({
        success: true,
        data: job,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteJob(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const userId = req.user!.userId;

      const existing = await jobService.getJobById(jobId);
      if (!existing) {
        const error: APIError = new Error('Job not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }
      const ownerId = (existing.createdBy as any)._id?.toString() || existing.createdBy.toString();
      if (ownerId !== userId) {
        const error: APIError = new Error('You do not own this job');
        error.statusCode = 403;
        error.code = 'FORBIDDEN';
        throw error;
      }

      await jobService.deleteJob(jobId);

      res.json({
        success: true,
        message: 'Job deleted successfully',
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export const jobController = new JobController();
