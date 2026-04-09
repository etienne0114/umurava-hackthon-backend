# AI Prompt Strategy

This document details the prompt engineering strategies used to interface with the Google Gemini API for candidate screening and resume parsing.

## 1. Candidate Evaluation Prompt

The primary objective is to evaluate a candidate's suitability for a specific job role based on their profile data.

### System Role
The AI is instructed to act as an "expert recruitment assistant specialized in the African tech market," emphasizing objectivity, ethical evaluation, and bias mitigation.

### Context Injection
We provide the following context to the model:
- **Job Details**: Title, description, skills required, experience range, and education requirements.
- **Candidate Profile**: Name, skills, experience history, education, and professional summary.
- **Weights**: Explicitly defined percentage weights for Skills, Experience, Education, and Relevance to guide the scoring.

### Strategy: Chain-of-Thought Reasoning
The prompt requires the model to provide a "comprehensive summary (at least 150 words) justifying the scores based on specific evidence in the profile vs the job needs." This forces the model to articulate its reasoning before reaching its final score, improving accuracy and providing transparency for recruiters.

### Output Constraints
- **Format**: JSON only to facilitate seamless backend parsing.
- **Fields**: 
    - `skillsScore`, `experienceScore`, `educationScore`, `relevanceScore` (0-100).
    - `strengths`, `gaps`, `risks` (Arrays of strings).
    - `recommendation` (Categorical: highly_recommended, recommended, consider, not_recommended).
    - `reasoning` (Detailed textual explanation).

---

## 2. Multi-Candidate Batch Evaluation

For performance and consistency, the system can evaluate a small batch of candidates in a single prompt. This improves throughput and ensures the AI compares applicants under identical job context.

### Strategy: Batch JSON Array
The prompt contains:
- A single, shared job context block.
- A JSON array of candidates (id, skills, experience summary, education summary, and profile summary).

The model must return a JSON array where each entry includes the candidate id, scores, and reasoning. If the batch output is invalid or incomplete, the system gracefully falls back to per-candidate evaluation.

---

## 3. Resume Parsing Prompt

Used when a candidate uploads a PDF, CSV, or plain text file to extract structured profile data.

### Strategy: Zero-Shot Extraction
The model is provided with the raw text from the document and instructed to extract fields into a JSON structure including:
- Name and contact info.
- Skills (list).
- Experience (structured with title, company, duration, and description).
- Education (structured with degree, institution, and year).
- Professional bio/summary.

---

## 4. Bias Mitigation and Safety

To ensure fair and ethical screenings:
1. **Demographic Neutrality**: The system is instructed to ignore demographic indicators and focus strictly on competence.
2. **Preamble Removal**: We enforce a strict "JSON ONLY" output to prevent the model from adding conversational filler that could interfere with parsing.
3. **Data Sanitization**: All candidate data is sanitized before being sent to the Gemini API to prevent prompt injection or leakage of sensitive system instructions.
