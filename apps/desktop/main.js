const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let serverProcess = null;

function startServer() {
  const root = path.join(__dirname, "../..");
  serverProcess = spawn("npx", ["pnpm@9.15.0", "--filter", "@cider/server", "dev"], {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, PATH: `${path.join(root, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}` },
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0d0d0f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL("http://127.0.0.1:3000");
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 3000);
});

app.on("window-all-closed", () => {
  // Keep backend running; local IDE stays available when window is closed
});

app.on("before-quit", () => {
  serverProcess?.kill();
});
