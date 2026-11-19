import { useEffect, useState } from 'react';

/**
 * Hash router tối giản (#/clone_folder) — GitHub Pages không hỗ trợ SPA fallback
 * nên dùng hash để reload trang không bị 404.
 */
const parse = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';

export function useRoute(): string {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const hrefOf = (id: string) => `#/${id}`;
