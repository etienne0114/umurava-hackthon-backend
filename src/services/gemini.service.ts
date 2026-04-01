import { getGeminiModel, geminiRateLimiter, retryWithBackoff } from '../config/gemini';
import { IJob } from '../models/Job';
import { IApplicant } from '../models/Applicant';
import {
  buildEvaluationPrompt,
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

export interface ParsedResumeProfile {
  name: string;
  position: string;
  bio: string;
  phone: string;
  skills: string[];
  experience: Array<{ title: string; company: string; duration: string; description?: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
}

export class GeminiService {
  private model = getGeminiModel();
  private cache = new Map<string, CandidateEvaluation>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  async evaluateCandidate(job: IJob, applicant: IApplicant): Promise<CandidateEvaluation> {
    const cacheKey = `${job._id}-${applicant._id}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug(`Using cached evaluation for ${cacheKey}`);
      return cached;
    }

    try {
      const evaluation = await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          return await this.performEvaluation(job, applicant);
        }, 3, 1000);
      });

      this.cache.set(cacheKey, evaluation);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      return evaluation;
    } catch (error: any) {
      logger.error(`Error evaluating candidate ${applicant._id}:`, error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  private async performEvaluation(job: IJob, applicant: IApplicant): Promise<CandidateEvaluation> {
    const prompt = buildEvaluationPrompt(job, applicant);
    
    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const parsed = parseGeminiResponse(text);

    const scoreBreakdown = {
      skills: parsed.skillsScore,
      experience: parsed.experienceScore,
      education: parsed.educationScore,
      relevance: parsed.relevanceScore,
    };

    const matchScore = calculateMatchScore(scoreBreakdown, job.weights);

    return {
      matchScore,
      strengths: parsed.strengths,
      gaps: parsed.gaps,
      risks: parsed.risks,
      recommendation: parsed.recommendation,
      reasoning: parsed.reasoning,
      scoreBreakdown,
      geminiResponse: {
        rawResponse: text,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      },
    };
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
  "phone": "phone number if present or empty string"
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

          const result = await this.model.generateContent(prompt);
          const response = await result.response;
          const text = response.text().trim();

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
}

export const geminiService = new GeminiService();
