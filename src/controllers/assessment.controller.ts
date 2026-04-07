import { Request, Response } from 'express';
import { Assessment } from '../models/Assessment';
import { Applicant } from '../models/Applicant';
import { Job } from '../models/Job';
import { User } from '../models/User';
import { geminiService } from '../services/gemini.service';
import logger from '../utils/logger';

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

  private async getTalentApplicantIds(userId: string): Promise<string[]> {
    const user = await User.findById(userId).select('email');

    const query: any = {
      $or: [{ sourceId: userId }],
    };

    if (user?.email) {
      query.$or.push({ 'profile.email': user.email.toLowerCase() });
    }

    const applicants = await Applicant.find(query).select('_id');
    return applicants.map((a) => a._id.toString());
  }

  private async resolveTalentUserIdForApplicant(applicant: any): Promise<string | undefined> {
    // 1) Prefer sourceId when it is a valid local User ObjectId
    if (applicant?.sourceId) {
      const sourceId = String(applicant.sourceId);
      const localUser = await User.findById(sourceId).select('_id');
      if (localUser) {
        return localUser._id.toString();
      }
    }

    // 2) Fallback to matching by applicant email
    const email = applicant?.profile?.email?.toLowerCase?.();
    if (email) {
      const emailUser = await User.findOne({ email }).select('_id');
      if (emailUser) {
        return emailUser._id.toString();
      }
    }

    return undefined;
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
      const talentUserId = await this.resolveTalentUserIdForApplicant(applicant);

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
      const assessment = await Assessment.findOne({ applicantId }).sort({ createdAt: -1 });

      if (!assessment) {
        return res.status(404).json({ success: false, message: 'Assessment not found' });
      }

      return res.status(200).json({ success: true, data: assessment });
    } catch (error: any) {
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
        ? await this.resolveTalentUserIdForApplicant(existingApplicant)
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
            assessment = await Assessment.create({
              jobId,
              applicantId,
              talentUserId: await this.resolveTalentUserIdForApplicant(applicant),
              questions,
              status: 'pending',
            });
          } else if (!assessment.talentUserId) {
            const resolvedTalentUserId = await this.resolveTalentUserIdForApplicant(applicant);
            if (resolvedTalentUserId) {
              assessment.talentUserId = resolvedTalentUserId as any;
              await assessment.save();
            }
          }

          // Mark as sent for high-fidelity bulk action
          await Applicant.findByIdAndUpdate(applicantId, { assessmentStatus: 'sent' });

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

      const user = await User.findById(userId).select('email');
      const talentEmail = user?.email?.toLowerCase();

      // Collect all applicant IDs linked to this talent (by sourceId or email)
      const applicantIds = await this.getTalentApplicantIds(userId);

      // Also find applicants whose email matches the talent's email (catches company-uploaded applicants)
      let emailApplicantIds: string[] = [];
      if (talentEmail) {
        const emailApplicants = await Applicant.find({
          'profile.email': { $regex: new RegExp(`^${talentEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        }).select('_id');
        emailApplicantIds = emailApplicants.map((a) => a._id.toString());
      }

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
      await assessment.save();

      await Applicant.findByIdAndUpdate(applicant._id, { assessmentStatus: 'completed' });

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
