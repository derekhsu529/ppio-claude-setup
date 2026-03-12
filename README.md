# ⚡ PPIO Claude Code Setup

> 一键配置 Claude Code + PPIO API 环境变量的图形化工具，适合电脑小白使用。

[![Release](https://img.shields.io/github/v/release/derekhsu529/ppio-claude-setup?style=flat-square)](https://github.com/derekhsu529/ppio-claude-setup/releases)
[![License](https://img.shields.io/github/license/derekhsu529/ppio-claude-setup?style=flat-square)](LICENSE)

---

## 📸 界面预览

深色主题 · 步骤指引 · 一键配置

```
┌─────────────────────────────────────┐
│  ⚡ PPIO Claude Code Setup               │
├─────────────────────────────────────┤
│                                     │
│   欢迎 → 配置 → 完成               │
│                                     │
│  🔑 填写 API Key                    │
│  🤖 选择模型组合                    │
│  ⚡ 一键写入环境变量                │
│                                     │
└─────────────────────────────────────┘
```

---

## 🚀 快速开始

### 下载安装（推荐）

前往 [Releases](https://github.com/derekhsu529/ppio-claude-setup/releases) 页面下载：

| 平台 | 文件 |
|------|------|
| 🍎 macOS (Intel + Apple Silicon) | `PPIO-Claude-Setup-*.dmg` |
| 🪟 Windows 10/11 | `PPIO-Claude-Setup-Setup-*.exe` |

### 本地运行（开发者）

```bash
# 克隆仓库
git clone https://github.com/derekhsu529/ppio-claude-setup.git
cd ppio-claude-setup

# 安装依赖
npm install

# 启动应用
npm start

# 打包
npm run build:mac    # macOS DMG
npm run build:win    # Windows NSIS
npm run build:all    # 两个平台
```

---

## 📋 功能说明

### 配置的环境变量

| 变量名 | 值 |
|--------|-----|
| `ANTHROPIC_BASE_URL` | `https://api.ppio.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | 你的 PPIO API Key |
| `ANTHROPIC_MODEL` | 主模型（可选） |
| `ANTHROPIC_SMALL_FAST_MODEL` | 快速模型（可选） |

### 预设模型

| 模型 | 用途 |
|------|------|
| `pa/claude-opus-4-6` | 最强，适合复杂任务 |
| `pa/claude-sonnet-4-6` | 推荐，平衡速度与质量 |
| `pa/claude-haiku-4-5-20251001` | 快速，适合简单补全 |
| `moonshotai/kimi-k2-instruct` | 国产模型 |

### 平台适配

**macOS / Linux**
- 写入 `~/.zshrc` 和 `~/.bash_profile`
- 使用标记块管理，支持重复覆盖
- 配置完成后运行 `source ~/.zshrc` 或重启终端

**Windows**
- 使用 `setx` 命令写入用户级环境变量
- 配置完成后重启 CMD / PowerShell

---

## 🍎 macOS 安装说明

由于本工具未经 Apple 公证，首次安装时 macOS 会拦截运行。请按以下步骤操作：

### 第一步：打开 DMG 并拖入应用程序

下载 `.dmg` 文件后，双击打开，将 **PPIO Claude Code Setup** 拖到「应用程序」文件夹。

### 第二步：绕过 Gatekeeper 拦截

首次双击应用时，系统会弹出"无法打开，因为无法验证开发者"的提示。请按以下步骤操作：

1. 打开 **系统设置** → **隐私与安全性**
2. 向下滚动，找到「安全性」一栏，会看到类似"已阻止使用 PPIO Claude Code Setup，因为来自身份不明的开发者"
3. 点击右侧的 **「仍要打开」** 按钮
4. 在弹出的确认对话框中再次点击 **「打开」**

> 💡 如果没有看到「仍要打开」按钮，可以在 Finder 中**右键点击**应用图标 → 选择「打开」，然后在弹出框中点击「打开」。

完成后，后续每次打开无需重复此操作。

---

## 🗑 清除配置

点击「清除配置」按钮：
- Mac: 从 `.zshrc` 和 `.bash_profile` 删除对应配置块
- Windows: 使用 `REG DELETE` 删除用户级环境变量

---

## 🔧 开发

### 技术栈

- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- [electron-builder](https://www.electron.build/) — 打包工具
- 纯 HTML / CSS / JS，无框架依赖

### 项目结构

```
ppio-claude-setup/
├── main.js          # 主进程（Electron, 系统操作）
├── preload.js       # 预加载脚本（安全桥接）
├── renderer.html    # 渲染层 HTML
├── renderer.js      # 渲染层逻辑
├── styles.css       # 样式（深色主题）
├── assets/          # 图标资源
│   ├── icon.icns    # macOS 图标
│   └── icon.ico     # Windows 图标
├── package.json
└── .github/
    └── workflows/
        └── build.yml  # GitHub Actions 自动构建
```

### 发布新版本

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions 会自动构建 Mac DMG 和 Windows EXE，并创建 Release。

---

## 📄 License

MIT © 2024 PPIO

---

## 🆘 遇到问题？

使用过程中如遇到任何问题，欢迎通过以下方式获取帮助：

- 📧 **邮件支持**：[support@ppio.com](mailto:support@ppio.com)
- 🐛 **提交 Issue**：[GitHub Issues](https://github.com/derekhsu529/ppio-claude-setup/issues)

---

## 🔗 相关链接

- [PPIO 官网](https://api.ppio.com)
- [Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code)
- [问题反馈](https://github.com/derekhsu529/ppio-claude-setup/issues)
