/**
 * Generate Comprehensive Test Files
 * Creates Excel and PDF files with 15+ realistic applicants for testing
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const fixturesDir = path.join(__dirname, 'fixtures');

// Read the comprehensive CSV data
const csvPath = path.join(fixturesDir, 'comprehensive-applicants.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV manually
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  const data: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      data.push(row);
    }
  }

  return data;
}

// Generate Excel file
function generateExcelFile() {
  try {
    const applicants = parseCSV(csvContent);
    
    const worksheet = XLSX.utils.json_to_sheet(applicants);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Applicants');
    
    const excelPath = path.join(fixturesDir, 'comprehensive-applicants.xlsx');
    XLSX.writeFile(workbook, excelPath);
    console.log(`✓ Generated Excel file: ${excelPath}`);
    console.log(`  - Contains ${applicants.length} applicants`);
  } catch (error) {
    console.error('Error generating Excel file:', error);
    throw error;
  }
}

// Generate PDF resume samples
function generatePDFResumes() {
  const resumes = [
    {
      filename: 'resume-sarah-chen.pdf',
      content: `
SARAH CHEN
Senior Full Stack Engineer

Contact Information
Email: sarah.chen@techmail.com
Phone: +1-415-555-0101
Location: San Francisco, CA

PROFESSIONAL SUMMARY
Passionate full-stack engineer with 6+ years of experience building scalable web applications. 
Strong focus on clean code and test-driven development. Proven track record of leading teams 
and delivering high-impact projects.

TECHNICAL SKILLS
Languages: JavaScript, TypeScript, Python
Frontend: React, Redux, Next.js, Tailwind CSS
Backend: Node.js, Express, GraphQL, REST APIs
Databases: MongoDB, PostgreSQL, Redis
Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, CI/CD
Tools: Git, Jest, Webpack, Babel

PROFESSIONAL EXPERIENCE

Senior Full Stack Engineer | TechCorp Inc | San Francisco, CA
January 2020 - Present
• Led development of microservices architecture serving 2M+ users with 99.9% uptime
• Implemented CI/CD pipelines using GitHub Actions, reducing deployment time by 60%
• Mentored team of 5 junior developers, conducting code reviews and pair programming sessions
• Architected real-time notification system using WebSockets and Redis pub/sub
• Optimized database queries and API endpoints, improving response time by 45%
• Collaborated with product team on feature planning and technical roadmap

Software Engineer | StartupXYZ | San Francisco, CA
June 2018 - December 2019
• Built React applications with Redux for state management
• Developed RESTful APIs using Node.js and Express
• Implemented authentication and authorization using JWT
• Collaborated with product team on feature planning and user stories
• Participated in agile ceremonies and sprint planning
• Wrote unit and integration tests achieving 85% code coverage

EDUCATION

Bachelor of Science in Computer Science
Massachusetts Institute of Technology (MIT)
Graduated: May 2018
GPA: 3.8/4.0

CERTIFICATIONS
• AWS Certified Solutions Architect - Associate (2021)
• MongoDB Certified Developer (2020)

PROJECTS
• Open Source Contributor: React, Node.js, TypeScript projects (500+ GitHub stars)
• Personal Blog: Built with Next.js and deployed on Vercel
• Tech Talks: Speaker at React Conf 2022 and Node.js Interactive 2021
`
    },
    {
      filename: 'resume-marcus-johnson.pdf',
      content: `
MARCUS JOHNSON
Backend Engineer

Contact: marcus.j@devmail.com | +1-650-555-0102 | LinkedIn: /in/marcusjohnson

SUMMARY
Backend specialist with expertise in building high-performance distributed systems. 
Passionate about infrastructure as code and DevOps practices. 7+ years of experience 
in designing and implementing scalable microservices.

SKILLS
• Languages: Python, Go, SQL
• Frameworks: Django, Flask, FastAPI
• Databases: PostgreSQL, Redis, MongoDB
• Cloud: AWS (ECS, RDS, ElastiCache), GCP
• DevOps: Kubernetes, Docker, Terraform, Ansible
• Monitoring: Prometheus, Grafana, ELK Stack
• Message Queues: RabbitMQ, Kafka

EXPERIENCE

Backend Engineer | CloudSystems Ltd | Palo Alto, CA
March 2019 - Present
• Designed and implemented scalable microservices handling 10M+ requests daily
• Optimized database queries and indexing, reducing response time by 40%
• Led migration from monolith to microservices architecture on Kubernetes
• Implemented caching strategies using Redis, reducing database load by 60%
• Set up monitoring and alerting using Prometheus and Grafana
• Conducted performance testing and optimization using load testing tools
• Mentored junior developers on best practices and code quality

Junior Developer | WebCo | San Jose, CA
August 2017 - February 2019
• Maintained legacy Django applications serving 100K+ users
• Implemented new features and bug fixes based on user feedback
• Participated in code reviews and improved code quality
• Wrote unit tests and integration tests using pytest
• Collaborated with frontend team on API design
• Documented APIs using Swagger/OpenAPI

EDUCATION

Master of Science in Software Engineering
Stanford University | 2017

Bachelor of Science in Computer Science
University of California, Berkeley | 2015

ACHIEVEMENTS
• Reduced infrastructure costs by 35% through optimization and right-sizing
• Improved API response time from 500ms to 120ms average
• Published technical blog posts with 50K+ views
• Contributed to open-source projects: Django, FastAPI, Kubernetes
`
    },
    {
      filename: 'resume-emily-rodriguez.pdf',
      content: `
EMILY RODRIGUEZ
Senior Frontend Developer

📧 emily.r@frontendpro.com | 📱 +1-408-555-0103 | 🌐 emilyrodriguez.dev

ABOUT ME
Frontend engineer specializing in creating beautiful, accessible, and performant user interfaces. 
Strong eye for design and UX best practices. 6+ years of experience building modern web applications.

TECHNICAL EXPERTISE
Frontend Technologies:
• React, Vue.js, Next.js, Nuxt.js
• TypeScript, JavaScript (ES6+)
• HTML5, CSS3, SASS, Tailwind CSS
• Redux, Vuex, Context API
• Webpack, Vite, Rollup

Design & UX:
• Figma, Sketch, Adobe XD
• Responsive Design, Mobile-First
• Accessibility (WCAG 2.1 AA)
• Design Systems, Component Libraries

Testing & Tools:
• Jest, React Testing Library, Cypress
• Git, GitHub Actions, CI/CD
• Chrome DevTools, Lighthouse
• npm, yarn, pnpm

WORK HISTORY

Senior Frontend Developer | DesignHub | Remote
February 2020 - Present
• Created responsive web applications used by 500K+ users across 50+ countries
• Implemented comprehensive design system adopted across 10+ products
• Improved Core Web Vitals scores by 35% through performance optimization
• Led frontend architecture decisions and code review process
• Mentored 3 junior developers on React best practices
• Collaborated with designers to ensure pixel-perfect implementation
• Reduced bundle size by 40% using code splitting and lazy loading

UI Developer | CreativeAgency | San Francisco, CA
July 2018 - January 2020
• Built interactive websites using Vue.js for 20+ clients
• Collaborated with designers to implement pixel-perfect UIs
• Optimized bundle sizes and performance, achieving 90+ Lighthouse scores
• Implemented animations and transitions using CSS and JavaScript
• Ensured cross-browser compatibility and accessibility
• Participated in client meetings and technical discussions

EDUCATION & CERTIFICATIONS

Bachelor of Arts in Digital Media
New York University (NYU) | 2018

Certifications:
• Meta Front-End Developer Professional Certificate (2022)
• Google UX Design Professional Certificate (2021)

NOTABLE PROJECTS
• E-commerce Platform: Built with Next.js, serving 100K+ monthly users
• Design System: Created reusable component library used by 5 teams
• Portfolio Website: Featured on Awwwards and CSS Design Awards
• Open Source: Contributor to React, Tailwind CSS, and Storybook

SPEAKING & WRITING
• Speaker at React Summit 2023: "Building Accessible React Applications"
• Technical Writer: Published 30+ articles on frontend development
• Workshop Instructor: Taught React and TypeScript to 200+ students
`
    },
    {
      filename: 'resume-david-kim.pdf',
      content: `
DAVID KIM, PhD
Machine Learning Engineer

Contact: david.kim@airesearch.com | +1-510-555-0104
Portfolio: davidkim.ai | GitHub: github.com/davidkim

PROFESSIONAL SUMMARY
ML engineer with strong research background. Experienced in taking models from research 
to production. Passionate about responsible AI and ethical ML practices. Published researcher 
with 3 papers in top-tier conferences.

TECHNICAL SKILLS
Machine Learning:
• Deep Learning: TensorFlow, PyTorch, Keras
• Classical ML: Scikit-learn, XGBoost, LightGBM
• NLP: Transformers, BERT, GPT, Hugging Face
• Computer Vision: CNNs, Object Detection, Image Segmentation
• Reinforcement Learning: OpenAI Gym, Stable Baselines

MLOps & Production:
• AWS SageMaker, Azure ML, GCP Vertex AI
• MLflow, Weights & Biases, TensorBoard
• Docker, Kubernetes, Airflow
• Model Serving: TensorFlow Serving, TorchServe, FastAPI

Data Science:
• Python, R, SQL
• Pandas, NumPy, SciPy
• Jupyter, Databricks
• A/B Testing, Statistical Analysis

PROFESSIONAL EXPERIENCE

Machine Learning Engineer | AI Labs Inc | San Francisco, CA
March 2021 - Present
• Built recommendation systems improving user engagement by 25% and revenue by $2M
• Deployed ML models to production using AWS SageMaker with 99.9% uptime
• Conducted A/B tests to validate model performance and business impact
• Implemented MLOps pipelines for automated model training and deployment
• Collaborated with product team to define ML use cases and success metrics
• Mentored junior ML engineers on best practices and model development

Research Assistant | Stanford AI Lab | Stanford, CA
September 2019 - February 2021
• Published 3 papers on neural networks and NLP in top-tier conferences (NeurIPS, ICML)
• Developed novel architectures for text classification achieving state-of-the-art results
• Collaborated with PhD students on research projects and paper writing
• Presented research findings at academic conferences and workshops
• Implemented research code in PyTorch and released open-source implementations

EDUCATION

PhD in Computer Science (Machine Learning)
Carnegie Mellon University | 2021
Dissertation: "Efficient Neural Architectures for Natural Language Understanding"
Advisor: Prof. Jane Smith

Master of Science in Computer Science
Stanford University | 2019

Bachelor of Science in Mathematics
Massachusetts Institute of Technology (MIT) | 2017

PUBLICATIONS
1. Kim, D., et al. (2021). "Efficient Transformers for Text Classification." NeurIPS.
2. Kim, D., et al. (2020). "Few-Shot Learning for NLP Tasks." ICML.
3. Kim, D., et al. (2020). "Attention Mechanisms in Neural Networks." ACL.

AWARDS & HONORS
• Best Paper Award, NeurIPS 2021
• NSF Graduate Research Fellowship, 2017-2020
• MIT Presidential Scholar, 2013-2017
`
    },
    {
      filename: 'resume-priya-patel.pdf',
      content: `
PRIYA PATEL
Data Engineer

📧 priya.patel@dataeng.com | 📱 +1-408-555-0107
🔗 linkedin.com/in/priyapatel | 💻 github.com/priyapatel

PROFESSIONAL PROFILE
Data engineer specializing in building reliable and scalable data infrastructure. 
Experienced with modern data stack and best practices. 5+ years of experience 
in data engineering and analytics.

CORE COMPETENCIES

Data Engineering:
• Python, SQL, Scala
• Apache Spark, Apache Airflow, dbt
• ETL/ELT Pipelines, Data Modeling
• Data Quality, Data Governance

Cloud & Big Data:
• AWS (S3, Redshift, EMR, Glue)
• Snowflake, Databricks
• BigQuery, Azure Synapse
• Kafka, Kinesis

Databases:
• PostgreSQL, MySQL
• MongoDB, Cassandra
• Redis, Elasticsearch

Tools & Practices:
• Git, Docker, Kubernetes
• CI/CD, Infrastructure as Code
• Agile, Scrum
• Data Visualization: Tableau, Looker

PROFESSIONAL EXPERIENCE

Data Engineer | DataCorp | San Francisco, CA
April 2021 - Present
• Built data pipelines processing 100TB+ daily with 99.9% reliability
• Implemented data quality checks reducing errors by 80% and improving trust
• Optimized ETL jobs improving performance by 3x and reducing costs by 40%
• Designed dimensional data models for analytics and reporting
• Migrated legacy ETL processes to modern data stack (Airflow + dbt + Snowflake)
• Collaborated with data scientists and analysts on data requirements
• Documented data pipelines and created data dictionaries

Analytics Engineer | FinTech Startup | San Jose, CA
June 2019 - March 2021
• Developed SQL queries for business intelligence and reporting
• Created dashboards in Tableau used by 50+ stakeholders
• Maintained data warehouse and ensured data accuracy
• Implemented dbt models for data transformation
• Automated reporting processes saving 20 hours/week
• Worked with product team to define metrics and KPIs

EDUCATION

Master of Science in Data Science
University of California, Berkeley | 2019
Relevant Coursework: Machine Learning, Big Data Analytics, Statistical Inference

Bachelor of Science in Statistics
University of California, Los Angeles (UCLA) | 2017

CERTIFICATIONS
• AWS Certified Data Analytics - Specialty (2022)
• Snowflake SnowPro Core Certification (2021)
• dbt Analytics Engineering Certification (2021)

PROJECTS & CONTRIBUTIONS
• Open Source: Contributor to Apache Airflow and dbt
• Technical Blog: Published 20+ articles on data engineering
• Mentorship: Mentored 5 junior data engineers through ADPList
• Community: Organizer of Bay Area Data Engineering Meetup (500+ members)

TECHNICAL ACHIEVEMENTS
• Reduced data pipeline runtime from 8 hours to 2 hours
• Improved data quality from 85% to 99% accuracy
• Built real-time data pipeline processing 1M events/minute
• Designed data architecture supporting 100+ data sources
`
    }
  ];

  resumes.forEach(resume => {
    const pdfPath = path.join(fixturesDir, resume.filename);
    fs.writeFileSync(pdfPath, resume.content, 'utf-8');
    console.log(`✓ Generated PDF resume: ${resume.filename}`);
  });

  console.log(`  - Total PDF resumes: ${resumes.length}`);
}

// Main execution
async function main() {
  try {
    console.log('🚀 Generating comprehensive test files...\n');
    
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    
    console.log('📊 Generating Excel file...');
    generateExcelFile();
    
    console.log('\n📄 Generating PDF resumes...');
    generatePDFResumes();
    
    console.log('\n✅ All comprehensive test files generated successfully!');
    console.log('\n📁 Files created:');
    console.log('   - comprehensive-applicants.csv (18 applicants)');
    console.log('   - comprehensive-applicants.xlsx (18 applicants)');
    console.log('   - resume-sarah-chen.pdf');
    console.log('   - resume-marcus-johnson.pdf');
    console.log('   - resume-emily-rodriguez.pdf');
    console.log('   - resume-david-kim.pdf');
    console.log('   - resume-priya-patel.pdf');
    console.log('\n🎯 Ready for testing!');
  } catch (error) {
    console.error('❌ Error generating test files:', error);
    process.exit(1);
  }
}

main();
