import { Router } from 'express';
import { applicantController } from '../controllers/applicant.controller';
import { upload, validateUploadedFile } from '../middleware/fileUpload';
import { uploadLimiter, heavyOperationLimiter } from '../middleware/rateLimiter';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All applicant routes require authentication (company only for mutations)
router.use(authenticate);

// Company only: upload applicants via file
router.post(
  '/upload',
  authorize('company'),
  uploadLimiter,
  upload.single('file'),
  validateUploadedFile,
  applicantController.uploadApplicants.bind(applicantController)
);

// Company only: import from Umurava
router.post(
  '/import',
  authorize('company'),
  heavyOperationLimiter,
  applicantController.importFromUmurava.bind(applicantController)
);

router.get('/', applicantController.getApplicants.bind(applicantController));

router.get('/:applicantId', applicantController.getApplicantById.bind(applicantController));

router.put('/:applicantId', authorize('company'), applicantController.updateApplicant.bind(applicantController));

router.delete('/:applicantId', authorize('company'), applicantController.deleteApplicant.bind(applicantController));

router.patch('/:applicantId/status', authorize('company'), applicantController.updateStatus.bind(applicantController));

export default router;
