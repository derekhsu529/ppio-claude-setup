const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 820,
    minWidth: 660,
    minHeight: 700,
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

// Open URL in browser (alias)
ipcMain.handle('open-url', async (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

// ─── Environment Detection ──────────────────────────────────────

// Check Node.js version
ipcMain.handle('check-node', async () => {
  return new Promise((resolve) => {
    // Try multiple paths for cross-platform compatibility
    const cmd = process.platform === 'win32' ? 'node.exe --version' : 'node --version';
    exec(cmd, { timeout: 10000, env: getEnvWithPath() }, (error, stdout, stderr) => {
      if (error) {
        resolve({ installed: false, version: null, sufficient: false });
        return;
      }
      const raw = (stdout || '').trim();
      // Parse version like v18.17.0
      const match = raw.match(/v?(\d+)\.(\d+)\.(\d+)/);
      if (!match) {
        resolve({ installed: false, version: null, sufficient: false });
        return;
      }
      const major = parseInt(match[1], 10);
      const version = `v${match[1]}.${match[2]}.${match[3]}`;
      resolve({
        installed: true,
        version,
        sufficient: major >= 18
      });
    });
  });
});

// Check Claude Code version
ipcMain.handle('check-claude', async () => {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'claude.cmd --version' : 'claude --version';
    exec(cmd, { timeout: 10000, env: getEnvWithPath() }, (error, stdout, stderr) => {
      if (error) {
        resolve({ installed: false, version: null });
        return;
      }
      const raw = (stdout || stderr || '').trim();
      // claude --version outputs something like "1.0.5"
      const match = raw.match(/(\d+\.\d+[\.\d]*)/);
      const version = match ? match[1] : raw;
      resolve({ installed: true, version: version || 'unknown' });
    });
  });
});

// Install Claude Code (streaming)
ipcMain.handle('install-claude', async (event) => {
  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, ['install', '-g', '@anthropic-ai/claude-code'], {
      env: getEnvWithPath(),
      timeout: 120000
    });

    child.stdout.on('data', (data) => {
      event.sender.send('install-progress', { type: 'stdout', text: data.toString() });
    });

    child.stderr.on('data', (data) => {
      event.sender.send('install-progress', { type: 'stderr', text: data.toString() });
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `npm exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

// Helper: get env with common PATH additions
function getEnvWithPath() {
  const env = { ...process.env };
  const extraPaths = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    `${os.homedir()}/.nvm/versions/node/current/bin`,
    `${os.homedir()}/.local/bin`,
    'C:\\Program Files\\nodejs',
    'C:\\Program Files (x86)\\nodejs'
  ];
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PATH = (env.PATH || '') + sep + extraPaths.join(sep);
  return env;
}

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
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '', 'utf8');
      }

      let content = fs.readFileSync(filePath, 'utf8');
      content = removeEnvBlock(content);
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
      resolve({
        success: true,
        message: `✅ 已尝试清除以下环境变量：\n${keys.join('\n')}\n\n⚠️ 请重启 CMD/PowerShell 窗口使变更生效。`
      });
    });
  });
}
