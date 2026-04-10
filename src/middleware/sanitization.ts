import { Request, Response, NextFunction } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import { body, validationResult } from 'express-validator';

/**
 * Sanitize request data to prevent NoSQL injection
 * Removes any keys that start with '$' or contain '.'
 */
export const sanitizeRequest = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized potentially malicious key: ${key} in request from ${req.ip}`);
  },
});

/**
 * Sanitize string inputs to prevent XSS attacks
 * Removes HTML tags and dangerous characters
 */
export const sanitizeString = (value: string): string => {
  if (typeof value !== 'string') return value;
  
  // Remove script tags and their content first (before removing all tags)
  let sanitized = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove all HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
};

/**
 * Sanitize array of strings
 */
export const sanitizeStringArray = (arr: string[]): string[] => {
  if (!Array.isArray(arr)) return arr;
  return arr.map(sanitizeString);
};

/**
 * Middleware to sanitize all string fields in request body
 */
export const sanitizeBody = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj: unknown): unknown => {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized: Record<string, unknown> = {};
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  for (const key in obj as Record<string, unknown>) {
    if (hasOwnProperty.call(obj, key)) {
      sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
  }
  
  return sanitized;
};

/**
 * Validation rules for common inputs
 */
export const emailValidation = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Invalid email address');

export const nameValidation = body('name')
  .isString()
  .trim()
  .isLength({ min: 2, max: 100 })
  .matches(/^[a-zA-Z\s'-]+$/)
  .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes');

export const phoneValidation = body('phone')
  .optional()
  .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
  .withMessage('Invalid phone number format');

/**
 * Middleware to check validation results
 */
export const checkValidation = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed',
        details: errors.array(),
      },
    });
    return;
  }
  next();
};
