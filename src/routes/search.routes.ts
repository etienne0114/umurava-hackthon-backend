import { Router } from 'express';
import { searchController } from '../controllers/search.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, searchController.search);

export default router;
