# API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Response Format

All API responses follow this standard format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Success message"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}
```

## Authentication API

### Register
**POST** `/auth/register`

Create a new user account (talent or company).

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123",
  "role": "company",
  "name": "John Doe",
  "phone": "+1234567890",
  "company": "Acme Corp",
  "position": "HR Manager"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "email": "john@example.com",
      "role": "company",
      "profile": {
        "name": "John Doe",
        "phone": "+1234567890",
        "company": "Acme Corp",
        "position": "HR Manager"
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Registration successful"
}
```

### Login
**POST** `/auth/login`

Authenticate and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "email": "john@example.com",
      "role": "company",
      "profile": { ... }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

### Get Profile
**GET** `/auth/profile`

Get current user profile (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "email": "john@example.com",
    "role": "company",
    "profile": {
      "name": "John Doe",
      "phone": "+1234567890",
      "company": "Acme Corp",
      "position": "HR Manager"
    },
    "isVerified": false
  }
}
```

### Update Profile
**PUT** `/auth/profile`

Update user profile (requires authentication).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "John Smith",
  "phone": "+1234567891",
  "bio": "Experienced HR professional"
}
```

## Jobs API

### Create Job
**POST** `/jobs`

Create a new job posting.

**Request Body:**
```json
{
  "title": "Senior Software Engineer",
  "description": "We are looking for an experienced software engineer...",
  "requiredSkills": ["JavaScript", "React", "Node.js"],
  "experienceLevel": "senior",
  "educationLevel": "bachelors",
  "weights": {
    "skills": 0.4,
    "experience": 0.3,
    "education": 0.1,
    "relevance": 0.2
  },
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
    "title": "Senior Software Engineer",
    ...
  }
}
```

### Get All Jobs
**GET** `/jobs?status=active&limit=10&offset=0`

**Query Parameters:**
- `status` (optional): Filter by status (draft, active, closed)
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

### Get Job by ID
**GET** `/jobs/:jobId`

### Update Job
**PUT** `/jobs/:jobId`

**Request Body:** Same as Create Job (all fields optional)

### Delete Job
**DELETE** `/jobs/:jobId`

## Applicants API

### Upload Applicants from File
**POST** `/applicants/upload`

Upload applicants from CSV, Excel, or PDF file.

**Content-Type:** `multipart/form-data`

**Form Data:**
- `jobId`: Job ID (string)
- `file`: File to upload (CSV, XLSX, or PDF)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k2",
      "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "profile": {
        "name": "John Doe",
        "email": "john@example.com",
        ...
      },
      "source": "upload"
    }
  ]
}
```

### Import from Umurava
**POST** `/applicants/import`

Import talent profiles from Umurava platform.

**Request Body:**
```json
{
  "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "profileIds": ["profile1", "profile2"]
}
```

### Get Applicants
**GET** `/applicants?jobId=xxx&limit=50&offset=0`

**Query Parameters:**
- `jobId` (required): Filter by job ID
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

### Get Applicant by ID
**GET** `/applicants/:applicantId`

### Update Applicant
**PUT** `/applicants/:applicantId`

### Delete Applicant
**DELETE** `/applicants/:applicantId`

## Screening API

### Start Screening
**POST** `/screening/start`

Start AI-powered screening process for a job.

**Request Body:**
```json
{
  "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "options": {
    "topN": 20,
    "minScore": 60,
    "weights": {
      "skills": 0.4,
      "experience": 0.3,
      "education": 0.1,
      "relevance": 0.2
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "session123",
    "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "status": "processing",
    "totalApplicants": 50,
    "processedApplicants": 0,
    "startedAt": "2026-03-31T10:00:00Z"
  }
}
```

### Get Screening Status
**GET** `/screening/session/:sessionId`

Poll this endpoint to check screening progress.

### Get Screening Results
**GET** `/screening/results/:jobId?limit=20`

**Query Parameters:**
- `limit` (optional): Number of top results (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "result123",
      "applicantId": { ... },
      "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "rank": 1,
      "matchScore": 92.5,
      "evaluation": {
        "strengths": ["Strong technical skills", "Relevant experience"],
        "gaps": ["Limited leadership experience"],
        "risks": [],
        "recommendation": "strong_yes",
        "reasoning": "Excellent match for the role..."
      },
      "scoreBreakdown": {
        "skills": 95,
        "experience": 90,
        "education": 85,
        "relevance": 100
      }
    }
  ]
}
```

### Regenerate Screening
**POST** `/screening/regenerate`

Re-run screening for specific applicants or entire job.

**Request Body:**
```json
{
  "jobId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "applicantIds": ["applicant1", "applicant2"]
}
```

## Error Codes

- `400` - Bad Request (validation error)
- `404` - Resource Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (Gemini API error)

## Rate Limiting

- Gemini API: 5 concurrent requests maximum
- File uploads: 10MB for CSV/Excel, 5MB for PDF
- API endpoints: 100 requests per minute per IP

## File Format Requirements

### CSV Format
```csv
name,email,phone,skills,experience,education
John Doe,john@example.com,+1234567890,"JavaScript,React,Node.js","Senior Developer at TechCorp (2020-2023)","BS Computer Science, MIT (2016)"
```

### Excel Format
Same columns as CSV, first row must be headers.

### PDF Format
Resume in standard format with clear sections for contact info, skills, experience, and education.
