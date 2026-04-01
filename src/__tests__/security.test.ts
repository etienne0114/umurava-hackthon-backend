import request from 'supertest';
import app from '../server';
import { sanitizeString, sanitizeStringArray } from '../middleware/sanitization';
import { validateFileType } from '../middleware/fileUpload';

describe('Security Features', () => {
  describe('Input Sanitization', () => {
    it('should remove HTML tags from strings', () => {
      const input = '<script>alert("XSS")</script>Hello World';
      const result = sanitizeString(input);
      expect(result).toBe('Hello World');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="malicious()">Click me</div>';
      const result = sanitizeString(input);
      expect(result).toBe('Click me');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert(1)';
      const result = sanitizeString(input);
      expect(result).toBe('alert(1)');
    });

    it('should sanitize array of strings', () => {
      const input = ['<script>test</script>', 'normal', '<b>bold</b>'];
      const result = sanitizeStringArray(input);
      // Script tags and their content should be completely removed for security
      // Other HTML tags should have tags removed but content preserved
      expect(result).toEqual(['', 'normal', 'bold']);
    });
  });

  describe('File Upload Validation', () => {
    it('should validate CSV files', async () => {
      const csvBuffer = Buffer.from('name,email\nJohn Doe,john@example.com');
      const result = await validateFileType(csvBuffer);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('csv');
    });

    it('should reject invalid file types', async () => {
      const invalidBuffer = Buffer.from('This is not a valid file');
      const result = await validateFileType(invalidBuffer);
      expect(result.valid).toBe(false);
    });

    it('should validate PDF magic numbers', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n');
      const result = await validateFileType(pdfBuffer);
      expect(result.valid).toBe(true);
      expect(result.type).toBe('pdf');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      // Make multiple requests to trigger rate limit
      const requests = Array(110).fill(null).map(() => 
        request(app).get('/api/health')
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (429 status)
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('should include HSTS header', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should include CSP header', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it('should sanitize MongoDB operators in request body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $gt: '' },
          password: { $gt: '' }
        });

      // Should not allow MongoDB operators
      expect(response.status).not.toBe(200);
    });
  });

  describe('Request Size Limiting', () => {
    it('should reject oversized requests', async () => {
      const largePayload = 'x'.repeat(11 * 1024 * 1024); // 11MB
      
      const response = await request(app)
        .post('/api/jobs')
        .send({ title: largePayload })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(413);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
