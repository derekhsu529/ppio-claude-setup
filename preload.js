const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Open links in browser
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Config operations
  applyConfig: (config) => ipcRenderer.invoke('apply-config', config),
  restoreConfig: () => ipcRenderer.invoke('restore-config'),
  checkConfig: () => ipcRenderer.invoke('check-config'),

  // Platform info
  platform: process.platform
});
