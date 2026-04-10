import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import type {
  SkillEntry,
  LanguageEntry,
  ExperienceEntry,
  EducationEntry,
  CertificationEntry,
  ProjectEntry,
  Availability,
  SocialLinks,
  UserRole,
} from '../types';

export type { UserRole } from '../types';

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  profile: {
    name: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    location?: string;
    phone?: string;
    company?: string;
    position?: string;
    bio?: string;
    avatar?: string;
    profileCompletion?: number;
    videoUrl?: string;
    skills?: SkillEntry[];
    languages?: LanguageEntry[];
    experience?: ExperienceEntry[];
    education?: EducationEntry[];
    certifications?: CertificationEntry[];
    projects?: ProjectEntry[];
    availability?: Availability;
    socialLinks?: SocialLinks;
    resumeUrl?: string;
  };
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

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

const ExperienceSchema = new Schema<ExperienceEntry>(
  {
    role: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    duration: { type: String, trim: true },
    description: String,
    startDate: String,
    endDate: String,
    technologies: { type: [String], default: [] },
    isCurrent: { type: Boolean, default: false },
  },
  { _id: false }
);

const EducationSchema = new Schema<EducationEntry>(
  {
    degree: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    fieldOfStudy: { type: String, trim: true },
    startYear: Number,
    endYear: Number,
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

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['talent', 'company'],
      required: [true, 'User role is required'],
    },
    profile: {
      name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
      },
      firstName: {
        type: String,
        required: [function(this: import("mongoose").Document & Record<string, unknown>) { return this.role === 'talent'; }, 'First name is required for talent'],
        trim: true,
        default: '',
      },
      lastName: {
        type: String,
        required: [function(this: import("mongoose").Document & Record<string, unknown>) { return this.role === 'talent'; }, 'Last name is required for talent'],
        trim: true,
        default: '',
      },
      headline: {
        type: String,
        required: [function(this: import("mongoose").Document & Record<string, unknown>) { return this.role === 'talent'; }, 'Headline is required for talent'],
        trim: true,
        default: '',
      },
      location: {
        type: String,
        required: [function(this: import("mongoose").Document & Record<string, unknown>) { return this.role === 'talent'; }, 'Location is required for talent'],
        trim: true,
        default: '',
      },
      phone: {
        type: String,
        trim: true,
      },
      company: {
        type: String,
        trim: true,
      },
      position: {
        type: String,
        trim: true,
      },
      bio: {
        type: String,
        maxlength: [1000, 'Bio cannot exceed 1000 characters'],
        default: '',
      },
      avatar: {
        type: String,
      },
      profileCompletion: {
        type: Number,
        default: 0,
      },
      videoUrl: {
        type: String,
      },
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
        required: [function(this: import("mongoose").Document & Record<string, unknown>) { return this.role === 'talent'; }, 'Availability is required for talent'],
        default: () => ({}),
      },
      socialLinks: {
        type: SocialLinksSchema,
        default: () => ({}),
      },
      resumeUrl: {
        type: String,
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', function (next) {
  if (!this.isModified('password')) {
    if (this.profile.firstName || this.profile.lastName) {
      const first = this.profile.firstName || '';
      const last = this.profile.lastName || '';
      const candidateName = `${first} ${last}`.trim();
      if (candidateName) {
        this.profile.name = candidateName;
      }
    }
    return next();
  }

  const salt = bcrypt.genSaltSync(10);
  this.password = bcrypt.hashSync(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ role: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
