import mongoose, { Schema, Document } from 'mongoose';
import {
  ExperienceEntry,
  EducationEntry,
  ApplicantSource,
  SkillEntry,
  LanguageEntry,
  CertificationEntry,
  ProjectEntry,
  Availability,
  SocialLinks,
} from '../types';

export interface IApplicant extends Document {
  jobId: mongoose.Types.ObjectId;
  source: ApplicantSource;
  sourceId?: string;
  profile: {
    name: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    location?: string;
    email: string;
    phone?: string;
    skills: SkillEntry[];
    languages: LanguageEntry[];
    experience: ExperienceEntry[];
    education: EducationEntry[];
    certifications?: CertificationEntry[];
    projects?: ProjectEntry[];
    availability?: Availability;
    socialLinks?: SocialLinks;
    summary?: string;
    resumeUrl?: string;
  };
  metadata?: {
    fileName?: string;
    uploadedAt?: Date;
  };
  status: 'pending' | 'shortlisted' | 'rejected' | 'hired';
  assessmentStatus: 'not_sent' | 'sent' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceSchema = new Schema<ExperienceEntry>({
  title: { type: String, required: true },
  company: { type: String, required: true },
  duration: { type: String },
  description: String,
  startDate: String,
  endDate: String,
  technologies: { type: [String], default: [] },
  isCurrent: { type: Boolean, default: false },
}, { _id: false });

const EducationSchema = new Schema<EducationEntry>({
  degree: { type: String, required: true },
  institution: { type: String, required: true },
  fieldOfStudy: { type: String },
  startYear: Number,
  endYear: Number,
}, { _id: false });

const SkillSchema = new Schema<SkillEntry>(
  {
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      default: 'Intermediate',
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

const LanguageSchema = new Schema<LanguageEntry>(
  {
    name: { type: String, required: true, trim: true },
    proficiency: {
      type: String,
      enum: ['Basic', 'Conversational', 'Fluent', 'Native'],
      default: 'Conversational',
    },
  },
  { _id: false }
);

const CertificationSchema = new Schema<CertificationEntry>(
  {
    name: { type: String, required: true, trim: true },
    issuer: { type: String, required: true, trim: true },
    issueDate: String,
  },
  { _id: false }
);

const ProjectSchema = new Schema<ProjectEntry>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    role: { type: String, required: true, trim: true },
    link: String,
    technologies: { type: [String], default: [] },
    startDate: String,
    endDate: String,
  },
  { _id: false }
);

const AvailabilitySchema = new Schema<Availability>(
  {
    status: {
      type: String,
      enum: ['Available', 'Open to Opportunities', 'Not Available'],
      default: 'Open to Opportunities',
    },
    type: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract'],
      default: 'Full-time',
    },
    startDate: String,
  },
  { _id: false }
);

const SocialLinksSchema = new Schema<SocialLinks>(
  {
    linkedin: String,
    github: String,
    portfolio: String,
    twitter: String,
    website: String,
  },
  { _id: false }
);

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
      firstName: {
        type: String,
        trim: true,
      },
      lastName: {
        type: String,
        trim: true,
      },
      headline: {
        type: String,
        trim: true,
      },
      location: {
        type: String,
        trim: true,
      },
      phone: String,
      skills: {
        type: [SkillSchema],
        default: [],
      },
      languages: {
        type: [LanguageSchema],
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
      certifications: {
        type: [CertificationSchema],
        default: [],
      },
      projects: {
        type: [ProjectSchema],
        default: [],
      },
      availability: {
        type: AvailabilitySchema,
        default: () => ({}),
      },
      socialLinks: {
        type: SocialLinksSchema,
        default: () => ({}),
      },
      summary: String,
      resumeUrl: String,
    },
    status: {
      type: String,
      enum: ['pending', 'shortlisted', 'rejected', 'hired'],
      default: 'pending',
    },
    assessmentStatus: {
      type: String,
      enum: ['not_sent', 'sent', 'completed'],
      default: 'not_sent',
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
