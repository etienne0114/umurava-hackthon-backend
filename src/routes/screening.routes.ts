import { Router } from 'express';
import { screeningController } from '../controllers/screening.controller';
import { validate, screeningOptionsSchema } from '../middleware/validation';
import { screeningLimiter } from '../middleware/rateLimiter';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All screening routes require authentication
router.use(authenticate);

// Company only: start screening
router.post(
  '/start',
  authorize('company'),
  screeningLimiter,
  validate(screeningOptionsSchema),
  screeningController.startScreening.bind(screeningController)
);

router.get('/session/:sessionId', screeningController.getScreeningStatus.bind(screeningController));

router.get('/results/:jobId', screeningController.getScreeningResults.bind(screeningController));

router.post(
  '/regenerate',
  authorize('company'),
  screeningLimiter,
  screeningController.regenerateScreening.bind(screeningController)
);

export default router;
