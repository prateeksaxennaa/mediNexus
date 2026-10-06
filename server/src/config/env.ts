import dotenv from 'dotenv';
import path from 'path';

// Load .env from the server root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  SARVAM_API_KEY: string;
  HF_TOKEN: string;
  GROQ_API_KEY: string;
  FRONTEND_URL: string;
  FRONTEND_URLS: string[];
  DATABASE_URL: string | undefined;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
}

function getEnvVar(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalEnvVar(key: string): string | undefined {
  return process.env[key];
}

function parseCsvEnvVar(key: string): string[] {
  const raw = process.env[key];
  if (!raw) return [];

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const env: EnvConfig = {
  PORT: parseInt(getEnvVar('PORT', '3000'), 10),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
  SUPABASE_URL: getEnvVar('SUPABASE_URL', ''),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar('SUPABASE_SERVICE_ROLE_KEY', ''),
  SUPABASE_ANON_KEY: getEnvVar('SUPABASE_ANON_KEY', ''),
  OPENROUTER_API_KEY: getEnvVar('OPENROUTER_API_KEY', ''),
  OPENROUTER_MODEL: getEnvVar('OPENROUTER_MODEL', 'google/gemma-4-31b-it:free'),
  SARVAM_API_KEY: getEnvVar('SARVAM_API_KEY', ''),
  HF_TOKEN: getEnvVar('HF_TOKEN', ''),
  GROQ_API_KEY: getEnvVar('GROQ_API_KEY', ''),
  FRONTEND_URL: getEnvVar('FRONTEND_URL', 'http://localhost:5173'),
  FRONTEND_URLS: parseCsvEnvVar('FRONTEND_URLS'),
  DATABASE_URL: getOptionalEnvVar('DATABASE_URL'),
  TWILIO_ACCOUNT_SID: getEnvVar('TWILIO_ACCOUNT_SID', 'placeholder_sid'),
  TWILIO_AUTH_TOKEN: getEnvVar('TWILIO_AUTH_TOKEN', 'placeholder_token'),
  TWILIO_WHATSAPP_FROM: getEnvVar('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886'),
};
