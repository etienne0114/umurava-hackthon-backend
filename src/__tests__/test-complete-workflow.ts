/**
 * Complete Workflow Test
 * Tests the entire upload → screening workflow with real data
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const API_BASE_URL = 'http://localhost:5001/api';
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Test configuration
const TEST_USER = {
  email: 'test-company@example.com',
  password: 'testpassword123',
  role: 'company',
  name: 'Test Company',
  company: 'TechCorp Inc'
};

const TEST_JOB = {
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
  status: 'active'
};

interface TestResults {
  userCreated: boolean;
  authToken: string;
  jobCreated: boolean;
  csvUpload: { success: boolean; count: number; errors?: string };
  excelUpload: { success: boolean; count: number; errors?: string };
  pdfUpload: { success: boolean; count: number; errors?: string };
  screeningStarted: boolean;
  screeningCompleted: boolean;
  resultsRetrieved: boolean;
  totalApplicants: number;
  screeningResults: any[];
  errors: string[];
}

class WorkflowTester {
  private jobId: string = '';
  private sessionId: string = '';
  private authToken: string = '';
  private results: TestResults = {
    userCreated: false,
    authToken: '',
    jobCreated: false,
    csvUpload: { success: false, count: 0 },
    excelUpload: { success: false, count: 0 },
    pdfUpload: { success: false, count: 0 },
    screeningStarted: false,
    screeningCompleted: false,
    resultsRetrieved: false,
    totalApplicants: 0,
    screeningResults: [],
    errors: []
  };

  async runCompleteTest(): Promise<TestResults> {
    console.log('🚀 Starting Complete Workflow Test\n');

    try {
      // Step 0: Create test user and authenticate
      await this.createTestUser();
      
      // Step 1: Create a test job
      await this.createTestJob();
      
      // Step 2: Upload applicants from different file formats
      await this.testFileUploads();
      
      // Step 3: Start AI screening
      await this.startScreening();
      
      // Step 4: Wait for screening completion
      await this.waitForScreeningCompletion();
      
      // Step 5: Retrieve and validate results
      await this.retrieveResults();
      
      console.log('\n✅ Complete Workflow Test Finished Successfully!');
      this.printSummary();
      
    } catch (error) {
      console.error('\n❌ Workflow Test Failed:', error);
      this.results.errors.push(error instanceof Error ? error.message : String(error));
    }

    return this.results;
  }

  private async createTestUser(): Promise<void> {
    console.log('👤 Step 0: Creating test user and authenticating...');
    
    try {
      // Try to login first (user might already exist)
      try {
        const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
          email: TEST_USER.email,
          password: TEST_USER.password
        });
        
        if (loginResponse.data.success && loginResponse.data.data.token) {
          this.authToken = loginResponse.data.data.token;
          this.results.authToken = this.authToken;
          this.results.userCreated = true;
          console.log('   ✅ User logged in successfully');
          return;
        }
      } catch (loginError) {
        // User doesn't exist, create new one
        console.log('   📝 User not found, creating new test user...');
      }
      
      // Create new user
      const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, TEST_USER);
      
      if (registerResponse.data.success && registerResponse.data.data.token) {
        this.authToken = registerResponse.data.data.token;
        this.results.authToken = this.authToken;
        this.results.userCreated = true;
        console.log('   ✅ Test user created and authenticated successfully');
      } else {
        throw new Error('User creation failed: Invalid response');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ User creation/authentication failed: ${message}`);
      throw error;
    }
  }

  private async createTestJob(): Promise<void> {
    console.log('\n📝 Step 1: Creating test job...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/jobs`, TEST_JOB, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });
      
      if (response.data.success && response.data.data._id) {
        this.jobId = response.data.data._id;
        this.results.jobCreated = true;
        console.log(`   ✅ Job created successfully: ${this.jobId}`);
      } else {
        throw new Error('Job creation failed: Invalid response');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Job creation failed: ${message}`);
      throw error;
    }
  }

  private async testFileUploads(): Promise<void> {
    console.log('\n📁 Step 2: Testing file uploads...');
    
    // Test CSV upload
    await this.uploadFile('comprehensive-applicants.csv', 'csv');
    
    // Test Excel upload (using a subset to avoid duplicates)
    // We'll create a smaller Excel file for testing
    await this.uploadFile('sample-applicants.xlsx', 'excel');
    
    // Test PDF uploads
    const pdfFiles = [
      'resume-sarah-chen.pdf',
      'resume-marcus-johnson.pdf',
      'resume-emily-rodriguez.pdf'
    ];
    
    for (const pdfFile of pdfFiles) {
      await this.uploadFile(pdfFile, 'pdf');
    }
  }

  private async uploadFile(filename: string, type: 'csv' | 'excel' | 'pdf'): Promise<void> {
    const filePath = path.join(FIXTURES_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  File not found: ${filename}`);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('jobId', this.jobId);
      formData.append('file', fs.createReadStream(filePath));

      const response = await axios.post(`${API_BASE_URL}/applicants/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.authToken}`
        },
        timeout: 30000 // 30 second timeout
      });

      if (response.data.success) {
        const count = response.data.data.length;
        const meta = response.data.meta;
        
        if (type === 'csv') {
          this.results.csvUpload = { success: true, count };
        } else if (type === 'excel') {
          this.results.excelUpload = { success: true, count };
        } else if (type === 'pdf') {
          this.results.pdfUpload.success = true;
          this.results.pdfUpload.count += count;
        }
        
        console.log(`   ✅ ${filename}: ${count} applicants uploaded (${meta.parsed} parsed, ${meta.duplicates} duplicates)`);
      } else {
        throw new Error(`Upload failed: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ${filename}: Upload failed - ${message}`);
      
      if (type === 'csv') {
        this.results.csvUpload = { success: false, count: 0, errors: message };
      } else if (type === 'excel') {
        this.results.excelUpload = { success: false, count: 0, errors: message };
      } else if (type === 'pdf') {
        this.results.pdfUpload.errors = message;
      }
    }
  }

  private async startScreening(): Promise<void> {
    console.log('\n🤖 Step 3: Starting AI screening...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/screening/start`, {
        jobId: this.jobId,
        options: {
          topN: 10,
          minScore: 0
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.data.success && response.data.data._id) {
        this.sessionId = response.data.data._id;
        this.results.screeningStarted = true;
        console.log(`   ✅ Screening started: ${this.sessionId}`);
        console.log(`   📊 Processing ${response.data.data.totalApplicants} applicants...`);
        this.results.totalApplicants = response.data.data.totalApplicants;
      } else {
        throw new Error('Screening start failed: Invalid response');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Screening start failed: ${message}`);
      throw error;
    }
  }

  private async waitForScreeningCompletion(): Promise<void> {
    console.log('\n⏳ Step 4: Waiting for screening completion...');
    
    const maxWaitTime = 300000; // 5 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(`${API_BASE_URL}/screening/session/${this.sessionId}`, {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          }
        });
        
        if (response.data.success && response.data.data) {
          const session = response.data.data;
          const progress = session.totalApplicants > 0 
            ? Math.round((session.processedApplicants / session.totalApplicants) * 100)
            : 0;
          
          console.log(`   📈 Progress: ${session.processedApplicants}/${session.totalApplicants} (${progress}%) - Status: ${session.status}`);
          
          if (session.status === 'completed') {
            this.results.screeningCompleted = true;
            console.log('   ✅ Screening completed successfully!');
            return;
          } else if (session.status === 'failed') {
            throw new Error(`Screening failed: ${session.error || 'Unknown error'}`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`   ❌ Error checking screening status: ${message}`);
        throw error;
      }
    }
    
    throw new Error('Screening timeout: Process did not complete within 5 minutes');
  }

  private async retrieveResults(): Promise<void> {
    console.log('\n📊 Step 5: Retrieving screening results...');
    
    try {
      const response = await axios.get(`${API_BASE_URL}/screening/results/${this.jobId}?limit=20`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });
      
      if (response.data.success && Array.isArray(response.data.data)) {
        this.results.screeningResults = response.data.data;
        this.results.resultsRetrieved = true;
        
        console.log(`   ✅ Retrieved ${response.data.data.length} screening results`);
        
        // Display top 5 candidates
        console.log('\n   🏆 Top 5 Candidates:');
        response.data.data.slice(0, 5).forEach((result: any, index: number) => {
          const applicant = result.applicantId;
          const name = applicant?.profile?.name || 'Unknown';
          const email = applicant?.profile?.email || 'Unknown';
          const score = Math.round(result.matchScore);
          const recommendation = result.evaluation?.recommendation || 'unknown';
          
          console.log(`      ${index + 1}. ${name} (${email}) - Score: ${score}% - ${recommendation}`);
        });
      } else {
        throw new Error('Results retrieval failed: Invalid response');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Results retrieval failed: ${message}`);
      throw error;
    }
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📋 WORKFLOW TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`✅ User Created: ${this.results.userCreated ? 'YES' : 'NO'}`);
    console.log(`🔑 Auth Token: ${this.results.authToken ? 'OBTAINED' : 'MISSING'}`);
    console.log(`✅ Job Created: ${this.results.jobCreated ? 'YES' : 'NO'}`);
    console.log(`📁 CSV Upload: ${this.results.csvUpload.success ? 'SUCCESS' : 'FAILED'} (${this.results.csvUpload.count} applicants)`);
    console.log(`📊 Excel Upload: ${this.results.excelUpload.success ? 'SUCCESS' : 'FAILED'} (${this.results.excelUpload.count} applicants)`);
    console.log(`📄 PDF Upload: ${this.results.pdfUpload.success ? 'SUCCESS' : 'FAILED'} (${this.results.pdfUpload.count} applicants)`);
    console.log(`🤖 AI Screening Started: ${this.results.screeningStarted ? 'YES' : 'NO'}`);
    console.log(`✅ AI Screening Completed: ${this.results.screeningCompleted ? 'YES' : 'NO'}`);
    console.log(`📊 Results Retrieved: ${this.results.resultsRetrieved ? 'YES' : 'NO'}`);
    console.log(`👥 Total Applicants Processed: ${this.results.totalApplicants}`);
    console.log(`🏆 Screening Results Count: ${this.results.screeningResults.length}`);
    
    if (this.results.errors.length > 0) {
      console.log(`\n❌ Errors Encountered: ${this.results.errors.length}`);
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Overall status
    const allSuccessful = this.results.userCreated && 
                         this.results.jobCreated && 
                         this.results.screeningStarted && 
                         this.results.screeningCompleted && 
                         this.results.resultsRetrieved &&
                         (this.results.csvUpload.success || this.results.excelUpload.success || this.results.pdfUpload.success);
    
    if (allSuccessful) {
      console.log('🎉 OVERALL STATUS: COMPLETE SUCCESS - AI SCREENING IS FULLY FUNCTIONAL!');
    } else {
      console.log('⚠️  OVERALL STATUS: PARTIAL SUCCESS - Some components may need attention');
    }
    
    console.log('='.repeat(60));
  }
}

// Run the test
async function main() {
  const tester = new WorkflowTester();
  const results = await tester.runCompleteTest();
  
  // Exit with appropriate code
  const success = results.jobCreated && results.screeningCompleted && results.resultsRetrieved;
  process.exit(success ? 0 : 1);
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { WorkflowTester };
export type { TestResults };