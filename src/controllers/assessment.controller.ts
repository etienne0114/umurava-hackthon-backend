import { Request, Response } from 'express';
import { Assessment } from '../models/Assessment';
import { Applicant } from '../models/Applicant';
import { Job } from '../models/Job';
import { geminiService } from '../services/gemini.service';
import logger from '../utils/logger';

export class AssessmentController {
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

      const assessment = await Assessment.create({
        jobId,
        applicantId,
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

      // If recruiter edited questions, save them now
      if (questions && Array.isArray(questions) && jobId) {
        await Assessment.findOneAndUpdate(
          { applicantId, jobId },
          { questions },
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
              questions,
              status: 'pending',
            });
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
}

export const assessmentController = new AssessmentController();
