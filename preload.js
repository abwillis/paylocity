const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('api', {
  // safe, minimal surface
});
