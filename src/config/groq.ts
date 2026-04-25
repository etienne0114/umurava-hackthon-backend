import axios, { AxiosInstance } from 'axios';
import { Agent } from 'https';
import { config } from './environment';
import logger from '../utils/logger';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// Connection pooling for Groq
const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 15,
  maxFreeSockets: 8,
  timeout: 60000,
});

// Circuit Breaker for Groq
class GroqCircuitBreaker {
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
    windowSize: number = 120000      // 2 minutes
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.windowSize = windowSize;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.failureWindow = this.failureWindow.filter(t => now - t < this.windowSize);

    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        logger.info('Groq circuit breaker moving to half-open state');
      } else {
        throw new Error('Groq circuit breaker is OPEN. Provider temporarily disabled.');
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        this.failureWindow = [];
        logger.info('Groq circuit breaker reset to closed state');
      }
      return result;
    } catch (error) {
      this.failures++;
      this.failureWindow.push(now);
      this.lastFailureTime = now;
      if (this.failureWindow.length >= this.failureThreshold) {
        this.state = 'open';
        logger.warn(`Groq circuit breaker OPENED after ${this.failures} failures in ${this.windowSize}ms window`);
      }
      throw error;
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return { state: this.state, failures: this.failureWindow.length, lastFailureTime: this.lastFailureTime };
  }
}

const groqCircuitBreaker = new GroqCircuitBreaker(
  5,      // failureThreshold: open after 5 failures (not 3)
  60000,  // recoveryTimeout: 60 seconds (Groq TPM resets per minute)
  120000  // windowSize: 2 minutes
);

const groqClient: AxiosInstance = axios.create({
  baseURL: config.groqBaseUrl,
  timeout: 180000, // 3 minutes — matches batch evaluation timeout
  httpsAgent: httpAgent,
  headers: {
    'User-Agent': 'Umurava-Recruit/1.0',
    'Connection': 'keep-alive',
  },
  maxRedirects: 3,
  validateStatus: (status) => status < 500,
});

export const isGroqConfigured = (): boolean => {
  return Boolean(config.groqApiKey);
};

export const testGroqConnection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isGroqConfigured()) {
    return { success: false, error: 'GROQ_API_KEY is not configured' };
  }
  try {
    await groqCircuitBreaker.execute(async () => {
      return generateWithGroq([{ role: 'user', content: 'Respond with OK.' }], config.groqModel, 1);
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
};

export const generateWithGroq = async (
  messages: GroqMessage[],
  model: string = config.groqModel,
  retries: number = 3
): Promise<{ text: string; model: string }> => {
  if (!isGroqConfigured()) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  return groqCircuitBreaker.execute(async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Groq attempt ${attempt}/${retries} with model: ${model}`);

        const response = await groqClient.post<GroqResponse>(
          '/chat/completions',
          {
            model,
            messages,
            temperature: 0.2,
            max_tokens: 4000,
          },
          {
            headers: {
              Authorization: `Bearer ${config.groqApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 180000, // 3 minutes per request
          }
        );

        // Log non-2xx responses that slipped through validateStatus
        if (response.status >= 400) {
          const errData = response.data as any;
          const errMsg = errData?.error?.message || errData?.message || `HTTP ${response.status}`;
          throw new Error(`Groq API error (${response.status}): ${errMsg}`);
        }

        const text = response.data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
          // Log the raw response to help diagnose what Groq actually returned
          logger.warn(`Groq empty response on attempt ${attempt}. Status: ${response.status}, choices: ${JSON.stringify(response.data?.choices)}`);
          throw new Error(`Groq returned an empty response (status ${response.status})`);
        }

        logger.info(`Groq request successful on attempt ${attempt}`);
        return { text, model };

      } catch (error: unknown) {
        lastError = error;
        const axiosError = error as {
          response?: { data?: unknown; status?: number; statusText?: string };
          message?: string;
          code?: string;
        };

        const isTimeout      = axiosError?.code === 'ETIMEDOUT' || axiosError?.code === 'ECONNABORTED';
        const isNetworkError = axiosError?.code === 'ECONNRESET' || axiosError?.code === 'ENOTFOUND' || axiosError?.code === 'ECONNREFUSED';
        const isServerError  = axiosError?.response?.status !== undefined && axiosError.response.status >= 500;
        const isRateLimited  = axiosError?.response?.status === 429;
        const isEmptyResponse = axiosError?.message?.includes('empty response');
        const isRetryable    = isTimeout || isNetworkError || isServerError || isRateLimited || isEmptyResponse;

        if (attempt < retries && isRetryable) {
          let baseDelay: number;
          if (isRateLimited) {
            // Respect Groq's retry-after header if present, otherwise use longer backoff
            const retryAfterHeader = (axiosError?.response as any)?.headers?.['retry-after'];
            const retryAfterSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : null;
            // Also parse "retry in Xs" from the error message body
            const msgMatch = axiosError?.message?.match(/try again in (\d+(?:\.\d+)?)s/i);
            const msgSeconds = msgMatch ? parseFloat(msgMatch[1]) : null;
            const waitSeconds = retryAfterSeconds ?? msgSeconds ?? null;
            baseDelay = waitSeconds
              ? Math.ceil(waitSeconds * 1000) + 500   // header value + 500ms buffer
              : Math.min(8000 * Math.pow(2, attempt - 1), 60000); // 8s, 16s, 32s fallback
          } else if (isTimeout) {
            baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
          } else {
            baseDelay = Math.min(500  * Math.pow(2, attempt - 1), 10000);
          }

          const jitter = isRateLimited ? 0 : Math.random() * 0.3 * baseDelay;
          const delay = Math.floor(baseDelay + jitter);
          logger.warn(`Groq attempt ${attempt} failed (${axiosError?.code || axiosError?.response?.status || 'unknown'}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        const responseData = axiosError?.response?.data;
        const details =
          (responseData as Record<string, { message: string }>)?.error?.message ||
          (responseData as Record<string, string>)?.message ||
          axiosError?.message ||
          'Unknown Groq error';

        logger.error(`Groq request failed after ${attempt} attempts: ${details}`);
        break;
      }
    }

    const axiosError = lastError as { response?: { data?: unknown; status?: number }; message?: string; code?: string };
    const responseData = axiosError?.response?.data;
    const details =
      (responseData as Record<string, { message: string }>)?.error?.message ||
      (responseData as Record<string, string>)?.message ||
      axiosError?.message ||
      'Unknown Groq error';

    throw new Error(`Groq request failed after ${retries} attempts: ${details}`);
  });
};
