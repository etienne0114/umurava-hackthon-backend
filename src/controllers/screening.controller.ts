import { Request, Response, NextFunction } from 'express';
import { screeningService } from '../services/screening.service';
import { isGroqConfigured } from '../config/groq';
import { getGeminiModel, performanceMonitor } from '../config/gemini';
import { config } from '../config/environment';
import { APIError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import axios from 'axios';

export class ScreeningController {
  private healthCache = new Map<string, { data: any; expiresAt: number }>();

  // Cache TTLs — long enough to prevent token/quota waste
  private static readonly HEALTH_CACHE_SUCCESS_MS = 300_000;  // 5 minutes for healthy
  private static readonly HEALTH_CACHE_DEGRADED_MS = 120_000; // 2 minutes for degraded/unhealthy
  private static readonly HEALTH_CACHE_ERROR_MS = 60_000;     // 1 minute for system errors

  private getCachedHealth(key: string): any | null {
    const cached = this.healthCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.healthCache.delete(key);
    return null;
  }

  private setCachedHealth(key: string, data: any, ttlMs: number): void {
    this.healthCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Zero-cost health check for AI providers.
   * 
   * IMPORTANT: This method MUST NOT call generateContent() or any other
   * token-consuming API. Previous implementation burned real tokens on every
   * health check (every 30s), quickly exhausting the free-tier quota.
   * 
   * Instead we use:
   *   - Gemini: countTokens('ping') — free, validates API key + connectivity
   *   - Groq: GET /models — free, validates API key + connectivity
   */
  async checkAIProviderHealth(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    const cacheKey = 'ai-provider-health';
    
    // Check cache first — this is the primary defence against overloading
    const cachedResult = this.getCachedHealth(cacheKey);
    if (cachedResult) {
      res.status(200).json({
        ...cachedResult,
        meta: {
          ...cachedResult.meta,
          cached: true,
          timestamp: new Date().toISOString()
        }
      });
      return;
    }

    try {
      const healthStatus = {
        timestamp: new Date().toISOString(),
        gemini: { status: 'unknown', error: null as string | null },
        groq:   { status: 'unknown', error: null as string | null },
        overall: 'unknown' as 'healthy' | 'degraded' | 'unhealthy'
      };

      const HEALTH_CHECK_TIMEOUT = 8000;

      await Promise.allSettled([
        // Gemini health check — countTokens is FREE
        (async () => {
          try {
            if (!config.geminiApiKey) {
              healthStatus.gemini.status = 'unhealthy';
              healthStatus.gemini.error = 'API key not configured';
              return;
            }
            const geminiModel = getGeminiModel();
            await Promise.race([
              geminiModel.countTokens('ping'),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 8s')), HEALTH_CHECK_TIMEOUT))
            ]);
            healthStatus.gemini.status = 'healthy';
            healthStatus.gemini.error = null;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            healthStatus.gemini.status = 'unhealthy';
            if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
              healthStatus.gemini.status = 'degraded' as any;
              healthStatus.gemini.error = 'Rate limited (API key is valid)';
            } else if (message.includes('timeout') || message.includes('fetch failed') || message.includes('Timeout')) {
              healthStatus.gemini.error = 'Network timeout';
            } else if (message.includes('401') || message.includes('403') || message.includes('API_KEY_INVALID')) {
              healthStatus.gemini.error = 'Authentication failed';
            } else {
              healthStatus.gemini.error = 'Connection failed';
            }
            logger.warn('Gemini health check failed:', message);
          }
        })(),

        // Groq health check — GET /models is FREE
        (async () => {
          try {
            if (!isGroqConfigured()) {
              healthStatus.groq.status = 'unhealthy';
              healthStatus.groq.error = 'API key not configured';
              return;
            }
            const modelsResponse = await Promise.race([
              axios.get(`${config.groqBaseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${config.groqApiKey}` },
                timeout: HEALTH_CHECK_TIMEOUT,
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 8s')), HEALTH_CHECK_TIMEOUT))
            ]) as { status: number };

            if (modelsResponse.status === 200) {
              healthStatus.groq.status = 'healthy';
              healthStatus.groq.error = null;
            } else {
              healthStatus.groq.status = 'unhealthy';
              healthStatus.groq.error = `Unexpected status: ${modelsResponse.status}`;
            }
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            healthStatus.groq.status = 'unhealthy';
            if (message.includes('401') || message.includes('403')) {
              healthStatus.groq.error = 'Authentication failed';
            } else if (message.includes('timeout') || message.includes('Timeout')) {
              healthStatus.groq.error = 'Network timeout';
            } else {
              healthStatus.groq.error = 'Connection failed';
            }
            logger.warn('Groq health check failed:', message);
          }
        })()
      ]);

      // 'degraded' = rate-limited but key is valid — still functional for screening
      const geminiFunctional = healthStatus.gemini.status === 'healthy' || healthStatus.gemini.status === ('degraded' as any);
      const groqFunctional   = healthStatus.groq.status === 'healthy'   || healthStatus.groq.status === ('degraded' as any);
      const bothDown = !geminiFunctional && !groqFunctional;

      if (healthStatus.gemini.status === 'healthy' && healthStatus.groq.status === 'healthy') {
        healthStatus.overall = 'healthy';
      } else if (geminiFunctional || groqFunctional) {
        // At least one provider can handle requests — screening will work
        healthStatus.overall = geminiFunctional && !groqFunctional ? 'degraded' : 'degraded';
      } else if (bothDown) {
        healthStatus.overall = 'unhealthy';
      } else {
        healthStatus.overall = 'degraded';
      }

      const responseData = {
        success: true,
        data: healthStatus,
        meta: {
          timestamp: new Date().toISOString(),
          note: healthStatus.overall === 'unhealthy' 
            ? 'All AI providers are currently unavailable. Screening will use fallback scoring.' 
            : undefined,
          checkType: 'lightweight' // Signal that this is a zero-cost check
        },
      };

      // Cache with long TTLs to prevent overloading
      const cacheTtl = healthStatus.overall === 'healthy' 
        ? ScreeningController.HEALTH_CACHE_SUCCESS_MS 
        : ScreeningController.HEALTH_CACHE_DEGRADED_MS;
      this.setCachedHealth(cacheKey, responseData, cacheTtl);

      res.status(200).json(responseData);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Health check endpoint error:', error);
      
      const errorResponse = {
        success: false,
        data: {
          timestamp: new Date().toISOString(),
          gemini: { status: 'unknown', error: 'Health check system error' },
          groq:   { status: 'unknown', error: 'Health check system error' },
          overall: 'unhealthy' as const
        },
        error: message,
        meta: {
          timestamp: new Date().toISOString(),
          note: 'Health check system is experiencing issues. AI providers may still be functional.'
        },
      };

      this.setCachedHealth(cacheKey, errorResponse, ScreeningController.HEALTH_CACHE_ERROR_MS);
      
      res.status(200).json(errorResponse);
    }
  }

  async getAIProviderMetrics(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const metrics = performanceMonitor.getAllMetrics();
      
      res.status(200).json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          providers: metrics,
          summary: {
            totalProviders: Object.keys(metrics).length,
            healthyProviders: Object.values(metrics).filter((m: any) => m && m.successRate > 0.8).length,
            averageLatency: Object.values(metrics).reduce((acc: number, m: any) => 
              acc + (m ? m.averageLatency : 0), 0) / Math.max(Object.keys(metrics).length, 1)
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          note: 'Performance metrics for AI providers over the last 5 minutes'
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching AI provider metrics:', error);
      
      res.status(500).json({
        success: false,
        error: message,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  async startScreening(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, options } = req.body;

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const session = await screeningService.startScreening(jobId, options);

      res.status(201).json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async getScreeningStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await screeningService.getScreeningStatus(sessionId);

      if (!session) {
        const error: APIError = new Error('Screening session not found');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async getScreeningResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const results = await screeningService.getScreeningResults(jobId, limit);

      res.json({
        success: true,
        data: results,
        meta: {
          count: results.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async regenerateScreening(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId, applicantIds } = req.body;

      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const session = await screeningService.regenerateScreening(jobId, applicantIds);

      res.status(201).json({
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  async fixRankingIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        const error: APIError = new Error('Job ID is required');
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      const fixResult = await screeningService.fixRankingForJob(jobId);

      res.json({
        success: true,
        data: {
          jobId,
          issuesFound: fixResult.issuesFound,
          recordsUpdated: fixResult.recordsUpdated,
          message: fixResult.issuesFound 
            ? `Fixed ranking issues for ${fixResult.recordsUpdated} candidates`
            : 'No ranking issues found'
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const screeningController = new ScreeningController();
