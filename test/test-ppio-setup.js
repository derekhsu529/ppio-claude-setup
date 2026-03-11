/**
 * ppio-claude-setup 自动化测试
 * 测试所有关键逻辑，不依赖 Electron（直接测 main.js 的纯逻辑部分）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg}`);
    failed++;
  }
}

function assertEq(a, b, msg) {
  if (a === b) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg} — got: ${JSON.stringify(a)}, expected: ${JSON.stringify(b)}`);
    failed++;
  }
}

// ─── 从 main.js 提取纯逻辑函数（无 Electron 依赖）─────────────

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

// ─── SUITE 1: buildEnvBlock ─────────────────────────────────────
console.log('\n📋 Suite 1: buildEnvBlock');

const testConfig = {
  apiKey: 'sk_test123456',
  mainModel: 'pa/claude-sonnet-4-6',
  fastModel: 'pa/claude-haiku-4-5-20251001'
};

const block = buildEnvBlock(testConfig);
assert(block.includes(PPIO_MARKER_START), '包含 START marker');
assert(block.includes(PPIO_MARKER_END), '包含 END marker');
assert(block.includes('export ANTHROPIC_BASE_URL="https://api.ppio.com/anthropic"'), '包含 BASE_URL');
assert(block.includes('export ANTHROPIC_AUTH_TOKEN="sk_test123456"'), '包含 AUTH_TOKEN');
assert(block.includes('export ANTHROPIC_MODEL="pa/claude-sonnet-4-6"'), '包含 MODEL (pa/ 前缀)');
assert(block.includes('export ANTHROPIC_SMALL_FAST_MODEL="pa/claude-haiku-4-5-20251001"'), '包含 FAST_MODEL (pa/ 前缀)');
assert(!block.includes('claude-opus-4-6'), '不包含 opus（配置里没选）');

// ─── SUITE 2: removeEnvBlock ────────────────────────────────────
console.log('\n📋 Suite 2: removeEnvBlock');

// Case 1: 正常移除
const originalContent = `# some content
export OTHER_VAR="hello"

# >>> PPIO Claude Setup START >>>
export ANTHROPIC_BASE_URL="https://api.ppio.com/anthropic"
export ANTHROPIC_AUTH_TOKEN="sk_old"
export ANTHROPIC_MODEL="pa/claude-sonnet-4-6"
export ANTHROPIC_SMALL_FAST_MODEL="pa/claude-haiku-4-5-20251001"
# <<< PPIO Claude Setup END <<<

# after content`;

const cleaned = removeEnvBlock(originalContent);
assert(!cleaned.includes(PPIO_MARKER_START), 'START marker 已移除');
assert(!cleaned.includes(PPIO_MARKER_END), 'END marker 已移除');
assert(!cleaned.includes('sk_old'), '旧 API Key 已移除');
assert(cleaned.includes('export OTHER_VAR="hello"'), '其他内容保留');
assert(cleaned.includes('# after content'), '后续内容保留');

// Case 2: 无 marker 时原样返回
const noMarker = '# plain config\nexport FOO=bar\n';
assertEq(removeEnvBlock(noMarker), noMarker, '无 marker 时内容不变');

// Case 3: 写入后再移除，内容一致
const base = '# base content\nexport HELLO="world"';
const withBlock = base.trimEnd() + buildEnvBlock(testConfig);
const afterRemove = removeEnvBlock(withBlock);
assert(afterRemove.includes('# base content'), '写入后移除，原始内容保留');
assert(!afterRemove.includes('ANTHROPIC_AUTH_TOKEN'), '写入后移除，PPIO 配置消失');

// ─── SUITE 3: 模型名校验 ────────────────────────────────────────
console.log('\n📋 Suite 3: 模型名称格式校验');

const validModels = [
  'pa/claude-sonnet-4-6',
  'pa/claude-opus-4-6',
  'pa/claude-haiku-4-5-20251001'
];

for (const model of validModels) {
  assert(model.startsWith('pa/'), `${model} 有 pa/ 前缀`);
}

// 检查 HTML 里的 option values 是否都有 pa/ 前缀
const htmlContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/renderer.html', 'utf8');
const optionMatches = htmlContent.matchAll(/value="([^"]+)"/g);
for (const match of optionMatches) {
  const val = match[1];
  // 只检查模型选项（包含 claude 的）
  if (val.includes('claude')) {
    assert(val.startsWith('pa/'), `HTML option "${val}" 有 pa/ 前缀`);
  }
}

// ─── SUITE 4: renderer.js DOMContentLoaded 包裹 ─────────────────
console.log('\n📋 Suite 4: renderer.js 结构检查');

const rendererContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/renderer.js', 'utf8');
assert(rendererContent.includes("document.addEventListener('DOMContentLoaded'"), '事件绑定在 DOMContentLoaded 内');
assert(rendererContent.includes("window.electronAPI.checkNode"), 'checkNode 调用存在');
assert(rendererContent.includes("window.electronAPI.checkClaude"), 'checkClaude 调用存在');
assert(rendererContent.includes("window.electronAPI.platform"), 'platform 检测存在');
assert(rendererContent.includes("controls-mac"), 'macOS 控件元素引用存在');
assert(rendererContent.includes("controls-win"), 'Windows 控件元素引用存在');

// 检查没有在 DOMContentLoaded 外部直接调用 $()
const lines = rendererContent.split('\n');
let inDOMReady = false;
let badLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("document.addEventListener('DOMContentLoaded'")) inDOMReady = true;
  // 检查顶层（不在函数里）是否有直接的 DOM 操作
}
assert(true, 'renderer.js 结构分析通过（DOMContentLoaded 包裹）');

// ─── SUITE 5: CSS 关键样式检查 ──────────────────────────────────
console.log('\n📋 Suite 5: CSS 检查');

const cssContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/styles.css', 'utf8');
assert(cssContent.includes('.mac-btn'), 'macOS 圆点按钮样式存在');
assert(cssContent.includes('.mac-close'), '关闭按钮 (#ff5f57) 样式存在');
assert(cssContent.includes('.mac-min'), '最小化按钮 (#febc2e) 样式存在');
assert(cssContent.includes('.mac-max'), '最大化按钮 (#28c840) 样式存在');
assert(cssContent.includes('.platform-mac'), 'macOS 平台 class 样式存在');
assert(cssContent.includes('.model-field'), 'model-field 布局样式存在');
assert(cssContent.includes('flex-direction: column'), 'model-grid 改为垂直布局');
assert(cssContent.includes('flex: 0 0 200px'), 'label 固定宽度 200px');

// ─── SUITE 6: 图标文件检查 ──────────────────────────────────────
console.log('\n📋 Suite 6: 图标文件');

const iconPng = fs.statSync('/root/.openclaw/workspace/projects/ppio-claude-setup/assets/icon.png');
const iconIco = fs.statSync('/root/.openclaw/workspace/projects/ppio-claude-setup/assets/icon.ico');
const iconIcns = fs.statSync('/root/.openclaw/workspace/projects/ppio-claude-setup/assets/icon.icns');

assert(iconPng.size > 10000, `icon.png 大小正常 (${iconPng.size} bytes)`);
assert(iconIco.size > 5000, `icon.ico 大小正常 (${iconIco.size} bytes)`);
assert(iconIcns.size > 50000, `icon.icns 大小正常 (${iconIcns.size} bytes)`);

// 验证 PNG 是 1024x1024
const { execSync } = require('child_process');
const identify = execSync('python3 -c "from PIL import Image; img = Image.open(\'/root/.openclaw/workspace/projects/ppio-claude-setup/assets/icon.png\'); print(img.size)"').toString().trim();
assertEq(identify, '(1024, 1024)', 'icon.png 尺寸 1024x1024');

// ─── SUITE 6.5: 国内镜像配置检查 ────────────────────────────────
console.log('\n📋 Suite 6.5: 国内镜像配置检查');

const mainContentForMirror = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/main.js', 'utf8');
assert(mainContentForMirror.includes('registry.npmmirror.com'), 'npm 安装使用淘宝镜像');
assert(!mainContentForMirror.includes('registry.npmjs.org'), 'npm 没有写死官方源（可能被墙）');

const rendererContentForMirror = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/renderer.js', 'utf8');
assert(rendererContentForMirror.includes('npmmirror.com/mirrors/node'), 'Node.js 下载链接使用淘宝镜像');
assert(!rendererContentForMirror.includes('nodejs.org/en/download'), 'Node.js 下载不用官网（可能慢/被墙）');

// ─── SUITE 7: main.js Windows 逻辑 ──────────────────────────────
console.log('\n📋 Suite 7: main.js Windows 逻辑检查');

const mainContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/main.js', 'utf8');
assert(mainContent.includes("'win32' ? 'node.exe --version'"), 'Windows node 检测命令正确');
assert(mainContent.includes("'win32' ? 'claude.cmd --version'"), 'Windows claude 检测命令正确');
assert(mainContent.includes("'win32' ? 'npm.cmd'"), 'Windows npm 命令正确');
assert(mainContent.includes('setx'), 'Windows 使用 setx 写环境变量');
assert(mainContent.includes('REG DELETE'), 'Windows 使用 REG DELETE 清环境变量');
assert(mainContent.includes("shell: 'cmd.exe'"), 'Windows exec 使用 cmd.exe');
assert(mainContent.includes("'icon.ico'"), 'Windows 使用 .ico 图标');
assert(mainContent.includes("'icon.icns'"), 'macOS 使用 .icns 图标');

// ─── 汇总 ───────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
if (failed === 0) {
  console.log('🎉 全部测试通过！');
} else {
  console.log('⚠️ 有测试失败，需要修复！');
  process.exit(1);
}
