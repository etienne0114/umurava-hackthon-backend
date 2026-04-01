import { Request, Response, NextFunction } from 'express';
import { Application } from '../models/Application';
import { ProfileView } from '../models/ProfileView';
import { Job } from '../models/Job';
import { User } from '../models/User';
import { geminiService } from '../services/gemini.service';
import { fileService } from '../services/file.service';
import { parseResumeText } from '../utils/resumeTextParser';
import logger from '../utils/logger';

export class TalentController {
  /**
   * Get real dashboard stats from Application model.
   * Counts submissions, pending, hired, declined from the database.
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      const [submissions, pending, hired, declined] = await Promise.all([
        Application.countDocuments({ userId }),
        Application.countDocuments({ userId, status: 'pending' }),
        Application.countDocuments({ userId, status: 'hired' }),
        Application.countDocuments({ userId, status: 'declined' }),
      ]);

      res.json({
        success: true,
        data: {
          submissions,
          pending,
          hired,
          declined,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get real engagement data from ProfileView model.
   * Aggregates views by day for the last 7 days.
   */
  async getEngagementData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get total views (all time)
      const totalViews = await ProfileView.countDocuments({ talentId: userId });

      // Aggregate views by day for last 7 days
      const dailyViews = await ProfileView.aggregate([
        {
          $match: {
            talentId: userId,
            viewedAt: { $gte: sevenDaysAgo },
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$viewedAt' }
            },
            views: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Build chart data for each of the last 7 days
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const chartData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = dayNames[date.getDay()];
        const found = dailyViews.find((d: any) => d._id === dateStr);
        chartData.push({
          name: dayName,
          views: found ? found.views : 0,
        });
      }

      res.json({
        success: true,
        data: {
          totalViews,
          chartData,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get job recommendations by matching the logged-in talent's skills
   * against active job requirements. Uses real user data from the database.
   */
  async getJobRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { geminiService } = await import('../services/gemini.service');

      // Load user
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // Fetch active jobs (limit to 5 for real-time performance)
      const jobs = await Job.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .limit(5);

      // Map user to a temporary Applicant structure for evaluation
      const tempApplicant: any = {
        _id: userId,
        profile: {
          name: user.profile.name,
          email: user.email,
          skills: user.profile.skills || [],
          experience: [], // In a real app, populate from user profile
          education: [],
          summary: user.profile.bio,
        }
      };

      // Evaluate each job in parallel using Gemini
      const recommendations = await Promise.all(
        jobs.map(async (job) => {
          try {
            const evaluation = await geminiService.evaluateCandidate(job, tempApplicant);
            return {
              ...job.toObject(),
              matchScore: evaluation.matchScore,
              evaluation: {
                strengths: evaluation.strengths,
                gaps: evaluation.gaps,
                recommendation: evaluation.recommendation,
                reasoning: evaluation.reasoning,
              }
            };
          } catch (error) {
            logger.error(`Failed to evaluate job ${job._id} for user ${userId}:`, error);
            return {
              ...job.toObject(),
              matchScore: 0,
              evaluation: null
            };
          }
        })
      );

      // Sort by match score
      recommendations.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply to a job. Creates a real Application document in the database.
   */
  async applyToJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { jobId } = req.params;

      // Verify job exists and is active
      const job = await Job.findById(jobId);
      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      if (job.status !== 'active') {
        res.status(400).json({ success: false, error: 'This job is no longer accepting applications' });
        return;
      }

      // Check for duplicate application
      const existing = await Application.findOne({ userId, jobId });
      if (existing) {
        res.status(409).json({ success: false, error: 'You have already applied to this job' });
        return;
      }

      const application = new Application({
        userId,
        jobId,
        status: 'pending',
        appliedAt: new Date(),
      });

      await application.save();

      logger.info(`Talent ${userId} applied to job ${jobId}`);

      res.status(201).json({
        success: true,
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all applications for the logged-in talent.
   */
  async getApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      const applications = await Application.find({ userId })
        .populate('jobId', 'title company employmentType workMode requirements status createdAt')
        .sort({ appliedAt: -1 });

      res.json({
        success: true,
        data: applications,
      });
    } catch (error) {
      next(error);
    }
  }
  /**
   * Upload and parse a CV/resume, then auto-update the user's profile.
   * Accepts PDF, CSV or plain-text resume. Uses Gemini AI to extract
   * name, position, bio, skills, experience and education.
   */
  async uploadResume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      if (!req.file) {
        res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
        return;
      }

      const buffer = req.file.buffer;
      const fileName = req.file.originalname;
      const fileType = fileService.detectFileType(fileName) || 'pdf';

      // Step 1: Extract raw text from the file
      // For PDFs, parsePDF stores the raw extracted text in .rawText — use that directly.
      // This avoids the garbled "Experience at See resume" placeholder reconstruction.
      let cvText = '';
      try {
        const parsed = await fileService.parseFile(buffer, fileType, fileName);
        if (parsed.length > 0) {
          const p = parsed[0] as any;
          // Prefer raw PDF text — it contains proper section headers Gemini/text-parser can use
          if (p.rawText && p.rawText.trim().length > 50) {
            cvText = p.rawText.slice(0, 8000);
          } else {
            // CSV / Excel: reconstruct from structured fields
            cvText = [
              p.name,
              p.summary,
              p.skills?.length ? 'Skills\n' + p.skills.join('\n') : '',
              p.experience?.length ? 'Experience\n' + p.experience.map((e: any) =>
                `${e.title} at ${e.company}\n${e.duration}\n${e.description || ''}`).join('\n\n') : '',
              p.education?.length ? 'Education\n' + p.education.map((e: any) =>
                `${e.degree}\n${e.institution}\n${e.year}`).join('\n\n') : '',
            ].filter(Boolean).join('\n\n');
          }
        }
      } catch (parseErr: any) {
        // Fallback: read buffer as UTF-8 text
        cvText = buffer.toString('utf-8').slice(0, 8000);
        logger.warn(`File parse fallback for ${fileName}: ${parseErr.message}`);
      }

      if (!cvText || cvText.trim().length < 20) {
        res.status(422).json({ success: false, error: { code: 'EMPTY_CV', message: 'Could not extract text from file. Please upload a readable PDF or text file.' } });
        return;
      }

      // Step 2: Use Gemini AI to extract structured profile data, fall back to text parser
      let extracted;
      let parsedBy = 'gemini';
      try {
        extracted = await geminiService.parseResume(cvText);
      } catch (geminiErr: any) {
        // Fall back to text parser for any Gemini failure: quota, model not found, network, etc.
        logger.warn(`Gemini unavailable for user ${userId} (${geminiErr.message?.slice(0, 80)}) — falling back to text parser`);
        extracted = parseResumeText(cvText);
        parsedBy = 'text-fallback';
      }

      // Step 3: Build the $set update — only overwrite fields that were found
      // Filter arrays to only include entries with all required fields to avoid Mongoose validation errors
      const validExperience = (extracted.experience || []).filter(
        (e: any) => (e.title?.trim() || e.company?.trim()) && e.duration?.trim()
      );
      const validEducation = (extracted.education || []).filter(
        (e: any) => (e.degree?.trim() || e.institution?.trim())
      );

      const setFields: Record<string, any> = {};

      if (extracted.name)     setFields['profile.name']     = extracted.name;
      if (extracted.position) setFields['profile.position'] = extracted.position;
      if (extracted.bio)      setFields['profile.bio']      = extracted.bio.slice(0, 500);
      if (extracted.phone)    setFields['profile.phone']    = extracted.phone;
      if (extracted.skills?.length)    setFields['profile.skills']     = extracted.skills;
      if (extracted.languages?.length) setFields['profile.languages']  = extracted.languages;
      if (validExperience.length)      setFields['profile.experience'] = validExperience;
      if (validEducation.length)       setFields['profile.education']  = validEducation;

      // Calculate new profile completion
      const completion = [
        extracted.name,
        extracted.position,
        extracted.bio,
        extracted.phone,
        extracted.skills?.length > 0 ? 'yes' : '',
        validExperience.length > 0 ? 'yes' : '',
        validEducation.length > 0 ? 'yes' : '',
      ].filter(Boolean).length;
      setFields['profile.profileCompletion'] = Math.round((completion / 7) * 100);

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: setFields },
        { new: true, runValidators: true }
      );

      if (!updatedUser) {
        res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
        return;
      }

      logger.info(`Resume parsed for user ${userId} via ${parsedBy}: ${extracted.skills.length} skills, ${extracted.experience.length} experience entries`);

      res.json({
        success: true,
        data: {
          user: updatedUser,
          extracted,
          parsedBy,
        },
        message: parsedBy === 'gemini'
          ? 'Resume parsed by AI and profile updated successfully'
          : 'Resume parsed and profile updated (AI unavailable — parsed from text)',
      });
    } catch (error: any) {
      logger.error('Resume upload error:', error);
      next(error);
    }
  }
}

export const talentController = new TalentController();
