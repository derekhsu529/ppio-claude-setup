/* renderer.js — frontend logic (runs in renderer process) */

'use strict';

// ─── Element refs ────────────────────────────────────────────────
const screens = {
  welcome: document.getElementById('screen-welcome'),
  setup:   document.getElementById('screen-setup'),
  result:  document.getElementById('screen-result')
};

const $ = id => document.getElementById(id);

// ─── Navigation ──────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─── Title bar controls ──────────────────────────────────────────
$('btn-min').addEventListener('click', () => window.electronAPI.minimize());
$('btn-max').addEventListener('click', () => window.electronAPI.maximize());
$('btn-close').addEventListener('click', () => window.electronAPI.close());

// ─── Welcome Screen ──────────────────────────────────────────────
$('btn-start').addEventListener('click', () => {
  showScreen('setup');
});

// ─── Register link ───────────────────────────────────────────────
$('link-register').addEventListener('click', () => {
  window.electronAPI.openExternal('https://api.ppio.com');
});

// ─── Setup Screen ────────────────────────────────────────────────
$('btn-back').addEventListener('click', () => showScreen('welcome'));

// API Key visibility toggle
const apiKeyInput = $('api-key');
const toggleBtn   = $('toggle-key');
let keyVisible = false;

toggleBtn.addEventListener('click', () => {
  keyVisible = !keyVisible;
  apiKeyInput.type = keyVisible ? 'text' : 'password';
  toggleBtn.textContent = keyVisible ? '🙈' : '👁';
});

// Live preview updates
function updatePreview() {
  const key = apiKeyInput.value.trim();
  $('preview-key').textContent = key
    ? maskKey(key)
    : '（未填写）';
  $('preview-key').style.color = key ? 'var(--warning)' : 'var(--text-dim)';

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

// Init preview
updatePreview();

// ─── Apply Config ────────────────────────────────────────────────
$('btn-apply').addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showToast('❗ 请先填写 API Key');
    apiKeyInput.focus();
    return;
  }

  if (!apiKey.startsWith('sk') && apiKey.length < 10) {
    showToast('⚠️ API Key 格式可能不正确，请确认');
  }

  const config = {
    apiKey,
    mainModel: $('main-model').value,
    fastModel: $('fast-model').value
  };

  showLoading('正在写入环境变量...');

  try {
    const result = await window.electronAPI.applyConfig(config);
    hideLoading();
    showResultScreen(result, 'apply');
  } catch (err) {
    hideLoading();
    showResultScreen({ success: false, error: err.message || '未知错误' }, 'apply');
  }
});

// ─── Restore Config ──────────────────────────────────────────────
$('btn-restore').addEventListener('click', async () => {
  if (!confirm('确定要清除所有 PPIO 相关环境变量吗？')) return;

  showLoading('正在清除配置...');

  try {
    const result = await window.electronAPI.restoreConfig();
    hideLoading();
    showResultScreen(result, 'restore');
  } catch (err) {
    hideLoading();
    showResultScreen({ success: false, error: err.message || '未知错误' }, 'restore');
  }
});

// ─── Result Screen ───────────────────────────────────────────────
function showResultScreen(result, type) {
  const isSuccess = result.success;
  const isRestore = type === 'restore';
  const platform  = window.electronAPI.platform;

  // Icon
  const icon = $('result-icon');
  icon.className = 'result-icon ' + (isSuccess ? 'success' : 'error');
  icon.textContent = isSuccess ? (isRestore ? '🗑' : '✅') : '❌';

  // Title
  $('result-title').textContent = isSuccess
    ? (isRestore ? '配置已清除' : '配置成功！')
    : '出错了';

  // Message
  $('result-message').textContent = isSuccess
    ? (result.message || '操作完成')
    : `错误信息：\n${result.error}`;

  // Next steps visibility
  const nextSteps = $('result-next-steps');
  nextSteps.style.display = (isSuccess && !isRestore) ? 'block' : 'none';

  // Adapt next steps per platform
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

  // Mark step 3 active
  $('step2').classList.remove('active');
  $('step2').classList.add('done');
  $('step3').classList.add('active');

  showScreen('result');
}

$('btn-result-back').addEventListener('click', () => showScreen('setup'));
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
      showToast('✓ 检测到已有配置，可直接更新');
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
})();
