import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { UserRole } from '../models/User';
import { APIError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: UserRole;
  };
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error: APIError = new Error('No token provided');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);

    req.user = decoded;
    next();
  } catch (error: unknown) {
    const apiError: APIError = new Error((error as Error).message || 'Authentication failed');
    apiError.statusCode = 401;
    apiError.code = 'UNAUTHORIZED';
    next(apiError);
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      const error: APIError = new Error('User not authenticated');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      return next(error);
    }

    if (!roles.includes(req.user.role)) {
      const error: APIError = new Error('Insufficient permissions');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }

    next();
  };
};
