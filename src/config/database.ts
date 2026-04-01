import mongoose from 'mongoose';
import logger from '../utils/logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let retryCount = 0;

const connectWithRetry = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected successfully');
    retryCount = 0;
  } catch (error) {
    retryCount++;
    logger.error(`MongoDB connection failed (attempt ${retryCount}/${MAX_RETRIES}):`, error);

    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
      logger.info(`Retrying connection in ${delay}ms...`);
      setTimeout(connectWithRetry, delay);
    } else {
      logger.error('Max retry attempts reached. Exiting...');
      process.exit(1);
    }
  }
};

mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

export const connectDatabase = connectWithRetry;
