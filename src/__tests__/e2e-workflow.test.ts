/**
 * End-to-End Workflow Integration Test
 * 
 * Tests the complete recruitment screening workflow:
 * 1. Create job posting
 * 2. Upload applicants (CSV, Excel, PDF)
 * 3. Start AI screening
 * 4. View and verify results
 * 5. Test error scenarios
 */

import request from 'supertest';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import app from '../server';
import { Job } from '../models/Job';
import { Applicant } from '../models/Applicant';
import { ScreeningResult } from '../models/ScreeningResult';
import { ScreeningSession } from '../models/ScreeningSession';
import { geminiService } from '../services/gemini.service';

describe('E2E Workflow: Complete Recruitment Screening', () => {
  let jobId: string;
  let sessionId: string;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-test';
    
    // Close any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to test database:', mongoUri);
  });

  afterAll(async () => {
    // Clean up test data
    await Job.deleteMany({});
    await Applicant.deleteMany({});
    await ScreeningResult.deleteMany({});
    await ScreeningSession.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(() => {
    // Mock Gemini evaluation to return predictable results
    jest.spyOn(geminiService, 'evaluateCandidate').mockResolvedValue({
      matchScore: 85,
      strengths: ['Strong technical skills', 'Relevant experience'],
      gaps: ['No specific industry experience'],
      risks: ['None identified'],
      recommendation: 'highly_recommended',
      reasoning: 'This is a mock evaluation for testing purposes. The candidate shows strong alignment with the job requirements in terms of skills and experience.',
      scoreBreakdown: {
        skills: 90,
        experience: 80,
        education: 70,
        relevance: 90,
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Job Creation Workflow', () => {
    it('should create a new job posting with valid data', async () => {
      const jobData = {
        title: 'Senior Full Stack Developer',
        description: 'We are looking for an experienced full stack developer with strong JavaScript skills.',
        requirements: {
          skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'MongoDB'],
          experience: {
            minYears: 5,
            maxYears: 10,
          },
          education: ['Bachelor of Science in Computer Science', 'Bachelor of Engineering'],
          location: 'Remote',
        },
        weights: {
          skills: 0.4,
          experience: 0.3,
          education: 0.1,
          relevance: 0.2,
        },
        status: 'active',
      };

      const response = await request(app)
        .post('/api/jobs')
        .send(jobData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.title).toBe(jobData.title);
      expect(response.body.data.requirements.skills).toEqual(jobData.requirements.skills);

      jobId = response.body.data._id;
    });

    it('should retrieve the created job by ID', async () => {
      const response = await request(app)
        .get(`/api/jobs/${jobId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(jobId);
      expect(response.body.data.title).toBe('Senior Full Stack Developer');
    });

    it('should list all jobs', async () => {
      const response = await request(app)
        .get('/api/jobs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('2. Applicant Upload Workflow - CSV', () => {
    it('should upload applicants from CSV file', async () => {
      const csvPath = path.join(__dirname, './fixtures/sample-applicants.csv');
      
      if (!fs.existsSync(csvPath)) {
        console.warn('Sample CSV file not found, skipping CSV upload test');
        return;
      }

      const response = await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', csvPath)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('applicants');
      expect(Array.isArray(response.body.data.applicants)).toBe(true);
      expect(response.body.data.applicants.length).toBeGreaterThan(0);
    });

    it('should retrieve uploaded applicants for the job', async () => {
      const response = await request(app)
        .get(`/api/applicants?jobId=${jobId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Verify applicant data structure
      const applicant = response.body.data[0];
      expect(applicant).toHaveProperty('profile');
      expect(applicant.profile).toHaveProperty('name');
      expect(applicant.profile).toHaveProperty('email');
      expect(applicant.profile).toHaveProperty('skills');
    });
  });

  describe('3. Applicant Upload Workflow - Excel', () => {
    it('should handle Excel file upload (if file exists)', async () => {
      const excelPath = path.join(__dirname, './fixtures/sample-applicants.xlsx');
      
      if (!fs.existsSync(excelPath)) {
        console.warn('Sample Excel file not found, skipping Excel upload test');
        return;
      }

      const response = await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', excelPath)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('applicants');
      // Note: can be 0 if all applicants in file are already uploaded (duplicates)
      expect(Array.isArray(response.body.data.applicants)).toBe(true);
    });
  });

  describe('4. Applicant Upload Workflow - PDF', () => {
    it('should handle PDF resume upload (if file exists)', async () => {
      const pdfPath = path.join(__dirname, './fixtures/sample-resume.pdf');
      
      if (!fs.existsSync(pdfPath)) {
        console.warn('Sample PDF file not found, skipping PDF upload test');
        return;
      }

      const response = await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', pdfPath)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('applicants');
      // Note: can be 0 if all applicants in file are already uploaded (duplicates)
      expect(Array.isArray(response.body.data.applicants)).toBe(true);
    });
  });

  describe('5. AI Screening Workflow', () => {
    it('should start screening process for the job', async () => {
      const response = await request(app)
        .post('/api/screening/start')
        .send({
          jobId,
          options: {
            topN: 10,
            minScore: 0,
          },
        })
        .expect(201)
        .catch(err => {
          console.error('Screening Start Failed Body:', err.response?.body);
          throw err;
        });

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.status).toBe('processing');
      expect(response.body.data.jobId).toBe(jobId);

      sessionId = response.body.data._id;
    });

    it('should retrieve screening session status', async () => {
      const response = await request(app)
        .get(`/api/screening/session/${sessionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(sessionId);
      expect(['processing', 'completed', 'failed']).toContain(response.body.data.status);
    });

    it('should wait for screening to complete and retrieve results', async () => {
      // Poll for completion (max 2 minutes)
      let completed = false;
      let attempts = 0;
      const maxAttempts = 24; // 2 minutes with 5-second intervals

      while (!completed && attempts < maxAttempts) {
        const statusResponse = await request(app)
          .get(`/api/screening/session/${sessionId}`)
          .expect(200);

        if (statusResponse.body.data.status === 'completed') {
          completed = true;
        } else if (statusResponse.body.data.status === 'failed') {
          throw new Error(`Screening failed: ${statusResponse.body.data.error}`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
        }
      }

      expect(completed).toBe(true);

      // Retrieve screening results
      const resultsResponse = await request(app)
        .get(`/api/screening/results/${jobId}`)
        .expect(200);

      expect(resultsResponse.body.success).toBe(true);
      expect(Array.isArray(resultsResponse.body.data)).toBe(true);
      expect(resultsResponse.body.data.length).toBeGreaterThan(0);

      // Verify result structure
      const result = resultsResponse.body.data[0];
      expect(result).toHaveProperty('rank');
      expect(result).toHaveProperty('matchScore');
      expect(result).toHaveProperty('evaluation');
      expect(result.evaluation).toHaveProperty('strengths');
      expect(result.evaluation).toHaveProperty('gaps');
      expect(result.evaluation).toHaveProperty('recommendation');
      expect(result.evaluation).toHaveProperty('reasoning');
      expect(result).toHaveProperty('scoreBreakdown');
      
      // Verify scores are in valid range
      expect(result.matchScore).toBeGreaterThanOrEqual(0);
      expect(result.matchScore).toBeLessThanOrEqual(100);
    }, 150000); // 2.5 minute timeout for this test
  });

  describe('6. Results Verification', () => {
    it('should verify results are ranked correctly', async () => {
      const response = await request(app)
        .get(`/api/screening/results/${jobId}`)
        .expect(200);

      const results = response.body.data;
      
      // Verify ranking order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].rank).toBeLessThan(results[i + 1].rank);
        expect(results[i].matchScore).toBeGreaterThanOrEqual(results[i + 1].matchScore);
      }
    });

    it('should verify all applicants have screening results', async () => {
      const applicantsResponse = await request(app)
        .get(`/api/applicants?jobId=${jobId}`)
        .expect(200);

      const resultsResponse = await request(app)
        .get(`/api/screening/results/${jobId}`)
        .expect(200);

      expect(resultsResponse.body.data.length).toBe(applicantsResponse.body.data.length);
    });

    it('should verify data persistence across requests', async () => {
      // Make multiple requests and verify consistency
      const response1 = await request(app)
        .get(`/api/screening/results/${jobId}`)
        .expect(200);

      const response2 = await request(app)
        .get(`/api/screening/results/${jobId}`)
        .expect(200);

      expect(response1.body.data).toEqual(response2.body.data);
    });
  });

  describe('7. Error Scenarios', () => {
    it('should reject invalid file types', async () => {
      const invalidFilePath = path.join(__dirname, 'e2e-workflow.test.ts');

      const response = await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', invalidFilePath);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle missing jobId in upload', async () => {
      const csvPath = path.join(__dirname, './fixtures/sample-applicants.csv');
      
      if (!fs.existsSync(csvPath)) {
        return;
      }

      const response = await request(app)
        .post('/api/applicants/upload')
        .attach('file', csvPath);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle screening for non-existent job', async () => {
      const fakeJobId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post('/api/screening/start')
        .send({
          jobId: fakeJobId,
          options: { topN: 10 },
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle invalid weight configuration', async () => {
      const invalidJobData = {
        title: 'Test Job',
        description: 'Test description for invalid weight configuration',
        requirements: {
          skills: ['JavaScript'],
          experience: {
            minYears: 0,
          },
          education: [],
        },
        weights: {
          skills: 0.5,
          experience: 0.5,
          education: 0.5, // Sum > 1.0
          relevance: 0.5,
        },
      };

      const response = await request(app)
        .post('/api/jobs')
        .send(invalidJobData);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle duplicate applicant uploads', async () => {
      const csvPath = path.join(__dirname, './fixtures/sample-applicants.csv');
      
      if (!fs.existsSync(csvPath)) {
        return;
      }

      // Upload same file twice
      await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', csvPath);

      const response = await request(app)
        .post('/api/applicants/upload')
        .field('jobId', jobId)
        .attach('file', csvPath);

      // Should either reject duplicates or handle gracefully
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('8. Umurava Import Workflow (Mock)', () => {
    it('should handle Umurava import endpoint', async () => {
      const response = await request(app)
        .post('/api/applicants/import')
        .send({
          jobId,
          profileIds: ['mock-profile-1', 'mock-profile-2'],
        });

      // This may fail if Umurava service is not configured
      // We're just testing the endpoint exists and handles the request
      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });
});
