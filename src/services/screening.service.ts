import mongoose from 'mongoose';
import { Job, IJob } from '../models/Job';
import { Applicant, IApplicant } from '../models/Applicant';
import { ScreeningSession, IScreeningSession } from '../models/ScreeningSession';
import { ScreeningResult, IScreeningResult } from '../models/ScreeningResult';
import { Assessment } from '../models/Assessment';
import { geminiService, CandidateEvaluation } from './gemini.service';
import { NotificationController } from '../controllers/notification.controller';
import { WeightConfig } from '../types';
import logger from '../utils/logger';

function applicantsByJobFilter(jobId: string): object {
  if (mongoose.Types.ObjectId.isValid(jobId)) {
    const oid = new mongoose.Types.ObjectId(jobId);
    return { $or: [{ jobId: oid }, { jobId: jobId }] };
  }
  return { jobId };
}

export interface ScreeningOptions {
  topN?: number;
  minScore?: number;
  weights?: WeightConfig;
}

export class ScreeningService {
  // Process all applicants in one AI call — avoids multiple API requests
  // and the TPM exhaustion that comes from many sequential small batches.
  // Falls back to sub-batches of 10 if the single call fails.
  private readonly BATCH_SIZE = 10;
  private readonly MAX_SINGLE_CALL = 50; // send up to 50 at once in one prompt

  private async assertAllAssessmentsCompleted(jobId: string): Promise<void> {
    const totalAssessments = await Assessment.countDocuments({ jobId });
    if (totalAssessments === 0) return;

    const pendingAssessments = await Assessment.find({ jobId, status: { $ne: 'completed' } })
      .select('dueAt')
      .lean();

    if (pendingAssessments.length === 0) return;

    const dueAtValues = pendingAssessments
      .map((a) => a.dueAt)
      .filter((date): date is Date => date instanceof Date);
    const latestDueAt = dueAtValues.length > 0
      ? new Date(Math.max(...dueAtValues.map((d) => d.getTime())))
      : null;
    const dueDateReached = latestDueAt ? new Date() >= latestDueAt : false;

    if (!dueDateReached) {
      throw new Error('Quick tests are still in progress. Screening unlocks when the test due date is reached or all tests are completed.');
    }
  }

  async startScreening(jobId: string, options: ScreeningOptions = {}): Promise<IScreeningSession> {
    try {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      await this.assertAllAssessmentsCompleted(jobId);

      const applicants = await Applicant.find(applicantsByJobFilter(jobId));
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
        options: {
          topN,
          minScore,
          weights,
          batchMode: applicants.length > this.MAX_SINGLE_CALL,
          batchSize: applicants.length <= this.MAX_SINGLE_CALL ? applicants.length : this.BATCH_SIZE,
        },
        aiProviderStatus: {
          primaryProvider: 'gemini',
          currentProvider: 'gemini',
          fallbackCount: 0,
          geminiQuotaExhausted: false,
          groqErrors: 0,
        },
      });

      await session.save();

      await Job.findByIdAndUpdate(jobId, { screeningStatus: 'in_progress' });

      this.processScreening(session._id.toString(), job, applicants, options).catch((error) => {
        logger.error(`Screening process failed for session ${session._id}:`, error);
      });

