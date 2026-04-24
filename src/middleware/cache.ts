import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry>();

  set(key: string, data: any, ttlSeconds: number = 30): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new SimpleCache();

// Clean up expired entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

export const cacheMiddleware = (ttlSeconds: number = 30) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `${req.originalUrl}:${(req as any).user?.userId || 'anonymous'}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      // Add cache headers
      res.set({
        'Cache-Control': `public, max-age=${ttlSeconds}`,
        'X-Cache': 'HIT',
      });
      return res.json(cachedData);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache the response
    res.json = function (data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, data, ttlSeconds);
        res.set({
          'Cache-Control': `public, max-age=${ttlSeconds}`,
          'X-Cache': 'MISS',
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
};

export default cache;