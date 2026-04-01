import mongoose, { Schema, Document } from 'mongoose';

export interface IProfileView extends Document {
  talentId: mongoose.Types.ObjectId;
  viewerId?: mongoose.Types.ObjectId;
  viewerRole?: string;
  viewedAt: Date;
  createdAt: Date;
}

const ProfileViewSchema = new Schema<IProfileView>(
  {
    talentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Talent ID is required'],
    },
    viewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    viewerRole: {
      type: String,
      enum: ['company', 'talent', 'anonymous'],
      default: 'anonymous',
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ProfileViewSchema.index({ talentId: 1, viewedAt: -1 });
ProfileViewSchema.index({ talentId: 1, viewerId: 1 });

export const ProfileView = mongoose.model<IProfileView>('ProfileView', ProfileViewSchema);
