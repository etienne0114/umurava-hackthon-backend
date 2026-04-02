import { Request, Response, NextFunction } from 'express';
import { Job } from '../models/Job';
import { Applicant } from '../models/Applicant';
import logger from '../utils/logger';

export class CompanyController {
  /**
   * Get real-time dashboard statistics for the authenticated company.
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      // 1. Get all jobs for this company
      const jobs = await Job.find({ createdBy: userId }).sort({ createdAt: -1 });

      // 2. Count jobs by status
      const totalJobs = jobs.length;
      const activeJobs = jobs.filter(j => j.status === 'active').length;
      const draftJobs = jobs.filter(j => j.status === 'draft').length;
      const closedJobs = jobs.filter(j => j.status === 'closed').length;

      // 3. Get total applicants across all company jobs
      const jobIds = jobs.map(j => j._id);
      const totalApplicants = await Applicant.countDocuments({ jobId: { $in: jobIds } });

      // 4. Counts for screenings
      const completedScreenings = jobs.filter(j => j.screeningStatus === 'completed').length;
      const inProgressScreenings = jobs.filter(j => j.screeningStatus === 'in_progress').length;

      // 5. Preparation for Chart Data (Last 8 jobs)
      // We perform a real count for each to ensure accuracy
      const last8Jobs = jobs.slice(0, 8);
      const jobsChartData = await Promise.all(
        last8Jobs.map(async (job) => {
          const count = await Applicant.countDocuments({ jobId: job._id });
          return {
            name: job.title.length > 16 ? job.title.slice(0, 16) + '...' : job.title,
            applicants: count,
            status: job.status,
          };
        })
      );

      // 6. Recent Jobs (Last 6)
      // Update applicantCount field in the returned objects
      const recentJobs = await Promise.all(
        jobs.slice(0, 6).map(async (job) => {
          const count = await Applicant.countDocuments({ jobId: job._id });
          const jobObj = job.toObject();
          jobObj.applicantCount = count;
          return jobObj;
        })
      );

      res.json({
        success: true,
        data: {
          totalJobs,
          activeJobs,
          draftJobs,
          closedJobs,
          totalApplicants,
          completedScreenings,
          inProgressScreenings,
          recentJobs,
          jobsChartData,
        }
      });
    } catch (error) {
      logger.error('Error fetching company dashboard stats:', error);
      next(error);
    }
  }
}

export const companyController = new CompanyController();
