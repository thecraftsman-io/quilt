import { useState } from 'react';
import { Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import {
  IconButton,
  TextField,
  useQuiltTheme,
  type TextFieldProps,
} from '@quilt/ui';

export function PasswordField(
  props: Omit<TextFieldProps, 'secureTextEntry' | 'endAdornment'>,
) {
  const [visible, setVisible] = useState(false);
  const { colors } = useQuiltTheme();
  return (
    <TextField
      {...props}
      autoCapitalize="none"
      autoCorrect={false}
      secureTextEntry={!visible}
      type={Platform.OS === 'web' ? (visible ? 'text' : 'password') : undefined}
      endAdornment={
        <IconButton
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onPress={() => setVisible(!visible)}
          className="bg-transparent"
        >
          <Feather
            name={visible ? 'eye-off' : 'eye'}
            size={18}
            color={colors.textMuted}
            accessible={false}
          />
        </IconButton>
      }
    />
  );
}
