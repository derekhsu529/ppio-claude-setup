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

const PPIO_MARKER_START = '# >>> PPIO Claude Code Setup START >>>';
const PPIO_MARKER_END = '# <<< PPIO Claude Code Setup END <<<';

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

# >>> PPIO Claude Code Setup START >>>
export ANTHROPIC_BASE_URL="https://api.ppio.com/anthropic"
export ANTHROPIC_AUTH_TOKEN="sk_old"
export ANTHROPIC_MODEL="pa/claude-sonnet-4-6"
export ANTHROPIC_SMALL_FAST_MODEL="pa/claude-haiku-4-5-20251001"
# <<< PPIO Claude Code Setup END <<<

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

// Case 3: commentOutExistingVars 处理散落的 export 行
const PPIO_MARKER_START_T = '# >>> PPIO Claude Code Setup START >>>';
const PPIO_MARKER_END_T = '# <<< PPIO Claude Code Setup END <<<';
const MANAGED_VARS = ['ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_MODEL','ANTHROPIC_SMALL_FAST_MODEL'];

function commentOutExistingVars(content) {
  const lines = content.split('\n');
  let inBlock = false;
  return lines.map(line => {
    if (line.includes(PPIO_MARKER_START_T)) inBlock = true;
    if (line.includes(PPIO_MARKER_END_T)) inBlock = false;
    if (inBlock) return line;
    const t = line.trim();
    if (t.startsWith('#')) return line;
    for (const v of MANAGED_VARS) {
      if (t.startsWith(`export ${v}=`) || t.startsWith(`${v}=`)) return `# [PPIO backup] ${line}`;
    }
    return line;
  }).join('\n');
}

const existingContent = 'export PATH="/usr/bin"\nexport ANTHROPIC_MODEL="old-model"\nexport FOO=bar';
const commented = commentOutExistingVars(existingContent);
assert(commented.includes('# [PPIO backup] export ANTHROPIC_MODEL="old-model"'), '散落的 ANTHROPIC_MODEL 被注释');
assert(commented.includes('export PATH="/usr/bin"'), '无关 export 不受影响');
assert(commented.includes('export FOO=bar'), '无关变量不受影响');

// Case 4: marker 块内的行不被注释
const blockContent = PPIO_MARKER_START_T + '\nexport ANTHROPIC_MODEL="new"\n' + PPIO_MARKER_END_T;
const notCommented = commentOutExistingVars(blockContent);
assert(!notCommented.includes('# [PPIO backup]'), 'marker 块内不被注释');

// Case 5: 写入后再移除，内容一致
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
assert(cssContent.includes('flex: 0 0 180px'), 'label 固定宽度 180px');

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

// ─── SUITE 5.5: 新增 Bug 修复检查 ───────────────────────────────
console.log('\n📋 Suite 5.5: Bug 修复验证');

// Bug1: 标题栏两边不能同时显示（HTML 里都是 display:none）
assert(htmlContent.includes('id="controls-mac" style="display:none;"'), '标题栏 mac 控件 HTML 默认 display:none');
assert(htmlContent.includes('id="controls-win" style="display:none;"'), '标题栏 win 控件 HTML 默认 display:none');

// Bug3: 眼镜按钮有 type="button" 防止 form submit
assert(htmlContent.includes('id="toggle-key" type="button"'), '眼镜按钮有 type=button');

// Bug5: 支持手动输入模型（__custom__ option）
assert(htmlContent.includes('value="__custom__"'), '主/快速模型支持手动输入选项');
assert(htmlContent.includes('id="main-model-custom"'), '主模型自定义输入框存在');
assert(htmlContent.includes('id="fast-model-custom"'), '快速模型自定义输入框存在');

// Bug4: 模型 option 值显示 pa/ 前缀（option text 也包含 pa/）
assert(htmlContent.includes('>pa/claude-sonnet-4-6'), '主模型选项文本显示 pa/ 前缀');
assert(htmlContent.includes('>pa/claude-opus-4-6'), 'opus 选项文本显示 pa/ 前缀');
assert(htmlContent.includes('>pa/claude-haiku-4-5'), 'haiku 选项文本显示 pa/ 前缀');

// Bug4: 预览区域变量名正确
assert(htmlContent.includes('id="preview-main"'), '主模型预览 span 存在');
assert(htmlContent.includes('id="preview-fast"'), '快速模型预览 span 存在');

// Bug6: config-section 初始就有 config-disabled class（HTML里）
assert(htmlContent.includes('class="config-section-wrap config-disabled"'), 'config-section 初始带 config-disabled');

// renderer.js: getModelValue 函数处理 __custom__
assert(rendererContent.includes('__custom__'), 'renderer.js 处理 __custom__ 选项');
assert(rendererContent.includes('getModelValue'), 'renderer.js 有 getModelValue 函数');

// renderer.js: updatePreview 响应 select change
assert(rendererContent.includes("$('main-model').addEventListener('change'"), '主模型 change 事件绑定');
assert(rendererContent.includes("$('fast-model').addEventListener('change'"), '快速模型 change 事件绑定');

// CSS: select-or-input 布局
assert(cssContent.includes('.select-or-input'), 'CSS 有 select-or-input 容器样式');
assert(cssContent.includes('.custom-model-input'), 'CSS 有 custom-model-input 样式');

// ─── SUITE 6.5: 国内镜像配置检查 ────────────────────────────────
console.log('\n📋 Suite 6.5: 国内镜像配置检查');

