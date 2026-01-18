(() => {
  const candidates = [
    window.UNIRIDERS_API_BASE,
    window.API_BASE_URL,
    window.UNIRIDERS_API,
    window.API
  ].filter(Boolean);

  const fallbackBase = `${window.location.origin}/api`;
  const resolvedBase = (candidates[0] || fallbackBase).replace(/\/+$/, '');

  window.UNIRIDERS_API_BASE = resolvedBase;
})();
