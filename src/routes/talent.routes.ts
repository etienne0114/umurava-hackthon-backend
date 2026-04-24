import { Router } from 'express';
import { talentController } from '../controllers/talent.controller';
import { authenticate } from '../middleware/auth';
import { upload, validateUploadedFile } from '../middleware/fileUpload';
import { uploadLimiter } from '../middleware/rateLimiter';
import { cacheMiddleware } from '../middleware/cache';

const router = Router();

// All talent routes require authentication
router.use(authenticate);

// Dashboard data endpoints with caching
router.get('/dashboard/stats', cacheMiddleware(30), talentController.getDashboardStats.bind(talentController));
router.get('/dashboard/engagement', cacheMiddleware(60), talentController.getEngagementData.bind(talentController));

// Job recommendations & applications
router.get('/recommendations', cacheMiddleware(60), talentController.getJobRecommendations.bind(talentController));
router.post('/apply/:jobId', talentController.applyToJob.bind(talentController));
router.get('/applications', cacheMiddleware(30), talentController.getApplications.bind(talentController));
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