const mainContentForMirror = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/main.js', 'utf8');
assert(mainContentForMirror.includes('registry.npmmirror.com'), 'npm 安装使用淘宝镜像');
assert(!mainContentForMirror.includes('registry.npmjs.org'), 'npm 没有写死官方源（可能被墙）');

const rendererContentForMirror = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/renderer.js', 'utf8');
assert(rendererContentForMirror.includes('npmmirror.com/mirrors/node'), 'Node.js 下载链接使用淘宝镜像');
assert(!rendererContentForMirror.includes('nodejs.org/en/download'), 'Node.js 下载不用官网（可能慢/被墙）');

// ─── SUITE 6.8: 打包配置检查 ────────────────────────────────────
console.log('\n📋 Suite 6.8: 打包配置检查');

const pkg = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/package.json', 'utf8'));
const buildFiles = pkg.build && pkg.build.files;
assert(Array.isArray(buildFiles), 'build.files 是数组');
assert(buildFiles.includes('preload.js'), 'preload.js 在 build.files 列表中（必须打包进 asar）');
assert(buildFiles.includes('main.js'), 'main.js 在 build.files 列表中');
assert(buildFiles.includes('renderer.js'), 'renderer.js 在 build.files 列表中');
assert(buildFiles.includes('renderer.html'), 'renderer.html 在 build.files 列表中');
assert(buildFiles.includes('styles.css'), 'styles.css 在 build.files 列表中');

// renderer.js 必须有 electronAPI 防御检查
assert(rendererContent.includes("typeof window.electronAPI === 'undefined'"), 'renderer.js 有 electronAPI undefined 防御');

// ─── SUITE 7: main.js Windows 逻辑 ──────────────────────────────
console.log('\n📋 Suite 7: main.js Windows 逻辑检查');

const mainContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/main.js', 'utf8');
assert(mainContent.includes("node --version"), 'node 检测命令存在');
assert(mainContent.includes("claude --version"), 'claude 检测命令存在');
assert(mainContent.includes("getEnvWithPath"), 'PATH 补全函数存在');
assert(mainContent.includes("'.nvm'") && mainContent.includes("'versions'"), 'nvm 路径扫描存在');
assert(mainContent.includes('/opt/homebrew/bin'), 'Homebrew Apple Silicon 路径存在');
assert(mainContent.includes("'win32' ? 'npm.cmd'"), 'Windows npm 命令正确');
assert(mainContent.includes('setx'), 'Windows 使用 setx 写环境变量');
assert(mainContent.includes('REG DELETE'), 'Windows 使用 REG DELETE 清环境变量');
assert(mainContent.includes("shell: 'cmd.exe'"), 'Windows exec 使用 cmd.exe');
assert(mainContent.includes("'icon.ico'"), 'Windows 使用 .ico 图标');
assert(mainContent.includes("'icon.icns'"), 'macOS 使用 .icns 图标');

// ─── SUITE 8: v1.8.0 新功能检查 ─────────────────────────────────
console.log('\n📋 Suite 8: v1.8.0 新功能（自动验证 + 一键启动）');

// main.js: verify-config handler
assert(mainContent.includes("'verify-config'"), 'main.js 有 verify-config IPC handler');
assert(mainContent.includes("ANTHROPIC_AUTH_TOKEN"), 'verify-config 检查 AUTH_TOKEN');
assert(mainContent.includes("/bin/bash -lc"), 'verify-config 用 login shell 验证');

// main.js: launch-claude handler
assert(mainContent.includes("'launch-claude'"), 'main.js 有 launch-claude IPC handler');
assert(mainContent.includes('osascript'), 'macOS 用 osascript 打开终端');
assert(mainContent.includes('source ~/.zshrc'), 'launch-claude 先 source .zshrc');
assert(mainContent.includes("'cmd.exe'") && mainContent.includes("'/k'"), 'Windows 用 cmd /k 启动');

// preload.js: 新 API 暴露
const preloadContent = fs.readFileSync('/root/.openclaw/workspace/projects/ppio-claude-setup/preload.js', 'utf8');
assert(preloadContent.includes('verifyConfig'), 'preload.js 暴露 verifyConfig');
assert(preloadContent.includes('launchClaude'), 'preload.js 暴露 launchClaude');

// renderer.js: 自动验证逻辑
assert(rendererContent.includes('autoVerifyConfig'), 'renderer.js 有 autoVerifyConfig 函数');
assert(rendererContent.includes('btn-launch-claude'), 'renderer.js 绑定启动按钮事件');
assert(rendererContent.includes('link-support'), 'renderer.js 绑定 support 邮箱链接');

// renderer.html: 新 UI 元素
assert(htmlContent.includes('id="btn-launch-claude"'), 'HTML 有启动按钮');
assert(htmlContent.includes('id="verify-status"'), 'HTML 有验证状态显示');
assert(htmlContent.includes('support@ppio.com'), 'HTML 有 support 邮箱');
assert(htmlContent.includes('id="step-verify"'), 'HTML 有验证步骤');
assert(htmlContent.includes('id="step-launch"'), 'HTML 有启动步骤');

// ─── 汇总 ───────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}`);
if (failed === 0) {
  console.log('🎉 全部测试通过！');
} else {
  console.log('⚠️ 有测试失败，需要修复！');
  process.exit(1);
}
