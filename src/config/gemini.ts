import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export const getGeminiModel = (modelName: string = DEFAULT_MODEL) => {
  return genAI.getGenerativeModel({ model: modelName });
};

export class GeminiRateLimiter {
  private activeRequests = 0;
  private readonly maxConcurrent: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.maxConcurrent) {
      await this.waitForSlot();
    }

    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

export const geminiRateLimiter = new GeminiRateLimiter(5);

export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Never retry quota/not-found errors — they won't resolve in seconds
      const noRetry = lastError.message.includes('429') || lastError.message.includes('404')
        || lastError.message.includes('Too Many Requests') || lastError.message.includes('Not Found')
        || lastError.message.includes('RESOURCE_EXHAUSTED');
      if (noRetry) throw lastError;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
};
