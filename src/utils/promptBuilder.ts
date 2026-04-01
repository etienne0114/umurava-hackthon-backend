import { IJob } from '../models/Job';
import { IApplicant } from '../models/Applicant';
import { WeightConfig } from '../types';

export interface PromptTemplate {
  system: string;
  user: string;
  format: string;
}

export const buildEvaluationPrompt = (job: IJob, applicant: IApplicant): string => {
  const experienceRange = job.requirements.experience.maxYears
    ? `${job.requirements.experience.minYears}-${job.requirements.experience.maxYears}`
    : `${job.requirements.experience.minYears}+`;

  const experienceText = applicant.profile.experience
    .map((exp) => `${exp.title} at ${exp.company} (${exp.duration})`)
    .join(', ') || 'No experience listed';

  const educationText = applicant.profile.education
    .map((edu) => `${edu.degree} from ${edu.institution} (${edu.year})`)
    .join(', ') || 'No education listed';

  return `You are an expert recruitment AI assistant specialized in the African tech market. Your role is to evaluate candidates objectively and ethically based on job requirements.

### CORE OBJECTIVES:
1. **Semantic Match**: Look beyond keywords. Understand if a candidate's projects and responsibilities demonstrate the required skills.
2. **Contextual Evaluation**: Consider the impact of their work and the scale of systems they've handled.
3. **Bias Mitigation**: Ignore demographic indicators (names, locations) and focus strictly on competence and potential.
4. **Explainable Reasoning**: Provide a clear, evidence-based justification for every score.

### JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company || 'Confidential'}
- Employment Type: ${job.employmentType || 'Full-time'}
- Work Mode: ${job.workMode || 'Remote'}
- Description: ${job.description}
- Required Skills: ${job.requirements.skills.join(', ')}
- Experience Required: ${experienceRange} years
- Education Required: ${job.requirements.education.join(', ') || 'Not specified'}

### CANDIDATE PROFILE:
- Name: ${applicant.profile.name}
- Current Skills: ${applicant.profile.skills.join(', ') || 'No skills listed'}
- Experience History: ${experienceText}
- Education: ${educationText}
- Professional Summary: ${applicant.profile.summary || 'No summary provided'}

### EVALUATION CRITERIA (Weighted):
- Skills Match (${job.weights.skills * 100}%): Technical proficiency and tool mastery.
- Experience Match (${job.weights.experience * 100}%): Tenure and relevance of past roles.
- Education Match (${job.weights.education * 100}%): Academic background and certifications.
- Overall Relevance (${job.weights.relevance * 100}%): Cultural fit and overall suitability.

### OUTPUT FORMAT (JSON ONLY):
{
  "skillsScore": <0-100>,
  "experienceScore": <0-100>,
  "educationScore": <0-100>,
  "relevanceScore": <0-100>,
  "strengths": ["Clear evidence of X", "Strong foundation in Y", ...],
  "gaps": ["Missing hands-on experience in Z", "Limited exposure to W", ...],
  "risks": ["Potential mismatch in career goals", ...],
  "recommendation": "highly_recommended|recommended|consider|not_recommended",
  "reasoning": "A comprehensive summary (at least 150 words) justifying the scores based on specific evidence in the profile vs the job needs."
}

IMPORTANT: Provide ONLY the JSON object. Do not include any preamble or postscript.`;
};

export interface GeminiEvaluationResponse {
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  relevanceScore: number;
  strengths: string[];
  gaps: string[];
  risks: string[];
  recommendation: 'highly_recommended' | 'recommended' | 'consider' | 'not_recommended';
  reasoning: string;
}

export const parseGeminiResponse = (responseText: string): GeminiEvaluationResponse => {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (
      typeof parsed.skillsScore !== 'number' ||
      typeof parsed.experienceScore !== 'number' ||
      typeof parsed.educationScore !== 'number' ||
      typeof parsed.relevanceScore !== 'number'
    ) {
      throw new Error('Invalid score values in response');
    }

    if (!Array.isArray(parsed.strengths) || parsed.strengths.length === 0) {
      throw new Error('Strengths must be a non-empty array');
    }

    if (!parsed.reasoning || parsed.reasoning.length < 50) {
      throw new Error('Reasoning must be at least 50 characters');
    }

    return {
      skillsScore: Math.max(0, Math.min(100, parsed.skillsScore)),
      experienceScore: Math.max(0, Math.min(100, parsed.experienceScore)),
      educationScore: Math.max(0, Math.min(100, parsed.educationScore)),
      relevanceScore: Math.max(0, Math.min(100, parsed.relevanceScore)),
      strengths: parsed.strengths,
      gaps: parsed.gaps || [],
      risks: parsed.risks || [],
      recommendation: parsed.recommendation || 'consider',
      reasoning: parsed.reasoning,
    };
  } catch (error: any) {
    throw new Error(`Failed to parse Gemini response: ${error.message}`);
  }
};

export const calculateMatchScore = (
  scoreBreakdown: {
    skills: number;
    experience: number;
    education: number;
    relevance: number;
  },
  weights: WeightConfig
): number => {
  const matchScore =
    scoreBreakdown.skills * weights.skills +
    scoreBreakdown.experience * weights.experience +
    scoreBreakdown.education * weights.education +
    scoreBreakdown.relevance * weights.relevance;

  return Math.round(matchScore * 100) / 100;
};
