import { Job, IJob } from '../models/Job';
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
    } catch (error: any) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  async getJobById(jobId: string): Promise<IJob | null> {
    try {
      return await Job.findById(jobId);
    } catch (error: any) {
      logger.error(`Error fetching job ${jobId}:`, error);
      throw error;
    }
  }

  async getAllJobs(filters: JobFilters = {}): Promise<{ jobs: IJob[]; total: number }> {
    try {
      const query: any = {};
      if (filters.status) query.status = filters.status;
      if (filters.createdBy) query.createdBy = filters.createdBy;

      const limit = filters.limit || 20;
      const offset = filters.offset || 0;

      const [jobs, total] = await Promise.all([
        Job.find(query).sort({ createdAt: -1 }).limit(limit).skip(offset),
        Job.countDocuments(query),
      ]);

      return { jobs, total };
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      logger.error(`Error deleting job ${jobId}:`, error);
      throw error;
    }
  }
}

export const jobService = new JobService();
