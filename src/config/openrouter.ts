import axios from 'axios';
import { config } from './environment';
import logger from '../utils/logger';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const openRouterClient = axios.create({
  baseURL: config.openRouterBaseUrl,
  timeout: 90000,
});

export const isOpenRouterConfigured = (): boolean => {
  return Boolean(config.openRouterApiKey);
};

export const generateWithOpenRouter = async (
  messages: OpenRouterMessage[],
  model: string = config.openRouterModel
): Promise<{ text: string; model: string }> => {
  if (!isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      'Content-Type': 'application/json',
    };

    if (config.openRouterSiteUrl) {
      headers['HTTP-Referer'] = config.openRouterSiteUrl;
    }

    if (config.openRouterAppName) {
      headers['X-Title'] = config.openRouterAppName;
    }

    const response = await openRouterClient.post<OpenRouterResponse>(
      '/chat/completions',
      {
        model,
        messages,
        temperature: 0.2,
      },
      {
        headers,
      }
    );

    const text = response.data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('OpenRouter returned an empty response');
    }

    return { text, model };
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: unknown; status?: number; statusText?: string }; message?: string; code?: string };
    const responseData = axiosError?.response?.data;
    const responseText =
      typeof responseData === 'string'
        ? responseData
        : responseData
        ? JSON.stringify(responseData)
        : '';

    const details =
      (responseData as Record<string, { message: string }>)?.error?.message ||
      (responseData as Record<string, string>)?.message ||
      axiosError?.message ||
      'Unknown OpenRouter error';

    const status = axiosError?.response?.status ? `status=${axiosError.response.status}` : '';
    const statusText = axiosError?.response?.statusText ? `statusText=${axiosError.response.statusText}` : '';
    const code = axiosError?.code ? `code=${axiosError.code}` : '';
    const extra = [status, statusText, code, responseText].filter(Boolean).join(' | ');

    logger.error(`OpenRouter request failed: ${details}${extra ? ` (${extra})` : ''}`);
    throw new Error(`OpenRouter request failed: ${details}${extra ? ` (${extra})` : ''}`);
  }
};
