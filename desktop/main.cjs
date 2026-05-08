const { createServer } = require("node:http");
const path = require("node:path");

const {
  app,
  BrowserWindow,
  desktopCapturer,
  session,
  shell,
  systemPreferences
} = require("electron");
const next = require("next");

const APP_URL = process.env.TWIST_DESKTOP_URL || "http://127.0.0.1:3000";
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOST = new URL(APP_URL).hostname;
const APP_PORT = Number(new URL(APP_URL).port || "3000");
const ROOT_DIR = path.join(__dirname, "..");
const isMac = process.platform === "darwin";

let mainWindow = null;
let nextServer = null;

app.setName("TWiST Glass Sidebar");

function getDesktopUrl() {
  const url = new URL(APP_URL);
  url.searchParams.set("desktop", "1");
  url.searchParams.set("lowPower", "1");
  return url.toString();
}

async function startNextServer() {
  if (await appUrlIsReady(700)) {
    return;
  }

  const nextApp = next({
    dev: !app.isPackaged,
    dir: ROOT_DIR,
    hostname: APP_HOST,
    port: APP_PORT
  });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  await new Promise((resolve, reject) => {
    nextServer = createServer((request, response) => {
      handle(request, response).catch((error) => {
        console.error(error);
        response.statusCode = 500;
        response.end("TWiST desktop server error");
      });
    });

    nextServer.once("error", reject);
    nextServer.listen(APP_PORT, APP_HOST, resolve);
  });
}

async function appUrlIsReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(APP_URL, { cache: "no-store" });
      if (response.ok) {
        return true;
      }
    } catch {
      // Local app is still booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function requestMacMediaPermissions() {
  if (!isMac) {
    return;
  }

  await systemPreferences.askForMediaAccess("microphone").catch(() => false);

  const micStatus = systemPreferences.getMediaAccessStatus("microphone");
  if (micStatus === "denied" || micStatus === "restricted") {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    );
  }

  const screenStatus = systemPreferences.getMediaAccessStatus("screen");
  if (screenStatus === "denied" || screenStatus === "restricted") {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
  }
}

function configureDesktopDataPaths() {
  const userDataPath = app.getPath("userData");
  process.env.RUNTIME_SECRETS_PATH ||= path.join(userDataPath, "runtime-secrets.json");
  process.env.DATA_STORAGE_LOCAL_PATH ||= path.join(userDataPath, "sidebar-events.jsonl");
}

function wireCapturePermissions() {
  const allowedOrigins = new Set([APP_ORIGIN, APP_ORIGIN.replace("127.0.0.1", "localhost")]);
  const capturePermissions = new Set([
    "display-capture",
    "media",
    "microphone",
    "camera",
    "fullscreen"
  ]);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const origin = safeOrigin(webContents.getURL());
    callback(allowedOrigins.has(origin) && capturePermissions.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = requestingOrigin || safeOrigin(webContents.getURL());
    return allowedOrigins.has(origin) && capturePermissions.has(permission);
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 720, height: 405 }
      });

      callback({ video: sources[0], audio: "loopback" });
    },
    { useSystemPicker: true }
  );
}

function safeOrigin(value) {
  try {
    return new URL(value || APP_URL).origin;
  } catch {
    return APP_ORIGIN;
  }
}

async function createWindow() {
  configureDesktopDataPaths();
  await startNextServer();
  wireCapturePermissions();

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    show: false,
    title: "TWiST Glass Sidebar",
    backgroundColor: "#f2f4e5",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      backgroundThrottling: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const showWindow = () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };

  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(showWindow, 80);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(getDesktopUrl());

  requestMacMediaPermissions().catch((error) => {
    console.error("Media permission request failed", error);
  });
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

app.on("before-quit", () => {
  nextServer?.close();
});
