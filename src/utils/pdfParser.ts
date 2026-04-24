import pdf from 'pdf-parse';
import { ParsedApplicant } from './csvParser';
import logger from '../utils/logger';

export const parsePDF = async (buffer: Buffer): Promise<ParsedApplicant> => {
  let text = '';
  let metadata: any = {};
  
  try {
    const data = await pdf(buffer);
    text = data.text;
    metadata = data.metadata || {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`pdf-parse failed, falling back to raw text extraction: ${message}`);
    // eslint-disable-next-line no-control-regex
    text = buffer.toString('utf8').replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  }

  // Basic extraction for the ParsedApplicant structure
  // The heavy lifting will be done by GeminiService or parseResumeText
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const emailMatches = text.match(emailRegex);
  const email = emailMatches ? emailMatches[0].toLowerCase() : '';

  return {
    name: metadata.Author || metadata.Title || '',
    email: email,
    skills: [],
    experience: [],
    education: [],
    summary: '',
    rawText: text,
  };
};
