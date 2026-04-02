import mongoose, { Schema, Document } from 'mongoose';

export interface IAssessment extends Document {
  jobId: mongoose.Types.ObjectId;
  applicantId: mongoose.Types.ObjectId;
  questions: Array<{
    question: string;
    expectedAnswer: string;
  }>;
  status: 'pending' | 'completed' | 'expired';
  expiresAt?: Date;
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
    questions: [
      {
        question: { type: String, required: true },
        expectedAnswer: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending',
    },
    expiresAt: Date,
  },
  { timestamps: true }
);

AssessmentSchema.index({ jobId: 1, applicantId: 1 });

export const Assessment = mongoose.model<IAssessment>('Assessment', AssessmentSchema);
