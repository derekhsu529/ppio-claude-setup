/* renderer.js — frontend logic */
'use strict';

// 全局错误捕获 — 防止任何错误无声吞掉
window.onerror = (msg, src, line, col, err) => {
  const body = document.getElementById('log-body');
  if (body) {
    const d = document.createElement('div');
    d.className = 'log-line log-error';
    d.textContent = `[JS ERROR] ${msg} (${src}:${line})`;
    body.appendChild(d);
  }
  console.error('[renderer error]', msg, src, line, err);
};

window.onunhandledrejection = (e) => {
  const body = document.getElementById('log-body');
  if (body) {
    const d = document.createElement('div');
    d.className = 'log-line log-error';
    d.textContent = `[Promise ERROR] ${e.reason}`;
    body.appendChild(d);
  }
  console.error('[unhandled rejection]', e.reason);
};

document.addEventListener('DOMContentLoaded', () => {

  // ─── Helpers ────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ─── Platform: show correct titlebar controls ────────────────
  const platform = window.electronAPI.platform;
  const isMac = platform === 'darwin';

  if (isMac) {
    document.body.classList.add('platform-mac');
    $('controls-mac').style.display = 'flex';
    $('controls-win').style.display = 'none';
  } else {
    $('controls-mac').style.display = 'none';
    $('controls-win').style.display = 'flex';
  }

  // titlebar button bindings
  $('btn-close').addEventListener('click', () => window.electronAPI.close());
  $('btn-min').addEventListener('click',   () => window.electronAPI.minimize());
  $('btn-max').addEventListener('click',   () => window.electronAPI.maximize());
  $('btn-close-win').addEventListener('click', () => window.electronAPI.close());
  $('btn-min-win').addEventListener('click',   () => window.electronAPI.minimize());
  $('btn-max-win').addEventListener('click',   () => window.electronAPI.maximize());

  // ─── Screens ─────────────────────────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
  }

  // ─── Log ────────────────────────────────────────────────────
  function log(msg, type = 'info') {
    const body = $('log-body');
    const d = new Date();
    const ts = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
    const line = document.createElement('div');
    line.className = 'log-line log-' + type;
    line.textContent = `[${ts}] ${msg}`;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }

  $('btn-clear-log').addEventListener('click', () => { $('log-body').innerHTML = ''; });

  // ─── Config-section lock (unlock after both env checks pass) ─
  const state = { nodeOk: false, claudeOk: false };

  function refreshConfigLock() {
    const ready = state.nodeOk && state.claudeOk;
    $('env-ready-banner').style.display = ready ? 'block' : 'none';
    if (ready) {
      $('config-section').classList.remove('config-disabled');
      $('config-section-header').classList.remove('config-disabled');
    } else {
      $('config-section').classList.add('config-disabled');
      $('config-section-header').classList.add('config-disabled');
    }
  }

  // ─── Part 1: Node.js ─────────────────────────────────────────
  $('btn-check-node').addEventListener('click', async () => {
    const btn = $('btn-check-node');
    btn.disabled = true;
    btn.textContent = '🔄 检测中...';
    log('正在检测 Node.js...');

    try {
      const r = await window.electronAPI.checkNode();
      const dot  = $('node-status-badge').querySelector('.status-dot');
      const txt  = $('node-status-text');

      if (r.installed && r.sufficient) {
        dot.className = 'status-dot status-ok';
        txt.textContent = r.version;
        btn.textContent = '已满足 ✓';
        btn.className = 'btn btn-success-static';
        state.nodeOk = true;
        log(`Node.js ${r.version} ✓`, 'success');
      } else if (r.installed) {
        dot.className = 'status-dot status-warn';
        txt.textContent = r.version + '（版本过低）';
        btn.textContent = '前往下载 Node.js';
        btn.className = 'btn btn-warning';
        btn.disabled = false;
        btn.onclick = openNodeDownload;
        log(`Node.js ${r.version} 版本过低，需要 >= 18`, 'warning');
      } else {
        dot.className = 'status-dot status-error';
        txt.textContent = '未安装';
        btn.textContent = '前往下载 Node.js';
        btn.className = 'btn btn-warning';
        btn.disabled = false;
        btn.onclick = openNodeDownload;
        log('未检测到 Node.js，请先安装', 'warning');
      }
    } catch (e) {
      log('检测失败: ' + e.message, 'error');
      btn.textContent = '🔍 检测 Node.js';
      btn.disabled = false;
    }
    refreshConfigLock();
  });

  function openNodeDownload() {
    window.electronAPI.openExternal('https://npmmirror.com/mirrors/node/');
    log('已打开 Node.js 下载页（淘宝镜像），安装后重新打开本工具', 'warning');
  }

  // ─── Part 1: Claude Code ─────────────────────────────────────
  let installing = false;

  $('btn-check-claude').addEventListener('click', async () => {
    if (installing) return;
    const btn = $('btn-check-claude');
    btn.disabled = true;
    btn.textContent = '🔄 检测中...';
    log('正在检测 Claude Code...');

    try {
      const r = await window.electronAPI.checkClaude();
      const dot  = $('claude-status-badge').querySelector('.status-dot');
      const txt  = $('claude-status-text');

      if (r.installed) {
        dot.className = 'status-dot status-ok';
        txt.textContent = r.version;
        btn.textContent = '已安装 ✓';
        btn.className = 'btn btn-success-static';
        state.claudeOk = true;
        log(`Claude Code ${r.version} ✓`, 'success');
      } else {
        dot.className = 'status-dot status-error';
        txt.textContent = '未安装';
        btn.textContent = '安装 Claude Code';
        btn.className = 'btn btn-primary';
        btn.disabled = false;
        btn.onclick = () => installClaude();
        log('未安装 Claude Code，点击「安装 Claude Code」进行安装', 'info');
      }
    } catch (e) {
      log('检测失败: ' + e.message, 'error');
      btn.textContent = '🔍 检测 Claude Code';
      btn.disabled = false;
    }
    refreshConfigLock();
  });

  async function installClaude() {
    if (installing) return;
    installing = true;
    const btn = $('btn-check-claude');
    btn.disabled = true;
    btn.textContent = '⏳ 安装中...';
    btn.className = 'btn btn-secondary';

    log('开始安装 Claude Code（淘宝 npm 镜像，国内可用）...', 'info');
    log('预计 1-3 分钟，请勿关闭窗口...', 'info');

    window.electronAPI.offInstallProgress();
    window.electronAPI.onInstallProgress(data => {
      (data.text || '').trim().split('\n').forEach(l => {
        const t = l.trim();
        if (t) log(t, data.type === 'stderr' ? 'warning' : 'info');
      });
    });

    try {
      const r = await window.electronAPI.installClaude();
      window.electronAPI.offInstallProgress();

      const dot = $('claude-status-badge').querySelector('.status-dot');
      const txt = $('claude-status-text');

      if (r.success) {
        const v = await window.electronAPI.checkClaude();
        dot.className = 'status-dot status-ok';
        txt.textContent = v.installed ? v.version : '已安装';
        btn.textContent = '已安装 ✓';
        btn.className = 'btn btn-success-static';
        btn.onclick = null;
        state.claudeOk = true;
        log('Claude Code 安装成功 ✓', 'success');
      } else {
        dot.className = 'status-dot status-error';
        txt.textContent = '安装失败';
        btn.textContent = '重试';
        btn.className = 'btn btn-danger';
        btn.disabled = false;
        btn.onclick = () => installClaude();
        log('安装失败: ' + (r.error || '未知'), 'error');
      }
    } catch (e) {
      window.electronAPI.offInstallProgress();
      btn.textContent = '重试';
      btn.className = 'btn btn-danger';
      btn.disabled = false;
      btn.onclick = () => installClaude();
      log('安装出错: ' + e.message, 'error');
    }

    installing = false;
    refreshConfigLock();
  }

  // ─── Part 2: API Key toggle ──────────────────────────────────
  const apiKeyInput = $('api-key');
  let keyVisible = false;

  $('toggle-key').addEventListener('click', () => {
    keyVisible = !keyVisible;
    apiKeyInput.type = keyVisible ? 'text' : 'password';
    $('toggle-key').textContent = keyVisible ? '🙈' : '👁';
  });

  // ─── Part 2: Model selects (with custom input option) ────────
  function getModelValue(selectId, customId) {
    const sel = $(selectId);
    if (sel.value === '__custom__') {
      return $(customId).value.trim();
    }
    return sel.value;
  }

  function handleModelChange(selectId, customId) {
    const sel = $(selectId);
    const custom = $(customId);
    if (sel.value === '__custom__') {
      custom.style.display = 'block';
      custom.focus();
    } else {
      custom.style.display = 'none';
    }
    updatePreview();
  }

  $('main-model').addEventListener('change', () => handleModelChange('main-model', 'main-model-custom'));
  $('fast-model').addEventListener('change', () => handleModelChange('fast-model', 'fast-model-custom'));
  $('main-model-custom').addEventListener('input', updatePreview);
  $('fast-model-custom').addEventListener('input', updatePreview);

  // ─── Part 2: Preview ─────────────────────────────────────────
  function maskKey(k) {
    if (!k) return '（未填写）';
    if (k.length <= 8) return '••••••••';
    return k.slice(0, 4) + '••••' + k.slice(-4);
  }

  function updatePreview() {
    const key   = apiKeyInput.value.trim();
    const main  = getModelValue('main-model', 'main-model-custom') || '（未选择）';
    const fast  = getModelValue('fast-model', 'fast-model-custom') || '（未选择）';

    const previewKey = $('preview-key');
    previewKey.textContent = key ? maskKey(key) : '（未填写）';
    previewKey.className   = key ? 'env-val-warn' : 'env-val-dim';

    $('preview-main').textContent = main;
    $('preview-fast').textContent = fast;
  }

  apiKeyInput.addEventListener('input', updatePreview);
  updatePreview();

  // ─── Part 2: Register link ───────────────────────────────────
  $('link-register').addEventListener('click', e => {
    e.preventDefault();
    window.electronAPI.openExternal('https://api.ppio.com');
  });

  // ─── Part 2: Apply config ────────────────────────────────────
  $('btn-apply').addEventListener('click', async () => {
    // config-disabled check
    if ($('config-section').classList.contains('config-disabled')) {
      showToast('⚠️ 请先完成环境安装步骤');
      return;
    }

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showToast('❗ 请先填写 PPIO API Key');
      apiKeyInput.focus();
      return;
    }

    const mainModel = getModelValue('main-model', 'main-model-custom');
    const fastModel = getModelValue('fast-model', 'fast-model-custom');

    if (!mainModel || mainModel === '（未选择）') {
      showToast('❗ 请选择主模型');
      return;
    }
    if (!fastModel || fastModel === '（未选择）') {
      showToast('❗ 请选择快速模型');
      return;
    }

    showLoading('正在写入环境变量...');
    log('开始写入配置...');

    try {
      const result = await window.electronAPI.applyConfig({ apiKey, mainModel, fastModel });
      hideLoading();
      log(result.success ? '写入成功 ✓' : '写入失败: ' + result.error,
          result.success ? 'success' : 'error');
      showResultScreen(result, 'apply');
    } catch (e) {
      hideLoading();
      log('写入出错: ' + e.message, 'error');
      showResultScreen({ success: false, error: e.message }, 'apply');
    }
  });

  // ─── Part 2: Restore config ──────────────────────────────────
  $('btn-restore').addEventListener('click', async () => {
    if ($('config-section').classList.contains('config-disabled')) {
      showToast('⚠️ 请先完成环境安装步骤');
      return;
    }
    if (!confirm('确定要清除所有 PPIO 相关环境变量吗？')) return;

    showLoading('正在清除配置...');
    log('开始清除配置...');

    try {
      const result = await window.electronAPI.restoreConfig();
      hideLoading();
      log(result.success ? '清除成功 ✓' : '清除失败: ' + result.error,
          result.success ? 'success' : 'error');
      showResultScreen(result, 'restore');
    } catch (e) {
      hideLoading();
      log('清除出错: ' + e.message, 'error');
      showResultScreen({ success: false, error: e.message }, 'restore');
    }
  });

  // ─── Result Screen ───────────────────────────────────────────
  function showResultScreen(result, type) {
    const icon = $('result-icon');
    icon.className = 'result-icon ' + (result.success ? 'success' : 'error');
    icon.textContent = result.success ? (type === 'restore' ? '🗑' : '✅') : '❌';

    $('result-title').textContent = result.success
      ? (type === 'restore' ? '配置已清除' : '配置成功！')
      : '出错了';

    $('result-message').textContent = result.success
      ? (result.message || '操作完成')
      : ('错误信息：\n' + result.error);

    const nextSteps = $('result-next-steps');
    nextSteps.style.display = (result.success && type !== 'restore') ? 'block' : 'none';

    if (result.success && type !== 'restore') {
      if (platform === 'win32') {
        $('next-step-1').innerHTML = '重启 CMD / PowerShell 窗口';
        nextSteps.querySelectorAll('.next-step-item')[1]
          .querySelector('.step-content').innerHTML =
          '验证配置：运行 <code>echo %ANTHROPIC_AUTH_TOKEN%</code>，应显示你的 API Key';
      } else {
        $('next-step-1').innerHTML = '重启终端，或运行 <code>source ~/.zshrc</code>';
      }
    }

    showScreen('result');
  }

  $('btn-result-back').addEventListener('click', () => showScreen('main'));
  $('btn-done').addEventListener('click',        () => window.electronAPI.close());

  // ─── Loading ─────────────────────────────────────────────────
  function showLoading(text) {
    $('loading-text').textContent = text || '处理中...';
    $('loading-overlay').classList.add('active');
  }
  function hideLoading() {
    $('loading-overlay').classList.remove('active');
  }

  // ─── Toast ────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, ms = 2500) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ─── Init: load existing env vars ────────────────────────────
  (async () => {
    try {
      const existing = await window.electronAPI.checkConfig();

      if (existing.ANTHROPIC_AUTH_TOKEN) {
        apiKeyInput.value = existing.ANTHROPIC_AUTH_TOKEN;
        log('检测到已有配置，可直接更新', 'info');
      }

      if (existing.ANTHROPIC_MODEL) {
        const s = $('main-model');
        const found = [...s.options].find(o => o.value === existing.ANTHROPIC_MODEL);
        if (found) {
          s.value = existing.ANTHROPIC_MODEL;
        } else {
          // unknown model: use custom input
          s.value = '__custom__';
          $('main-model-custom').style.display = 'block';
          $('main-model-custom').value = existing.ANTHROPIC_MODEL;
        }
      }

      if (existing.ANTHROPIC_SMALL_FAST_MODEL) {
        const s = $('fast-model');
        const found = [...s.options].find(o => o.value === existing.ANTHROPIC_SMALL_FAST_MODEL);
        if (found) {
          s.value = existing.ANTHROPIC_SMALL_FAST_MODEL;
        } else {
          s.value = '__custom__';
          $('fast-model-custom').style.display = 'block';
          $('fast-model-custom').value = existing.ANTHROPIC_SMALL_FAST_MODEL;
        }
      }

      updatePreview();
    } catch (e) {
      // ignore
    }

    log('PPIO Claude Setup 已启动，按步骤完成配置', 'info');
  })();

}); // end DOMContentLoaded
