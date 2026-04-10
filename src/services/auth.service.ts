import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User';
import { ExperienceEntry, EducationEntry, SkillEntry, LanguageEntry, CertificationEntry, ProjectEntry } from '../types/index';
import logger from '../utils/logger';

export interface RegisterData {
  email: string;
  password: string;
  role: UserRole;
  name: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: string;
  phone?: string;
  company?: string;
  position?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
    profile: IUser['profile'];
  };
  token: string;
}

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  private readonly JWT_EXPIRES_IN = '7d';

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const existingUser = await User.findOne({ email: data.email });
      if (existingUser) {
        throw new Error('Email already registered');
      }

      const nameParts = data.name.trim().split(/\s+/).filter(Boolean);
      const firstName = data.firstName || nameParts[0] || '';
      const lastName = data.lastName || nameParts.slice(1).join(' ') || '';

      const user = new User({
        email: data.email,
        password: data.password,
        role: data.role,
        profile: {
          name: data.name,
          firstName,
          lastName,
          headline: data.headline,
          location: data.location,
          phone: data.phone,
          company: data.company,
          position: data.position,
        },
      });

      await user.save();

      const token = this.generateToken(user._id.toString(), user.role);

      logger.info(`User registered: ${user.email} (${user.role})`);

      return {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          profile: user.profile,
        },
        token,
      };
    } catch (error: unknown) {
      logger.error('Error during registration:', error);
      throw error;
    }
  }

  async login(data: LoginData): Promise<AuthResponse> {
    try {
      const user = await User.findOne({ email: data.email }).select('+password');
      if (!user) {
        throw new Error('Invalid email or password');
      }

      const isPasswordValid = await user.comparePassword(data.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      const token = this.generateToken(user._id.toString(), user.role);

      logger.info(`User logged in: ${user.email}`);

      return {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          profile: user.profile,
        },
        token,
      };
    } catch (error: unknown) {
      logger.error('Error during login:', error);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<IUser | null> {
    try {
      return await User.findById(userId);
    } catch (error: unknown) {
      logger.error(`Error fetching user ${userId}:`, error);
      throw error;
    }
  }

  async updateProfile(userId: string, updates: Partial<IUser['profile']>): Promise<IUser> {
    try {
    // Merge individual profile fields without overwriting the entire object
    const sanitizers: Record<string, (value: unknown[]) => unknown[]> = {
      experience: (value: unknown[]) =>
        (value as Partial<ExperienceEntry>[]).filter(
          (e) => (e.role?.trim() || e.company?.trim()) && (e.startDate?.trim() || e.endDate?.trim())
        ),
      education: (value: unknown[]) =>
        (value as Partial<EducationEntry>[]).filter((e) => e.degree?.trim() || e.institution?.trim()),
      skills: (value: unknown[]) => (value as Partial<SkillEntry>[]).filter((skill) => skill?.name?.trim()),
      languages: (value: unknown[]) => (value as Partial<LanguageEntry>[]).filter((lang) => lang?.name?.trim()),
      certifications: (value: unknown[]) =>
        (value as Partial<CertificationEntry>[]).filter((cert) => cert?.name?.trim() && cert?.issuer?.trim()),
      projects: (value: unknown[]) => (value as Partial<ProjectEntry>[]).filter((proj) => proj?.name?.trim()),
    };

    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      if (key in sanitizers && Array.isArray(value)) {
        setFields[`profile.${key}`] = sanitizers[key](value);
        continue;
      }

      if (key === 'availability' && typeof value === 'object' && value !== null) {
        setFields['profile.availability'] = value;
        continue;
      }

      if (key === 'socialLinks' && typeof value === 'object' && value !== null) {
        setFields['profile.socialLinks'] = value;
        continue;
      }

      setFields[`profile.${key}`] = value;
    }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: setFields },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error('User not found');
      }

      logger.info(`User profile updated: ${userId}`);
      return user;
    } catch (error: unknown) {
      logger.error(`Error updating user profile ${userId}:`, error);
      throw error;
    }
  }

  verifyToken(token: string): { userId: string; role: UserRole } {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as {
        userId: string;
        role: UserRole;
      };
      return decoded;
    } catch (error: unknown) {
      throw new Error('Invalid or expired token');
    }
  }

  private generateToken(userId: string, role: UserRole): string {
    return jwt.sign({ userId, role }, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });
  }
}

export const authService = new AuthService();
