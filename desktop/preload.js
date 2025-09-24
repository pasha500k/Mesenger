const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('novacollab', {
  version: process.versions.electron,
});
