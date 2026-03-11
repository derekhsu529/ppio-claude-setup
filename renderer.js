/* renderer.js — frontend logic (runs in renderer process) */
'use strict';

// ─── Helpers ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Screens ─────────────────────────────────────────────────────
const screens = {
  main: $('screen-main'),
  result: $('screen-result')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─── Title bar controls ──────────────────────────────────────────
$('btn-min').addEventListener('click', () => window.electronAPI.minimize());
$('btn-max').addEventListener('click', () => window.electronAPI.maximize());
$('btn-close').addEventListener('click', () => window.electronAPI.close());

// ─── Log Area ────────────────────────────────────────────────────
function getTimestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}]`;
}

function log(msg, type = 'info') {
  const logBody = $('log-body');
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `${getTimestamp()} ${msg}`;
  logBody.appendChild(line);
  logBody.scrollTop = logBody.scrollHeight;
}

$('btn-clear-log').addEventListener('click', () => {
  $('log-body').innerHTML = '';
});

// ─── State ───────────────────────────────────────────────────────
const state = {
  nodeOk: false,
  claudeOk: false
};

function checkEnvReady() {
  const ready = state.nodeOk && state.claudeOk;
  $('env-ready-banner').style.display = ready ? 'block' : 'none';
  // Enable/disable config section
  const configSection = $('config-section');
  const configHeader = $('config-section-header');
  if (ready) {
    configSection.classList.remove('config-disabled');
    configHeader.classList.remove('config-disabled');
  } else {
    configSection.classList.add('config-disabled');
    configHeader.classList.add('config-disabled');
  }
}

// ─── Part 1: Node.js Detection ───────────────────────────────────
$('btn-check-node').addEventListener('click', async () => {
  const btn = $('btn-check-node');
  btn.disabled = true;
  btn.textContent = '🔄 检测中...';
  log('开始检测 Node.js...');

  try {
    const result = await window.electronAPI.checkNode();

    const badge = $('node-status-badge');
    const dot = badge.querySelector('.status-dot');
    const text = $('node-status-text');

    if (result.installed && result.sufficient) {
      // ✅ Sufficient
      dot.className = 'status-dot status-ok';
      text.textContent = result.version;
      btn.textContent = '已满足 ✓';
      btn.className = 'btn btn-success-static';
      btn.disabled = true;
      state.nodeOk = true;
      log(`Node.js ${result.version} 已安装，版本满足要求 ✓`, 'success');
    } else if (result.installed && !result.sufficient) {
      // ⚠️ Installed but too old
      dot.className = 'status-dot status-warn';
      text.textContent = `${result.version}（版本过低）`;
      btn.textContent = '前往下载 Node.js';
      btn.className = 'btn btn-warning';
      btn.disabled = false;
      log(`Node.js ${result.version} 版本过低，需要 >= 18，请升级`, 'warning');
      // rebind click
      btn.onclick = () => openNodeDownload();
    } else {
      // ❌ Not installed
      dot.className = 'status-dot status-error';
      text.textContent = '未安装';
      btn.textContent = '前往下载 Node.js';
      btn.className = 'btn btn-warning';
      btn.disabled = false;
      log('Node.js 未检测到，请先安装', 'warning');
      btn.onclick = () => openNodeDownload();
    }
  } catch (err) {
    log(`检测 Node.js 失败: ${err.message}`, 'error');
    btn.textContent = '🔍 检测 Node.js';
    btn.disabled = false;
  }

  checkEnvReady();
});

function openNodeDownload() {
  window.electronAPI.openExternal('https://nodejs.org/en/download/');
  log('已打开 Node.js 下载页面，下载完成后请重新打开本工具', 'warning');
}

// ─── Part 1: Claude Code Detection & Install ─────────────────────
let claudeInstalling = false;

$('btn-check-claude').addEventListener('click', async () => {
  if (claudeInstalling) return;
  const btn = $('btn-check-claude');
  btn.disabled = true;
  btn.textContent = '🔄 检测中...';
  log('开始检测 Claude Code...');

  try {
    const result = await window.electronAPI.checkClaude();

    const badge = $('claude-status-badge');
    const dot = badge.querySelector('.status-dot');
    const text = $('claude-status-text');

    if (result.installed) {
      dot.className = 'status-dot status-ok';
      text.textContent = result.version;
      btn.textContent = '已安装 ✓';
      btn.className = 'btn btn-success-static';
      btn.disabled = true;
      state.claudeOk = true;
      log(`Claude Code ${result.version} 已安装 ✓`, 'success');
    } else {
      dot.className = 'status-dot status-error';
      text.textContent = '未安装';
      btn.textContent = '安装 Claude Code';
      btn.className = 'btn btn-primary';
      btn.disabled = false;
      log('Claude Code 未安装，点击「安装 Claude Code」按钮进行安装', 'info');
      // Rebind to install
      btn.onclick = () => installClaude();
    }
  } catch (err) {
    log(`检测 Claude Code 失败: ${err.message}`, 'error');
    btn.textContent = '🔍 检测 Claude Code';
    btn.disabled = false;
  }

  checkEnvReady();
});

async function installClaude() {
  if (claudeInstalling) return;
  claudeInstalling = true;

  const btn = $('btn-check-claude');
  btn.disabled = true;
  btn.textContent = '⏳ 安装中...';
  btn.className = 'btn btn-secondary btn-loading';

  log('开始安装 Claude Code (npm install -g @anthropic-ai/claude-code)...', 'info');
  log('这可能需要1-3分钟，请耐心等待...', 'info');

  // Setup streaming listener
  window.electronAPI.offInstallProgress();
  window.electronAPI.onInstallProgress((data) => {
    const text = (data.text || '').trim();
    if (!text) return;
    // Split multi-line outputs
    text.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const type = data.type === 'stderr' ? 'warning' : 'info';
      log(trimmed, type);
    });
  });

  try {
    const result = await window.electronAPI.installClaude();
    window.electronAPI.offInstallProgress();

    const badge = $('claude-status-badge');
    const dot = badge.querySelector('.status-dot');
    const text = $('claude-status-text');

    if (result.success) {
      // Verify installation
      const verifyResult = await window.electronAPI.checkClaude();
      dot.className = 'status-dot status-ok';
      text.textContent = verifyResult.installed ? verifyResult.version : '已安装';
      btn.textContent = '已安装 ✓';
      btn.className = 'btn btn-success-static';
      btn.disabled = true;
      btn.onclick = null;
      state.claudeOk = true;
      log('Claude Code 安装成功！ ✓', 'success');
    } else {
      dot.className = 'status-dot status-error';
      text.textContent = '安装失败';
      btn.textContent = '重试';
      btn.className = 'btn btn-danger';
      btn.disabled = false;
      btn.onclick = () => installClaude();
      log(`安装失败: ${result.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    window.electronAPI.offInstallProgress();
    const btn2 = $('btn-check-claude');
    btn2.textContent = '重试';
    btn2.className = 'btn btn-danger';
    btn2.disabled = false;
    btn2.onclick = () => installClaude();
    log(`安装出错: ${err.message}`, 'error');
  }

  claudeInstalling = false;
  checkEnvReady();
}

