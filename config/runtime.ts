import { configSchema, AppConfig } from './env';

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const isProductionLike = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  const isBuildPhase =
    Boolean(env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build');

  const rawOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : isProductionLike
      ? (isBuildPhase ? ['https://build-phase.placeholder'] : [])
      : ['http://localhost:3000'];

  const defaultApiBaseUrl = isProductionLike
    ? (env.API_BASE_URL ?? (isBuildPhase ? 'https://build-phase.placeholder' : ''))
    : (env.API_BASE_URL ?? (env.PORT ? `http://localhost:${env.PORT}` : 'http://localhost:3000'));

  const rawConfig = {
    environment: env.NODE_ENV ?? 'development',
    port: env.PORT ?? 3000,
    apiBaseUrl: defaultApiBaseUrl,
    allowedOrigins: rawOrigins,
    d1BindingName: env.D1_BINDING_NAME ?? 'DB',
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? (isBuildPhase ? 'build-phase-placeholder' : undefined),
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      publicApiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? env.FIREBASE_PUBLIC_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? env.FIREBASE_AUTH_DOMAIN,
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
