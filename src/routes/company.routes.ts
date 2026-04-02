import { Router } from 'express';
import { companyController } from '../controllers/company.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Dashboard stats: Requires authentication and 'company' role
router.get(
  '/dashboard/stats',
  authenticate,
  authorize('company'),
  companyController.getDashboardStats.bind(companyController)
);

export default router;
