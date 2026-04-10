export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type LanguageProficiency = 'Basic' | 'Conversational' | 'Fluent' | 'Native';

export interface SkillEntry {
  name: string;
  level: SkillLevel;
  yearsOfExperience?: number;
}

export interface LanguageEntry {
  name: string;
  proficiency: LanguageProficiency;
}

export interface ExperienceEntry {
  role: string;
  company: string;
  duration?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  technologies?: string[];
  isCurrent?: boolean;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  fieldOfStudy?: string;
  startYear?: number;
  endYear?: number;
}

export interface CertificationEntry {
  name: string;
  issuer: string;
  issueDate?: string;
}

export interface ProjectEntry {
  name: string;
  description: string;
  role: string;
  technologies: string[];
  link?: string;
  startDate?: string;
  endDate?: string;
}

export interface Availability {
  status: 'Available' | 'Open to Opportunities' | 'Not Available';
  type: 'Full-time' | 'Part-time' | 'Contract';
  startDate?: string;
}

export interface SocialLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  website?: string;
}

export interface WeightConfig {
  skills: number;
  experience: number;
  education: number;
  relevance: number;
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
