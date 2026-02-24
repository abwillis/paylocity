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

// blank detection timing
let blankCheckTimer1 = null;
let blankCheckTimer2 = null;

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

  // Only auto-center if user hasn't dragged yet
  if (!overlayAnchor) {
    overlayAnchor = {
      x: Math.round((mb.w - OVERLAY_W) / 2),
      y: Math.round((mb.h - OVERLAY_H) / 2)
    };
  }

  overlayWin.setBounds({
    x: mb.x + overlayAnchor.x,
    y: mb.y + overlayAnchor.y,
    width: OVERLAY_W,
    height: OVERLAY_H
  });
}

function showOverlay(reason = '') {
  if (!overlayWin || overlayWin.isDestroyed()) return;

  // Ensure bounds are correct before showing
  applyOverlayAnchor();

  // show without stealing focus
  if (!overlayWin.isVisible()) {
    overlayWin.showInactive();
  }
}

function hideOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (overlayWin.isVisible()) overlayWin.hide();
}

async function isProbablyBlank(win) {
  // Conservative heuristic:
  // - No body or almost no text/HTML
  // - And background is white/transparent
  try {
    const result = await win.webContents.executeJavaScript(`
      (function () {
        const body = document.body;
        if (!body) return { blank: true, why: "no-body" };

        const text = (body.innerText || "").trim();
        const html = (body.innerHTML || "").trim();

        const bg = getComputedStyle(body).backgroundColor || "";
        const isWhiteish =
          bg === "rgb(255, 255, 255)" ||
          bg === "rgba(0, 0, 0, 0)" ||
          bg === "transparent";

        const tooEmpty = (text.length < 5 && html.length < 80);

        return { blank: !!(tooEmpty && isWhiteish), why: { textLen: text.length, htmlLen: html.length, bg } };
      })();
    `, true);

    return !!result.blank;
  } catch {
    // If we can't execute JS (navigation/race), don't assume blank.
    return false;
  }
}

function clearBlankTimers() {
  if (blankCheckTimer1) clearTimeout(blankCheckTimer1);
  if (blankCheckTimer2) clearTimeout(blankCheckTimer2);
  blankCheckTimer1 = null;
  blankCheckTimer2 = null;
}

function scheduleBlankChecks() {
  clearBlankTimers();

  // quick check soon after load completes
  blankCheckTimer1 = setTimeout(async () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const blank = await isProbablyBlank(mainWin);
    if (blank) showOverlay('blank-check-250ms');
    else hideOverlay();
  }, 250);

  // second check for SPAs that paint late
  blankCheckTimer2 = setTimeout(async () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    const blank = await isProbablyBlank(mainWin);
    if (blank) showOverlay('blank-check-1500ms');
    else hideOverlay();
  }, 1500);
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
    show: false,              // IMPORTANT: hidden by default
    alwaysOnTop: true,
    focusable: false,         // set true if your OS doesn't deliver pointer events reliably
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

  // Create overlay first (hidden)
  createOverlay(mainWin);

  // Load remote page
  mainWin.loadURL(TARGET_URL);

  // External links open in OS browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hard failures -> show overlay
  mainWin.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    showOverlay('did-fail-load');
  });

  // Successful load -> run blank/white checks; hide if healthy
  mainWin.webContents.on('did-finish-load', () => {
    scheduleBlankChecks();
  });

  // If navigation starts, you can choose to hide overlay until proven blank/fail again
  mainWin.webContents.on('did-start-loading', () => {
    // Optional: hide while loading to reduce visual clutter
    hideOverlay();
    clearBlankTimers();
  });
}

// IPC from overlay
ipcMain.on('overlay:reload', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.reload();
  }
});

ipcMain.on('overlay:move-by', (_event, { dx, dy }) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const mb = getMainBounds();
  if (!mb) return;

  if (!overlayAnchor) {
    overlayAnchor = {
      x: mb.w - OVERLAY_W - DEFAULT_MARGIN,
      y: mb.h - OVERLAY_H - DEFAULT_MARGIN
    };
  }

  overlayAnchor.x += dx;
  overlayAnchor.y += dy;

  applyOverlayAnchor();
});

app.whenReady().then(createWindow);
