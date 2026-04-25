import { Router, Request, Response, NextFunction } from 'express';
import { assessmentController } from '../controllers/assessment.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Gemini question generation can take up to 80s - set a long timeout on this route
const aiTimeout = (ms: number) => (_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(ms, () => {
    res.status(503).json({ success: false, message: 'AI is taking too long. Please try again.' });
  });
  next();
};

// Bulk timeout: 90s per applicant (rate-limited to 5 concurrent), max 15 minutes
const bulkAiTimeout = (req: Request, res: Response, next: NextFunction) => {
  const count = Array.isArray(req.body?.applicantIds) ? req.body.applicantIds.length : 1;
  const perApplicant = 90000;
  const concurrency = 5;
  const ms = Math.min(Math.ceil(count / concurrency) * perApplicant + 30000, 900000);
  res.setTimeout(ms, () => {
    res.status(503).json({ success: false, message: 'Bulk assessment generation timed out. Please try again.' });
  });
  next();
};

// Company endpoints
router.post('/generate', authorize('company'), aiTimeout(80000), (req: import("express").Request, res: import("express").Response) => assessmentController.generateAssessment(req, res));
router.post('/bulk-generate', authorize('company'), bulkAiTimeout, (req: import("express").Request, res: import("express").Response) => assessmentController.bulkGenerateAssessments(req, res));
router.get('/applicant/:applicantId', authorize('company'), (req: import("express").Request, res: import("express").Response) => assessmentController.getAssessmentByApplicant(req, res));
router.patch('/applicant/:applicantId/sent', authorize('company'), (req: import("express").Request, res: import("express").Response) => assessmentController.confirmSent(req, res));
router.get('/job/:jobId/latest-submitted', authorize('company'), (req: import("express").Request, res: import("express").Response) => assessmentController.getLatestSubmittedForJob(req, res));
router.get('/job/:jobId/status', authorize('company'), (req: import("express").Request, res: import("express").Response) => assessmentController.getJobAssessmentStatus(req, res));

// Talent endpoints
router.get('/my', authorize('talent'), (req: import("express").Request, res: import("express").Response) => assessmentController.getMyAssessments(req, res));
router.post('/my/:assessmentId/start', authorize('talent'), (req: import("express").Request, res: import("express").Response) => assessmentController.startMyAssessment(req, res));
router.post('/my/:assessmentId/submit', authorize('talent'), (req: import("express").Request, res: import("express").Response) => assessmentController.submitMyAssessment(req, res));

export default router;
