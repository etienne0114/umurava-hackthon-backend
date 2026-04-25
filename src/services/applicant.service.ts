import mongoose from 'mongoose';
import { Applicant, IApplicant } from '../models/Applicant';
import { Job } from '../models/Job';
import { Application } from '../models/Application';
import { User } from '../models/User';
import { Assessment } from '../models/Assessment';
import { ScreeningResult } from '../models/ScreeningResult';
import { ScreeningSession } from '../models/ScreeningSession';
import { fileService, FileType } from './file.service';
import { umuravaService } from './umurava.service';
import logger from '../utils/logger';
import { NotificationController } from '../controllers/notification.controller';
import { resolveTalentUserIdForApplicant } from '../utils/talentLink';

function rawJobIdFilter(jobId: string): object {
  if (mongoose.Types.ObjectId.isValid(jobId)) {
    const oid = new mongoose.Types.ObjectId(jobId);
    // Use $or to match whether jobId is stored as ObjectId or plain string
    // Note: uses raw filter so Mongoose casting doesn't collapse both branches to ObjectId
    return { $or: [{ jobId: oid }, { jobId: jobId }] };
  }
  return { jobId };
}

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
              skills: (profile.skills || [])
                .filter(Boolean)
                .map((skill) => ({
                  name: skill,
                  level: 'Intermediate' as const,
                })),
              languages: (profile.languages || [])
                .filter(Boolean)
                .map((language) => ({
                  name: language,
                  proficiency: 'Conversational' as const,
                })),
              experience: profile.experience,
              education: profile.education,
              bio: profile.portfolio,
            },
          });

          await applicant.save();
          applicants.push(applicant);
        } catch (error: unknown) {
          const err = error as { code?: number };
          if (err.code === 11000) {
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
    } catch (error: unknown) {
      logger.error('Error importing from Umurava:', error);
      throw error;
    }
  }

  async uploadFromFile(
    jobId: string,
    buffer: Buffer,
    fileType: FileType,
    fileName: string
  ): Promise<{ applicants: IApplicant[]; stats: { parsed: number; created: number; duplicates: number } }> {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const parsedApplicants = await fileService.parseFile(buffer, fileType, fileName);
      const applicants: IApplicant[] = [];
      let duplicates = 0;

      for (const parsed of parsedApplicants) {
        try {
          const applicant = new Applicant({
            jobId,
            source: 'upload',
            profile: {
              name: parsed.name,
              firstName: parsed.firstName || parsed.name.split(' ')[0] || 'Unknown',
              lastName: parsed.lastName || parsed.name.split(' ').slice(1).join(' ') || 'Unknown',
              headline: parsed.headline || 'Professional',
              location: parsed.location || 'Not specified',
              email: parsed.email,
              phone: parsed.phone,
              skills: (parsed.skills || [])
                .filter(Boolean)
                .map((skill) => ({
                  name: skill,
                  level: 'Intermediate' as const,
                })),
              experience: parsed.experience,
              education: parsed.education,
              bio: parsed.summary,
            },
            metadata: {
              fileName,
              uploadedAt: new Date(),
            },
          });

          await applicant.save();
          applicants.push(applicant);
        } catch (error: unknown) {
          const err = error as { code?: number };
          if (err.code === 11000) {
            logger.warn(`Duplicate applicant skipped: ${parsed.email}`);
            duplicates += 1;
          } else {
            throw error;
          }
        }
      }

      await Job.findByIdAndUpdate(jobId, {
        $inc: { applicantCount: applicants.length },
      });

      logger.info(`Uploaded ${applicants.length} applicants from file for job ${jobId}`);
      return {
        applicants,
        stats: {
          parsed: parsedApplicants.length,
          created: applicants.length,
          duplicates,
        },
      };
    } catch (error: unknown) {
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
      // Use the raw MongoDB collection to bypass Mongoose casting,
      // so $or correctly queries BOTH ObjectId and string representations.
      const collection = Applicant.collection;
      const filter = rawJobIdFilter(jobId);

      const [rawDocs, total] = await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      // Re-hydrate plain docs as Mongoose documents
      const applicants = rawDocs.map((doc) =>
        Applicant.hydrate(doc as Record<string, unknown>)
      ) as unknown as IApplicant[];

      logger.info(`getApplicantsByJob: jobId=${jobId}, found=${total}`);
      return { applicants, total };
    } catch (error: unknown) {
      logger.error(`Error fetching applicants for job ${jobId}:`, error);
      throw error;
    }
  }

  async getApplicantById(applicantId: string): Promise<IApplicant | null> {
    try {
      return await Applicant.findById(applicantId);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      logger.error(`Error deleting applicant ${applicantId}:`, error);
      throw error;
    }
  }

  async deleteApplicantsByJob(jobId: string): Promise<number> {
    try {
      const filter = rawJobIdFilter(jobId);

      // Collect applicant IDs for cascading cleanup
      const applicantIds = await Applicant.find(filter).distinct('_id');

      if (applicantIds.length === 0) return 0;

      // Cascade: remove assessments and screening data tied to these applicants
      await Promise.all([
        Assessment.deleteMany({ applicantId: { $in: applicantIds } }),
        ScreeningResult.deleteMany({ jobId }),
        ScreeningSession.deleteMany({ jobId }),
      ]);

      const { deletedCount } = await Applicant.deleteMany(filter);

      // Reset applicantCount on the job
      await Job.findByIdAndUpdate(jobId, { applicantCount: 0, screeningStatus: 'not_started' });

      logger.info(`Bulk deleted ${deletedCount} applicants for job ${jobId}`);
      return deletedCount ?? 0;
    } catch (error: unknown) {
      logger.error(`Error bulk-deleting applicants for job ${jobId}:`, error);
      throw error;
    }
  }

  async updateStatus(applicantId: string, status: string): Promise<IApplicant | null> {
    try {
      const applicant = await Applicant.findByIdAndUpdate(
        applicantId,
        { status },
        { new: true, runValidators: true }
      );

      if (!applicant) {
        throw new Error('Applicant not found');
      }

      // Sync status with Application if it's from Umurava
      if (applicant.source === 'umurava' && applicant.sourceId) {
        try {
          await Application.findOneAndUpdate(
            { userId: applicant.sourceId, jobId: applicant.jobId },
            { status }
          );
          logger.info(`Synchronized status ${status} for Application ${applicant.sourceId}`);
        } catch (syncError) {
          logger.warn(`Failed to sync status for Umurava application: ${syncError}`);
          // We don't throw here to ensure the main applicant update succeeds
        }
      }

      if (status === 'hired') {
        const talentUserId = await resolveTalentUserIdForApplicant(applicant);
        if (talentUserId) {
          const job = await Job.findById(applicant.jobId).select('title');
          const jobTitle = job?.title || 'the role';
          await NotificationController.create(
            talentUserId,
            'success',
            'You Have Been Hired',
            `Congratulations! You have been hired for ${jobTitle}.`,
            '/talent/applications'
          );
        } else {
          const candidateEmail = applicant.profile?.email;
          if (candidateEmail) {
            const user = await User.findOne({ email: candidateEmail.toLowerCase() }).select('_id');
            if (user) {
              const job = await Job.findById(applicant.jobId).select('title');
              const jobTitle = job?.title || 'the role';
              await NotificationController.create(
                user._id.toString(),
                'success',
                'You Have Been Hired',
                `Congratulations! You have been hired for ${jobTitle}.`,
                '/talent/applications'
              );
            }
          }
        }
      }

      logger.info(`Applicant ${applicantId} status updated to ${status}`);
      return applicant;
    } catch (error: unknown) {
      logger.error(`Error updating status for applicant ${applicantId}:`, error);
      throw error;
    }
  }
}

export const applicantService = new ApplicantService();
