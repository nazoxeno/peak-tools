import { Text, Tooltip } from '@mantine/core';
import { APP_VERSION, BUILD_DATE } from '../branding';

/** Phiên bản build ở góc phải dưới màn hình — nhỏ, mờ, rê chuột vào mới rõ. */
export function BuildVersion() {
  return (
    <Tooltip label={`Build ${BUILD_DATE}`} position="top-end" withArrow>
      <Text className="build-version" size="xs" ff="monospace" c="dimmed">
        {APP_VERSION}
      </Text>
    </Tooltip>
  );
}
