import { Router } from 'express';
import { jobController } from '../controllers/job.controller';
import { validate, jobSchema } from '../middleware/validation';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All job routes require authentication
router.use(authenticate);

// Company only: create a job
router.post('/', authorize('company'), validate(jobSchema), jobController.createJob.bind(jobController));

// GET /api/jobs — company sees own jobs, talent sees active jobs
router.get('/', jobController.getAllJobs.bind(jobController));

// Any authenticated user can view a single job
router.get('/:jobId', jobController.getJobById.bind(jobController));

// Company only: update and delete their own jobs
router.put('/:jobId', authorize('company'), jobController.updateJob.bind(jobController));
router.delete('/:jobId', authorize('company'), jobController.deleteJob.bind(jobController));

export default router;
