import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Button, Text, View, useQuiltTheme } from '@quilt/ui';
import { useAppStore } from '../../state/app-store';
import { AuthLayout } from './components/auth-layout';

export function VerificationScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token =
    typeof params.token === 'string' && params.token.length <= 4096
      ? params.token
      : undefined;
  const savedEmail = useAppStore((state) => state.verificationEmail);
  const status = useAppStore((state) => state.verificationStatus);
  const error = useAppStore((state) => state.verificationError);
  const resendAt = useAppStore((state) => state.verificationResendAt);
  const resend = useAppStore((state) => state.resendVerification);
  const verify = useAppStore((state) => state.verifyEmail);
  const attemptedToken = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const { colors } = useQuiltTheme();
  const router = useRouter();
  const pending = status === 'sending' || status === 'verifying';
  const seconds = Math.min(60, Math.max(0, Math.ceil((resendAt - now) / 1000)));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  useEffect(() => {
    if (!token || attemptedToken.current === token || pending) return;
    // Avoid submitting the same link twice when effects are replayed.
    attemptedToken.current = token;
    void verify(token).then(() => {
      // Remove the credential from browser history, including failed attempts.
      router.replace('/verify-email');
    });
  }, [token, pending, verify, router]);
  const verified = status === 'verified' && !token;
  const confirming = Boolean(token) || status === 'verifying';
  return (
    <AuthLayout>
      <View className="gap-6">
        <View className="self-start rounded-lg bg-surfaceMuted p-4">
          <Feather
            name={verified ? 'check-circle' : 'mail'}
            size={28}
            color={colors.primary}
            accessible={false}
          />
        </View>
        <View className="gap-3">
          <Text variant="display" className="text-[36px] leading-[44px]">
            {verified
              ? 'Email confirmed.'
              : confirming
                ? 'Confirming your email…'
                : 'Check your inbox.'}
          </Text>
          <Text tone="textMuted">
            {verified
              ? 'This email address is confirmed. You can now use it to sign in to Quilt.'
              : confirming
                ? 'Please wait while we confirm your email address.'
                : savedEmail
                  ? `Look for a Quilt confirmation email at ${savedEmail}. Open the link to continue.`
                  : 'Open the link in your confirmation email. If you need a fresh link, sign in with your email and password first.'}
          </Text>
        </View>
        {verified ? (
          <Button label="Sign in" onPress={() => router.replace('/sign-in')} />
        ) : (
          <View className="gap-5">
            {confirming && (
              <View role="status" aria-live="polite">
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            {!confirming && (
              <Text variant="caption" tone="textMuted">
                The link expires in one hour. If it’s missing, check your spam
                folder.
              </Text>
            )}
            {!confirming && error && (
              <Text role="alert" tone="danger">
                {error}
              </Text>
            )}
            {!confirming && status === 'sent' && (
              <Text role="status" aria-live="polite">
                If this address has an unverified account, a fresh confirmation
                link is on its way.
              </Text>
            )}
            {!confirming && savedEmail && (
              <Button
                label={
                  seconds > 0 ? `Send again in ${seconds}s` : 'Send a new link'
                }
                variant="secondary"
                loading={status === 'sending'}
                disabled={pending || seconds > 0}
                onPress={() => {
                  void resend(savedEmail);
                }}
              />
            )}
          </View>
        )}
        {!verified && (
          <Link href="/sign-in" asChild>
            <Text variant="label" className="self-center py-3 text-primary">
              ← Back to sign in
            </Text>
          </Link>
        )}
      </View>
    </AuthLayout>
  );
}
