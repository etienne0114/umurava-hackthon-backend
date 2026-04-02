export interface WeightConfig {
  skills: number;
  experience: number;
  education: number;
  relevance: number;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  duration: string;
  description?: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface JobRequirements {
  skills: string;
  experience: {
    minYears: number;
    maxYears?: number;
  };
  education: string[];
  location?: string;
}

export type JobStatus = 'draft' | 'active' | 'closed';
export type ScreeningStatus = 'not_started' | 'in_progress' | 'completed';
export type ApplicantSource = 'umurava' | 'upload';
export type Recommendation = 'highly_recommended' | 'recommended' | 'consider' | 'not_recommended';
export type SessionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type UserRole = 'talent' | 'company';
