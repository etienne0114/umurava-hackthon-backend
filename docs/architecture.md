# System Architecture

This document provides an overview of the AI-powered recruitment screening platform architecture.

## High-Level Architecture

The platform follows a three-tier architecture:

1. **Frontend Layer**: Next.js application with Redux state management
2. **Backend Layer**: Node.js + Express REST API
3. **Data Layer**: MongoDB database + Gemini AI API

## 1-Page Architecture Diagram (ASCII)

```
┌──────────────────────────────┐        HTTPS        ┌──────────────────────────────┐
│ Recruiter/Talent (Browser)   │  <--------------->  │ Next.js Frontend (Redux)     │
└──────────────────────────────┘                     └──────────────┬───────────────┘
                                                                    │ REST /api
                                                                    v
                                                   ┌────────────────────────────────┐
                                                   │ Node.js + Express Backend       │
                                                   │ Auth/JWT, Routes, Services      │
                                                   └──────────────┬─────────────────┘
                                                                  │
                     ┌───────────────────────────────┬────────────┼──────────────┬───────────────────────┐
                     │                               │            │              │                       │
                     v                               v            v              v                       v
           ┌─────────────────────┐         ┌────────────────┐  ┌────────────┐  ┌────────────────┐  ┌──────────────────┐
           │ MongoDB             │         │ Gemini API     │  │ Groq API   │  │ File Parsing   │  │ Umurava API      │
           │ Jobs/Applicants/    │         │ (LLM)          │  │ (Fallback) │  │ CSV/Excel/PDF  │  │ Talent Profiles  │
           │ Results/Notifs      │         └────────────────┘  └────────────┘  └────────────────┘  └──────────────────┘
           └─────────────────────┘

Key Flows:
1) Upload CSV/Excel/PDF -> File Parsing -> Applicant records in MongoDB
2) Screening -> Gemini (batch) -> Ranked Results -> Stored in MongoDB
3) Notifications -> MongoDB -> Frontend bell dropdown
```

## Component Overview

### Backend Components
- **Job Service**: Manages job postings
- **Applicant Service**: Handles applicant ingestion from multiple sources
- **Screening Service**: Orchestrates AI-powered candidate evaluation
- **Gemini Service**: Interfaces with Gemini API
- **File Service**: Parses CSV, Excel, and PDF files
- **Umurava Service**: Integrates with Umurava Platform API

### Frontend Components
- **Redux Store**: Centralized state management
- **Job Components**: Job creation, listing, and management
- **Applicant Components**: File upload and Umurava import
- **Screening Components**: Results visualization and AI reasoning display

## Data Flow

1. Recruiter creates job posting
2. Applicants are uploaded or imported
3. Screening process is triggered
4. Gemini API evaluates each candidate
5. Results are ranked and stored
6. Recruiter views shortlist with AI reasoning

## Security Architecture

The platform implements a multi-layered security strategy:
- **API Security**: Authentication via JWT and secure route protection.
- **Data Protection**: Input validation, sanitization, and Mongoose schema-level validation.
- **Rate Limiting**: Protection against DDoS and brute force attacks on key endpoints.
- **Environment Management**: Separation of secrets via environment variables and production-ready configurations.
- **AI Safety**: Sanitized prompt building and validation of AI-generated responses.

## Performance Optimization

Key performance features include:
- **Next.js Server Components**: Optimized initial page loads and reduced client-side JavaScript.
- **Image Optimization**: Automatic image resizing and lazy loading.
- **Database Indexing**: Optimized MongoDB queries for job and applicant retrieval.
- **AI Batching**: Efficient parallel processing of candidate evaluations with rate limit management.
- **Caching**: Intelligent caching of AI evaluations to reduce redundant API calls and latency.

## Accessibility and Responsiveness

The system is designed to be inclusive and accessible:
- **WCAG 2.1 Compliance**: High contrast ratios, aria-labels, and keyboard navigation.
- **Responsive Layouts**: Fluid design that adapts from mobile (breakpoints at 320px) to large desktops.
- **Progressive Enhancement**: Functional core with enhanced features for modern browsers.
