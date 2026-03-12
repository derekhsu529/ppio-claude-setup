const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Open links in browser
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),

  // Environment detection
  checkNode: () => ipcRenderer.invoke('check-node'),
  checkClaude: () => ipcRenderer.invoke('check-claude'),
  installNode: () => ipcRenderer.invoke('install-node'),
  installClaude: () => ipcRenderer.invoke('install-claude'),

  // Listen for streaming install progress
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (event, data) => callback(data));
  },

  // Remove install progress listener
  offInstallProgress: () => {
    ipcRenderer.removeAllListeners('install-progress');
  },

  // Config operations
  detectExistingVars: () => ipcRenderer.invoke('detect-existing-vars'),
  applyConfig: (config) => ipcRenderer.invoke('apply-config', config),
  restoreConfig: () => ipcRenderer.invoke('restore-config'),
  checkConfig: () => ipcRenderer.invoke('check-config'),

  // Post-apply actions
  verifyConfig: () => ipcRenderer.invoke('verify-config'),
  launchClaude: () => ipcRenderer.invoke('launch-claude'),

  // Platform info
  platform: process.platform,

  // App version (from package.json via electron)
  getVersion: () => ipcRenderer.invoke('get-version')
});
