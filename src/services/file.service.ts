import { parseCSV, parseExcel, ParsedApplicant } from '../utils/csvParser';
import { parsePDF } from '../utils/pdfParser';
import logger from '../utils/logger';

export type FileType = 'csv' | 'excel' | 'pdf';

export class FileService {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for CSV/Excel
  private readonly MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB for PDF

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
        case 'pdf':
          const parsed = await parsePDF(buffer);
          return [parsed];
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error: any) {
      logger.error(`File parsing error for ${fileName}:`, error);
      throw new Error(`Failed to parse ${fileType.toUpperCase()} file: ${error.message}`);
    }
  }

  validateFileSize(buffer: Buffer, fileType: FileType): void {
    const maxSize = fileType === 'pdf' ? this.MAX_PDF_SIZE : this.MAX_FILE_SIZE;
    
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
    };

    return validExtensions[expectedType]?.includes(extension || '') || false;
  }

  detectFileType(fileName: string): FileType | null {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (extension === 'csv') return 'csv';
    if (extension === 'xlsx' || extension === 'xls') return 'excel';
    if (extension === 'pdf') return 'pdf';
    
    return null;
  }
}

export const fileService = new FileService();
