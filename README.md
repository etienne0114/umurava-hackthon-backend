# Umurava AI Hackathon | Recruitment Screening Platform - Backend

The intelligent Node.js and Express REST API designed for high-fidelity candidate evaluation and recruiter workflow automation. This platform leverages the Google Gemini API to identify top talent with objective, explainable AI reasoning.

---

## 🚀 Key Features

### 1. AI-Powered Candidate Screening
Orchestrating the core intelligence layer using the **Gemini API**. The backend handles context-aware candidate assessment based on recruiter-defined weights for Skills, Experience, Education, and Relevance.

### 2. Multi-Format Applicant Ingestion
The system supports multiple ingestion streams:
- **PDF/CSV/Excel Parsing**: Intelligent text extraction and normalization of resume data (PDF resumes supported; CSV/Excel rows are treated as individual applicants).
- **Umurava Platform Import**: Direct interface with the Umurava talent ecosystem.

### 3. Explainable AI Reasoning
Every screening result is accompanied by a detailed, evidence-based justification, highlighting strengths, gaps, and potential risks, ensuring humans stay in control of the hiring decision.

---

## 🏗️ Technical Architecture

### Tech Stack
- **Server**: Node.js + Express
- **Database**: MongoDB (Mongoose)
- **AI Engine**: Google Gemini API
- **Language**: TypeScript
- **Security**: JWT + Passport.js (Secure route protection)
- **Validation**: Mongoose-level constraints + Joi

### AI Decision Flow
The backend follows a strict **Context -> Evaluation -> Scoring -> Ranking** logic. You can find a deep dive into the scoring mechanisms and prompt engineering in the internal documentation:
- **[AI Prompt Strategy](./docs/ai-prompt-strategy.md)**
- **[AI Decision Flow](./docs/ai-decision-flow.md)**
- **[Database Schema](./docs/database-schema.md)**

### AI Decision Flow Summary
Job requirements and candidate profiles are sent to Gemini with explicit weightings. The model returns structured scores and reasoning, the backend computes a weighted match score, and candidates are ranked and stored with explainability for recruiter review.

---

## 🛠️ Setup & Environment Configuration

### Prerequisites
- Node.js 18.x+
- MongoDB instance (Local or Atlas)
- Google Gemini API Key

### Environment Variables
Create a `.env` file in the `backend/` root:
```env
PORT=5000
MONGODB_URI=your_mondodb_uri
GEMINI_API_KEY=your_gemini_key
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your_jwt_secret
```

### Installation & Execution
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test
```

---

## 📖 Detailed Documentation

The following internal guides provide complete technical details:
- **[Full API Reference](./docs/api-documentation.md)**
- **[Architecture Overview](./docs/architecture.md)**
- **[Database Schema](./docs/database-schema.md)**
- **[AI Decision Flow](./docs/ai-decision-flow.md)**
- **[AI Prompt Strategy](./docs/ai-prompt-strategy.md)**

---

## ⚖️ Ethics & Bias Mitigation

To ensure fairness, our AI strategy explicitly instructs the model to ignore demographic indicators and focus strictly on professional competence and objective evidence in candidate profiles.

---

## 👤 Human-in-Control
AI recommendations are advisory. Recruiters always make the final hiring decision. The system highlights strengths, gaps, and risks to support human judgment rather than replace it.

---

## ✅ Assumptions & Limitations
- PDF uploads are treated as one candidate per file.
- CSV/Excel ingestion expects one candidate per row.
- AI output quality depends on the completeness of job requirements and candidate profiles.

---

## 📝 License
Built for the Umurava AI Hackathon. Distributed under the MIT License.
