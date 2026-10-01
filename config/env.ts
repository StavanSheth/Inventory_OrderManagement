import { z } from 'zod';

export const environmentSchema = z.enum(['development', 'staging', 'production', 'test']);

export const configSchema = z.object({
  environment: environmentSchema.default('development'),
  port: z.coerce.number().int().positive().default(3000),
  apiBaseUrl: z.string().default('http://localhost:3000'),
  allowedOrigins: z.array(z.string()).default(['http://localhost:3000']),

  // Cloudflare D1
  d1BindingName: z.string().default('DB'),

  // Firebase Auth Placeholders (Future phase)
  firebase: z.object({
    projectId: z.string().optional(),
    clientEmail: z.string().optional(),
    publicApiKey: z.string().optional(),
  }).default({}),

  featureFlags: z.object({
    enableRealtime: z.boolean().default(false),
    enableDummyWhatsApp: z.boolean().default(true),
    enableCoupons: z.boolean().default(true),
  }).default({
    enableRealtime: false,
    enableDummyWhatsApp: true,
    enableCoupons: true,
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
