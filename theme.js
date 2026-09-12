/**
 * FogBot — Site-Wide Theme Engine (theme.js)
 * Supports Light, Dark, and System Setting (Auto) modes.
 * Defaults to 'system', persists choices in localStorage,
 * synchronizes across tabs, and handles live OS preference changes.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'fogbot_theme_mode'; // 'system' | 'light' | 'dark'

  // Determine system OS color scheme preference
  function getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // Get active stored setting (defaults strictly to 'system')
  function getStoredSetting() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const urlParam = new URLSearchParams(window.location.search).get('theme');
        if (urlParam === 'light' || urlParam === 'dark' || urlParam === 'system') {
          return urlParam;
        }
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch (e) {
      // localStorage may be disabled in private browsing
    }
    return 'system';
  }

  // Resolve effective theme ('light' or 'dark') based on setting
  function resolveTheme(setting) {
    if (setting === 'system') {
      return getSystemPreference();
    }
    return setting;
  }

  // Apply theme attributes to <html> and update UI toggle buttons
  function applyTheme(setting, save = true) {
    const effectiveTheme = resolveTheme(setting);

    // Set attributes on root <html>
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.setAttribute('data-theme-setting', setting);

    // Persist to localStorage if requested
    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, setting);
      } catch (e) {
        console.warn('[Theme] Could not save preference:', e.message);
      }
    }

    // Update active state on any theme switcher controls in DOM
    updateToggleButtons(setting);

    // Dispatch global theme change event
    window.dispatchEvent(
      new CustomEvent('fogbot_theme_change', {
        detail: {
          setting: setting,
          theme: effectiveTheme
        }
      })
    );
  }

  // Update active classes and aria-pressed on toggle buttons
  function updateToggleButtons(activeSetting) {
    const buttons = document.querySelectorAll('.theme-toggle__btn');
    buttons.forEach((btn) => {
      const btnVal = btn.getAttribute('data-theme-val');
      const isActive = btnVal === activeSetting;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  // Generate SVG icon helper
  function getIconSvg(type) {
    if (type === 'light') {
      // Sun icon
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
    if (type === 'dark') {
      // Moon icon
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
    // Monitor / System icon
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
  }

  // Initialize and mount interactive theme toggles
  function initThemeSwitchers() {
    const containers = document.querySelectorAll('.theme-switcher');
    const currentSetting = getStoredSetting();

    containers.forEach((container) => {
      // Avoid duplicate initialization
      if (container.dataset.initialized === 'true') return;
      container.dataset.initialized = 'true';

      container.innerHTML = `
        <div class="theme-toggle" role="group" aria-label="Appearance Mode">
          <button type="button" class="theme-toggle__btn ${currentSetting === 'light' ? 'is-active' : ''}" data-theme-val="light" title="Light Mode" aria-label="Set Light mode" aria-pressed="${currentSetting === 'light'}">
            ${getIconSvg('light')}
            <span class="theme-toggle__label">Light</span>
          </button>
          <button type="button" class="theme-toggle__btn ${currentSetting === 'system' ? 'is-active' : ''}" data-theme-val="system" title="System Setting (Auto)" aria-label="Set System mode" aria-pressed="${currentSetting === 'system'}">
            ${getIconSvg('system')}
            <span class="theme-toggle__label">System</span>
          </button>
          <button type="button" class="theme-toggle__btn ${currentSetting === 'dark' ? 'is-active' : ''}" data-theme-val="dark" title="Dark Mode" aria-label="Set Dark mode" aria-pressed="${currentSetting === 'dark'}">
            ${getIconSvg('dark')}
            <span class="theme-toggle__label">Dark</span>
          </button>
        </div>
      `;

      // Attach click listeners to segmented buttons
      const buttons = container.querySelectorAll('.theme-toggle__btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', function () {
          const val = this.getAttribute('data-theme-val');
          applyTheme(val, true);
        });
      });
    });
  }

  // 1. Immediate Execution (Applies theme instantly)
  const initialSetting = getStoredSetting();
  applyTheme(initialSetting, false);

  // 2. React to OS preference changes if mode is 'system'
  if (window.matchMedia) {
    const osScheme = window.matchMedia('(prefers-color-scheme: dark)');
    osScheme.addEventListener('change', () => {
      const activeSetting = getStoredSetting();
      if (activeSetting === 'system') {
        applyTheme('system', false);
      }
    });
  }

  // 3. Synchronize theme across tabs on same machine
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      const newSetting = e.newValue || 'system';
      applyTheme(newSetting, false);
    }
  });

  // 4. Initialize DOM toggles when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSwitchers);
  } else {
    initThemeSwitchers();
  }

  // Expose API globally for direct access or scripts
  window.FogBotTheme = {
    get: getStoredSetting,
    set: applyTheme,
    resolve: resolveTheme
  };

})();
