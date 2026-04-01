import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'talent' | 'company';

export interface IExperienceEntry {
  title: string;
  company: string;
  duration: string;
  description?: string;
}

export interface IEducationEntry {
  degree: string;
  institution: string;
  year: string;
}

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  profile: {
    name: string;
    phone?: string;
    company?: string;
    position?: string;
    bio?: string;
    avatar?: string;
    profileCompletion?: number;
    videoUrl?: string;
    skills?: string[];
    languages?: string[];
    experience?: IExperienceEntry[];
    education?: IEducationEntry[];
    resumeUrl?: string;
  };
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

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
        maxlength: [500, 'Bio cannot exceed 500 characters'],
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
        type: [String],
        default: [],
      },
      languages: {
        type: [String],
        default: [],
      },
      experience: {
        type: [
          {
            title: { type: String, default: '' },
            company: { type: String, default: '' },
            duration: { type: String, default: '' },
            description: { type: String },
          },
        ],
        default: [],
      },
      education: {
        type: [
          {
            degree: { type: String, default: '' },
            institution: { type: String, default: '' },
            year: { type: String, default: '' },
          },
        ],
        default: [],
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

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Index for faster queries (email index is already created by unique:true above)
userSchema.index({ role: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
