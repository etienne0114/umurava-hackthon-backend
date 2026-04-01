import mongoose, { Schema, Document } from 'mongoose';
import { WeightConfig, SessionStatus } from '../types';

export interface IScreeningSession extends Document {
  jobId: mongoose.Types.ObjectId;
  status: SessionStatus;
  totalApplicants: number;
  processedApplicants: number;
  options: {
    topN: number;
    minScore: number;
    weights: WeightConfig;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const ScreeningSessionSchema = new Schema<IScreeningSession>({
  jobId: {
    type: Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  totalApplicants: {
    type: Number,
    required: true,
    min: [0, 'Total applicants cannot be negative'],
  },
  processedApplicants: {
    type: Number,
    default: 0,
    min: [0, 'Processed applicants cannot be negative'],
  },
  options: {
    topN: {
      type: Number,
      required: true,
      min: [1, 'topN must be at least 1'],
      default: 20,
    },
    minScore: {
      type: Number,
      required: true,
      min: [0, 'minScore must be between 0 and 100'],
      max: [100, 'minScore must be between 0 and 100'],
      default: 0,
    },
    weights: {
      skills: { type: Number, required: true },
      experience: { type: Number, required: true },
      education: { type: Number, required: true },
      relevance: { type: Number, required: true },
    },
  },
  error: String,
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
});

ScreeningSessionSchema.pre('save', function (next) {
  if (this.processedApplicants > this.totalApplicants) {
    return next(new Error('Processed applicants cannot exceed total applicants'));
  }
  
  if (this.status === 'failed' && !this.error) {
    return next(new Error('Error message is required when status is failed'));
  }
  
  next();
});

ScreeningSessionSchema.index({ jobId: 1, startedAt: -1 });

export const ScreeningSession = mongoose.model<IScreeningSession>(
  'ScreeningSession',
  ScreeningSessionSchema
);
