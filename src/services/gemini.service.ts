import { getGeminiModel, geminiRateLimiter, retryWithBackoff, geminiCircuitBreaker, performanceMonitor } from '../config/gemini';
import { generateWithOpenRouter, isOpenRouterConfigured } from '../config/openrouter';
import { IJob } from '../models/Job';
import { IApplicant } from '../models/Applicant';
import {
  buildEvaluationPrompt,
  buildBatchEvaluationPrompt,
  parseGeminiResponse,
  calculateMatchScore,
} from '../utils/promptBuilder';
import { Recommendation } from '../types';
import logger from '../utils/logger';

export interface CandidateEvaluation {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  risks: string[];
  recommendation: Recommendation;
  reasoning: string;
  aiFallback?: boolean;
  scoreBreakdown: {
    skills: number;
    experience: number;
    education: number;
    relevance: number;
  };
  geminiResponse?: {
    rawResponse: string;
    model: string;
  };
}

interface BatchEvaluationItem {
  applicantId: string;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  relevanceScore: number;
  strengths: string[];
  gaps: string[];
  risks: string[];
  recommendation: Recommendation;
  reasoning: string;
}

export interface ParsedResumeProfile {
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
  phone: string;
  location: string;
  skills: string[];
  languages: Array<{ name: string; proficiency: string }>;
  experience: Array<{ 
    role: string; 
    company: string; 
    startDate: string; 
    endDate: string; 
    description: string; 
    technologies: string[];
    isCurrent: boolean;
  }>;
  education: Array<{ 
    degree: string; 
    institution: string; 
    fieldOfStudy: string;
    startYear: string;
    endYear: string;
  }>;
}

