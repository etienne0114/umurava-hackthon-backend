import axios, { AxiosInstance } from 'axios';
import { config } from '../config/environment';
import { ExperienceEntry, EducationEntry } from '../types';
import logger from '../utils/logger';

export interface UmuravaProfile {
  id: string;
  name: string;
  email: string;
  skills: string[];
  languages?: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  portfolio?: string;
  certifications?: string[];
}

export interface SearchCriteria {
  skills?: string[];
  location?: string;
  experienceYears?: number;
}

export class UmuravaService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.umuravaApiUrl,
      headers: {
        'Authorization': `Bearer ${config.umuravaApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async fetchTalentProfiles(profileIds: string[]): Promise<UmuravaProfile[]> {
    try {
      const profiles: UmuravaProfile[] = [];

      for (const profileId of profileIds) {
        try {
          const response = await this.client.get(`/profiles/${profileId}`);
          profiles.push(this.transformProfile(response.data));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to fetch profile ${profileId}:`, message);
        }
      }

      if (profiles.length === 0) {
        throw new Error('No profiles could be fetched from Umurava');
      }

      logger.info(`Fetched ${profiles.length} profiles from Umurava`);
      return profiles;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching Umurava profiles:', error);
      throw new Error(`Umurava API error: ${message}`);
    }
  }

  async searchTalents(criteria: SearchCriteria): Promise<UmuravaProfile[]> {
    try {
      const response = await this.client.post('/profiles/search', criteria);
      return response.data.map((profile: Record<string, unknown>) => this.transformProfile(profile));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error searching Umurava talents:', error);
      throw new Error(`Umurava API error: ${message}`);
    }
  }

  async validateProfileAccess(profileId: string): Promise<boolean> {
    try {
      await this.client.head(`/profiles/${profileId}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  private transformProfile(data: Record<string, unknown>): UmuravaProfile {
    return {
      id: String(data.id || data._id || ''),
      name: String(data.name || data.fullName || ''),
      email: String(data.email || ''),
      skills: (data.skills as string[]) || [],
      languages: (data.languages as string[]) || [],
      experience: (data.experience as ExperienceEntry[]) || [],
      education: (data.education as EducationEntry[]) || [],
      portfolio: (data.portfolio as string) || (data.portfolioUrl as string),
      certifications: (data.certifications as string[]) || [],
    };
  }
}

export const umuravaService = new UmuravaService();
