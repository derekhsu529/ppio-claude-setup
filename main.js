const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 620,
    minWidth: 720,
    minHeight: 580,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.icns')
  });

  mainWindow.loadFile('renderer.html');

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ───────────────────────────────────────────────

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// Open external URL
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

// Apply configuration
ipcMain.handle('apply-config', async (event, config) => {
  const platform = process.platform;

  if (platform === 'darwin' || platform === 'linux') {
    return applyConfigMac(config);
  } else if (platform === 'win32') {
    return applyConfigWindows(config);
  } else {
    return { success: false, error: `不支持的操作系统: ${platform}` };
  }
});

// Restore (clear) configuration
ipcMain.handle('restore-config', async () => {
  const platform = process.platform;

  if (platform === 'darwin' || platform === 'linux') {
    return restoreConfigMac();
  } else if (platform === 'win32') {
    return restoreConfigWindows();
  } else {
    return { success: false, error: `不支持的操作系统: ${platform}` };
  }
});

// Check existing config
ipcMain.handle('check-config', async () => {
  const platform = process.platform;
  const envVars = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_SMALL_FAST_MODEL'
  ];

  const result = {};
  for (const key of envVars) {
    result[key] = process.env[key] || null;
  }
  return result;
});

// ─── Mac/Linux Implementation ───────────────────────────────────

const PPIO_MARKER_START = '# >>> PPIO Claude Setup START >>>';
const PPIO_MARKER_END = '# <<< PPIO Claude Setup END <<<';

function buildEnvBlock(config) {
  const lines = [
    PPIO_MARKER_START,
    `export ANTHROPIC_BASE_URL="https://api.ppio.com/anthropic"`,
    `export ANTHROPIC_AUTH_TOKEN="${config.apiKey}"`,
    `export ANTHROPIC_MODEL="${config.mainModel}"`,
    `export ANTHROPIC_SMALL_FAST_MODEL="${config.fastModel}"`,
    PPIO_MARKER_END
  ];
  return '\n' + lines.join('\n') + '\n';
}

function removeEnvBlock(content) {
  const startIdx = content.indexOf(PPIO_MARKER_START);
  const endIdx = content.indexOf(PPIO_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;
  // Remove from the newline before start marker to end of end marker line
  const before = content.substring(0, startIdx).replace(/\n+$/, '');
  const after = content.substring(endIdx + PPIO_MARKER_END.length).replace(/^\n/, '');
  return before + '\n' + after;
}

function applyConfigMac(config) {
  const files = [
    path.join(os.homedir(), '.zshrc'),
    path.join(os.homedir(), '.bash_profile')
  ];

  const errors = [];
  const updated = [];

  for (const filePath of files) {
    try {
      // Create file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '', 'utf8');
      }

      let content = fs.readFileSync(filePath, 'utf8');

      // Remove existing block if present
      content = removeEnvBlock(content);

      // Append new block
      content = content.trimEnd() + buildEnvBlock(config);

      fs.writeFileSync(filePath, content, 'utf8');
      updated.push(filePath);
    } catch (err) {
      errors.push(`${filePath}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('\n'), updated };
  }

  return {
    success: true,
    message: `✅ 配置已写入：\n${updated.join('\n')}\n\n⚠️ 请重启终端或运行 source ~/.zshrc 使配置生效。`,
    updated
  };
}

function restoreConfigMac() {
  const files = [
    path.join(os.homedir(), '.zshrc'),
    path.join(os.homedir(), '.bash_profile')
  ];

  const errors = [];
  const cleaned = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const newContent = removeEnvBlock(content);
      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        cleaned.push(filePath);
      }
    } catch (err) {
      errors.push(`${filePath}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('\n') };
  }

  if (cleaned.length === 0) {
    return { success: true, message: '未找到 PPIO 配置，无需清除。' };
  }

  return {
    success: true,
    message: `✅ 已从以下文件清除配置：\n${cleaned.join('\n')}\n\n⚠️ 请重启终端使变更生效。`
  };
}

// ─── Windows Implementation ─────────────────────────────────────

function applyConfigWindows(config) {
  return new Promise((resolve) => {
    const vars = {
      ANTHROPIC_BASE_URL: 'https://api.ppio.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: config.apiKey,
      ANTHROPIC_MODEL: config.mainModel,
      ANTHROPIC_SMALL_FAST_MODEL: config.fastModel
    };

    const commands = Object.entries(vars).map(
      ([key, value]) => `setx ${key} "${value}"`
    );

    const fullCommand = commands.join(' && ');

    exec(fullCommand, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({
          success: true,
          message: `✅ 环境变量已设置到用户级别。\n\n⚠️ 请重启 CMD/PowerShell 窗口使配置生效。`
        });
      }
    });
  });
}

function restoreConfigWindows() {
  return new Promise((resolve) => {
    const keys = [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_SMALL_FAST_MODEL'
    ];

    const commands = keys.map(
      (key) => `REG DELETE "HKCU\\Environment" /v ${key} /f`
    );

    const fullCommand = commands.join(' & ');

    exec(fullCommand, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      // REG DELETE returns error if key doesn't exist — treat as partial success
      resolve({
        success: true,
        message: `✅ 已尝试清除以下环境变量：\n${keys.join('\n')}\n\n⚠️ 请重启 CMD/PowerShell 窗口使变更生效。`
      });
    });
  });
}
