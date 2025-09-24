const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, shell } = require('electron');
const isDev = require('electron-is-dev');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'NovaCollab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const localDistPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
    const packagedDistPath = path.join(process.resourcesPath, 'renderer', 'index.html');
    if (fs.existsSync(localDistPath)) {
      mainWindow.loadFile(localDistPath);
    } else {
      mainWindow.loadFile(packagedDistPath);
    }
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
