import { Applicant, IApplicant } from '../models/Applicant';
import { Job } from '../models/Job';
import { fileService, FileType } from './file.service';
import { umuravaService } from './umurava.service';
import logger from '../utils/logger';

export class ApplicantService {
  async importFromUmurava(jobId: string, profileIds: string[]): Promise<IApplicant[]> {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const profiles = await umuravaService.fetchTalentProfiles(profileIds);
      const applicants: IApplicant[] = [];

      for (const profile of profiles) {
        try {
          const applicant = new Applicant({
            jobId,
            source: 'umurava',
            sourceId: profile.id,
            profile: {
              name: profile.name,
              email: profile.email,
              skills: profile.skills,
              experience: profile.experience,
              education: profile.education,
              summary: profile.portfolio,
            },
          });

          await applicant.save();
          applicants.push(applicant);
        } catch (error: any) {
          if (error.code === 11000) {
            logger.warn(`Duplicate applicant skipped: ${profile.email}`);
          } else {
            throw error;
          }
        }
      }

      await Job.findByIdAndUpdate(jobId, {
        $inc: { applicantCount: applicants.length },
      });

      logger.info(`Imported ${applicants.length} applicants from Umurava for job ${jobId}`);
      return applicants;
    } catch (error: any) {
      logger.error('Error importing from Umurava:', error);
      throw error;
    }
  }

  async uploadFromFile(
    jobId: string,
    buffer: Buffer,
    fileType: FileType,
    fileName: string
  ): Promise<IApplicant[]> {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const parsedApplicants = await fileService.parseFile(buffer, fileType, fileName);
      const applicants: IApplicant[] = [];

      for (const parsed of parsedApplicants) {
        try {
          const applicant = new Applicant({
            jobId,
            source: 'upload',
            profile: {
              name: parsed.name,
              email: parsed.email,
              phone: parsed.phone,
              skills: parsed.skills,
              experience: parsed.experience,
              education: parsed.education,
              summary: parsed.summary,
            },
            metadata: {
              fileName,
              uploadedAt: new Date(),
            },
          });

          await applicant.save();
          applicants.push(applicant);
        } catch (error: any) {
          if (error.code === 11000) {
            logger.warn(`Duplicate applicant skipped: ${parsed.email}`);
          } else {
            throw error;
          }
        }
      }

      await Job.findByIdAndUpdate(jobId, {
        $inc: { applicantCount: applicants.length },
      });

      logger.info(`Uploaded ${applicants.length} applicants from file for job ${jobId}`);
      return applicants;
    } catch (error: any) {
      logger.error('Error uploading applicants from file:', error);
      throw error;
    }
  }

  async getApplicantsByJob(
    jobId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ applicants: IApplicant[]; total: number }> {
    try {
      const [applicants, total] = await Promise.all([
        Applicant.find({ jobId }).limit(limit).skip(offset).sort({ createdAt: -1 }),
        Applicant.countDocuments({ jobId }),
      ]);

      return { applicants, total };
    } catch (error: any) {
      logger.error(`Error fetching applicants for job ${jobId}:`, error);
      throw error;
    }
  }

  async getApplicantById(applicantId: string): Promise<IApplicant | null> {
    try {
      return await Applicant.findById(applicantId);
    } catch (error: any) {
      logger.error(`Error fetching applicant ${applicantId}:`, error);
      throw error;
    }
  }

  async updateApplicant(applicantId: string, updates: Partial<IApplicant>): Promise<IApplicant> {
    try {
      const applicant = await Applicant.findByIdAndUpdate(applicantId, updates, {
        new: true,
        runValidators: true,
      });

      if (!applicant) {
        throw new Error('Applicant not found');
      }

      logger.info(`Applicant updated: ${applicantId}`);
      return applicant;
    } catch (error: any) {
      logger.error(`Error updating applicant ${applicantId}:`, error);
      throw error;
    }
  }

  async deleteApplicant(applicantId: string): Promise<boolean> {
    try {
      const applicant = await Applicant.findById(applicantId);
      if (!applicant) {
        throw new Error('Applicant not found');
      }

      await Applicant.findByIdAndDelete(applicantId);
      
      await Job.findByIdAndUpdate(applicant.jobId, {
        $inc: { applicantCount: -1 },
      });

      logger.info(`Applicant deleted: ${applicantId}`);
      return true;
    } catch (error: any) {
      logger.error(`Error deleting applicant ${applicantId}:`, error);
      throw error;
    }
  }
}

export const applicantService = new ApplicantService();
