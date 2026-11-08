import { useRef, useState, type ComponentRef } from 'react';
import { Link, useRouter } from 'expo-router';
import { ClientError } from '../../lib/client';
import { useAppStore } from '../../state/app-store';
import { AuthLayout } from './components/auth-layout';
import { SignInWithEmailSchema, SignUpWithEmailSchema } from '@quilt/contracts';
import { Button, Text, TextField, View } from '@quilt/ui';
import { PasswordField } from './components/password-field';

type AuthMode = 'sign-in' | 'sign-up';
type Field = 'name' | 'email' | 'password';
type Values = Record<Field, string>;
const copy = {
  'sign-in': {
    title: 'Pick up where you left off.',
    subtitle: 'Sign in to your household’s spending and plans.',
    action: 'Sign in',
  },
  'sign-up': {
    title: 'Make shared money simpler.',
    subtitle: 'Create your account. Then make a space for your household.',
    action: 'Create account',
  },
} satisfies Record<
  AuthMode,
  { title: string; subtitle: string; action: string }
>;

function validate(mode: AuthMode, values: Values) {
  const schema =
    mode === 'sign-up' ? SignUpWithEmailSchema : SignInWithEmailSchema;
  const result = schema.safeParse({ ...values, email: values.email.trim() });
  const errors: Partial<Record<Field, string>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (
        (field === 'name' || field === 'email' || field === 'password') &&
        !errors[field]
      )
        errors[field] = issue.message;
    }
  }
  return errors;
}

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({
    name: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const pending = useAppStore((state) => state.authPending);
  const signIn = useAppStore((state) => state.signIn);
  const register = useAppStore((state) => state.register);
  const submitting = useRef(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const nameRef = useRef<ComponentRef<typeof TextField>>(null);
  const emailRef = useRef<ComponentRef<typeof TextField>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextField>>(null);
  const isSignUp = mode === 'sign-up';
  const content = copy[mode];
  const change = (field: Field, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setSubmissionError(undefined);
  };
  const blur = (field: Field) => {
    setErrors((previous) => ({
      ...previous,
      [field]: validate(mode, values)[field],
    }));
  };
  const submit = async () => {
    if (submitting.current) return;
    const nextErrors = validate(mode, values);
    setErrors(nextErrors);
    setSubmissionError(undefined);
    if (nextErrors.name) nameRef.current?.focus();
    else if (nextErrors.email) emailRef.current?.focus();
    else if (nextErrors.password) passwordRef.current?.focus();
    else {
      submitting.current = true;
      try {
        const credentials = {
          email: values.email.trim(),
          password: values.password,
        };
        const outcome = isSignUp
          ? await register({ ...credentials, name: values.name.trim() })
          : await signIn(credentials);
        if (outcome.status === 'verification-required')
          router.replace('/verify-email');
        setValues({ name: '', email: '', password: '' });
      } catch (error: unknown) {
        setSubmissionError(
          error instanceof ClientError && error.status === 429
            ? 'Too many attempts. Give it a moment, then try again.'
            : isSignUp &&
                error instanceof ClientError &&
                error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
              ? 'An account with this email already exists. Sign in instead.'
              : error instanceof ClientError &&
                  error.code === 'SESSION_UNAVAILABLE'
                ? 'Your session couldn’t be opened. Please sign in again.'
                : error instanceof ClientError &&
                    error.status >= 400 &&
                    error.status < 500
                  ? isSignUp
                    ? 'We couldn’t create this account. Check your details, or sign in if you already have one.'
                    : 'That email and password don’t match. Please try again.'
                  : 'We couldn’t reach Quilt. Check your connection and try again.',
        );
      } finally {
        submitting.current = false;
      }
    }
  };
  return (
    <AuthLayout>
      <View className="gap-8">
        <View className="gap-3">
          <Text
            variant="display"
            className="text-[36px] leading-[44px] tracking-[-1.3px]"
          >
            {content.title}
          </Text>
          <Text tone="textMuted">{content.subtitle}</Text>
        </View>
        <View className="gap-5">
          {isSignUp && (
            <TextField
              ref={nameRef}
              label="Your name"
              placeholder="e.g. Alex"
              value={values.name}
              onChangeText={(value) => change('name', value)}
              onBlur={() => blur('name')}
              error={errors.name}
              editable={!pending}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          )}
          <TextField
            ref={emailRef}
            label="Email address"
            placeholder="you@example.com"
            value={values.email}
            onChangeText={(value) => change('email', value)}
            onBlur={() => blur('email')}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <View className="gap-2">
            <PasswordField
              ref={passwordRef}
              editable={!pending}
              label="Password"
              placeholder={
                isSignUp ? 'Create a password' : 'Enter your password'
              }
              value={values.password}
              onChangeText={(value) => change('password', value)}
              onBlur={() => blur('password')}
              error={errors.password}
              hint={
                isSignUp
                  ? '10+ characters with uppercase, lowercase, number & symbol.'
                  : undefined
              }
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              returnKeyType="go"
              onSubmitEditing={() => {
                void submit();
              }}
            />
          </View>
          {submissionError && (
            <View
              role="alert"
              aria-live="assertive"
              className="rounded-md bg-surfaceMuted p-4"
            >
              <Text variant="label" tone="danger">
                {submissionError}
              </Text>
            </View>
          )}
          <Button
            label={content.action}
            loading={pending}
            onPress={() => {
              void submit();
            }}
            className="w-full"
          />
        </View>
        <View className="border-t border-border pt-6 items-center gap-2">
          <View className="flex-row flex-wrap items-center justify-center gap-1">
            <Text variant="label" tone="textMuted">
              {isSignUp ? 'Already have an account?' : 'New to Quilt?'}
            </Text>
            <Link href={isSignUp ? '/sign-in' : '/sign-up'} asChild>
              <Text variant="label" className="py-3 px-1 text-primary">
                {isSignUp ? 'Sign in' : 'Create an account'} →
              </Text>
            </Link>
          </View>
          <Link href="/" asChild>
            <Text variant="caption" tone="textMuted" className="py-3">
              ← About Quilt
            </Text>
          </Link>
        </View>
      </View>
    </AuthLayout>
  );
}
