import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const getGeminiModel = (modelName: string = DEFAULT_MODEL) => {
  return genAI.getGenerativeModel({ 
    model: modelName,
    // Configure request options for better reliability
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000,
    }
  });
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

// Circuit Breaker implementation
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly windowSize: number;
  private failureWindow: number[] = [];

  constructor(
    failureThreshold: number = 5,
    recoveryTimeout: number = 60000, // 1 minute
    windowSize: number = 300000 // 5 minutes
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.windowSize = windowSize;
  }

  async execute<T>(fn: () => Promise<T>, providerName: string): Promise<T> {
    const now = Date.now();

    // Clean old failures from sliding window
    this.failureWindow = this.failureWindow.filter(time => now - time < this.windowSize);

    // Check circuit state
    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        logger.info(`Circuit breaker for ${providerName} moving to half-open state`);
      } else {
        throw new Error(`Circuit breaker for ${providerName} is OPEN. Provider temporarily disabled.`);
      }
    }

    try {
      const result = await fn();
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        this.failureWindow = [];
        logger.info(`Circuit breaker for ${providerName} reset to closed state`);
      }
      
      return result;
    } catch (error) {
      // Record failure
      this.failures++;
      this.failureWindow.push(now);
      this.lastFailureTime = now;

      // Check if we should open the circuit
      if (this.failureWindow.length >= this.failureThreshold) {
        this.state = 'open';
        logger.warn(`Circuit breaker for ${providerName} OPENED after ${this.failures} failures in ${this.windowSize}ms window`);
      }

      throw error;
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failureWindow.length,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Performance monitoring
export class PerformanceMonitor {
  private metrics = new Map<string, {
    requestCount: number;
    successCount: number;
    failureCount: number;
    totalLatency: number;
    latencies: number[];
    lastUpdated: number;
  }>();

  private readonly MAX_LATENCY_SAMPLES = 100;
  private readonly METRICS_WINDOW = 300000; // 5 minutes

  recordRequest(provider: string, latency: number, success: boolean): void {
    const now = Date.now();
    let metric = this.metrics.get(provider);
    
    if (!metric || now - metric.lastUpdated > this.METRICS_WINDOW) {
      metric = {
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        latencies: [],
        lastUpdated: now
      };
      this.metrics.set(provider, metric);
    }

    metric.requestCount++;
    metric.totalLatency += latency;
    
    if (success) {
      metric.successCount++;
    } else {
      metric.failureCount++;
    }

    // Keep sliding window of latencies
    metric.latencies.push(latency);
    if (metric.latencies.length > this.MAX_LATENCY_SAMPLES) {
      metric.latencies.shift();
    }
    
    metric.lastUpdated = now;
  }

  getMetrics(provider: string): {
    requestCount: number;
    successRate: number;
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  } | null {
    const metric = this.metrics.get(provider);
    if (!metric || metric.requestCount === 0) {
      return null;
    }

    const sortedLatencies = [...metric.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);

    return {
      requestCount: metric.requestCount,
      successRate: metric.successCount / metric.requestCount,
      averageLatency: metric.totalLatency / metric.requestCount,
      p95Latency: sortedLatencies[p95Index] || 0,
      p99Latency: sortedLatencies[p99Index] || 0
    };
  }

  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [provider, _] of this.metrics) {
      result[provider] = this.getMetrics(provider);
    }
    return result;
  }

  // Adaptive timeout calculation based on historical performance
  getAdaptiveTimeout(provider: string, requestType: string, defaultTimeout: number): number {
    const metrics = this.getMetrics(provider);
    if (!metrics || metrics.requestCount < 10) {
      return defaultTimeout; // Not enough data, use default
    }

    // Use P95 latency + buffer as adaptive timeout
    const buffer = requestType === 'health' ? 2000 : 5000; // 2s for health, 5s for others
    const adaptiveTimeout = Math.max(
      metrics.p95Latency + buffer,
      defaultTimeout * 0.5 // Never go below 50% of default
    );

    // Cap at 2x default timeout
    return Math.min(adaptiveTimeout, defaultTimeout * 2);
  }
}

export const performanceMonitor = new PerformanceMonitor();

export const geminiRateLimiter = new GeminiRateLimiter(5);
export const geminiCircuitBreaker = new CircuitBreaker(3, 30000, 120000); // 3 failures, 30s recovery, 2min window

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
