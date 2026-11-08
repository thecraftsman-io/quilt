import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button, Card, Text, TextField, View, useQuiltTheme } from '@quilt/ui';
import { CreateOrganizationSchema } from '@quilt/contracts';
import { membersApi } from '../../lib/client/members';
import { useAppStore } from '../../state/app-store';
import { useAction } from '../finance/hooks';
import { EntryLayout } from '../auth/components/entry-layout';

export function HouseholdScreen() {
  const router = useRouter();
  const { colors } = useQuiltTheme();
  const action = useAction();
  const session = useAppStore((s) => s.session);
  const households = useAppStore((s) => s.households);
  const status = useAppStore((s) => s.householdsStatus);
  const error = useAppStore((s) => s.householdsError);
  const load = useAppStore((s) => s.loadHouseholds);
  const create = useAppStore((s) => s.createHousehold);
  const signOut = useAppStore((s) => s.signOut);
  const [name, setName] = useState('');
  const [invitation, setInvitation] = useState('');
  const [message, setMessage] = useState('');
  return (
    <EntryLayout>
      <View className="w-full max-w-[640px] self-center px-6 py-10 gap-6">
        <Text variant="heading">
          Good to see you
          {session?.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}.
        </Text>
        <Text tone="textMuted">Choose a household to open its finances.</Text>
        {status === 'loading' || status === 'idle' ? (
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel="Loading households"
          />
        ) : error ? (
          <Card>
            <Text role="alert" tone="danger">
              {error}
            </Text>
            <Button
              label="Try again"
              onPress={() => {
                void load();
              }}
            />
          </Card>
        ) : (
          households.map((household) => (
            <Card key={household.id}>
              <Text variant="title">{household.name}</Text>
              <Button
                label={`Open ${household.name}`}
                onPress={() =>
                  router.push({
                    pathname: '/workspace/[workspaceId]/[screen]',
                    params: { workspaceId: household.id, screen: 'overview' },
                  })
                }
              />
            </Card>
          ))
        )}
        <Card>
          <Text variant="title">
            {households.length
              ? 'Create another household'
              : 'Give your household a home'}
          </Text>
          <TextField
            label="Household name"
            placeholder="e.g. Our place"
            value={name}
            onChangeText={setName}
            maxLength={100}
            editable={!action.pending}
          />
          <Button
            label="Create household"
            loading={action.pending}
            onPress={() => {
              void action.run(async () => {
                const input = CreateOrganizationSchema.parse({ name });
                await create(input.name);
                setName('');
                return true;
              });
            }}
          />
        </Card>
        <Card>
          <Text variant="title">Have an invitation?</Text>
          <TextField
            label="Invitation code"
            value={invitation}
            onChangeText={setInvitation}
            autoCapitalize="none"
            editable={!action.pending}
          />
          <Button
            label="Join household"
            loading={action.pending}
            onPress={() => {
              void action.run(async () => {
                if (!invitation.trim())
                  throw new Error('Enter your invitation code.');
                await membersApi.accept(invitation.trim());
                await load();
                setInvitation('');
                setMessage(
                  'You’ve joined the household. Open it above to get started.',
                );
                return true;
              });
            }}
          />
          {Boolean(message) && (
            <Text accessibilityLiveRegion="polite">{message}</Text>
          )}
        </Card>
        {Boolean(action.error) && (
          <Text role="alert" tone="danger">
            {action.error}
          </Text>
        )}
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
      </View>
    </EntryLayout>
  );
}
