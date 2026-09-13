/**
 * Desktop shell around the existing web UI.
 *
 * Hosts stay alive when you go back to the list. Connecting again just
 * shows that BrowserView. This process registers no accelerators.
 */

import { app, BrowserWindow, BrowserView, ipcMain, Menu, nativeImage, screen } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TITLEBAR = 44;

/** @typedef {{ id: string, name: string, url: string }} Host */

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Map<string, BrowserView>} */
const views = new Map();
/** @type {string | null} */
let visibleId = null;

function hostsPath() {
  return join(app.getPath('userData'), 'hosts.json');
}

function windowStatePath() {
  return join(app.getPath('userData'), 'window.json');
}

/** @typedef {{ x?: number, y?: number, width: number, height: number, maximized?: boolean }} WindowState */

const defaultWindow = { width: 1280, height: 800 };

/** @returns {WindowState} */
function loadWindowState() {
  try {
    const raw = JSON.parse(readFileSync(windowStatePath(), 'utf8'));
    if (!raw || typeof raw.width !== 'number' || typeof raw.height !== 'number') {
      return { ...defaultWindow };
    }
    return {
      x: typeof raw.x === 'number' ? raw.x : undefined,
      y: typeof raw.y === 'number' ? raw.y : undefined,
      width: raw.width,
      height: raw.height,
      maximized: raw.maximized === true,
    };
  } catch {
    return { ...defaultWindow };
  }
}

/** @param {BrowserWindow} target */
function saveWindowState(target) {
  if (target.isDestroyed()) return;
  const bounds = target.getBounds();
  const state = {
    ...bounds,
    maximized: target.isMaximized(),
  };
  const file = windowStatePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

/** @param {WindowState} state */
function visibleBounds(state) {
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    const cx = (state.x ?? 0) + state.width / 2;
    const cy = (state.y ?? 0) + state.height / 2;
    return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height;
  });
  if (!onScreen || state.x === undefined || state.y === undefined) {
    return { width: state.width, height: state.height };
  }
  return { x: state.x, y: state.y, width: state.width, height: state.height };
}

/** @returns {Host[]} */
function loadHosts() {
  try {
    const raw = JSON.parse(readFileSync(hostsPath(), 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter((h) => h && typeof h.id === 'string' && typeof h.url === 'string');
  } catch {
    return [];
  }
}

/** @param {Host[]} hosts */
function saveHosts(hosts) {
  const file = hostsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(hosts, null, 2) + '\n', { mode: 0o600 });
}

function windowAlive() {
  return Boolean(win && !win.isDestroyed());
}

function emit(page, id, status, extra = {}) {
  if (!windowAlive() || win.webContents.isDestroyed()) return;
  win.webContents.send('session', {
    page,
    id,
    status,
    live: [...views.keys()],
    ...extra,
  });
}

function layoutView() {
  if (!windowAlive() || !visibleId) return;
  const view = views.get(visibleId);
  if (!view || view.webContents.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  view.setBounds({
    x: 0,
    y: TITLEBAR,
    width,
    height: Math.max(0, height - TITLEBAR),
  });
  view.setAutoResize({ width: true, height: true });
}

function focusActive() {
  if (!windowAlive()) return;
  if (visibleId) {
    const view = views.get(visibleId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.focus();
      return;
    }
  }
  if (!win.webContents.isDestroyed()) win.webContents.focus();
}

function scheduleFocus() {
  // Cmd+Tab focuses the frame first; wait a tick so the BrowserView wins.
  setImmediate(focusActive);
}

function detachView(view) {
  if (!windowAlive() || !view) return;
  try {
    win.removeBrowserView(view);
  } catch {
    // Window is already tearing down.
  }
}

function hideView() {
  if (visibleId) {
    detachView(views.get(visibleId));
    visibleId = null;
  }
  emit('home', null, 'idle');
}

function showView(id) {
  if (!windowAlive()) return;
  const view = views.get(id);
  if (!view || view.webContents.isDestroyed()) return;
  if (visibleId && visibleId !== id) detachView(views.get(visibleId));
  if (visibleId !== id) win.addBrowserView(view);
  visibleId = id;
  layoutView();
  emit('session', id, 'connected');
  scheduleFocus();
}

function closeView(id, quitting = false) {
  const view = views.get(id);
  views.delete(id);
  if (visibleId === id) visibleId = null;
  if (!view) return;
  detachView(view);
  if (quitting) return;
  const contents = view.webContents;
  if (contents.isDestroyed()) return;
  contents.removeAllListeners();
  try {
    contents.close();
  } catch {
    // Already gone.
  }
}

function closeAllViews() {
  for (const id of [...views.keys()]) closeView(id, true);
}

/**
 * @param {Host} host
 */
function connect(host) {
  if (!win) return;
  const existing = views.get(host.id);
  if (existing) {
    showView(host.id);
    return;
  }

  const next = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `persist:ptyhub-${host.id}`,
    },
  });

  next.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  next.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    emit('session', host.id, 'error', { error: desc || `Failed to load (${code})` });
  });

  views.set(host.id, next);
  showView(host.id);
  emit('session', host.id, 'connecting');
  next.webContents.loadURL(host.url);
}

