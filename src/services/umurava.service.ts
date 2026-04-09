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
        } catch (error: any) {
          logger.warn(`Failed to fetch profile ${profileId}:`, error.message);
        }
      }

      if (profiles.length === 0) {
        throw new Error('No profiles could be fetched from Umurava');
      }

      logger.info(`Fetched ${profiles.length} profiles from Umurava`);
      return profiles;
    } catch (error: any) {
      logger.error('Error fetching Umurava profiles:', error);
      throw new Error(`Umurava API error: ${error.message}`);
    }
  }

  async searchTalents(criteria: SearchCriteria): Promise<UmuravaProfile[]> {
    try {
      const response = await this.client.post('/profiles/search', criteria);
      return response.data.map((profile: any) => this.transformProfile(profile));
    } catch (error: any) {
      logger.error('Error searching Umurava talents:', error);
      throw new Error(`Umurava API error: ${error.message}`);
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

  private transformProfile(data: any): UmuravaProfile {
    return {
      id: data.id || data._id,
      name: data.name || data.fullName,
      email: data.email,
      skills: data.skills || [],
      languages: data.languages || [],
      experience: data.experience || [],
      education: data.education || [],
      portfolio: data.portfolio || data.portfolioUrl,
      certifications: data.certifications || [],
    };
  }
}

export const umuravaService = new UmuravaService();
