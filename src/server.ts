import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config, validateConfig } from './config/environment';
import { getGeminiModel } from './config/gemini';
import { connectDatabase } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { 
  securityHeaders, 
  getCorsOptions, 
  customSecurityHeaders, 
  requestSizeLimiter,
  trackRequests 
} from './middleware/security';
import { sanitizeRequest, sanitizeBody } from './middleware/sanitization';
import { generalLimiter } from './middleware/rateLimiter';
import logger from './utils/logger';

validateConfig();

const app: Application = express();

// Trust proxy - important for rate limiting and IP tracking behind reverse proxy
app.set('trust proxy', 1);

// Security headers (helmet.js)
app.use(securityHeaders);
app.use(customSecurityHeaders);

// CORS with origin whitelist
app.use(cors(getCorsOptions()));

// Request tracking for security monitoring
app.use(trackRequests);

// Request size limiter
app.use(requestSizeLimiter);

// General rate limiting for all API routes
app.use('/api/', generalLimiter);

// Serve static uploads BEFORE any other API routes to ensure they aren't intercepted
// Mount directly under /api/uploads to match the frontend expectations
// Serve static assets with absolute reliability using config.uploadDir
const uploadsPath = config.uploadDir;

// Ensure upload directory exists
if (!fs.existsSync(uploadsPath)) {
  try {
    fs.mkdirSync(uploadsPath, { recursive: true });
    logger.info(`Created upload directory at ${uploadsPath}`);
  } catch (err) {
    logger.error(`Failed to create upload directory at ${uploadsPath}:`, err);
  }
}

app.use('/api/uploads', express.static(uploadsPath));
app.use('/uploads', express.static(uploadsPath));

// Manual fallback route for absolute certainty
app.get('/api/uploads/:type/:file', (req, res) => {
  const filePath = path.join(uploadsPath, req.params.type, req.params.file);
  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error(`Asset fetch failed at ${filePath}: ${err.message}`);
      res.status(404).json({ error: 'Asset not found' });
    }
  });
});

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization middleware
app.use(sanitizeRequest); // NoSQL injection prevention
app.use(sanitizeBody); // XSS prevention

// Request logging
app.use((req: Request, _res: Response, next) => {
  logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  let geminiStatus = 'ok';
  try {
    const model = getGeminiModel();
    await model.generateContent('ping');
  } catch {
    geminiStatus = 'degraded';
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'ok',
      gemini: geminiStatus,
    },
  });
});

// Import routes
import authRoutes from './routes/auth.routes';
import jobRoutes from './routes/job.routes';
import applicantRoutes from './routes/applicant.routes';
import screeningRoutes from './routes/screening.routes';
import talentRoutes from './routes/talent.routes';
import searchRoutes from './routes/search.routes';
import notificationRoutes from './routes/notification.routes';
import companyRoutes from './routes/company.routes';
import assessmentRoutes from './routes/assessment.routes';

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/screening', screeningRoutes);
app.use('/api/talent', talentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/assessments', assessmentRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      logger.info('Security features enabled: Rate limiting, CORS whitelist, Input sanitization, Security headers');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