function createWindow() {
  const iconFile = join(here, 'renderer/assets/mark.png');
  const icon = existsSync(iconFile) ? nativeImage.createFromPath(iconFile) : undefined;
  const saved = loadWindowState();
  const bounds = visibleBounds(saved);

  win = new BrowserWindow({
    ...bounds,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#0b0d12',
    title: 'Term',
    icon,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (saved.maximized) win.maximize();

  const persist = () => {
    if (windowAlive()) saveWindowState(win);
  };
  win.on('resize', () => {
    layoutView();
    persist();
  });
  win.on('move', persist);
  win.on('focus', scheduleFocus);
  win.webContents.on('focus', () => {
    if (visibleId) scheduleFocus();
  });
  win.on('close', () => {
    persist();
    closeAllViews();
  });
  win.on('closed', () => {
    closeAllViews();
    win = null;
    visibleId = null;
  });

  win.once('ready-to-show', () => win?.show());
  win.loadFile(join(here, 'renderer/index.html'));
}

function installIpc() {
  ipcMain.handle('hosts:list', () => loadHosts());
  ipcMain.handle('hosts:save', (_e, hosts) => {
    if (!Array.isArray(hosts)) return loadHosts();
    saveHosts(hosts);
    return loadHosts();
  });
  ipcMain.handle('session:connect', (_e, id) => {
    const host = loadHosts().find((h) => h.id === id);
    if (!host) return { ok: false, error: 'Unknown host' };
    connect(host);
    return { ok: true };
  });
  ipcMain.handle('session:home', () => {
    hideView();
    return { ok: true };
  });
  ipcMain.handle('session:close', (_e, id) => {
    closeView(id);
    emit('home', null, 'idle');
    return { ok: true };
  });
  ipcMain.handle('session:get', () => ({
    page: visibleId ? 'session' : 'home',
    id: visibleId,
    status: visibleId ? 'connected' : 'idle',
    live: [...views.keys()],
  }));
}

function installMenu() {
  const mac = process.platform === 'darwin';
  // On Windows/Linux, Ctrl+C is SIGINT in the shell. Use Ctrl+Shift+C/V there.
  const copy = mac ? { role: 'copy' } : { role: 'copy', accelerator: 'Ctrl+Shift+C' };
  const paste = mac ? { role: 'paste' } : { role: 'paste', accelerator: 'Ctrl+Shift+V' };
  const cut = mac ? { role: 'cut' } : { role: 'cut', accelerator: 'Ctrl+Shift+X' };

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [];
  if (mac) {
    template.push({
      label: 'Term',
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    });
  }
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      cut,
      copy,
      paste,
      { role: 'selectAll' },
    ],
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  installMenu();
  installIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else scheduleFocus();
  });
  app.on('browser-window-focus', (_event, focused) => {
    if (focused === win) scheduleFocus();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
