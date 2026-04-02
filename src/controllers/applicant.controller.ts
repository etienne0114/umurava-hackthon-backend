import { Request, Response, NextFunction } from 'express';
import { applicantService } from '../services/applicant.service';
import { fileService } from '../services/file.service';
import { APIError } from '../middleware/errorHandler';

export class ApplicantController {
  async uploadApplicants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.body;
      const file = req.file;

      if (!file) {
        const error: APIError = new Error('No file uploaded');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const fileType = fileService.detectFileType(file.originalname);
      if (!fileType) {
        const error: APIError = new Error('Unsupported file type');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const applicants = await applicantService.uploadFromFile(
        jobId,
        file.buffer,
        fileType,
        file.originalname
      );

      res.status(201).json({
        success: true,
        data: applicants,
        meta: {
          count: applicants.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async importFromUmurava(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, profileIds } = req.body;

      if (!jobId || !profileIds || !Array.isArray(profileIds)) {
        const error: APIError = new Error('Job ID and profile IDs array are required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const applicants = await applicantService.importFromUmurava(jobId, profileIds);

      res.status(201).json({
        success: true,
        data: applicants,
        meta: {
          count: applicants.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getApplicants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.query.jobId as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const { applicants, total } = await applicantService.getApplicantsByJob(
        jobId,
        limit,
        offset
      );

      res.json({
        success: true,
        data: applicants,
        meta: {
          total,
          limit,
          offset,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getApplicantById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { applicantId } = req.params;
      const applicant = await applicantService.getApplicantById(applicantId);

      if (!applicant) {
        const error: APIError = new Error('Applicant not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({
        success: true,
        data: applicant,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateApplicant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { applicantId } = req.params;
      const updates = req.body;

      const applicant = await applicantService.updateApplicant(applicantId, updates);

      res.json({
        success: true,
        data: applicant,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteApplicant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { applicantId } = req.params;
      await applicantService.deleteApplicant(applicantId);

      res.json({
        success: true,
        message: 'Applicant deleted successfully',
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { applicantId } = req.params;
      const { status } = req.body;

      if (!status) {
        const error: APIError = new Error('Status is required');
        error.statusCode = 400;
        throw error;
      }

      const applicant = await applicantService.updateStatus(applicantId, status);

      res.json({
        success: true,
        data: applicant,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export const applicantController = new ApplicantController();
