import multer from 'multer';
import type { Request } from 'express';
import { config } from '../config/environment';
import logger from '../utils/logger';
import { fileTypeFromBuffer } from 'file-type';

const storage = multer.memoryStorage();

/**
 * Magic number signatures for allowed file types
 */
const ALLOWED_FILE_SIGNATURES: Record<string, string[]> = {
  csv: ['text/plain', 'text/csv'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  pdf: ['application/pdf'],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  png: ['image/png'],
};

const MIME_TO_TYPE: Record<string, string> = {
  'text/plain': 'csv',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
};

/**
 * Verifies that the file content matches its extension using magic numbers.
 */
export const validateFileType = async (buffer: Buffer): Promise<{ valid: boolean; type?: string; error?: string }> => {
  try {
    // 1. Check for binary magic numbers (images, PDF, Excel) FIRST
    // Using require for absolute robustness in this Node/TS environment
    const detectedType = await fileTypeFromBuffer(buffer);

    if (detectedType) {
      logger.info(`Detected binary magic number: ${detectedType.mime}`);
      // Validate against allowed binary types
      const allowedMimes = Object.values(ALLOWED_FILE_SIGNATURES).flat();
      if (!allowedMimes.includes(detectedType.mime)) {
        return { 
          valid: false, 
          error: `File type ${detectedType.mime} is not allowed. Only CSV, Excel, PDF, and image files (JPEG, PNG) are accepted.` 
        };
      }
      return { valid: true, type: MIME_TO_TYPE[detectedType.mime] || detectedType.mime };
    }

    // 2. ONLY if no binary magic numbers are found, check for plain-text CSV
    const text = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
    
    // Check if it's reasonably looking like text (mostly printable characters)
    const isPrintable = /^[\x20-\x7E\r\n\t]*$/.test(text);
    
    if (isPrintable && text.includes(',') && (text.includes('\n') || text.includes('\r'))) {
      logger.info('Detected plain-text CSV format');
      return { valid: true, type: 'csv' };
    }

    logger.warn('File type detection failed after binary and text checks');
    return { 
      valid: false, 
      error: 'Unable to reliably determine file type. Please upload a standard CSV or image file.' 
    };
  } catch (error) {
    logger.error('File type validation error:', error);
    return { valid: false, error: 'File validation failed' };
  }
};

/**
 * Multer configuration with basic MIME type filtering
 * Note: This is the first line of defense, but magic number checking is done after upload
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
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, PDF, and image files (JPEG, PNG) are allowed.'));
    }
  },
});

/**
 * Middleware to validate uploaded file using magic numbers
 * Must be used after multer upload middleware
 */
export const validateUploadedFile = async (
  req: Request,
  res: any,
  next: any
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

  // Validate file type using magic numbers
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

  // Add validated file type to request for downstream use
  (req as any).validatedFileType = validation.type;
  
  logger.info(`File upload validated: ${validation.type} (${req.file.size} bytes) from IP ${req.ip}`);
  next();
};
