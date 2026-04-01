# AI Decision Flow

This document explains the end-to-end logic used by the platform to evaluate and rank candidates using the Gemini AI model.

## 1. Input Processing

### Selection & Weights
When a recruiter initiates a screening session, they define the specific weights for:
- **Skills Match** (Decimal, 0-1)
- **Experience Match** (Decimal, 0-1)
- **Education Match** (Decimal, 0-1)
- **Overall Relevance** (Decimal, 0-1)
The sum of these weights MUST be 1.0.

### Context Building
The system compiles a comprehensive context for the AI, combining the job requirements (title, skills, experience range, etc.) with the applicant's profile (skills, resume summary, education history, and professional achievements).

---

## 2. AI Evaluation (Gemini Integration)

### Objective Analysis
The Gemini model processes the provided context and performs a semantic analysis of the candidate's profile against the job requirements. It identifies:
- **Strengths**: Specific evidence of required skills and achievements.
- **Gaps**: Missing skills or insufficient experience in key areas.
- **Risks**: Potential mismatches in career trajectory or expectations.

### Scoring Mechanism
The model assigns a score from 0-100 for each of the four categories:
1. **Skills Score**: Measures technical proficiency and tool mastery.
2. **Experience Score**: Evaluates the depth and relevance of past roles.
3. **Education Score**: Assesses academic background and certifications.
4. **Relevance Score**: Measures the overall alignment with the job's context and industry.

### Explainable Reasoning
For every candidate, the AI generates a detailed textual justification (at least 150 words). This reasoning explains *why* the scores were assigned, providing transparency and helping recruiters make informed decisions.

---

## 3. Post-Processing & Ranking

### Match Score Calculation
The backend receives the scores from Gemini and calculates the final **Match Score** using the recruiter's predefined weights:

```typescript
matchScore = (skillsScore * skillsWeight) +
             (experienceScore * experienceWeight) +
             (educationScore * educationWeight) +
             (relevanceScore * relevanceWeight)
```

### Result Persistence
The resulting `ScreeningResult` is stored in MongoDB, including the rank, match score, score breakdown, and the AI's qualitative insights (strengths, gaps, reasoning).

### Shortlist Generation
The platform automatically ranks candidates by their Match Score. Recruiters can then view the top candidates (Top N) in a prioritized list, complete with AI-generated explainability.

---

## 4. Human-in-the-Control

The AI is designed to augment, not replace, the recruiter. The final decision remains with the human user, who uses the AI-generated scores and reasoning as a data-driven starting point for their shortlisting process.
