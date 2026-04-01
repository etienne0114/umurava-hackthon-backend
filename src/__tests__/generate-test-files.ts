/**
 * Generate Test Files
 * Creates sample Excel and PDF files for testing
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const docsDir = path.join(__dirname, '../../../docs');

// Sample applicant data
const applicants = [
  {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    skills: 'JavaScript,React,Node.js,TypeScript',
    experience: 'Senior Software Engineer at TechCorp (2020-2023): Led development of microservices architecture. Software Engineer at StartupXYZ (2018-2020): Built React applications.',
    education: 'BS Computer Science, MIT (2018)',
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    phone: '+1234567891',
    skills: 'Python,Django,PostgreSQL,AWS',
    experience: 'Backend Developer at CloudSystems (2019-2023): Designed scalable APIs. Junior Developer at WebCo (2017-2019): Maintained legacy systems.',
    education: 'MS Software Engineering, Stanford (2017)',
  },
  {
    name: 'Michael Johnson',
    email: 'michael.j@example.com',
    phone: '+1234567892',
    skills: 'Java,Spring Boot,Kubernetes,Docker',
    experience: 'DevOps Engineer at Enterprise Inc (2021-2023): Automated deployment pipelines. Software Engineer at MegaCorp (2018-2021): Developed enterprise applications.',
    education: 'BS Information Technology, UC Berkeley (2018)',
  },
];

// Generate Excel file
function generateExcelFile() {
  const worksheet = XLSX.utils.json_to_sheet(applicants);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Applicants');
  
  const excelPath = path.join(docsDir, 'sample-applicants.xlsx');
  XLSX.writeFile(workbook, excelPath);
  console.log(`✓ Generated Excel file: ${excelPath}`);
}

// Generate simple PDF file (text-based)
function generatePDFFile() {
  const pdfContent = `
RESUME

Name: Alice Cooper
Email: alice.cooper@example.com
Phone: +1234567895

SKILLS
JavaScript, TypeScript, React, Vue.js, Node.js, Express, MongoDB, PostgreSQL

EXPERIENCE
Senior Frontend Developer at WebTech Solutions (2020-2023)
- Led frontend architecture redesign using React and TypeScript
- Implemented responsive design system used across 10+ products
- Mentored team of 5 junior developers

Frontend Developer at Digital Agency (2018-2020)
- Built interactive web applications using Vue.js
- Collaborated with UX designers to implement pixel-perfect designs
- Optimized application performance, reducing load time by 40%

EDUCATION
Bachelor of Science in Computer Science
University of California, Los Angeles (UCLA)
Graduated: 2018

CERTIFICATIONS
- AWS Certified Developer Associate
- Google Cloud Professional Developer
`;

  const pdfPath = path.join(docsDir, 'sample-resume.pdf');
  
  // For a real PDF, we'd use a library like pdfkit or jspdf
  // For testing purposes, we'll create a text file with .pdf extension
  // The actual PDF parser will need to handle this
  fs.writeFileSync(pdfPath, pdfContent, 'utf-8');
  console.log(`✓ Generated PDF file: ${pdfPath}`);
}

// Run generation
try {
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  generateExcelFile();
  generatePDFFile();
  
  console.log('\n✓ All test files generated successfully!');
} catch (error) {
  console.error('Error generating test files:', error);
  process.exit(1);
}
