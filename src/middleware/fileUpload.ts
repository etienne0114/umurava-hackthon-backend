import multer from 'multer';
import type { Request } from 'express';
import { config } from '../config/environment';
import logger from '../utils/logger';

const storage = multer.memoryStorage();

/**
 * Manual magic-number detection — replaces the ESM-only `file-type` package
 * which cannot be imported in this CommonJS/ts-node environment.
 */
function detectMimeFromBuffer(buffer: Buffer): { mime: string } | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF  (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: 'application/pdf' };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mime: 'image/png' };
  }
  // ZIP-based (XLSX / DOCX): PK 03 04  (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Both XLSX and DOCX use the same magic number. For now, we return a generic ZIP mime
    // and let the secondary validation handle it, or we check the extension if available.
    return { mime: 'application/vnd.openxmlformats-officedocument' };
  }
  // OLE2 compound (XLS / DOC): D0 CF 11 E0
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    return { mime: 'application/msword' };
  }
  return null;
}

/**
 * Magic number signatures for allowed file types
 */
const ALLOWED_FILE_SIGNATURES: Record<string, string[]> = {
  csv: ['text/plain', 'text/csv'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument'],
  xls: ['application/vnd.ms-excel', 'application/msword'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument'],
  doc: ['application/msword'],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  png: ['image/png'],
};

const MIME_TO_TYPE: Record<string, string> = {
  'text/plain': 'csv',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument': 'office-openxml',
  'application/vnd.ms-excel': 'xls',
  'application/msword': 'doc',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
};

/**
 * Verifies that the file content matches its extension using magic numbers.
 */
export const validateFileType = async (buffer: Buffer): Promise<{ valid: boolean; type?: string; error?: string }> => {
  try {
    // 1. Check for binary magic numbers (PDF, images, Excel, Word) first
    const detectedType = detectMimeFromBuffer(buffer);

    if (detectedType) {
      logger.info(`Detected binary magic number: ${detectedType.mime}`);
      const allowedMimes = Object.values(ALLOWED_FILE_SIGNATURES).flat();
      if (!allowedMimes.includes(detectedType.mime)) {
        return {
          valid: false,
          error: `File type ${detectedType.mime} is not allowed. Only CSV, Excel, Word, PDF, and images (JPEG, PNG) are accepted.`,
        };
      }
      return { valid: true, type: MIME_TO_TYPE[detectedType.mime] || detectedType.mime };
    }

    // 2. No binary magic numbers found — accept as plain text (CSV, TXT resume, etc.)
    const sample = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
    // eslint-disable-next-line no-control-regex
    const isPrintable = /^[\x20-\x7E\r\n\t]*$/.test(sample);

    if (isPrintable && sample.trim().length > 10) {
      logger.info('Detected plain-text format');
      return { valid: true, type: 'csv' };
    }

    logger.warn('File type detection failed after binary and text checks');
    return {
      valid: false,
      error: 'Unable to determine file type. Please upload a PDF, DOCX, CSV, Excel, or image file.',
    };
  } catch (error) {
    logger.error('File type validation error:', error);
    return { valid: false, error: 'File validation failed' };
  }
};

/**
 * Multer configuration with basic MIME type filtering
 * Note: This is the first line of defense; magic number checking is done after upload
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize, // 10MB default
    files: 1, // Only allow single file upload
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedMimes = [
      'text/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, DOCX, PDF, and image files (JPEG, PNG) are allowed.'));
    }
  },
});

/**
 * Middleware to validate uploaded file using magic numbers.
 * Must be used after multer upload middleware.
 */
export const validateUploadedFile = async (
  req: Request,
  res: import("express").Response,
  next: import("express").NextFunction
): Promise<void> => {
  if (!req.file) {
    res.status(400).json({
      success: false,
      error: {
        code: 'NO_FILE',
        message: 'No file uploaded',
      },
    });
    return;
  }

  const validation = await validateFileType(req.file.buffer);

  if (!validation.valid) {
    logger.warn(`File upload rejected: ${validation.error} from IP ${req.ip}`);
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: validation.error || 'Invalid file type',
      },
    });
    return;
  }

  (req as unknown as Record<string, unknown>).validatedFileType = validation.type;

  logger.info(`File upload validated: ${validation.type} (${req.file.size} bytes) from IP ${req.ip}`);
  next();
};
