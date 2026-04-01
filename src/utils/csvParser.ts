import csv from 'csv-parser';
import { Readable } from 'stream';
import { ExperienceEntry, EducationEntry } from '../types';
import XLSX from 'xlsx';

export interface ParsedApplicant {
  name: string;
  email: string;
  phone?: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  summary?: string;
  rawText?: string;
}

export const parseSkillsString = (skillsStr: string): string[] => {
  if (!skillsStr) return [];
  return skillsStr
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

export const parseExperienceString = (expStr: string): ExperienceEntry[] => {
  if (!expStr) return [];
  
  const entries = expStr.split(/\n|;/).filter((e) => e.trim());
  return entries.map((entry) => {
    const parts = entry.split('|').map((p) => p.trim());
    return {
      title: parts[0] || 'Not specified',
      company: parts[1] || 'Not specified',
      duration: parts[2] || 'Not specified',
      description: parts[3],
    };
  });
};

export const parseEducationString = (eduStr: string): EducationEntry[] => {
  if (!eduStr) return [];
  
  const entries = eduStr.split(/\n|;/).filter((e) => e.trim());
  return entries.map((entry) => {
    const parts = entry.split('|').map((p) => p.trim());
    return {
      degree: parts[0] || 'Not specified',
      institution: parts[1] || 'Not specified',
      year: parts[2] || 'Not specified',
    };
  });
};

export const parseCSV = (buffer: Buffer): Promise<ParsedApplicant[]> => {
  return new Promise((resolve, reject) => {
    const applicants: ParsedApplicant[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(csv())
      .on('data', (row: any) => {
        const name = row.name || row.Name || row.NAME || '';
        const email = row.email || row.Email || row.EMAIL || '';

        if (name && email) {
          applicants.push({
            name,
            email: email.toLowerCase(),
            phone: row.phone || row.Phone || row.PHONE,
            skills: parseSkillsString(row.skills || row.Skills || row.SKILLS || ''),
            experience: parseExperienceString(row.experience || row.Experience || ''),
            education: parseEducationString(row.education || row.Education || ''),
            summary: row.summary || row.Summary || row.SUMMARY,
          });
        }
      })
      .on('end', () => {
        if (applicants.length === 0) {
          reject(new Error('No valid applicants found in CSV file'));
        } else {
          resolve(applicants);
        }
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
};

export const parseExcel = async (buffer: Buffer): Promise<ParsedApplicant[]> => {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);

    const applicants: ParsedApplicant[] = [];

    for (const row of rows) {
      const name = row.name || row.Name || row.NAME || '';
      const email = row.email || row.Email || row.EMAIL || '';

      if (name && email) {
        applicants.push({
          name,
          email: email.toLowerCase(),
          phone: row.phone || row.Phone || row.PHONE,
          skills: parseSkillsString(row.skills || row.Skills || row.SKILLS || ''),
          experience: parseExperienceString(row.experience || row.Experience || ''),
          education: parseEducationString(row.education || row.Education || ''),
          summary: row.summary || row.Summary || row.SUMMARY,
        });
      }
    }

    if (applicants.length === 0) {
      throw new Error('No valid applicants found in Excel file');
    }

    return applicants;
  } catch (error: any) {
    throw new Error(`Excel parsing error: ${error.message}`);
  }
};
