import multer from 'multer';
import { Request } from 'express';
import fileType from 'file-type';
import { config } from '../config/environment';
import logger from '../utils/logger';

const storage = multer.memoryStorage();

/**
 * Magic number signatures for allowed file types
 */
const ALLOWED_FILE_SIGNATURES: Record<string, string[]> = {
  csv: ['text/plain', 'text/csv'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  pdf: ['application/pdf'],
};

/**
 * Validate file type using magic numbers (file signature)
 * This is more secure than relying on MIME type or file extension
 */
export const validateFileType = async (buffer: Buffer): Promise<{ valid: boolean; type?: string; error?: string }> => {
  try {
    // Check for CSV (plain text files don't have magic numbers)
    const text = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
    if (text.includes(',') && (text.includes('\n') || text.includes('\r'))) {
      // Basic CSV validation - contains commas and line breaks
      return { valid: true, type: 'csv' };
    }

    // Check magic numbers for binary files
    const detectedType = await fileType.fromBuffer(buffer);
    
    if (!detectedType) {
      return { valid: false, error: 'Unable to determine file type' };
    }

    // Validate against allowed types
    const allowedMimes = Object.values(ALLOWED_FILE_SIGNATURES).flat();
    if (!allowedMimes.includes(detectedType.mime)) {
      return { 
        valid: false, 
        error: `File type ${detectedType.mime} is not allowed. Only CSV, Excel, and PDF files are accepted.` 
      };
    }

    // Additional validation for specific types
    if (detectedType.mime === 'application/pdf') {
      // PDF files should start with %PDF
      const header = buffer.toString('utf8', 0, 4);
      if (!header.startsWith('%PDF')) {
        return { valid: false, error: 'Invalid PDF file structure' };
      }
    }

    if (detectedType.mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      // XLSX files are ZIP archives with specific structure
      const header = buffer.toString('hex', 0, 4);
      if (header !== '504b0304') { // PK.. (ZIP signature)
        return { valid: false, error: 'Invalid Excel file structure' };
      }
    }

    return { valid: true, type: detectedType.ext };
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
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and PDF files are allowed.'));
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
