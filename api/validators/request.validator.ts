import { ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../../backend/errors/app-error';

export function validateRequest<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const formatted = error.issues.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      throw new ValidationError('Request validation failed', formatted);
    }
    throw error;
  }
}
