import { Alert, Box, Button, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconBrandGoogleFilled } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { AuthorCredit } from '../components/AuthorCredit';
import { LogoMark } from '../components/Logo';
import { ENV } from '../env';

/** Bộ sinh số ngẫu nhiên có seed (mulberry32) — sao trải đều tự nhiên nhưng cố định giữa các lần tải */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(723);

const STARS = Array.from({ length: 90 }, () => {
  const r = rand();
  return {
    left: rand() * 100,
    top: Math.pow(rand(), 1.4) * 68, // dày hơn ở phía trên bầu trời
    size: r > 0.93 ? 2.6 : r > 0.7 ? 1.8 : 1.1,
    delay: rand() * 5,
    duration: 2.5 + rand() * 3.5,
  };
});

/** Sao 4 cánh lấp lánh quanh thẻ */
const SPARKLES = [
  { left: '18%', top: '22%', size: 18, delay: 0 },
  { left: '80%', top: '16%', size: 14, delay: 1.2 },
  { left: '70%', top: '42%', size: 10, delay: 2.1 },
  { left: '26%', top: '48%', size: 12, delay: 0.7 },
  { left: '88%', top: '34%', size: 20, delay: 2.8 },
  { left: '9%', top: '38%', size: 9, delay: 1.7 },
];

const METEORS = [
  { top: '8%', left: '78%', duration: 9, delay: 1.5 },
  { top: '4%', left: '48%', duration: 13, delay: 6 },
  { top: '18%', left: '95%', duration: 11, delay: 9.5 },
];

const DUST = Array.from({ length: 22 }, () => ({
  left: rand() * 100,
  size: 1.5 + rand() * 2.5,
  duration: 14 + rand() * 10,
  delay: -rand() * 20,
}));

const STAR_PATH = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z';

