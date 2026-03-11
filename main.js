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

// Install Node.js — 下载官方预编译包自动安装，不依赖任何第三方包管理器
// 使用淘宝镜像加速下载
ipcMain.handle('install-node', async (event) => {
  const NODE_VERSION = 'v22.14.0'; // LTS
  const platform = process.platform;
  const arch = process.arch; // x64 or arm64

  const send = (text, type = 'stdout') => {
    event.sender.send('install-progress', { type, text });
  };

  try {
    if (platform === 'darwin') {
      // macOS: 下载 .pkg 安装包并执行
      const pkg = `node-${NODE_VERSION}-darwin-${arch}.pkg`;
      const url = `https://npmmirror.com/mirrors/node/${NODE_VERSION}/${pkg}`;
      const tmpPath = path.join(os.tmpdir(), pkg);

      send(`正在下载 Node.js ${NODE_VERSION} (${arch})...`);
      send(`下载地址: ${url}`);

      // 用 curl 下载（macOS 自带 curl）
      await new Promise((resolve, reject) => {
        const dl = spawn('curl', ['-L', '-o', tmpPath, '--progress-bar', url], { timeout: 300000 });
        dl.stderr.on('data', d => send(d.toString()));
        dl.on('close', code => code === 0 ? resolve() : reject(new Error(`下载失败，退出码 ${code}`)));
        dl.on('error', reject);
      });

      send('下载完成，正在安装...');

      // 用 installer 安装 .pkg（需要管理员权限，会弹系统授权窗口）
      await new Promise((resolve, reject) => {
        const inst = spawn('open', [tmpPath], { timeout: 600000 });
        inst.on('close', () => resolve());
        inst.on('error', reject);
      });

      send('已打开 Node.js 安装程序，请在弹出的窗口中完成安装。');
      send('安装完成后，点击「检测 Node.js」按钮验证。');
      return { success: true, message: '安装程序已打开' };

    } else if (platform === 'win32') {
      // Windows: 下载 .msi 安装包并执行
      const msi = `node-${NODE_VERSION}-${arch}.msi`;
      const url = `https://npmmirror.com/mirrors/node/${NODE_VERSION}/${msi}`;
      const tmpPath = path.join(os.tmpdir(), msi);

      send(`正在下载 Node.js ${NODE_VERSION} (${arch})...`);

      await new Promise((resolve, reject) => {
        const dl = spawn('powershell', [
          '-Command',
          `Invoke-WebRequest -Uri '${url}' -OutFile '${tmpPath}' -UseBasicParsing`
        ], { timeout: 300000, shell: true });
        dl.stderr.on('data', d => send(d.toString(), 'stderr'));
        dl.stdout.on('data', d => send(d.toString()));
        dl.on('close', code => code === 0 ? resolve() : reject(new Error(`下载失败，退出码 ${code}`)));
        dl.on('error', reject);
      });

      send('下载完成，正在启动安装程序...');

      await new Promise((resolve, reject) => {
        const inst = spawn('msiexec', ['/i', tmpPath], { timeout: 600000, shell: true });
        inst.on('close', () => resolve());
        inst.on('error', reject);
      });

      send('安装程序已启动，请完成安装后重新检测。');
      return { success: true, message: '安装程序已打开' };

    } else {
      // Linux
      send('Linux 系统请使用包管理器安装：');
      send('  Ubuntu/Debian: sudo apt install nodejs npm');
      send('  CentOS/RHEL:   sudo yum install nodejs npm');
      send('  或使用 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash');
      return { success: false, error: '请使用系统包管理器安装 Node.js' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Install Claude Code (streaming) — 使用淘宝 npm 镜像，国内可访问
ipcMain.handle('install-claude', async (event) => {
  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // 使用淘宝镜像 npmmirror，避免被墙
    // shell: true 确保 spawn 能通过 PATH 找到 npm（Electron 打包后必需）
    const child = spawn(npmCmd, [
      'install', '-g', '@anthropic-ai/claude-code',
      '--registry', 'https://registry.npmmirror.com'
    ], {
      env: getEnvWithPath(),
      timeout: 180000,
      shell: true
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
