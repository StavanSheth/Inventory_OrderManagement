import { z } from 'zod';

export const idSchema = z.string().min(1, 'ID cannot be empty');

export const isoDateTimeUtcSchema = z.string().datetime({ message: 'Must be a valid ISO 8601 UTC string' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
