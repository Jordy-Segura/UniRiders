(function() {
  const STORAGE_KEY = 'uniriders_theme';
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  function getStoredTheme() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function determineInitialTheme() {
    const stored = getStoredTheme();
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    return prefersDarkScheme.matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    document.documentElement.setAttribute('data-theme', theme);
    syncToggleButtons(theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  function syncToggleButtons(theme) {
    const isDark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.dataset.theme = theme;
      button.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      button.innerHTML = isDark ? '🌞' : '🌙';
      button.classList.toggle('is-dark', isDark);
    });
  }

  function setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const initialTheme = determineInitialTheme();
    applyTheme(initialTheme);

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', toggleTheme);
    });
  });

  prefersDarkScheme.addEventListener('change', (event) => {
    if (!getStoredTheme()) {
      setTheme(event.matches ? 'dark' : 'light');
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      applyTheme(event.newValue);
    }
  });

  window.ThemeManager = {
    setTheme,
    getCurrentTheme: () => (document.body.classList.contains('dark-mode') ? 'dark' : 'light')
  };
})();
