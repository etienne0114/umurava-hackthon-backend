const mongoose = require('mongoose');
require('./src/models/Job');
require('./src/models/Applicant');
require('./src/models/ScreeningSession');
const { ScreeningResult } = require('./src/models/ScreeningResult');

mongoose.connect('mongodb://localhost:27017/recruitment-platform').then(async () => {
  try {
    const results = await ScreeningResult.find({ jobId: "69ce63b72814233a84f09019" })
      .sort({ rank: 1 })
      .limit(20)
      .populate('applicantId');
    console.log("SUCCESS, found", results.length);
    console.log("FIRST RESULT APPLICANT:", results[0]?.applicantId);
  } catch (err) {
    console.error("ERROR:", err.message);
  }
  process.exit(0);
});