export class GeminiService {
  private model = getGeminiModel();
  private cache = new Map<string, { data: CandidateEvaluation; expiresAt: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  // Request deduplication cache
  private requestCache = new Map<string, { promise: Promise<any>; expiresAt: number }>();
  private readonly REQUEST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    if (!isOpenRouterConfigured()) {
      logger.warn(
        'OpenRouter fallback is disabled: OPENROUTER_API_KEY is not set. Gemini quota errors will fall back to neutral scoring.'
      );
    } else {
      logger.info(
        `OpenRouter fallback enabled with model: ${process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v3.2'}`
      );
    }

    // Clean up expired request cache entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.requestCache.entries()) {
        if (entry.expiresAt < now) {
          this.requestCache.delete(key);
        }
      }
    }, 60000);
  }

  private isGeminiQuotaError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const upper = message.toUpperCase();
    return (
      message.includes('429') ||
      upper.includes('RESOURCE_EXHAUSTED') ||
      upper.includes('TOO MANY REQUESTS') ||
      upper.includes('RATE LIMIT') ||
      upper.includes('QUOTA') ||
      upper.includes('CIRCUIT BREAKER') ||
      upper.includes('TEMPORARILY DISABLED')
    );
  }

  private async generateWithGeminiThenFallback(
    prompt: string,
    sessionId?: string,
    requestType: 'health' | 'content' | 'test' | 'batch' = 'content'
  ): Promise<{ text: string; provider: 'gemini' | 'openrouter'; model: string }> {
    // Request deduplication - create hash of prompt for caching
    const promptHash = this.hashPrompt(prompt);
    const requestKey = `${requestType}:${promptHash}`;
    
    // Check if identical request is already in progress
    const existingRequest = this.requestCache.get(requestKey);
    if (existingRequest && existingRequest.expiresAt > Date.now()) {
      logger.debug(`Deduplicating ${requestType} request with hash ${promptHash.substring(0, 8)}`);
      return existingRequest.promise;
    }

    // Progressive timeout strategy based on request type
    const timeouts = {
      health: 15000,    // 15 seconds for health checks
      content: 30000,   // 30 seconds for content generation
      test: 10000,      // 10 seconds for test requests
      batch: 60000      // 60 seconds for batch operations
    };

    const timeout = timeouts[requestType];

    const requestPromise = this.executeRequest(prompt, sessionId, timeout, requestType);
    
    // Cache the promise to deduplicate concurrent requests
    this.requestCache.set(requestKey, {
      promise: requestPromise,
      expiresAt: Date.now() + this.REQUEST_CACHE_TTL
    });

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Remove from request cache after completion
      this.requestCache.delete(requestKey);
    }
  }

  private hashPrompt(prompt: string): string {
    // Simple hash function for prompt deduplication
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private async executeRequest(
    prompt: string,
    sessionId: string | undefined,
    timeout: number,
    requestType: string
  ): Promise<{ text: string; provider: 'gemini' | 'openrouter'; model: string }> {
    const startTime = Date.now();

    try {
      // Use adaptive timeout based on historical performance
      const adaptiveTimeout = performanceMonitor.getAdaptiveTimeout('gemini', requestType, timeout);
      
      const result = await geminiCircuitBreaker.execute(async () => {
        return Promise.race([
          this.model.generateContent(prompt),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Gemini timeout after ${adaptiveTimeout}ms for ${requestType} request`)), adaptiveTimeout)
          )
        ]);
      }, 'Gemini');
      
      const latency = Date.now() - startTime;
      performanceMonitor.recordRequest('gemini', latency, true);
      
      return {
        text: (result as any).response.text(),
        provider: 'gemini',
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      };
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      performanceMonitor.recordRequest('gemini', latency, false);
      
      const shouldFallback = this.isGeminiQuotaError(error);
      if (!shouldFallback) {
        throw error;
      }

      if (!isOpenRouterConfigured()) {
        logger.warn('Gemini quota/rate limit hit but OpenRouter fallback is not configured (missing OPENROUTER_API_KEY)');
        
        // Update session to track Gemini quota exhaustion
        if (sessionId) {
          await this.updateSessionProviderStatus(sessionId, {
            geminiQuotaExhausted: true,
            providerSwitchReason: 'Gemini quota exhausted, OpenRouter not configured'
          });
        }
        
        throw error;
      }

      logger.warn('Gemini quota/rate limit reached, switching to OpenRouter fallback');

      // Update session to track provider switch
      if (sessionId) {
        await this.updateSessionProviderStatus(sessionId, {
          currentProvider: 'openrouter',
          fallbackCount: 1,
          geminiQuotaExhausted: true,
          lastProviderSwitch: new Date(),
          providerSwitchReason: 'Gemini quota/rate limit exceeded'
        });
      }

      try {
        const fallbackStartTime = Date.now();
        const fallback = await generateWithOpenRouter(
          [{ role: 'user', content: prompt }],
          process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v3.2',
          3 // 3 retries for OpenRouter
        );

        const fallbackLatency = Date.now() - fallbackStartTime;
        performanceMonitor.recordRequest('openrouter', fallbackLatency, true);

        logger.info('Successfully switched to OpenRouter fallback');
        return {
          text: fallback.text,
          provider: 'openrouter',
          model: fallback.model,
        };
      } catch (openrouterError: unknown) {
        const fallbackStartTime = Date.now();
        const fallbackLatency = Date.now() - fallbackStartTime;
        performanceMonitor.recordRequest('openrouter', fallbackLatency, false);
        
        const openrouterMessage = openrouterError instanceof Error ? openrouterError.message : String(openrouterError);
        
        // Update session to track OpenRouter error
        if (sessionId) {
          await this.updateSessionProviderStatus(sessionId, {
            openrouterErrors: 1,
            providerSwitchReason: `OpenRouter failed: ${openrouterMessage}`
          });
        }

        logger.error('Both Gemini and OpenRouter failed:', {
          geminiError: error instanceof Error ? error.message : String(error),
          openrouterError: openrouterMessage
        });

        // Throw a comprehensive error when both providers fail
        throw new Error(`AI providers unavailable: Gemini (${error instanceof Error ? error.message : 'quota exceeded'}), OpenRouter (${openrouterMessage})`);
      }
    }
  }

  private async updateSessionProviderStatus(sessionId: string, updates: Partial<{
    primaryProvider: 'gemini' | 'openrouter';
    currentProvider: 'gemini' | 'openrouter';
    fallbackCount: number;
    geminiQuotaExhausted: boolean;
    openrouterErrors: number;
    lastProviderSwitch?: Date;
    providerSwitchReason?: string;
  }>) {
    try {
      const { ScreeningSession } = await import('../models/ScreeningSession.js');
      
      const setFields: Record<string, any> = {};
      const incFields: Record<string, any> = {};
      
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'fallbackCount' || key === 'openrouterErrors') {
          incFields[`aiProviderStatus.${key}`] = value;
        } else {
          setFields[`aiProviderStatus.${key}`] = value;
        }
      });

      const updateQuery: Record<string, any> = {};
      if (Object.keys(setFields).length > 0) {
        updateQuery.$set = setFields;
      }
      if (Object.keys(incFields).length > 0) {
        updateQuery.$inc = incFields;
      }

      await ScreeningSession.findByIdAndUpdate(sessionId, updateQuery);
    } catch (error) {
      logger.error('Failed to update session provider status:', error);
    }
  }

  async evaluateCandidate(job: IJob, applicant: IApplicant, sessionId?: string): Promise<CandidateEvaluation> {
    const cacheKey = `${job._id}-${applicant._id}`;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug(`Using cached evaluation for ${cacheKey}`);
      return cached.data;
    }

    try {
      const evaluation = await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          return await this.performEvaluation(job, applicant, sessionId);
        }, 3, 1000);
      });

      this.cache.set(cacheKey, { data: evaluation, expiresAt: Date.now() + this.CACHE_TTL });
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      logger.debug(`Successfully evaluated candidate ${applicant.profile?.name || applicant._id}: ${evaluation.matchScore}% (${evaluation.aiFallback ? 'fallback' : 'AI'})`);

      return evaluation;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isQuotaExceeded = message.includes('429') || message.includes('quota')
        || message.includes('RESOURCE_EXHAUSTED');

      const reasoning = isQuotaExceeded
        ? 'Gemini AI is currently at its usage limit. This is a temporary neutral evaluation (50%) to ensure screening completes. Please regenerate in 1-2 minutes for accurate scores.'
        : `Gemini evaluation encountered an issue (${message}). A neutral score has been assigned - please regenerate screening for accurate results.`;

      logger.warn(`AI provider fallback failed for candidate ${applicant._id}: ${message}`);
      logger.warn(`Fallback scoring applied: 50% for candidate ${applicant.profile?.name || applicant._id}`);
      return {
        matchScore: 50,
        strengths: ['AI Evaluation temporarily unavailable'],
        gaps: [],
        risks: [],
        recommendation: 'consider' as Recommendation,
        reasoning,
        aiFallback: true,
        scoreBreakdown: { skills: 50, experience: 50, education: 50, relevance: 50 },
      };
    }
  }

  private async performEvaluation(job: IJob, applicant: IApplicant, sessionId?: string): Promise<CandidateEvaluation> {
    const prompt = buildEvaluationPrompt(job, applicant);
    const generated = await this.generateWithGeminiThenFallback(prompt, sessionId, 'content');
    const text = generated.text;

    const parsed = parseGeminiResponse(text);

    const scoreBreakdown = {
      skills: parsed.skillsScore,
      experience: parsed.experienceScore,
      education: parsed.educationScore,
      relevance: parsed.relevanceScore,
    };

    // Weighted scoring based on recruiter-defined strategy
    const matchScore = calculateMatchScore(scoreBreakdown, job.weights);

    return {
      matchScore,
      strengths: parsed.strengths,
      gaps: parsed.gaps,
      risks: parsed.risks,
      recommendation: parsed.recommendation,
      reasoning: parsed.reasoning,
      aiFallback: false,
      scoreBreakdown,
      geminiResponse: {
        rawResponse: text,
        model: generated.model,
      },
    };
  }

  private parseBatchResponse(text: string): BatchEvaluationItem[] {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in batch evaluation response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      throw new Error('Batch evaluation response is not an array');
    }

    return parsed
      .filter((item) => item && typeof item.applicantId === 'string')
      .map((item) => ({
        applicantId: item.applicantId,
        skillsScore: Math.max(0, Math.min(100, Number(item.skillsScore) || 0)),
        experienceScore: Math.max(0, Math.min(100, Number(item.experienceScore) || 0)),
        educationScore: Math.max(0, Math.min(100, Number(item.educationScore) || 0)),
        relevanceScore: Math.max(0, Math.min(100, Number(item.relevanceScore) || 0)),
        strengths: Array.isArray(item.strengths) ? item.strengths : [],
        gaps: Array.isArray(item.gaps) ? item.gaps : [],
        risks: Array.isArray(item.risks) ? item.risks : [],
        recommendation: item.recommendation || 'consider',
        reasoning: item.reasoning || '',
      }));
  }

  async evaluateCandidatesBatch(
    job: IJob,
    applicants: IApplicant[],
    sessionId?: string
  ): Promise<Array<{ applicantId: string; evaluation: CandidateEvaluation }>> {
    if (applicants.length === 0) return [];

    try {
      const prompt = buildBatchEvaluationPrompt(job, applicants);
      const generated = await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          return await this.generateWithGeminiThenFallback(prompt, sessionId, 'batch');
        }, 3, 1000);
      });

      // Parse batch JSON and map each item back to its applicantId
      const batchItems = this.parseBatchResponse(generated.text);
      const byId = new Map(batchItems.map((item) => [item.applicantId, item]));

      const results: Array<{ applicantId: string; evaluation: CandidateEvaluation }> = [];

      for (const applicant of applicants) {
        const item = byId.get(applicant._id.toString());
        if (!item) {
          const fallback = await this.evaluateCandidate(job, applicant, sessionId);
          results.push({ applicantId: applicant._id.toString(), evaluation: fallback });
          continue;
        }

        const scoreBreakdown = {
          skills: item.skillsScore,
          experience: item.experienceScore,
          education: item.educationScore,
          relevance: item.relevanceScore,
        };

        results.push({
          applicantId: applicant._id.toString(),
          evaluation: {
            matchScore: calculateMatchScore(scoreBreakdown, job.weights),
            strengths: item.strengths,
            gaps: item.gaps,
            risks: item.risks,
            recommendation: item.recommendation,
            reasoning: item.reasoning,
            aiFallback: false,
            scoreBreakdown,
            geminiResponse: {
              rawResponse: generated.text,
              model: generated.model,
            },
          },
        });
      }

      return results;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Batch evaluation failed, falling back to per-candidate: ${message}`);
      const results: Array<{ applicantId: string; evaluation: CandidateEvaluation }> = [];
      for (const applicant of applicants) {
        const evaluation = await this.evaluateCandidate(job, applicant, sessionId);
        results.push({ applicantId: applicant._id.toString(), evaluation });
      }
      return results;
    }
  }

  async parseResume(cvText: string): Promise<{ data: ParsedResumeProfile; provider: string; model: string }> {
    try {
      return await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          const prompt = `You are an expert CV/resume parser. Extract structured profile data from the following CV/resume text.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "firstName": "Talent's first name",
  "lastName": "Talent's last name",
  "headline": "Short professional summary (e.g., Backend Engineer)",
  "location": "City, Country",
  "bio": "Professional summary in 2-3 sentences",
  "skills": ["skill1", "skill2"],
  "languages": [
    { "name": "English", "proficiency": "Native/Fluent/Conversational/Basic" }
  ],
  "experience": [
    {
      "role": "Job Title",
      "company": "Company Name",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or Present",
      "description": "Key responsibilities",
      "technologies": ["Node.js", "React"],
      "isCurrent": true/false
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "University Name",
      "fieldOfStudy": "Field of Study",
      "startYear": "YYYY",
      "endYear": "YYYY"
    }
  ],
  "phone": "phone number or """
}

Rules:
- Extract ALL skills mentioned (technical, soft, tools, languages)
- List experience from most recent to oldest (max 5 entries)
- List education from most recent to oldest (max 3 entries)
- If a field is not found, use empty string "" for strings or [] for arrays
- Skills must be an array of individual skill strings
- Do not invent or assume information not present in the CV

CV TEXT:
---
${cvText.slice(0, 8000)}
---`;

          const generated = await this.generateWithGeminiThenFallback(prompt, undefined, 'content');
          const text = generated.text.trim();

          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found in Gemini response');

          const parsed = JSON.parse(jsonMatch[0]);

          return {
            data: {
              firstName: String(parsed.firstName || '').trim(),
              lastName: String(parsed.lastName || '').trim(),
              headline: String(parsed.headline || '').trim(),
              location: String(parsed.location || '').trim(),
              bio: String(parsed.bio || '').trim(),
              phone: String(parsed.phone || '').trim(),
              skills: Array.isArray(parsed.skills) 
                ? parsed.skills.map((s: any) => typeof s === 'string' ? s : String(s?.name || s)).filter(Boolean)
                : [],
              languages: Array.isArray(parsed.languages) 
                ? parsed.languages.map((l: any) => {
                    const name = typeof l === 'string' ? l : String(l?.name || '');
                    let proficiency = typeof l === 'object' ? String(l?.proficiency || 'Conversational') : 'Conversational';
                    
                    // Map AI proficiency to our enum
                    const validProficiencies = ['Basic', 'Conversational', 'Fluent', 'Native'];
                    if (!validProficiencies.includes(proficiency)) {
                      if (proficiency.includes('Native')) proficiency = 'Native';
                      else if (proficiency.includes('Fluent')) proficiency = 'Fluent';
                      else if (proficiency.includes('Conversational') || proficiency.includes('Intermediate')) proficiency = 'Conversational';
                      else proficiency = 'Basic';
                    }
                    
                    return { name, proficiency };
                  }).filter((l: { name: string; proficiency: string }) => l.name)
                : [],
              experience: Array.isArray(parsed.experience) 
                ? parsed.experience.slice(0, 5).map((e: any) => ({
                    role: String(e?.role || '').trim(),
                    company: String(e?.company || '').trim(),
                    startDate: String(e?.startDate || '').trim(),
                    endDate: String(e?.endDate || '').trim(),
                    description: String(e?.description || '').trim(),
                    technologies: Array.isArray(e?.technologies) ? e.technologies.map(String) : [],
                    isCurrent: Boolean(e?.isCurrent)
                  }))
                : [],
              education: Array.isArray(parsed.education) 
                ? parsed.education.slice(0, 3).map((e: any) => ({
                    degree: String(e?.degree || '').trim(),
                    institution: String(e?.institution || '').trim(),
                    fieldOfStudy: String(e?.fieldOfStudy || '').trim(),
                    startYear: String(e?.startYear || '').trim(),
                    endYear: String(e?.endYear || '').trim()
                  }))
                : [],
            },
            provider: generated.provider,
            model: generated.model
          };
        }, 3, 1000);
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error parsing resume with Gemini:', error);
      throw new Error(`Resume parsing failed: ${message}`);
    }
  }

  async batchEvaluate(job: IJob, applicants: IApplicant[], sessionId?: string): Promise<CandidateEvaluation[]> {
    const evaluations: CandidateEvaluation[] = [];

    for (const applicant of applicants) {
      try {
        const evaluation = await this.evaluateCandidate(job, applicant, sessionId);
        evaluations.push(evaluation);
      } catch (error: unknown) {
        const err = error as { status?: number };
        if (err.status === 429) {
          logger.warn('Rate limit hit during batch evaluation');
        }
        logger.error(`Failed to evaluate applicant ${applicant._id}:`, error);
      }
    }

    return evaluations;
  }

  async generateTechnicalTest(
    job: IJob,
    applicant: IApplicant
  ): Promise<Array<{ question: string; options: string[]; correctOptionIndex: number; expectedAnswer: string }>> {
    try {
      return await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          // Strip HTML tags from rich-text fields
          const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

          const jobSkills = stripHtml(job.requirements.skills);
          const jobDescription = stripHtml(job.description).slice(0, 2000);
          const experienceRange = job.requirements.experience.maxYears
            ? `${job.requirements.experience.minYears}-${job.requirements.experience.maxYears} years`
            : `${job.requirements.experience.minYears}+ years`;
          const educationReqs = job.requirements.education.join(', ') || 'Not specified';
          const candidateExperience = applicant.profile.experience
            .map(e => `${e.role} at ${e.company} (${e.duration})`)
            .join('; ') || 'Not provided';

          const prompt = `You are an expert technical interviewer for the role of "${job.title}"${job.company ? ` at ${job.company}` : ''}.

=== JOB REQUIREMENTS (SOURCE OF TRUTH) ===
Title: ${job.title}
Required Experience: ${experienceRange}
Required Skills: ${jobSkills}
Education Required: ${educationReqs}
Job Description: ${jobDescription}
Location/Mode: ${job.requirements.location || 'Not specified'}

=== CANDIDATE CONTEXT ===
Candidate: ${applicant.profile.name}
Their Claimed Skills: ${applicant.profile.skills.join(', ') || 'Not listed'}
Their Experience: ${candidateExperience}
Their Summary: ${(applicant.profile as Record<string, unknown>)?.summary || 'Not provided'}

=== YOUR TASK ===
Generate exactly 10 multiple-choice questions (MCQs) to screen this candidate for the "${job.title}" role.

STRICT RULES - follow every one:
1. BASE EVERY QUESTION on the JOB REQUIREMENTS above - not on generic interview templates.
2. Each question must test a DIFFERENT aspect listed in the job requirements (vary: technical depth, problem-solving, tools/systems knowledge, situational judgment, domain expertise).
3. Questions must be SCENARIO-BASED or PRACTICAL - no "what is X" definitions.
4. If the candidate's experience or skills overlap with job requirements, probe for depth and real evidence.
5. If the candidate lacks a requirement, create a question that would reveal that gap.
6. NO duplicate or paraphrased questions - each must test something distinct.
7. Each question must have exactly 4 options. Only one option is correct.
8. expectedAnswer should briefly justify why the correct option is best (1-2 sentences).

Return ONLY a valid JSON array - no markdown fences, no extra text:
[
  {
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correctOptionIndex": 0,
    "expectedAnswer": "Short explanation"
  }
]`;

          const generated = await this.generateWithGeminiThenFallback(prompt, undefined, 'test');
          const text = generated.text.trim();

          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) throw new Error('No valid JSON array found in Gemini response');

          const parsed = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('Gemini returned empty or invalid question array');
          }

          const normalized = parsed
            .map((item) => ({
              question: String(item?.question || '').trim(),
              options: Array.isArray(item?.options)
                ? item.options.map((opt: unknown) => String(opt).trim()).filter(Boolean)
                : [],
              correctOptionIndex: Number.isInteger(item?.correctOptionIndex) ? item.correctOptionIndex : -1,
              expectedAnswer: String(item?.expectedAnswer || '').trim(),
            }))
            .filter((item) => item.question && item.options.length === 4 && item.correctOptionIndex >= 0);

          if (normalized.length < 5) {
            throw new Error('Gemini returned too few valid multiple-choice questions');
          }

          return normalized.slice(0, 10);
        }, 3, 1000);
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error generating technical test with Gemini:', error);
      throw new Error(`Technical test generation failed: ${message}`);
    }
  }

  async gradeTechnicalTest(
    job: IJob,
    applicant: IApplicant,
    questions: Array<{ question: string; options: string[]; correctOptionIndex: number; expectedAnswer: string }>,
    answers: Array<{ question: string; answer: string; selectedOptionIndex?: number }>
  ): Promise<{
    totalScore: number;
    perQuestion: Array<{ question: string; score: number; feedback: string }>;
    overallFeedback: string;
    provider: 'gemini' | 'openrouter';
    model: string;
  }> {
    const cleanedAnswers = answers.map((a) => ({
      question: a.question,
      answer: a.answer,
      selectedOptionIndex: a.selectedOptionIndex,
    }));

    const prompt = `You are an expert technical interviewer. Score the candidate's MCQ answers.

Job Title: ${job.title}
Candidate: ${applicant.profile.name}

You will receive a list of MCQs with options, the correct option index, and the candidate's selected answer.

Return ONLY valid JSON with this exact shape:
{
  "totalScore": 0-100,
  "overallFeedback": "short summary",
  "perQuestion": [
    { "question": "...", "score": 0-10, "feedback": "brief feedback" }
  ]
}

Rules:
- Score each question from 0-10.
- totalScore must be the average of perQuestion scores scaled to 0-100.
- Keep feedback short and constructive.
- No markdown, no extra text.

DATA:
${JSON.stringify(
      questions.map((q) => ({
        question: q.question,
        options: Array.isArray(q.options) ? q.options : [],
        correctOptionIndex: q.correctOptionIndex,
        expectedAnswer: q.expectedAnswer,
        candidateAnswer: cleanedAnswers.find((a) => a.question === q.question)?.answer || '',
      })),
      null,
      2
    )}`;

    const generated = await this.generateWithGeminiThenFallback(prompt, undefined, 'test');
    const text = generated.text.trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in grading response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const perQuestion = Array.isArray(parsed.perQuestion) ? parsed.perQuestion : [];
    const totalScore = typeof parsed.totalScore === 'number' ? parsed.totalScore : 0;
    const overallFeedback = parsed.overallFeedback || '';

    return {
      totalScore,
      perQuestion,
      overallFeedback,
      provider: generated.provider,
      model: generated.model,
    };
  }
}

export const geminiService = new GeminiService();


