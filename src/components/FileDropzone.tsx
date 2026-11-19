import { Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';

type Props = {
  /** Danh sách đuôi/mime cho phép, vd ".json" hoặc "image/png,image/gif" */
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

/** Khung kéo-thả hoặc bấm để chọn file. File chỉ đọc trong trình duyệt, không tải lên đâu cả. */
export function FileDropzone({ accept, multiple = true, onFiles, title, hint, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const allowed = accept.split(',').map((a) => a.trim().toLowerCase());
  const filter = (list: FileList | null) =>
    [...(list ?? [])].filter((f) =>
      allowed.some((a) =>
        a.startsWith('.')
          ? f.name.toLowerCase().endsWith(a)
          : a.endsWith('/*')
            ? f.type.startsWith(a.slice(0, -1))
            : f.type === a,
      ),
    );

  return (
    <UnstyledButton
      onClick={() => !disabled && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const files = filter(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className="file-dropzone"
      data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      w="100%"
    >
      <Stack align="center" gap={6} py="lg">
        <ThemeIcon size={44} radius="xl" variant="light">
          <IconUpload size={22} />
        </ThemeIcon>
        <Text fw={600} size="sm">
          {title}
        </Text>
        {hint && (
          <Text size="xs" c="dimmed" ta="center">
            {hint}
          </Text>
        )}
      </Stack>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = filter(e.currentTarget.files);
          if (files.length) onFiles(files);
          e.currentTarget.value = '';
        }}
      />
    </UnstyledButton>
  );
}

/** Tải 1 Blob về máy. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(2)} MB`;
