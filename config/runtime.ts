import { configSchema, AppConfig } from './env';

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const rawOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  const rawConfig = {
    environment: env.NODE_ENV ?? 'development',
    port: env.PORT ?? 3000,
    apiBaseUrl: env.API_BASE_URL ?? (env.PORT ? `http://localhost:${env.PORT}` : 'http://localhost:3000'),
    allowedOrigins: rawOrigins,
    d1BindingName: env.D1_BINDING_NAME ?? 'DB',
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      publicApiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? env.FIREBASE_PUBLIC_API_KEY,
    },
    featureFlags: {
      enableRealtime: env.ENABLE_REALTIME === 'true',
      enableDummyWhatsApp: env.ENABLE_DUMMY_WHATSAPP !== 'false',
      enableCoupons: env.ENABLE_COUPONS !== 'false',
    },
  };

  return configSchema.parse(rawConfig);
}

export const config: AppConfig = loadConfig();
