import { useState, type ReactElement } from 'react';
import { Platform } from 'react-native';
import { Menu, useMedia } from 'tamagui';
import { Drawer } from './drawer';
import { Button } from './button';

export interface MenuAction {
  label: string;
  onSelect: () => void;
}
export interface ActionMenuProps {
  label: string;
  trigger: (onPress?: () => void) => ReactElement;
  actions: MenuAction[];
  topInset?: number;
  bottomInset?: number;
}

export function ActionMenu({
  label,
  trigger,
  actions,
  topInset,
  bottomInset,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const media = useMedia();
  if (Platform.OS !== 'web' || !media.md) {
    return (
      <>
        {trigger(() => setOpen(true))}
        <Drawer
          open={open}
          onOpenChange={setOpen}
          title={label}
          description="Choose an option below."
          topInset={topInset}
          bottomInset={bottomInset}
        >
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              label={action.label}
              onPress={() => {
                setOpen(false);
                action.onSelect();
              }}
            />
          ))}
        </Drawer>
      </>
    );
  }
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Menu.Trigger asChild>{trigger()}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          minWidth={220}
          padding={8}
          borderRadius={12}
          backgroundColor="surface"
          borderWidth={1}
          borderColor="border"
          boxShadow="0px 8px 32px rgba(12,24,16,0.12)"
        >
          <Menu.Label padding={12} color="textMuted" fontSize={12}>
            {label}
          </Menu.Label>
          {actions.map((action) => (
            <Menu.Item
              key={action.label}
              minHeight={48}
              padding={12}
              borderRadius={8}
              backgroundColor="surface hover:surfaceMuted focus:surfaceMuted"
              onSelect={action.onSelect}
            >
              <Menu.ItemTitle color="text" fontSize={14}>
                {action.label}
              </Menu.ItemTitle>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
