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
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: string;
}

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const safeKey = normalizeKey(key);
    if (!safeKey) return;
    if (normalized[safeKey] === undefined) {
      normalized[safeKey] = value;
    }
  });
  return normalized;
};

const pickField = (row: Record<string, unknown>, aliases: string[]): unknown => {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
};

const asText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};

export const parseSkillsString = (skillsStr: unknown): string[] => {
  const raw = asText(skillsStr);
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

export const parseExperienceString = (expStr: unknown): ExperienceEntry[] => {
  const raw = asText(expStr);
  if (!raw) return [];
  
  const entries = raw.split(/\n|;/).filter((e) => e.trim());
  return entries.map((entry) => {
    const parts = entry.split('|').map((p) => p.trim());
    return {
      role: parts[0] || 'Not specified',
      company: parts[1] || 'Not specified',
      duration: parts[2] || 'Not specified',
      description: parts[3],
    };
  });
};

export const parseEducationString = (eduStr: unknown): EducationEntry[] => {
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
      .on('data', (row: Record<string, unknown>) => {
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
          const firstName = asText(pickField(normalized, ['firstname', 'first name', 'first_name'])) || name.split(' ')[0] || '';
          const lastName = asText(pickField(normalized, ['lastname', 'last name', 'last_name'])) || name.split(' ').slice(1).join(' ') || '';
          const headline = asText(pickField(normalized, ['headline', 'title', 'position', 'job title', 'role'])) || 'Professional';
          const location = asText(pickField(normalized, ['location', 'city', 'address', 'region'])) || 'Not specified';

          applicants.push({
            name,
            email: email.toLowerCase(),
            phone: asText(pickField(normalized, ['phone', 'phone number', 'phonenumber', 'mobile', 'telephone'])),
            skills: parseSkillsString(pickField(normalized, ['skills', 'skill', 'skillset', 'technologies', 'tech stack', 'stack'])),
            experience: parseExperienceString(pickField(normalized, ['experience', 'work experience', 'employment', 'work history'])),
            education: parseEducationString(pickField(normalized, ['education', 'degree', 'qualification', 'academic', 'school', 'university'])),
            summary: asText(pickField(normalized, ['summary', 'bio', 'about', 'profile', 'notes'])),
            firstName,
            lastName,
            headline,
            location,
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);

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
        const firstName = asText(pickField(normalized, ['firstname', 'first name', 'first_name'])) || name.split(' ')[0] || '';
        const lastName = asText(pickField(normalized, ['lastname', 'last name', 'last_name'])) || name.split(' ').slice(1).join(' ') || '';
        const headline = asText(pickField(normalized, ['headline', 'title', 'position', 'job title', 'role'])) || 'Professional';
        const location = asText(pickField(normalized, ['location', 'city', 'address', 'region'])) || 'Not specified';

        applicants.push({
          name,
          email: email.toLowerCase(),
          phone: asText(pickField(normalized, ['phone', 'phone number', 'phonenumber', 'mobile', 'telephone'])),
          skills: parseSkillsString(pickField(normalized, ['skills', 'skill', 'skillset', 'technologies', 'tech stack', 'stack'])),
          experience: parseExperienceString(pickField(normalized, ['experience', 'work experience', 'employment', 'work history'])),
          education: parseEducationString(pickField(normalized, ['education', 'degree', 'qualification', 'academic', 'school', 'university'])),
          summary: asText(pickField(normalized, ['summary', 'bio', 'about', 'profile', 'notes'])),
          firstName,
          lastName,
          headline,
          location,
        });
      }
    }

    if (applicants.length === 0) {
      throw new Error('No valid applicants found in Excel file');
    }

    return applicants;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Excel parsing error: ${message}`);
  }
};
