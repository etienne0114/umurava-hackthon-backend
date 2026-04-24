import { parseCSV, parseExcel, ParsedApplicant } from '../utils/csvParser';
import { parsePDF } from '../utils/pdfParser';
import logger from '../utils/logger';

export type FileType = 'csv' | 'excel' | 'pdf' | 'docx';

export class FileService {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for CSV/Excel
  private readonly MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB for PDF
  private readonly MAX_DOCX_SIZE = 5 * 1024 * 1024; // 5MB for DOCX

  async parseFile(
    buffer: Buffer,
    fileType: FileType,
    fileName: string
  ): Promise<ParsedApplicant[]> {
    try {
      this.validateFileSize(buffer, fileType);

      switch (fileType) {
        case 'csv':
          return await parseCSV(buffer);
        case 'excel':
          return await parseExcel(buffer);
        case 'pdf': {
          const parsed = await parsePDF(buffer);
          return [parsed];
        }
        case 'docx': {
          const { parseDOCX } = await import('../utils/docxParser.js');
          const parsed = await parseDOCX(buffer);
          return [parsed];
        }
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`File parsing error for ${fileName}:`, error);
      throw new Error(`Failed to parse ${fileType.toUpperCase()} file: ${message}`);
    }
  }

  validateFileSize(buffer: Buffer, fileType: FileType): void {
    let maxSize = this.MAX_FILE_SIZE;
    if (fileType === 'pdf') maxSize = this.MAX_PDF_SIZE;
    if (fileType === 'docx') maxSize = this.MAX_DOCX_SIZE;
    
    if (buffer.length > maxSize) {
      throw new Error(
        `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
      );
    }
  }

  validateFileFormat(fileName: string, expectedType: FileType): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const validExtensions: Record<FileType, string[]> = {
      csv: ['csv'],
      excel: ['xlsx', 'xls'],
      pdf: ['pdf'],
      docx: ['docx', 'doc'],
    };

    return validExtensions[expectedType]?.includes(extension || '') || false;
  }

  detectFileType(fileName: string): FileType | null {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (extension === 'csv') return 'csv';
    if (extension === 'xlsx' || extension === 'xls') return 'excel';
    if (extension === 'pdf') return 'pdf';
    if (extension === 'docx' || extension === 'doc') return 'docx';
    
    return null;
  }
}

export const fileService = new FileService();
