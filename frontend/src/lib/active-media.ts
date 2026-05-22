// Active media id lives in two places:
//   1. URL query (?media=<id>) — wins, makes the active media shareable
//   2. localStorage — survives reloads when the URL doesn't carry it
//
// FE3 (launch dialog) writes both; views that depend on an active media
// (sessions, studio) read via the hook below. Returning null is a valid
// state — callers render a "set an active media" prompt.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'loggingstudio.active_media';

export function useActiveMediaId(): [
  string | null,
  (id: string | null) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('media');
  const [value, setValue] = useState<string | null>(() => {
    if (fromUrl) return fromUrl;
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  // URL → state sync (in case another component changes ?media=)
  useEffect(() => {
    if (fromUrl && fromUrl !== value) {
      setValue(fromUrl);
      window.localStorage.setItem(STORAGE_KEY, fromUrl);
    }
  }, [fromUrl, value]);

  const update = useCallback(
    (id: string | null) => {
      setValue(id);
      if (id) {
        window.localStorage.setItem(STORAGE_KEY, id);
        const next = new URLSearchParams(searchParams);
        next.set('media', id);
        setSearchParams(next, { replace: true });
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        const next = new URLSearchParams(searchParams);
        next.delete('media');
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );

  return [value, update];
}
