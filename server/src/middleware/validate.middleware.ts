import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Wraps a Zod schema into an Express middleware.
 * The schema should validate an object with shape { body?, query?, params? }.
 *
 * On validation failure, formats ZodError issues into a readable array
 * and forwards a ValidationError (422) to the global error handler.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const zodError = result.error as ZodError;
      const errors = zodError.issues.map((issue) => ({
        field: issue.path.slice(1).join('.'), // strip leading "body"/"query"/"params"
        message: issue.message,
      }));
      next(new ValidationError('Validation failed', errors));
      return;
    }

    next();
  };
}