// ─── Part 2: Config Section ──────────────────────────────────────

// Init config section as disabled
$('config-section').classList.add('config-disabled');
$('config-section-header').classList.add('config-disabled');

// Register link
$('link-register').addEventListener('click', () => {
  window.electronAPI.openExternal('https://api.ppio.com');
});

// API Key visibility toggle
const apiKeyInput = $('api-key');
const toggleBtn = $('toggle-key');
let keyVisible = false;

toggleBtn.addEventListener('click', () => {
  keyVisible = !keyVisible;
  apiKeyInput.type = keyVisible ? 'text' : 'password';
  toggleBtn.textContent = keyVisible ? '🙈' : '👁';
});

// Live preview updates
function updatePreview() {
  const key = apiKeyInput.value.trim();
  $('preview-key').textContent = key ? maskKey(key) : '（未填写）';
  $('preview-key').className = key ? 'env-val-warn' : 'env-val-dim';
  $('preview-main').textContent = $('main-model').value;
  $('preview-fast').textContent = $('fast-model').value;
}

function maskKey(key) {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

apiKeyInput.addEventListener('input', updatePreview);
$('main-model').addEventListener('change', updatePreview);
$('fast-model').addEventListener('change', updatePreview);
updatePreview();

// Apply config
$('btn-apply').addEventListener('click', async () => {
  if ($('config-section').classList.contains('config-disabled')) {
    showToast('⚠️ 请先完成环境安装步骤');
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast('❗ 请先填写 API Key');
    apiKeyInput.focus();
    return;
  }

  const config = {
    apiKey,
    mainModel: $('main-model').value,
    fastModel: $('fast-model').value
  };

  showLoading('正在写入环境变量...');
  log('开始写入环境变量配置...');

  try {
    const result = await window.electronAPI.applyConfig(config);
    hideLoading();
    if (result.success) {
      log('环境变量写入成功 ✓', 'success');
    } else {
      log(`写入失败: ${result.error}`, 'error');
    }
    showResultScreen(result, 'apply');
  } catch (err) {
    hideLoading();
    log(`写入出错: ${err.message}`, 'error');
    showResultScreen({ success: false, error: err.message || '未知错误' }, 'apply');
  }
});

// Restore config
$('btn-restore').addEventListener('click', async () => {
  if ($('config-section').classList.contains('config-disabled')) {
    showToast('⚠️ 请先完成环境安装步骤');
    return;
  }

  if (!confirm('确定要清除所有 PPIO 相关环境变量吗？')) return;

  showLoading('正在清除配置...');
  log('开始清除 PPIO 环境变量配置...');

  try {
    const result = await window.electronAPI.restoreConfig();
    hideLoading();
    if (result.success) {
      log('配置清除完成 ✓', 'success');
    } else {
      log(`清除失败: ${result.error}`, 'error');
    }
    showResultScreen(result, 'restore');
  } catch (err) {
    hideLoading();
    log(`清除出错: ${err.message}`, 'error');
    showResultScreen({ success: false, error: err.message || '未知错误' }, 'restore');
  }
});

// ─── Result Screen ───────────────────────────────────────────────
function showResultScreen(result, type) {
  const isSuccess = result.success;
  const isRestore = type === 'restore';
  const platform = window.electronAPI.platform;

  const icon = $('result-icon');
  icon.className = 'result-icon ' + (isSuccess ? 'success' : 'error');
  icon.textContent = isSuccess ? (isRestore ? '🗑' : '✅') : '❌';

  $('result-title').textContent = isSuccess
    ? (isRestore ? '配置已清除' : '配置成功！')
    : '出错了';

  $('result-message').textContent = isSuccess
    ? (result.message || '操作完成')
    : `错误信息：\n${result.error}`;

  const nextSteps = $('result-next-steps');
  nextSteps.style.display = (isSuccess && !isRestore) ? 'block' : 'none';

  if (isSuccess && !isRestore) {
    if (platform === 'win32') {
      $('next-step-1').innerHTML = '重启 CMD/PowerShell 窗口';
      const verifyStep = nextSteps.querySelectorAll('.next-step-item')[1];
      verifyStep.querySelector('.step-content').innerHTML =
        '验证配置：运行 <code>echo %ANTHROPIC_AUTH_TOKEN%</code>，应显示你的 API Key';
    } else {
      $('next-step-1').innerHTML = '重启终端，或在当前终端运行 <code>source ~/.zshrc</code>';
    }
  }

  showScreen('result');
}

$('btn-result-back').addEventListener('click', () => showScreen('main'));
$('btn-done').addEventListener('click', () => window.electronAPI.close());

// ─── Loading helpers ─────────────────────────────────────────────
function showLoading(text = '处理中...') {
  $('loading-text').textContent = text;
  $('loading-overlay').classList.add('active');
}

function hideLoading() {
  $('loading-overlay').classList.remove('active');
}

// ─── Toast ────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2500) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── Init: detect existing config ────────────────────────────────
(async () => {
  try {
    const existing = await window.electronAPI.checkConfig();
    if (existing.ANTHROPIC_AUTH_TOKEN) {
      apiKeyInput.value = existing.ANTHROPIC_AUTH_TOKEN;
      updatePreview();
      log('检测到已有 PPIO 配置，可直接更新', 'info');
    }
    if (existing.ANTHROPIC_MODEL) {
      const sel = $('main-model');
      [...sel.options].forEach(o => {
        if (o.value === existing.ANTHROPIC_MODEL) o.selected = true;
      });
    }
    if (existing.ANTHROPIC_SMALL_FAST_MODEL) {
      const sel = $('fast-model');
      [...sel.options].forEach(o => {
        if (o.value === existing.ANTHROPIC_SMALL_FAST_MODEL) o.selected = true;
      });
    }
    updatePreview();
  } catch (e) {
    // silently ignore
  }

  log('PPIO Claude Setup 已启动，请按步骤完成配置', 'info');
})();
