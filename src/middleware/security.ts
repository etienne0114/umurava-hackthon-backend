import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Comprehensive helmet configuration for security headers
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://generativelanguage.googleapis.com'], // Allow Gemini API
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  // Strict Transport Security - Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  
  // Prevent MIME type sniffing
  noSniff: true,
  
  // XSS Protection (legacy browsers)
  xssFilter: true,
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  
  // Permissions Policy (formerly Feature Policy)
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
});

/**
 * CORS configuration with origin whitelist
 */
export const getCorsOptions = () => {
  // Parse allowed origins from environment variable
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // 24 hours
  };
};

/**
 * Security middleware to add custom security headers
 */
export const customSecurityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Permissions Policy - restrict browser features
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  
  next();
};

/**
 * Request size limiter to prevent DoS attacks
 */
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = req.headers['content-length'];
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (size > maxSize) {
      res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload too large',
        },
      });
      return;
    }
  }
  
  next();
};

/**
 * IP-based request tracking for security monitoring
 */
const requestTracker = new Map<string, { count: number; firstRequest: number }>();

export const trackRequests = (req: Request, _res: Response, next: NextFunction): void => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const tracker = requestTracker.get(ip);
  
  if (tracker) {
    tracker.count++;
    
    // Reset counter every hour
    if (now - tracker.firstRequest > 3600000) {
      requestTracker.set(ip, { count: 1, firstRequest: now });
    }
    
    // Log suspicious activity (more than 1000 requests per hour)
    if (tracker.count > 1000) {
      console.warn(`Suspicious activity detected from IP: ${ip} (${tracker.count} requests in last hour)`);
    }
  } else {
    requestTracker.set(ip, { count: 1, firstRequest: now });
  }
  
  next();
};

/**
 * Clean up old tracking data periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, tracker] of requestTracker.entries()) {
    if (now - tracker.firstRequest > 3600000) {
      requestTracker.delete(ip);
    }
  }
}, 600000); // Clean up every 10 minutes
