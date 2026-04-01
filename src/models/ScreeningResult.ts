import mongoose, { Schema, Document } from 'mongoose';
import { Recommendation } from '../types';

export interface IScreeningResult extends Document {
  applicantId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  sessionId: mongoose.Types.ObjectId;
  rank: number;
  matchScore: number;
  evaluation: {
    strengths: string[];
    gaps: string[];
    risks: string[];
    recommendation: Recommendation;
    reasoning: string;
  };
  scoreBreakdown: {
    skills: number;
    experience: number;
    education: number;
    relevance: number;
  };
  geminiResponse?: {
    rawResponse: string;
    model: string;
    tokensUsed?: number;
  };
  createdAt: Date;
}

const ScreeningResultSchema = new Schema<IScreeningResult>(
  {
    applicantId: {
      type: Schema.Types.ObjectId,
      ref: 'Applicant',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ScreeningSession',
      required: true,
    },
    rank: {
      type: Number,
      required: true,
      min: [1, 'Rank must be positive'],
    },
    matchScore: {
      type: Number,
      required: true,
      min: [0, 'Match score must be between 0 and 100'],
      max: [100, 'Match score must be between 0 and 100'],
    },
    evaluation: {
      strengths: {
        type: [String],
        required: true,
        validate: {
          validator: (v: string[]) => v.length > 0,
          message: 'Strengths array cannot be empty',
        },
      },
      gaps: {
        type: [String],
        default: [],
      },
      risks: {
        type: [String],
        default: [],
      },
      recommendation: {
        type: String,
        enum: ['highly_recommended', 'recommended', 'consider', 'not_recommended'],
        required: true,
      },
      reasoning: {
        type: String,
        required: true,
        minlength: [50, 'Reasoning must be at least 50 characters'],
      },
    },
    scoreBreakdown: {
      skills: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      experience: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      education: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      relevance: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
    },
    geminiResponse: {
      rawResponse: String,
      model: String,
      tokensUsed: Number,
    },
  },
  { timestamps: true }
);

ScreeningResultSchema.index({ jobId: 1, rank: 1 });
ScreeningResultSchema.index({ sessionId: 1 });
ScreeningResultSchema.index({ applicantId: 1 });

export const ScreeningResult = mongoose.model<IScreeningResult>(
  'ScreeningResult',
  ScreeningResultSchema
);
