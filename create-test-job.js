const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Load environment variables
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// User schema (simplified)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['talent', 'company'], required: true },
  profile: {
    name: String,
    firstName: String,
    lastName: String,
    company: String,
  },
});

// Job schema (simplified)
const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  requirements: {
    skills: String,
    experience: {
      minYears: Number,
      maxYears: Number
    },
    education: [String],
    location: String
  },
  weights: {
    skills: { type: Number, default: 0.4 },
    experience: { type: Number, default: 0.3 },
    education: { type: Number, default: 0.2 },
    relevance: { type: Number, default: 0.1 }
  },
  status: { type: String, enum: ['draft', 'active', 'closed'], default: 'active' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  applicantCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Job = mongoose.model('Job', jobSchema);

async function createTestJob() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the company user
    const companyUser = await User.findOne({ email: 'company@test.com' });
    if (!companyUser) {
      console.error('Company user not found. Please run create-test-user.js first.');
      return;
    }

    console.log('Found company user:', companyUser.email);

    // Create test job
    const testJob = {
      title: 'Senior Full Stack Developer',
      description: 'We are looking for a Senior Full Stack Developer to join our growing team. You will be responsible for developing and maintaining web applications using modern technologies. The ideal candidate will have experience with JavaScript, TypeScript, React, Node.js, and cloud technologies.',
      requirements: {
        skills: 'JavaScript, TypeScript, React, Node.js, MongoDB, AWS, Docker',
        experience: {
          minYears: 3,
          maxYears: 8
        },
        education: ['Bachelor\'s degree in Computer Science', 'Equivalent experience'],
        location: 'San Francisco, CA (Remote OK)'
      },
      weights: {
        skills: 0.4,
        experience: 0.3,
        education: 0.2,
        relevance: 0.1
      },
      status: 'active',
      companyId: companyUser._id
    };

    // Check if job already exists
    const existingJob = await Job.findOne({ 
      title: testJob.title, 
      companyId: companyUser._id 
    });

    if (existingJob) {
      console.log('Test job already exists:', existingJob._id);
      console.log('Job ID for upload testing:', existingJob._id.toString());
    } else {
      const newJob = new Job(testJob);
      await newJob.save();
      console.log('✅ Created test job:', newJob._id);
      console.log('Job ID for upload testing:', newJob._id.toString());
    }

    // Generate auth token for the company user
    const token = jwt.sign(
      { userId: companyUser._id.toString(), role: companyUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('\n📋 Test Information:');
    console.log('Company Email: company@test.com');
    console.log('Password: password123');
    console.log('Auth Token:', token);
    console.log('\n🔗 Upload URL: http://localhost:3000/applicants/upload?jobId=' + (existingJob?._id || 'NEW_JOB_ID'));

  } catch (error) {
    console.error('Error creating test job:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createTestJob();