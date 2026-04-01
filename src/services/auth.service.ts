import jwt from 'jsonwebtoken';
import { User, IUser, UserRole } from '../models/User';
import logger from '../utils/logger';

export interface RegisterData {
  email: string;
  password: string;
  role: UserRole;
  name: string;
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

      const user = new User({
        email: data.email,
        password: data.password,
        role: data.role,
        profile: {
          name: data.name,
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
    } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Error during login:', error);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<IUser | null> {
    try {
      return await User.findById(userId);
    } catch (error: any) {
      logger.error(`Error fetching user ${userId}:`, error);
      throw error;
    }
  }

  async updateProfile(userId: string, updates: Partial<IUser['profile']>): Promise<IUser> {
    try {
      // Merge individual profile fields instead of replacing the entire object
      const setFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        // Filter out experience/education entries that are entirely blank to avoid DB noise
        if (key === 'experience' && Array.isArray(value)) {
          setFields[`profile.${key}`] = (value as any[]).filter(
            (e) => (e.title?.trim() || e.company?.trim()) && e.duration?.trim()
          );
        } else if (key === 'education' && Array.isArray(value)) {
          setFields[`profile.${key}`] = (value as any[]).filter(
            (e) => e.degree?.trim() || e.institution?.trim()
          );
        } else {
          setFields[`profile.${key}`] = value;
        }
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
    } catch (error: any) {
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
    } catch (error: any) {
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
