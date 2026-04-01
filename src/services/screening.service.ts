import { Job, IJob } from '../models/Job';
import { Applicant, IApplicant } from '../models/Applicant';
import { ScreeningSession, IScreeningSession } from '../models/ScreeningSession';
import { ScreeningResult, IScreeningResult } from '../models/ScreeningResult';
import { geminiService, CandidateEvaluation } from './gemini.service';
import { WeightConfig } from '../types';
import logger from '../utils/logger';

export interface ScreeningOptions {
  topN?: number;
  minScore?: number;
  weights?: WeightConfig;
}

export class ScreeningService {
  async startScreening(jobId: string, options: ScreeningOptions = {}): Promise<IScreeningSession> {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const applicants = await Applicant.find({ jobId });
      if (applicants.length === 0) {
        throw new Error('No applicants found for this job');
      }

      const weights = options.weights || job.weights;
      const topN = options.topN || 20;
      const minScore = options.minScore || 0;

      const session = new ScreeningSession({
        jobId,
        status: 'processing',
        totalApplicants: applicants.length,
        processedApplicants: 0,
        options: { topN, minScore, weights },
      });

      await session.save();

      await Job.findByIdAndUpdate(jobId, { screeningStatus: 'in_progress' });

      this.processScreening(session._id.toString(), job, applicants, options).catch((error) => {
        logger.error(`Screening process failed for session ${session._id}:`, error);
      });

      logger.info(`Screening started for job ${jobId}, session ${session._id}`);
      return session;
    } catch (error: any) {
      logger.error('Error starting screening:', error);
      throw error;
    }
  }

  private async processScreening(
    sessionId: string,
    job: IJob,
    applicants: IApplicant[],
    options: ScreeningOptions
  ): Promise<void> {
    try {
      const evaluations: Array<CandidateEvaluation & { applicantId: string }> = [];

      for (const applicant of applicants) {
        try {
          const evaluation = await geminiService.evaluateCandidate(job, applicant);
          evaluations.push({
            ...evaluation,
            applicantId: applicant._id.toString(),
          });

          await ScreeningSession.findByIdAndUpdate(sessionId, {
            $inc: { processedApplicants: 1 },
          });
        } catch (error: any) {
          logger.error(`Failed to evaluate applicant ${applicant._id}:`, error);
        }
      }

      const rankedResults = this.rankCandidates(evaluations, options);

      const screeningResults = rankedResults.map((result, index) => ({
        applicantId: result.applicantId,
        jobId: job._id,
        sessionId,
        rank: index + 1,
        matchScore: result.matchScore,
        evaluation: {
          strengths: result.strengths,
          gaps: result.gaps,
          risks: result.risks,
          recommendation: result.recommendation,
          reasoning: result.reasoning,
        },
        scoreBreakdown: result.scoreBreakdown,
        geminiResponse: result.geminiResponse,
      }));

      await ScreeningResult.insertMany(screeningResults);

      await ScreeningSession.findByIdAndUpdate(sessionId, {
        status: 'completed',
        completedAt: new Date(),
      });

      await Job.findByIdAndUpdate(job._id, { screeningStatus: 'completed' });

      logger.info(`Screening completed for session ${sessionId}`);
    } catch (error: any) {
      await ScreeningSession.findByIdAndUpdate(sessionId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });

      await Job.findByIdAndUpdate(job._id, { screeningStatus: 'not_started' });

      throw error;
    }
  }

  private rankCandidates(
    evaluations: Array<CandidateEvaluation & { applicantId: string }>,
    options: ScreeningOptions
  ): Array<CandidateEvaluation & { applicantId: string }> {
    const minScore = options.minScore || 0;
    const topN = options.topN || 20;

    const filtered = evaluations.filter((evaluation) => evaluation.matchScore >= minScore);

    const sorted = filtered.sort((a, b) => b.matchScore - a.matchScore);

    return sorted.slice(0, topN);
  }

  async getScreeningResults(jobId: string, limit: number = 20): Promise<IScreeningResult[]> {
    try {
      return await ScreeningResult.find({ jobId })
        .sort({ rank: 1 })
        .limit(limit)
        .populate('applicantId');
    } catch (error: any) {
      logger.error(`Error fetching screening results for job ${jobId}:`, error);
      throw error;
    }
  }

  async getScreeningStatus(sessionId: string): Promise<IScreeningSession | null> {
    try {
      return await ScreeningSession.findById(sessionId);
    } catch (error: any) {
      logger.error(`Error fetching screening status for session ${sessionId}:`, error);
      throw error;
    }
  }

  async regenerateScreening(
    jobId: string,
    applicantIds?: string[]
  ): Promise<IScreeningSession> {
    try {
      if (applicantIds && applicantIds.length > 0) {
        await ScreeningResult.deleteMany({ jobId, applicantId: { $in: applicantIds } });
      } else {
        await ScreeningResult.deleteMany({ jobId });
      }

      return await this.startScreening(jobId);
    } catch (error: any) {
      logger.error('Error regenerating screening:', error);
      throw error;
    }
  }
}

export const screeningService = new ScreeningService();
