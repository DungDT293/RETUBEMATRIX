/**
 * RETubeMatrix SaaS Master Control Portal
 * Single-Page Web Application rendered by Cloudflare Worker
 * Dark Mode, Minimalist, High-Tech, Professional Executive UI
 */

export function getPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RETubeMatrix — SaaS Master Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            brand: {
              50: '#eef2ff',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
            },
            dark: {
              950: '#06070a',
              900: '#0a0c10',
              850: '#0f1217',
              800: '#151922',
              750: '#1b202c',
              700: '#232938',
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #07090e;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
      overflow-x: hidden;
    }
    .glass-panel {
      background: rgba(15, 18, 25, 0.75);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .glass-card {
      background: rgba(21, 25, 34, 0.6);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .glass-input {
      background: rgba(10, 12, 16, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      transition: all 0.2s ease;
    }
    .glass-input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
      outline: none;
    }
    /* Custom clean scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0a0c10;
    }
    ::-webkit-scrollbar-thumb {
      background: #232938;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #374151;
    }

    /* High-End Dark Mode Floating Tooltip */
    #rtm-tooltip {
      position: fixed;
      z-index: 99999;
      pointer-events: none;
      opacity: 0;
      transform: translateY(3px) scale(0.98);
      transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      background: rgba(10, 13, 20, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.2);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 290px;
      font-size: 11px;
      line-height: 1.45;
      color: #f1f5f9;
      text-align: left;
    }
    #rtm-tooltip.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    #rtm-tooltip .tooltip-title {
      font-weight: 600;
      color: #818cf8;
      font-size: 11px;
      margin-bottom: 2px;
      letter-spacing: 0.01em;
    }
    #rtm-tooltip .tooltip-desc {
      color: #cbd5e1;
      font-size: 10.5px;
    }
    th[data-tooltip], [data-tooltip-cursor] {
      cursor: help;
    }
  </style>
