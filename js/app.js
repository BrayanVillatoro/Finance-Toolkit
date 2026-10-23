/* App shell: tabs, theme toggle, reset, backup export/import */
(function (FT) {
  const html = document.documentElement;

  // Tabs (the URL hash remembers the open tab, e.g. index.html#mortgage)
  const tabs = document.querySelectorAll('.tab');
  function show(name) {
    if (!document.getElementById(name)) name = FT.store.get('tab') || 'overview';
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('.calc').forEach(s => { s.hidden = s.id !== name; });
    FT.store.set('tab', name);
  }
  tabs.forEach(t => t.addEventListener('click', () => { location.hash = t.dataset.tab; }));
  // The hash matches the section's id, so the browser jumps down to it; stay at the top so the tabs stay visible.
  window.addEventListener('hashchange', () => { show(location.hash.slice(1)); window.scrollTo(0, 0); });
  // On first load the browser re-applies the jump after the load event, so reset just after it.
  window.addEventListener('load', () => setTimeout(() => { if (location.hash) window.scrollTo(0, 0); }));
  show(location.hash.slice(1));

  // Theme
  const savedTheme = FT.store.get('theme');
  if (savedTheme) html.dataset.theme = savedTheme;
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    html.dataset.theme = dark ? 'light' : 'dark';
    FT.store.set('theme', html.dataset.theme);
  });

  // Reset a calculator back to its defaults
  document.querySelectorAll('[data-reset]').forEach(btn => btn.addEventListener('click', () => {
    if (!confirm('Reset this calculator to its default values?')) return;
    btn.dataset.reset.split(' ').forEach(FT.store.remove);
    location.reload();
  }));

  // Reset every calculator (keeps the theme and the open tab)
  document.getElementById('reset-all-btn').addEventListener('click', () => {
    if (!confirm('Reset every tab to its default values? Consider exporting a backup first.')) return;
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('ft:') && k !== 'ft:theme' && k !== 'ft:tab')
        .forEach(k => localStorage.removeItem(k));
    } catch (e) { /* storage unavailable */ }
    location.reload();
  });

  // Backup: download / restore everything this app saved
  document.getElementById('export-btn').addEventListener('click', () => {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('ft:')) data[k] = localStorage.getItem(k);
      }
    } catch (e) { /* storage unavailable */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `finance-toolkit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const importInput = document.getElementById('import-input');
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      Object.keys(data).forEach(k => {
        if (k.startsWith('ft:') && typeof data[k] === 'string') localStorage.setItem(k, data[k]);
      });
      location.reload();
    } catch (e) {
      alert('That file could not be imported. Make sure it is a Finance Toolkit backup (.json).');
    }
  });
})(window.FT);
