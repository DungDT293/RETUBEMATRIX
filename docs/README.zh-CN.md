# RETubeMatrix

<div align="center">

[![English](../README.md)](../README.md)
[![Tiếng Việt](README.vi.md)](README.vi.md)
[![简体中文](README.zh-CN.md)](README.zh-CN.md)

  <a href="#">
    <img src="../src-tauri/icons/icon.png" alt="RETubeMatrix Logo" width="128" height="128">
  </a>

**RETubeMatrix — 专业的 YouTube 搬运自动化、爆款发掘与版权测试平台**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/badge/version-v0.20.8-brightgreen.svg)](https://github.com/DungDT293/RETUBEMATRIX/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/DungDT293/RETUBEMATRIX)

</div>

---

## 🌟 概述 (Overview)

**RETubeMatrix** 是专为专业 YouTube 矩阵运营打造的自动化分析与搬运管理系统。平台结合了超轻量级 **Tauri 2.0 (Rust)** 后端、**React 19 + TypeScript + Tailwind CSS** 现代前端、**MultiBrowser Chromium 反指纹引擎** 以及智能版权规避处理管道。

---

## 🚀 9 大核心功能 (Core Capabilities)

### 1. 系统概览 (Dashboard & 1对1对齐)

- **1对1对齐矩阵**：深度关联竞争对手频道（Scraped Source）与系统目标配置（Profile），精确掌控抓取视频数、已下载数、BKT测试数及对齐关键词。
- **防错发机制**：自动标记并以琥珀色预警 `⚠️ 未绑定（易混淆）`，防止内容误发至错误频道。

### 2. 配置管理 (MultiBrowser Anti-detect)

- 独立指纹隔离 Chromium 浏览器配置（Canvas, WebGL, AudioContext, User-Agent, Client Rects, WebRTC）。
- 支持独立绑定 IPv4/IPv6 代理（HTTP, SOCKS5）。
- 窗口自动平铺布局（Auto-tile Grid 2x2, 3x3）及 YouTube Studio 安全养号脚本。

### 3. 频道追踪与视频分析

- **多维度视频扫描**：支持按最新、最热门（Viral）、最早、时长长短、标题A-Z排序。
- **灵活时间过滤**：全部、近3天、近7天或自定义时间跨度。
- **快捷批量操作**：快速选择 Top 5、Top 10、Top 20 视频，一键提交“纯净下载”或“BKT测试”。

### 4. 搬运处理与版权测试 (Copyright Shield)

- **多级版权规避**：支持自由开关规避处理；通过 FFprobe 动态音频重采样（`asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`）消除音频漂移。
- **默认清除原始元数据**：下载后自动抹除原始 EXIF、元数据与作者标签。
- **红黄绿交通灯风险评级体系**：
  - 🟢 **绿灯（Green）**：该频道所有视频均无版权问题，安全可用。
  - 🟡 **黄灯（Yellow）**：最新视频或单个旧视频检出版权警示。
  - 🔴 **红灯（Red - 黑名单）**：连续 2 个视频命中版权 ➔ 立即锁定红标，自动禁用 auto_download = 0，阻断抓取与下载。
- **独立版权测试频道**：
  - 严格限制 24 小时内最多 15 个视频配额。
  - 额度耗尽后自动锁发并无缝轮换至其他测试频道。
  - 与正式收益频道物理隔离，保障账号安全。

### 5. 爆款发掘 (Outlier Hunter & Ikigai 模型)

- **日本 Ikigai 细分赛道思维**：聚焦于（1）受众真实需求、（2）长期持续产出能力及（3）商业变现路径（CPM/联盟营销）的三方交汇点。
- **深度赛道分析工具集**：
  - _YouTube Alphabet Autosuggest (a-z)_：长尾关键词深度挖掘。
  - _Google Trends YouTube Search 12个月_：实时追踪需求热度变化。
  - _Content Gap 内容空缺指数_：精准发现高搜索低供给的蓝海机会。
  - _VPH（每小时播放量）与爆发加速度_：捕捉小频道黑马爆款视频。

### 6. AI 标题与封面优化

- **95% - 5% 标题法则**：保留 95% 核心上下文与 SEO 关键词，优化 5% 结尾悬念钩子，大幅提升点击率（CTR）。
- **封面 Content ID 扰动**：完整保留原图人物与文字，微调对比度、锐度、放大 102% 与微幅像素平移，有效突破哈希比对。

### 7. 纯净视频下载与多线程播放列表

- 基于内置 yt-dlp 支持 720p、1080p、4K、8K 高画质多线程下载。
- 完整播放列表批量下载，支持直播从头录制。

### 8. 分类日志与排错审计

- 自动归档运行日志至 6 个专业文件：
  - `download.log` — 视频下载与媒体提取日志。
  - `channels.log` — 频道抓取与分析进度。
  - `bkt_test.log` — YouTube Studio 上传与版权测试明细。
  - `outlier.log` — 爆款雷达与关键词金矿数据。
  - `reup.log` — 视频渲染规避变换记录。
  - `ai.log` — AI 标题与封面优化记录。
- 提供带明确排错指引的越南语错误反馈。

### 9. 系统配置与纯净离线部署

- 全离线独立打包：预打包 Python 3.11 embed、Chromium 155、FFmpeg/FFprobe、Deno 及 yt-dlp，纯净系统开箱即用。

---

## 📦 安装说明 (Installation)

前往 [Releases 页面](https://github.com/DungDT293/RETUBEMATRIX/releases) 下载最新发行版：

| 平台            | 格式                   | 说明                             |
| :-------------- | :--------------------- | :------------------------------- |
| **Windows x64** | `.exe` (NSIS Setup)    | 完整独立安装包，内置全部运行环境 |
| **Windows x64** | `.msi` (MSI Installer) | 企业级标准 Windows 安装包        |

---

## 🛠️ 源码构建 (Build from Source)

### 环境要求

- [Bun](https://bun.sh/) (v1.3.5+) 或 [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/) (v1.77.2+)
- [Tauri CLI 2.0](https://tauri.app/)

### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/DungDT293/RETUBEMATRIX.git
cd RETUBEMATRIX

# 安装依赖
bun install   # 或 npm install

# 启动开发环境
bun run tauri dev

# 打包正式发布版本
bun run tauri build
```

---

## 📄 开源许可 (License)

本项目基于 **MIT License** 开源，详情见 [LICENSE](../LICENSE)。
