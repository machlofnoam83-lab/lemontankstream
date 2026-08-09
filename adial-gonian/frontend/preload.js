/**
 * Preload script - Exposes safe IPC methods to the renderer
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // HUD position controls
  moveCenter: () => ipcRenderer.send('hud:move-center'),
  moveSide: () => ipcRenderer.send('hud:move-side'),
  hide: () => ipcRenderer.send('hud:hide'),
  show: () => ipcRenderer.send('hud:show'),
  setOpacity: (opacity) => ipcRenderer.send('hud:set-opacity', opacity),

  // Window info
  getPlatform: () => process.platform,
});
