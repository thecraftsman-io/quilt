import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import {
  Button,
  Card,
  Pressable,
  Text,
  TextField,
  View,
  useQuiltTheme,
} from '@quilt/ui';
import { CreateOrganizationSchema } from '@quilt/contracts';
import { membersApi } from '../../lib/client/members';
import { useAppStore } from '../../state/app-store';
import { useAction } from '../finance/hooks';
import { ScreenTransition } from '../../lib/navigation/motion';

export function HouseholdScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useQuiltTheme();
  const action = useAction();
  const households = useAppStore((s) => s.households);
  const activeId = useAppStore((s) => s.activeHouseholdId);
  const status = useAppStore((s) => s.householdsStatus);
  const error = useAppStore((s) => s.householdsError);
  const load = useAppStore((s) => s.loadHouseholds);
  const create = useAppStore((s) => s.createHousehold);
  const select = useAppStore((s) => s.selectHousehold);
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [invitation, setInvitation] = useState('');
  const open = async (id: string) => {
    await select(id);
    router.replace({
      pathname: '/workspace/[workspaceId]/[screen]',
      params: { workspaceId: id, screen: 'overview' },
    });
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenTransition>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View className="w-full max-w-[640px] self-center px-6 gap-6">
            <View className="self-start">
              <Button
                label="← Back"
                variant="secondary"
                disabled={action.pending}
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace('/home')
                }
              />
            </View>
            <View className="gap-2">
              <Text variant="heading">Households</Text>
              <Text tone="textMuted">
                Your spaces for shared money. Open a household to switch to it.
              </Text>
            </View>
            {status === 'loading' || status === 'idle' ? (
              <ActivityIndicator
                color={colors.primary}
                aria-label="Loading households"
              />
            ) : error ? (
              <View className="gap-4">
                <Text role="alert" tone="danger">
                  {error}
                </Text>
                <Button
                  label="Try again"
                  onPress={() => {
                    void load();
                  }}
                />
              </View>
            ) : (
              <View>
                {households.map((household) => (
                  <Pressable
                    key={household.id}
                    aria-label={`Open ${household.name}`}
                    aria-current={
                      activeId === household.id ? 'true' : undefined
                    }
                    disabled={action.pending}
                    onPress={() => {
                      void action.run(() => open(household.id));
                    }}
                    className="flex-row items-center gap-4 py-5 border-b border-border press:opacity-[0.65]"
                  >
                    <Feather
                      name="home"
                      size={22}
                      color={colors.primary}
                      accessible={false}
                    />
                    <View className="flex-1 gap-1">
                      <Text variant="title">{household.name}</Text>
                      {activeId === household.id && (
                        <Text variant="caption" tone="textMuted">
                          Current household
                        </Text>
                      )}
                    </View>
                    <Feather
                      name={
                        activeId === household.id ? 'check' : 'chevron-right'
                      }
                      size={20}
                      color={colors.textMuted}
                      accessible={false}
                    />
                  </Pressable>
                ))}
              </View>
            )}
            <View className="gap-3">
              <Button
                label="Create household"
                variant="secondary"
                disabled={action.pending}
                onPress={() => setMode(mode === 'create' ? null : 'create')}
              />
              <Button
                label="Join with an invitation"
                variant="secondary"
                disabled={action.pending}
                onPress={() => setMode(mode === 'join' ? null : 'join')}
              />
            </View>
            {mode === 'create' && (
              <Card>
                <Text variant="title">Create a household</Text>
                <TextField
                  label="Household name"
                  placeholder="e.g. Our place"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  editable={!action.pending}
                />
                <Button
                  label="Create and open"
                  loading={action.pending}
                  onPress={() => {
                    void action.run(async () => {
                      const input = CreateOrganizationSchema.parse({ name });
                      const household = await create(input.name);
                      if (household) await open(household.id);
                    });
                  }}
                />
              </Card>
            )}
            {mode === 'join' && (
              <Card>
                <Text variant="title">Join a household</Text>
                <TextField
                  label="Invitation code"
                  value={invitation}
                  onChangeText={setInvitation}
                  autoCapitalize="none"
                  editable={!action.pending}
                />
                <Button
                  label="Join and open"
                  loading={action.pending}
                  onPress={() => {
                    void action.run(async () => {
                      if (!invitation.trim())
                        throw new Error('Enter your invitation code.');
                      const accepted = await membersApi.accept(
                        invitation.trim(),
                      );
                      await load();
                      await open(accepted.member.organizationId);
                    });
                  }}
                />
              </Card>
            )}
            {Boolean(action.error) && (
              <Text role="alert" tone="danger">
                {action.error}
              </Text>
            )}
          </View>
        </ScrollView>
      </ScreenTransition>
    </KeyboardAvoidingView>
  );
}
