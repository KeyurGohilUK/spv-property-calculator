(function initialiseTheme() {
  'use strict';

  const STORAGE_KEY = 'spv-theme';
  const DEFAULT_THEME = 'light';
  const THEME_COLOURS = { light: '#966540', dark: '#181411' };

  function readTheme() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY);
      return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  function updateControls(theme, root = document) {
    root.querySelectorAll('[data-theme-toggle]').forEach((control) => {
      const isDark = theme === 'dark';
      control.setAttribute('aria-pressed', String(isDark));
      control.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
      const description = control.querySelector('[data-theme-description]');
      const icon = control.querySelector('[data-theme-icon]');
      if (description) description.textContent = `${isDark ? 'Dark' : 'Light'} appearance`;
      if (icon) icon.textContent = isDark ? '☾' : '☀';
    });
  }

  function applyTheme(theme, persist = false) {
    const selectedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.colorScheme = selectedTheme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = THEME_COLOURS[selectedTheme];
    });
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, selectedTheme); } catch { /* Storage may be unavailable. */ }
    }
    updateControls(selectedTheme);
  }

  function bindThemeControls(root = document) {
    updateControls(readTheme(), root);
    root.querySelectorAll('[data-theme-toggle]').forEach((control) => {
      if (control.dataset.themeBound === 'true') return;
      control.dataset.themeBound = 'true';
      control.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
      });
    });
  }

  applyTheme(readTheme());
  window.SPVTheme = { applyTheme, bindThemeControls, getTheme: readTheme };
  document.addEventListener('DOMContentLoaded', () => bindThemeControls());
}());
