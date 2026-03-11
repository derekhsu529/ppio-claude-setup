const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

let mainWindow;

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 700,
    height: 820,
    minWidth: 660,
    minHeight: 700,
    resizable: true,
    // macOS: 用系统原生红绿灯，隐藏标题但保留按钮
    // Windows/Linux: 完全无框，用自定义按钮
    frame: isMac ? true : false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
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

// App version
ipcMain.handle('get-version', () => app.getVersion());

// ─── Environment Detection ──────────────────────────────────────

// Check Node.js version — 尝试多种方式找到 node
ipcMain.handle('check-node', async () => {
  const envWithPath = getEnvWithPath();

  // 尝试多个候选命令
  const candidates = process.platform === 'win32'
    ? ['node.exe --version', 'node --version']
    : ['node --version'];

  for (const cmd of candidates) {
    try {
      const result = await new Promise((resolve) => {
        exec(cmd, { timeout: 10000, env: envWithPath, shell: process.platform === 'win32' ? undefined : '/bin/bash' }, (error, stdout) => {
          if (error) { resolve(null); return; }
          const raw = (stdout || '').trim();
          const match = raw.match(/v?(\d+)\.(\d+)\.(\d+)/);
          if (!match) { resolve(null); return; }
          const major = parseInt(match[1], 10);
          resolve({
            installed: true,
            version: `v${match[1]}.${match[2]}.${match[3]}`,
            sufficient: major >= 18
          });
        });
      });
      if (result) return result;
    } catch (e) { /* try next */ }
  }

  return { installed: false, version: null, sufficient: false };
});

// Check Claude Code version — 尝试多种方式找到 claude
ipcMain.handle('check-claude', async () => {
  const envWithPath = getEnvWithPath();

  const candidates = process.platform === 'win32'
    ? ['claude.cmd --version', 'claude --version']
    : ['claude --version'];

  for (const cmd of candidates) {
    try {
      const result = await new Promise((resolve) => {
        exec(cmd, { timeout: 10000, env: envWithPath, shell: process.platform === 'win32' ? undefined : '/bin/bash' }, (error, stdout, stderr) => {
          if (error) { resolve(null); return; }
          const raw = (stdout || stderr || '').trim();
          const match = raw.match(/(\d+\.\d+[\.\d]*)/);
          const version = match ? match[1] : raw;
          if (version) {
            resolve({ installed: true, version });
          } else {
            resolve(null);
          }
        });
      });
      if (result) return result;
    } catch (e) { /* try next */ }
  }

  return { installed: false, version: null };
});

// Install Node.js — macOS 用 brew，其他平台给下载链接
ipcMain.handle('install-node', async (event) => {
  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      // macOS: 先试 brew install node
      const envWithPath = getEnvWithPath();
      exec('which brew', { env: envWithPath, timeout: 5000 }, (err) => {
        if (err) {
          // 没有 Homebrew
          resolve({ success: false, error: '未检测到 Homebrew，请先安装 Homebrew (https://brew.sh) 或手动安装 Node.js' });
          return;
        }
        const child = spawn('brew', ['install', 'node'], { env: envWithPath, timeout: 300000 });
        child.stdout.on('data', d => {
          event.sender.send('install-progress', { type: 'stdout', text: d.toString() });
        });
        child.stderr.on('data', d => {
          event.sender.send('install-progress', { type: 'stderr', text: d.toString() });
        });
        child.on('close', code => {
          resolve(code === 0 ? { success: true } : { success: false, error: `brew 退出码 ${code}` });
        });
        child.on('error', e => resolve({ success: false, error: e.message }));
      });
    } else if (process.platform === 'win32') {
      // Windows: 引导用户下载
      resolve({ success: false, error: 'Windows 请手动下载安装 Node.js' });
    } else {
      // Linux
      resolve({ success: false, error: '请使用系统包管理器安装 Node.js' });
    }
  });
});

// Install Claude Code (streaming) — 使用淘宝 npm 镜像，国内可访问
ipcMain.handle('install-claude', async (event) => {
  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // 使用淘宝镜像 npmmirror，避免被墙
    const child = spawn(npmCmd, [
      'install', '-g', '@anthropic-ai/claude-code',
      '--registry', 'https://registry.npmmirror.com'
    ], {
      env: getEnvWithPath(),
      timeout: 180000  // 国内镜像也可能慢，适当延长超时
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

// Helper: get env with comprehensive PATH additions
// Electron 打包后 app 的 PATH 非常精简，需要手动补全常见路径
function getEnvWithPath() {
  const env = { ...process.env };
  const home = os.homedir();
  const sep = process.platform === 'win32' ? ';' : ':';

  const extraPaths = [];

  if (process.platform === 'win32') {
    extraPaths.push(
      'C:\\Program Files\\nodejs',
      'C:\\Program Files (x86)\\nodejs',
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, '.nvm', 'current', 'bin'),
      path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'bin')
    );
  } else {
    // macOS / Linux — 覆盖所有常见 Node 安装方式
    extraPaths.push(
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',             // Homebrew Apple Silicon
      '/opt/homebrew/sbin',
      '/usr/local/opt/node/bin',       // Homebrew Intel
      path.join(home, '.local', 'bin'),
      path.join(home, '.npm-global', 'bin'),
      path.join(home, '.yarn', 'bin')
    );

    // nvm: 扫描实际存在的版本目录
    const nvmDir = path.join(home, '.nvm', 'versions', 'node');
    try {
      const versions = fs.readdirSync(nvmDir)
        .filter(d => d.startsWith('v'))
        .sort()
        .reverse(); // 最新版本优先
      for (const v of versions) {
        extraPaths.push(path.join(nvmDir, v, 'bin'));
      }
    } catch (e) {
      // nvm 不存在，跳过
    }

    // fnm
    const fnmDir = path.join(home, '.fnm', 'node-versions');
    try {
      const versions = fs.readdirSync(fnmDir)
        .filter(d => d.startsWith('v'))
        .sort()
        .reverse();
      for (const v of versions) {
        extraPaths.push(path.join(fnmDir, v, 'installation', 'bin'));
      }
    } catch (e) {}

    // volta
    extraPaths.push(path.join(home, '.volta', 'bin'));

    // n (tj/n)
    extraPaths.push('/usr/local/n/versions/node');
  }

  // 也尝试从 shell 获取真实 PATH（macOS Electron 拿不到 login shell 的 PATH）
  if (process.platform !== 'win32') {
    try {
      const { execSync } = require('child_process');
      const shellPath = execSync('/bin/bash -ilc "echo $PATH"', {
        timeout: 3000,
        encoding: 'utf8',
        env: { ...process.env, HOME: home }
      }).trim();
      if (shellPath) {
        extraPaths.push(...shellPath.split(':'));
      }
    } catch (e) {
      // 如果 shell 获取失败，继续用手动路径
    }
  }

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
