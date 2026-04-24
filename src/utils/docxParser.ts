import mammoth from 'mammoth';
import { ParsedApplicant } from './csvParser';
import logger from '../utils/logger';

export const parseDOCX = async (buffer: Buffer): Promise<ParsedApplicant> => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    if (result.messages.length > 0) {
      logger.debug('Mammoth messages:', result.messages);
    }

    return {
      name: '',
      email: '',
      skills: [],
      experience: [],
      education: [],
      summary: '',
      rawText: text,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Mammoth DOCX parsing failed: ${message}`);
    throw new Error(`Failed to parse DOCX: ${message}`);
  }
};
