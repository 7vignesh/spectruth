import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'spectruth-theme';

function current(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

/**
 * Reads the theme the inline bootstrap script already applied, so the toggle
 * starts in the right position rather than flipping after hydration.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === 'undefined' ? 'dark' : current(),
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // A blocked storage write should not break the toggle.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(previous => (previous === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
