import { Router } from 'express';
import { screeningController } from '../controllers/screening.controller';
import { validate, screeningOptionsSchema } from '../middleware/validation';
import { screeningLimiter } from '../middleware/rateLimiter';
import { authenticate, authorize } from '../middleware/auth';
import { cacheMiddleware } from '../middleware/cache';

const router = Router();

// Health check for AI providers — uses zero-cost checks (countTokens, GET /models)
// Cached aggressively (120s at route level + 5min at controller level) to prevent overloading
router.get('/health', cacheMiddleware(120), screeningController.checkAIProviderHealth.bind(screeningController));

// Performance metrics for AI providers (no authentication required for monitoring)
router.get('/metrics', cacheMiddleware(30), screeningController.getAIProviderMetrics.bind(screeningController));

// All other screening routes require authentication
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

// Fix ranking issues for a specific job
router.post(
  '/fix-ranking/:jobId',
  authorize('company'),
  screeningController.fixRankingIssues.bind(screeningController)
);

export default router;
