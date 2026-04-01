import mongoose, { Schema, Document } from 'mongoose';

export type ApplicationStatus = 'pending' | 'reviewing' | 'hired' | 'declined';

export interface IApplication extends Document {
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  status: ApplicationStatus;
  appliedAt: Date;
  reviewedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: [true, 'Job ID is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'hired', 'declined'],
      default: 'pending',
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
  },
  { timestamps: true }
);

// Prevent duplicate applications
ApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
ApplicationSchema.index({ userId: 1, status: 1 });
ApplicationSchema.index({ jobId: 1 });

export const Application = mongoose.model<IApplication>('Application', ApplicationSchema);
