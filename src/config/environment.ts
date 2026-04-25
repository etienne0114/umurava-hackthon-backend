import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: !!process.env.VERCEL,
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqBaseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  umuravaApiUrl: process.env.UMURAVA_API_URL || 'https://api.platform.africa',
  umuravaApiKey: process.env.UMURAVA_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-keep-it-safe',
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
  
  // Strict requirements for production
  if (process.env.NODE_ENV === 'production') {
    requiredVars.push('MONGODB_URI', 'JWT_SECRET', 'GROQ_API_KEY');
  }

  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`CRITICAL: Missing required environment variables: ${missing.join(', ')}`);
  }
};
