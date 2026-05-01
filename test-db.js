const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/recruitment-platform').then(async () => {
  const db = mongoose.connection.db;
  const results = await db.collection('screeningresults').find({ jobId: new mongoose.Types.ObjectId("69ce63b72814233a84f09019") }).toArray();
  console.log("RESULTS COUNT:", results.length);
  process.exit(0);
});
