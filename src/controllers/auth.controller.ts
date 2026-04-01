import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { APIError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, role, name, phone, company, position } = req.body;

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
        phone,
        company,
        position,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful',
      });
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      next(error);
    }
  }
}

export const authController = new AuthController();
