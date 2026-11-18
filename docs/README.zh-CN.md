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
[![Release](https://img.shields.io/badge/version-v1.3.3-brightgreen.svg)](https://github.com/DungDT293/RETUBEMATRIX/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/DungDT293/RETUBEMATRIX)

</div>

---

## 概述 (Overview)

**RETubeMatrix** 是专为专业 YouTube 矩阵运营打造的自动化分析与搬运管理系统。平台结合了超轻量级 **Tauri 2.0 (Rust)** 后端、**React 19 + TypeScript + Tailwind CSS** 现代前端、**MultiBrowser Chromium 反指纹引擎**、自动化 Cookie 提取穿透 Bot 拦截机制以及智能版权规避处理管道。

---

## 9 大核心功能 (Core Capabilities)

### 1. 系统概览 (Dashboard & 1对1对齐)

- **1对1对齐矩阵**：深度关联竞争对手频道（Scraped Source）与系统目标配置（Profile），精确掌控抓取视频数、已下载数、BKT测试数及对齐关键词。
- **防错发机制**：自动标记并以琥珀色预警 `[未绑定 - 易混淆]`，防止内容误发至错误频道。

### 2. 配置管理 (MultiBrowser Anti-detect)

- 独立指纹隔离 Chromium 浏览器配置（Canvas, WebGL, AudioContext, User-Agent, Client Rects, WebRTC）。
- 支持独立绑定 IPv4/IPv6 代理（HTTP, SOCKS5）。
- 窗口自动平铺布局（Auto-tile Grid 2x2, 3x3）及 YouTube Studio 安全养号脚本。

### 3. 频道追踪与视频分析

- **多维度视频扫描**：支持按最新、最热门（Viral）、最早、时长长短、标题A-Z排序。
- **灵活时间过滤**：全部、近3天、近7天或自定义时间跨度。
- **快捷批量操作**：快速选择 Top 5、Top 10、Top 20 视频，一键提交“纯净下载”或“BKT测试”。
- **防重复处理防护**：自动比对本地存储与云端发布数据库，杜绝重复下载或重复调度已发布的视频。

### 4. 搬运处理与版权测试 (Copyright Shield)

- **多级版权规避**：支持自由开关规避处理；通过 FFprobe 动态音频重采样（`asetrate={sr}*pitch,aresample={sr},atempo={speed/pitch}`）消除音频漂移。
- **默认清空元数据**：下载时彻底清除 EXIF、标签、原始作者等所有敏感元数据。
- **红绿灯风险预警系统 (Traffic Light)**：
  - **[绿色 / Green]**：频道内容健康安全，版权干净。
  - **[黄色 / Yellow]**：最新视频或历史存在版权纠纷（黄色预警）。
  - **[红色 / Red - 黑名单]**：连续 2 个视频命中版权 -> 立即标红并自动关闭 auto_download，锁定扫描和下载以保障系统安全。
- **独立版权测试频道 (BKT)**：
  - 严格限制 24 小时内最多测试 15 个视频。
  - 配额耗尽后自动暂停发布并轮转至其他有余量的测试频道。
  - 与主盈利账号物理隔离，彻底隔绝主账号受罚风险。

### 5. 爆款发掘 (Outlier Hunter & Ikigai 模型)

- **日式 Ikigai 矩阵选品思维**：精准结合（1）观众实际需求、（2）长期制作可行性、（3）商业变现能力（CPM/带货）。
- **深度利基分析工具集**：
  - _YouTube Alphabet Autosuggest (a-z)_：发掘海量长尾关键词。
  - _Google Trends YouTube 搜索 12 个月趋势_：直观展现真实搜索热度。
  - _Content Gap 供给缺口指数_：挖掘高需求低竞争的蓝海领域。
  - _VPH 爆发速度监控_：按小时监控播放增长速度与小频道的病毒式裂变。

### 6. AI 标题与封面优化

- **95% - 5% 标题法则**：保留 95% 原始语境与 SEO 核心词，针对尾部 5% 进行悬念、冲突化微调，大幅提升点击率 (CTR)。
- **Content ID 封面微调**：完整保留原封面人物与关键文字，微调对比度、锐度、缩放 102% 并轻微偏移像素，绕过机器图像哈希识别。

### 7. 纯净视频与播放列表多线程下载

- **自动化测试 Profile Cookie 提取**：自动关联浏览器 Profile 的 Cookies 数据库至 yt-dlp（`--cookies-from-browser`），轻松穿透 `Sign in to confirm you're not a bot` 拦截。
- **全局任务控制栏 (Task Dock) 与实时 ETA**：浮动常驻任务中心实时展示下载、渲染和发布的进度、速度与预计剩余时间 (ETA)；支持多页面切换无缝持久化。
- 支持 720p、1080p 至 4K、8K 高清视频解析下载。
- 支持整张播放列表并发下载，支持直播回放从头拉取。

### 8. 分类日志与故障诊断

- 自动拆分为 6 类独立日志文件：
  - `download.log` — 媒体下载与抓取记录。
  - `channels.log` — 竞争对手频道扫描历史。
  - `bkt_test.log` — YouTube Studio 版权检测与发布明细。
  - `outlier.log` — 爆款雷达与关键词挖掘日志。
  - `reup.log` — 视频去重渲染与变造流水线。
  - `ai.log` — AI 标题与封面处理记录。
- 提供详尽的诊断提示及快速修复指引。

### 9. 系统安装与配置

- 全离线集成包：内置 Python 3.11 embed、Chromium 155、FFmpeg/FFprobe、Deno、yt-dlp，开箱即用无需配置额外环境。

---

## 安装说明 (Installation)

请前往 [Releases 页面](https://github.com/DungDT293/RETUBEMATRIX/releases) 获取最新安装包：

| 平台            | 格式                   | 说明                                                 |
| :-------------- | :--------------------- | :--------------------------------------------------- |
| **Windows x64** | `.exe` (NSIS Setup)    | 完整离线安装包，内置全套依赖组件                     |
| **Windows x64** | `.msi` (MSI Installer) | 标准企业级 Windows Installer 安装包                  |

---

## 源码构建 (Build from Source)

### 环境要求

- [Bun](https://bun.sh/) (v1.3.5 或更高版本)
- [Rust](https://www.rust-lang.org/) (v1.77.2 或更高版本)
- [Tauri CLI 2.0](https://tauri.app/)

### 构建步骤

```bash
# 克隆代码仓库
git clone https://github.com/DungDT293/RETUBEMATRIX.git
cd RETUBEMATRIX

# 使用 Bun 安装依赖
bun install

# 启动开发模式
bun run tauri dev

# 打包正式生产版本
bun run tauri build
```

---

## 版权与许可 (License)

本项目采用 **MIT License** 开源许可证 — 详情请参见 [LICENSE](../LICENSE) 文件。
