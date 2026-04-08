import { Request, Response } from 'express';
import { Assessment } from '../models/Assessment';
import { Applicant } from '../models/Applicant';
import { Job } from '../models/Job';
import { User } from '../models/User';
import { geminiService } from '../services/gemini.service';
import logger from '../utils/logger';
import { NotificationController } from './notification.controller';
import { getTalentApplicantMatches, resolveTalentUserIdForApplicant } from '../utils/talentLink';

export class AssessmentController {
  private sanitizeAssessmentForTalent(assessment: any) {
    const obj = typeof assessment.toObject === 'function' ? assessment.toObject() : assessment;
    return {
      ...obj,
      questions: Array.isArray(obj.questions)
        ? obj.questions.map((q: any) => ({ question: q.question }))
        : [],
    };
  }


  /**
   * Generate technical questions for an applicant based on job requirements
   */
  async generateAssessment(req: Request, res: Response) {
    try {
      const { applicantId, jobId } = req.body;

      if (!applicantId || !jobId) {
        return res.status(400).json({ success: false, message: 'Applicant ID and Job ID are required' });
      }

      const [applicant, job] = await Promise.all([
        Applicant.findById(applicantId),
        Job.findById(jobId),
      ]);

      if (!applicant || !job) {
        return res.status(404).json({ success: false, message: 'Applicant or Job not found' });
      }

      // Always generate fresh questions — delete previous assessment if exists
      await Assessment.findOneAndDelete({ applicantId, jobId });

      logger.info(`Generating AI assessment for applicant ${applicantId} [Job: ${jobId}]`);
      const questions = await geminiService.generateTechnicalTest(job, applicant);
      const talentUserId = await resolveTalentUserIdForApplicant(applicant);

      const assessment = await Assessment.create({
        jobId,
        applicantId,
        talentUserId,
        questions,
        status: 'pending',
      });

      return res.status(201).json({
        success: true,
        data: assessment,
        message: 'New AI assessment generated successfully',
      });
    } catch (error: any) {
      logger.error('Error in generateAssessment:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get assessment by applicant ID
   */
  async getAssessmentByApplicant(req: Request, res: Response) {
    try {
      const { applicantId } = req.params;
      // Prefer the most recent completed assessment (so recruiters see submitted answers + scores)
      let assessment = await Assessment.findOne({ applicantId, status: 'completed' })
        .sort({ submittedAt: -1, createdAt: -1 });

      if (!assessment) {
        assessment = await Assessment.findOne({ applicantId }).sort({ createdAt: -1 });
      }

      if (!assessment) {
        return res.status(404).json({ success: false, message: 'Assessment not found' });
      }

      return res.status(200).json({ success: true, data: assessment });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get latest submitted assessment for a job (company view).
   */
  async getLatestSubmittedForJob(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        return res.status(400).json({ success: false, message: 'Job ID is required' });
      }

      const assessment = await Assessment.findOne({ jobId, status: 'completed' })
        .sort({ submittedAt: -1, createdAt: -1 })
        .populate('applicantId', 'profile.name');

      return res.status(200).json({
        success: true,
        data: assessment || null,
      });
    } catch (error: any) {
      logger.error('Error in getLatestSubmittedForJob:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Confirm that the test has been sent (updates applicant status)
   */
  async confirmSent(req: Request, res: Response) {
    try {
      const { applicantId } = req.params;
      const { questions, jobId } = req.body;
      const existingApplicant = await Applicant.findById(applicantId);
      const resolvedTalentUserId = existingApplicant
        ? await resolveTalentUserIdForApplicant(existingApplicant)
        : undefined;

      // If recruiter edited questions, save them now
      if (questions && Array.isArray(questions) && jobId) {
        const questionUpdate: any = { $set: { questions } };
        if (resolvedTalentUserId) {
          questionUpdate.$set.talentUserId = resolvedTalentUserId;
        }
        await Assessment.findOneAndUpdate(
          { applicantId, jobId },
          questionUpdate,
          { upsert: true }
        );
        logger.info(`Recruiter customized assessment for applicant ${applicantId}`);
      }

      const applicant = await Applicant.findByIdAndUpdate(
        applicantId,
        { assessmentStatus: 'sent' },
        { new: true }
      );

      if (!applicant) {
        return res.status(404).json({ success: false, message: 'Applicant not found' });
      }

      // Backfill talentUserId on assessments missing it (null matches both null and missing fields)
      if (resolvedTalentUserId) {
        await Assessment.updateMany(
          { applicantId, talentUserId: null },
          { $set: { talentUserId: resolvedTalentUserId } }
        );
      }

      if (resolvedTalentUserId) {
        const job = jobId ? await Job.findById(jobId).select('title') : null;
        const jobTitle = job?.title || 'a position';
        await NotificationController.create(
          resolvedTalentUserId,
          'info',
          'Quick Test Assigned',
          `You have received a quick test for ${jobTitle}. Please complete it as soon as possible.`,
          '/talent/tests'
        );
      }

      return res.status(200).json({
        success: true, 
        message: 'Assessment marked as sent',
        data: { assessmentStatus: applicant.assessmentStatus }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Bulk generate assessments for a list of applicants
   */
  async bulkGenerateAssessments(req: Request, res: Response) {
    try {
      const { jobId, applicantIds } = req.body;

      if (!jobId || !applicantIds || !Array.isArray(applicantIds)) {
        return res.status(400).json({ success: false, message: 'Job ID and applicant IDs array are required' });
      }

      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ success: false, message: 'Job not found' });
      }

      logger.info(`Starting bulk AI assessment generation for ${applicantIds.length} applicants [Job: ${jobId}]`);
      
      const results = [];
      let successCount = 0;
      let errorCount = 0;

      // Use sequential processing (with small delay if needed) to avoid Gemini rate limits
      for (const applicantId of applicantIds) {
        try {
          const applicant = await Applicant.findById(applicantId);
          if (!applicant) {
            results.push({ applicantId, status: 'failed', message: 'Applicant not found' });
            errorCount++;
            continue;
          }

          // Check if assessment already exists
          let assessment = await Assessment.findOne({ applicantId, jobId });
          
          if (!assessment) {
            // Generate new assessment using Gemini
            const questions = await geminiService.generateTechnicalTest(job, applicant);
            const resolvedTalentUserId = await resolveTalentUserIdForApplicant(applicant);
            assessment = await Assessment.create({
              jobId,
              applicantId,
              talentUserId: resolvedTalentUserId,
              questions,
              status: 'pending',
            });
          } else if (!assessment.talentUserId) {
            const resolvedTalentUserId = await resolveTalentUserIdForApplicant(applicant);
            if (resolvedTalentUserId) {
              assessment.talentUserId = resolvedTalentUserId as any;
              await assessment.save();
            }
          }

          // Mark as sent for high-fidelity bulk action
          await Applicant.findByIdAndUpdate(applicantId, { assessmentStatus: 'sent' });

          if (assessment?.talentUserId) {
            await NotificationController.create(
              assessment.talentUserId.toString(),
              'info',
              'Quick Test Assigned',
              `You have received a quick test for ${job.title}. Please complete it as soon as possible.`,
              '/talent/tests'
            );
          }

          results.push({ applicantId, status: 'success' });
          successCount++;
        } catch (err: any) {
          logger.error(`Failed to generate assessment for ${applicantId}:`, err);
          results.push({ applicantId, status: 'failed', message: err.message });
          errorCount++;
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          total: applicantIds.length,
          successCount,
          errorCount,
          results
        },
        message: `Processed ${applicantIds.length} assessments (${successCount} successful, ${errorCount} failed)`,
      });
    } catch (error: any) {
      logger.error('Error in bulkGenerateAssessments:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get all assessments assigned to the authenticated talent.
   * Matches by: talentUserId, known applicant IDs, or applicant email matching the talent's email.
   */
  async getMyAssessments(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { applicantIds, emailApplicantIds } = await getTalentApplicantMatches(userId);
      const allApplicantIds = [...new Set([...applicantIds, ...emailApplicantIds])];

      const orConditions: any[] = [{ talentUserId: userId }];
      if (allApplicantIds.length > 0) {
        orConditions.push({ applicantId: { $in: allApplicantIds } });
      }

      const assessments = await Assessment.find({ $or: orConditions })
        .populate('jobId', 'title company status')
        .populate('applicantId', 'assessmentStatus')
        .sort({ createdAt: -1 });

      logger.info(
        `Talent assessments lookup for user ${userId}: applicantMatches=${applicantIds.length}, emailMatches=${emailApplicantIds.length}, assessments=${assessments.length}`
      );

      // Backfill talentUserId for any matched assessments missing it
      const missingLink = assessments.filter((a) => !a.talentUserId);
      if (missingLink.length > 0) {
        await Assessment.updateMany(
          { _id: { $in: missingLink.map((a) => a._id) } },
          { $set: { talentUserId: userId } }
        );
      }

      const uniqueMap = new Map<string, any>();
      for (const assessment of assessments) {
        uniqueMap.set(assessment._id.toString(), assessment);
      }

      return res.status(200).json({
        success: true,
        data: Array.from(uniqueMap.values()).map((assessment) => this.sanitizeAssessmentForTalent(assessment)),
      });
    } catch (error: any) {
      logger.error('Error in getMyAssessments:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Submit answers for a talent's assigned assessment.
   */
  async submitMyAssessment(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      const { assessmentId } = req.params;
      const { answers } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ success: false, message: 'Answers array is required' });
      }

      const assessment = await Assessment.findById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ success: false, message: 'Assessment not found' });
      }

      if (assessment.status === 'completed') {
        return res.status(400).json({ success: false, message: 'Assessment already submitted' });
      }

      const applicant = await Applicant.findById(assessment.applicantId);
      if (!applicant) {
        return res.status(404).json({ success: false, message: 'Applicant not found' });
      }

      const user = await User.findById(userId).select('email');
      const ownsByAssessmentUser = assessment.talentUserId?.toString() === userId;
      const ownsByApplicant =
        String(applicant.sourceId || '') === userId ||
        (!!user?.email && applicant.profile.email?.toLowerCase() === user.email.toLowerCase());

      if (!ownsByAssessmentUser && !ownsByApplicant) {
        return res.status(403).json({ success: false, message: 'You are not allowed to submit this assessment' });
      }

      const cleanedAnswers = answers
        .map((item: any) => ({
          question: String(item?.question || '').trim(),
          answer: String(item?.answer || '').trim(),
        }))
        .filter((item: any) => item.question && item.answer);

      if (cleanedAnswers.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one non-empty answer is required' });
      }

      assessment.candidateAnswers = cleanedAnswers;
      assessment.status = 'completed';
      assessment.submittedAt = new Date();
      if (!assessment.talentUserId) {
        assessment.talentUserId = userId as any;
      }

      const job = await Job.findById(assessment.jobId);
      let grading: any = null;
      try {
        if (job) {
          grading = await geminiService.gradeTechnicalTest(
            job,
            applicant,
            assessment.questions,
            cleanedAnswers
          );
        }
      } catch (gradingError: any) {
        logger.warn(`AI grading failed for assessment ${assessment._id}: ${gradingError.message}`);
      }

      if (grading) {
        (assessment as any).grading = {
          totalScore: grading.totalScore,
          perQuestion: grading.perQuestion,
          overallFeedback: grading.overallFeedback,
          provider: grading.provider,
          model: grading.model,
          gradedAt: new Date(),
        };
      }

      await assessment.save();

      await Applicant.findByIdAndUpdate(applicant._id, { assessmentStatus: 'completed' });

      if (job?.createdBy) {
        const scoreText = grading?.totalScore != null ? `Score: ${grading.totalScore}/100.` : 'Score pending.';
        await NotificationController.create(
          job.createdBy.toString(),
          'success',
          'Quick Test Submitted',
          `${applicant.profile.name} submitted the quick test for ${job.title}. ${scoreText}`,
          `/company/screening?jobId=${job._id}&applicantId=${applicant._id}`
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Assessment submitted successfully',
        data: this.sanitizeAssessmentForTalent(assessment),
      });
    } catch (error: any) {
      logger.error('Error in submitMyAssessment:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

export const assessmentController = new AssessmentController();
