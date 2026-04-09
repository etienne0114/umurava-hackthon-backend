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

// Company endpoints
router.post('/generate', authorize('company'), aiTimeout(80000), (req: any, res) => assessmentController.generateAssessment(req, res));
router.post('/bulk-generate', authorize('company'), (req: any, res) => assessmentController.bulkGenerateAssessments(req, res));
router.get('/applicant/:applicantId', authorize('company'), (req: any, res) => assessmentController.getAssessmentByApplicant(req, res));
router.patch('/applicant/:applicantId/sent', authorize('company'), (req: any, res) => assessmentController.confirmSent(req, res));
router.get('/job/:jobId/latest-submitted', authorize('company'), (req: any, res) => assessmentController.getLatestSubmittedForJob(req, res));
router.get('/job/:jobId/status', authorize('company'), (req: any, res) => assessmentController.getJobAssessmentStatus(req, res));

// Talent endpoints
router.get('/my', authorize('talent'), (req: any, res) => assessmentController.getMyAssessments(req, res));
router.post('/my/:assessmentId/start', authorize('talent'), (req: any, res) => assessmentController.startMyAssessment(req, res));
router.post('/my/:assessmentId/submit', authorize('talent'), (req: any, res) => assessmentController.submitMyAssessment(req, res));

export default router;
