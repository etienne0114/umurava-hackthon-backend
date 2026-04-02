import { Router } from 'express';
import { talentController } from '../controllers/talent.controller';
import { authenticate } from '../middleware/auth';
import { upload, validateUploadedFile } from '../middleware/fileUpload';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

// All talent routes require authentication
router.use(authenticate);

// Dashboard data endpoints
router.get('/dashboard/stats', talentController.getDashboardStats.bind(talentController));
router.get('/dashboard/engagement', talentController.getEngagementData.bind(talentController));

// Job recommendations & applications
router.get('/recommendations', talentController.getJobRecommendations.bind(talentController));
router.post('/apply/:jobId', talentController.applyToJob.bind(talentController));
router.get('/applications', talentController.getApplications.bind(talentController));
router.post('/saved/:jobId', talentController.saveJob.bind(talentController));
router.delete('/saved/:jobId', talentController.unsaveJob.bind(talentController));

// CV / Resume upload — parses with Gemini AI and auto-updates profile
router.post(
  '/resume',
  uploadLimiter,
  upload.single('resume'),
  validateUploadedFile,
  talentController.uploadResume.bind(talentController)
);

export default router;
