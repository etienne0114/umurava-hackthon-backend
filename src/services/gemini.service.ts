import { getGeminiModel, geminiRateLimiter, retryWithBackoff } from '../config/gemini';
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
  name: string;
  position: string;
  bio: string;
  phone: string;
  skills: string[];
  languages: string[];
  experience: Array<{ title: string; company: string; duration: string; description?: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
}

export class GeminiService {
  private model = getGeminiModel();
  private cache = new Map<string, { data: CandidateEvaluation; expiresAt: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
  }

  private isGeminiQuotaError(error: any): boolean {
    const message = String(error?.message || '');
    const upper = message.toUpperCase();
    return (
      message.includes('429') ||
      upper.includes('RESOURCE_EXHAUSTED') ||
      upper.includes('TOO MANY REQUESTS') ||
      upper.includes('RATE LIMIT') ||
      upper.includes('QUOTA')
    );
  }

  private async generateWithGeminiThenFallback(
    prompt: string
  ): Promise<{ text: string; provider: 'gemini' | 'openrouter'; model: string }> {
    try {
      const result = await this.model.generateContent(prompt);
      return {
        text: result.response.text(),
        provider: 'gemini',
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      };
    } catch (error: any) {
      const shouldFallback = this.isGeminiQuotaError(error);
      if (!shouldFallback) {
        throw error;
      }

      if (!isOpenRouterConfigured()) {
        logger.warn('Gemini quota/rate limit hit but OpenRouter fallback is not configured (missing OPENROUTER_API_KEY)');
        throw error;
      }

      logger.warn('Gemini quota/rate limit reached, switching to OpenRouter fallback');

      const fallback = await generateWithOpenRouter(
        [{ role: 'user', content: prompt }],
        process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v3.2'
      );

      return {
        text: fallback.text,
        provider: 'openrouter',
        model: fallback.model,
      };
    }
  }

  async evaluateCandidate(job: IJob, applicant: IApplicant): Promise<CandidateEvaluation> {
    const cacheKey = `${job._id}-${applicant._id}`;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug(`Using cached evaluation for ${cacheKey}`);
      return cached.data;
    }

    try {
      const evaluation = await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          return await this.performEvaluation(job, applicant);
        }, 3, 1000);
      });

      this.cache.set(cacheKey, { data: evaluation, expiresAt: Date.now() + this.CACHE_TTL });
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      return evaluation;
    } catch (error: any) {
      const isQuotaExceeded = error.message?.includes('429') || error.message?.includes('quota')
        || error.message?.includes('RESOURCE_EXHAUSTED');

      const reasoning = isQuotaExceeded
        ? 'Gemini AI is currently at its usage limit. This is a temporary neutral evaluation (50%) to ensure screening completes. Please regenerate in 1-2 minutes for accurate scores.'
        : `Gemini evaluation encountered an issue (${error.message}). A neutral score has been assigned - please regenerate screening for accurate results.`;

      logger.warn(`AI provider fallback failed for candidate ${applicant._id}: ${error.message}`);
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

  private async performEvaluation(job: IJob, applicant: IApplicant): Promise<CandidateEvaluation> {
    const prompt = buildEvaluationPrompt(job, applicant);
    const generated = await this.generateWithGeminiThenFallback(prompt);
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
    applicants: IApplicant[]
  ): Promise<Array<{ applicantId: string; evaluation: CandidateEvaluation }>> {
    if (applicants.length === 0) return [];

    try {
      const prompt = buildBatchEvaluationPrompt(job, applicants);
      const generated = await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          return await this.generateWithGeminiThenFallback(prompt);
        }, 3, 1000);
      });

      // Parse batch JSON and map each item back to its applicantId
      const batchItems = this.parseBatchResponse(generated.text);
      const byId = new Map(batchItems.map((item) => [item.applicantId, item]));

      const results: Array<{ applicantId: string; evaluation: CandidateEvaluation }> = [];

      for (const applicant of applicants) {
        const item = byId.get(applicant._id.toString());
        if (!item) {
          const fallback = await this.evaluateCandidate(job, applicant);
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
    } catch (error: any) {
      logger.warn(`Batch evaluation failed, falling back to per-candidate: ${error.message}`);
      const results: Array<{ applicantId: string; evaluation: CandidateEvaluation }> = [];
      for (const applicant of applicants) {
        const evaluation = await this.evaluateCandidate(job, applicant);
        results.push({ applicantId: applicant._id.toString(), evaluation });
      }
      return results;
    }
  }

  async parseResume(cvText: string): Promise<ParsedResumeProfile> {
    try {
      return await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          const prompt = `You are an expert CV/resume parser. Extract structured profile data from the following CV/resume text.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "name": "Full name of the person",
  "position": "Current or most recent job title",
  "bio": "Professional summary in 2-3 sentences highlighting expertise and goals",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Start Year - End Year (or Present)",
      "description": "Key responsibilities and achievements in one sentence"
    }
  ],
  "education": [
    {
      "degree": "Degree Name and Field",
      "institution": "University/School Name",
      "year": "Graduation Year"
    }
  ],
  "phone": "phone number if present or empty string",
  "languages": ["Language 1 (Level)", "Language 2"]
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

          const generated = await this.generateWithGeminiThenFallback(prompt);
          const text = generated.text.trim();

          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found in Gemini response');

          const parsed = JSON.parse(jsonMatch[0]);

          return {
            name: parsed.name || '',
            position: parsed.position || '',
            bio: parsed.bio || '',
            phone: parsed.phone || '',
            skills: Array.isArray(parsed.skills) ? parsed.skills.filter(Boolean) : [],
            languages: Array.isArray(parsed.languages) ? parsed.languages.filter(Boolean) : [],
            experience: Array.isArray(parsed.experience) ? parsed.experience.slice(0, 5) : [],
            education: Array.isArray(parsed.education) ? parsed.education.slice(0, 3) : [],
          };
        }, 3, 1000);
      });
    } catch (error: any) {
      logger.error('Error parsing resume with Gemini:', error);
      throw new Error(`Resume parsing failed: ${error.message}`);
    }
  }

  async batchEvaluate(job: IJob, applicants: IApplicant[]): Promise<CandidateEvaluation[]> {
    const evaluations: CandidateEvaluation[] = [];

    for (const applicant of applicants) {
      try {
        const evaluation = await this.evaluateCandidate(job, applicant);
        evaluations.push(evaluation);
      } catch (error: any) {
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
            .map(e => `${e.title} at ${e.company} (${e.duration})`)
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
Their Summary: ${applicant.profile.summary || 'Not provided'}

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

          const generated = await this.generateWithGeminiThenFallback(prompt);
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
                ? item.options.map((opt: any) => String(opt).trim()).filter(Boolean)
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
    } catch (error: any) {
      logger.error('Error generating technical test with Gemini:', error);
      throw new Error(`Technical test generation failed: ${error.message}`);
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

    const generated = await this.generateWithGeminiThenFallback(prompt);
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


