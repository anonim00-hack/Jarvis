const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateStatus: (message) => ipcRenderer.send('update-status', message),
  sendCommand: (message) => ipcRenderer.send('send-command', message),
  openSetting: (message) => ipcRenderer.send('open-setting', message),
  ApplyVisualSettings: (message) => ipcRenderer.send('apply-visual-settings', message),
  SettingInitial: (message) => ipcRenderer.send('settings-send-initial',message),
  
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback),
  onSendCommand: (callback) => ipcRenderer.on('send-command', callback),
  onOpenSetting: (callback) => ipcRenderer.on('open-setting', callback),
  onApplyVisualSettings: (callback) => ipcRenderer.on('apply-visual-settings', callback),
  onSettingInitial: (callback) => ipcRenderer.on('settings-send-initial' , callback),
  
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});