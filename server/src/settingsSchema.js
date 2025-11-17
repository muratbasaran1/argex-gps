import { z } from 'zod';

const keySchema = z
  .string({ required_error: 'key is required', invalid_type_error: 'key must be a string' })
  .trim()
  .min(3, 'key must be at least 3 characters long')
  .max(64, 'key must be at most 64 characters long')
  .regex(/^[A-Za-z0-9._-]+$/, 'key can only include letters, numbers, dots, underscores, and hyphens');

const valueSchema = z
  .string({ required_error: 'value is required', invalid_type_error: 'value must be a string' })
  .trim()
  .min(1, 'value must not be empty')
  .max(2048, 'value is too long');

const descriptionSchema = z
  .string({ invalid_type_error: 'description must be a string' })
  .trim()
  .max(256, 'description is too long');

export const createSettingSchema = z.object({
  key: keySchema,
  value: valueSchema,
  description: descriptionSchema.optional().default(''),
  secret: z.boolean({ invalid_type_error: 'secret must be a boolean' }).optional().default(false),
});

export const updateSettingSchema = z
  .object({
    key: keySchema.optional(),
    value: valueSchema.optional(),
    description: descriptionSchema.optional(),
    secret: z.boolean({ invalid_type_error: 'secret must be a boolean' }).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.key && typeof value.value === 'undefined' && typeof value.description === 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }
  });
