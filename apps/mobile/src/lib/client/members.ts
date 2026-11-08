import { z } from 'zod';
import { authClient } from './auth-client';
import { throwResponseError, ClientError } from './errors';

const invitation = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  expiresAt: z.coerce.date(),
});
const organization = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      role: z.string(),
      user: z.object({ name: z.string(), email: z.string() }),
    }),
  ),
  invitations: z.array(invitation).default([]),
});
export const membersApi = {
  async list(workspaceId: string) {
    const result = await authClient.organization.getFullOrganization({
      query: { organizationId: workspaceId },
    });
    throwResponseError(result.error);
    return organization.parse(result.data);
  },
  async invite(
    workspaceId: string,
    email: string,
    role: 'owner' | 'editor' | 'viewer',
  ) {
    const result = await authClient.organization.inviteMember({
      organizationId: workspaceId,
      email,
      role,
    });
    throwResponseError(result.error);
    return invitation.parse(result.data);
  },
  async remove(workspaceId: string, id: string) {
    const result = await authClient.organization.removeMember({
      organizationId: workspaceId,
      memberIdOrEmail: id,
    });
    throwResponseError(result.error);
  },
  async role(
    workspaceId: string,
    id: string,
    role: 'owner' | 'editor' | 'viewer',
  ) {
    const result = await authClient.organization.updateMemberRole({
      organizationId: workspaceId,
      memberId: id,
      role,
    });
    throwResponseError(result.error);
  },
  async cancel(id: string) {
    const result = await authClient.organization.cancelInvitation({
      invitationId: id,
    });
    throwResponseError(result.error);
  },
  async rename(workspaceId: string, name: string) {
    const result = await authClient.organization.update({
      organizationId: workspaceId,
      data: { name },
    });
    throwResponseError(result.error);
  },
  async accept(id: string) {
    const result = await authClient.organization.acceptInvitation({
      invitationId: id,
    });
    throwResponseError(result.error);
    if (!result.data)
      throw new ClientError('Invitation could not be accepted.');
    return result.data;
  },
};
