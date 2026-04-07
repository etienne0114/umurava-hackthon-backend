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
  languages: string[];
  experience: Array<{ title: string; company: string; duration: string; description?: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
}

export class GeminiService {
  private model = getGeminiModel();
  private cache = new Map<string, { data: CandidateEvaluation; expiresAt: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
        : `Gemini evaluation encountered an issue (${error.message}). A neutral score has been assigned — please regenerate screening for accurate results.`;

      logger.warn(`Gemini evaluation fallback for candidate ${applicant._id}: ${error.message}`);
      return {
        matchScore: 50,
        strengths: ['AI Evaluation temporarily unavailable'],
        gaps: [],
        risks: [],
        recommendation: 'consider' as Recommendation,
        reasoning,
        scoreBreakdown: { skills: 50, experience: 50, education: 50, relevance: 50 },
      };
    }
  }

  private async performEvaluation(job: IJob, applicant: IApplicant): Promise<CandidateEvaluation> {
    const prompt = buildEvaluationPrompt(job, applicant);
    
    const result = await this.model.generateContent(prompt);
    const text = result.response.text();

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
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
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

          const result = await this.model.generateContent(prompt);
          const text = result.response.text().trim();

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

  async generateTechnicalTest(job: IJob, applicant: IApplicant): Promise<Array<{ question: string; expectedAnswer: string }>> {
    try {
      return await geminiRateLimiter.execute(async () => {
        return await retryWithBackoff(async () => {
          // Strip HTML tags from rich-text fields
          const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

          const jobSkills = stripHtml(job.requirements.skills);
          const jobDescription = stripHtml(job.description).slice(0, 2000);
          const experienceRange = job.requirements.experience.maxYears
            ? `${job.requirements.experience.minYears}–${job.requirements.experience.maxYears} years`
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
Generate exactly 7 interview questions to screen this candidate for the "${job.title}" role.

STRICT RULES — follow every one:
1. BASE EVERY QUESTION on the JOB REQUIREMENTS above — not on generic interview templates.
2. Each question must test a DIFFERENT aspect listed in the job requirements (vary: technical depth, problem-solving, tools/systems knowledge, situational judgment, domain expertise).
3. Questions must be SCENARIO-BASED or PRACTICAL — no "what is X" definitions.
4. If the candidate's experience or skills overlap with job requirements, probe for depth and real evidence.
5. If the candidate lacks a requirement, create a question that would reveal that gap.
6. NO duplicate or paraphrased questions — each must test something distinct.
7. expectedAnswer: describe 2–3 concrete points that a strong answer must include.

Return ONLY a valid JSON array — no markdown fences, no extra text:
[
  { "question": "...", "expectedAnswer": "..." }
]`;

          const result = await this.model.generateContent(prompt);
          const text = result.response.text().trim();

          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) throw new Error('No valid JSON array found in Gemini response');

          const parsed = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('Gemini returned empty or invalid question array');
          }

          return parsed;
        }, 3, 1000);
      });
    } catch (error: any) {
      logger.error('Error generating technical test with Gemini:', error);
      throw new Error(`Technical test generation failed: ${error.message}`);
    }
  }
}

export const geminiService = new GeminiService();
