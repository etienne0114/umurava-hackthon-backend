import { Router, Request, Response, NextFunction } from 'express';
import { assessmentController } from '../controllers/assessment.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(authorize('company'));

// Gemini question generation can take up to 80s — set a long timeout on this route
const aiTimeout = (ms: number) => (_req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(ms, () => {
    res.status(503).json({ success: false, message: 'AI is taking too long. Please try again.' });
  });
  next();
};

router.post('/generate', aiTimeout(80000), (req: any, res) => assessmentController.generateAssessment(req, res));
router.post('/bulk-generate', (req: any, res) => assessmentController.bulkGenerateAssessments(req, res));
router.get('/applicant/:applicantId', (req: any, res) => assessmentController.getAssessmentByApplicant(req, res));
router.patch('/applicant/:applicantId/sent', (req: any, res) => assessmentController.confirmSent(req, res));

export default router;
