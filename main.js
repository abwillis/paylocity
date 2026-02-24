const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

const TARGET_URL = "https://webtime2.paylocity.com/WebTime/Login/WebClock";

let mainWin;
let overlayWin;

// overlay geometry
const OVERLAY_W = 110;
const OVERLAY_H = 46;
const DEFAULT_MARGIN = 16;

// anchor relative to main window (for dragging persistence)
let overlayAnchor = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getMainBounds() {
  if (!mainWin || mainWin.isDestroyed()) return null;
  const [x, y] = mainWin.getPosition();
  const [w, h] = mainWin.getSize();
  return { x, y, w, h };
}

function applyOverlayAnchor() {
  const mb = getMainBounds();
  if (!mb || !overlayWin || overlayWin.isDestroyed()) return;

  // Initialize in the TOP-RIGHT corner (unless user has already dragged it)
  if (!overlayAnchor) {
    overlayAnchor = {
    x: mb.w - OVERLAY_W - DEFAULT_MARGIN, 
    y: DEFAULT_MARGIN 
    };
  }

  const maxX = mb.w - OVERLAY_W; 
  const maxY = mb.h - OVERLAY_H; 
  overlayAnchor.x = clamp(overlayAnchor.x, 0, maxX); 
  overlayAnchor.y = clamp(overlayAnchor.y, 0, maxY);
  overlayWin.setBounds({
    x: mb.x + overlayAnchor.x,
    y: mb.y + overlayAnchor.y,
    width: OVERLAY_W,
    height: OVERLAY_H
  });
}

function createOverlay(parent) {
  overlayWin = new BrowserWindow({
    width: OVERLAY_W,
    height: OVERLAY_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: true, // ALWAYS visible 
    alwaysOnTop: true,
    focusable: true,         // set true if your OS doesn't deliver pointer events reliably
    parent,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.loadFile(path.join(__dirname, 'reload.html'));

  applyOverlayAnchor();

  parent.on('move', applyOverlayAnchor);
  parent.on('resize', applyOverlayAnchor);
  parent.on('enter-full-screen', applyOverlayAnchor);
  parent.on('leave-full-screen', applyOverlayAnchor);
}

function createWindow() {
  mainWin = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Create overlay first
  createOverlay(mainWin);

  // Load remote page
  mainWin.loadURL(TARGET_URL);

  // External links open in OS browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC from overlay
ipcMain.on('overlay:reload', () => {
 console.log('[overlay] reload requested');
 if (!mainWin || mainWin.isDestroyed()) {
   console.log('[overlay] mainWin is not available');
   return;
 }

 // Log lifecycle so you can see whether navigation is actually happening
 console.log('[overlay] current URL:', mainWin.webContents.getURL());
 mainWin.webContents.once('did-start-loading', () => console.log('[main] did-start-loading'));
 mainWin.webContents.once('did-stop-loading',  () => console.log('[main] did-stop-loading'));
 mainWin.webContents.once('did-finish-load',   () => console.log('[main] did-finish-load'));
 mainWin.webContents.once('did-fail-load',     (_e, code, desc, url, isMainFrame) =>
   console.log('[main] did-fail-load', { code, desc, url, isMainFrame })
 );

 // Most reliable: force a real navigation.
 // If getURL() is empty/about:blank, fall back to TARGET_URL.
 const current = mainWin.webContents.getURL();
 const nextUrl = (current && current !== 'about:blank') ? current : TARGET_URL;
 console.log('[overlay] forcing loadURL:', nextUrl);
 mainWin.loadURL(nextUrl);
});

ipcMain.on('overlay:move-by', (_event, { dx, dy }) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const mb = getMainBounds();
  if (!mb) return;

  if (!overlayAnchor) {
    overlayAnchor = {
    x: mb.w - OVERLAY_W - DEFAULT_MARGIN, 
    y: DEFAULT_MARGIN
    };
  }

  overlayAnchor.x += dx;
  overlayAnchor.y += dy;

  applyOverlayAnchor();
});

app.whenReady().then(createWindow);
