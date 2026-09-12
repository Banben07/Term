/**
 * Host list page. Connecting hides this page and shows the remote UI
 * under the title bar. No key map — buttons only.
 */

const api = window.ptyhub;

/** @typedef {{ id: string, name: string, url: string }} Host */

/** @type {Host[]} */
let hosts = [];
/** @type {string | null} */
let activeId = null;
/** @type {string[]} */
let live = [];
/** @type {string | null} */
let editingId = null;

const pageEl = document.getElementById('page');
const hostsEl = document.getElementById('hosts');
const pillsEl = document.getElementById('pills');
const modalEl = document.getElementById('modal');
const formEl = document.getElementById('form');
const formTitle = document.getElementById('form-title');
const formError = document.getElementById('form-error');
const nameField = document.getElementById('field-name');
const urlField = document.getElementById('field-url');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back-btn');
const addBtn = document.getElementById('add-btn');
const heroSub = document.getElementById('hero-sub');

function uid() {
  return crypto.randomUUID();
}

function hostLabel(host) {
  try {
    return new URL(host.url).host;
  } catch {
    return host.url;
  }
}

function hostName(host) {
  return host.name || hostLabel(host);
}

function activeHost() {
  return hosts.find((h) => h.id === activeId) ?? null;
}

function setPage(mode) {
  const connected = mode === 'session';
  document.body.classList.toggle('session', connected);
  pageEl.hidden = connected;
  backBtn.hidden = !connected;
  addBtn.hidden = connected;
  titleEl.textContent = connected ? hostName(activeHost() ?? { name: 'Term', url: '' }) : 'Term';
  renderPills();
}

function openForm(host) {
  editingId = host ? host.id : null;
  formTitle.textContent = host ? 'Edit host' : 'New host';
  nameField.value = host?.name ?? '';
  urlField.value = host?.url ?? '';
  formError.hidden = true;
  formError.textContent = '';
  modalEl.hidden = false;
  nameField.focus();
}

function closeForm() {
  editingId = null;
  formEl.reset();
  modalEl.hidden = true;
}

function closeMenus() {
  for (const card of hostsEl.querySelectorAll('.card.open')) card.classList.remove('open');
  document.getElementById('host-menu')?.remove();
}

function menuItem(label, onClick, danger) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  if (danger) btn.className = 'danger';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenus();
    onClick();
  });
  return btn;
}

/** @param {HTMLElement} card */
function toggleMenu(card, host) {
  const open = card.classList.contains('open');
  closeMenus();
  if (open) return;

  const menu = document.createElement('div');
  menu.id = 'host-menu';
  menu.className = 'menu';
  menu.append(
    menuItem('Edit', () => openForm(host)),
    menuItem('Remove', () => void removeHost(host.id), true),
  );
  card.classList.add('open');
  document.body.append(menu);

  const box = card.getBoundingClientRect();
  menu.style.top = `${box.bottom + 4}px`;
  menu.style.left = `${Math.max(8, box.right - 128)}px`;
}

function closeButton(onClick, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.title = title;
  btn.textContent = '×';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

async function closeSession(id) {
  await api.close(id);
  live = live.filter((x) => x !== id);
  if (activeId === id) {
    activeId = null;
    setPage('home');
  }
  render();
}

function renderPills() {
  pillsEl.replaceChildren();
  for (const id of live) {
    const host = hosts.find((h) => h.id === id);
    if (!host) continue;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = id === activeId ? 'pill active' : 'pill';
    const label = document.createElement('span');
    label.textContent = hostName(host);
    pill.append(label, closeButton(() => void closeSession(id), `Close ${hostName(host)}`));
    pill.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      void connect(id);
    });
    pillsEl.append(pill);
  }
}

