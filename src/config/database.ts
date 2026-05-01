import mongoose from 'mongoose';
import logger from '../utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform';

// Cached connection for serverless reuse across warm invocations
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// In serverless, module-level variables persist across warm invocations within the same container
const cache: MongooseCache = { conn: null, promise: null };

export const connectDatabase = async (): Promise<void> => {
  // Already connected — reuse the existing connection
  if (cache.conn && mongoose.connection.readyState === 1) {
    return;
  }

  // Connection in flight — wait for it rather than opening a second one
  if (!cache.promise) {
    const opts = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: process.env.VERCEL ? 1 : 10, // Keep pool small in serverless
    };

    cache.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cache.conn = await cache.promise;
    logger.info('MongoDB connected successfully');
  } catch (error) {
    // Reset so the next request can try again
    cache.promise = null;
    cache.conn = null;
    logger.error('MongoDB connection failed:', error);
    throw error; // Let the caller handle it; never call process.exit in serverless
  }
};

mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error:', err);
  cache.conn = null;
  cache.promise = null;
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
  cache.conn = null;
  cache.promise = null;
});

// Only register SIGINT handler in non-serverless environments
if (!process.env.VERCEL) {
  process.on('SIGINT', async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed due to app termination');
    process.exit(0);
  });
}
