#!/bin/bash

# Manual E2E Workflow Test Script
# This script tests the complete recruitment screening workflow manually

set -e

BASE_URL="http://localhost:5000"
API_URL="$BASE_URL/api"

echo "==================================="
echo "E2E Workflow Manual Test"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/health")
echo "Response: $HEALTH_RESPONSE"
echo -e "${GREEN}✓ Health check passed${NC}"
echo ""

# Test 2: Create Job
echo -e "${YELLOW}Test 2: Create Job${NC}"
JOB_DATA='{
  "title": "Senior Full Stack Developer",
  "description": "We are looking for an experienced full stack developer with strong JavaScript skills and experience in modern web technologies.",
  "requirements": {
    "skills": ["JavaScript", "React", "Node.js", "TypeScript", "MongoDB"],
    "experience": {
      "minYears": 5,
      "maxYears": 10
    },
    "education": ["Bachelor of Science in Computer Science"],
    "location": "Remote"
  },
  "weights": {
    "skills": 0.4,
    "experience": 0.3,
    "education": 0.1,
    "relevance": 0.2
  },
  "status": "active"
}'

JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -d "$JOB_DATA")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.data._id')
echo "Job ID: $JOB_ID"
echo -e "${GREEN}✓ Job created successfully${NC}"
echo ""

# Test 3: Upload Applicants (CSV)
echo -e "${YELLOW}Test 3: Upload Applicants from CSV${NC}"
UPLOAD_RESPONSE=$(curl -s -X POST "$API_URL/applicants/upload" \
  -F "jobId=$JOB_ID" \
  -F "file=@../../../docs/sample-applicants.csv")

APPLICANT_COUNT=$(echo $UPLOAD_RESPONSE | jq -r '.data.applicants | length')
echo "Applicants uploaded: $APPLICANT_COUNT"
echo -e "${GREEN}✓ Applicants uploaded successfully${NC}"
echo ""

# Test 4: List Applicants
echo -e "${YELLOW}Test 4: List Applicants${NC}"
APPLICANTS_RESPONSE=$(curl -s "$API_URL/applicants?jobId=$JOB_ID")
TOTAL_APPLICANTS=$(echo $APPLICANTS_RESPONSE | jq -r '.data | length')
echo "Total applicants: $TOTAL_APPLICANTS"
echo -e "${GREEN}✓ Applicants retrieved successfully${NC}"
echo ""

# Test 5: Start Screening
echo -e "${YELLOW}Test 5: Start AI Screening${NC}"
SCREENING_DATA="{
  \"jobId\": \"$JOB_ID\",
  \"options\": {
    \"topN\": 10,
    \"minScore\": 0
  }
}"

SCREENING_RESPONSE=$(curl -s -X POST "$API_URL/screening/start" \
  -H "Content-Type: application/json" \
  -d "$SCREENING_DATA")

SESSION_ID=$(echo $SCREENING_RESPONSE | jq -r '.data._id')
echo "Session ID: $SESSION_ID"
echo -e "${GREEN}✓ Screening started successfully${NC}"
echo ""

# Test 6: Poll for Screening Status
echo -e "${YELLOW}Test 6: Monitor Screening Progress${NC}"
MAX_ATTEMPTS=24
ATTEMPT=0
STATUS="processing"

while [ "$STATUS" = "processing" ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  sleep 5
  STATUS_RESPONSE=$(curl -s "$API_URL/screening/session/$SESSION_ID")
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.data.status')
  PROCESSED=$(echo $STATUS_RESPONSE | jq -r '.data.processedApplicants')
  TOTAL=$(echo $STATUS_RESPONSE | jq -r '.data.totalApplicants')
  
  echo "Progress: $PROCESSED/$TOTAL applicants processed (Status: $STATUS)"
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$STATUS" = "completed" ]; then
  echo -e "${GREEN}✓ Screening completed successfully${NC}"
else
  echo -e "${RED}✗ Screening did not complete (Status: $STATUS)${NC}"
fi
echo ""

# Test 7: Get Screening Results
echo -e "${YELLOW}Test 7: Retrieve Screening Results${NC}"
RESULTS_RESPONSE=$(curl -s "$API_URL/screening/results/$JOB_ID")
RESULT_COUNT=$(echo $RESULTS_RESPONSE | jq -r '.data | length')
echo "Results retrieved: $RESULT_COUNT"

if [ $RESULT_COUNT -gt 0 ]; then
  echo ""
  echo "Top 3 Candidates:"
  echo $RESULTS_RESPONSE | jq -r '.data[0:3] | .[] | "Rank \(.rank): \(.applicant.profile.name) - Score: \(.matchScore)"'
  echo -e "${GREEN}✓ Results retrieved successfully${NC}"
else
  echo -e "${RED}✗ No results found${NC}"
fi
echo ""

# Test 8: Get Job Details
echo -e "${YELLOW}Test 8: Get Job Details${NC}"
JOB_DETAILS=$(curl -s "$API_URL/jobs/$JOB_ID")
SCREENING_STATUS=$(echo $JOB_DETAILS | jq -r '.data.screeningStatus')
echo "Job screening status: $SCREENING_STATUS"
echo -e "${GREEN}✓ Job details retrieved${NC}"
echo ""

# Summary
echo "==================================="
echo -e "${GREEN}E2E Workflow Test Complete!${NC}"
echo "==================================="
echo ""
echo "Summary:"
echo "- Job ID: $JOB_ID"
echo "- Applicants: $TOTAL_APPLICANTS"
echo "- Session ID: $SESSION_ID"
echo "- Screening Status: $STATUS"
echo "- Results: $RESULT_COUNT"
echo ""
echo "To view results in browser:"
echo "http://localhost:3000/screening/$JOB_ID"
