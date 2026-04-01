import mongoose, { Schema, Document } from 'mongoose';
import { ExperienceEntry, EducationEntry, ApplicantSource } from '../types';

export interface IApplicant extends Document {
  jobId: mongoose.Types.ObjectId;
  source: ApplicantSource;
  sourceId?: string;
  profile: {
    name: string;
    email: string;
    phone?: string;
    skills: string[];
    experience: ExperienceEntry[];
    education: EducationEntry[];
    summary?: string;
    resumeUrl?: string;
  };
  metadata?: {
    fileName?: string;
    uploadedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceSchema = new Schema<ExperienceEntry>({
  title: { type: String, required: true },
  company: { type: String, required: true },
  duration: { type: String, required: true },
  description: String,
}, { _id: false });

const EducationSchema = new Schema<EducationEntry>({
  degree: { type: String, required: true },
  institution: { type: String, required: true },
  year: { type: String, required: true },
}, { _id: false });

const ApplicantSchema = new Schema<IApplicant>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: [true, 'Job ID is required'],
    },
    source: {
      type: String,
      enum: ['umurava', 'upload'],
      required: true,
    },
    sourceId: String,
    profile: {
      name: {
        type: String,
        required: [true, 'Applicant name is required'],
        trim: true,
      },
      email: {
        type: String,
        required: [true, 'Email is required'],
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      },
      phone: String,
      skills: {
        type: [String],
        default: [],
      },
      experience: {
        type: [ExperienceSchema],
        default: [],
      },
      education: {
        type: [EducationSchema],
        default: [],
      },
      summary: String,
      resumeUrl: String,
    },
    metadata: {
      fileName: String,
      uploadedAt: Date,
    },
  },
  { timestamps: true }
);

ApplicantSchema.index({ jobId: 1 });
ApplicantSchema.index({ jobId: 1, 'profile.email': 1 }, { unique: true });

ApplicantSchema.pre('save', function (next) {
  if (this.source === 'umurava' && !this.sourceId) {
    return next(new Error('sourceId is required when source is umurava'));
  }
  next();
});

export const Applicant = mongoose.model<IApplicant>('Applicant', ApplicantSchema);
