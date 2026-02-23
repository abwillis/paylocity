
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronOverlay', {
  requestReload: () => ipcRenderer.send('overlay:reload'),
  moveBy: (dx, dy) => ipcRenderer.send('overlay:move-by', { dx, dy })
});

