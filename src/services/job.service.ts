import { Job, IJob } from '../models/Job';
import { Applicant } from '../models/Applicant';
import { IUser } from '../models/User';
import { JobRequirements, WeightConfig, JobStatus } from '../types';
import logger from '../utils/logger';

export interface CreateJobDTO {
  title: string;
  description: string;
  requirements: JobRequirements;
  weights?: WeightConfig;
  status?: JobStatus;
  createdBy?: string;
}

export interface JobFilters {
  status?: JobStatus;
  limit?: number;
  offset?: number;
  createdBy?: string;
}

export class JobService {
  async createJob(jobData: CreateJobDTO): Promise<IJob> {
    try {
      const weights = jobData.weights || {
        skills: 0.4,
        experience: 0.3,
        education: 0.2,
        relevance: 0.1,
      };

      const job = new Job({
        ...jobData,
        weights,
        applicantCount: 0,
      });

      await job.save();
      logger.info(`Job created: ${job._id}`);
      return job;
    } catch (error: unknown) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  async getJobById(jobId: string): Promise<IJob | null> {
    try {
      const job = await Job.findById(jobId).populate('createdBy', 'profile.company');
      if (job) {
        // Fetch real applicant count from Applicant model
        job.applicantCount = await Applicant.countDocuments({ jobId: job._id });
        
        const creator = job.createdBy as unknown as IUser;
        if (!job.company && creator?.profile?.company) {
          job.company = creator.profile.company;
        }
      }
      return job;
    } catch (error: unknown) {
      logger.error(`Error fetching job ${jobId}:`, error);
      throw error;
    }
  }

  async getAllJobs(filters: JobFilters = {}): Promise<{ jobs: IJob[]; total: number }> {
    try {
      const query: Record<string, unknown> = {};
      if (filters.status) query.status = filters.status;
      if (filters.createdBy) query.createdBy = filters.createdBy;

      const limit = filters.limit || 20;
      const offset = filters.offset || 0;

      const [jobs, total] = await Promise.all([
        Job.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(offset)
          .populate('createdBy', 'profile.company'),
        Job.countDocuments(query),
      ]);

      // Ensure each job has a real company name and real applicant count
      await Promise.all(
        jobs.map(async (job) => {
          // Real-time applicant counting
          job.applicantCount = await Applicant.countDocuments({ jobId: job._id });

          const creator = job.createdBy as unknown as IUser;
          if (!job.company && creator?.profile?.company) {
            job.company = creator.profile.company;
          }
        })
      );

      return { jobs, total };
    } catch (error: unknown) {
      logger.error('Error fetching jobs:', error);
      throw error;
    }
  }

  async updateJob(jobId: string, updates: Partial<IJob>): Promise<IJob> {
    try {
      const job = await Job.findByIdAndUpdate(jobId, updates, {
        new: true,
        runValidators: true,
      });

      if (!job) {
        throw new Error('Job not found');
      }

      logger.info(`Job updated: ${jobId}`);
      return job;
    } catch (error: unknown) {
      logger.error(`Error updating job ${jobId}:`, error);
      throw error;
    }
  }

  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const result = await Job.findByIdAndDelete(jobId);
      
      if (!result) {
        throw new Error('Job not found');
      }

      logger.info(`Job deleted: ${jobId}`);
      return true;
    } catch (error: unknown) {
      logger.error(`Error deleting job ${jobId}:`, error);
      throw error;
    }
  }
}

export const jobService = new JobService();
