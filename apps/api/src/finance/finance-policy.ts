import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  hasWorkspacePermission,
  type MembershipRole,
  type WorkspacePermission,
} from '@quilt/domain';

export function workspaceRole(role: string): MembershipRole | null {
  switch (role) {
    case 'owner':
      return 'owner';
    case 'editor':
    case 'admin':
    case 'member':
      return 'editor';
    case 'viewer':
      return 'viewer';
    default:
      return null;
  }
}
export function requireWorkspacePermission(
  role: string | undefined,
  permission: WorkspacePermission,
) {
  if (role === undefined) throw new NotFoundException('Workspace not found.');
  const canonical = workspaceRole(role);
  if (
    !canonical ||
    !hasWorkspacePermission({ role: canonical, status: 'active' }, permission)
  )
    throw new ForbiddenException(
      'Your workspace role does not allow this action.',
    );
}