      logger.info(`Screening started for job ${jobId}, session ${session._id}`);
      return session;
    } catch (error: unknown) {
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

      if (applicants.length <= this.MAX_SINGLE_CALL) {
        // ── Strategy 1: Single AI call for all applicants ──────────────────────
        // One prompt = one API request = no TPM fragmentation.
        logger.info(`Screening ${applicants.length} applicants in a single AI call`);
        try {
          const results = await geminiService.evaluateCandidatesBatch(job, applicants, sessionId);
          results.forEach((r) => evaluations.push({ ...r.evaluation, applicantId: r.applicantId }));
          await ScreeningSession.findByIdAndUpdate(sessionId, {
            $inc: { processedApplicants: applicants.length },
          });
        } catch (singleCallError: unknown) {
          const msg = singleCallError instanceof Error ? singleCallError.message : String(singleCallError);
          logger.warn(`Single-call evaluation failed (${msg}), falling back to sub-batches of ${this.BATCH_SIZE}`);

          // ── Strategy 2: Sub-batches of BATCH_SIZE ──────────────────────────
          for (let i = 0; i < applicants.length; i += this.BATCH_SIZE) {
            const batch = applicants.slice(i, i + this.BATCH_SIZE);
            try {
              const batchResults = await geminiService.evaluateCandidatesBatch(job, batch, sessionId);
              batchResults.forEach((r) => evaluations.push({ ...r.evaluation, applicantId: r.applicantId }));
            } catch (batchError: unknown) {
              logger.error(`Failed to evaluate sub-batch starting at ${i}:`, batchError);
            } finally {
              await ScreeningSession.findByIdAndUpdate(sessionId, {
                $inc: { processedApplicants: batch.length },
              });
            }
          }
        }
      } else {
        // ── Strategy 3: Large pool — sub-batches of BATCH_SIZE ─────────────────
        logger.info(`Screening ${applicants.length} applicants in sub-batches of ${this.BATCH_SIZE}`);
        for (let i = 0; i < applicants.length; i += this.BATCH_SIZE) {
          const batch = applicants.slice(i, i + this.BATCH_SIZE);
          try {
            const batchResults = await geminiService.evaluateCandidatesBatch(job, batch, sessionId);
            batchResults.forEach((r) => evaluations.push({ ...r.evaluation, applicantId: r.applicantId }));
          } catch (error: unknown) {
            logger.error(`Failed to evaluate batch starting at ${i}:`, error);
          } finally {
            await ScreeningSession.findByIdAndUpdate(sessionId, {
              $inc: { processedApplicants: batch.length },
            });
          }
        }
      }

      const rankedResults = this.rankCandidates(evaluations, options);

      logger.info(`Ranked ${rankedResults.length} candidates. Final ranking: ${rankedResults.map((r, i) => `#${i + 1}: ${r.matchScore}%`).join(', ')}`);

      // Use sequential ranking (1, 2, 3, 4, 5...) - no duplicate numbers
      const screeningResults = rankedResults.map((result, index) => ({
        applicantId: result.applicantId,
        jobId: job._id,
        sessionId,
        rank: index + 1, // Sequential: 1, 2, 3, 4, 5... regardless of tied scores
        matchScore: result.matchScore,
        evaluation: {
          strengths: result.strengths,
          gaps: result.gaps,
          risks: result.risks,
          recommendation: result.recommendation,
          reasoning: result.reasoning,
          aiFallback: result.aiFallback || false,
        },
        scoreBreakdown: result.scoreBreakdown,
        geminiResponse: result.geminiResponse,
      }));

      // Log final ranking with actual ranks
      logger.info(`Final ranking assigned: ${screeningResults.map(r => `Rank ${r.rank}: ${r.matchScore}%`).join(', ')}`);

      const finalResults = screeningResults;

      await ScreeningResult.insertMany(finalResults);

      await ScreeningSession.findByIdAndUpdate(sessionId, {
        status: 'completed',
        completedAt: new Date(),
      });

      await Job.findByIdAndUpdate(job._id, { screeningStatus: 'completed' });

      // Notify the recruiter
      if (job.createdBy) {
        await NotificationController.create(
          job.createdBy.toString(),
          'success',
          'Screening Completed',
          `AI screening for "${job.title}" has finished. ${finalResults.length} candidates were ranked.`,
          `/company/screening?jobId=${job._id}`
        );
      }

      logger.info(`Screening completed for session ${sessionId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await ScreeningSession.findByIdAndUpdate(sessionId, {
        status: 'failed',
        error: message,
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

    // Enhanced sorting: Primary by match score (descending), secondary by applicantId for stable sorting
    const sorted = filtered.sort((a, b) => {
      // Primary sort: match score (descending)
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      
      // Secondary sort: applicantId (ascending) for stable sorting when scores are equal
      return a.applicantId.localeCompare(b.applicantId);
    });

    logger.info(`Ranking ${filtered.length} candidates. Top scores: ${sorted.slice(0, 5).map(s => `${s.matchScore}%`).join(', ')}`);

    return sorted.slice(0, topN);
  }

  async getScreeningResults(jobId: string, limit: number = 500): Promise<IScreeningResult[]> {
    try {
      // Find the latest completed session for this job to avoid mixing duplicates
      const latestSession = await ScreeningSession.findOne({ 
        jobId, 
        status: 'completed' 
      }).sort({ createdAt: -1 });

      const query = latestSession ? { jobId, sessionId: latestSession._id } : { jobId };

      const results = await ScreeningResult.find(query)
        .sort({ rank: 1 }) // Primary sort by rank
        .limit(limit)
        .populate('applicantId');
      
      // Validate ranking integrity and fix if needed
      const hasRankingIssues = this.validateAndFixRanking(results);
      if (hasRankingIssues) {
        logger.warn(`Fixed ranking issues for job ${jobId}`);
        // Await a brief moment to allow async bulkWrite to initiate/complete
        await new Promise(resolve => setTimeout(resolve, 500));
        // Re-fetch after fixing
        const fixedResults = await ScreeningResult.find(query)
          .sort({ rank: 1 })
          .limit(limit)
          .populate('applicantId');
        
        logger.info(`Retrieved ${fixedResults.length} screening results for job ${jobId} (after ranking fix). Top scores: ${fixedResults.slice(0, 3).map(r => `Rank ${r.rank}: ${r.matchScore}%`).join(', ')}`);
        return fixedResults;
      }
      
      logger.debug(`Retrieved ${results.length} screening results for job ${jobId}. Top scores: ${results.slice(0, 3).map(r => `Rank ${r.rank}: ${r.matchScore}%`).join(', ')}`);
      
      return results;
    } catch (error: unknown) {
      logger.error(`Error fetching screening results for job ${jobId}:`, error);
      throw error;
    }
  }

  private validateAndFixRanking(results: IScreeningResult[]): boolean {
    if (results.length === 0) return false;

    // Check if ranks are sequential (1, 2, 3, 4, 5...)
    const expectedRanks = results.map((_, index) => index + 1);
    const actualRanks = results.map(r => r.rank);
    const hasIssues = !expectedRanks.every((expected, index) => expected === actualRanks[index]);

    if (hasIssues) {
      logger.warn(`Ranking validation failed. Expected: [${expectedRanks.slice(0, 5).join(', ')}...], Actual: [${actualRanks.slice(0, 5).join(', ')}...]`);
      
      // Fix ranking by re-sorting by match score and assigning sequential ranks
      const sortedByScore = [...results].sort((a, b) => {
        // Primary sort: match score (descending)
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
        // Secondary sort: applicantId for stable sorting
        const getApplicantIdStr = (appId: unknown) => {
          if (!appId) return '';
          if (typeof appId === 'string') return appId;
          if (typeof appId === 'object' && appId !== null && '_id' in appId) return String((appId as { _id: unknown })._id);
          return String(appId);
        };
        const aId = getApplicantIdStr(a.applicantId);
        const bId = getApplicantIdStr(b.applicantId);
        return aId.localeCompare(bId);
      });

      // Update ranks in database
      const bulkOps = sortedByScore.map((result, index) => ({
        updateOne: {
          filter: { _id: result._id },
          update: { $set: { rank: index + 1 } }
        }
      }));

      // Execute bulk update asynchronously (don't block the response)
      ScreeningResult.bulkWrite(bulkOps).catch((error) => {
        logger.error('Failed to fix ranking in database:', error);
      });

      return true;
    }

    return false;
  }

  async getScreeningStatus(sessionId: string): Promise<IScreeningSession | null> {
    try {
      return await ScreeningSession.findById(sessionId);
    } catch (error: unknown) {
      logger.error(`Error fetching screening status for session ${sessionId}:`, error);
      throw error;
    }
  }

  async regenerateScreening(
    jobId: string,
    applicantIds?: string[]
  ): Promise<IScreeningSession> {
    try {
      await this.assertAllAssessmentsCompleted(jobId);
      if (applicantIds && applicantIds.length > 0) {
        await ScreeningResult.deleteMany({ jobId, applicantId: { $in: applicantIds } });
      } else {
        await ScreeningResult.deleteMany({ jobId });
      }

      return await this.startScreening(jobId);
    } catch (error: unknown) {
      logger.error('Error regenerating screening:', error);
      throw error;
    }
  }

  async fixRankingForJob(jobId: string): Promise<{ issuesFound: boolean; recordsUpdated: number }> {
    try {
      // Get all results for this job, sorted by match score (descending)
      const results = await ScreeningResult.find({ jobId })
        .sort({ matchScore: -1, _id: 1 }) // Sort by score desc, then by ID for stable sort
        .lean();

      if (results.length === 0) {
        return { issuesFound: false, recordsUpdated: 0 };
      }

      // Check if ranks are already correct (sequential: 1, 2, 3, 4, 5...)
      const expectedRanks = results.map((_, index) => index + 1);
      const actualRanks = results.map(r => r.rank);
      const ranksAreCorrect = expectedRanks.every((expected, index) => expected === actualRanks[index]);

      if (ranksAreCorrect) {
        logger.info(`Job ${jobId}: Rankings are already correct (${results.length} candidates)`);
        return { issuesFound: false, recordsUpdated: 0 };
      }

      logger.warn(`Job ${jobId}: Found ranking issues! Expected: [${expectedRanks.slice(0, 5).join(', ')}...], Actual: [${actualRanks.slice(0, 5).join(', ')}...]`);

      // Update ranks to be sequential
      const bulkOps = results.map((result, index) => ({
        updateOne: {
          filter: { _id: result._id },
          update: { $set: { rank: index + 1 } }
        }
      }));

      const bulkResult = await ScreeningResult.bulkWrite(bulkOps);
      logger.info(`Fixed ${bulkResult.modifiedCount} ranking records for job ${jobId}`);

      return { issuesFound: true, recordsUpdated: bulkResult.modifiedCount };
    } catch (error: unknown) {
      logger.error(`Error fixing ranking for job ${jobId}:`, error);
      throw error;
    }
  }
}

export const screeningService = new ScreeningService();