</head>
<body class="min-h-screen antialiased selection:bg-indigo-500/30 selection:text-indigo-200">

  <!-- APP CONTAINER -->
  <div id="app" class="flex flex-col min-h-screen">
    
    <!-- TOP NAVIGATION BAR -->
    <header class="sticky top-0 z-40 glass-panel border-b border-white/5 px-6 py-3.5 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-base tracking-tight text-white">RETubeMatrix</span>
            <span class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">SaaS Master</span>
          </div>
          <p class="text-[11px] text-zinc-400">Enterprise Control & HWID Licensing Gateway</p>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <!-- Live Edge Status Pill -->
        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium cursor-help" data-tooltip="Cổng Edge Worker đang hoạt động thời gian thực tại các máy chủ biên Cloudflare trên toàn cầu." data-tooltip-title="Hạ Tầng Điện Toán Biên">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Cloudflare Edge Online</span>
        </div>

        <!-- User Profile Pill -->
        <div id="user-profile-bar" class="hidden flex items-center gap-3 pl-3 border-l border-white/10 cursor-help" data-tooltip="Tài khoản quản trị đang đăng nhập. Mọi tác vụ cấp khóa và duyệt phần cứng được lưu vết kiểm toán." data-tooltip-title="Phiên Quản Trị">
          <div class="flex flex-col text-right">
            <span id="current-user-name" class="text-xs font-semibold text-zinc-200">Tiến Dũng (Master)</span>
            <span id="current-user-role" class="text-[10px] text-indigo-400 font-mono uppercase">OWNER</span>
          </div>
          <div class="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-medium text-zinc-300">
            D
          </div>
          <button onclick="handleLogout()" data-tooltip="Đăng xuất khỏi cổng quản trị và xóa phiên làm việc an toàn." data-tooltip-title="Đăng Xuất" class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- AUTHENTICATION SCREEN (Shown when logged out) -->
    <div id="auth-container" class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md glass-panel rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div class="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="mb-6 text-center">
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center mb-3">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-white tracking-tight">Đăng Nhập Quản Trị Hệ Thống</h2>
          <p class="text-xs text-zinc-400 mt-1">Cổng điều hành bảo mật cấp cao — Yêu cầu nhập thông tin thủ công</p>
        </div>

        <form id="login-form" onsubmit="handleLoginSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">Email tài khoản</label>
            <input type="email" id="login-email" required autocomplete="username" class="w-full px-3.5 py-2.5 rounded-lg glass-input text-sm" placeholder="name@company.com">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">Mật khẩu</label>
            <input type="password" id="login-password" required autocomplete="current-password" class="w-full px-3.5 py-2.5 rounded-lg glass-input text-sm" placeholder="••••••••••••">
          </div>

          <div id="login-error" class="hidden text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5"></div>

          <button type="submit" id="login-btn" class="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2">
            <span>Truy Cập Hệ Thống</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
            </svg>
          </button>
        </form>
      </div>
    </div>

    <!-- MAIN DASHBOARD PORTAL (Shown when logged in) -->
    <div id="portal-container" class="hidden flex-1 flex">
      
      <!-- SIDEBAR -->
      <aside class="w-64 glass-panel border-r border-white/5 flex flex-col justify-between p-4 shrink-0">
        <div class="space-y-6">
          <div class="space-y-1">
            <p class="px-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Bảng Điều Khiển</p>
            <button onclick="switchTab('dashboard')" id="nav-dashboard" data-tooltip="Báo cáo hiệu suất kinh doanh, số lượng máy trạm và trạng thái bản quyền tổng thể." data-tooltip-title="Tổng Quan & KPI" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
              </svg>
              <span>Tổng Quan & KPI</span>
            </button>
            <button onclick="switchTab('licenses')" id="nav-licenses" data-tooltip="Quản lý vòng đời mã bản quyền, thiết lập hạn mức số máy tối đa và gia hạn thời hạn." data-tooltip-title="Trung Tâm License" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
              </svg>
              <span>Trung Tâm License</span>
            </button>
            <button onclick="switchTab('companies')" id="nav-companies" data-tooltip="Quản trị cơ cấu các công ty, phân quyền hiển thị doanh thu và chính sách nội bộ." data-tooltip-title="Công Ty & Tổ Chức" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.75a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V21"/>
              </svg>
              <span>Công Ty & Tổ Chức</span>
            </button>
            <button onclick="switchTab('users')" id="nav-users" data-tooltip="Quản lý toàn bộ danh sách thành viên, phân quyền Owner/Admin/Leader/User, gán công ty và giải phóng khóa HWID máy." data-tooltip-title="Quản Lý Nhân Sự & Phân Quyền" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span>Quản Lý Nhân Sự & Phân Quyền</span>
            </button>
            <button onclick="switchTab('work-reports')" id="nav-work-reports" data-tooltip="Theo dõi chi tiết công việc từng nhân sự, kênh đích, kênh test, kênh đối thủ, BKT xanh/đỏ và bảng xếp hạng đội ngũ." data-tooltip-title="Chi Tiết Công Việc & Đội Ngũ" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"/>
              </svg>
              <span>Chi Tiết Công Việc & Đội Ngũ</span>
            </button>
            <button onclick="switchTab('devices')" id="nav-devices" data-tooltip="Kiểm soát cơ chế khóa cứng 1 Máy = 1 Tài Khoản và duyệt các yêu cầu thay đổi linh kiện máy tính." data-tooltip-title="Khóa Máy HWID" class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <div class="flex items-center gap-3">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"/>
                </svg>
                <span>Khóa Máy HWID</span>
              </div>
              <span id="pending-reset-badge" class="hidden px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">0</span>
            </button>
            <button onclick="switchTab('analytics')" id="nav-analytics" data-tooltip="Thống kê chi tiết doanh thu thực tế, RPM, CPM và thời lượng xem từ YouTube Studio." data-tooltip-title="Kênh & Doanh Thu" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
              </svg>
              <span>Kênh & Doanh Thu</span>
            </button>
          </div>
        </div>

        <!-- Sidebar Footer Status -->
        <div class="p-3 rounded-xl bg-white/5 border border-white/5 text-xs space-y-2">
          <div class="flex items-center justify-between text-zinc-400 cursor-help" data-tooltip="Mỗi tài khoản nhân viên gắn chặt vào mã định danh SHA-256 của bo mạch chủ, CPU và ổ đĩa máy tính." data-tooltip-title="Bảo Mật Phần Cứng">
            <span>Bảo mật thiết bị</span>
            <span class="text-emerald-400 font-medium">1 Máy = 1 TK</span>
          </div>
          <div class="flex items-center justify-between text-zinc-400 cursor-help" data-tooltip="Bản dựng cổng điều hành Gateway Cloudflare Workers tương thích RETubeMatrix v0.20.16." data-tooltip-title="Phiên Bản Cổng">
            <span>Phiên bản Core</span>
            <span class="font-mono text-zinc-300">0.20.16</span>
          </div>
        </div>
      </aside>

      <!-- MAIN CONTENT VIEW -->
      <main class="flex-1 p-8 overflow-y-auto">

        <!-- =================== TAB 1: DASHBOARD =================== -->
        <section id="tab-dashboard" class="space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Tổng Quan Điều Hành</h1>
              <p class="text-xs text-zinc-400 mt-1">Báo cáo hiệu suất, quy mô hệ thống và hoạt động máy tính thời gian thực</p>
            </div>
            <div class="flex items-center gap-3">
              <button onclick="refreshAllData()" data-tooltip="Đồng bộ lại tức thì các chỉ số mới nhất từ cơ sở dữ liệu Cloudflare D1 / Supabase." data-tooltip-title="Làm Mới Dữ Liệu" class="px-3.5 py-1.5 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <span>Làm Mới</span>
              </button>
              <button onclick="openIssueLicenseModal()" data-tooltip="Khởi tạo mã bản quyền mới với số máy và thời hạn linh hoạt cho đối tác." data-tooltip-title="Cấp Phép Mới" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                <span>Cấp License Mới</span>
              </button>
            </div>
          </div>

          <!-- Pending Alert Banner (If Any) -->
          <div id="pending-alert-banner" data-tooltip="Có máy trạm nhân viên thay đổi linh kiện hoặc cài lại Win cần Admin phê duyệt mới được mở khóa ứng dụng." data-tooltip-title="Yêu Cầu Chờ Duyệt" class="hidden p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between cursor-help">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-amber-200">Có yêu cầu đổi máy HWID đang chờ duyệt!</h4>
                <p class="text-[11px] text-amber-400/80">Nhân viên cần được cấp phép để đăng nhập trên máy tính mới.</p>
              </div>
            </div>
            <button onclick="switchTab('devices')" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition">
              Xem & Phê Duyệt Ngay
            </button>
          </div>

          <!-- 4 EXECUTIVE METRIC CARDS -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <!-- Metric 1: Total Revenue -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="Tổng doanh thu tổng hợp từ báo cáo YouTube Analytics nạp về hàng ngày từ các máy trạm studio (tính theo tỷ giá USD/VND hiện hành 25,000 ₫/USD)." data-tooltip-title="Doanh Thu Ước Tính Hệ Thống">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>Ước Tính Doanh Thu Hệ Thống</span>
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-revenue-vnd">0 ₫</div>
                <div class="text-xs font-mono text-zinc-400 mt-0.5" id="kpi-revenue-usd">$0.00 USD</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Trạng thái dữ liệu</span>
                <span class="text-zinc-500 font-medium" id="kpi-revenue-status">Chưa có kênh nạp báo cáo</span>
              </div>
            </div>

            <!-- Metric 2: Active Licenses -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="Tổng số bản quyền bản Enterprise/Pro đã kích hoạt và tỷ lệ máy trạm (Seats) thực tế đang vận hành trên tổng hạn mức cho phép." data-tooltip-title="Số License & Hạn Mức Máy">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>Số License Đã Cấp</span>
                <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-total-licenses">0 Bản Quyền</div>
                <div class="text-xs text-zinc-400 mt-0.5">Sử dụng: <span id="kpi-used-seats" class="text-indigo-400 font-mono font-medium">0</span> / <span id="kpi-max-seats" class="font-mono">0</span> máy</div>
              </div>
              <div class="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div id="kpi-seat-progress" class="bg-indigo-500 h-1.5 rounded-full" style="width: 0%"></div>
              </div>
            </div>

            <!-- Metric 3: Online Locked Devices -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="Số lượng máy tính trạm đang khóa phần cứng độc quyền (HWID 1 Máy = 1 Tài Khoản) có phát sinh tín hiệu Heartbeat trong 24 giờ qua." data-tooltip-title="Máy Trạm HWID Online">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>Thiết Bị HWID Hoạt Động</span>
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-active-devices">0 Máy</div>
                <div class="text-xs text-zinc-400 mt-0.5">Ràng buộc phần cứng an toàn</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Chế độ khóa</span>
                <span class="text-cyan-400 font-medium">1 Máy = 1 Tài khoản</span>
              </div>
            </div>

            <!-- Metric 4: Monitored Channels -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="Tổng số kênh YouTube mục tiêu đang được cắm Reup & theo dõi bản quyền BKT tự động qua hệ thống Telemetry." data-tooltip-title="Hệ Thống Kênh YouTube">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>Kênh YouTube Quản Lý</span>
                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-monitored-channels">0 Kênh Đích</div>
                <div class="text-xs text-zinc-400 mt-0.5" id="kpi-monitored-videos">0 Video đã tải & Reup</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Tình trạng bản quyền</span>
                <span class="text-zinc-500 font-medium" id="kpi-bkt-status">Chưa liên kết kênh</span>
              </div>
            </div>

          </div>

          <!-- RECENT ACTIVITY TABLE -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">Báo Cáo Tóm Tắt Hoạt Động Theo Ngày</h3>
              <span class="text-xs text-zinc-400">Cập nhật tự động từ YouTube Studio</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Ngày nạp số liệu telemetry tự động từ YouTube Studio của máy trạm." data-tooltip-title="Thời Điểm Ghi Nhận">Ngày Báo Cáo</th>
                    <th class="px-5 py-3" data-tooltip="Tên kênh YouTube đang cắm chạy tool và nạp dữ liệu thống kê." data-tooltip-title="Kênh Đích">Kênh YouTube</th>
                    <th class="px-5 py-3" data-tooltip="Tổng lượt xem video hợp lệ trong ngày ghi nhận bởi YouTube." data-tooltip-title="Lượt Xem Hợp Lệ">Lượt Xem (Views)</th>
                    <th class="px-5 py-3" data-tooltip="Tổng thời lượng người xem tích lũy (Watch Hours) đạt chuẩn BKT." data-tooltip-title="Giờ Xem Tích Lũy">Giờ Xem</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu quảng cáo và YouTube Premium tính bằng Đô la Mỹ (USD)." data-tooltip-title="Doanh Thu USD">Doanh Thu Ước Tính (USD)</th>
                    <th class="px-5 py-3" data-tooltip="Quy đổi sang Việt Nam Đồng theo tỷ giá hệ thống 25,000 ₫/USD." data-tooltip-title="Quy Đổi VNĐ">Quy Đổi VNĐ</th>
                    <th class="px-5 py-3" data-tooltip="Trạng thái rà quét bản quyền: BKT Xanh chứng nhận không bị gậy hoặc khiếu nại Content ID." data-tooltip-title="Kiểm Duyệt Bản Quyền">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody id="dashboard-activity-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

        <!-- =================== TAB 2: LICENSE CENTER =================== -->
        <section id="tab-licenses" class="hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Trung Tâm Quản Lý License</h1>
              <p class="text-xs text-zinc-400 mt-1">Cấp khóa mới, thiết lập hạn mức số máy, gia hạn thời gian và quản lý trạng thái phân phối</p>
            </div>
            <button onclick="openIssueLicenseModal()" data-tooltip="Khởi tạo mã bản quyền mới với số lượng máy tối đa và thời hạn tùy chọn cho đối tác/công ty." data-tooltip-title="Cấp License Mới" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              <span>Cấp License Mới</span>
            </button>
          </div>

          <!-- Filter Toolbar -->
          <div class="flex items-center gap-3">
            <div class="flex-1 relative">
              <input type="text" id="license-search-input" onkeyup="filterLicenses()" data-tooltip="Tìm nhanh theo chuỗi ký tự trong mã Key hoặc tên công ty đối tác." data-tooltip-title="Tìm Kiếm License" placeholder="Tìm theo mã License, tên công ty..." class="w-full pl-9 pr-4 py-2 rounded-lg glass-input text-xs">
              <svg class="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
            </div>
            <select id="license-tier-filter" onchange="filterLicenses()" data-tooltip="Lọc bản quyền theo cấp độ: Enterprise (không giới hạn), Pro (10 máy) hoặc Trial (3 máy)." data-tooltip-title="Bộ Lọc Cấp Độ" class="px-3 py-2 rounded-lg glass-input text-xs">
              <option value="all">Tất cả gói</option>
              <option value="enterprise">Enterprise</option>
              <option value="pro">Pro</option>
              <option value="trial">Trial</option>
            </select>
          </div>

          <!-- License Table -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Chuỗi mã hóa định danh bản quyền duy nhất được cấp cho tổ chức." data-tooltip-title="Mã Bản Quyền">Mã License Key</th>
                    <th class="px-5 py-3" data-tooltip="Doanh nghiệp hoặc chi nhánh sở hữu quyền sử dụng bộ mã này." data-tooltip-title="Công Ty / Chi Nhánh">Công Ty Áp Dụng</th>
                    <th class="px-5 py-3" data-tooltip="Cấp độ phân quyền (Enterprise: không giới hạn, Pro: 10 máy, Trial: 3 máy)." data-tooltip-title="Gói Dịch Vụ">Gói (Tier)</th>
                    <th class="px-5 py-3" data-tooltip="Số lượng máy trạm phần cứng đã kích hoạt / Hạn mức tối đa được phép chạy đồng thời." data-tooltip-title="Hạn Mức Máy (Seats)">Số Máy (Used / Max)</th>
                    <th class="px-5 py-3" data-tooltip="Thời điểm hết hiệu lực của mã bản quyền. Sau hạn này máy trạm sẽ bị từ chối truy cập." data-tooltip-title="Thời Gian Hiệu Lực">Hạn Dùng</th>
                    <th class="px-5 py-3" data-tooltip="Tình trạng hiệu lực (Active: đang hoạt động, Suspended: tạm ngưng, Expired: hết hạn)." data-tooltip-title="Trạng Thái Khóa">Trạng Thái</th>
                    <th class="px-5 py-3 text-right" data-tooltip="Các thao tác quản trị nhanh: Gia hạn thời gian sử dụng hoặc Thu hồi/Kích hoạt lại khóa." data-tooltip-title="Thao Tác Quản Trị">Hành Động</th>
                  </tr>
                </thead>
                <tbody id="licenses-table-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

        <!-- =================== TAB 3: COMPANIES =================== -->
        <section id="tab-companies" class="hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Quản Lý Công Ty & Tổ Chức</h1>
              <p class="text-xs text-zinc-400 mt-1">Quản lý các công ty con, hạn mức số lượng máy, cấu hình bảo mật che giấu doanh thu</p>
            </div>
            <button onclick="openAddCompanyModal()" data-tooltip="Tạo hồ sơ công ty đối tác mới để cấp phát license và gán máy trạm." data-tooltip-title="Tạo Tổ Chức Mới" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              <span>Thêm Công Ty Mới</span>
            </button>
          </div>

          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Tên thương mại của pháp nhân hoặc studio đối tác." data-tooltip-title="Tên Doanh Nghiệp">Tên Công Ty</th>
                    <th class="px-5 py-3" data-tooltip="Mã tiền tố viết tắt duy nhất phân biệt giữa các công ty trong hệ sinh thái." data-tooltip-title="Mã Công Ty">Mã Định Danh (Code)</th>
                    <th class="px-5 py-3" data-tooltip="Khóa bản quyền (License Key) dùng kích hoạt và chạy phần mềm RETubeMatrix Desktop." data-tooltip-title="Mã License Key">Mã License Key Bản Quyền</th>
                    <th class="px-5 py-3" data-tooltip="Nếu kích hoạt, nhân viên thông thường (Staff) chỉ thấy dữ liệu Reup và views, toàn bộ số liệu tiền USD/VNĐ sẽ được bảo mật tuyệt đối." data-tooltip-title="Ẩn Doanh Thu Nhân Viên">Quyền Ẩn Doanh Thu</th>
                    <th class="px-5 py-3" data-tooltip="Cho phép các Trưởng nhóm (Leader) được kiểm tra chéo và đối chiếu danh sách máy giữa các dự án." data-tooltip-title="Hợp Tác Chéo Đội Nhóm">Hợp Tác Chéo Leader</th>
                    <th class="px-5 py-3" data-tooltip="Trạng thái vận hành của tổ chức trên hệ thống SaaS." data-tooltip-title="Trạng Thái">Trạng Thái</th>
                    <th class="px-5 py-3 text-right" data-tooltip="Điều chỉnh nhanh các tham số bảo mật và chính sách ẩn doanh thu." data-tooltip-title="Cấu Hình Nhanh">Tùy Chọn</th>
                  </tr>
                </thead>
                <tbody id="companies-table-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

        <!-- =================== TAB: USERS & ROLES =================== -->
        <section id="tab-users" class="hidden space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Quản Lý Nhân Sự & Phân Quyền</h1>
              <p class="text-xs text-zinc-400 mt-1">Quản lý người dùng, phân quyền 4 cấp bậc (Owner, Admin, Leader, User) và ràng buộc phần cứng HWID</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="scrollToPermissionsMatrix(event)" class="px-3.5 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-300 flex items-center gap-2 transition" data-tooltip="Xem bảng ma trận quyền hạn chi tiết của 4 vai trò trên toàn hệ sinh thái." data-tooltip-title="Ma Trận Quyền Hạn">
                <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                <span>Ma Trận Phân Quyền</span>
              </button>
              <button onclick="openAddUserModal()" data-tooltip="Tạo tài khoản thành viên mới và thiết lập vai trò, công ty trực thuộc." data-tooltip-title="Thêm Thành Viên" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 013 19.235z"/>
                </svg>
                <span>Thêm Thành Viên Mới</span>
              </button>
            </div>
          </div>

          <!-- Filter & Search Toolbar -->
          <div class="glass-card rounded-xl p-4 border border-white/5 flex flex-wrap items-center gap-3">
            <div class="relative flex-1 min-w-[220px]">
              <svg class="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
              <input type="text" id="users-search-input" oninput="filterUsers()" placeholder="Tìm kiếm theo họ tên, email, tên máy..." class="w-full pl-9 pr-3 py-2 rounded-lg glass-input text-xs">
            </div>
            <select id="users-filter-company" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[150px]">
              <option value="all">Tất cả công ty</option>
            </select>
            <select id="users-filter-role" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[130px]">
              <option value="all">Tất cả vai trò</option>
              <option value="owner">Owner (Chủ sở hữu)</option>
              <option value="admin">Admin (Sếp / Quản trị)</option>
              <option value="leader">Leader (Trưởng nhóm)</option>
              <option value="user">User (Nhân viên)</option>
            </select>
            <select id="users-filter-hwid" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[140px]">
              <option value="all">Tất cả máy</option>
              <option value="bound">Đã khóa máy (HWID)</option>
              <option value="unbound">Chưa gắn máy</option>
            </select>
            <button onclick="refreshUsers()" data-tooltip="Tải lại danh sách nhân sự từ máy chủ." data-tooltip-title="Tải lại" class="p-2 rounded-lg glass-card hover:bg-white/10 text-zinc-300">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
            </button>
          </div>

          <!-- Users Table -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3">Thành Viên</th>
                    <th class="px-5 py-3">Công Ty</th>
                    <th class="px-5 py-3">Vai Trò</th>
                    <th class="px-5 py-3">Thiết Bị (HWID)</th>
                    <th class="px-5 py-3">Trạng Thái</th>
                    <th class="px-5 py-3">Ngày Tạo</th>
                    <th class="px-5 py-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody id="users-table-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>

          <!-- Permissions Matrix Section -->
          <div id="permissions-matrix" class="pt-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase font-mono">Bảo Mật Cấp Cao</span>
                  <h2 class="text-lg font-bold text-white tracking-tight">Ma Trận Phân Quyền 4 Cấp Bậc (Permissions Matrix)</h2>
                </div>
                <p class="text-xs text-zinc-400 mt-1">Quy định chi tiết phạm vi quyền hạn và ranh giới bảo mật tài nguyên giữa Owner, Admin, Leader và User</p>
              </div>
            </div>

            <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-white/[0.03] text-zinc-300 font-mono text-[11px] border-b border-white/5">
                    <tr>
                      <th class="px-5 py-3.5 w-1/3">Quyền Hạn & Tính Năng Hệ Thống</th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          <span>Master Owner</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                          <span>Admin (Sếp)</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>Leader (Quản Lý)</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>User (Nhân Viên)</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 text-zinc-300">
                    <!-- Row 1: Bypass HWID -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <span>Đăng nhập mọi máy (Bypass HWID)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Tự do đăng nhập bất kỳ máy tính nào, không bị ràng buộc cứng 1 Máy = 1 Tài Khoản</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Có (Bypass)</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Khóa 1 Máy</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Khóa 1 Máy</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Khóa 1 Máy</span>
                      </td>
                    </tr>

                    <!-- Row 2: License Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                          <span>Cấp / Gia hạn / Thu hồi License Key</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Sinh mã license mới, cấu hình số máy tối đa, kích hoạt hoặc thu hồi license</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Toàn quyền</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Chỉ xem nội bộ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                    </tr>

                    <!-- Row 3: Company Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>Tạo / Sửa / Xóa Công ty & Tổ chức</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Khởi tạo công ty chi nhánh, sửa thông tin, đặt mã định danh, tạm khóa hoặc xóa bỏ</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Toàn quyền</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Sửa cấu hình cty</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                    </tr>

                    <!-- Row 4: Personnel Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                          <span>Quản lý Nhân sự (Thêm / Sửa Role / Xóa)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Tạo tài khoản, thăng/hạ cấp vai trò, chuyển công ty, xóa thành viên, unbind HWID</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Toàn quyền mọi role</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Leader & User</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Theo dõi nhóm</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                    </tr>

                    <!-- Row 5: HWID Reset Approval -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>Phê duyệt đơn đổi máy HWID</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Xét duyệt các đơn đổi máy do nâng cấp phần cứng, hỏng máy hoặc chuyển giao công việc</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Duyệt toàn bộ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Duyệt trong cty</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Xác nhận sơ bộ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Chỉ gửi yêu cầu</span>
                      </td>
                    </tr>

                    <!-- Row 6: Revenue Visibility -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          <span>Xem doanh thu thực tế YouTube Studio (USD / VNĐ)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Số liệu doanh thu thực tế, RPM, CPM hàng ngày tự động đồng bộ từ Studio</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ 100% Doanh thu</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ 100% Cty mình</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Kênh phụ trách</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/20">✕ Không hiển thị</span>
                      </td>
                    </tr>

                    <!-- Row 7: Cross Leader Collaboration -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>Xem chéo kho Key & Đề xuất (Cross-Leader)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Tra cứu chéo kho từ khóa, kênh đối thủ và các đề xuất giữa các đội nhóm để tránh trùng lặp</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Toàn quyền</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Toàn quyền</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Có (Nếu cty bật)</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">✕ Không</span>
                      </td>
                    </tr>

                    <!-- Row 8: Core Video Operations -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                          <span>Vận hành Cào & Reup Video</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Tải video đa luồng, AI Rewrite Transcript, Render FFmpeg lách bản quyền, Upload Multi-Profile</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Đầy đủ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Đầy đủ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Đầy đủ</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Đầy đủ</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

        <!-- =================== TAB 4: HWID DEVICES =================== -->
        <section id="tab-devices" class="hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Khóa Phần Cứng & Duyệt Đổi Máy (HWID)</h1>
              <p class="text-xs text-zinc-400 mt-1">Cơ chế bảo vệ 1 Máy = 1 Tài Khoản, ngăn chặn chia sẻ lậu và xét duyệt yêu cầu đổi máy</p>
            </div>
            <button onclick="refreshDevices()" data-tooltip="Tải lại danh sách thiết bị và hàng đợi đổi máy mới nhất từ Cloudflare D1." data-tooltip-title="Đồng Bộ Thiết Bị" class="px-3.5 py-1.5 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <span>Làm Mới Danh Sách</span>
            </button>
          </div>

          <!-- Pending Resets Section -->
          <div class="glass-card rounded-xl border border-amber-500/20 overflow-hidden">
            <div class="px-5 py-3.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <h3 class="text-xs font-semibold text-amber-200 uppercase tracking-wider font-mono">Yêu Cầu Đổi Máy Đang Chờ Duyệt (Pending Resets)</h3>
              </div>
              <span id="pending-reset-count-badge" class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300">0 Yêu cầu</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Tài khoản nhân viên phát sinh yêu cầu đổi máy tính làm việc." data-tooltip-title="Nhân Viên Yêu Cầu">Nhân Viên / Email</th>
                    <th class="px-5 py-3" data-tooltip="Đơn vị chủ quản của nhân viên gửi yêu cầu." data-tooltip-title="Công Ty">Công Ty</th>
                    <th class="px-5 py-3" data-tooltip="Nguyên nhân thay đổi phần cứng do nhân viên khai báo (ví dụ: hỏng máy, nâng cấp CPU, cài lại Win)." data-tooltip-title="Lý Do Thay Đổi">Lý Do Đổi Máy</th>
                    <th class="px-5 py-3" data-tooltip="Chuỗi hash phần cứng (SHA-256 kết hợp CPU ID, Motherboard UUID, MAC Address) của máy mới." data-tooltip-title="Mã HWID Máy Mới">Mã HWID Máy Mới</th>
                    <th class="px-5 py-3" data-tooltip="Thời điểm nhân viên kích hoạt ứng dụng trên máy mới và gửi đơn chờ duyệt." data-tooltip-title="Thời Điểm Gửi">Thời Gian Gửi</th>
                    <th class="px-5 py-3 text-right" data-tooltip="Thao tác xét duyệt: Phê duyệt giải phóng máy cũ; Từ chối chặn máy mới." data-tooltip-title="Xét Duyệt Đổi Máy">Quyết Định</th>
                  </tr>
                </thead>
                <tbody id="pending-resets-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <tr>
                    <td colspan="6" class="px-5 py-6 text-center text-zinc-500">Không có yêu cầu đổi máy nào đang chờ duyệt.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Active Bound Devices Section -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Danh Sách Máy Đang Khóa Ràng Buộc (Active Bound Devices)</h3>
              <span id="total-bound-devices-count" class="text-xs text-zinc-400 font-mono">0 thiết bị</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Tên máy trạm (Hostname) ghi nhận từ hệ điều hành Windows." data-tooltip-title="Tên Máy Trạm">Tên Máy Tính</th>
                    <th class="px-5 py-3" data-tooltip="Nhân viên duy nhất đang được gắn độc quyền vào phần cứng máy này." data-tooltip-title="Người Dùng Gắn Liền">Người Sử Dụng</th>
                    <th class="px-5 py-3" data-tooltip="Chi nhánh hoặc tổ chức quản lý thiết bị này." data-tooltip-title="Công Ty">Công Ty</th>
                    <th class="px-5 py-3" data-tooltip="Phiên bản OS và môi trường vận hành ứng dụng (Windows 10/11)." data-tooltip-title="Hệ Điều Hành">Hệ Điều Hành</th>
                    <th class="px-5 py-3" data-tooltip="Mã băm định danh phần cứng duy nhất: CPU ID + Bo mạch chủ + Ổ cứng chính." data-tooltip-title="HWID Hash Phần Cứng">HWID Hash</th>
                    <th class="px-5 py-3" data-tooltip="Địa chỉ IP WAN ghi nhận khi máy trạm gửi tín hiệu Heartbeat gần nhất." data-tooltip-title="Địa Chỉ IP Mạng">IP Lần Cuối</th>
                    <th class="px-5 py-3" data-tooltip="Thời gian máy trạm gửi tín hiệu kiểm tra bản quyền gần nhất." data-tooltip-title="Tín Hiệu Gần Nhất">Hoạt Động Cuối</th>
                    <th class="px-5 py-3 text-right" data-tooltip="Hủy ràng buộc phần cứng: Giải phóng máy để tái cấp phát cho nhân viên khác." data-tooltip-title="Quản Trị Thiết Bị">Xử Lý</th>
                  </tr>
                </thead>
                <tbody id="active-devices-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

        <!-- =================== TAB 5: ANALYTICS =================== -->
        <section id="tab-analytics" class="hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white tracking-tight">Kênh & Doanh Thu Chi Tiết</h1>
              <p class="text-xs text-zinc-400 mt-1">Theo dõi số lượt views, thời lượng xem và doanh thu từ YouTube Studio đích</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="setAnalyticsDateFilter('today')" id="btn-filter-today" data-tooltip="Xem dữ liệu phát sinh trong 24 giờ qua." data-tooltip-title="Thời Gian: Hôm Nay" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium transition">Hôm nay</button>
              <button onclick="setAnalyticsDateFilter('7d')" id="btn-filter-7d" data-tooltip="Xem tổng hợp dữ liệu 7 ngày gần nhất." data-tooltip-title="Thời Gian: 7 Ngày" class="px-3 py-1.5 rounded-lg glass-card hover:bg-white/10 text-zinc-300 text-xs font-medium transition">7 Ngày Qua</button>
              <button onclick="setAnalyticsDateFilter('30d')" id="btn-filter-30d" data-tooltip="Xem toàn bộ số liệu phát sinh trong tháng hiện tại." data-tooltip-title="Thời Gian: Tháng Này" class="px-3 py-1.5 rounded-lg glass-card hover:bg-white/10 text-zinc-300 text-xs font-medium transition">Tháng Này</button>
            </div>
          </div>

          <!-- Channel Revenue Table -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Kênh YouTube nhận video Reup đã được bật kiếm tiền." data-tooltip-title="Kênh Đích">Kênh YouTube</th>
                    <th class="px-5 py-3" data-tooltip="Đơn vị được phân chia doanh thu của kênh này." data-tooltip-title="Đơn Vị Quản Lý">Công Ty Sở Hữu</th>
                    <th class="px-5 py-3" data-tooltip="Ngày thống kê số liệu hiệu suất và tài chính." data-tooltip-title="Ngày Báo Cáo">Ngày</th>
                    <th class="px-5 py-3" data-tooltip="Tổng số lượt xem video kênh đạt được trong ngày." data-tooltip-title="Lượt Xem (Views)">Lượt Xem</th>
                    <th class="px-5 py-3" data-tooltip="Tổng số giờ xem video tích lũy trong ngày." data-tooltip-title="Giờ Xem Tích Lũy">Giờ Xem</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu thực tế trên mỗi 1,000 lượt xem sau khi trừ phí nền tảng YouTube." data-tooltip-title="Chỉ Số RPM">RPM</th>
                    <th class="px-5 py-3" data-tooltip="Chi phí mỗi 1,000 lượt hiển thị quảng cáo mà nhà tài trợ trả cho YouTube." data-tooltip-title="Chỉ Số CPM">CPM</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu ước tính theo đô la Mỹ trong ngày do YouTube Analytics ghi nhận." data-tooltip-title="Doanh Thu USD">Doanh Thu (USD)</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu ước tính quy đổi sang đồng Việt Nam phục vụ đối soát thanh toán nội bộ." data-tooltip-title="Doanh Thu VNĐ">Doanh Thu (VNĐ)</th>
                  </tr>
                </thead>
                <tbody id="analytics-table-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <!-- TAB: BÁO CÁO CÔNG VIỆC & CHI TIẾT ĐỘI NGŨ -->
        <section id="tab-work-reports" class="tab-pane hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Chi Tiết Công Việc & Báo Cáo Hiệu Suất Đội Ngũ</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">Work Telemetry</span>
              </h2>
              <p class="text-xs text-zinc-400 mt-1">Theo dõi số lượng kênh đích, kênh test, kênh đối thủ đang cào, phân tích 5 video gần nhất, tỷ lệ BKT xanh/đỏ và bảng xếp hạng nhân sự</p>
            </div>
            <button onclick="loadWorkReports()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <span>Làm Mới Báo Cáo</span>
            </button>
          </div>

          <!-- KPI Cards Work Reports -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Kênh Đích Đang Vận Hành</p>
              <h3 id="wr-total-target-channels" class="text-2xl font-bold text-white mt-1">0</h3>
              <p class="text-[11px] text-emerald-400 mt-1">Được gán cho nhân sự quản lý</p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Kênh Đối Thủ Theo Dõi</p>
              <h3 id="wr-total-competitors" class="text-2xl font-bold text-white mt-1">0</h3>
              <p class="text-[11px] text-indigo-400 mt-1">Đang cào dữ liệu & phân tích</p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Test BKT (Xanh / Đỏ)</p>
              <h3 id="wr-total-bkt" class="text-2xl font-bold text-white mt-1">0 / 0</h3>
              <p class="text-[11px] text-zinc-400 mt-1">Tỷ lệ sạch: <span id="wr-bkt-rate" class="text-emerald-400 font-bold">100%</span></p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Video Đã Đăng Hôm Nay</p>
              <h3 id="wr-total-uploads-today" class="text-2xl font-bold text-amber-400 mt-1">0 video</h3>
              <p class="text-[11px] text-zinc-400 mt-1">Xuất bản lên kênh đích</p>
            </div>
          </div>

          <!-- Bảng 1: Bảng Xếp Hạng Nhân Sự Xuất Sắc (Leaderboard) -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.003 0V7.875a3.375 3.375 0 00-6.75 0v6.5m6.75 0h-6.75"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Bảng Xếp Hạng Nhân Sự Xuất Sắc (Top Performers)</h3>
              </div>
              <span class="text-xs text-zinc-400">Xếp hạng theo số kênh đích, lượt xem & doanh thu đóng góp</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">Hạng</th>
                    <th class="px-5 py-3">Nhân Sự</th>
                    <th class="px-5 py-3">Công Ty</th>
                    <th class="px-5 py-3 text-center">Kênh Đích</th>
                    <th class="px-5 py-3 text-center">Đăng Hôm Nay</th>
                    <th class="px-5 py-3">Tổng View</th>
                    <th class="px-5 py-3">Doanh Thu Ước Tính</th>
                    <th class="px-5 py-3 text-center">Tỷ Lệ BKT Sạch</th>
                  </tr>
                </thead>
                <tbody id="wr-leaderboard-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="8" class="text-center py-8 text-zinc-500">Đang tải bảng xếp hạng...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Bảng 2: So Sánh Đối Đầu Giữa Các Team Leader -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">So Sánh Đối Đầu Giữa Các Đội Nhóm (Team Leaders)</h3>
              </div>
              <span class="text-xs text-zinc-400">Tự động đánh giá chất lượng dựa trên tổng doanh thu & tỷ lệ BKT sạch</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">Đội Nhóm (Team)</th>
                    <th class="px-5 py-3">Trưởng Nhóm</th>
                    <th class="px-5 py-3 text-center">Thành Viên</th>
                    <th class="px-5 py-3 text-center">Kênh Đích</th>
                    <th class="px-5 py-3 text-center">Đăng Hôm Nay</th>
                    <th class="px-5 py-3">Tổng View</th>
                    <th class="px-5 py-3">Doanh Thu (VND)</th>
                    <th class="px-5 py-3 text-center">BKT Sạch</th>
                    <th class="px-5 py-3 text-center">Đánh Giá</th>
                  </tr>
                </thead>
                <tbody id="wr-teams-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="9" class="text-center py-8 text-zinc-500">Đang đối chiếu dữ liệu giữa các đội nhóm...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Bảng 3: Chi Tiết Công Việc & Kênh Đối Thủ Từng Nhân Sự -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Chi Tiết Tác Vụ Từng Nhân Sự & Kênh Đối Thủ Đang Cào</h3>
              </div>
              <span class="text-xs text-zinc-400">Xem URL kênh đối thủ, từ khóa ngách & 5 video mới nhất</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">Nhân Sự</th>
                    <th class="px-5 py-3">Công Ty</th>
                    <th class="px-5 py-3">Kênh Đích & Test</th>
                    <th class="px-5 py-3">Kênh Đối Thủ Đang Giám Sát</th>
                    <th class="px-5 py-3">Sản Lượng Đăng</th>
                    <th class="px-5 py-3">BKT (Xanh/Đỏ)</th>
                    <th class="px-5 py-3 text-right">Chi Tiết 5 Video</th>
                  </tr>
                </thead>
                <tbody id="wr-staff-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="7" class="text-center py-8 text-zinc-500">Đang tải danh sách tác vụ nhân sự...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>


        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

      </main>
    </div>

    <!-- MODAL: CẤP LICENSE MỚI -->
    <div id="modal-issue-license" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Cấp License Mới</h3>
          </div>
          <button onclick="closeIssueLicenseModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleIssueLicenseSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Gán Cho Công Ty</label>
            <select id="modal-license-company" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">Gói Bản Quyền (Tier)</label>
              <select id="modal-license-tier" onchange="autoConfigureSeatsByTier()" data-tooltip="Enterprise: Vô hạn máy; Pro: 10 máy; Trial: 3 máy dùng thử." data-tooltip-title="Cấp Phân Hạng" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
                <option value="enterprise">Enterprise (Doanh Nghiệp)</option>
                <option value="pro" selected>Professional (Tiêu Chuẩn)</option>
                <option value="trial">Trial (Dùng Thử)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">Số Máy Tối Đa (Seats)</label>
              <input type="number" id="modal-license-seats" min="1" max="9999" value="10" required data-tooltip="Số lượng máy tính tối đa có thể kích hoạt song song cùng lúc." data-tooltip-title="Hạn Mức Máy Trạm" class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono">
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Thời Hạn Sử Dụng</label>
            <select id="modal-license-duration" data-tooltip="Thời gian hiệu lực trước khi mã License bị khóa tự động." data-tooltip-title="Thời Hạn Bản Quyền" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="30">30 Ngày (1 Tháng)</option>
              <option value="90">90 Ngày (3 Tháng)</option>
              <option value="365" selected>365 Ngày (1 Năm)</option>
              <option value="3650">Vĩnh Viễn (10 Năm)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Mã License Tự Sinh</label>
            <div class="flex items-center gap-2">
              <input type="text" id="modal-license-preview-key" readonly class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono text-indigo-400 bg-black/40">
              <button type="button" onclick="regeneratePreviewKey()" data-tooltip="Tạo chuỗi ngẫu nhiên mới cho mã License Key." data-tooltip-title="Tạo Lại Mã" class="px-3 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-300 transition">
                Đổi
              </button>
            </div>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeIssueLicenseModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" id="btn-submit-issue-license" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-2">
              <span>Xác Nhận Cấp Key</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: THÊM CÔNG TY MỚI -->
    <div id="modal-add-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <h3 class="text-base font-bold text-white">Thêm Công Ty Mới</h3>
          <button onclick="closeAddCompanyModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleAddCompanySubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Tên Công Ty / Studio</label>
            <input type="text" id="modal-company-name" required placeholder="Ví dụ: Alpha Media Global" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Mã Công Ty (Company Code)</label>
            <input type="text" id="modal-company-code" required placeholder="ALPHA-MEDIA" class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono uppercase">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Gói Bản Quyền Khởi Tạo</label>
            <select id="modal-company-tier" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="pro" selected>Gói Pro (10 Máy Trạm - 1 Năm)</option>
              <option value="enterprise">Gói Enterprise (Vô Hạn Máy - Vĩnh Viễn)</option>
              <option value="trial">Gói Trial (3 Máy - 14 Ngày Dùng Thử)</option>
            </select>
          </div>
          <div class="space-y-2 pt-2">
            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer" data-tooltip="Khi bật, toàn bộ nhân viên công ty này sẽ không thấy tab và số liệu doanh thu USD/VND." data-tooltip-title="Bảo Mật Doanh Thu">
              <input type="checkbox" id="modal-company-mask-rev" class="rounded bg-zinc-800 border-white/10 text-indigo-600 focus:ring-0">
              <span>Che giấu tổng doanh thu với nhân viên (Staff)</span>
            </label>
            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer" data-tooltip="Tạo điều kiện để các đội nhóm Leader hỗ trợ và phối hợp tài nguyên máy với nhau." data-tooltip-title="Hợp Tác Đội Nhóm">
              <input type="checkbox" id="modal-company-cross-collab" checked class="rounded bg-zinc-800 border-white/10 text-indigo-600 focus:ring-0">
              <span>Cho phép Leader chia sẻ đối chiếu key với nhau</span>
            </label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAddCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition">Tạo Công Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: THÊM THÀNH VIÊN MỚI & CẤP QUYỀN -->
    <div id="modal-add-user" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Cấp Tài Khoản Mới & Phân Quyền</h3>
          </div>
          <button onclick="closeAddUserModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleAddUserSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Email Đăng Nhập</label>
            <input type="email" id="modal-user-email" required placeholder="nhanvien@congty.com" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-zinc-300">Mật Khẩu Khởi Tạo</label>
              <button type="button" onclick="generateRandomUserPassword()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Tạo Ngẫu Nhiên
              </button>
            </div>
            <div class="relative">
              <input type="text" id="modal-user-password" required placeholder="Tối thiểu 6 ký tự" class="w-full px-3 py-2 pr-10 rounded-lg glass-input text-xs font-mono">
              <button type="button" onclick="copyToClipboard(document.getElementById('modal-user-password').value)" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1" title="Sao chép mật khẩu">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
            <p class="text-[10px] text-zinc-500 mt-1">Mật khẩu này sẽ được cấp trực tiếp cho nhân sự để đăng nhập ứng dụng Desktop.</p>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Họ Và Tên</label>
            <input type="text" id="modal-user-fullname" required placeholder="Nguyễn Văn A" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Vai Trò & Quyền Hạn</label>
            <select id="modal-user-role" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically based on caller role -->
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Công Ty Trực Thuộc</label>
            <select id="modal-user-company" onchange="updateModalUserCompanyLicenseHint()" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
            <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>Mã License Key:</span>
              <span id="modal-user-company-lic" class="font-mono text-emerald-400 font-semibold select-all">Đang tải...</span>
            </div>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAddUserModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition">Cấp Tài Khoản</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: KẾT QUẢ CẤP TÀI KHOẢN & MẬT KHẨU THÀNH CÔNG -->
    <div id="modal-account-created" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-emerald-500/30 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div class="flex items-center gap-3 pb-3 border-b border-white/10">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Cấp Tài Khoản Thành Công!</h3>
            <p class="text-[11px] text-emerald-400 font-medium">Tài khoản đã sẵn sàng đăng nhập ngay lập tức</p>
          </div>
        </div>

        <div class="space-y-3 bg-black/40 rounded-xl p-4 border border-white/5 text-xs font-mono">
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Email:</span>
            <span id="created-acc-email" class="text-white font-bold select-all"></span>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Mật khẩu:</span>
            <div class="flex items-center gap-1.5">
              <span id="created-acc-pwd" class="text-amber-300 font-bold tracking-wider select-all"></span>
              <button onclick="copyToClipboard(document.getElementById('created-acc-pwd').innerText)" class="p-1 text-zinc-400 hover:text-white" title="Sao chép mật khẩu">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Vai trò:</span>
            <span id="created-acc-role" class="text-purple-300 font-bold uppercase"></span>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Công ty:</span>
            <span id="created-acc-company" class="text-zinc-200"></span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-zinc-400">License Key:</span>
            <span id="created-acc-lic" class="text-emerald-400 font-bold select-all tracking-wide"></span>
          </div>
        </div>

        <div class="space-y-2 pt-2">
          <button type="button" onclick="copyFullAccountCredentials()" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <span>Sao Chép Toàn Bộ Thông Tin (Gửi Nhân Sự)</span>
          </button>
          <button type="button" onclick="closeCreatedAccountModal()" class="w-full py-2 rounded-xl glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">
            Đóng
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: GÁN THÀNH VIÊN VÀO CÔNG TY -->
    <div id="modal-assign-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.75a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V21"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Gán Thành Viên Vào Công Ty</h3>
          </div>
          <button onclick="closeAssignCompanyModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onsubmit="handleAssignCompanySubmit(event)" class="space-y-4">
          <input type="hidden" id="modal-assign-user-id">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Thành Viên</label>
            <div id="modal-assign-user-info" class="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white font-medium"></div>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Chọn Công Ty Trực Thuộc</label>
            <select id="modal-assign-company-select" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>
          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAssignCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition">Lưu Gán Công Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: PHÂN QUYỀN VAI TRÒ -->
    <div id="modal-change-role" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Phân Quyền Vai Trò</h3>
          </div>
          <button onclick="closeChangeRoleModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <form onsubmit="handleChangeRoleSubmit(event)" class="space-y-4">
          <input type="hidden" id="modal-role-user-id">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Thành Viên</label>
            <div id="modal-role-user-info" class="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white font-medium"></div>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Chọn Vai Trò Mới</label>
            <select id="modal-role-select" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically based on permissions -->
            </select>
          </div>
          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeChangeRoleModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition">Cập Nhật Quyền</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: SỬA PHÂN QUYỀN & CÔNG TY -->
    <div id="modal-edit-user" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Chỉnh Sửa Quyền & Hồ Sơ</h3>
          </div>
          <button onclick="closeEditUserModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleEditUserSubmit(event)" class="space-y-4">
          <input type="hidden" id="modal-edit-user-id">

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Email</label>
            <input type="email" id="modal-edit-user-email" readonly class="w-full px-3 py-2 rounded-lg glass-input text-xs opacity-60 cursor-not-allowed">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Họ Và Tên</label>
            <input type="text" id="modal-edit-user-fullname" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Vai Trò & Quyền Hạn</label>
            <select id="modal-edit-user-role" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="user">User (Nhân viên)</option>
              <option value="leader">Leader (Trưởng nhóm)</option>
              <option value="admin">Admin (Quản trị viên)</option>
              <option value="owner">Owner (Chủ sở hữu tối cao)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Công Ty Trực Thuộc</label>
            <select id="modal-edit-user-company" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="modal-edit-user-active" class="rounded bg-white/5 border-white/20 text-indigo-600 focus:ring-0">
            <label for="modal-edit-user-active" class="text-xs text-zinc-300 cursor-pointer">Tài khoản đang hoạt động (Active)</label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeEditUserModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition">Lưu Thay Đổi</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: SỬA THÔNG TIN CÔNG TY -->
    <div id="modal-edit-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Chỉnh Sửa Công Ty</h3>
          </div>
          <button onclick="closeEditCompanyModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleEditCompanySubmit(event)" class="space-y-4">
          <input type="hidden" id="modal-edit-company-id">

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Tên Công Ty / Studio</label>
            <input type="text" id="modal-edit-company-name" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Mã Viết Tắt (Company Code)</label>
            <input type="text" id="modal-edit-company-code" required class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono uppercase">
          </div>

          <div class="space-y-2.5 pt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-mask-rev" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">Ẩn doanh thu tiền USD/VNĐ đối với nhân viên (Staff)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-cross-collab" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">Cho phép Trưởng nhóm (Leader) hợp tác chéo dự án</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-active" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">Công ty đang hoạt động (Active)</span>
            </label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeEditCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition">Cập Nhật Công Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: NÂNG CẤP GÓI BẢN QUYỀN DOANH NGHIỆP -->
    <div id="modal-upgrade-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007-4.125A3.75 3.75 0 0012 3.75a3.75 3.75 0 00-3.375 6.375m6.75 0A3.75 3.75 0 0112 16.5a3.75 3.75 0 01-3.375-6.375"/>
              </svg>
            </div>
            <div>
              <h3 class="text-base font-bold text-white">Nâng Cấp Gói Bản Quyền Doanh Nghiệp</h3>
              <p class="text-[11px] text-zinc-400">Thay đổi gói, tăng hạn mức máy trạm và tự động áp dụng ngay</p>
            </div>
          </div>
          <button onclick="closeUpgradeCompanyModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleUpgradeCompanySubmit(event)" class="space-y-4">
          <input type="hidden" id="modal-upgrade-company-id">

          <!-- THÔNG TIN DOANH NGHIỆP HIỆN TẠI -->
          <div class="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <div>
              <div class="text-xs font-semibold text-white" id="modal-upgrade-company-name">--</div>
              <div class="text-[11px] text-zinc-400 mt-0.5">Mã công ty: <span id="modal-upgrade-company-code" class="font-mono text-zinc-300 uppercase">--</span></div>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-zinc-400 block mb-0.5">Gói hiện tại:</span>
              <span id="modal-upgrade-current-tier-badge" class="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">PRO</span>
            </div>
          </div>

          <!-- LỰA CHỌN GÓI BẢN QUYỀN MỤC TIÊU -->
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">Chọn Gói Bản Quyền Mới</label>
            <div class="grid grid-cols-3 gap-2">
              <label class="cursor-pointer">
                <input type="radio" name="upgrade-tier-radio" id="tier-radio-trial" value="trial" onchange="onUpgradeTierSelect('trial')" class="peer sr-only">
                <div class="p-3 rounded-xl border border-white/10 peer-checked:border-amber-500 peer-checked:bg-amber-500/10 hover:bg-white/[0.02] transition text-center space-y-1">
                  <div class="text-xs font-bold text-amber-400">Dùng Thử</div>
                  <div class="text-[10px] text-zinc-400">Trial</div>
                  <div class="text-[10px] text-zinc-500 font-mono">3 Máy • 14 Ngày</div>
                </div>
              </label>

              <label class="cursor-pointer">
                <input type="radio" name="upgrade-tier-radio" id="tier-radio-pro" value="pro" checked onchange="onUpgradeTierSelect('pro')" class="peer sr-only">
                <div class="p-3 rounded-xl border border-white/10 peer-checked:border-indigo-500 peer-checked:bg-indigo-500/10 hover:bg-white/[0.02] transition text-center space-y-1">
                  <div class="text-xs font-bold text-indigo-400">Chuyên Nghiệp</div>
                  <div class="text-[10px] text-zinc-400">Pro</div>
                  <div class="text-[10px] text-zinc-500 font-mono">10 Máy • 1 Năm</div>
                </div>
              </label>

              <label class="cursor-pointer">
                <input type="radio" name="upgrade-tier-radio" id="tier-radio-enterprise" value="enterprise" onchange="onUpgradeTierSelect('enterprise')" class="peer sr-only">
                <div class="p-3 rounded-xl border border-white/10 peer-checked:border-purple-500 peer-checked:bg-purple-500/10 hover:bg-white/[0.02] transition text-center space-y-1">
                  <div class="text-xs font-bold text-purple-400">Doanh Nghiệp</div>
                  <div class="text-[10px] text-zinc-400">Enterprise</div>
                  <div class="text-[10px] text-zinc-500 font-mono">Vô Hạn • 10 Năm</div>
                </div>
              </label>
            </div>
          </div>

          <!-- CẤU HÌNH TÙY BIẾN GHẾ (SEATS) & GIA HẠN THÊM -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1" data-tooltip="Số lượng máy tính tối đa có thể kích hoạt song song cùng lúc." data-tooltip-title="Hạn Mức Máy">
                Hạn Mức Máy (Seats)
              </label>
              <input type="number" id="modal-upgrade-seats" min="1" max="9999" value="10" required class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono">
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1" data-tooltip="Số ngày hiệu lực cộng thêm vào thời hạn hiện tại." data-tooltip-title="Gia Hạn Thêm">
                Gia Hạn Thêm
              </label>
              <select id="modal-upgrade-extend-days" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
                <option value="0">Giữ nguyên hạn hiện tại</option>\n                <option value="14">+14 Ngày (Dùng thử Trial)</option>
                <option value="30">+30 Ngày (1 Tháng)</option>
                <option value="90">+90 Ngày (3 Tháng)</option>
                <option value="365" selected>+365 Ngày (1 Năm)</option>
                <option value="3650">+3650 Ngày (10 Năm)</option>
              </select>
            </div>
          </div>

          <!-- QUYỀN LỢI GÓI SẼ ÁP DỤNG -->
          <div class="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-xs text-zinc-400">
            <div class="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider mb-1">Quyền lợi gói áp dụng:</div>
            <div class="flex items-center justify-between">
              <span>Hạn mức Test BKT bản quyền/ngày:</span>
              <span id="modal-upgrade-hint-bkt" class="font-mono text-emerald-400 font-medium">50 Video / Ngày</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Hạn mức Browser Multi Profiles:</span>
              <span id="modal-upgrade-hint-profiles" class="font-mono text-indigo-400 font-medium">25 Trình duyệt độc lập</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Hợp tác chéo giữa các Leader:</span>
              <span id="modal-upgrade-hint-collab" class="font-mono text-purple-400 font-medium">Hỗ trợ đầy đủ</span>
            </div>
            <div class="pt-1 text-[10px] text-zinc-500 border-t border-white/5">
              Mã License Key của khách hàng được giữ nguyên, máy trạm đang chạy không bị gián đoạn.
            </div>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeUpgradeCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">Hủy</button>
            <button type="submit" id="btn-submit-upgrade-company" class="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/20 transition flex items-center gap-1.5">
              <span>Xác Nhận Nâng Gói</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: XEM 5 VIDEO GẦN NHẤT CỦA KÊNH ĐỐI THỦ -->
    

    <!-- TOAST NOTIFICATION CONTAINER -->
    <div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"></div>

    <!-- GLOBAL HIGH-END DARK MODE TOOLTIP -->
    <div id="rtm-tooltip"></div>

  </div>

  <!-- CLIENT-SIDE APPLICATION JAVASCRIPT -->
  <script>
    // State
    let authToken = localStorage.getItem('rtm_admin_token') || null;
    let currentUser = JSON.parse(localStorage.getItem('rtm_admin_user') || 'null');
    let currentTab = 'dashboard';
    let systemData = {
      licenses: [],
      companies: [],
      devices: [],
      users: [],
      pendingResets: [],
      analytics: [],
      stats: {}
    };

    // Global Tooltip Management
    let tooltipEl = null;
    let activeTarget = null;

    function initGlobalTooltip() {
      tooltipEl = document.getElementById('rtm-tooltip');

      document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-tooltip]');
        if (!el) {
          hideTooltip();
          return;
        }
        if (el === activeTarget) return;
        activeTarget = el;
        showTooltip(el);
      });

      document.addEventListener('mouseout', (e) => {
        if (!activeTarget) return;
        const related = e.relatedTarget;
        if (!related || !activeTarget.contains(related)) {
          hideTooltip();
        }
      });

      window.addEventListener('scroll', hideTooltip, true);
    }

    function showTooltip(el) {
      if (!tooltipEl) return;
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      const title = el.getAttribute('data-tooltip-title');

      let html = '';
      if (title) {
        html += '<div class="tooltip-title">' + title + '</div>';
      }
      html += '<div class="tooltip-desc">' + text + '</div>';
      tooltipEl.innerHTML = html;

      tooltipEl.style.display = 'block';
      tooltipEl.style.visibility = 'hidden';
      tooltipEl.classList.remove('visible');

      const rect = el.getBoundingClientRect();
      const tipRect = tooltipEl.getBoundingClientRect();

      let top = rect.top - tipRect.height - 8;
      let left = rect.left + (rect.width - tipRect.width) / 2;

      // Flip to bottom if clipping viewport top
      if (top < 10) {
        top = rect.bottom + 8;
      }
      // Clamp horizontally within screen padding
      if (left < 10) left = 10;
      if (left + tipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tipRect.width - 10;
      }

      tooltipEl.style.left = Math.round(left) + 'px';
      tooltipEl.style.top = Math.round(top) + 'px';
      tooltipEl.style.visibility = 'visible';

      requestAnimationFrame(() => {
        if (activeTarget) {
          tooltipEl.classList.add('visible');
        }
      });
    }

    function hideTooltip() {
      if (!tooltipEl) return;
      tooltipEl.classList.remove('visible');
      activeTarget = null;
    }

    // Initialize App
    window.addEventListener('DOMContentLoaded', () => {
      initGlobalTooltip();
      if (authToken && currentUser) {
        showPortal();
        loadAllData();
      } else {
        showAuth();
      }
    });

    function showAuth() {
      document.getElementById('auth-container').classList.remove('hidden');
      document.getElementById('portal-container').classList.add('hidden');
      document.getElementById('user-profile-bar').classList.add('hidden');
    }

    function showPortal() {
      document.getElementById('auth-container').classList.add('hidden');
      document.getElementById('portal-container').classList.remove('hidden');
      document.getElementById('user-profile-bar').classList.remove('hidden');
      
      if (currentUser) {
        document.getElementById('current-user-name').innerText = currentUser.full_name || currentUser.email;
        document.getElementById('current-user-role').innerText = (currentUser.role || 'OWNER').toUpperCase();
      }
      switchTab('dashboard');
    }

    async function handleLoginSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');

      errorEl.classList.add('hidden');
      btn.disabled = true;
      btn.innerText = 'Đang xác thực...';

      try {
        const res = await fetch('/v1/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Đăng nhập không thành công');
        }

        authToken = data.token || data.access_token;
        currentUser = data.user;
        localStorage.setItem('rtm_admin_token', authToken);
        if (data.refresh_token) {
          localStorage.setItem('rtm_admin_refresh_token', data.refresh_token);
        }
        localStorage.setItem('rtm_admin_user', JSON.stringify(currentUser));

        showToast('Đăng nhập thành công', 'success');
        showPortal();
        loadAllData();
      } catch (err) {
        errorEl.innerText = err.message;
        errorEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Truy Cập Hệ Thống</span>';
      }
    }

    function handleLogout() {
      localStorage.removeItem('rtm_admin_token');
      localStorage.removeItem('rtm_admin_refresh_token');
      localStorage.removeItem('rtm_admin_user');
      authToken = null;
      currentUser = null;
      showAuth();
      showToast('Đã đăng xuất khỏi hệ thống', 'info');
    }

    function switchTab(tabName) {
      currentTab = tabName;
      const tabs = ['dashboard', 'licenses', 'companies', 'users', 'work-reports', 'devices', 'analytics'];
      tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        const nav = document.getElementById('nav-' + t);
        if (el) el.classList.toggle('hidden', t !== tabName);
        if (t === 'work-reports' && t === tabName) {
          if (typeof loadWorkReports === 'function') {
            loadWorkReports();
          } else if (typeof window.loadWorkReports === 'function') {
            window.loadWorkReports();
          }
        }
        if (nav) {
          if (t === tabName) {
            nav.classList.add('bg-white/10', 'text-white');
            nav.classList.remove('text-zinc-300');
          } else {
            nav.classList.remove('bg-white/10', 'text-white');
            nav.classList.add('text-zinc-300');
          }
        }
      });
    }

    async function authFetch(url, options = {}) {
      const headers = options.headers || {};
      headers['Authorization'] = 'Bearer ' + authToken;
      let res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        // Cố gắng tự động refresh token nếu có refresh_token
        const refToken = localStorage.getItem('rtm_admin_refresh_token');
        if (refToken) {
          try {
            const refreshRes = await fetch('/v1/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refToken })
            });
            if (refreshRes.ok) {
              const rData = await refreshRes.json();
              if (rData.success && rData.access_token) {
                authToken = rData.access_token;
                localStorage.setItem('rtm_admin_token', authToken);
                if (rData.refresh_token) {
                  localStorage.setItem('rtm_admin_refresh_token', rData.refresh_token);
                }
                headers['Authorization'] = 'Bearer ' + authToken;
                res = await fetch(url, { ...options, headers });
                if (res.status !== 401) return res;
              }
            }
          } catch (_) {}
        }
        handleLogout();
        throw new Error('Phiên làm việc đã hết hạn');
      }
      return res;
    }

    async function loadAllData() {
      try {
        const [statsRes, licRes, compRes, usersRes, devRes, anaRes] = await Promise.all([
          authFetch('/v1/admin/stats').then(r => r.json()).catch(() => ({})),
          authFetch('/v1/admin/licenses').then(r => r.json()).catch(() => ({})),
          authFetch('/v1/admin/companies').then(r => r.json()).catch(() => ({})),
          authFetch('/v1/admin/users').then(r => r.json()).catch(() => ({})),
          authFetch('/v1/admin/devices').then(r => r.json()).catch(() => ({})),
          authFetch('/v1/admin/analytics').then(r => r.json()).catch(() => ({}))
        ]);

        systemData.stats = statsRes.stats || {};
        systemData.licenses = licRes.licenses || [];
        systemData.companies = compRes.companies || [];
        systemData.users = usersRes.users || [];
        systemData.devices = devRes.devices || [];
        systemData.pendingResets = devRes.pending_resets || [];
        systemData.analytics = anaRes.analytics || [];

        renderDashboard();
        renderLicenses();
        renderCompanies();
        renderUsers();
        renderDevices();
        renderAnalytics();
        populateCompanyDropdowns();
      } catch (err) {
        console.error('Error loading admin data:', err);
      }
    }

    function refreshAllData() {
      loadAllData();
      showToast('Đã làm mới dữ liệu hệ thống', 'info');
    }

    // =================== RENDER DASHBOARD ===================
    function renderDashboard() {
      const st = systemData.stats;
      if (st.revenue_vnd !== undefined) {
        document.getElementById('kpi-revenue-vnd').innerText = Number(st.revenue_vnd || 0).toLocaleString('vi-VN') + ' ₫';
        document.getElementById('kpi-revenue-usd').innerText = '$' + Number(st.revenue_usd || 0).toFixed(2) + ' USD';
        const revStatus = document.getElementById('kpi-revenue-status');
        if (revStatus) {
          if (Number(st.revenue_vnd) > 0) {
            revStatus.innerText = 'Doanh thu thực tế';
            revStatus.className = 'text-emerald-400 font-medium';
          } else {
            revStatus.innerText = 'Chưa có kênh nạp báo cáo';
            revStatus.className = 'text-zinc-500 font-medium';
          }
        }
      }
      if (st.total_licenses !== undefined) {
        document.getElementById('kpi-total-licenses').innerText = (st.total_licenses || 0) + ' Bản Quyền';
        document.getElementById('kpi-used-seats').innerText = st.used_seats || 0;
        document.getElementById('kpi-max-seats').innerText = st.max_seats || 0;
        const pct = st.max_seats ? Math.min(100, Math.round(((st.used_seats || 0) / st.max_seats) * 100)) : 0;
        document.getElementById('kpi-seat-progress').style.width = pct + '%';
      }
      if (st.active_devices !== undefined) {
        document.getElementById('kpi-active-devices').innerText = (st.active_devices || 0) + ' Máy';
      }
      if (st.monitored_channels !== undefined) {
        document.getElementById('kpi-monitored-channels').innerText = (st.monitored_channels || 0) + ' Kênh Đích';
        const vidElem = document.getElementById('kpi-monitored-videos');
        const bktElem = document.getElementById('kpi-bkt-status');
        if (st.monitored_channels > 0) {
          if (vidElem) vidElem.innerText = (st.monitored_channels || 0) + ' Kênh đang quản lý';
          if (bktElem) {
            bktElem.innerText = 'Đang theo dõi BKT';
            bktElem.className = 'text-emerald-400 font-medium';
          }
        } else {
          if (vidElem) vidElem.innerText = '0 Video đã tải & Reup';
          if (bktElem) {
            bktElem.innerText = 'Chưa liên kết kênh';
            bktElem.className = 'text-zinc-500 font-medium';
          }
        }
      }

      // Pending resets alert
      const pendingCount = systemData.pendingResets.length;
      const alertBanner = document.getElementById('pending-alert-banner');
      const badge = document.getElementById('pending-reset-badge');
      if (pendingCount > 0) {
        alertBanner.classList.remove('hidden');
        badge.classList.remove('hidden');
        badge.innerText = pendingCount;
      } else {
        alertBanner.classList.add('hidden');
        badge.classList.add('hidden');
      }

      // Activity table
      const tbody = document.getElementById('dashboard-activity-tbody');
      tbody.innerHTML = '';
      const list = systemData.analytics.slice(0, 5);
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-zinc-500">Chưa ghi nhận hoạt động nào hôm nay.</td></tr>';
        return;
      }
      list.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' + (item.report_date || 'Hôm nay') + '</td>' +
          '<td class="px-5 py-3.5 font-medium text-white">' + (item.channel_name || 'YouTube Channel') + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(item.views || 0).toLocaleString() + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(item.watch_time_hours || 0).toFixed(1) + ' h</td>' +
          '<td class="px-5 py-3.5 font-mono text-emerald-400">$' + Number(item.estimated_revenue || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">' + Number(item.estimated_revenue_vnd || 0).toLocaleString() + ' ₫</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-help" data-tooltip="Video vượt qua kiểm tra Content ID, không có cảnh báo vi phạm bản quyền từ YouTube." data-tooltip-title="BKT Xanh">Sạch Bản Quyền</span>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    // =================== RENDER LICENSES ===================
    function renderLicenses() {
      const tbody = document.getElementById('licenses-table-tbody');
      tbody.innerHTML = '';
      const search = (document.getElementById('license-search-input')?.value || '').toLowerCase();
      const tierFilter = document.getElementById('license-tier-filter')?.value || 'all';

      const filtered = systemData.licenses.filter(l => {
        const matchesSearch = l.license_key.toLowerCase().includes(search) || 
                              (l.company_name && l.company_name.toLowerCase().includes(search));
        const matchesTier = tierFilter === 'all' || l.tier === tierFilter;
        return matchesSearch && matchesTier;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-8 text-center text-zinc-500">Không tìm thấy mã bản quyền nào.</td></tr>';
        return;
      }

      filtered.forEach(lic => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        
        let tierColor = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
        if (lic.tier === 'enterprise') tierColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
        if (lic.tier === 'trial') tierColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

        let statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        if (lic.status === 'suspended') statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        if (lic.status === 'expired' || lic.status === 'revoked') statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

        const daysLeft = Math.ceil((new Date(lic.expires_at).getTime() - Date.now()) / (86400000));
        const daysText = daysLeft > 0 ? ('Còn ' + daysLeft + ' ngày') : 'Đã hết hạn';

        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-mono text-zinc-200">' +
            '<div class="flex items-center gap-2">' +
              '<span id="key-' + lic.id + '" class="tracking-wider select-all">' + lic.license_key + '</span>' +
              '<button onclick="copyToClipboard(&apos;' + lic.license_key + '&apos;)" data-tooltip="Sao chép mã License Key vào bộ nhớ tạm để gửi cho nhân viên/khách hàng." data-tooltip-title="Sao Chép Khóa" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition">' +
                '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">' +
                  '<path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"/>' +
                '</svg>' +
              '</button>' +
            '</div>' +
          '</td>' +
          '<td class="px-5 py-3.5 font-medium text-white">' + (lic.company_name || 'RETubeMatrix HQ') + '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ' + tierColor + '">' + lic.tier + '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 font-mono">' +
            '<span>' + lic.used_seats + ' / ' + lic.max_seats + ' máy</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' +
            '<div>' + new Date(lic.expires_at).toLocaleDateString('vi-VN') + '</div>' +
            '<div class="text-[10px] text-zinc-500">' + daysText + '</div>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase ' + statusColor + '">' + lic.status + '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 text-right space-x-1">' +
            (lic.company_id ? '<button onclick="openUpgradeCompanyModal(&apos;' + lic.company_id + '&apos;)" data-tooltip="Nâng cấp gói bản quyền hoặc mở rộng số máy cho công ty sở hữu key này." data-tooltip-title="Nâng Cấp Gói" class="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] transition font-medium border border-amber-500/30">Nâng Gói</button>' : '') +
            '<button onclick="handleAddLicenseSeatsPrompt(&apos;' + lic.id + '&apos;, ' + lic.max_seats + ')" data-tooltip="Tăng nhanh số lượng máy trạm tối đa có thể chạy song song." data-tooltip-title="Thêm Ghế Máy" class="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[11px] transition font-medium border border-indigo-500/30">+ Máy</button>' +
            '<button onclick="handleExtendLicense(&apos;' + lic.id + '&apos;)" data-tooltip="Cộng thêm 365 ngày hiệu lực trực tiếp vào thời hạn của License Key này." data-tooltip-title="Gia Hạn 1 Năm" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] transition">Gia Hạn</button>' +
            '<button onclick="handleToggleLicenseStatus(&apos;' + lic.id + '&apos;, &apos;' + lic.status + '&apos;)" data-tooltip="Chuyển đổi trạng thái bản quyền: Thu hồi sẽ chặn ngay lập tức toàn bộ máy trạm của key này." data-tooltip-title="Đổi Trạng Thái Khóa" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">' +
              (lic.status === 'active' ? 'Thu Hồi' : 'Kích Hoạt') +
            '</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    function filterLicenses() {
      renderLicenses();
    }

    function openIssueLicenseModal() {
      const select = document.getElementById('modal-license-company');
      select.innerHTML = '';
      systemData.companies.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.name + ' (' + c.code + ')';
        select.appendChild(opt);
      });
      regeneratePreviewKey();
      document.getElementById('modal-issue-license').classList.remove('hidden');
    }

    function closeIssueLicenseModal() {
      document.getElementById('modal-issue-license').classList.add('hidden');
    }

    function regeneratePreviewKey() {
      const tier = (document.getElementById('modal-license-tier')?.value || 'pro').toUpperCase();
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
                   Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
                   Math.random().toString(36).substring(2, 6).toUpperCase();
      document.getElementById('modal-license-preview-key').value = 'RTM-' + tier.substring(0, 3) + '-2026-' + rand;
    }

    function autoConfigureSeatsByTier() {
      const tier = document.getElementById('modal-license-tier').value;
      const seatsInput = document.getElementById('modal-license-seats');
      if (tier === 'enterprise') seatsInput.value = 9999;
      if (tier === 'pro') seatsInput.value = 10;
      if (tier === 'trial') seatsInput.value = 3;
      regeneratePreviewKey();
    }

    async function handleIssueLicenseSubmit(e) {
      e.preventDefault();
      const companyId = document.getElementById('modal-license-company').value;
      const tier = document.getElementById('modal-license-tier').value;
      const maxSeats = parseInt(document.getElementById('modal-license-seats').value, 10);
      const durationDays = parseInt(document.getElementById('modal-license-duration').value, 10);
      const licenseKey = document.getElementById('modal-license-preview-key').value;
      const btn = document.getElementById('btn-submit-issue-license');

      btn.disabled = true;
      btn.innerText = 'Đang cấp...';

      try {
        const res = await authFetch('/v1/admin/licenses/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId, tier, max_seats: maxSeats, duration_days: durationDays, license_key: licenseKey })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi khi cấp license');

        showToast('Cấp License thành công! Đã sao chép vào bộ nhớ tạm', 'success');
        copyToClipboard(licenseKey);
        closeIssueLicenseModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Xác Nhận Cấp Key</span>';
      }
    }

    async function handleExtendLicense(licenseId) {
      if (!confirm('Bạn có chắc chắn muốn gia hạn bản quyền này thêm 365 ngày không?')) return;
      try {
        const res = await authFetch('/v1/admin/licenses/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'extend', license_id: licenseId, days: 365 })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi gia hạn');
        showToast('Đã gia hạn thành công thêm 1 năm', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleToggleLicenseStatus(licenseId, currentStatus) {
      const newStatus = currentStatus === 'active' ? 'revoked' : 'active';
      try {
        const res = await authFetch('/v1/admin/licenses/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_status', license_id: licenseId, status: newStatus })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cập nhật');
        showToast('Cập nhật trạng thái License thành công', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =================== RENDER COMPANIES ===================
    function renderCompanies() {
      const tbody = document.getElementById('companies-table-tbody');
      tbody.innerHTML = '';
      if (systemData.companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-zinc-500">Chưa có công ty nào.</td></tr>';
        return;
      }
      systemData.companies.forEach(c => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';

        const licenseDisplay = (c.license_key && c.license_key !== 'Chưa cấp license')
          ? ('<div class="flex items-center gap-1.5">' +
              '<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold tracking-wider select-all">' + c.license_key + '</span>' +
              '<button onclick="copyToClipboard(&apos;' + c.license_key + '&apos;)" title="Sao chép License Key" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition">' +
                '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="text-[10px] text-zinc-400 mt-0.5 font-sans">Gói: <b class="text-zinc-300 uppercase">' + (c.tier || 'pro') + '</b> • Hạn mức: <b class="text-zinc-300">' + (c.max_seats || 10) + ' máy</b></div>')
          : ('<span class="text-zinc-500 italic text-[11px]">Chưa cấp license</span>');

        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-medium text-white">' + c.name + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300 uppercase">' + c.code + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + licenseDisplay + '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-medium ' + (c.mask_revenue_from_staff ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-400') + '">' +
              (c.mask_revenue_from_staff ? 'Đang Ẩn (Bảo mật)' : 'Hiển thị') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-medium ' + (c.cross_leader_collaboration ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400') + '">' +
              (c.cross_leader_collaboration ? 'Bật Hợp Tác' : 'Khóa') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase ' + (c.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20') + '">' +
              (c.is_active ? 'Hoạt Động' : 'Tạm Khóa') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 text-right space-x-1.5">' +
            '<button onclick="openUpgradeCompanyModal(&apos;' + c.id + '&apos;)" data-tooltip="Nâng cấp hoặc chuyển đổi gói (Trial, Pro, Enterprise), mở rộng số máy và tính năng." data-tooltip-title="Nâng Gói Doanh Nghiệp" class="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] transition font-medium border border-amber-500/30">Nâng Gói</button>' +
            '<button onclick="openEditCompanyModal(&apos;' + c.id + '&apos;)" data-tooltip="Sửa tên, mã công ty hoặc các thiết lập bảo mật." data-tooltip-title="Sửa Công Ty" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-200 text-[11px] transition font-medium">' +
              'Sửa' +
            '</button>' +
            '<button onclick="handleToggleCompanyRevenueMask(&apos;' + c.id + '&apos;, ' + c.mask_revenue_from_staff + ')" data-tooltip="Bật/Tắt tức thì chính sách che giấu doanh thu đối với nhân viên công ty này." data-tooltip-title="Bảo Mật Doanh Thu" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] transition">' +
              (c.mask_revenue_from_staff ? 'Hiện DT' : 'Ẩn DT') +
            '</button>' +
            (c.id === 'e51f4953-587e-4a5e-af09-e76471ca0326' ? '' :
            '<button onclick="handleDeleteCompany(&apos;' + c.id + '&apos;, &apos;' + (c.name || '').replace(/'/g, "'") + '&apos;)" data-tooltip="Xóa công ty khỏi hệ thống." data-tooltip-title="Xóa Công Ty" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">' +
              'Xóa' +
            '</button>') +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    function openAddCompanyModal() {
      document.getElementById('modal-add-company').classList.remove('hidden');
    }

    function closeAddCompanyModal() {
      document.getElementById('modal-add-company').classList.add('hidden');
    }

    async function handleAddCompanySubmit(e) {
      e.preventDefault();
      const name = document.getElementById('modal-company-name').value.trim();
      const code = document.getElementById('modal-company-code').value.trim().toUpperCase();
      const maskRev = document.getElementById('modal-company-mask-rev').checked;
      const crossCollab = document.getElementById('modal-company-cross-collab').checked;

      try {
        const res = await authFetch('/v1/admin/companies/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code, mask_revenue_from_staff: maskRev, cross_leader_collaboration: crossCollab })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi khi tạo công ty');
        showToast('Tạo công ty ' + name + ' thành công!', 'success');
        closeAddCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleToggleCompanyRevenueMask(companyId, currentVal) {
      try {
        const res = await authFetch('/v1/admin/companies/update-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId, mask_revenue_from_staff: !currentVal })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cập nhật');
        showToast('Đã cập nhật cài đặt công ty', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =================== RENDER USERS & ROLES ===================
    function filterUsers() {
      const q = (document.getElementById('users-search-input')?.value || '').toLowerCase().trim();
      const compFilter = document.getElementById('users-filter-company')?.value || 'all';
      const roleFilter = document.getElementById('users-filter-role')?.value || 'all';
      const hwidFilter = document.getElementById('users-filter-hwid')?.value || 'all';

      const myRole = (currentUser && currentUser.role) || 'owner';
      const myCompanyId = currentUser && currentUser.company_id;

      let list = (systemData.users || []).slice();

      // 1. Phân quyền hiển thị theo Role người đăng nhập
      if (myRole === 'admin') {
        // Admin: Thấy các thành viên trong công ty mình (ngoại trừ Master Owner)
        list = list.filter(u => u.company_id === myCompanyId && u.role !== 'owner');
      } else if (myRole === 'leader') {
        // Leader: Thấy các User trong công ty
        list = list.filter(u => u.company_id === myCompanyId && u.role === 'user');
      }
      // Owner: Thấy toàn bộ thành viên của mọi công ty + thành viên mới đăng ký chưa có công ty

      // 2. Tìm kiếm theo họ tên, email, thiết bị
      if (q) {
        list = list.filter(u => 
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.company_name || '').toLowerCase().includes(q) ||
          (u.company_code || '').toLowerCase().includes(q) ||
          (u.bound_device && (u.bound_device.device_name || '').toLowerCase().includes(q))
        );
      }

      // 3. Lọc theo Công ty
      if (compFilter !== 'all') {
        if (compFilter === 'unassigned') {
          list = list.filter(u => !u.company_id);
        } else {
          list = list.filter(u => u.company_id === compFilter);
        }
      }

      // 4. Lọc theo Role
      if (roleFilter !== 'all') {
        list = list.filter(u => u.role === roleFilter);
      }

      // 5. Lọc theo HWID
      if (hwidFilter === 'bound') {
        list = list.filter(u => u.has_device_bound);
      } else if (hwidFilter === 'unbound') {
        list = list.filter(u => !u.has_device_bound);
      }

      renderUserList(list);
    }

    function renderUsers() {
      filterUsers();
    }

    function renderUserList(users) {
      const tbody = document.getElementById('users-table-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colSpan="7" class="px-5 py-8 text-center text-zinc-500">Không tìm thấy thành viên nào phù hợp.</td></tr>';
        return;
      }

      const myRole = (currentUser && currentUser.role) || 'owner';
      const isOwner = myRole === 'owner' || (currentUser && currentUser.email === 'dungdong333@gmail.com');
      const isAdmin = myRole === 'admin';
      const isLeader = myRole === 'leader';

      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';

        let roleBadge = '';
        if (u.role === 'owner') {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>Master Owner</span>';
        } else if (u.role === 'admin') {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Admin (Sếp)</span>';
        } else if (u.role === 'leader') {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Leader</span>';
        } else {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase tracking-wide">User (Nhân Viên)</span>';
        }

        let deviceStatus = '';
        if (u.role === 'owner') {
          deviceStatus = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">Bypass HWID (Mọi máy)</span>';
        } else if (u.has_device_bound && u.bound_device) {
          deviceStatus = '<div class="text-xs text-white font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' + (u.bound_device.device_name || 'Windows PC') + '</div>' +
            '<div class="text-[10px] text-zinc-500 font-mono">' + (u.bound_device.last_ip || '127.0.0.1') + ' • ' + (u.bound_device.os_info || 'Win') + '</div>';
        } else {
          deviceStatus = '<span class="text-[11px] text-zinc-500 italic">Chưa gắn máy</span>';
        }

        let companyDisplay = '';
        if (u.company_id && u.company_name) {
          companyDisplay = '<div class="text-white font-medium">' + u.company_name + '</div>' +
            '<div class="text-[10px] text-zinc-500 font-mono">(' + (u.company_code || '') + ')</div>';
        } else {
          companyDisplay = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">Chưa gán công ty</span>';
        }

        const isUserMasterOwner = u.role === 'owner' || u.email === 'dungdong333@gmail.com' || u.id === '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44';
        const formattedDate = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—';

        // Xây dựng bộ nút Thao tác dựa trên phân quyền nghiêm ngặt
        let actionsHtml = '';

        // 1. Nút Gán Vào Công Ty: Dành cho Owner
        if (isOwner) {
          actionsHtml += '<button onclick="openAssignCompanyModal(&apos;' + u.id + '&apos;)" data-tooltip="Gán thành viên này vào công ty trực thuộc." data-tooltip-title="Gán Công Ty" class="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[11px] transition font-medium">Gán Cty</button> ';
        }

        // 2. Nút Phân Quyền:
        // Owner: phân quyền Admin, Leader, User
        // Admin: chuyển User <-> Leader
        if (isOwner || (isAdmin && (u.role === 'user' || u.role === 'leader'))) {
          actionsHtml += '<button onclick="openChangeRoleModal(&apos;' + u.id + '&apos;)" data-tooltip="Thiết lập cấp bậc phân quyền cho thành viên." data-tooltip-title="Phân Quyền" class="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-[11px] transition font-medium">Phân Quyền</button> ';
        }

        // 3. Nút Sửa: Owner, Admin, Leader
        if (isOwner || isAdmin || (isLeader && u.role === 'user')) {
          actionsHtml += '<button onclick="openEditUserModal(&apos;' + u.id + '&apos;)" data-tooltip="Sửa họ tên và trạng thái kích hoạt." data-tooltip-title="Sửa Thông Tin" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] transition font-medium">Sửa</button> ';
        }

        // 4. Nút Reset Máy: Nếu máy đã bị bind HWID
        if (u.has_device_bound && (isOwner || isAdmin)) {
          actionsHtml += '<button onclick="handleResetUserHwid(&apos;' + u.id + '&apos;, &apos;' + u.email + '&apos;)" data-tooltip="Giải phóng máy HWID hiện tại ngay lập tức." data-tooltip-title="Giải Phóng Máy" class="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] transition font-medium">Reset Máy</button> ';
        }

        // 5. Nút Xóa: 
        // Owner: xóa mọi user (trừ Master Owner)
        // Admin: xóa User hoặc Leader trong cty mình
        // Leader: xóa User trong cty mình
        const canDelete = 
          (!isUserMasterOwner) && (
            isOwner ||
            (isAdmin && (u.role === 'user' || u.role === 'leader') && u.id !== currentUser?.id) ||
            (isLeader && u.role === 'user')
          );

        if (canDelete) {
          actionsHtml += '<button onclick="handleDeleteUser(&apos;' + u.id + '&apos;, &apos;' + u.email + '&apos;)" data-tooltip="Xóa vĩnh viễn tài khoản khỏi hệ thống." data-tooltip-title="Xóa Tài Khoản" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] transition">Xóa</button>';
        }

        tr.innerHTML = 
          '<td class="px-5 py-3.5">' +
            '<div class="font-medium text-white">' + (u.full_name || u.email) + '</div>' +
            '<div class="text-[11px] text-zinc-400 font-mono">' + u.email + '</div>' +
          '</td>' +
          '<td class="px-5 py-3.5">' + companyDisplay + '</td>' +
          '<td class="px-5 py-3.5">' + roleBadge + '</td>' +
          '<td class="px-5 py-3.5">' + deviceStatus + '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ' + (u.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20') + '">' +
              '<span class="w-1 h-1 rounded-full ' + (u.is_active ? 'bg-emerald-400' : 'bg-rose-400') + '"></span>' +
              (u.is_active ? 'Hoạt Động' : 'Đã Khóa') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400 text-[11px]">' + formattedDate + '</td>' +
          '<td class="px-5 py-3.5 text-right whitespace-nowrap">' +
            actionsHtml +
          '</td>';

        tbody.appendChild(tr);
      });
    }

    function populateCompanyDropdowns() {
      const selects = ['modal-license-company', 'modal-user-company', 'modal-edit-user-company', 'modal-assign-company-select', 'users-filter-company'];
      selects.forEach(selId => {
        const el = document.getElementById(selId);
        if (!el) return;
        const curVal = el.value;
        el.innerHTML = '';

        if (selId === 'users-filter-company') {
          const optAll = document.createElement('option');
          optAll.value = 'all';
          optAll.innerText = 'Tất cả công ty';
          el.appendChild(optAll);

          const optUnassigned = document.createElement('option');
          optUnassigned.value = 'unassigned';
          optUnassigned.innerText = 'Chưa gán công ty';
          el.appendChild(optUnassigned);
        } else if (selId === 'modal-assign-company-select') {
          const optNone = document.createElement('option');
          optNone.value = '';
          optNone.innerText = '-- Không gán (Hủy gán công ty) --';
          el.appendChild(optNone);
        }

        systemData.companies.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.innerText = c.name + ' (' + c.code + ')';
          el.appendChild(opt);
        });
        if (curVal) el.value = curVal;
      });
    }

    // Modal Gán Vào Công Ty
    function openAssignCompanyModal(userId) {
      const user = (systemData.users || []).find(u => u.id === userId);
      if (!user) return;
      populateCompanyDropdowns();

      document.getElementById('modal-assign-user-id').value = user.id;
      document.getElementById('modal-assign-user-info').innerText = (user.full_name || user.email) + ' (' + user.email + ')';
      document.getElementById('modal-assign-company-select').value = user.company_id || '';
      document.getElementById('modal-assign-company').classList.remove('hidden');
    }

    function closeAssignCompanyModal() {
      document.getElementById('modal-assign-company').classList.add('hidden');
    }

    async function handleAssignCompanySubmit(e) {
      e.preventDefault();
      const user_id = document.getElementById('modal-assign-user-id').value;
      const company_id = document.getElementById('modal-assign-company-select').value;
      if (!company_id) {
        showToast('Vui lòng chọn công ty để gán cho thành viên', 'error');
        return;
      }

      try {
        const res = await authFetch('/v1/admin/users/assign-company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, company_id, activate: true })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi gán công ty');
        showToast(data.message || 'Gán thành viên vào công ty thành công!', 'success');
        closeAssignCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Phân Quyền Vai Trò
    function openChangeRoleModal(userId) {
      const user = (systemData.users || []).find(u => u.id === userId);
      if (!user) return;

      const myRole = (currentUser && currentUser.role) || 'owner';
      const roleSelect = document.getElementById('modal-role-select');
      roleSelect.innerHTML = '';

      if (myRole === 'owner') {
        const roles = [
          { value: 'admin', label: 'Admin (Quản trị viên / Sếp công ty)' },
          { value: 'leader', label: 'Leader (Trưởng nhóm)' },
          { value: 'user', label: 'User (Nhân viên thông thường)' }
        ];
        roles.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.value;
          opt.innerText = r.label;
          roleSelect.appendChild(opt);
        });
      } else if (myRole === 'admin') {
        const roles = [
          { value: 'leader', label: 'Leader (Trưởng nhóm)' },
          { value: 'user', label: 'User (Nhân viên)' }
        ];
        roles.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.value;
          opt.innerText = r.label;
          roleSelect.appendChild(opt);
        });
      }

      document.getElementById('modal-role-user-id').value = user.id;
      document.getElementById('modal-role-user-info').innerText = (user.full_name || user.email) + ' • Hiện tại: ' + (user.role || 'user').toUpperCase();
      roleSelect.value = user.role || 'user';
      document.getElementById('modal-change-role').classList.remove('hidden');
    }

    function closeChangeRoleModal() {
      document.getElementById('modal-change-role').classList.add('hidden');
    }

    async function handleChangeRoleSubmit(e) {
      e.preventDefault();
      const user_id = document.getElementById('modal-role-user-id').value;
      const role = document.getElementById('modal-role-select').value;

      try {
        const res = await authFetch('/v1/admin/users/update-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, role })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cập nhật vai trò');
        showToast('Cập nhật phân quyền thành công sang: ' + role.toUpperCase(), 'success');
        closeChangeRoleModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Add User
    function generateRandomUserPassword() {
      const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
      let pwd = 'Rtm@';
      for (let i = 0; i < 6; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const el = document.getElementById('modal-user-password');
      if (el) el.value = pwd;
    }

    function updateModalUserCompanyLicenseHint() {
      const compId = document.getElementById('modal-user-company')?.value;
      const comp = (systemData.companies || []).find(c => c.id === compId);
      const hintEl = document.getElementById('modal-user-company-lic');
      if (hintEl) {
        if (comp && comp.license_key && comp.license_key !== 'Chưa cấp license') {
          hintEl.innerText = comp.license_key + ' (' + (comp.tier || 'pro').toUpperCase() + ')';
        } else {
          hintEl.innerText = 'Chưa có license key';
        }
      }
    }

    function openAddUserModal() {
      populateCompanyDropdowns();
      const roleSelect = document.getElementById('modal-user-role');
      if (roleSelect) {
        roleSelect.innerHTML = '';
        const myRole = (currentUser && currentUser.role) || 'owner';
        if (myRole === 'owner') {
          const roles = [
            { value: 'admin', label: 'Admin (Quản trị viên / Giám đốc công ty)' },
            { value: 'leader', label: 'Leader (Trưởng nhóm)' },
            { value: 'user', label: 'User (Nhân viên)' }
          ];
          roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.innerText = r.label;
            roleSelect.appendChild(opt);
          });
          roleSelect.value = 'user';
        } else if (myRole === 'admin') {
          const roles = [
            { value: 'leader', label: 'Leader (Trưởng nhóm)' },
            { value: 'user', label: 'User (Nhân viên)' }
          ];
          roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.innerText = r.label;
            roleSelect.appendChild(opt);
          });
          roleSelect.value = 'user';
        } else {
          const opt = document.createElement('option');
          opt.value = 'user';
          opt.innerText = 'User (Nhân viên)';
          roleSelect.appendChild(opt);
        }
      }

      generateRandomUserPassword();
      updateModalUserCompanyLicenseHint();
      document.getElementById('modal-add-user').classList.remove('hidden');
    }

    function closeAddUserModal() {
      document.getElementById('modal-add-user').classList.add('hidden');
    }

    let lastCreatedAccount = null;

    function showCreatedAccountResultModal(userObj) {
      lastCreatedAccount = userObj;
      const comp = (systemData.companies || []).find(c => c.id === userObj.company_id);
      
      document.getElementById('created-acc-email').innerText = userObj.email || '';
      document.getElementById('created-acc-pwd').innerText = userObj.plain_password || '********';
      document.getElementById('created-acc-role').innerText = (userObj.role || 'user').toUpperCase();
      document.getElementById('created-acc-company').innerText = (comp ? comp.name + ' (' + comp.code + ')' : (userObj.company_id || 'Chưa gán'));
      document.getElementById('created-acc-lic').innerText = (comp?.license_key && comp.license_key !== 'Chưa cấp license') ? comp.license_key : 'Chưa có license';
      
      document.getElementById('modal-account-created').classList.remove('hidden');
    }

    function closeCreatedAccountModal() {
      document.getElementById('modal-account-created').classList.add('hidden');
    }

    function copyFullAccountCredentials() {
      if (!lastCreatedAccount) return;
      const comp = (systemData.companies || []).find(c => c.id === lastCreatedAccount.company_id);
      const compName = comp ? comp.name + ' (' + comp.code + ')' : 'Mặc định';
      const licKey = (comp && comp.license_key && comp.license_key !== 'Chưa cấp license') ? comp.license_key : 'RTM-MASTER-ENTERPRISE-2026';
      const text = 
        'THÔNG TIN TÀI KHOẢN RETUBEMATRIX\\n' +
        '----------------------------------------\\n' +
        '- Email: ' + lastCreatedAccount.email + '\\n' +
        '- Mật khẩu: ' + (lastCreatedAccount.plain_password || '********') + '\\n' +
        '- Vai trò: ' + (lastCreatedAccount.role || 'user').toUpperCase() + '\\n' +
        '- Công ty: ' + compName + '\\n' +
        '- License Key kích hoạt: ' + licKey + '\\n' +
        '----------------------------------------\\n' +
        'Vui lòng sử dụng thông tin trên để đăng nhập phần mềm RETubeMatrix Desktop!';

      copyToClipboard(text);
      showToast('Đã sao chép toàn bộ thông tin tài khoản!', 'success');
    }

    async function handleAddUserSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('modal-user-email').value.trim();
      const password = document.getElementById('modal-user-password').value;
      const full_name = document.getElementById('modal-user-fullname').value.trim();
      const role = document.getElementById('modal-user-role').value;
      const company_id = document.getElementById('modal-user-company').value;

      try {
        const res = await authFetch('/v1/admin/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name, role, company_id })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cấp tài khoản');
        
        closeAddUserModal();
        loadAllData();
        showToast('Cấp tài khoản ' + email + ' thành công!', 'success');
        showCreatedAccountResultModal(data.user || { email, password, plain_password: password, full_name, role, company_id });
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Edit User
    function openEditUserModal(userId) {
      const user = systemData.users.find(u => u.id === userId);
      if (!user) return;
      populateCompanyDropdowns();

      document.getElementById('modal-edit-user-id').value = user.id;
      document.getElementById('modal-edit-user-email').value = user.email;
      document.getElementById('modal-edit-user-fullname').value = user.full_name || '';
      document.getElementById('modal-edit-user-role').value = user.role || 'user';
      document.getElementById('modal-edit-user-company').value = user.company_id || '';
      document.getElementById('modal-edit-user-active').checked = !!user.is_active;

      document.getElementById('modal-edit-user').classList.remove('hidden');
    }
    function closeEditUserModal() {
      document.getElementById('modal-edit-user').classList.add('hidden');
    }

    async function handleEditUserSubmit(e) {
      e.preventDefault();
      const user_id = document.getElementById('modal-edit-user-id').value;
      const full_name = document.getElementById('modal-edit-user-fullname').value.trim();
      const role = document.getElementById('modal-edit-user-role').value;
      const company_id = document.getElementById('modal-edit-user-company').value;
      const is_active = document.getElementById('modal-edit-user-active').checked;

      try {
        const res = await authFetch('/v1/admin/users/update-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, full_name, is_active })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cập nhật');

        // Nếu có thay đổi vai trò:
        const user = systemData.users.find(u => u.id === user_id);
        if (user && user.role !== role) {
          const roleRes = await authFetch('/v1/admin/users/update-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, role })
          });
          const roleData = await roleRes.json();
          if (!roleRes.ok || !roleData.success) throw new Error(roleData.error || 'Lỗi phân quyền');
        }

        // Nếu là Master Owner và có chọn công ty khác:
        const myRole = (currentUser && currentUser.role) || 'owner';
        if (myRole === 'owner' && company_id && user && user.company_id !== company_id) {
          await authFetch('/v1/admin/users/assign-company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, company_id, activate: is_active })
          });
        }

        showToast('Cập nhật thông tin thành viên thành công', 'success');
        closeEditUserModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleDeleteUser(userId, email) {
      if (!confirm('Bạn có chắc chắn muốn xóa tài khoản ' + email + ' khỏi hệ thống? Thao tác này không thể hoàn tác!')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/users/' + userId, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi xóa người dùng');
        showToast(data.message || ('Đã xóa người dùng ' + email), 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleResetUserHwid(userId, email) {
      if (!confirm('Giải phóng khóa máy (HWID) cho ' + email + '? Người dùng sẽ có thể đăng nhập trên máy mới ngay lập tức.')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/users/reset-hwid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi reset máy');
        showToast('Đã giải phóng máy cho ' + email, 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Edit Company
    function openEditCompanyModal(companyId) {
      const comp = systemData.companies.find(c => c.id === companyId);
      if (!comp) return;

      document.getElementById('modal-edit-company-id').value = comp.id;
      document.getElementById('modal-edit-company-name').value = comp.name;
      document.getElementById('modal-edit-company-code').value = comp.code;
      document.getElementById('modal-edit-company-mask-rev').checked = !!comp.mask_revenue_from_staff;
      document.getElementById('modal-edit-company-cross-collab').checked = !!comp.cross_leader_collaboration;
      document.getElementById('modal-edit-company-active').checked = !!comp.is_active;

      document.getElementById('modal-edit-company').classList.remove('hidden');
    }
    function closeEditCompanyModal() {
      document.getElementById('modal-edit-company').classList.add('hidden');
    }

    async function handleEditCompanySubmit(e) {
      e.preventDefault();
      const company_id = document.getElementById('modal-edit-company-id').value;
      const name = document.getElementById('modal-edit-company-name').value.trim();
      const code = document.getElementById('modal-edit-company-code').value.trim().toUpperCase();
      const mask_revenue_from_staff = document.getElementById('modal-edit-company-mask-rev').checked;
      const cross_leader_collaboration = document.getElementById('modal-edit-company-cross-collab').checked;
      const is_active = document.getElementById('modal-edit-company-active').checked;

      try {
        const res = await authFetch('/v1/admin/companies/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id, name, code, mask_revenue_from_staff, cross_leader_collaboration, is_active })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi cập nhật công ty');
        showToast('Cập nhật công ty ' + name + ' thành công', 'success');
        closeEditCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleDeleteCompany(companyId, name) {
      if (!confirm('Bạn có chắc chắn muốn xóa công ty "' + name + '"? Các nhân viên thuộc công ty này sẽ được tự động chuyển về Tổng bộ (RETubeMatrix HQ).')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/companies/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi xóa công ty');
        showToast('Đã xóa công ty thành công', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }


    // =================== UPGRADE COMPANY TIER MODAL ===================
    function openUpgradeCompanyModal(companyId) {
      let comp = systemData.companies.find(c => c.id === companyId);
      if (!comp) {
        // Fallback kiểm tra từ danh sách licenses
        const lic = systemData.licenses.find(l => l.company_id === companyId);
        if (lic) {
          comp = {
            id: companyId,
            name: lic.company_name || 'RETubeMatrix HQ',
            code: lic.company_code || 'HQ',
            tier: lic.tier || 'pro',
            max_seats: lic.max_seats || 10,
            expires_at: lic.expires_at || null
          };
        } else {
          showToast('Không tìm thấy thông tin công ty', 'error');
          return;
        }
      }

      document.getElementById('modal-upgrade-company-id').value = comp.id;
      document.getElementById('modal-upgrade-company-name').innerText = comp.name || 'Chưa đặt tên';
      document.getElementById('modal-upgrade-company-code').innerText = comp.code || '--';

      const curTier = (comp.tier || 'pro').toLowerCase();
      const curTierBadge = document.getElementById('modal-upgrade-current-tier-badge');
      if (curTierBadge) {
        curTierBadge.innerText = curTier.toUpperCase();
        if (curTier === 'enterprise') {
          curTierBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border bg-purple-500/10 text-purple-400 border-purple-500/20';
        } else if (curTier === 'trial') {
          curTierBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20';
        } else {
          curTierBadge.className = 'px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
        }
      }

      // Chọn target tier tiếp theo (ưu tiên lên Enterprise nếu đang Pro/Trial)
      let nextTier = 'pro';
      if (curTier === 'pro') nextTier = 'enterprise';
      else if (curTier === 'trial') nextTier = 'pro';
      else nextTier = 'enterprise';

      const radio = document.getElementById('tier-radio-' + nextTier);
      if (radio) radio.checked = true;

      onUpgradeTierSelect(nextTier);

      document.getElementById('modal-upgrade-company').classList.remove('hidden');
    }

    function closeUpgradeCompanyModal() {
      document.getElementById('modal-upgrade-company').classList.add('hidden');
    }

    function onUpgradeTierSelect(tier) {
      const seatsInput = document.getElementById('modal-upgrade-seats');
      const extendSelect = document.getElementById('modal-upgrade-extend-days');
      const bktHint = document.getElementById('modal-upgrade-hint-bkt');
      const profHint = document.getElementById('modal-upgrade-hint-profiles');
      const collabHint = document.getElementById('modal-upgrade-hint-collab');

      if (tier === 'enterprise') {
        if (seatsInput) seatsInput.value = 9999;
        if (extendSelect) extendSelect.value = '3650';
        if (bktHint) bktHint.innerText = '9999 Video / Ngày (Vô hạn)';
        if (profHint) profHint.innerText = '999 Trình duyệt độc lập';
        if (collabHint) collabHint.innerText = 'Bật hợp tác chéo đội nhóm';
      } else if (tier === 'trial') {
        if (seatsInput) seatsInput.value = 3;
        if (extendSelect) extendSelect.value = '14';
        if (bktHint) bktHint.innerText = '15 Video / Ngày';
        if (profHint) profHint.innerText = '5 Trình duyệt độc lập';
        if (collabHint) collabHint.innerText = 'Chỉ trong nội bộ nhóm';
      } else {
        // pro
        if (seatsInput) seatsInput.value = 10;
        if (extendSelect) extendSelect.value = '365';
        if (bktHint) bktHint.innerText = '50 Video / Ngày';
        if (profHint) profHint.innerText = '25 Trình duyệt độc lập';
        if (collabHint) collabHint.innerText = 'Hỗ trợ chia sẻ tài nguyên';
      }
    }

    async function handleUpgradeCompanySubmit(e) {
      e.preventDefault();
      const company_id = document.getElementById('modal-upgrade-company-id').value;
      const target_tier = (document.querySelector('input[name="upgrade-tier-radio"]:checked')?.value || 'pro');
      const max_seats = parseInt(document.getElementById('modal-upgrade-seats').value, 10) || 10;
      const extend_days = parseInt(document.getElementById('modal-upgrade-extend-days').value, 10) || 0;
      const btn = document.getElementById('btn-submit-upgrade-company');

      btn.disabled = true;
      const origText = btn.innerHTML;
      btn.innerHTML = '<span>Đang nâng gói...</span>';

      try {
        const res = await authFetch('/v1/admin/companies/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id,
            target_tier,
            max_seats,
            extend_days
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Nâng cấp gói không thành công');
        }

        showToast('Nâng cấp công ty sang gói ' + target_tier.toUpperCase() + ' thành công!', 'success');
        closeUpgradeCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }

    async function handleAddLicenseSeatsPrompt(licenseId, currentSeats) {
      const addSeatsStr = prompt('Nhập số lượng máy trạm (Seats) muốn cộng thêm vào License Key này (Hiện tại: ' + currentSeats + ' máy):', '5');
      if (!addSeatsStr) return;
      const seats = parseInt(addSeatsStr, 10);
      if (isNaN(seats) || seats <= 0) {
        showToast('Số máy cộng thêm phải là số nguyên dương lớn hơn 0', 'error');
        return;
      }

      try {
        const res = await authFetch('/v1/admin/licenses/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_seats',
            license_id: licenseId,
            seats: seats
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Lỗi thêm máy cho License');
        }

        showToast('Đã cộng thêm +' + seats + ' máy trạm thành công! (Tổng: ' + data.new_max_seats + ' máy)', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =================== RENDER DEVICES & HWID RESET ===================
    function renderDevices() {
      // 1. Pending Resets Table
      const pendingTbody = document.getElementById('pending-resets-tbody');
      pendingTbody.innerHTML = '';
      const pendingList = systemData.pendingResets;
      document.getElementById('pending-reset-count-badge').innerText = pendingList.length + ' Yêu cầu';

      if (pendingList.length === 0) {
        pendingTbody.innerHTML = '<tr><td colspan="6" class="px-5 py-6 text-center text-zinc-500">Không có yêu cầu đổi máy nào đang chờ duyệt.</td></tr>';
      } else {
        pendingList.forEach(req => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-white/[0.02] transition';
          tr.innerHTML = 
            '<td class="px-5 py-3.5">' +
              '<div class="font-medium text-white">' + (req.user_name || req.user_email) + '</div>' +
              '<div class="text-[10px] text-zinc-400 font-mono">' + req.user_email + '</div>' +
            '</td>' +
            '<td class="px-5 py-3.5 text-zinc-300">' + (req.company_name || 'Công Ty') + '</td>' +
            '<td class="px-5 py-3.5 text-amber-300">' + (req.reason || 'Cài lại Win / Đổi máy') + '</td>' +
            '<td class="px-5 py-3.5 font-mono text-[11px] text-zinc-400">' + ((req.new_hwid_hash || '').substring(0, 16)) + '...</td>' +
            '<td class="px-5 py-3.5 text-zinc-400">' + new Date(req.created_at).toLocaleDateString('vi-VN') + '</td>' +
            '<td class="px-5 py-3.5 text-right space-x-1.5">' +
              '<button onclick="handleReviewHwidReset(&apos;' + req.id + '&apos;, true)" data-tooltip="Phê duyệt sẽ giải phóng máy cũ và cho phép phần cứng máy mới kích hoạt ngay lập tức." data-tooltip-title="Phê Duyệt Đổi Máy" class="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm">Phê Duyệt</button>' +
              '<button onclick="handleReviewHwidReset(&apos;' + req.id + '&apos;, false)" data-tooltip="Bác bỏ yêu cầu. Nhân viên không thể sử dụng máy mới với tài khoản này." data-tooltip-title="Từ Chối Đổi Máy" class="px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition">Từ Chối</button>' +
            '</td>';
          pendingTbody.appendChild(tr);
        });
      }

      // 2. Active Devices Table
      const activeTbody = document.getElementById('active-devices-tbody');
      activeTbody.innerHTML = '';
      const devList = systemData.devices;
      document.getElementById('total-bound-devices-count').innerText = devList.length + ' thiết bị';

      if (devList.length === 0) {
        activeTbody.innerHTML = '<tr><td colspan="8" class="px-5 py-6 text-center text-zinc-500">Chưa có thiết bị nào kích hoạt.</td></tr>';
        return;
      }

      devList.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-medium text-white">' + (d.device_name || 'Windows PC') + '</td>' +
          '<td class="px-5 py-3.5">' +
            '<div class="text-zinc-200">' + (d.user_name || d.user_email) + '</div>' +
            '<div class="text-[10px] text-zinc-500 font-mono">' + (d.user_role || 'user') + '</div>' +
          '</td>' +
          '<td class="px-5 py-3.5 text-zinc-400">' + (d.company_name || 'HQ') + '</td>' +
          '<td class="px-5 py-3.5 text-zinc-400">' + (d.os_info || 'Windows 11') + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-[11px] text-zinc-400">' + ((d.hwid_hash || '').substring(0, 14)) + '...</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' + (d.last_ip || '127.0.0.1') + '</td>' +
          '<td class="px-5 py-3.5 text-zinc-400 font-mono">' + new Date(d.last_heartbeat_at || Date.now()).toLocaleTimeString('vi-VN') + '</td>' +
          '<td class="px-5 py-3.5 text-right">' +
            '<button onclick="handleUnbindDevice(&apos;' + d.id + '&apos;)" data-tooltip="Hủy liên kết phần cứng máy này ngay lập tức. Nhân viên sẽ phải đăng ký lại hoặc gửi yêu cầu đổi máy." data-tooltip-title="Hủy Gắn Máy HWID" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">Hủy Gắn Máy</button>' +
          '</td>';
        activeTbody.appendChild(tr);
      });
    }

    function refreshDevices() {
      loadAllData();
      showToast('Đã cập nhật danh sách thiết bị', 'info');
    }

    async function handleReviewHwidReset(requestId, approved) {
      const actionName = approved ? 'Phê duyệt' : 'Từ chối';
      if (!confirm('Bạn có chắc chắn muốn ' + actionName + ' yêu cầu đổi máy này không?')) return;

      try {
        const res = await authFetch('/v1/admin/devices/review-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId, approved })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi xử lý yêu cầu đổi máy');
        showToast(approved ? 'Đã phê duyệt đổi máy thành công! Nhân viên có thể đăng nhập.' : 'Đã từ chối yêu cầu đổi máy.', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleUnbindDevice(bindingId) {
      if (!confirm('Hủy liên kết phần cứng máy này? Nhân viên sẽ bị yêu cầu kích hoạt lại hoặc gửi yêu cầu đổi máy.')) return;
      try {
        const res = await authFetch('/v1/admin/devices/unbind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ binding_id: bindingId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi hủy liên kết');
        showToast('Đã hủy liên kết máy thành công', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // =================== RENDER ANALYTICS ===================
    function renderAnalytics() {
      const tbody = document.getElementById('analytics-table-tbody');
      tbody.innerHTML = '';
      if (systemData.analytics.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="px-5 py-8 text-center text-zinc-500">Chưa có dữ liệu Studio nào được nạp.</td></tr>';
        return;
      }
      systemData.analytics.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-medium text-white">' + (row.channel_name || 'YouTube Studio') + '</td>' +
          '<td class="px-5 py-3.5 text-zinc-400">' + (row.company_name || 'Công Ty') + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' + (row.report_date || 'Hôm nay') + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(row.views || 0).toLocaleString() + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(row.watch_time_hours || 0).toFixed(1) + ' h</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">$' + Number(row.rpm || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">$' + Number(row.cpm || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-emerald-400 font-medium">$' + Number(row.estimated_revenue || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-200">' + Number(row.estimated_revenue_vnd || 0).toLocaleString() + ' ₫</td>';
        tbody.appendChild(tr);
      });
    }

    function setAnalyticsDateFilter(range) {
      document.querySelectorAll('#btn-filter-today, #btn-filter-7d, #btn-filter-30d').forEach(b => {
        b.className = 'px-3 py-1.5 rounded-lg glass-card hover:bg-white/10 text-zinc-300 text-xs font-medium transition';
      });
      const activeBtn = document.getElementById('btn-filter-' + range);
      if (activeBtn) activeBtn.className = 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium transition';
      loadAllData();
    }

    // =================== UTILITIES ===================
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép vào bộ nhớ tạm: ' + text, 'success');
      }).catch(() => {
        showToast('Không thể sao chép tự động', 'error');
      });
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      
      let border = 'border-white/10 bg-zinc-900/90 text-zinc-200';
      if (type === 'success') border = 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200';
      if (type === 'error') border = 'border-rose-500/30 bg-rose-950/90 text-rose-200';

      toast.className = 'px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium flex items-center gap-2.5 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ' + border;
      toast.innerHTML = 
        '<span class="w-1.5 h-1.5 rounded-full ' + (type === 'success' ? 'bg-emerald-400' : (type === 'error' ? 'bg-rose-400' : 'bg-indigo-400')) + '"></span>' +
        '<span>' + message + '</span>';

      container.appendChild(toast);
      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      });

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  

// =================== WORK REPORTS TELEMETRY & TEAMS JS ===================
let workReportsData = null;
let teamsComparisonData = null;

function refreshUsers() {
  loadAllData();
  showToast('Đã làm mới danh sách thành viên', 'info');
}

function scrollToPermissionsMatrix(e) {
  if (e) e.preventDefault();
  const el = document.getElementById('permissions-matrix');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  } else {
    showToast('Bảng ma trận quyền hạn hiển thị ở cuối trang quản trị', 'info');
  }
}

async function loadWorkReports() {
  if (!authToken) return;
  try {
    const [wrRes, teamsRes] = await Promise.all([
      authFetch('/v1/admin/work-reports').then(r => r.ok ? r.json() : null).catch(() => null),
      authFetch('/v1/admin/teams-comparison').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    if (wrRes && wrRes.success) {
      const reports = wrRes.staff_reports || wrRes.reports || wrRes.data?.reports || [];
      const leaderboard = wrRes.leaderboard || wrRes.data?.leaderboard || [];
      const totalTargets = wrRes.total_target_channels ?? wrRes.totalTargetChannels ?? wrRes.data?.totalTargetChannels ?? 0;
      const totalComps = wrRes.total_monitored_competitors ?? wrRes.totalCompetitors ?? wrRes.data?.totalCompetitors ?? 0;

      workReportsData = {
        reports,
        leaderboard,
        totalTargetChannels: totalTargets,
        totalCompetitors: totalComps,
      };

      renderWorkReportsKPI(workReportsData);
      renderLeaderboard(leaderboard);
      renderStaffWorkReports(reports);
    }

    if (teamsRes && teamsRes.success && teamsRes.teams) {
      teamsComparisonData = teamsRes.teams;
      renderTeamsComparison(teamsRes.teams);
    }
  } catch (err) {
    console.error('Lỗi nạp dữ liệu Work Reports:', err);
    showToast('Lỗi nạp báo cáo công việc: ' + err.message, 'error');
  }
}
window.loadWorkReports = loadWorkReports;

function renderWorkReportsKPI(data) {
  const elTargets = document.getElementById('wr-total-target-channels');
  const elComps = document.getElementById('wr-total-competitors');
  const elBkt = document.getElementById('wr-total-bkt');
  const elRate = document.getElementById('wr-bkt-rate');
  const elUploads = document.getElementById('wr-total-uploads-today');

  let totalTargets = data.totalTargetChannels || 0;
  let totalComps = data.totalCompetitors || 0;
  let totalGreen = 0;
  let totalRed = 0;
  let totalUploadsToday = 0;

  if (Array.isArray(data.reports)) {
    data.reports.forEach(r => {
      totalGreen += (r.videos_tested_green || 0);
      totalRed += (r.videos_tested_red || 0);
      totalUploadsToday += (r.videos_uploaded_today || 0);
    });
  }

  if (elTargets) elTargets.innerText = totalTargets.toLocaleString();
  if (elComps) elComps.innerText = totalComps.toLocaleString();
  if (elBkt) elBkt.innerText = totalGreen + ' / ' + totalRed;
  if (elRate) {
    const sum = totalGreen + totalRed;
    const rate = sum > 0 ? Math.round((totalGreen / sum) * 100) : 100;
    elRate.innerText = rate + '%';
  }
  if (elUploads) elUploads.innerText = totalUploadsToday.toLocaleString() + ' video';
}

function renderLeaderboard(list) {
  const tbody = document.getElementById('wr-leaderboard-tbody');
  if (!tbody) return;
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-zinc-500">Chưa có dữ liệu xếp hạng nhân sự</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    let rankBadge = '<span class="font-bold text-zinc-400 pl-2">#' + (idx + 1) + '</span>';
    if (idx === 0) rankBadge = '<span class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 inline-flex items-center justify-center font-bold text-xs">Top 1</span>';
    else if (idx === 1) rankBadge = '<span class="w-6 h-6 rounded-full bg-zinc-300/20 text-zinc-200 border border-zinc-400/40 inline-flex items-center justify-center font-bold text-xs">Top 2</span>';
    else if (idx === 2) rankBadge = '<span class="w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 border border-amber-700/40 inline-flex items-center justify-center font-bold text-xs">Top 3</span>';

    return '<tr class="hover:bg-white/[0.02] transition ' + (idx === 0 ? 'bg-amber-500/[0.02]' : '') + '">' +
      '<td class="px-5 py-3.5">' + rankBadge + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-semibold text-white">' + (item.full_name || item.email) + '</p>' +
        '<p class="text-[10px] text-zinc-400">' + item.email + '</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 text-zinc-300">' + (item.company_name || 'N/A') + '</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (item.target_channels_count || 0) + ' kênh</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-amber-400">' + (item.videos_uploaded_today || 0) + ' video</td>' +
      '<td class="px-5 py-3.5 font-semibold text-zinc-200 font-mono">' + Number(item.total_views || 0).toLocaleString() + '</td>' +
      '<td class="px-5 py-3.5 font-bold text-white font-mono">' + Number(item.estimated_revenue_vnd || 0).toLocaleString() + ' đ</td>' +
      '<td class="px-5 py-3.5 text-center">' +
        '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">' + (item.quality_score || 100) + '% Sạch</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderTeamsComparison(teams) {
  const tbody = document.getElementById('wr-teams-tbody');
  if (!tbody) return;
  if (!teams || teams.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-zinc-500">Chưa có dữ liệu so sánh giữa các đội nhóm</td></tr>';
    return;
  }

  tbody.innerHTML = teams.map(tm => {
    let evalColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (tm.evaluation === 'Xuất sắc') evalColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    else if (tm.evaluation === 'Hiệu quả cao') evalColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';

    return '<tr class="hover:bg-white/[0.02] transition">' +
      '<td class="px-5 py-3.5 font-bold text-white">' + (tm.team_name || 'Đội Nhóm') + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-medium text-zinc-200">' + (tm.leader_name || tm.leader_email) + '</p>' +
        '<p class="text-[10px] text-zinc-400">' + tm.leader_email + '</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 text-center text-zinc-300">' + (tm.members_count || 0) + '</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (tm.target_channels_count || 0) + '</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-amber-400">' + (tm.videos_uploaded_today || 0) + '</td>' +
      '<td class="px-5 py-3.5 font-semibold text-zinc-200 font-mono">' + Number(tm.total_views || 0).toLocaleString() + '</td>' +
      '<td class="px-5 py-3.5 font-bold text-white font-mono">' + Number(tm.revenue_vnd || 0).toLocaleString() + ' đ</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (tm.quality_rate || 100) + '%</td>' +
      '<td class="px-5 py-3.5 text-center">' +
        '<span class="px-2.5 py-0.5 rounded-lg border text-xs font-semibold ' + evalColor + '">' + (tm.evaluation || 'Đạt') + '</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderStaffWorkReports(reports) {
  const tbody = document.getElementById('wr-staff-tbody');
  if (!tbody) return;
  if (!reports || reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-zinc-500">Chưa có báo cáo công việc từ nhân sự</td></tr>';
    return;
  }

  tbody.innerHTML = reports.map((r, rIdx) => {
    let compHtml = '<span class="text-zinc-500">Chưa theo dõi kênh đối thủ</span>';
    if (r.competitor_channels && r.competitor_channels.length > 0) {
      compHtml = r.competitor_channels.map(c => {
        const link = c.channel_url ? '<a href="' + c.channel_url + '" target="_blank" rel="noreferrer" class="text-sky-400 hover:underline inline-flex items-center gap-1 font-medium">' + (c.channel_name || c.channel_url) + '</a>' : '<span class="text-zinc-300">' + c.channel_name + '</span>';
        const kw = c.primary_keyword ? '<span class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">' + c.primary_keyword + '</span>' : '';
        return '<div class="space-y-0.5">' + link + ' ' + kw + '<div class="text-[10px] text-zinc-400 font-mono">' + Number(c.subscriber_count || 0).toLocaleString() + ' subs • ' + Number(c.total_views || 0).toLocaleString() + ' views</div></div>';
      }).join('<div class="my-1 border-t border-white/5"></div>');
    }

    let view5Btn = '<span class="text-zinc-500 text-[11px]">—</span>';
    if (r.competitor_channels && r.competitor_channels.length > 0 && r.competitor_channels[0].recent_5_videos && r.competitor_channels[0].recent_5_videos.length > 0) {
      view5Btn = '<button onclick="openRecentVideosModal(' + rIdx + ', 0)" class="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-sky-400 text-xs font-medium transition flex items-center gap-1 ml-auto"><span>5 Video Mới</span></button>';
    }

    return '<tr class="hover:bg-white/[0.02] transition">' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-white">' + (r.full_name || r.email) + '</p>' +
        '<p class="text-[10px] text-zinc-400">' + r.email + '</p>' +
        (r.assigned_niche ? '<span class="inline-block mt-1 px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]">' + r.assigned_niche + '</span>' : '') +
      '</td>' +
      '<td class="px-5 py-3.5 text-zinc-300">' + (r.company_name || 'N/A') + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-emerald-400">' + (r.target_channels_count || 0) + ' Kênh Đích</p>' +
        '<p class="text-[10px] text-zinc-400">' + (r.test_channels_count || 0) + ' Kênh Test BKT</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 max-w-xs">' + compHtml + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-amber-400">' + (r.videos_uploaded_today || 0) + ' hôm nay</p>' +
        '<p class="text-[10px] text-zinc-400 font-mono">Tuần: ' + (r.videos_uploaded_week || 0) + ' | Tháng: ' + (r.videos_uploaded_month || 0) + '</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 font-medium">' +
        '<span class="text-emerald-400">' + (r.videos_tested_green || 0) + ' Xanh</span> / <span class="text-rose-400">' + (r.videos_tested_red || 0) + ' Đỏ</span>' +
      '</td>' +
      '<td class="px-5 py-3.5 text-right">' + view5Btn + '</td>' +
    '</tr>';
  }).join('');
}

function openRecentVideosModal(reportIdx, compIdx) {
  if (!workReportsData || !workReportsData.reports) return;
  const rep = workReportsData.reports[reportIdx];
  if (!rep || !rep.competitor_channels || !rep.competitor_channels[compIdx]) return;
  const comp = rep.competitor_channels[compIdx];

  const modal = document.getElementById('modal-recent-videos');
  const titleEl = document.getElementById('mrv-channel-name');
  const listEl = document.getElementById('mrv-videos-list');

  if (titleEl) titleEl.innerText = 'Kênh đối thủ: ' + (comp.channel_name || comp.channel_url);

  const videos = comp.recent_5_videos || [];
  if (listEl) {
    if (videos.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8 text-zinc-500">Chưa có video nào được cào từ kênh này.</div>';
    } else {
      listEl.innerHTML = videos.map((v, i) => {
        return '<div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-start justify-between gap-3">' +
          '<div class="space-y-1 flex-1">' +
            '<p class="font-semibold text-zinc-200 text-xs line-clamp-2">#' + (i + 1) + '. ' + (v.title || 'Video') + '</p>' +
            '<div class="flex items-center gap-3 text-[11px] text-zinc-400 font-mono">' +
              '<span>Lượt xem: ' + Number(v.view_count || v.views || 0).toLocaleString() + '</span>' +
              (v.upload_date ? '<span>Ngày đăng: ' + v.upload_date + '</span>' : '') +
            '</div>' +
          '</div>' +
          (v.url ? '<a href="' + v.url + '" target="_blank" rel="noreferrer" class="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-lg shrink-0">Mở Video</a>' : '') +
        '</div>';
      }).join('');
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeRecentVideosModal() {
  const modal = document.getElementById('modal-recent-videos');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
// === END WORK REPORTS JS ===

</script>

  <!-- MODAL: XEM 5 VIDEO GẦN NHẤT CỦA KÊNH ĐỐI THỦ -->
  <div id="modal-recent-videos" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-card bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
      <div class="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <div>
          <h3 class="font-bold text-white text-sm flex items-center gap-2">
            <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"/>
            </svg>
            <span>5 Video Mới Nhất & Tăng Trưởng</span>
          </h3>
          <p id="mrv-channel-name" class="text-xs text-zinc-400 mt-0.5">Kênh đối thủ: </p>
        </div>
        <button onclick="closeRecentVideosModal()" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div id="mrv-videos-list" class="p-4 overflow-y-auto space-y-3 flex-1">
        <!-- Rendered dynamically -->
      </div>

      <div class="p-3 border-t border-white/10 bg-zinc-900/90 flex justify-end">
        <button onclick="closeRecentVideosModal()" class="px-4 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white text-xs">Đóng</button>
      </div>
    </div>
  </div>

</body>
</html>`;
}
