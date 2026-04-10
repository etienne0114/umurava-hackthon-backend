import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { APIError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { config } from '../config/environment';
import logger from '../utils/logger';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        email,
        password,
        role,
        name,
        firstName,
        lastName,
        headline,
        location,
        phone,
        company,
        position,
      } = req.body;

      if (!email || !password || !role || !name) {
        const error: APIError = new Error('Email, password, role, and name are required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      if (!['talent', 'company'].includes(role)) {
        const error: APIError = new Error('Role must be either "talent" or "company"');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const result = await authService.register({
        email,
        password,
        role,
        name,
        firstName,
        lastName,
        headline,
        location,
        phone,
        company,
        position,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful',
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        const error: APIError = new Error('Email and password are required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const result = await authService.login({ email, password });

      res.json({
        success: true,
        data: result,
        message: 'Login successful',
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        const error: APIError = new Error('User not authenticated');
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        throw error;
      }

      const user = await authService.getUserById(req.user.userId);

      if (!user) {
        const error: APIError = new Error('User not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          isVerified: user.isVerified,
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        const error: APIError = new Error('User not authenticated');
        error.statusCode = 401;
        error.code = 'UNAUTHORIZED';
        throw error;
      }

      const updates = req.body;
      const user = await authService.updateProfile(req.user.userId, updates);

      res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
        },
        message: 'Profile updated successfully',
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async uploadAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info(`Received avatar upload request for user ${req.user?.userId}`);
      
      if (!req.user || !req.file) {
        logger.warn('Avatar upload failed: User not authenticated or no file provided');
        const error: APIError = new Error('User not authenticated or no file provided');
        error.statusCode = 400;
        error.code = 'BAD_REQUEST';
        throw error;
      }

      const userId = req.user.userId;
      const file = req.file;
      const extension = path.extname(file.originalname) || '.png';
      const fileName = `avatar-${userId}-${Date.now()}${extension}`;
      const avatarDir = path.join(config.uploadDir, 'avatars');
      const filePath = path.join(avatarDir, fileName);

      // Ensure directory exists
      if (!fs.existsSync(avatarDir)) {
        fs.mkdirSync(avatarDir, { recursive: true });
      }

      // Save file
      logger.info(`Saving avatar for user ${userId} to ${filePath}`);
      fs.writeFileSync(filePath, file.buffer);

      // Update user profile with relative URL
      const avatarUrl = `/uploads/avatars/${fileName}`;
      const user = await authService.updateProfile(userId, { avatar: avatarUrl });
      
      logger.info(`Avatar uploaded and profile updated for user ${userId}: ${avatarUrl}`);

      res.json({
        success: true,
        data: {
          avatarUrl,
          user: {
            id: user._id,
            profile: user.profile,
          }
        },
        message: 'Avatar uploaded successfully',
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const authController = new AuthController();
