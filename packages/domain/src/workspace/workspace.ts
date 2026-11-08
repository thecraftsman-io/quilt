import type { CurrencyCode } from '../primitives/money';
import type {
  EntityId,
  RecordMetadata,
  Timestamp,
  WorkspaceRecord,
} from '../primitives/identity';

export interface User {
  readonly id: EntityId<'user'>;
  readonly displayName: string;
  readonly createdAt: Timestamp;
}
export interface Workspace extends RecordMetadata {
  readonly id: EntityId<'workspace'>;
  readonly name: string;
  /** A reporting preference; individual accounts retain their own currencies. */
  readonly reportingCurrency: CurrencyCode;
  /** IANA time-zone identifier, validated by the application's supported-zone policy. */
  readonly timeZone: string;
}
export type MembershipRole = 'owner' | 'editor' | 'viewer';
export interface Membership extends WorkspaceRecord<'membership'> {
  readonly userId: EntityId<'user'>;
  readonly role: MembershipRole;
  readonly status: 'active' | 'revoked';
}
export type WorkspacePermission = 'read' | 'edit-finances' | 'manage-members';
/** Pure policy only: the server must load current membership on every request. */
export function hasWorkspacePermission(
  membership: Pick<Membership, 'role' | 'status'>,
  permission: WorkspacePermission,
): boolean {
  if (
    membership.status !== 'active' ||
    !['owner', 'editor', 'viewer'].includes(membership.role)
  )
    return false;
  if (permission === 'read') return true;
  if (permission === 'manage-members') return membership.role === 'owner';
  if (permission === 'edit-finances')
    return membership.role === 'owner' || membership.role === 'editor';
  return false;
}
