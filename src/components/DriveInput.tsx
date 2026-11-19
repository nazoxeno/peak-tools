import { ActionIcon, Group, TextInput, Tooltip, type TextInputProps } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandGoogleDrive, IconExternalLink, IconFileSpreadsheet, IconFolder } from '@tabler/icons-react';
import { useState } from 'react';
import { extractId } from '../google/drive';
import { isPickerAvailable, pickFromDrive, type PickKind } from '../google/picker';

type Props = Omit<TextInputProps, 'onChange' | 'value'> & {
  kind: PickKind;
  value: string;
  onValueChange: (value: string) => void;
  /** Từ khoá tìm kiếm điền sẵn khi mở Picker, vd "UI Checklist". */
  searchQuery?: string;
};

/**
 * Ô nhập link Drive + nút mở Google Picker để chọn folder / Google Sheet.
 * Chọn xong sẽ điền link và hiện tên item bên dưới.
 */
export function DriveInput({ kind, value, onValueChange, searchQuery, description, disabled, ...rest }: Props) {
  const [picked, setPicked] = useState<{ name: string; url: string } | null>(null);
  const [opening, setOpening] = useState(false);

  async function openPicker() {
    setOpening(true);
    try {
      const item = await pickFromDrive(kind, typeof rest.label === 'string' ? rest.label : undefined, searchQuery);
      if (item) {
        const url =
          item.url ||
          (kind === 'folder'
            ? `https://drive.google.com/drive/folders/${item.id}`
            : `https://docs.google.com/spreadsheets/d/${item.id}/edit`);
        setPicked({ name: item.name, url });
        onValueChange(url);
      }
    } catch (e) {
      notifications.show({ color: 'red', title: 'Không mở được Google Drive', message: (e as Error).message });
    } finally {
      setOpening(false);
    }
  }

  // Chỉ hiện tên khi ô vẫn đang chứa đúng link đã chọn
  const pickedName = picked && picked.url === value ? picked.name : null;
  const Icon = kind === 'folder' ? IconFolder : IconFileSpreadsheet;

  // Link chuẩn dựng từ ID (chấp nhận cả link đầy đủ lẫn ID trần)
  const id = extractId(value);
  const openUrl = id
    ? kind === 'folder'
      ? `https://drive.google.com/drive/folders/${id}`
      : `https://docs.google.com/spreadsheets/d/${id}/edit`
    : null;
  const showPicker = isPickerAvailable();

  return (
    <TextInput
      {...rest}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
      disabled={disabled}
      leftSection={<Icon size={18} />}
      description={pickedName ? `${kind === 'folder' ? '📁' : '📊'} ${pickedName}` : description}
      rightSectionWidth={showPicker ? 76 : 42}
      rightSection={
        <Group gap={4} wrap="nowrap">
          <Tooltip label={openUrl ? 'Mở trong tab mới' : 'Chưa có link hợp lệ'}>
            <ActionIcon
              component="a"
              href={openUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              variant="subtle"
              color="gray"
              size="lg"
              disabled={!openUrl}
              aria-label="Mở link"
            >
              <IconExternalLink size={18} />
            </ActionIcon>
          </Tooltip>
          {showPicker && (
            <Tooltip label={kind === 'folder' ? 'Chọn folder trên Drive' : 'Chọn Sheet trên Drive'}>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={openPicker}
                loading={opening}
                disabled={disabled}
                aria-label="Chọn trên Google Drive"
              >
                <IconBrandGoogleDrive size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
    />
  );
}