function render() {
  hostsEl.replaceChildren();
  const n = hosts.length;
  const open = live.length;
  heroSub.textContent = n
    ? `${n} host${n === 1 ? '' : 's'}${open ? ` · ${open} open` : ''}`
    : 'Add a ptyhub URL. Sessions stay on the machine.';

  if (n === 0) {
    const empty = document.createElement('li');
    empty.className = 'none';
    const img = document.createElement('img');
    img.src = './assets/mark.svg';
    img.alt = '';
    const title = document.createElement('strong');
    title.textContent = 'No hosts yet';
    const hint = document.createElement('span');
    hint.textContent = 'New in the title bar, or drop a link here later.';
    empty.append(img, title, hint);
    hostsEl.append(empty);
    renderPills();
    return;
  }

  for (const host of hosts) {
    const isLive = live.includes(host.id);
    const card = document.createElement('li');
    card.className = isLive ? 'card live' : 'card';

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'host';
    row.addEventListener('click', () => void connect(host.id));

    const badge = document.createElement('img');
    badge.className = 'badge';
    badge.src = './assets/mark.svg';
    badge.alt = '';

    const meta = document.createElement('span');
    meta.className = 'meta';
    const name = document.createElement('strong');
    name.textContent = hostName(host);
    const url = document.createElement('em');
    url.textContent = hostLabel(host);
    meta.append(name, url);
    if (isLive) {
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = 'Open';
      meta.append(status);
    }
    row.append(badge, meta);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.title = 'More';
    more.textContent = '⋯';
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(card, host);
    });

    card.append(row, more);
    if (isLive) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.title = `Close ${hostName(host)}`;
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        void closeSession(host.id);
      });
      card.append(close);
    }
    hostsEl.append(card);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add-card';
  add.textContent = '+  New host';
  add.addEventListener('click', () => openForm(null));
  const addWrap = document.createElement('li');
  addWrap.append(add);
  hostsEl.append(addWrap);

  renderPills();
}

function normalizeUrl(raw) {
  const value = raw.trim();
  if (!value) return { error: 'URL is required' };
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'Enter a full URL, for example http://127.0.0.1:7420' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http and https URLs are allowed' };
  }
  return { url: parsed.href };
}

async function persist(next) {
  hosts = await api.saveHosts(next);
  render();
}

async function connect(id) {
  const result = await api.connect(id);
  if (!result.ok) return;
  activeId = id;
  if (!live.includes(id)) live = [...live, id];
  setPage('session');
}

async function goHome() {
  await api.home();
  activeId = null;
  setPage('home');
  render();
}

async function removeHost(id) {
  if (live.includes(id)) await api.close(id);
  if (editingId === id) closeForm();
  await persist(hosts.filter((h) => h.id !== id));
  if (id === activeId) {
    activeId = null;
    setPage('home');
  }
}

document.addEventListener('click', () => closeMenus());
addBtn.addEventListener('click', () => openForm(null));
backBtn.addEventListener('click', () => void goHome());
document.getElementById('form-cancel').addEventListener('click', () => closeForm());
modalEl.addEventListener('click', (e) => {
  if (e.target === modalEl) closeForm();
});

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameField.value.trim();
  const parsed = normalizeUrl(urlField.value);
  if (parsed.error) {
    formError.hidden = false;
    formError.textContent = parsed.error;
    urlField.focus();
    return;
  }

  const next = hosts.slice();
  if (editingId) {
    const i = next.findIndex((h) => h.id === editingId);
    if (i >= 0) next[i] = { ...next[i], name, url: parsed.url };
  } else {
    next.push({ id: uid(), name, url: parsed.url });
  }
  void persist(next).then(() => closeForm());
});

api.onSession((payload) => {
  live = payload.live ?? [];
  activeId = payload.id;
  if (payload.page === 'home') {
    setPage('home');
    render();
    return;
  }
  if (payload.page === 'session') setPage('session');
});

void (async () => {
  hosts = await api.listHosts();
  const session = await api.session();
  live = session.live ?? [];
  activeId = session.id;
  render();
  setPage(session.page === 'session' ? 'session' : 'home');
})();
