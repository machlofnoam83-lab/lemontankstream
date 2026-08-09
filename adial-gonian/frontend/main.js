/**
 * אדיאל גוניון - Electron Main Process
 * Creates a transparent, frameless, always-on-top window for the HUD
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;
let hudPosition = 'center'; // 'center' or 'side'

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // Calculate window dimensions
  const centerWidth = 520;
  const centerHeight = 680;
  const sideWidth = 380;
  const sideHeight = screenHeight - 40;

  const winConfig = hudPosition === 'center' 
    ? {
        width: centerWidth,
        height: centerHeight,
        x: Math.floor((screenWidth - centerWidth) / 2),
        y: Math.floor((screenHeight - centerHeight) / 2),
      }
    : {
        width: sideWidth,
        height: sideHeight,
        x: screenWidth - sideWidth - 10,
        y: 20,
      };

  mainWindow = new BrowserWindow({
    ...winConfig,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Iron Man HUD styling
    backgroundColor: '#00000000',
    opacity: 0.92,
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Ignore mouse events on transparent areas (click-through)
  mainWindow.setIgnoreMouseEvents(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window position management
ipcMain.on('hud:move-center', () => {
  if (!mainWindow) return;
  hudPosition = 'center';
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const w = 520, h = 680;
  mainWindow.setBounds({
    x: Math.floor((screenWidth - w) / 2),
    y: Math.floor((screenHeight - h) / 2),
    width: w,
    height: h,
  });
});

ipcMain.on('hud:move-side', () => {
  if (!mainWindow) return;
  hudPosition = 'side';
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const w = 380, h = screenHeight - 40;
  mainWindow.setBounds({
    x: screenWidth - w - 10,
    y: 20,
    width: w,
    height: h,
  });
});

ipcMain.on('hud:hide', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('hud:show', () => {
  if (mainWindow) mainWindow.show();
});

ipcMain.on('hud:set-opacity', (_event, opacity) => {
  if (mainWindow) mainWindow.setOpacity(opacity);
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
