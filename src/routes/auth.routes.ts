import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { upload, validateUploadedFile } from '../middleware/fileUpload';
import { authLimiter, uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

// Apply strict rate limiting to authentication endpoints
router.post('/register', authLimiter, authController.register.bind(authController));
router.post('/login', authLimiter, authController.login.bind(authController));
router.get('/profile', authenticate, authController.getProfile.bind(authController));
router.put('/profile', authenticate, authController.updateProfile.bind(authController));
router.post(
  '/profile/avatar',
  authenticate,
  uploadLimiter,
  upload.single('avatar'),
  validateUploadedFile,
  authController.uploadAvatar.bind(authController)
);

export default router;
