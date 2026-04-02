import { Router } from 'express';
import { assessmentController } from '../controllers/assessment.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(authorize('company'));

router.post('/generate', (req: any, res) => assessmentController.generateAssessment(req, res));
router.post('/bulk-generate', (req: any, res) => assessmentController.bulkGenerateAssessments(req, res));
router.get('/applicant/:applicantId', (req: any, res) => assessmentController.getAssessmentByApplicant(req, res));
router.patch('/applicant/:applicantId/sent', (req: any, res) => assessmentController.confirmSent(req, res));

export default router;
