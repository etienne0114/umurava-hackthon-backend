import axios, { AxiosInstance } from 'axios';
import { Agent } from 'https';
import { config } from './environment';
import logger from '../utils/logger';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// Create HTTP agent with connection pooling and keep-alive
const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000, // 30 seconds keep-alive
  maxSockets: 15, // Max 15 concurrent connections for OpenRouter
  maxFreeSockets: 8, // Keep 8 free sockets in pool
  timeout: 60000, // 60 second connection timeout
});

// Circuit Breaker for OpenRouter
class OpenRouterCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly windowSize: number;
  private failureWindow: number[] = [];

  constructor(
    failureThreshold: number = 3,
    recoveryTimeout: number = 30000, // 30 seconds
    windowSize: number = 120000 // 2 minutes
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.windowSize = windowSize;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Clean old failures from sliding window
    this.failureWindow = this.failureWindow.filter(time => now - time < this.windowSize);

    // Check circuit state
    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        logger.info('OpenRouter circuit breaker moving to half-open state');
      } else {
        throw new Error('OpenRouter circuit breaker is OPEN. Provider temporarily disabled.');
      }
    }

    try {
      const result = await fn();
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        this.failureWindow = [];
        logger.info('OpenRouter circuit breaker reset to closed state');
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
        logger.warn(`OpenRouter circuit breaker OPENED after ${this.failures} failures in ${this.windowSize}ms window`);
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

const openRouterCircuitBreaker = new OpenRouterCircuitBreaker();

const openRouterClient: AxiosInstance = axios.create({
  baseURL: config.openRouterBaseUrl,
  timeout: 120000, // 2 minutes request timeout
  httpsAgent: httpAgent,
  headers: {
    'User-Agent': 'Umurava-Recruit/1.0',
    'Connection': 'keep-alive',
  },
  // Retry configuration
  maxRedirects: 3,
  validateStatus: (status) => status < 500, // Don't retry on 4xx errors
});

export const isOpenRouterConfigured = (): boolean => {
  return Boolean(config.openRouterApiKey);
};

export const testOpenRouterConnection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isOpenRouterConfigured()) {
    return { success: false, error: 'OPENROUTER_API_KEY is not configured' };
  }

  try {
    const testMessages: OpenRouterMessage[] = [
      { role: 'user', content: 'Hello, this is a connection test. Please respond with "OK".' }
    ];

    await openRouterCircuitBreaker.execute(async () => {
      return generateWithOpenRouter(testMessages, config.openRouterModel, 1);
    });
    
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
};

export const generateWithOpenRouter = async (
  messages: OpenRouterMessage[],
  model: string = config.openRouterModel,
  retries: number = 3
): Promise<{ text: string; model: string }> => {
  if (!isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  return openRouterCircuitBreaker.execute(async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
        };

        if (config.openRouterSiteUrl) {
          headers['HTTP-Referer'] = config.openRouterSiteUrl;
        }

        if (config.openRouterAppName) {
          headers['X-Title'] = config.openRouterAppName;
        }

        logger.info(`OpenRouter attempt ${attempt}/${retries} with model: ${model}`);

        const response = await openRouterClient.post<OpenRouterResponse>(
          '/chat/completions',
          {
            model,
            messages,
            temperature: 0.2,
            max_tokens: 4000,
          },
          {
            headers,
            timeout: 120000, // 2 minutes per request
          }
        );

        const text = response.data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
          throw new Error('OpenRouter returned an empty response');
        }

        logger.info(`OpenRouter request successful on attempt ${attempt}`);
        return { text, model };

      } catch (error: unknown) {
        lastError = error;
        const axiosError = error as { response?: { data?: unknown; status?: number; statusText?: string }; message?: string; code?: string };
        
        // Smart retry conditions based on error type
        const isTimeout = axiosError?.code === 'ETIMEDOUT' || axiosError?.code === 'ECONNABORTED';
        const isNetworkError = axiosError?.code === 'ECONNRESET' || axiosError?.code === 'ENOTFOUND' || axiosError?.code === 'ECONNREFUSED';
        const isServerError = axiosError?.response?.status && axiosError.response.status >= 500;
        const isRateLimited = axiosError?.response?.status === 429;
        
        // Don't retry on authentication errors (401, 403) or client errors (400-499 except 429)
        const isRetryableError = isTimeout || isNetworkError || isServerError || isRateLimited;

        if (attempt < retries && isRetryableError) {
          // Jittered exponential backoff with different delays for different error types
          let baseDelay;
          if (isRateLimited) {
            baseDelay = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // Longer delays for rate limits
          } else if (isTimeout) {
            baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 15000); // Medium delays for timeouts
          } else {
            baseDelay = Math.min(500 * Math.pow(2, attempt - 1), 10000); // Shorter delays for other errors
          }
          
          const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
          const delay = Math.floor(baseDelay + jitter);
          
          logger.warn(`OpenRouter attempt ${attempt} failed (${axiosError?.code || axiosError?.response?.status || 'unknown'}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Log detailed error information
        const responseData = axiosError?.response?.data;
        const responseText =
          typeof responseData === 'string'
            ? responseData
            : responseData
            ? JSON.stringify(responseData)
            : '';

        const details =
          (responseData as Record<string, { message: string }>)?.error?.message ||
          (responseData as Record<string, string>)?.message ||
          axiosError?.message ||
          'Unknown OpenRouter error';

        const status = axiosError?.response?.status ? `status=${axiosError.response.status}` : '';
        const statusText = axiosError?.response?.statusText ? `statusText=${axiosError.response.statusText}` : '';
        const code = axiosError?.code ? `code=${axiosError.code}` : '';
        const extra = [status, statusText, code, responseText].filter(Boolean).join(' | ');

        logger.error(`OpenRouter request failed after ${attempt} attempts: ${details}${extra ? ` (${extra})` : ''}`);
        break;
      }
    }

    // Final error handling
    const axiosError = lastError as { response?: { data?: unknown; status?: number; statusText?: string }; message?: string; code?: string };
    const responseData = axiosError?.response?.data;
    const details =
      (responseData as Record<string, { message: string }>)?.error?.message ||
      (responseData as Record<string, string>)?.message ||
      axiosError?.message ||
      'Unknown OpenRouter error';

    const status = axiosError?.response?.status ? `status=${axiosError.response.status}` : '';
    const statusText = axiosError?.response?.statusText ? `statusText=${axiosError.response.statusText}` : '';
    const code = axiosError?.code ? `code=${axiosError.code}` : '';
    const extra = [status, statusText, code].filter(Boolean).join(' | ');

    throw new Error(`OpenRouter request failed after ${retries} attempts: ${details}${extra ? ` (${extra})` : ''}`);
  });
};
