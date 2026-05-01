const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment-platform';

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
    position: String,
    headline: String,
    location: String,
    phone: String,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model('User', userSchema);

async function createTestUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create test company user
    const companyUser = {
      email: 'company@test.com',
      password: 'password123',
      role: 'company',
      profile: {
        name: 'Test Company',
        firstName: 'Test',
        lastName: 'Company',
        company: 'TechCorp Inc',
        position: 'HR Manager',
        headline: 'Hiring Manager at TechCorp',
        location: 'San Francisco, CA',
        phone: '+1-555-0123'
      }
    };

    // Create test talent user
    const talentUser = {
      email: 'talent@test.com',
      password: 'password123',
      role: 'talent',
      profile: {
        name: 'John Developer',
        firstName: 'John',
        lastName: 'Developer',
        headline: 'Full Stack Developer',
        location: 'New York, NY',
        phone: '+1-555-0456'
      }
    };

    // Check if users already exist
    const existingCompany = await User.findOne({ email: companyUser.email });
    const existingTalent = await User.findOne({ email: talentUser.email });

    if (existingCompany) {
      console.log('Company user already exists:', companyUser.email);
    } else {
      const newCompany = new User(companyUser);
      await newCompany.save();
      console.log('✅ Created company user:', companyUser.email);
    }

    if (existingTalent) {
      console.log('Talent user already exists:', talentUser.email);
    } else {
      const newTalent = new User(talentUser);
      await newTalent.save();
      console.log('✅ Created talent user:', talentUser.email);
    }

    console.log('\n📋 Test Users:');
    console.log('Company: company@test.com / password123');
    console.log('Talent: talent@test.com / password123');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createTestUsers();