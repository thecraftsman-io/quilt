import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Card, Text, TextField, View } from '@quilt/ui';
import { useAppearance } from '../../state/appearance';
import { useAppStore } from '../../state/app-store';
import { membersApi } from '../../lib/client/members';
import { useFinance } from './finance-context';
import { useAction, useRemote } from './hooks';
import {
  Choices,
  Empty,
  ErrorMessage,
  Page,
  Picker,
  RemoteState,
  Row,
  useNavigate,
} from './components';

export function MoreScreen() {
  const go = useNavigate();
  return (
    <Page title="Your household" subtitle="Keep the details together.">
      <Card>
        <Row
          title="Organization"
          subtitle="Categories, merchants, and tags"
          onPress={() => go('catalog')}
        />
        <Row
          title="Members"
          subtitle="Shared household access"
          onPress={() => go('members')}
        />
        <Row
          title="Settings"
          subtitle="Household preferences and appearance"
          onPress={() => go('settings')}
        />
      </Card>
    </Page>
  );
}
export function CatalogScreen() {
  const { data, canEdit, create, update } = useFinance();
  const action = useAction();
  const [kind, setKind] = useState<'categories' | 'merchants' | 'tags'>(
    'categories',
  );
  const [name, setName] = useState('');
  const [categoryKind, setCategoryKind] = useState('expense');
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
    archived: boolean;
    aliases?: readonly string[];
  }>();
  const reset = () => {
    setEditing(undefined);
    setName('');
  };
  const payload = (
    label: string,
    archived: boolean,
    entry?: (typeof data.merchants)[number],
  ) =>
    kind === 'categories'
      ? { name: label, kind: categoryKind, archived }
      : kind === 'merchants'
        ? {
            name: label,
            aliases: entry?.aliases ?? editing?.aliases ?? [],
            archived,
          }
        : { name: label, archived };
  return (
    <Page
      title="Organization"
      subtitle="Names and labels that make sense to you."
    >
      <Choices
        label="Manage"
        value={kind}
        values={['categories', 'merchants', 'tags']}
        onChange={(v) => {
          if (v === 'categories' || v === 'merchants' || v === 'tags') {
            setKind(v);
            reset();
          }
        }}
      />
      {canEdit && (
        <Card>
          <Text variant="title">{editing ? 'Edit item' : 'Add item'}</Text>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            editable={!action.pending}
          />
          {kind === 'categories' && (
            <Choices
              label="Category type"
              value={categoryKind}
              values={['expense', 'income']}
              onChange={setCategoryKind}
            />
          )}
          <ErrorMessage message={action.error} />
          <Button
            label="Save item"
            loading={action.pending}
            onPress={() => {
              void action
                .run(() =>
                  editing
                    ? update(
                        kind,
                        editing.id,
                        editing.version,
                        payload(name, editing.archived),
                      )
                    : create(kind, payload(name, false)),
                )
                .then((value) => {
                  if (value) reset();
                });
            }}
          />
          {editing && (
            <Button label="Cancel edit" variant="secondary" onPress={reset} />
          )}
        </Card>
      )}
      {data[kind].length ? (
        <Card>
          {data[kind].map((item) => (
            <View key={item.id} className="gap-2 border-b border-border pb-4">
              <Row
                title={item.name}
                subtitle={`${'kind' in item ? item.kind : kind}${item.archivedAt ? ' · Archived' : ''}`}
              />
              {canEdit && (
                <View className="gap-2">
                  <Button
                    label={`Edit ${item.name}`}
                    variant="secondary"
                    onPress={() => {
                      setName(item.name);
                      if ('kind' in item) setCategoryKind(item.kind);
                      setEditing({
                        id: item.id,
                        version: item.version,
                        archived: Boolean(item.archivedAt),
                        ...('aliases' in item ? { aliases: item.aliases } : {}),
                      });
                    }}
                  />
                  <Button
                    label={
                      item.archivedAt
                        ? `Restore ${item.name}`
                        : `Archive ${item.name}`
                    }
                    variant="secondary"
                    disabled={action.pending}
                    onPress={() => {
                      const value =
                        kind === 'categories' && 'kind' in item
                          ? {
                              name: item.name,
                              kind: item.kind,
                              archived: !item.archivedAt,
                            }
                          : kind === 'merchants' && 'aliases' in item
                            ? {
                                name: item.name,
                                aliases: item.aliases,
                                archived: !item.archivedAt,
                              }
                            : { name: item.name, archived: !item.archivedAt };
                      void action.run(() =>
                        update(kind, item.id, item.version, value),
                      );
                    }}
                  />
                </View>
              )}
            </View>
          ))}
        </Card>
      ) : (
        <Empty text="No items yet." />
      )}
      {!editing && <ErrorMessage message={action.error} />}
    </Page>
  );
}
function roleLabel(role: string) {
  return role === 'owner'
    ? 'Owner'
    : role === 'viewer'
      ? 'Viewer'
      : ['editor', 'admin', 'member'].includes(role)
        ? 'Editor'
        : role;
}
export function MembersScreen() {
  const { workspaceId, isOwner } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const { refresh } = useFinance();
  const userId = useAppStore((s) => s.session?.user.id);
  const result = useRemote(
    useCallback(() => membersApi.list(workspaceId), [workspaceId]),
  );
  const [confirm, setConfirm] = useState('');
  return (
    <Page
      title="Members"
      subtitle="Owners manage access. Editors can edit finances. Viewers can read."
      action={isOwner ? () => go('invite') : undefined}
      actionLabel="Invite member"
    >
      {result.loading || result.error ? (
        <RemoteState loading={result.loading} error={result.error} />
      ) : (
        result.value && (
          <>
            <Card>
              {result.value.members.map((member) => (
                <View
                  key={member.id}
                  className="gap-2 border-b border-border pb-4"
                >
                  <Row
                    title={`${member.user.name}${member.userId === userId ? ' (you)' : ''}`}
                    subtitle={`${member.user.email} · ${roleLabel(member.role)}`}
                  />
                  {isOwner && member.userId !== userId && (
                    <>
                      <Picker
                        label={`Role for ${member.user.name}`}
                        value={member.role}
                        options={[
                          { id: 'owner', name: 'Owner' },
                          { id: 'editor', name: 'Editor' },
                          { id: 'viewer', name: 'Viewer' },
                        ]}
                        onChange={(role) => {
                          if (
                            role === 'owner' ||
                            role === 'editor' ||
                            role === 'viewer'
                          )
                            void action.run(async () => {
                              await membersApi.role(
                                workspaceId,
                                member.id,
                                role,
                              );
                              await refresh();
                              return true;
                            });
                        }}
                      />
                      <Button
                        label={
                          confirm === member.id
                            ? `Confirm remove ${member.user.name}`
                            : `Remove ${member.user.name}`
                        }
                        variant="secondary"
                        disabled={action.pending}
                        onPress={() => {
                          if (confirm !== member.id) {
                            setConfirm(member.id);
                            return;
                          }
                          void action.run(async () => {
                            await membersApi.remove(workspaceId, member.id);
                            await refresh();
                            return true;
                          });
                        }}
                      />
                    </>
                  )}
                </View>
              ))}
            </Card>
            {isOwner &&
              result.value.invitations
                .filter((i) => i.status === 'pending')
                .map((invitation) => (
                  <Card key={invitation.id}>
                    <Text variant="title">{invitation.email}</Text>
                    <Text tone="textMuted">
                      Pending · {roleLabel(invitation.role)}
                    </Text>
                    <Text selectable>Invitation code: {invitation.id}</Text>
                    <Text variant="caption" tone="textMuted">
                      Share this code privately. The recipient can enter it on
                      the household screen.
                    </Text>
                    <Button
                      variant="secondary"
                      label="Cancel invitation"
                      loading={action.pending}
                      onPress={() => {
                        void action.run(async () => {
                          await membersApi.cancel(invitation.id);
                          await refresh();
                          return true;
                        });
                      }}
                    />
                  </Card>
                ))}
          </>
        )
      )}
      <ErrorMessage message={action.error} />
    </Page>
  );
}
export function InviteScreen() {
  const { workspaceId, isOwner, refresh } = useFinance();
  const go = useNavigate();
  const action = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer'>('editor');
  if (!isOwner) return <Empty text="Only owners can invite members." />;
  return (
    <Page
      title="Invite a member"
      subtitle="They will need a verified Quilt account using this email."
    >
      <Card>
        <TextField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Choices
          label="Role"
          value={role}
          values={['owner', 'editor', 'viewer']}
          onChange={(v) => {
            if (v === 'owner' || v === 'editor' || v === 'viewer') setRole(v);
          }}
        />
        <Text tone="textMuted">
          {role === 'owner'
            ? 'Can edit shared finances and manage members.'
            : role === 'editor'
              ? 'Can add and edit shared finances.'
              : 'Can read all shared finances.'}
        </Text>
        <ErrorMessage message={action.error} />
        <Button
          label="Create invitation"
          loading={action.pending}
          onPress={() => {
            void action
              .run(async () => {
                const invitation = await membersApi.invite(
                  workspaceId,
                  email.trim(),
                  role,
                );
                await refresh();
                return invitation;
              })
              .then((value) => {
                if (value) go('members', {}, true);
              });
          }}
        />
        <Text variant="caption" tone="textMuted">
          You’ll receive an invitation code to share privately with them.
        </Text>
      </Card>
    </Page>
  );
}
export function SettingsScreen() {
  const { data, isOwner, create, update, workspaceId, refresh } = useFinance();
  const go = useNavigate();
  const router = useRouter();
  const { preference, setPreference } = useAppearance();
  const signOut = useAppStore((s) => s.signOut);
  const action = useAction();
  const [settings] = useState(data.settings[0]);
  const [name, setName] = useState(data.workspace.name);
  const [currency, setCurrency] = useState<string>(
    settings?.reportingCurrency ?? 'EUR',
  );
  const [zone, setZone] = useState(
    settings?.timeZone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'UTC',
  );
  return (
    <Page title="Settings">
      <Card>
        {isOwner ? (
          <>
            <TextField
              label="Household name"
              value={name}
              onChangeText={setName}
            />
            <Choices
              label="Reporting currency"
              value={currency}
              values={['EUR', 'USD', 'GBP']}
              onChange={setCurrency}
            />
            <TextField
              label="Time zone"
              hint="e.g. Europe/Paris"
              value={zone}
              onChangeText={setZone}
            />
            <Text variant="caption" tone="textMuted">
              Accounts keep their original currencies. Reports show separate
              totals until currency conversion is available.
            </Text>
            <Button
              label="Save preferences"
              loading={action.pending}
              onPress={() => {
                void action
                  .run(async () => {
                    if (!name.trim())
                      throw new Error('Enter a household name.');
                    if (name.trim() !== data.workspace.name)
                      await membersApi.rename(workspaceId, name.trim());
                    const value = {
                      reportingCurrency: currency,
                      timeZone: zone,
                    };
                    const result = settings
                      ? await update(
                          'settings',
                          settings.id,
                          settings.version,
                          value,
                        )
                      : await create('settings', value);
                    await refresh();
                    return result;
                  })
                  .then((value) => {
                    if (value) go('more', {}, true);
                  });
              }}
            />
          </>
        ) : (
          <>
            <Text variant="title">{data.workspace.name}</Text>
            <Text>
              {data.settings[0]?.reportingCurrency ?? 'EUR'} ·{' '}
              {data.settings[0]?.timeZone ?? 'UTC'}
            </Text>
            <Text tone="textMuted">
              Only owners can change household preferences.
            </Text>
          </>
        )}
      </Card>
      <Card>
        <Choices
          label="Appearance"
          value={preference}
          values={['system', 'light', 'dark']}
          onChange={(v) => {
            if (v === 'system' || v === 'light' || v === 'dark')
              setPreference(v);
          }}
        />
      </Card>
      <ErrorMessage message={action.error} />
      <Button
        label="Switch household"
        variant="secondary"
        onPress={() => router.replace('/home')}
      />
      <Button
        label="Sign out"
        variant="secondary"
        loading={action.pending}
        onPress={() => {
          void action.run(async () => {
            await signOut();
            return true;
          });
        }}
      />
    </Page>
  );
}
export function PlansScreen() {
  const go = useNavigate();
  return (
    <Page title="Plans" subtitle="A little structure for today and tomorrow.">
      <Card>
        <Row
          title="Monthly budgets"
          subtitle="Give your spending a plan"
          onPress={() => go('budgets')}
        />
        <Row
          title="Savings goals"
          subtitle="Track your progress together"
          onPress={() => go('goals')}
        />
      </Card>
    </Page>
  );
}
