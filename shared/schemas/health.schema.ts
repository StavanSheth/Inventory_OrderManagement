import { z } from 'zod';

export const healthDataSchema = z.object({
  status: z.literal('ok'),
  version: z.string().optional(),
  timestamp: z.string().optional(),
  uptime: z.number().optional(),
  database: z.string().optional(),
});

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthDataSchema,
});

export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
