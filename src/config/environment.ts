import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  umuravaApiUrl: process.env.UMURAVA_API_URL || 'https://api.umurava.africa',
  umuravaApiKey: process.env.UMURAVA_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
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
