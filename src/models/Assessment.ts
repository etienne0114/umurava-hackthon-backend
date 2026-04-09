import mongoose, { Schema, Document } from 'mongoose';

export interface IAssessment extends Document {
  jobId: mongoose.Types.ObjectId;
  applicantId: mongoose.Types.ObjectId;
  talentUserId?: mongoose.Types.ObjectId;
  questions: Array<{
    question: string;
    options: string[];
    correctOptionIndex: number;
    expectedAnswer: string;
  }>;
  candidateAnswers: Array<{
    question: string;
    answer: string;
    selectedOptionIndex?: number;
  }>;
  grading?: {
    totalScore?: number;
    perQuestion?: Array<{
      question: string;
      score: number;
      feedback: string;
    }>;
    overallFeedback?: string;
    provider?: string;
    model?: string;
    gradedAt?: Date;
  };
  status: 'pending' | 'completed' | 'expired';
  timePerQuestionSeconds?: number;
  timeLimitSeconds?: number;
  startedAt?: Date;
  timedOut?: boolean;
  dueAt?: Date;
  expiresAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssessmentSchema = new Schema<IAssessment>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    applicantId: {
      type: Schema.Types.ObjectId,
      ref: 'Applicant',
      required: true,
    },
    talentUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    questions: [
      {
        question: { type: String, required: true },
        options: { type: [String], required: true },
        correctOptionIndex: { type: Number, required: true, min: 0 },
        expectedAnswer: { type: String, required: true },
      },
    ],
    candidateAnswers: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
        selectedOptionIndex: { type: Number },
      },
    ],
    grading: {
      totalScore: Number,
      perQuestion: [
        {
          question: { type: String, required: true },
          score: { type: Number, required: true },
          feedback: { type: String, required: true },
        },
      ],
      overallFeedback: String,
      provider: String,
      model: String,
      gradedAt: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending',
    },
    timePerQuestionSeconds: { type: Number, default: 60 },
    timeLimitSeconds: { type: Number },
    startedAt: Date,
    timedOut: { type: Boolean, default: false },
    dueAt: Date,
    expiresAt: Date,
    submittedAt: Date,
  },
  { timestamps: true }
);

AssessmentSchema.index({ jobId: 1, applicantId: 1 });
AssessmentSchema.index({ talentUserId: 1, createdAt: -1 });

export const Assessment = mongoose.model<IAssessment>('Assessment', AssessmentSchema);
