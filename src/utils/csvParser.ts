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

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeRow = (row: Record<string, any>): Record<string, any> => {
  const normalized: Record<string, any> = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const safeKey = normalizeKey(key);
    if (!safeKey) return;
    if (normalized[safeKey] === undefined) {
      normalized[safeKey] = value;
    }
  });
  return normalized;
};

const pickField = (row: Record<string, any>, aliases: string[]): any => {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
};

const asText = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};

export const parseSkillsString = (skillsStr: string | any): string[] => {
  const raw = asText(skillsStr);
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

export const parseExperienceString = (expStr: string | any): ExperienceEntry[] => {
  const raw = asText(expStr);
  if (!raw) return [];
  
  const entries = raw.split(/\n|;/).filter((e) => e.trim());
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

export const parseEducationString = (eduStr: string | any): EducationEntry[] => {
  const raw = asText(eduStr);
  if (!raw) return [];
  
  const entries = raw.split(/\n|;/).filter((e) => e.trim());
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
        const normalized = normalizeRow(row);
        const name = asText(pickField(normalized, [
          'name',
          'full name',
          'fullname',
          'candidate name',
          'applicant name',
          'applicant',
        ]));
        const email = asText(pickField(normalized, [
          'email',
          'e-mail',
          'email address',
          'emailaddress',
          'mail',
        ]));

        if (name && email) {
          applicants.push({
            name,
            email: email.toLowerCase(),
            phone: asText(pickField(normalized, ['phone', 'phone number', 'phonenumber', 'mobile', 'telephone'])),
            skills: parseSkillsString(pickField(normalized, ['skills', 'skill', 'skillset', 'technologies', 'tech stack', 'stack'])),
            experience: parseExperienceString(pickField(normalized, ['experience', 'work experience', 'employment', 'work history'])),
            education: parseEducationString(pickField(normalized, ['education', 'degree', 'qualification', 'academic', 'school', 'university'])),
            summary: asText(pickField(normalized, ['summary', 'bio', 'about', 'profile', 'notes'])),
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
      const normalized = normalizeRow(row);
      const name = asText(pickField(normalized, [
        'name',
        'full name',
        'fullname',
        'candidate name',
        'applicant name',
        'applicant',
      ]));
      const email = asText(pickField(normalized, [
        'email',
        'e-mail',
        'email address',
        'emailaddress',
        'mail',
      ]));

      if (name && email) {
        applicants.push({
          name,
          email: email.toLowerCase(),
          phone: asText(pickField(normalized, ['phone', 'phone number', 'phonenumber', 'mobile', 'telephone'])),
          skills: parseSkillsString(pickField(normalized, ['skills', 'skill', 'skillset', 'technologies', 'tech stack', 'stack'])),
          experience: parseExperienceString(pickField(normalized, ['experience', 'work experience', 'employment', 'work history'])),
          education: parseEducationString(pickField(normalized, ['education', 'degree', 'qualification', 'academic', 'school', 'university'])),
          summary: asText(pickField(normalized, ['summary', 'bio', 'about', 'profile', 'notes'])),
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