export function LoginPage() {
  const { status, error, signIn } = useAuth();
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Parallax theo chuột + đèn soi trên thẻ + bụi sao theo con trỏ
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    let lastTrail = 0;

    const apply = () => {
      raf = 0;
      if (!last) return;
      scene.style.setProperty('--mx', ((last.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      scene.style.setProperty('--my', ((last.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      const card = cardRef.current;
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--cx', `${last.clientX - r.left}px`);
        card.style.setProperty('--cy', `${last.clientY - r.top}px`);
      }
    };

    const spawnTrail = (e: PointerEvent) => {
      const now = performance.now();
      if (e.pointerType !== 'mouse' || now - lastTrail < 28 || scene.childElementCount > 160) return;
      lastTrail = now;
      const dot = document.createElement('span');
      const star = Math.random() < 0.35;
      dot.className = star ? 'login-trail login-trail-star' : 'login-trail';
      const size = star ? 10 + Math.random() * 8 : 4 + Math.random() * 7;
      dot.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${size}px;height:${size}px;--dx:${(Math.random() - 0.5) * 50}px;--dy:${10 + Math.random() * 40}px`;
      dot.addEventListener('animationend', () => dot.remove());
      scene.appendChild(dot);
    };

    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
      spawnTrail(e);
    };
    scene.addEventListener('pointermove', onMove);
    return () => {
      scene.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <Box ref={sceneRef} className="login-scene">
      {/* ---------- Bầu trời ---------- */}
      <div className="login-layer login-depth-1" aria-hidden>
        <div className="login-aurora login-aurora-a" />
        <div className="login-aurora login-aurora-b" />
        <div className="login-aurora login-aurora-c" />
      </div>
      <div className="login-layer login-depth-2" aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={i}
            className="login-star"
            style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
          />
        ))}
        {METEORS.map((m, i) => (
          <span key={i} className="login-meteor" style={{ top: m.top, left: m.left, animationDuration: `${m.duration}s`, animationDelay: `${m.delay}s` }} />
        ))}
      </div>
      <div className="login-layer login-depth-3" aria-hidden>
        {SPARKLES.map((s, i) => (
          <svg key={i} className="login-sparkle" viewBox="0 0 24 24" width={s.size} height={s.size} style={{ left: s.left, top: s.top, animationDelay: `${s.delay}s` }}>
            <path d={STAR_PATH} />
          </svg>
        ))}
      </div>

      {/* ---------- Dãy núi + cờ trên đỉnh ---------- */}
      {/* viewBox nới lên trên (y từ -140) để cờ & ánh sáng nằm trọn trong khung, không bị cắt */}
      <svg className="login-mountains" viewBox="0 -140 1440 500" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <linearGradient id="mt-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a35b0" />
            <stop offset="1" stopColor="#1a1440" />
          </linearGradient>
          <linearGradient id="mt-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2e2278" />
            <stop offset="1" stopColor="#120e2e" />
          </linearGradient>
          <linearGradient id="mt-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#181338" />
            <stop offset="1" stopColor="#0b0a1a" />
          </linearGradient>
          <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".75" />
            <stop offset="1" stopColor="#e4dcff" stopOpacity=".25" />
          </linearGradient>
          <linearGradient id="flag" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7c8bff" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
          <linearGradient id="litFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".12" />
            <stop offset=".7" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="halo">
            <stop offset="0" stopColor="#d9ccff" stopOpacity=".55" />
            <stop offset=".4" stopColor="#a78bfa" stopOpacity=".22" />
            <stop offset="1" stopColor="#8b3dff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="login-depth-4">
          {/* Ánh sáng viền sau đỉnh — vẽ trước núi để núi che nửa dưới */}
          <circle className="login-halo" cx="1080" cy="10" r="120" fill="url(#halo)" />
          <path
            fill="url(#mt-back)"
            opacity=".9"
            d="M-80 230 L120 170 L220 205 L360 120 L470 180 L560 150 L700 100 L820 160 L930 120 L1080 20 L1200 135 L1300 170 L1520 130 L1520 400 L-80 400 Z"
          />
          {/* Mặt sườn đón sáng */}
          <path d="M1080 20 L930 120 L960 150 L1040 230 L1080 290 L1092 160 Z" fill="url(#litFace)" />
          {/* Tuyết bám theo 2 sườn núi */}
          <path d="M1080 20 L1020 60 L1036 57 L1050 68 L1066 56 L1084 67 L1100 55 L1112 61 L1122 60 Z" fill="url(#snow)" />
          {/* Cột cờ + cờ */}
          <line x1="1080" y1="21" x2="1080" y2="-24" stroke="#ece8ff" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="1080" cy="-24.5" r="1.6" fill="#fff" />
          <path className="login-flag" d="M1080.7 -23 C1087 -26 1093 -19 1104 -21.5 L1101 -10.5 C1092 -8.5 1087 -14.5 1080.7 -12 Z" fill="url(#flag)" />
        </g>
        <g className="login-depth-5">
          <path fill="url(#mt-mid)" d="M-80 280 L140 210 L260 250 L400 170 L520 240 L640 190 L760 260 L880 200 L1010 250 L1150 180 L1290 245 L1520 200 L1520 400 L-80 400 Z" />
        </g>
        <g className="login-depth-6">
          <path fill="url(#mt-front)" d="M-80 320 L180 270 L330 305 L500 255 L660 300 L820 265 L980 310 L1140 270 L1300 300 L1520 280 L1520 400 L-80 400 Z" />
        </g>
      </svg>
      <div className="login-fog" aria-hidden />
      <div className="login-layer" aria-hidden>
        {DUST.map((d, i) => (
          <span key={i} className="login-dust" style={{ left: `${d.left}%`, width: d.size, height: d.size, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }} />
        ))}
      </div>

      {/* ---------- Thẻ đăng nhập ---------- */}
      <div className="login-card-wrap">
        <Stack ref={cardRef} className="login-card" align="center" gap={0}>
          <div className="login-mark">
            <LogoMark size={68} />
          </div>
          <Text className="login-wordmark" mt="lg">
            P.E.A.K
          </Text>
          <Text className="login-tagline" size="sm" mt={8} lts={3} tt="uppercase" fw={500}>
            Internal toolkit
          </Text>

          <Box w="100%" mt={36}>
            {!ENV.googleClientId ? (
              <Alert color="red" variant="filled" icon={<IconAlertTriangle />} title="Thiếu cấu hình">
                Chưa đặt <code>VITE_GOOGLE_CLIENT_ID</code>.
              </Alert>
            ) : (
              <Button
                size="lg"
                radius="xl"
                fullWidth
                className="login-button"
                leftSection={status === 'loading' ? <Loader size={18} color="dark" /> : <IconBrandGoogleFilled size={20} />}
                onClick={signIn}
                disabled={status === 'loading'}
              >
                Đăng nhập với Google
              </Button>
            )}
            {ENV.orgDomain && (
              <Text size="xs" c="rgba(255,255,255,.45)" ta="center" mt="sm">
                Dành cho tài khoản @{ENV.orgDomain}
              </Text>
            )}
            {error && (
              <Alert color="red" variant="filled" icon={<IconAlertTriangle />} mt="md" radius="md">
                {error}
              </Alert>
            )}
          </Box>
        </Stack>
      </div>

      <Box className="login-footer">
        <AuthorCredit inverted />
      </Box>
    </Box>
  );
}
