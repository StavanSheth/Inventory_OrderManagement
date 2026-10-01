import { z } from 'zod';

export const environmentSchema = z.enum(['development', 'staging', 'production', 'test']);

export const configSchema = z
  .object({
    environment: environmentSchema.default('development'),
    port: z.coerce.number().int().positive().default(3000),
    apiBaseUrl: z.string().default('http://localhost:3000'),
    allowedOrigins: z.array(z.string()).default(['http://localhost:3000']),

    // Cloudflare D1 Binding
    d1BindingName: z.string().min(1, 'd1BindingName must not be empty').default('DB'),

    // Firebase Auth Configuration
    firebase: z
      .object({
        projectId: z.string().optional(),
        clientEmail: z.string().optional(),
        publicApiKey: z.string().optional(),
        authDomain: z.string().optional(),
      })
      .default({}),

    featureFlags: z
      .object({
        enableRealtime: z.boolean().default(false),
        enableDummyWhatsApp: z.boolean().default(true),
        enableCoupons: z.boolean().default(true),
      })
      .default({
        enableRealtime: false,
        enableDummyWhatsApp: true,
        enableCoupons: true,
      }),
  })
  .superRefine((data, ctx) => {
    const isProductionLike = data.environment === 'production' || data.environment === 'staging';

    if (isProductionLike) {
      // Production must not use localhost for API base URL
      if (data.apiBaseUrl.includes('localhost') || data.apiBaseUrl.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['apiBaseUrl'],
          message: `Production/staging cannot use localhost apiBaseUrl: ${data.apiBaseUrl}`,
        });
      }

      // Production must have valid origins without localhost
      const hasLocalhostOrigin = data.allowedOrigins.some(
        (origin) => origin.includes('localhost') || origin.includes('127.0.0.1'),
      );
      if (hasLocalhostOrigin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allowedOrigins'],
          message: 'Production/staging allowedOrigins cannot contain localhost',
        });
      }

      if (data.allowedOrigins.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allowedOrigins'],
          message: 'Production/staging must define at least one allowed origin',
        });
      }

      // Production requires Firebase project ID
      if (!data.firebase.projectId || data.firebase.projectId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['firebase', 'projectId'],
          message: 'Production and staging environments require a non-empty Firebase projectId',
        });
      }
    }
  });

export type AppConfig = z.infer<typeof configSchema>;
