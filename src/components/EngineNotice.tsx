import { Alert, Anchor } from '@mantine/core';
import { IconPlugConnectedX } from '@tabler/icons-react';
import { useAppConfig } from '../app-config/ConfigProvider';
import { CONTACT } from '../branding';
import { hrefOf } from '../lib/router';

/** Cảnh báo khi tool cần Apps Script Engine nhưng chưa cấu hình engine.scriptId. */
export function EngineNotice() {
  const { config, canEditConfig } = useAppConfig();
  if (config.engine.scriptId) return null;
  return (
    <Alert color="orange" variant="light" icon={<IconPlugConnectedX />} title="Chưa kết nối Apps Script Engine" mb="lg">
      Tool này cần PEAK Tools Engine để chèn ảnh vào Sheet.{' '}
      {canEditConfig ? (
        <>
          Thêm key <b>engine.scriptId</b> vào tab <b>settings</b> của Sheet cấu hình — xem{' '}
          <Anchor href={hrefOf('settings')} size="sm">
            trang Settings
          </Anchor>
          .
        </>
      ) : (
        `${CONTACT} để thiết lập.`
      )}
    </Alert>
  );
}
