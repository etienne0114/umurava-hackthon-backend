import { Router } from 'express';
import { companyController } from '../controllers/company.controller';
import { authenticate, authorize } from '../middleware/auth';
import { cacheMiddleware } from '../middleware/cache';

const router = Router();

// Dashboard stats: Requires authentication and 'company' role
router.get(
  '/dashboard/stats',
  authenticate,
  authorize('company'),
  cacheMiddleware(30), // Cache for 30 seconds
  companyController.getDashboardStats.bind(companyController)
);

export default router;
