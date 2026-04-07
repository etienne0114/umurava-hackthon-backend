import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: !!process.env.VERCEL,
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  openRouterModel: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v3.2',
  openRouterSiteUrl:
    process.env.OPENROUTER_SITE_URL ||
    process.env.CORS_ORIGIN ||
    process.env.CORS_ALLOWED_ORIGINS?.split(',')[0] ||
    '',
  openRouterAppName: process.env.OPENROUTER_APP_NAME || 'Umurava Recruit',
  umuravaApiUrl: process.env.UMURAVA_API_URL || 'https://api.umurava.africa',
  umuravaApiKey: process.env.UMURAVA_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  corsOrigin: process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  uploadDir: process.env.UPLOAD_DIR || 
    (process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'uploads')),
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const validateConfig = (): void => {
  // Skip validation in test mode
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  
  const requiredVars = ['GEMINI_API_KEY'];
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
