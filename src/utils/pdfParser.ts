import pdf from 'pdf-parse';
import { ParsedApplicant } from './csvParser';
import { ExperienceEntry, EducationEntry } from '../types';
import logger from '../utils/logger';

export const parsePDF = async (buffer: Buffer): Promise<ParsedApplicant> => {
  let text = '';
  try {
    const data = await pdf(buffer);
    text = data.text;
  } catch (error: any) {
    logger.warn(`pdf-parse failed, falling back to raw text extraction: ${error.message}`);
    // Fallback: try to extract text as UTF-8 string (works for many simple/uncompressed PDFs)
    text = buffer.toString('utf8').replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
  }

  try {
    const name = extractName(text);
    const email = extractEmail(text);
    const phone = extractPhone(text);
    const skills = extractSkills(text);
    const experience = extractExperience(text);
    const education = extractEducation(text);

    if (!email) {
      throw new Error('Could not extract required field (email) from PDF');
    }

    const finalName = name || email.split('@')[0];

    return {
      name: finalName,
      email: email.toLowerCase(),
      phone,
      skills,
      experience,
      education,
      summary: extractSummary(text),
      rawText: text,
    };
  } catch (error: any) {
    throw new Error(`PDF parsing error: ${error.message}`);
  }
};

const extractName = (text: string): string => {
  // Try to find a line that looks like a name (usually at the top)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Look for common name patterns or just take the first non-empty line
  // Avoid lines that look like headers or contact info
  for (const line of lines) {
    if (line.length > 2 && !line.includes('@') && !/^\d+/.test(line) && line.length < 50) {
      return line;
    }
  }
  
  return lines[0] || 'Unknown Candidate';
};

const extractEmail = (text: string): string => {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = text.match(emailRegex);
  return matches ? matches[0] : '';
};

const extractPhone = (text: string): string | undefined => {
  const phoneRegex = /(\+?\d{1,4}[-.\s]?(?:\(\d{1,3}\)[-.\s]?)?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;
  const matches = text.match(phoneRegex);
  return matches ? matches[0] : undefined;
};

const extractSkills = (text: string): string[] => {
  const skillsSection = text.match(/skills?:?\s*(.*?)(?=\n\n|experience|education|$)/is);
  if (!skillsSection) return [];
  
  const skillsText = skillsSection[1];
  return skillsText
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 50);
};

const extractExperience = (text: string): ExperienceEntry[] => {
  const expSection = text.match(/experience:?\s*(.*?)(?=\n\n|education|skills|$)/is);
  if (!expSection) return [];
  
  return [{
    title: 'Experience',
    company: 'See resume',
    duration: 'See resume',
    description: expSection[1].substring(0, 500),
  }];
};

const extractEducation = (text: string): EducationEntry[] => {
  const eduSection = text.match(/education:?\s*(.*?)(?=\n\n|experience|skills|$)/is);
  if (!eduSection) return [];
  
  return [{
    degree: 'See resume',
    institution: 'See resume',
    year: 'See resume',
  }];
};

const extractSummary = (text: string): string => {
  const summarySection = text.match(/summary:?\s*(.*?)(?=\n\n|experience|education|skills|$)/is);
  return summarySection ? summarySection[1].substring(0, 500) : '';
};
