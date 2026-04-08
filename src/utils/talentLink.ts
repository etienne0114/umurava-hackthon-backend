import { Applicant } from '../models/Applicant';
import { User } from '../models/User';

export async function resolveTalentUserIdForApplicant(applicant: any): Promise<string | undefined> {
  if (!applicant) return undefined;

  // 1) Prefer sourceId when it points to a local User
  if (applicant.sourceId) {
    const sourceId = String(applicant.sourceId);
    const localUser = await User.findById(sourceId).select('_id');
    if (localUser) {
      return localUser._id.toString();
    }
  }

  // 2) Fallback to matching by applicant email
  const email = applicant.profile?.email?.toLowerCase?.();
  if (email) {
    const emailUser = await User.findOne({ email }).select('_id');
    if (emailUser) {
      return emailUser._id.toString();
    }
  }

  return undefined;
}

export async function getTalentApplicantMatches(userId: string): Promise<{
  applicantIds: string[];
  emailApplicantIds: string[];
  talentEmail?: string;
}> {
  const user = await User.findById(userId).select('email');
  const talentEmail = user?.email?.toLowerCase();

  const baseQuery: any = { $or: [{ sourceId: userId }] };
  if (talentEmail) {
    baseQuery.$or.push({ 'profile.email': talentEmail });
  }

  const applicants = await Applicant.find(baseQuery).select('_id');
  const applicantIds = applicants.map((a) => a._id.toString());

  let emailApplicantIds: string[] = [];
  if (talentEmail) {
    const emailApplicants = await Applicant.find({
      'profile.email': { $regex: new RegExp(`^${talentEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).select('_id');
    emailApplicantIds = emailApplicants.map((a) => a._id.toString());
  }

  return { applicantIds, emailApplicantIds, talentEmail };
}
