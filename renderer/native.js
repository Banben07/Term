/**
 * Android / browser stand-in for the Electron preload API.
 * One iframe instead of BrowserViews. Hosts live in Preferences.
 * Electron already exposes window.ptyhub, so this file no-ops there.
 */

if (!window.ptyhub) {
  const KEY = 'term.hosts';

  /** @typedef {{ id: string, name: string, url: string }} Host */

  /** @type {Host[]} */
  let hosts = [];
  /** @type {string | null} */
  let activeId = null;
  /** @type {string[]} */
  let live = [];
  /** @type {Set<(payload: { page: string, id: string | null, live: string[] }) => void>} */
  const listeners = new Set();

  document.documentElement.classList.add('native');
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('native');
    const App = window.Capacitor?.Plugins?.App;
    App?.addListener('backButton', () => {
      if (document.body.classList.contains('session')) {
        document.getElementById('back-btn')?.click();
        return;
      }
      App.exitApp();
    });
  });

  function prefs() {
    return window.Capacitor?.Plugins?.Preferences ?? null;
  }

  function frame() {
    return document.getElementById('session-frame');
  }

  /** @param {string | null} raw */
  function parseHosts(raw) {
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(
        (h) => h && typeof h.id === 'string' && typeof h.url === 'string',
      );
    } catch {
      return [];
    }
  }

  function emit() {
    const payload = {
      page: activeId ? 'session' : 'home',
      id: activeId,
      live: live.slice(),
    };
    for (const fn of listeners) fn(payload);
  }

  window.ptyhub = {
    async listHosts() {
      try {
        const plugin = prefs();
        if (plugin) {
          const { value } = await plugin.get({ key: KEY });
          hosts = parseHosts(value);
        } else {
          hosts = parseHosts(localStorage.getItem(KEY));
        }
      } catch {
        hosts = [];
      }
      return hosts;
    },

    async saveHosts(next) {
      hosts = Array.isArray(next) ? next : [];
      const value = JSON.stringify(hosts);
      const plugin = prefs();
      if (plugin) await plugin.set({ key: KEY, value });
      else localStorage.setItem(KEY, value);
      return hosts;
    },

    async connect(id) {
      const host = hosts.find((h) => h.id === id);
      const el = frame();
      if (!host || !el) return { ok: false };
      if (el.dataset.id !== id) {
        el.src = host.url;
        el.dataset.id = id;
      }
      activeId = id;
      if (!live.includes(id)) live = [...live, id];
      emit();
      return { ok: true };
    },

    async home() {
      activeId = null;
      emit();
      return { ok: true };
    },

    async close(id) {
      const el = frame();
      if (el && el.dataset.id === id) {
        el.src = 'about:blank';
        delete el.dataset.id;
      }
      live = live.filter((x) => x !== id);
      if (activeId === id) activeId = null;
      emit();
    },

    async session() {
      return { page: activeId ? 'session' : 'home', id: activeId, live };
    },

    onSession(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
