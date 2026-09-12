const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ptyhub', {
  listHosts: () => ipcRenderer.invoke('hosts:list'),
  saveHosts: (hosts) => ipcRenderer.invoke('hosts:save', hosts),
  connect: (id) => ipcRenderer.invoke('session:connect', id),
  home: () => ipcRenderer.invoke('session:home'),
  close: (id) => ipcRenderer.invoke('session:close', id),
  session: () => ipcRenderer.invoke('session:get'),
  onSession: (fn) => {
    const listen = (_e, payload) => fn(payload);
    ipcRenderer.on('session', listen);
    return () => ipcRenderer.removeListener('session', listen);
  },
});
