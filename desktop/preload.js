const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('lynxoria', {
  version: process.versions.electron,
});
