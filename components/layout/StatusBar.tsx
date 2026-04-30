'use client';

import { useEffect, useState } from 'react';

export function StatusBar() {
  // Watch for data-theme changes so the status indicator label stays current
  // when the user switches themes via the picker.
  const [theme, setTheme] = useState<'graphite' | 'light'>('graphite');

  useEffect(() => {
    function read() {
      const attr = document.documentElement.getAttribute('data-theme');
      setTheme(attr === 'light' ? 'light' : 'graphite');
    }
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="forge-statusbar">
      <span className="forge-statusbar__item">
        <span className="forge-ember-dot" /> forge · synced
      </span>
      <span className="forge-statusbar__item">capture → research → develop</span>
      <span className="forge-statusbar__right">
        <span className="forge-statusbar__item">⌘K · summon</span>
        <span className="forge-statusbar__item">⌘N · capture</span>
        <span className="forge-statusbar__item">theme · {theme}</span>
      </span>
    </div>
  );
}
