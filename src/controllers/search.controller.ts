import { Request, Response, NextFunction } from 'express';
import { Job } from '../models/Job';
import { Applicant } from '../models/Applicant';
import logger from '../utils/logger';

export class SearchController {
  /**
   * Unified search endpoint – context-aware based on user role.
   * Talents search for Jobs.
   * Companies search for their Jobs and assigned Applicants.
   */
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q } = req.query;
      const { userId, role } = (req as unknown as { user: { userId: string, role: string, email: string } }).user;

      if (!q || typeof q !== 'string' || q.trim().length === 0) {
        res.json({ success: true, data: { jobs: [], applicants: [] } });
        return;
      }

      const searchQuery = q.trim();
      const results: { jobs: unknown[]; applicants: unknown[] } = {
        jobs: [],
        applicants: [],
      };

      // ── Search Logic for Talents ─────────────────────────────────────────────
      if (role === 'talent') {
        const jobs = await Job.find({
          status: 'active',
          $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { description: { $regex: searchQuery, $options: 'i' } },
            { 'requirements.skills': { $regex: searchQuery, $options: 'i' } },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(10);
        
        results.jobs = jobs;
      }

      // ── Search Logic for Companies ──────────────────────────────────────────
      if (role === 'company') {
        // Search company's own jobs
        const jobs = await Job.find({
          createdBy: userId,
          $or: [
            { title: { $regex: searchQuery, $options: 'i' } },
            { status: { $regex: searchQuery, $options: 'i' } },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(5);

        // Search applicants across all jobs created by this company
        const myJobs = await Job.find({ createdBy: userId }).select('_id');
        const myJobIds = myJobs.map(j => j._id);

        const applicants = await Applicant.find({
          jobId: { $in: myJobIds },
          $or: [
            { 'profile.name': { $regex: searchQuery, $options: 'i' } },
            { 'profile.email': { $regex: searchQuery, $options: 'i' } },
            { 'profile.skills': { $in: [new RegExp(searchQuery, 'i')] } },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('jobId', 'title status');

        results.jobs = jobs;
        results.applicants = applicants;
      }

      logger.info(`Search executed by ${role} ${userId}: "${searchQuery}" - Found ${results.jobs.length} jobs, ${results.applicants.length} applicants`);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const searchController = new SearchController();
