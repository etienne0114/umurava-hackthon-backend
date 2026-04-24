/**
 * Script to fix duplicate ranking issues in screening results
 * This script will:
 * 1. Find all screening results with duplicate ranks
 * 2. Re-rank them properly based on match scores
 * 3. Update the database with correct sequential rankings
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Define the ScreeningResult schema directly
const ScreeningResultSchema = new mongoose.Schema({
  applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Applicant', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScreeningSession', required: true },
  rank: { type: Number, required: true },
  matchScore: { type: Number, required: true },
  evaluation: {
    strengths: [String],
    gaps: [String],
    risks: [String],
    recommendation: { type: String, enum: ['highly_recommended', 'recommended', 'consider', 'not_recommended'] },
    reasoning: String,
    aiFallback: { type: Boolean, default: false }
  },
  scoreBreakdown: {
    skills: Number,
    experience: Number,
    education: Number,
    relevance: Number
  },
  geminiResponse: {
    rawResponse: String,
    model: String,
    tokensUsed: Number
  }
}, { timestamps: true });

const ScreeningResult = mongoose.model('ScreeningResult', ScreeningResultSchema);

async function fixDuplicateRanks() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Find all jobs with screening results
    const jobsWithResults = await ScreeningResult.distinct('jobId');
    console.log(`📊 Found ${jobsWithResults.length} jobs with screening results`);

    let totalFixed = 0;
    let totalJobs = 0;

    for (const jobId of jobsWithResults) {
      console.log(`\n🔧 Processing job: ${jobId}`);
      
      // Get all results for this job, sorted by match score (descending)
      const results = await ScreeningResult.find({ jobId })
        .sort({ matchScore: -1, _id: 1 }) // Sort by score desc, then by ID for stable sort
        .lean();

      if (results.length === 0) {
        console.log(`  ⚠️  No results found for job ${jobId}`);
        continue;
      }

      // Check if ranks are already correct (sequential: 1, 2, 3, 4, 5...)
      const expectedRanks = results.map((_, index) => index + 1);
      const actualRanks = results.map(r => r.rank);
      const ranksAreCorrect = expectedRanks.every((expected, index) => expected === actualRanks[index]);

      if (ranksAreCorrect) {
        console.log(`  ✅ Job ${jobId}: Rankings are already correct (${results.length} candidates)`);
        continue;
      }

      console.log(`  🚨 Job ${jobId}: Found ranking issues!`);
      console.log(`     Expected: [${expectedRanks.slice(0, 10).join(', ')}${expectedRanks.length > 10 ? '...' : ''}]`);
      console.log(`     Actual:   [${actualRanks.slice(0, 10).join(', ')}${actualRanks.length > 10 ? '...' : ''}]`);

      // Update ranks to be sequential
      const bulkOps = results.map((result, index) => ({
        updateOne: {
          filter: { _id: result._id },
          update: { $set: { rank: index + 1 } }
        }
      }));

      const bulkResult = await ScreeningResult.bulkWrite(bulkOps);
      console.log(`  ✅ Fixed ${bulkResult.modifiedCount} ranking records for job ${jobId}`);
      
      totalFixed += bulkResult.modifiedCount;
      totalJobs++;

      // Verify the fix
      const verifyResults = await ScreeningResult.find({ jobId })
        .sort({ rank: 1 })
        .select('rank matchScore')
        .lean();
      
      const newRanks = verifyResults.map(r => r.rank);
      const newExpected = verifyResults.map((_, index) => index + 1);
      const isNowCorrect = newExpected.every((expected, index) => expected === newRanks[index]);
      
      if (isNowCorrect) {
        console.log(`  ✅ Verification passed: Rankings are now sequential`);
        console.log(`     Top 5 scores: ${verifyResults.slice(0, 5).map(r => `#${r.rank}:${r.matchScore}%`).join(', ')}`);
      } else {
        console.log(`  ❌ Verification failed: Rankings are still incorrect`);
      }
    }

    console.log(`\n🎉 Summary:`);
    console.log(`   - Jobs processed: ${jobsWithResults.length}`);
    console.log(`   - Jobs with issues fixed: ${totalJobs}`);
    console.log(`   - Total records updated: ${totalFixed}`);

  } catch (error) {
    console.error('❌ Error fixing duplicate ranks:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
if (require.main === module) {
  fixDuplicateRanks()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixDuplicateRanks };