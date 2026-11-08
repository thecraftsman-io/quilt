import { z } from 'zod';

export const HouseholdSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullish(),
  createdAt: z.coerce.date(),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const CreateOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must not exceed 50 characters')
    .regex(
      /^[a-z0-9-]+$/,
      'Slug must only contain lowercase alphanumeric characters and hyphens',
    )
    .optional(),
  logo: z.url('Logo must be a valid URL').nullable().optional(),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  logo: z.url().nullable().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const InviteMemberSchema = z.object({
  email: z.email('Invalid email address'),
  role: z.enum(['owner', 'editor', 'viewer']).default('editor'),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
