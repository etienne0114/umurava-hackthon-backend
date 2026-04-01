import mongoose, { Schema, Document } from 'mongoose';
import { JobRequirements, WeightConfig, JobStatus, ScreeningStatus } from '../types';

export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship';
export type WorkMode = 'remote' | 'on-site' | 'hybrid';

export interface IJob extends Document {
  title: string;
  description: string;
  company?: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  requirements: JobRequirements;
  weights: WeightConfig;
  status: JobStatus;
  applicantCount: number;
  screeningStatus?: ScreeningStatus;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Job description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    company: {
      type: String,
      trim: true,
    },
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship'],
      default: 'full-time',
    },
    workMode: {
      type: String,
      enum: ['remote', 'on-site', 'hybrid'],
      default: 'on-site',
    },
    requirements: {
      skills: {
        type: [String],
        required: [true, 'At least one skill is required'],
        validate: {
          validator: (v: string[]) => v.length > 0,
          message: 'Skills array cannot be empty',
        },
      },
      experience: {
        minYears: {
          type: Number,
          required: true,
          min: [0, 'Minimum years cannot be negative'],
        },
        maxYears: {
          type: Number,
          min: [0, 'Maximum years cannot be negative'],
        },
      },
      education: {
        type: [String],
        default: [],
      },
      location: String,
    },
    weights: {
      skills: {
        type: Number,
        required: true,
        min: [0, 'Weight must be between 0 and 1'],
        max: [1, 'Weight must be between 0 and 1'],
        default: 0.4,
      },
      experience: {
        type: Number,
        required: true,
        min: [0, 'Weight must be between 0 and 1'],
        max: [1, 'Weight must be between 0 and 1'],
        default: 0.3,
      },
      education: {
        type: Number,
        required: true,
        min: [0, 'Weight must be between 0 and 1'],
        max: [1, 'Weight must be between 0 and 1'],
        default: 0.2,
      },
      relevance: {
        type: Number,
        required: true,
        min: [0, 'Weight must be between 0 and 1'],
        max: [1, 'Weight must be between 0 and 1'],
        default: 0.1,
      },
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed'],
      default: 'draft',
    },
    applicantCount: {
      type: Number,
      default: 0,
      min: [0, 'Applicant count cannot be negative'],
    },
    screeningStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
    },
    createdBy: String,
  },
  { timestamps: true }
);

JobSchema.pre('save', function (next) {
  const weightSum = this.weights.skills + this.weights.experience + 
                    this.weights.education + this.weights.relevance;
  
  if (Math.abs(weightSum - 1.0) > 0.001) {
    return next(new Error(`Weights must sum to 1.0, got ${weightSum}`));
  }
  
  next();
});

JobSchema.index({ status: 1 });
JobSchema.index({ createdAt: -1 });

export const Job = mongoose.model<IJob>('Job', JobSchema);
