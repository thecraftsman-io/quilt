import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const ValidationErrorIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ValidationErrorIssue = z.infer<typeof ValidationErrorIssueSchema>;

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  code: z.string().optional(),
  errors: z.array(ValidationErrorIssueSchema).optional(),
  timestamp: z.string().optional(),
  path: z.string().optional(),
  requestId: z.string().optional(),
  currentVersion: z.number().int().min(1).optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export interface HealthResponse {
  status: 'ok';
  service: 'quilt-api';
}
