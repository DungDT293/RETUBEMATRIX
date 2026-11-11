var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/portalHtml.ts
function getPortalHtml() {
  return `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RETubeMatrix \u2014 SaaS Master Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
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
  <\/script>
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
        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium cursor-help" data-tooltip="C\u1ED5ng Edge Worker \u0111ang ho\u1EA1t \u0111\u1ED9ng th\u1EDDi gian th\u1EF1c t\u1EA1i c\xE1c m\xE1y ch\u1EE7 bi\xEAn Cloudflare tr\xEAn to\xE0n c\u1EA7u." data-tooltip-title="H\u1EA1 T\u1EA7ng \u0110i\u1EC7n To\xE1n Bi\xEAn">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Cloudflare Edge Online</span>
        </div>

        <!-- User Profile Pill -->
        <div id="user-profile-bar" class="hidden flex items-center gap-3 pl-3 border-l border-white/10 cursor-help" data-tooltip="T\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB \u0111ang \u0111\u0103ng nh\u1EADp. M\u1ECDi t\xE1c v\u1EE5 c\u1EA5p kh\xF3a v\xE0 duy\u1EC7t ph\u1EA7n c\u1EE9ng \u0111\u01B0\u1EE3c l\u01B0u v\u1EBFt ki\u1EC3m to\xE1n." data-tooltip-title="Phi\xEAn Qu\u1EA3n Tr\u1ECB">
          <div class="flex flex-col text-right">
            <span id="current-user-name" class="text-xs font-semibold text-zinc-200">Ti\u1EBFn D\u0169ng (Master)</span>
            <span id="current-user-role" class="text-[10px] text-indigo-400 font-mono uppercase">OWNER</span>
          </div>
          <div class="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-medium text-zinc-300">
            D
          </div>
          <button onclick="handleLogout()" data-tooltip="\u0110\u0103ng xu\u1EA5t kh\u1ECFi c\u1ED5ng qu\u1EA3n tr\u1ECB v\xE0 x\xF3a phi\xEAn l\xE0m vi\u1EC7c an to\xE0n." data-tooltip-title="\u0110\u0103ng Xu\u1EA5t" class="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition">
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
          <h2 class="text-xl font-bold text-white tracking-tight">\u0110\u0103ng Nh\u1EADp Qu\u1EA3n Tr\u1ECB H\u1EC7 Th\u1ED1ng</h2>
          <p class="text-xs text-zinc-400 mt-1">C\u1ED5ng \u0111i\u1EC1u h\xE0nh b\u1EA3o m\u1EADt c\u1EA5p cao \u2014 Y\xEAu c\u1EA7u nh\u1EADp th\xF4ng tin th\u1EE7 c\xF4ng</p>
        </div>

        <form id="login-form" onsubmit="handleLoginSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">Email t\xE0i kho\u1EA3n</label>
            <input type="email" id="login-email" required autocomplete="username" class="w-full px-3.5 py-2.5 rounded-lg glass-input text-sm" placeholder="name@company.com">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">M\u1EADt kh\u1EA9u</label>
            <input type="password" id="login-password" required autocomplete="current-password" class="w-full px-3.5 py-2.5 rounded-lg glass-input text-sm" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
          </div>

          <div id="login-error" class="hidden text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5"></div>

          <button type="submit" id="login-btn" class="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2">
            <span>Truy C\u1EADp H\u1EC7 Th\u1ED1ng</span>
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
            <p class="px-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">B\u1EA3ng \u0110i\u1EC1u Khi\u1EC3n</p>
            <button onclick="switchTab('dashboard')" id="nav-dashboard" data-tooltip="B\xE1o c\xE1o hi\u1EC7u su\u1EA5t kinh doanh, s\u1ED1 l\u01B0\u1EE3ng m\xE1y tr\u1EA1m v\xE0 tr\u1EA1ng th\xE1i b\u1EA3n quy\u1EC1n t\u1ED5ng th\u1EC3." data-tooltip-title="T\u1ED5ng Quan & KPI" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>
              </svg>
              <span>T\u1ED5ng Quan & KPI</span>
            </button>
            <button onclick="switchTab('licenses')" id="nav-licenses" data-tooltip="Qu\u1EA3n l\xFD v\xF2ng \u0111\u1EDDi m\xE3 b\u1EA3n quy\u1EC1n, thi\u1EBFt l\u1EADp h\u1EA1n m\u1EE9c s\u1ED1 m\xE1y t\u1ED1i \u0111a v\xE0 gia h\u1EA1n th\u1EDDi h\u1EA1n." data-tooltip-title="Trung T\xE2m License" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
              </svg>
              <span>Trung T\xE2m License</span>
            </button>
            <button onclick="switchTab('companies')" id="nav-companies" data-tooltip="Qu\u1EA3n tr\u1ECB c\u01A1 c\u1EA5u c\xE1c c\xF4ng ty, ph\xE2n quy\u1EC1n hi\u1EC3n th\u1ECB doanh thu v\xE0 ch\xEDnh s\xE1ch n\u1ED9i b\u1ED9." data-tooltip-title="C\xF4ng Ty & T\u1ED5 Ch\u1EE9c" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.75a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V21"/>
              </svg>
              <span>C\xF4ng Ty & T\u1ED5 Ch\u1EE9c</span>
            </button>
            <button onclick="switchTab('users')" id="nav-users" data-tooltip="Qu\u1EA3n l\xFD to\xE0n b\u1ED9 danh s\xE1ch th\xE0nh vi\xEAn, ph\xE2n quy\u1EC1n Owner/Admin/Leader/User, g\xE1n c\xF4ng ty v\xE0 gi\u1EA3i ph\xF3ng kh\xF3a HWID m\xE1y." data-tooltip-title="Qu\u1EA3n L\xFD Nh\xE2n S\u1EF1 & Ph\xE2n Quy\u1EC1n" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span>Qu\u1EA3n L\xFD Nh\xE2n S\u1EF1 & Ph\xE2n Quy\u1EC1n</span>
            </button>
            <button onclick="switchTab('work-reports')" id="nav-work-reports" data-tooltip="Theo d\xF5i chi ti\u1EBFt c\xF4ng vi\u1EC7c t\u1EEBng nh\xE2n s\u1EF1, k\xEAnh \u0111\xEDch, k\xEAnh test, k\xEAnh \u0111\u1ED1i th\u1EE7, BKT xanh/\u0111\u1ECF v\xE0 b\u1EA3ng x\u1EBFp h\u1EA1ng \u0111\u1ED9i ng\u0169." data-tooltip-title="Chi Ti\u1EBFt C\xF4ng Vi\u1EC7c & \u0110\u1ED9i Ng\u0169" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"/>
              </svg>
              <span>Chi Ti\u1EBFt C\xF4ng Vi\u1EC7c & \u0110\u1ED9i Ng\u0169</span>
            </button>
            <button onclick="switchTab('devices')" id="nav-devices" data-tooltip="Ki\u1EC3m so\xE1t c\u01A1 ch\u1EBF kh\xF3a c\u1EE9ng 1 M\xE1y = 1 T\xE0i Kho\u1EA3n v\xE0 duy\u1EC7t c\xE1c y\xEAu c\u1EA7u thay \u0111\u1ED5i linh ki\u1EC7n m\xE1y t\xEDnh." data-tooltip-title="Kh\xF3a M\xE1y HWID" class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <div class="flex items-center gap-3">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"/>
                </svg>
                <span>Kh\xF3a M\xE1y HWID</span>
              </div>
              <span id="pending-reset-badge" class="hidden px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">0</span>
            </button>
            <button onclick="switchTab('analytics')" id="nav-analytics" data-tooltip="Th\u1ED1ng k\xEA chi ti\u1EBFt doanh thu th\u1EF1c t\u1EBF, RPM, CPM v\xE0 th\u1EDDi l\u01B0\u1EE3ng xem t\u1EEB YouTube Studio." data-tooltip-title="K\xEAnh & Doanh Thu" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition">
              <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
              </svg>
              <span>K\xEAnh & Doanh Thu</span>
            </button>
          </div>
        </div>

        <!-- Sidebar Footer Status -->
        <div class="p-3 rounded-xl bg-white/5 border border-white/5 text-xs space-y-2">
          <div class="flex items-center justify-between text-zinc-400 cursor-help" data-tooltip="M\u1ED7i t\xE0i kho\u1EA3n nh\xE2n vi\xEAn g\u1EAFn ch\u1EB7t v\xE0o m\xE3 \u0111\u1ECBnh danh SHA-256 c\u1EE7a bo m\u1EA1ch ch\u1EE7, CPU v\xE0 \u1ED5 \u0111\u0129a m\xE1y t\xEDnh." data-tooltip-title="B\u1EA3o M\u1EADt Ph\u1EA7n C\u1EE9ng">
            <span>B\u1EA3o m\u1EADt thi\u1EBFt b\u1ECB</span>
            <span class="text-emerald-400 font-medium">1 M\xE1y = 1 TK</span>
          </div>
          <div class="flex items-center justify-between text-zinc-400 cursor-help" data-tooltip="B\u1EA3n d\u1EF1ng c\u1ED5ng \u0111i\u1EC1u h\xE0nh Gateway Cloudflare Workers t\u01B0\u01A1ng th\xEDch RETubeMatrix v0.20.16." data-tooltip-title="Phi\xEAn B\u1EA3n C\u1ED5ng">
            <span>Phi\xEAn b\u1EA3n Core</span>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">T\u1ED5ng Quan \u0110i\u1EC1u H\xE0nh</h1>
              <p class="text-xs text-zinc-400 mt-1">B\xE1o c\xE1o hi\u1EC7u su\u1EA5t, quy m\xF4 h\u1EC7 th\u1ED1ng v\xE0 ho\u1EA1t \u0111\u1ED9ng m\xE1y t\xEDnh th\u1EDDi gian th\u1EF1c</p>
            </div>
            <div class="flex items-center gap-3">
              <button onclick="refreshAllData()" data-tooltip="\u0110\u1ED3ng b\u1ED9 l\u1EA1i t\u1EE9c th\xEC c\xE1c ch\u1EC9 s\u1ED1 m\u1EDBi nh\u1EA5t t\u1EEB c\u01A1 s\u1EDF d\u1EEF li\u1EC7u Cloudflare D1 / Supabase." data-tooltip-title="L\xE0m M\u1EDBi D\u1EEF Li\u1EC7u" class="px-3.5 py-1.5 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <span>L\xE0m M\u1EDBi</span>
              </button>
              <button onclick="openIssueLicenseModal()" data-tooltip="Kh\u1EDFi t\u1EA1o m\xE3 b\u1EA3n quy\u1EC1n m\u1EDBi v\u1EDBi s\u1ED1 m\xE1y v\xE0 th\u1EDDi h\u1EA1n linh ho\u1EA1t cho \u0111\u1ED1i t\xE1c." data-tooltip-title="C\u1EA5p Ph\xE9p M\u1EDBi" class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                <span>C\u1EA5p License M\u1EDBi</span>
              </button>
            </div>
          </div>

          <!-- Pending Alert Banner (If Any) -->
          <div id="pending-alert-banner" data-tooltip="C\xF3 m\xE1y tr\u1EA1m nh\xE2n vi\xEAn thay \u0111\u1ED5i linh ki\u1EC7n ho\u1EB7c c\xE0i l\u1EA1i Win c\u1EA7n Admin ph\xEA duy\u1EC7t m\u1EDBi \u0111\u01B0\u1EE3c m\u1EDF kh\xF3a \u1EE9ng d\u1EE5ng." data-tooltip-title="Y\xEAu C\u1EA7u Ch\u1EDD Duy\u1EC7t" class="hidden p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between cursor-help">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-amber-200">C\xF3 y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y HWID \u0111ang ch\u1EDD duy\u1EC7t!</h4>
                <p class="text-[11px] text-amber-400/80">Nh\xE2n vi\xEAn c\u1EA7n \u0111\u01B0\u1EE3c c\u1EA5p ph\xE9p \u0111\u1EC3 \u0111\u0103ng nh\u1EADp tr\xEAn m\xE1y t\xEDnh m\u1EDBi.</p>
              </div>
            </div>
            <button onclick="switchTab('devices')" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition">
              Xem & Ph\xEA Duy\u1EC7t Ngay
            </button>
          </div>

          <!-- 4 EXECUTIVE METRIC CARDS -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <!-- Metric 1: Total Revenue -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="T\u1ED5ng doanh thu t\u1ED5ng h\u1EE3p t\u1EEB b\xE1o c\xE1o YouTube Analytics n\u1EA1p v\u1EC1 h\xE0ng ng\xE0y t\u1EEB c\xE1c m\xE1y tr\u1EA1m studio (t\xEDnh theo t\u1EF7 gi\xE1 USD/VND hi\u1EC7n h\xE0nh 25,000 \u20AB/USD)." data-tooltip-title="Doanh Thu \u01AF\u1EDBc T\xEDnh H\u1EC7 Th\u1ED1ng">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>\u01AF\u1EDBc T\xEDnh Doanh Thu H\u1EC7 Th\u1ED1ng</span>
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-revenue-vnd">0 \u20AB</div>
                <div class="text-xs font-mono text-zinc-400 mt-0.5" id="kpi-revenue-usd">$0.00 USD</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Tr\u1EA1ng th\xE1i d\u1EEF li\u1EC7u</span>
                <span class="text-zinc-500 font-medium" id="kpi-revenue-status">Ch\u01B0a c\xF3 k\xEAnh n\u1EA1p b\xE1o c\xE1o</span>
              </div>
            </div>

            <!-- Metric 2: Active Licenses -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="T\u1ED5ng s\u1ED1 b\u1EA3n quy\u1EC1n b\u1EA3n Enterprise/Pro \u0111\xE3 k\xEDch ho\u1EA1t v\xE0 t\u1EF7 l\u1EC7 m\xE1y tr\u1EA1m (Seats) th\u1EF1c t\u1EBF \u0111ang v\u1EADn h\xE0nh tr\xEAn t\u1ED5ng h\u1EA1n m\u1EE9c cho ph\xE9p." data-tooltip-title="S\u1ED1 License & H\u1EA1n M\u1EE9c M\xE1y">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>S\u1ED1 License \u0110\xE3 C\u1EA5p</span>
                <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-total-licenses">0 B\u1EA3n Quy\u1EC1n</div>
                <div class="text-xs text-zinc-400 mt-0.5">S\u1EED d\u1EE5ng: <span id="kpi-used-seats" class="text-indigo-400 font-mono font-medium">0</span> / <span id="kpi-max-seats" class="font-mono">0</span> m\xE1y</div>
              </div>
              <div class="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div id="kpi-seat-progress" class="bg-indigo-500 h-1.5 rounded-full" style="width: 0%"></div>
              </div>
            </div>

            <!-- Metric 3: Online Locked Devices -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="S\u1ED1 l\u01B0\u1EE3ng m\xE1y t\xEDnh tr\u1EA1m \u0111ang kh\xF3a ph\u1EA7n c\u1EE9ng \u0111\u1ED9c quy\u1EC1n (HWID 1 M\xE1y = 1 T\xE0i Kho\u1EA3n) c\xF3 ph\xE1t sinh t\xEDn hi\u1EC7u Heartbeat trong 24 gi\u1EDD qua." data-tooltip-title="M\xE1y Tr\u1EA1m HWID Online">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>Thi\u1EBFt B\u1ECB HWID Ho\u1EA1t \u0110\u1ED9ng</span>
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-active-devices">0 M\xE1y</div>
                <div class="text-xs text-zinc-400 mt-0.5">R\xE0ng bu\u1ED9c ph\u1EA7n c\u1EE9ng an to\xE0n</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Ch\u1EBF \u0111\u1ED9 kh\xF3a</span>
                <span class="text-cyan-400 font-medium">1 M\xE1y = 1 T\xE0i kho\u1EA3n</span>
              </div>
            </div>

            <!-- Metric 4: Monitored Channels -->
            <div class="glass-card rounded-xl p-5 border border-white/5 space-y-3 cursor-help" data-tooltip="T\u1ED5ng s\u1ED1 k\xEAnh YouTube m\u1EE5c ti\xEAu \u0111ang \u0111\u01B0\u1EE3c c\u1EAFm Reup & theo d\xF5i b\u1EA3n quy\u1EC1n BKT t\u1EF1 \u0111\u1ED9ng qua h\u1EC7 th\u1ED1ng Telemetry." data-tooltip-title="H\u1EC7 Th\u1ED1ng K\xEAnh YouTube">
              <div class="flex items-center justify-between text-zinc-400 text-xs">
                <span>K\xEAnh YouTube Qu\u1EA3n L\xFD</span>
                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
              </div>
              <div>
                <div class="text-2xl font-bold font-mono text-white" id="kpi-monitored-channels">0 K\xEAnh \u0110\xEDch</div>
                <div class="text-xs text-zinc-400 mt-0.5" id="kpi-monitored-videos">0 Video \u0111\xE3 t\u1EA3i & Reup</div>
              </div>
              <div class="pt-2 border-t border-white/5 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>T\xECnh tr\u1EA1ng b\u1EA3n quy\u1EC1n</span>
                <span class="text-zinc-500 font-medium" id="kpi-bkt-status">Ch\u01B0a li\xEAn k\u1EBFt k\xEAnh</span>
              </div>
            </div>

          </div>

          <!-- RECENT ACTIVITY TABLE -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">B\xE1o C\xE1o T\xF3m T\u1EAFt Ho\u1EA1t \u0110\u1ED9ng Theo Ng\xE0y</h3>
              <span class="text-xs text-zinc-400">C\u1EADp nh\u1EADt t\u1EF1 \u0111\u1ED9ng t\u1EEB YouTube Studio</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="Ng\xE0y n\u1EA1p s\u1ED1 li\u1EC7u telemetry t\u1EF1 \u0111\u1ED9ng t\u1EEB YouTube Studio c\u1EE7a m\xE1y tr\u1EA1m." data-tooltip-title="Th\u1EDDi \u0110i\u1EC3m Ghi Nh\u1EADn">Ng\xE0y B\xE1o C\xE1o</th>
                    <th class="px-5 py-3" data-tooltip="T\xEAn k\xEAnh YouTube \u0111ang c\u1EAFm ch\u1EA1y tool v\xE0 n\u1EA1p d\u1EEF li\u1EC7u th\u1ED1ng k\xEA." data-tooltip-title="K\xEAnh \u0110\xEDch">K\xEAnh YouTube</th>
                    <th class="px-5 py-3" data-tooltip="T\u1ED5ng l\u01B0\u1EE3t xem video h\u1EE3p l\u1EC7 trong ng\xE0y ghi nh\u1EADn b\u1EDFi YouTube." data-tooltip-title="L\u01B0\u1EE3t Xem H\u1EE3p L\u1EC7">L\u01B0\u1EE3t Xem (Views)</th>
                    <th class="px-5 py-3" data-tooltip="T\u1ED5ng th\u1EDDi l\u01B0\u1EE3ng ng\u01B0\u1EDDi xem t\xEDch l\u0169y (Watch Hours) \u0111\u1EA1t chu\u1EA9n BKT." data-tooltip-title="Gi\u1EDD Xem T\xEDch L\u0169y">Gi\u1EDD Xem</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu qu\u1EA3ng c\xE1o v\xE0 YouTube Premium t\xEDnh b\u1EB1ng \u0110\xF4 la M\u1EF9 (USD)." data-tooltip-title="Doanh Thu USD">Doanh Thu \u01AF\u1EDBc T\xEDnh (USD)</th>
                    <th class="px-5 py-3" data-tooltip="Quy \u0111\u1ED5i sang Vi\u1EC7t Nam \u0110\u1ED3ng theo t\u1EF7 gi\xE1 h\u1EC7 th\u1ED1ng 25,000 \u20AB/USD." data-tooltip-title="Quy \u0110\u1ED5i VN\u0110">Quy \u0110\u1ED5i VN\u0110</th>
                    <th class="px-5 py-3" data-tooltip="Tr\u1EA1ng th\xE1i r\xE0 qu\xE9t b\u1EA3n quy\u1EC1n: BKT Xanh ch\u1EE9ng nh\u1EADn kh\xF4ng b\u1ECB g\u1EADy ho\u1EB7c khi\u1EBFu n\u1EA1i Content ID." data-tooltip-title="Ki\u1EC3m Duy\u1EC7t B\u1EA3n Quy\u1EC1n">Tr\u1EA1ng Th\xE1i</th>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">Trung T\xE2m Qu\u1EA3n L\xFD License</h1>
              <p class="text-xs text-zinc-400 mt-1">C\u1EA5p kh\xF3a m\u1EDBi, thi\u1EBFt l\u1EADp h\u1EA1n m\u1EE9c s\u1ED1 m\xE1y, gia h\u1EA1n th\u1EDDi gian v\xE0 qu\u1EA3n l\xFD tr\u1EA1ng th\xE1i ph\xE2n ph\u1ED1i</p>
            </div>
            <button onclick="openIssueLicenseModal()" data-tooltip="Kh\u1EDFi t\u1EA1o m\xE3 b\u1EA3n quy\u1EC1n m\u1EDBi v\u1EDBi s\u1ED1 l\u01B0\u1EE3ng m\xE1y t\u1ED1i \u0111a v\xE0 th\u1EDDi h\u1EA1n t\xF9y ch\u1ECDn cho \u0111\u1ED1i t\xE1c/c\xF4ng ty." data-tooltip-title="C\u1EA5p License M\u1EDBi" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              <span>C\u1EA5p License M\u1EDBi</span>
            </button>
          </div>

          <!-- Filter Toolbar -->
          <div class="flex items-center gap-3">
            <div class="flex-1 relative">
              <input type="text" id="license-search-input" onkeyup="filterLicenses()" data-tooltip="T\xECm nhanh theo chu\u1ED7i k\xFD t\u1EF1 trong m\xE3 Key ho\u1EB7c t\xEAn c\xF4ng ty \u0111\u1ED1i t\xE1c." data-tooltip-title="T\xECm Ki\u1EBFm License" placeholder="T\xECm theo m\xE3 License, t\xEAn c\xF4ng ty..." class="w-full pl-9 pr-4 py-2 rounded-lg glass-input text-xs">
              <svg class="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
            </div>
            <select id="license-tier-filter" onchange="filterLicenses()" data-tooltip="L\u1ECDc b\u1EA3n quy\u1EC1n theo c\u1EA5p \u0111\u1ED9: Enterprise (kh\xF4ng gi\u1EDBi h\u1EA1n), Pro (10 m\xE1y) ho\u1EB7c Trial (3 m\xE1y)." data-tooltip-title="B\u1ED9 L\u1ECDc C\u1EA5p \u0110\u1ED9" class="px-3 py-2 rounded-lg glass-input text-xs">
              <option value="all">T\u1EA5t c\u1EA3 g\xF3i</option>
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
                    <th class="px-5 py-3" data-tooltip="Chu\u1ED7i m\xE3 h\xF3a \u0111\u1ECBnh danh b\u1EA3n quy\u1EC1n duy nh\u1EA5t \u0111\u01B0\u1EE3c c\u1EA5p cho t\u1ED5 ch\u1EE9c." data-tooltip-title="M\xE3 B\u1EA3n Quy\u1EC1n">M\xE3 License Key</th>
                    <th class="px-5 py-3" data-tooltip="Doanh nghi\u1EC7p ho\u1EB7c chi nh\xE1nh s\u1EDF h\u1EEFu quy\u1EC1n s\u1EED d\u1EE5ng b\u1ED9 m\xE3 n\xE0y." data-tooltip-title="C\xF4ng Ty / Chi Nh\xE1nh">C\xF4ng Ty \xC1p D\u1EE5ng</th>
                    <th class="px-5 py-3" data-tooltip="C\u1EA5p \u0111\u1ED9 ph\xE2n quy\u1EC1n (Enterprise: kh\xF4ng gi\u1EDBi h\u1EA1n, Pro: 10 m\xE1y, Trial: 3 m\xE1y)." data-tooltip-title="G\xF3i D\u1ECBch V\u1EE5">G\xF3i (Tier)</th>
                    <th class="px-5 py-3" data-tooltip="S\u1ED1 l\u01B0\u1EE3ng m\xE1y tr\u1EA1m ph\u1EA7n c\u1EE9ng \u0111\xE3 k\xEDch ho\u1EA1t / H\u1EA1n m\u1EE9c t\u1ED1i \u0111a \u0111\u01B0\u1EE3c ph\xE9p ch\u1EA1y \u0111\u1ED3ng th\u1EDDi." data-tooltip-title="H\u1EA1n M\u1EE9c M\xE1y (Seats)">S\u1ED1 M\xE1y (Used / Max)</th>
                    <th class="px-5 py-3" data-tooltip="Th\u1EDDi \u0111i\u1EC3m h\u1EBFt hi\u1EC7u l\u1EF1c c\u1EE7a m\xE3 b\u1EA3n quy\u1EC1n. Sau h\u1EA1n n\xE0y m\xE1y tr\u1EA1m s\u1EBD b\u1ECB t\u1EEB ch\u1ED1i truy c\u1EADp." data-tooltip-title="Th\u1EDDi Gian Hi\u1EC7u L\u1EF1c">H\u1EA1n D\xF9ng</th>
                    <th class="px-5 py-3" data-tooltip="T\xECnh tr\u1EA1ng hi\u1EC7u l\u1EF1c (Active: \u0111ang ho\u1EA1t \u0111\u1ED9ng, Suspended: t\u1EA1m ng\u01B0ng, Expired: h\u1EBFt h\u1EA1n)." data-tooltip-title="Tr\u1EA1ng Th\xE1i Kh\xF3a">Tr\u1EA1ng Th\xE1i</th>
                    <th class="px-5 py-3 text-right" data-tooltip="C\xE1c thao t\xE1c qu\u1EA3n tr\u1ECB nhanh: Gia h\u1EA1n th\u1EDDi gian s\u1EED d\u1EE5ng ho\u1EB7c Thu h\u1ED3i/K\xEDch ho\u1EA1t l\u1EA1i kh\xF3a." data-tooltip-title="Thao T\xE1c Qu\u1EA3n Tr\u1ECB">H\xE0nh \u0110\u1ED9ng</th>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">Qu\u1EA3n L\xFD C\xF4ng Ty & T\u1ED5 Ch\u1EE9c</h1>
              <p class="text-xs text-zinc-400 mt-1">Qu\u1EA3n l\xFD c\xE1c c\xF4ng ty con, h\u1EA1n m\u1EE9c s\u1ED1 l\u01B0\u1EE3ng m\xE1y, c\u1EA5u h\xECnh b\u1EA3o m\u1EADt che gi\u1EA5u doanh thu</p>
            </div>
            <button onclick="openAddCompanyModal()" data-tooltip="T\u1EA1o h\u1ED3 s\u01A1 c\xF4ng ty \u0111\u1ED1i t\xE1c m\u1EDBi \u0111\u1EC3 c\u1EA5p ph\xE1t license v\xE0 g\xE1n m\xE1y tr\u1EA1m." data-tooltip-title="T\u1EA1o T\u1ED5 Ch\u1EE9c M\u1EDBi" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              <span>Th\xEAm C\xF4ng Ty M\u1EDBi</span>
            </button>
          </div>

          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="T\xEAn th\u01B0\u01A1ng m\u1EA1i c\u1EE7a ph\xE1p nh\xE2n ho\u1EB7c studio \u0111\u1ED1i t\xE1c." data-tooltip-title="T\xEAn Doanh Nghi\u1EC7p">T\xEAn C\xF4ng Ty</th>
                    <th class="px-5 py-3" data-tooltip="M\xE3 ti\u1EC1n t\u1ED1 vi\u1EBFt t\u1EAFt duy nh\u1EA5t ph\xE2n bi\u1EC7t gi\u1EEFa c\xE1c c\xF4ng ty trong h\u1EC7 sinh th\xE1i." data-tooltip-title="M\xE3 C\xF4ng Ty">M\xE3 \u0110\u1ECBnh Danh (Code)</th>
                    <th class="px-5 py-3" data-tooltip="Kh\xF3a b\u1EA3n quy\u1EC1n (License Key) d\xF9ng k\xEDch ho\u1EA1t v\xE0 ch\u1EA1y ph\u1EA7n m\u1EC1m RETubeMatrix Desktop." data-tooltip-title="M\xE3 License Key">M\xE3 License Key B\u1EA3n Quy\u1EC1n</th>
                    <th class="px-5 py-3" data-tooltip="N\u1EBFu k\xEDch ho\u1EA1t, nh\xE2n vi\xEAn th\xF4ng th\u01B0\u1EDDng (Staff) ch\u1EC9 th\u1EA5y d\u1EEF li\u1EC7u Reup v\xE0 views, to\xE0n b\u1ED9 s\u1ED1 li\u1EC7u ti\u1EC1n USD/VN\u0110 s\u1EBD \u0111\u01B0\u1EE3c b\u1EA3o m\u1EADt tuy\u1EC7t \u0111\u1ED1i." data-tooltip-title="\u1EA8n Doanh Thu Nh\xE2n Vi\xEAn">Quy\u1EC1n \u1EA8n Doanh Thu</th>
                    <th class="px-5 py-3" data-tooltip="Cho ph\xE9p c\xE1c Tr\u01B0\u1EDFng nh\xF3m (Leader) \u0111\u01B0\u1EE3c ki\u1EC3m tra ch\xE9o v\xE0 \u0111\u1ED1i chi\u1EBFu danh s\xE1ch m\xE1y gi\u1EEFa c\xE1c d\u1EF1 \xE1n." data-tooltip-title="H\u1EE3p T\xE1c Ch\xE9o \u0110\u1ED9i Nh\xF3m">H\u1EE3p T\xE1c Ch\xE9o Leader</th>
                    <th class="px-5 py-3" data-tooltip="Tr\u1EA1ng th\xE1i v\u1EADn h\xE0nh c\u1EE7a t\u1ED5 ch\u1EE9c tr\xEAn h\u1EC7 th\u1ED1ng SaaS." data-tooltip-title="Tr\u1EA1ng Th\xE1i">Tr\u1EA1ng Th\xE1i</th>
                    <th class="px-5 py-3 text-right" data-tooltip="\u0110i\u1EC1u ch\u1EC9nh nhanh c\xE1c tham s\u1ED1 b\u1EA3o m\u1EADt v\xE0 ch\xEDnh s\xE1ch \u1EA9n doanh thu." data-tooltip-title="C\u1EA5u H\xECnh Nhanh">T\xF9y Ch\u1ECDn</th>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">Qu\u1EA3n L\xFD Nh\xE2n S\u1EF1 & Ph\xE2n Quy\u1EC1n</h1>
              <p class="text-xs text-zinc-400 mt-1">Qu\u1EA3n l\xFD ng\u01B0\u1EDDi d\xF9ng, ph\xE2n quy\u1EC1n 4 c\u1EA5p b\u1EADc (Owner, Admin, Leader, User) v\xE0 r\xE0ng bu\u1ED9c ph\u1EA7n c\u1EE9ng HWID</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="scrollToPermissionsMatrix(event)" class="px-3.5 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-300 flex items-center gap-2 transition" data-tooltip="Xem b\u1EA3ng ma tr\u1EADn quy\u1EC1n h\u1EA1n chi ti\u1EBFt c\u1EE7a 4 vai tr\xF2 tr\xEAn to\xE0n h\u1EC7 sinh th\xE1i." data-tooltip-title="Ma Tr\u1EADn Quy\u1EC1n H\u1EA1n">
                <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                <span>Ma Tr\u1EADn Ph\xE2n Quy\u1EC1n</span>
              </button>
              <button onclick="openAddUserModal()" data-tooltip="T\u1EA1o t\xE0i kho\u1EA3n th\xE0nh vi\xEAn m\u1EDBi v\xE0 thi\u1EBFt l\u1EADp vai tr\xF2, c\xF4ng ty tr\u1EF1c thu\u1ED9c." data-tooltip-title="Th\xEAm Th\xE0nh Vi\xEAn" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 013 19.235z"/>
                </svg>
                <span>Th\xEAm Th\xE0nh Vi\xEAn M\u1EDBi</span>
              </button>
            </div>
          </div>

          <!-- Filter & Search Toolbar -->
          <div class="glass-card rounded-xl p-4 border border-white/5 flex flex-wrap items-center gap-3">
            <div class="relative flex-1 min-w-[220px]">
              <svg class="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
              <input type="text" id="users-search-input" oninput="filterUsers()" placeholder="T\xECm ki\u1EBFm theo h\u1ECD t\xEAn, email, t\xEAn m\xE1y..." class="w-full pl-9 pr-3 py-2 rounded-lg glass-input text-xs">
            </div>
            <select id="users-filter-company" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[150px]">
              <option value="all">T\u1EA5t c\u1EA3 c\xF4ng ty</option>
            </select>
            <select id="users-filter-role" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[130px]">
              <option value="all">T\u1EA5t c\u1EA3 vai tr\xF2</option>
              <option value="owner">Owner (Ch\u1EE7 s\u1EDF h\u1EEFu)</option>
              <option value="admin">Admin (S\u1EBFp / Qu\u1EA3n tr\u1ECB)</option>
              <option value="leader">Leader (Tr\u01B0\u1EDFng nh\xF3m)</option>
              <option value="user">User (Nh\xE2n vi\xEAn)</option>
            </select>
            <select id="users-filter-hwid" onchange="filterUsers()" class="px-3 py-2 rounded-lg glass-input text-xs min-w-[140px]">
              <option value="all">T\u1EA5t c\u1EA3 m\xE1y</option>
              <option value="bound">\u0110\xE3 kh\xF3a m\xE1y (HWID)</option>
              <option value="unbound">Ch\u01B0a g\u1EAFn m\xE1y</option>
            </select>
            <button onclick="refreshUsers()" data-tooltip="T\u1EA3i l\u1EA1i danh s\xE1ch nh\xE2n s\u1EF1 t\u1EEB m\xE1y ch\u1EE7." data-tooltip-title="T\u1EA3i l\u1EA1i" class="p-2 rounded-lg glass-card hover:bg-white/10 text-zinc-300">
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
                    <th class="px-5 py-3">Th\xE0nh Vi\xEAn</th>
                    <th class="px-5 py-3">C\xF4ng Ty</th>
                    <th class="px-5 py-3">Vai Tr\xF2</th>
                    <th class="px-5 py-3">Thi\u1EBFt B\u1ECB (HWID)</th>
                    <th class="px-5 py-3">Tr\u1EA1ng Th\xE1i</th>
                    <th class="px-5 py-3">Ng\xE0y T\u1EA1o</th>
                    <th class="px-5 py-3 text-right">Thao T\xE1c</th>
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
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase font-mono">B\u1EA3o M\u1EADt C\u1EA5p Cao</span>
                  <h2 class="text-lg font-bold text-white tracking-tight">Ma Tr\u1EADn Ph\xE2n Quy\u1EC1n 4 C\u1EA5p B\u1EADc (Permissions Matrix)</h2>
                </div>
                <p class="text-xs text-zinc-400 mt-1">Quy \u0111\u1ECBnh chi ti\u1EBFt ph\u1EA1m vi quy\u1EC1n h\u1EA1n v\xE0 ranh gi\u1EDBi b\u1EA3o m\u1EADt t\xE0i nguy\xEAn gi\u1EEFa Owner, Admin, Leader v\xE0 User</p>
              </div>
            </div>

            <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-white/[0.03] text-zinc-300 font-mono text-[11px] border-b border-white/5">
                    <tr>
                      <th class="px-5 py-3.5 w-1/3">Quy\u1EC1n H\u1EA1n & T\xEDnh N\u0103ng H\u1EC7 Th\u1ED1ng</th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          <span>Master Owner</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                          <span>Admin (S\u1EBFp)</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>Leader (Qu\u1EA3n L\xFD)</span>
                        </div>
                      </th>
                      <th class="px-4 py-3.5 text-center">
                        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>User (Nh\xE2n Vi\xEAn)</span>
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
                          <span>\u0110\u0103ng nh\u1EADp m\u1ECDi m\xE1y (Bypass HWID)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">T\u1EF1 do \u0111\u0103ng nh\u1EADp b\u1EA5t k\u1EF3 m\xE1y t\xEDnh n\xE0o, kh\xF4ng b\u1ECB r\xE0ng bu\u1ED9c c\u1EE9ng 1 M\xE1y = 1 T\xE0i Kho\u1EA3n</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 C\xF3 (Bypass)</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF3a 1 M\xE1y</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF3a 1 M\xE1y</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF3a 1 M\xE1y</span>
                      </td>
                    </tr>

                    <!-- Row 2: License Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                          <span>C\u1EA5p / Gia h\u1EA1n / Thu h\u1ED3i License Key</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Sinh m\xE3 license m\u1EDBi, c\u1EA5u h\xECnh s\u1ED1 m\xE1y t\u1ED1i \u0111a, k\xEDch ho\u1EA1t ho\u1EB7c thu h\u1ED3i license</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 To\xE0n quy\u1EC1n</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Ch\u1EC9 xem n\u1ED9i b\u1ED9</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                    </tr>

                    <!-- Row 3: Company Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                          <span>T\u1EA1o / S\u1EEDa / X\xF3a C\xF4ng ty & T\u1ED5 ch\u1EE9c</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Kh\u1EDFi t\u1EA1o c\xF4ng ty chi nh\xE1nh, s\u1EEDa th\xF4ng tin, \u0111\u1EB7t m\xE3 \u0111\u1ECBnh danh, t\u1EA1m kh\xF3a ho\u1EB7c x\xF3a b\u1ECF</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 To\xE0n quy\u1EC1n</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">S\u1EEDa c\u1EA5u h\xECnh cty</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                    </tr>

                    <!-- Row 4: Personnel Management -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                          <span>Qu\u1EA3n l\xFD Nh\xE2n s\u1EF1 (Th\xEAm / S\u1EEDa Role / X\xF3a)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">T\u1EA1o t\xE0i kho\u1EA3n, th\u0103ng/h\u1EA1 c\u1EA5p vai tr\xF2, chuy\u1EC3n c\xF4ng ty, x\xF3a th\xE0nh vi\xEAn, unbind HWID</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 To\xE0n quy\u1EC1n m\u1ECDi role</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 Leader & User</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Theo d\xF5i nh\xF3m</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                    </tr>

                    <!-- Row 5: HWID Reset Approval -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          <span>Ph\xEA duy\u1EC7t \u0111\u01A1n \u0111\u1ED5i m\xE1y HWID</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">X\xE9t duy\u1EC7t c\xE1c \u0111\u01A1n \u0111\u1ED5i m\xE1y do n\xE2ng c\u1EA5p ph\u1EA7n c\u1EE9ng, h\u1ECFng m\xE1y ho\u1EB7c chuy\u1EC3n giao c\xF4ng vi\u1EC7c</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 Duy\u1EC7t to\xE0n b\u1ED9</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 Duy\u1EC7t trong cty</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">X\xE1c nh\u1EADn s\u01A1 b\u1ED9</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Ch\u1EC9 g\u1EEDi y\xEAu c\u1EA7u</span>
                      </td>
                    </tr>

                    <!-- Row 6: Revenue Visibility -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                          <span>Xem doanh thu th\u1EF1c t\u1EBF YouTube Studio (USD / VN\u0110)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">S\u1ED1 li\u1EC7u doanh thu th\u1EF1c t\u1EBF, RPM, CPM h\xE0ng ng\xE0y t\u1EF1 \u0111\u1ED9ng \u0111\u1ED3ng b\u1ED9 t\u1EEB Studio</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 100% Doanh thu</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 100% Cty m\xECnh</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">K\xEAnh ph\u1EE5 tr\xE1ch</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/20">\u2715 Kh\xF4ng hi\u1EC3n th\u1ECB</span>
                      </td>
                    </tr>

                    <!-- Row 7: Cross Leader Collaboration -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                          <span>Xem ch\xE9o kho Key & \u0110\u1EC1 xu\u1EA5t (Cross-Leader)</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">Tra c\u1EE9u ch\xE9o kho t\u1EEB kh\xF3a, k\xEAnh \u0111\u1ED1i th\u1EE7 v\xE0 c\xE1c \u0111\u1EC1 xu\u1EA5t gi\u1EEFa c\xE1c \u0111\u1ED9i nh\xF3m \u0111\u1EC3 tr\xE1nh tr\xF9ng l\u1EB7p</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 To\xE0n quy\u1EC1n</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 To\xE0n quy\u1EC1n</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 C\xF3 (N\u1EBFu cty b\u1EADt)</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400">\u2715 Kh\xF4ng</span>
                      </td>
                    </tr>

                    <!-- Row 8: Core Video Operations -->
                    <tr class="hover:bg-white/[0.02]">
                      <td class="px-5 py-3.5">
                        <div class="font-medium text-white flex items-center gap-2">
                          <span class="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                          <span>V\u1EADn h\xE0nh C\xE0o & Reup Video</span>
                        </div>
                        <div class="text-[11px] text-zinc-400 mt-0.5">T\u1EA3i video \u0111a lu\u1ED3ng, AI Rewrite Transcript, Render FFmpeg l\xE1ch b\u1EA3n quy\u1EC1n, Upload Multi-Profile</div>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 \u0110\u1EA7y \u0111\u1EE7</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 \u0110\u1EA7y \u0111\u1EE7</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 \u0110\u1EA7y \u0111\u1EE7</span>
                      </td>
                      <td class="px-4 py-3.5 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">\u2713 \u0110\u1EA7y \u0111\u1EE7</span>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">Kh\xF3a Ph\u1EA7n C\u1EE9ng & Duy\u1EC7t \u0110\u1ED5i M\xE1y (HWID)</h1>
              <p class="text-xs text-zinc-400 mt-1">C\u01A1 ch\u1EBF b\u1EA3o v\u1EC7 1 M\xE1y = 1 T\xE0i Kho\u1EA3n, ng\u0103n ch\u1EB7n chia s\u1EBB l\u1EADu v\xE0 x\xE9t duy\u1EC7t y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y</p>
            </div>
            <button onclick="refreshDevices()" data-tooltip="T\u1EA3i l\u1EA1i danh s\xE1ch thi\u1EBFt b\u1ECB v\xE0 h\xE0ng \u0111\u1EE3i \u0111\u1ED5i m\xE1y m\u1EDBi nh\u1EA5t t\u1EEB Cloudflare D1." data-tooltip-title="\u0110\u1ED3ng B\u1ED9 Thi\u1EBFt B\u1ECB" class="px-3.5 py-1.5 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2 transition">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <span>L\xE0m M\u1EDBi Danh S\xE1ch</span>
            </button>
          </div>

          <!-- Pending Resets Section -->
          <div class="glass-card rounded-xl border border-amber-500/20 overflow-hidden">
            <div class="px-5 py-3.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <h3 class="text-xs font-semibold text-amber-200 uppercase tracking-wider font-mono">Y\xEAu C\u1EA7u \u0110\u1ED5i M\xE1y \u0110ang Ch\u1EDD Duy\u1EC7t (Pending Resets)</h3>
              </div>
              <span id="pending-reset-count-badge" class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300">0 Y\xEAu c\u1EA7u</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="T\xE0i kho\u1EA3n nh\xE2n vi\xEAn ph\xE1t sinh y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y t\xEDnh l\xE0m vi\u1EC7c." data-tooltip-title="Nh\xE2n Vi\xEAn Y\xEAu C\u1EA7u">Nh\xE2n Vi\xEAn / Email</th>
                    <th class="px-5 py-3" data-tooltip="\u0110\u01A1n v\u1ECB ch\u1EE7 qu\u1EA3n c\u1EE7a nh\xE2n vi\xEAn g\u1EEDi y\xEAu c\u1EA7u." data-tooltip-title="C\xF4ng Ty">C\xF4ng Ty</th>
                    <th class="px-5 py-3" data-tooltip="Nguy\xEAn nh\xE2n thay \u0111\u1ED5i ph\u1EA7n c\u1EE9ng do nh\xE2n vi\xEAn khai b\xE1o (v\xED d\u1EE5: h\u1ECFng m\xE1y, n\xE2ng c\u1EA5p CPU, c\xE0i l\u1EA1i Win)." data-tooltip-title="L\xFD Do Thay \u0110\u1ED5i">L\xFD Do \u0110\u1ED5i M\xE1y</th>
                    <th class="px-5 py-3" data-tooltip="Chu\u1ED7i hash ph\u1EA7n c\u1EE9ng (SHA-256 k\u1EBFt h\u1EE3p CPU ID, Motherboard UUID, MAC Address) c\u1EE7a m\xE1y m\u1EDBi." data-tooltip-title="M\xE3 HWID M\xE1y M\u1EDBi">M\xE3 HWID M\xE1y M\u1EDBi</th>
                    <th class="px-5 py-3" data-tooltip="Th\u1EDDi \u0111i\u1EC3m nh\xE2n vi\xEAn k\xEDch ho\u1EA1t \u1EE9ng d\u1EE5ng tr\xEAn m\xE1y m\u1EDBi v\xE0 g\u1EEDi \u0111\u01A1n ch\u1EDD duy\u1EC7t." data-tooltip-title="Th\u1EDDi \u0110i\u1EC3m G\u1EEDi">Th\u1EDDi Gian G\u1EEDi</th>
                    <th class="px-5 py-3 text-right" data-tooltip="Thao t\xE1c x\xE9t duy\u1EC7t: Ph\xEA duy\u1EC7t gi\u1EA3i ph\xF3ng m\xE1y c\u0169; T\u1EEB ch\u1ED1i ch\u1EB7n m\xE1y m\u1EDBi." data-tooltip-title="X\xE9t Duy\u1EC7t \u0110\u1ED5i M\xE1y">Quy\u1EBFt \u0110\u1ECBnh</th>
                  </tr>
                </thead>
                <tbody id="pending-resets-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <tr>
                    <td colspan="6" class="px-5 py-6 text-center text-zinc-500">Kh\xF4ng c\xF3 y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y n\xE0o \u0111ang ch\u1EDD duy\u1EC7t.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Active Bound Devices Section -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
              <h3 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Danh S\xE1ch M\xE1y \u0110ang Kh\xF3a R\xE0ng Bu\u1ED9c (Active Bound Devices)</h3>
              <span id="total-bound-devices-count" class="text-xs text-zinc-400 font-mono">0 thi\u1EBFt b\u1ECB</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="T\xEAn m\xE1y tr\u1EA1m (Hostname) ghi nh\u1EADn t\u1EEB h\u1EC7 \u0111i\u1EC1u h\xE0nh Windows." data-tooltip-title="T\xEAn M\xE1y Tr\u1EA1m">T\xEAn M\xE1y T\xEDnh</th>
                    <th class="px-5 py-3" data-tooltip="Nh\xE2n vi\xEAn duy nh\u1EA5t \u0111ang \u0111\u01B0\u1EE3c g\u1EAFn \u0111\u1ED9c quy\u1EC1n v\xE0o ph\u1EA7n c\u1EE9ng m\xE1y n\xE0y." data-tooltip-title="Ng\u01B0\u1EDDi D\xF9ng G\u1EAFn Li\u1EC1n">Ng\u01B0\u1EDDi S\u1EED D\u1EE5ng</th>
                    <th class="px-5 py-3" data-tooltip="Chi nh\xE1nh ho\u1EB7c t\u1ED5 ch\u1EE9c qu\u1EA3n l\xFD thi\u1EBFt b\u1ECB n\xE0y." data-tooltip-title="C\xF4ng Ty">C\xF4ng Ty</th>
                    <th class="px-5 py-3" data-tooltip="Phi\xEAn b\u1EA3n OS v\xE0 m\xF4i tr\u01B0\u1EDDng v\u1EADn h\xE0nh \u1EE9ng d\u1EE5ng (Windows 10/11)." data-tooltip-title="H\u1EC7 \u0110i\u1EC1u H\xE0nh">H\u1EC7 \u0110i\u1EC1u H\xE0nh</th>
                    <th class="px-5 py-3" data-tooltip="M\xE3 b\u0103m \u0111\u1ECBnh danh ph\u1EA7n c\u1EE9ng duy nh\u1EA5t: CPU ID + Bo m\u1EA1ch ch\u1EE7 + \u1ED4 c\u1EE9ng ch\xEDnh." data-tooltip-title="HWID Hash Ph\u1EA7n C\u1EE9ng">HWID Hash</th>
                    <th class="px-5 py-3" data-tooltip="\u0110\u1ECBa ch\u1EC9 IP WAN ghi nh\u1EADn khi m\xE1y tr\u1EA1m g\u1EEDi t\xEDn hi\u1EC7u Heartbeat g\u1EA7n nh\u1EA5t." data-tooltip-title="\u0110\u1ECBa Ch\u1EC9 IP M\u1EA1ng">IP L\u1EA7n Cu\u1ED1i</th>
                    <th class="px-5 py-3" data-tooltip="Th\u1EDDi gian m\xE1y tr\u1EA1m g\u1EEDi t\xEDn hi\u1EC7u ki\u1EC3m tra b\u1EA3n quy\u1EC1n g\u1EA7n nh\u1EA5t." data-tooltip-title="T\xEDn Hi\u1EC7u G\u1EA7n Nh\u1EA5t">Ho\u1EA1t \u0110\u1ED9ng Cu\u1ED1i</th>
                    <th class="px-5 py-3 text-right" data-tooltip="H\u1EE7y r\xE0ng bu\u1ED9c ph\u1EA7n c\u1EE9ng: Gi\u1EA3i ph\xF3ng m\xE1y \u0111\u1EC3 t\xE1i c\u1EA5p ph\xE1t cho nh\xE2n vi\xEAn kh\xE1c." data-tooltip-title="Qu\u1EA3n Tr\u1ECB Thi\u1EBFt B\u1ECB">X\u1EED L\xFD</th>
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
              <h1 class="text-2xl font-bold text-white tracking-tight">K\xEAnh & Doanh Thu Chi Ti\u1EBFt</h1>
              <p class="text-xs text-zinc-400 mt-1">Theo d\xF5i s\u1ED1 l\u01B0\u1EE3t views, th\u1EDDi l\u01B0\u1EE3ng xem v\xE0 doanh thu t\u1EEB YouTube Studio \u0111\xEDch</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="setAnalyticsDateFilter('today')" id="btn-filter-today" data-tooltip="Xem d\u1EEF li\u1EC7u ph\xE1t sinh trong 24 gi\u1EDD qua." data-tooltip-title="Th\u1EDDi Gian: H\xF4m Nay" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium transition">H\xF4m nay</button>
              <button onclick="setAnalyticsDateFilter('7d')" id="btn-filter-7d" data-tooltip="Xem t\u1ED5ng h\u1EE3p d\u1EEF li\u1EC7u 7 ng\xE0y g\u1EA7n nh\u1EA5t." data-tooltip-title="Th\u1EDDi Gian: 7 Ng\xE0y" class="px-3 py-1.5 rounded-lg glass-card hover:bg-white/10 text-zinc-300 text-xs font-medium transition">7 Ng\xE0y Qua</button>
              <button onclick="setAnalyticsDateFilter('30d')" id="btn-filter-30d" data-tooltip="Xem to\xE0n b\u1ED9 s\u1ED1 li\u1EC7u ph\xE1t sinh trong th\xE1ng hi\u1EC7n t\u1EA1i." data-tooltip-title="Th\u1EDDi Gian: Th\xE1ng N\xE0y" class="px-3 py-1.5 rounded-lg glass-card hover:bg-white/10 text-zinc-300 text-xs font-medium transition">Th\xE1ng N\xE0y</button>
            </div>
          </div>

          <!-- Channel Revenue Table -->
          <div class="glass-card rounded-xl border border-white/5 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th class="px-5 py-3" data-tooltip="K\xEAnh YouTube nh\u1EADn video Reup \u0111\xE3 \u0111\u01B0\u1EE3c b\u1EADt ki\u1EBFm ti\u1EC1n." data-tooltip-title="K\xEAnh \u0110\xEDch">K\xEAnh YouTube</th>
                    <th class="px-5 py-3" data-tooltip="\u0110\u01A1n v\u1ECB \u0111\u01B0\u1EE3c ph\xE2n chia doanh thu c\u1EE7a k\xEAnh n\xE0y." data-tooltip-title="\u0110\u01A1n V\u1ECB Qu\u1EA3n L\xFD">C\xF4ng Ty S\u1EDF H\u1EEFu</th>
                    <th class="px-5 py-3" data-tooltip="Ng\xE0y th\u1ED1ng k\xEA s\u1ED1 li\u1EC7u hi\u1EC7u su\u1EA5t v\xE0 t\xE0i ch\xEDnh." data-tooltip-title="Ng\xE0y B\xE1o C\xE1o">Ng\xE0y</th>
                    <th class="px-5 py-3" data-tooltip="T\u1ED5ng s\u1ED1 l\u01B0\u1EE3t xem video k\xEAnh \u0111\u1EA1t \u0111\u01B0\u1EE3c trong ng\xE0y." data-tooltip-title="L\u01B0\u1EE3t Xem (Views)">L\u01B0\u1EE3t Xem</th>
                    <th class="px-5 py-3" data-tooltip="T\u1ED5ng s\u1ED1 gi\u1EDD xem video t\xEDch l\u0169y trong ng\xE0y." data-tooltip-title="Gi\u1EDD Xem T\xEDch L\u0169y">Gi\u1EDD Xem</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu th\u1EF1c t\u1EBF tr\xEAn m\u1ED7i 1,000 l\u01B0\u1EE3t xem sau khi tr\u1EEB ph\xED n\u1EC1n t\u1EA3ng YouTube." data-tooltip-title="Ch\u1EC9 S\u1ED1 RPM">RPM</th>
                    <th class="px-5 py-3" data-tooltip="Chi ph\xED m\u1ED7i 1,000 l\u01B0\u1EE3t hi\u1EC3n th\u1ECB qu\u1EA3ng c\xE1o m\xE0 nh\xE0 t\xE0i tr\u1EE3 tr\u1EA3 cho YouTube." data-tooltip-title="Ch\u1EC9 S\u1ED1 CPM">CPM</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu \u01B0\u1EDBc t\xEDnh theo \u0111\xF4 la M\u1EF9 trong ng\xE0y do YouTube Analytics ghi nh\u1EADn." data-tooltip-title="Doanh Thu USD">Doanh Thu (USD)</th>
                    <th class="px-5 py-3" data-tooltip="Doanh thu \u01B0\u1EDBc t\xEDnh quy \u0111\u1ED5i sang \u0111\u1ED3ng Vi\u1EC7t Nam ph\u1EE5c v\u1EE5 \u0111\u1ED1i so\xE1t thanh to\xE1n n\u1ED9i b\u1ED9." data-tooltip-title="Doanh Thu VN\u0110">Doanh Thu (VN\u0110)</th>
                  </tr>
                </thead>
                <tbody id="analytics-table-tbody" class="divide-y divide-white/5 text-zinc-300">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <!-- TAB: B\xC1O C\xC1O C\xD4NG VI\u1EC6C & CHI TI\u1EBET \u0110\u1ED8I NG\u0168 -->
        <section id="tab-work-reports" class="tab-pane hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Chi Ti\u1EBFt C\xF4ng Vi\u1EC7c & B\xE1o C\xE1o Hi\u1EC7u Su\u1EA5t \u0110\u1ED9i Ng\u0169</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">Work Telemetry</span>
              </h2>
              <p class="text-xs text-zinc-400 mt-1">Theo d\xF5i s\u1ED1 l\u01B0\u1EE3ng k\xEAnh \u0111\xEDch, k\xEAnh test, k\xEAnh \u0111\u1ED1i th\u1EE7 \u0111ang c\xE0o, ph\xE2n t\xEDch 5 video g\u1EA7n nh\u1EA5t, t\u1EF7 l\u1EC7 BKT xanh/\u0111\u1ECF v\xE0 b\u1EA3ng x\u1EBFp h\u1EA1ng nh\xE2n s\u1EF1</p>
            </div>
            <button onclick="loadWorkReports()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              <span>L\xE0m M\u1EDBi B\xE1o C\xE1o</span>
            </button>
          </div>

          <!-- KPI Cards Work Reports -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">K\xEAnh \u0110\xEDch \u0110ang V\u1EADn H\xE0nh</p>
              <h3 id="wr-total-target-channels" class="text-2xl font-bold text-white mt-1">0</h3>
              <p class="text-[11px] text-emerald-400 mt-1">\u0110\u01B0\u1EE3c g\xE1n cho nh\xE2n s\u1EF1 qu\u1EA3n l\xFD</p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">K\xEAnh \u0110\u1ED1i Th\u1EE7 Theo D\xF5i</p>
              <h3 id="wr-total-competitors" class="text-2xl font-bold text-white mt-1">0</h3>
              <p class="text-[11px] text-indigo-400 mt-1">\u0110ang c\xE0o d\u1EEF li\u1EC7u & ph\xE2n t\xEDch</p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Test BKT (Xanh / \u0110\u1ECF)</p>
              <h3 id="wr-total-bkt" class="text-2xl font-bold text-white mt-1">0 / 0</h3>
              <p class="text-[11px] text-zinc-400 mt-1">T\u1EF7 l\u1EC7 s\u1EA1ch: <span id="wr-bkt-rate" class="text-emerald-400 font-bold">100%</span></p>
            </div>
            <div class="glass-card p-5 rounded-2xl relative overflow-hidden">
              <p class="text-xs text-zinc-400 font-medium">Video \u0110\xE3 \u0110\u0103ng H\xF4m Nay</p>
              <h3 id="wr-total-uploads-today" class="text-2xl font-bold text-amber-400 mt-1">0 video</h3>
              <p class="text-[11px] text-zinc-400 mt-1">Xu\u1EA5t b\u1EA3n l\xEAn k\xEAnh \u0111\xEDch</p>
            </div>
          </div>

          <!-- B\u1EA3ng 1: B\u1EA3ng X\u1EBFp H\u1EA1ng Nh\xE2n S\u1EF1 Xu\u1EA5t S\u1EAFc (Leaderboard) -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.003 0V7.875a3.375 3.375 0 00-6.75 0v6.5m6.75 0h-6.75"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">B\u1EA3ng X\u1EBFp H\u1EA1ng Nh\xE2n S\u1EF1 Xu\u1EA5t S\u1EAFc (Top Performers)</h3>
              </div>
              <span class="text-xs text-zinc-400">X\u1EBFp h\u1EA1ng theo s\u1ED1 k\xEAnh \u0111\xEDch, l\u01B0\u1EE3t xem & doanh thu \u0111\xF3ng g\xF3p</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">H\u1EA1ng</th>
                    <th class="px-5 py-3">Nh\xE2n S\u1EF1</th>
                    <th class="px-5 py-3">C\xF4ng Ty</th>
                    <th class="px-5 py-3 text-center">K\xEAnh \u0110\xEDch</th>
                    <th class="px-5 py-3 text-center">\u0110\u0103ng H\xF4m Nay</th>
                    <th class="px-5 py-3">T\u1ED5ng View</th>
                    <th class="px-5 py-3">Doanh Thu \u01AF\u1EDBc T\xEDnh</th>
                    <th class="px-5 py-3 text-center">T\u1EF7 L\u1EC7 BKT S\u1EA1ch</th>
                  </tr>
                </thead>
                <tbody id="wr-leaderboard-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="8" class="text-center py-8 text-zinc-500">\u0110ang t\u1EA3i b\u1EA3ng x\u1EBFp h\u1EA1ng...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- B\u1EA3ng 2: So S\xE1nh \u0110\u1ED1i \u0110\u1EA7u Gi\u1EEFa C\xE1c Team Leader -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">So S\xE1nh \u0110\u1ED1i \u0110\u1EA7u Gi\u1EEFa C\xE1c \u0110\u1ED9i Nh\xF3m (Team Leaders)</h3>
              </div>
              <span class="text-xs text-zinc-400">T\u1EF1 \u0111\u1ED9ng \u0111\xE1nh gi\xE1 ch\u1EA5t l\u01B0\u1EE3ng d\u1EF1a tr\xEAn t\u1ED5ng doanh thu & t\u1EF7 l\u1EC7 BKT s\u1EA1ch</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">\u0110\u1ED9i Nh\xF3m (Team)</th>
                    <th class="px-5 py-3">Tr\u01B0\u1EDFng Nh\xF3m</th>
                    <th class="px-5 py-3 text-center">Th\xE0nh Vi\xEAn</th>
                    <th class="px-5 py-3 text-center">K\xEAnh \u0110\xEDch</th>
                    <th class="px-5 py-3 text-center">\u0110\u0103ng H\xF4m Nay</th>
                    <th class="px-5 py-3">T\u1ED5ng View</th>
                    <th class="px-5 py-3">Doanh Thu (VND)</th>
                    <th class="px-5 py-3 text-center">BKT S\u1EA1ch</th>
                    <th class="px-5 py-3 text-center">\u0110\xE1nh Gi\xE1</th>
                  </tr>
                </thead>
                <tbody id="wr-teams-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="9" class="text-center py-8 text-zinc-500">\u0110ang \u0111\u1ED1i chi\u1EBFu d\u1EEF li\u1EC7u gi\u1EEFa c\xE1c \u0111\u1ED9i nh\xF3m...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- B\u1EA3ng 3: Chi Ti\u1EBFt C\xF4ng Vi\u1EC7c & K\xEAnh \u0110\u1ED1i Th\u1EE7 T\u1EEBng Nh\xE2n S\u1EF1 -->
          <div class="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"/>
                </svg>
                <h3 class="text-sm font-bold text-white uppercase tracking-wider">Chi Ti\u1EBFt T\xE1c V\u1EE5 T\u1EEBng Nh\xE2n S\u1EF1 & K\xEAnh \u0110\u1ED1i Th\u1EE7 \u0110ang C\xE0o</h3>
              </div>
              <span class="text-xs text-zinc-400">Xem URL k\xEAnh \u0111\u1ED1i th\u1EE7, t\u1EEB kh\xF3a ng\xE1ch & 5 video m\u1EDBi nh\u1EA5t</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-white/[0.02] text-zinc-400 uppercase tracking-wider border-b border-white/5 font-semibold">
                  <tr>
                    <th class="px-5 py-3">Nh\xE2n S\u1EF1</th>
                    <th class="px-5 py-3">C\xF4ng Ty</th>
                    <th class="px-5 py-3">K\xEAnh \u0110\xEDch & Test</th>
                    <th class="px-5 py-3">K\xEAnh \u0110\u1ED1i Th\u1EE7 \u0110ang Gi\xE1m S\xE1t</th>
                    <th class="px-5 py-3">S\u1EA3n L\u01B0\u1EE3ng \u0110\u0103ng</th>
                    <th class="px-5 py-3">BKT (Xanh/\u0110\u1ECF)</th>
                    <th class="px-5 py-3 text-right">Chi Ti\u1EBFt 5 Video</th>
                  </tr>
                </thead>
                <tbody id="wr-staff-tbody" class="divide-y divide-white/5">
                  <tr><td colspan="7" class="text-center py-8 text-zinc-500">\u0110ang t\u1EA3i danh s\xE1ch t\xE1c v\u1EE5 nh\xE2n s\u1EF1...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>


        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        



        <!-- =================== TAB 7: WORK REPORTS & TEAM ANALYTICS =================== -->
        

      </main>
    </div>

    <!-- MODAL: C\u1EA4P LICENSE M\u1EDAI -->
    <div id="modal-issue-license" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">C\u1EA5p License M\u1EDBi</h3>
          </div>
          <button onclick="closeIssueLicenseModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleIssueLicenseSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">G\xE1n Cho C\xF4ng Ty</label>
            <select id="modal-license-company" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">G\xF3i B\u1EA3n Quy\u1EC1n (Tier)</label>
              <select id="modal-license-tier" onchange="autoConfigureSeatsByTier()" data-tooltip="Enterprise: V\xF4 h\u1EA1n m\xE1y; Pro: 10 m\xE1y; Trial: 3 m\xE1y d\xF9ng th\u1EED." data-tooltip-title="C\u1EA5p Ph\xE2n H\u1EA1ng" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
                <option value="enterprise">Enterprise (Doanh Nghi\u1EC7p)</option>
                <option value="pro" selected>Professional (Ti\xEAu Chu\u1EA9n)</option>
                <option value="trial">Trial (D\xF9ng Th\u1EED)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">S\u1ED1 M\xE1y T\u1ED1i \u0110a (Seats)</label>
              <input type="number" id="modal-license-seats" min="1" max="9999" value="10" required data-tooltip="S\u1ED1 l\u01B0\u1EE3ng m\xE1y t\xEDnh t\u1ED1i \u0111a c\xF3 th\u1EC3 k\xEDch ho\u1EA1t song song c\xF9ng l\xFAc." data-tooltip-title="H\u1EA1n M\u1EE9c M\xE1y Tr\u1EA1m" class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono">
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Th\u1EDDi H\u1EA1n S\u1EED D\u1EE5ng</label>
            <select id="modal-license-duration" data-tooltip="Th\u1EDDi gian hi\u1EC7u l\u1EF1c tr\u01B0\u1EDBc khi m\xE3 License b\u1ECB kh\xF3a t\u1EF1 \u0111\u1ED9ng." data-tooltip-title="Th\u1EDDi H\u1EA1n B\u1EA3n Quy\u1EC1n" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="30">30 Ng\xE0y (1 Th\xE1ng)</option>
              <option value="90">90 Ng\xE0y (3 Th\xE1ng)</option>
              <option value="365" selected>365 Ng\xE0y (1 N\u0103m)</option>
              <option value="3650">V\u0129nh Vi\u1EC5n (10 N\u0103m)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">M\xE3 License T\u1EF1 Sinh</label>
            <div class="flex items-center gap-2">
              <input type="text" id="modal-license-preview-key" readonly class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono text-indigo-400 bg-black/40">
              <button type="button" onclick="regeneratePreviewKey()" data-tooltip="T\u1EA1o chu\u1ED7i ng\u1EABu nhi\xEAn m\u1EDBi cho m\xE3 License Key." data-tooltip-title="T\u1EA1o L\u1EA1i M\xE3" class="px-3 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-300 transition">
                \u0110\u1ED5i
              </button>
            </div>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeIssueLicenseModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" id="btn-submit-issue-license" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-2">
              <span>X\xE1c Nh\u1EADn C\u1EA5p Key</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: TH\xCAM C\xD4NG TY M\u1EDAI -->
    <div id="modal-add-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <h3 class="text-base font-bold text-white">Th\xEAm C\xF4ng Ty M\u1EDBi</h3>
          <button onclick="closeAddCompanyModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleAddCompanySubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">T\xEAn C\xF4ng Ty / Studio</label>
            <input type="text" id="modal-company-name" required placeholder="V\xED d\u1EE5: Alpha Media Global" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">M\xE3 C\xF4ng Ty (Company Code)</label>
            <input type="text" id="modal-company-code" required placeholder="ALPHA-MEDIA" class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono uppercase">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">G\xF3i B\u1EA3n Quy\u1EC1n Kh\u1EDFi T\u1EA1o</label>
            <select id="modal-company-tier" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="pro" selected>G\xF3i Pro (10 M\xE1y Tr\u1EA1m - 1 N\u0103m)</option>
              <option value="enterprise">G\xF3i Enterprise (V\xF4 H\u1EA1n M\xE1y - V\u0129nh Vi\u1EC5n)</option>
              <option value="trial">G\xF3i Trial (3 M\xE1y - 14 Ng\xE0y D\xF9ng Th\u1EED)</option>
            </select>
          </div>
          <div class="space-y-2 pt-2">
            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer" data-tooltip="Khi b\u1EADt, to\xE0n b\u1ED9 nh\xE2n vi\xEAn c\xF4ng ty n\xE0y s\u1EBD kh\xF4ng th\u1EA5y tab v\xE0 s\u1ED1 li\u1EC7u doanh thu USD/VND." data-tooltip-title="B\u1EA3o M\u1EADt Doanh Thu">
              <input type="checkbox" id="modal-company-mask-rev" class="rounded bg-zinc-800 border-white/10 text-indigo-600 focus:ring-0">
              <span>Che gi\u1EA5u t\u1ED5ng doanh thu v\u1EDBi nh\xE2n vi\xEAn (Staff)</span>
            </label>
            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer" data-tooltip="T\u1EA1o \u0111i\u1EC1u ki\u1EC7n \u0111\u1EC3 c\xE1c \u0111\u1ED9i nh\xF3m Leader h\u1ED7 tr\u1EE3 v\xE0 ph\u1ED1i h\u1EE3p t\xE0i nguy\xEAn m\xE1y v\u1EDBi nhau." data-tooltip-title="H\u1EE3p T\xE1c \u0110\u1ED9i Nh\xF3m">
              <input type="checkbox" id="modal-company-cross-collab" checked class="rounded bg-zinc-800 border-white/10 text-indigo-600 focus:ring-0">
              <span>Cho ph\xE9p Leader chia s\u1EBB \u0111\u1ED1i chi\u1EBFu key v\u1EDBi nhau</span>
            </label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAddCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition">T\u1EA1o C\xF4ng Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: TH\xCAM TH\xC0NH VI\xCAN M\u1EDAI & C\u1EA4P QUY\u1EC0N -->
    <div id="modal-add-user" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.765z"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">C\u1EA5p T\xE0i Kho\u1EA3n M\u1EDBi & Ph\xE2n Quy\u1EC1n</h3>
          </div>
          <button onclick="closeAddUserModal()" class="p-1 rounded text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onsubmit="handleAddUserSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Email \u0110\u0103ng Nh\u1EADp</label>
            <input type="email" id="modal-user-email" required placeholder="nhanvien@congty.com" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-zinc-300">M\u1EADt Kh\u1EA9u Kh\u1EDFi T\u1EA1o</label>
              <button type="button" onclick="generateRandomUserPassword()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                T\u1EA1o Ng\u1EABu Nhi\xEAn
              </button>
            </div>
            <div class="relative">
              <input type="text" id="modal-user-password" required placeholder="T\u1ED1i thi\u1EC3u 6 k\xFD t\u1EF1" class="w-full px-3 py-2 pr-10 rounded-lg glass-input text-xs font-mono">
              <button type="button" onclick="copyToClipboard(document.getElementById('modal-user-password').value)" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1" title="Sao ch\xE9p m\u1EADt kh\u1EA9u">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
            <p class="text-[10px] text-zinc-500 mt-1">M\u1EADt kh\u1EA9u n\xE0y s\u1EBD \u0111\u01B0\u1EE3c c\u1EA5p tr\u1EF1c ti\u1EBFp cho nh\xE2n s\u1EF1 \u0111\u1EC3 \u0111\u0103ng nh\u1EADp \u1EE9ng d\u1EE5ng Desktop.</p>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">H\u1ECD V\xE0 T\xEAn</label>
            <input type="text" id="modal-user-fullname" required placeholder="Nguy\u1EC5n V\u0103n A" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Vai Tr\xF2 & Quy\u1EC1n H\u1EA1n</label>
            <select id="modal-user-role" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically based on caller role -->
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">C\xF4ng Ty Tr\u1EF1c Thu\u1ED9c</label>
            <select id="modal-user-company" onchange="updateModalUserCompanyLicenseHint()" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
            <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>M\xE3 License Key:</span>
              <span id="modal-user-company-lic" class="font-mono text-emerald-400 font-semibold select-all">\u0110ang t\u1EA3i...</span>
            </div>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAddUserModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition">C\u1EA5p T\xE0i Kho\u1EA3n</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: K\u1EBET QU\u1EA2 C\u1EA4P T\xC0I KHO\u1EA2N & M\u1EACT KH\u1EA8U TH\xC0NH C\xD4NG -->
    <div id="modal-account-created" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-emerald-500/30 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div class="flex items-center gap-3 pb-3 border-b border-white/10">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-white">C\u1EA5p T\xE0i Kho\u1EA3n Th\xE0nh C\xF4ng!</h3>
            <p class="text-[11px] text-emerald-400 font-medium">T\xE0i kho\u1EA3n \u0111\xE3 s\u1EB5n s\xE0ng \u0111\u0103ng nh\u1EADp ngay l\u1EADp t\u1EE9c</p>
          </div>
        </div>

        <div class="space-y-3 bg-black/40 rounded-xl p-4 border border-white/5 text-xs font-mono">
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Email:</span>
            <span id="created-acc-email" class="text-white font-bold select-all"></span>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">M\u1EADt kh\u1EA9u:</span>
            <div class="flex items-center gap-1.5">
              <span id="created-acc-pwd" class="text-amber-300 font-bold tracking-wider select-all"></span>
              <button onclick="copyToClipboard(document.getElementById('created-acc-pwd').innerText)" class="p-1 text-zinc-400 hover:text-white" title="Sao ch\xE9p m\u1EADt kh\u1EA9u">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">Vai tr\xF2:</span>
            <span id="created-acc-role" class="text-purple-300 font-bold uppercase"></span>
          </div>
          <div class="flex justify-between items-center py-1 border-b border-white/5">
            <span class="text-zinc-400">C\xF4ng ty:</span>
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
            <span>Sao Ch\xE9p To\xE0n B\u1ED9 Th\xF4ng Tin (G\u1EEDi Nh\xE2n S\u1EF1)</span>
          </button>
          <button type="button" onclick="closeCreatedAccountModal()" class="w-full py-2 rounded-xl glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">
            \u0110\xF3ng
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: G\xC1N TH\xC0NH VI\xCAN V\xC0O C\xD4NG TY -->
    <div id="modal-assign-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.75a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V21"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">G\xE1n Th\xE0nh Vi\xEAn V\xE0o C\xF4ng Ty</h3>
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
            <label class="block text-xs font-medium text-zinc-300 mb-1">Th\xE0nh Vi\xEAn</label>
            <div id="modal-assign-user-info" class="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white font-medium"></div>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Ch\u1ECDn C\xF4ng Ty Tr\u1EF1c Thu\u1ED9c</label>
            <select id="modal-assign-company-select" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>
          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeAssignCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition">L\u01B0u G\xE1n C\xF4ng Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: PH\xC2N QUY\u1EC0N VAI TR\xD2 -->
    <div id="modal-change-role" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Ph\xE2n Quy\u1EC1n Vai Tr\xF2</h3>
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
            <label class="block text-xs font-medium text-zinc-300 mb-1">Th\xE0nh Vi\xEAn</label>
            <div id="modal-role-user-info" class="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white font-medium"></div>
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Ch\u1ECDn Vai Tr\xF2 M\u1EDBi</label>
            <select id="modal-role-select" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically based on permissions -->
            </select>
          </div>
          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeChangeRoleModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition">C\u1EADp Nh\u1EADt Quy\u1EC1n</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: S\u1EECA PH\xC2N QUY\u1EC0N & C\xD4NG TY -->
    <div id="modal-edit-user" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Ch\u1EC9nh S\u1EEDa Quy\u1EC1n & H\u1ED3 S\u01A1</h3>
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
            <label class="block text-xs font-medium text-zinc-300 mb-1">H\u1ECD V\xE0 T\xEAn</label>
            <input type="text" id="modal-edit-user-fullname" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">Vai Tr\xF2 & Quy\u1EC1n H\u1EA1n</label>
            <select id="modal-edit-user-role" class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <option value="user">User (Nh\xE2n vi\xEAn)</option>
              <option value="leader">Leader (Tr\u01B0\u1EDFng nh\xF3m)</option>
              <option value="admin">Admin (Qu\u1EA3n tr\u1ECB vi\xEAn)</option>
              <option value="owner">Owner (Ch\u1EE7 s\u1EDF h\u1EEFu t\u1ED1i cao)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">C\xF4ng Ty Tr\u1EF1c Thu\u1ED9c</label>
            <select id="modal-edit-user-company" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
              <!-- Populated dynamically -->
            </select>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="modal-edit-user-active" class="rounded bg-white/5 border-white/20 text-indigo-600 focus:ring-0">
            <label for="modal-edit-user-active" class="text-xs text-zinc-300 cursor-pointer">T\xE0i kho\u1EA3n \u0111ang ho\u1EA1t \u0111\u1ED9ng (Active)</label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeEditUserModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition">L\u01B0u Thay \u0110\u1ED5i</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: S\u1EECA TH\xD4NG TIN C\xD4NG TY -->
    <div id="modal-edit-company" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl border border-white/10 space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-white/5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-white">Ch\u1EC9nh S\u1EEDa C\xF4ng Ty</h3>
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
            <label class="block text-xs font-medium text-zinc-300 mb-1">T\xEAn C\xF4ng Ty / Studio</label>
            <input type="text" id="modal-edit-company-name" required class="w-full px-3 py-2 rounded-lg glass-input text-xs">
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1">M\xE3 Vi\u1EBFt T\u1EAFt (Company Code)</label>
            <input type="text" id="modal-edit-company-code" required class="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono uppercase">
          </div>

          <div class="space-y-2.5 pt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-mask-rev" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">\u1EA8n doanh thu ti\u1EC1n USD/VN\u0110 \u0111\u1ED1i v\u1EDBi nh\xE2n vi\xEAn (Staff)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-cross-collab" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">Cho ph\xE9p Tr\u01B0\u1EDFng nh\xF3m (Leader) h\u1EE3p t\xE1c ch\xE9o d\u1EF1 \xE1n</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="modal-edit-company-active" class="rounded bg-white/5 border-white/20 text-emerald-600 focus:ring-0">
              <span class="text-xs text-zinc-300">C\xF4ng ty \u0111ang ho\u1EA1t \u0111\u1ED9ng (Active)</span>
            </label>
          </div>

          <div class="pt-3 border-t border-white/5 flex items-center justify-end gap-2">
            <button type="button" onclick="closeEditCompanyModal()" class="px-4 py-2 rounded-lg glass-card hover:bg-white/10 text-xs font-medium text-zinc-400 transition">H\u1EE7y</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition">C\u1EADp Nh\u1EADt C\xF4ng Ty</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: XEM 5 VIDEO G\u1EA6N NH\u1EA4T C\u1EE6A K\xCANH \u0110\u1ED0I TH\u1EE6 -->
    

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
      btn.innerText = '\u0110ang x\xE1c th\u1EF1c...';

      try {
        const res = await fetch('/v1/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || '\u0110\u0103ng nh\u1EADp kh\xF4ng th\xE0nh c\xF4ng');
        }

        authToken = data.token || data.access_token;
        currentUser = data.user;
        localStorage.setItem('rtm_admin_token', authToken);
        if (data.refresh_token) {
          localStorage.setItem('rtm_admin_refresh_token', data.refresh_token);
        }
        localStorage.setItem('rtm_admin_user', JSON.stringify(currentUser));

        showToast('\u0110\u0103ng nh\u1EADp th\xE0nh c\xF4ng', 'success');
        showPortal();
        loadAllData();
      } catch (err) {
        errorEl.innerText = err.message;
        errorEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Truy C\u1EADp H\u1EC7 Th\u1ED1ng</span>';
      }
    }

    function handleLogout() {
      localStorage.removeItem('rtm_admin_token');
      localStorage.removeItem('rtm_admin_refresh_token');
      localStorage.removeItem('rtm_admin_user');
      authToken = null;
      currentUser = null;
      showAuth();
      showToast('\u0110\xE3 \u0111\u0103ng xu\u1EA5t kh\u1ECFi h\u1EC7 th\u1ED1ng', 'info');
    }

    function switchTab(tabName) {
      currentTab = tabName;
      const tabs = ['dashboard', 'licenses', 'companies', 'users', 'work-reports', 'devices', 'analytics'];
      tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        const nav = document.getElementById('nav-' + t);
        if (el) el.classList.toggle('hidden', t !== tabName);
        if (t === 'work-reports' && t === tabName) {
          loadWorkReports();
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
        // C\u1ED1 g\u1EAFng t\u1EF1 \u0111\u1ED9ng refresh token n\u1EBFu c\xF3 refresh_token
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
        throw new Error('Phi\xEAn l\xE0m vi\u1EC7c \u0111\xE3 h\u1EBFt h\u1EA1n');
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
      showToast('\u0110\xE3 l\xE0m m\u1EDBi d\u1EEF li\u1EC7u h\u1EC7 th\u1ED1ng', 'info');
    }

    // =================== RENDER DASHBOARD ===================
    function renderDashboard() {
      const st = systemData.stats;
      if (st.revenue_vnd !== undefined) {
        document.getElementById('kpi-revenue-vnd').innerText = Number(st.revenue_vnd || 0).toLocaleString('vi-VN') + ' \u20AB';
        document.getElementById('kpi-revenue-usd').innerText = '$' + Number(st.revenue_usd || 0).toFixed(2) + ' USD';
        const revStatus = document.getElementById('kpi-revenue-status');
        if (revStatus) {
          if (Number(st.revenue_vnd) > 0) {
            revStatus.innerText = 'Doanh thu th\u1EF1c t\u1EBF';
            revStatus.className = 'text-emerald-400 font-medium';
          } else {
            revStatus.innerText = 'Ch\u01B0a c\xF3 k\xEAnh n\u1EA1p b\xE1o c\xE1o';
            revStatus.className = 'text-zinc-500 font-medium';
          }
        }
      }
      if (st.total_licenses !== undefined) {
        document.getElementById('kpi-total-licenses').innerText = (st.total_licenses || 0) + ' B\u1EA3n Quy\u1EC1n';
        document.getElementById('kpi-used-seats').innerText = st.used_seats || 0;
        document.getElementById('kpi-max-seats').innerText = st.max_seats || 0;
        const pct = st.max_seats ? Math.min(100, Math.round(((st.used_seats || 0) / st.max_seats) * 100)) : 0;
        document.getElementById('kpi-seat-progress').style.width = pct + '%';
      }
      if (st.active_devices !== undefined) {
        document.getElementById('kpi-active-devices').innerText = (st.active_devices || 0) + ' M\xE1y';
      }
      if (st.monitored_channels !== undefined) {
        document.getElementById('kpi-monitored-channels').innerText = (st.monitored_channels || 0) + ' K\xEAnh \u0110\xEDch';
        const vidElem = document.getElementById('kpi-monitored-videos');
        const bktElem = document.getElementById('kpi-bkt-status');
        if (st.monitored_channels > 0) {
          if (vidElem) vidElem.innerText = (st.monitored_channels || 0) + ' K\xEAnh \u0111ang qu\u1EA3n l\xFD';
          if (bktElem) {
            bktElem.innerText = '\u0110ang theo d\xF5i BKT';
            bktElem.className = 'text-emerald-400 font-medium';
          }
        } else {
          if (vidElem) vidElem.innerText = '0 Video \u0111\xE3 t\u1EA3i & Reup';
          if (bktElem) {
            bktElem.innerText = 'Ch\u01B0a li\xEAn k\u1EBFt k\xEAnh';
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
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-zinc-500">Ch\u01B0a ghi nh\u1EADn ho\u1EA1t \u0111\u1ED9ng n\xE0o h\xF4m nay.</td></tr>';
        return;
      }
      list.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' + (item.report_date || 'H\xF4m nay') + '</td>' +
          '<td class="px-5 py-3.5 font-medium text-white">' + (item.channel_name || 'YouTube Channel') + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(item.views || 0).toLocaleString() + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(item.watch_time_hours || 0).toFixed(1) + ' h</td>' +
          '<td class="px-5 py-3.5 font-mono text-emerald-400">$' + Number(item.estimated_revenue || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">' + Number(item.estimated_revenue_vnd || 0).toLocaleString() + ' \u20AB</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-help" data-tooltip="Video v\u01B0\u1EE3t qua ki\u1EC3m tra Content ID, kh\xF4ng c\xF3 c\u1EA3nh b\xE1o vi ph\u1EA1m b\u1EA3n quy\u1EC1n t\u1EEB YouTube." data-tooltip-title="BKT Xanh">S\u1EA1ch B\u1EA3n Quy\u1EC1n</span>' +
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
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-8 text-center text-zinc-500">Kh\xF4ng t\xECm th\u1EA5y m\xE3 b\u1EA3n quy\u1EC1n n\xE0o.</td></tr>';
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
        const daysText = daysLeft > 0 ? ('C\xF2n ' + daysLeft + ' ng\xE0y') : '\u0110\xE3 h\u1EBFt h\u1EA1n';

        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-mono text-zinc-200">' +
            '<div class="flex items-center gap-2">' +
              '<span id="key-' + lic.id + '" class="tracking-wider select-all">' + lic.license_key + '</span>' +
              '<button onclick="copyToClipboard(&apos;' + lic.license_key + '&apos;)" data-tooltip="Sao ch\xE9p m\xE3 License Key v\xE0o b\u1ED9 nh\u1EDB t\u1EA1m \u0111\u1EC3 g\u1EEDi cho nh\xE2n vi\xEAn/kh\xE1ch h\xE0ng." data-tooltip-title="Sao Ch\xE9p Kh\xF3a" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition">' +
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
            '<span>' + lic.used_seats + ' / ' + lic.max_seats + ' m\xE1y</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' +
            '<div>' + new Date(lic.expires_at).toLocaleDateString('vi-VN') + '</div>' +
            '<div class="text-[10px] text-zinc-500">' + daysText + '</div>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase ' + statusColor + '">' + lic.status + '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 text-right space-x-1">' +
            '<button onclick="handleExtendLicense(&apos;' + lic.id + '&apos;)" data-tooltip="C\u1ED9ng th\xEAm 365 ng\xE0y hi\u1EC7u l\u1EF1c tr\u1EF1c ti\u1EBFp v\xE0o th\u1EDDi h\u1EA1n c\u1EE7a License Key n\xE0y." data-tooltip-title="Gia H\u1EA1n 1 N\u0103m" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] transition">Gia H\u1EA1n</button>' +
            '<button onclick="handleToggleLicenseStatus(&apos;' + lic.id + '&apos;, &apos;' + lic.status + '&apos;)" data-tooltip="Chuy\u1EC3n \u0111\u1ED5i tr\u1EA1ng th\xE1i b\u1EA3n quy\u1EC1n: Thu h\u1ED3i s\u1EBD ch\u1EB7n ngay l\u1EADp t\u1EE9c to\xE0n b\u1ED9 m\xE1y tr\u1EA1m c\u1EE7a key n\xE0y." data-tooltip-title="\u0110\u1ED5i Tr\u1EA1ng Th\xE1i Kh\xF3a" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">' +
              (lic.status === 'active' ? 'Thu H\u1ED3i' : 'K\xEDch Ho\u1EA1t') +
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
      btn.innerText = '\u0110ang c\u1EA5p...';

      try {
        const res = await authFetch('/v1/admin/licenses/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId, tier, max_seats: maxSeats, duration_days: durationDays, license_key: licenseKey })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i khi c\u1EA5p license');

        showToast('C\u1EA5p License th\xE0nh c\xF4ng! \u0110\xE3 sao ch\xE9p v\xE0o b\u1ED9 nh\u1EDB t\u1EA1m', 'success');
        copyToClipboard(licenseKey);
        closeIssueLicenseModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>X\xE1c Nh\u1EADn C\u1EA5p Key</span>';
      }
    }

    async function handleExtendLicense(licenseId) {
      if (!confirm('B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n gia h\u1EA1n b\u1EA3n quy\u1EC1n n\xE0y th\xEAm 365 ng\xE0y kh\xF4ng?')) return;
      try {
        const res = await authFetch('/v1/admin/licenses/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'extend', license_id: licenseId, days: 365 })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i gia h\u1EA1n');
        showToast('\u0110\xE3 gia h\u1EA1n th\xE0nh c\xF4ng th\xEAm 1 n\u0103m', 'success');
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EADp nh\u1EADt');
        showToast('C\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i License th\xE0nh c\xF4ng', 'success');
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
        tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-6 text-center text-zinc-500">Ch\u01B0a c\xF3 c\xF4ng ty n\xE0o.</td></tr>';
        return;
      }
      systemData.companies.forEach(c => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';

        const licenseDisplay = (c.license_key && c.license_key !== 'Ch\u01B0a c\u1EA5p license')
          ? ('<div class="flex items-center gap-1.5">' +
              '<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold tracking-wider select-all">' + c.license_key + '</span>' +
              '<button onclick="copyToClipboard(&apos;' + c.license_key + '&apos;)" title="Sao ch\xE9p License Key" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition">' +
                '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>' +
              '</button>' +
            '</div>' +
            '<div class="text-[10px] text-zinc-400 mt-0.5 font-sans">G\xF3i: <b class="text-zinc-300 uppercase">' + (c.tier || 'pro') + '</b> \u2022 H\u1EA1n m\u1EE9c: <b class="text-zinc-300">' + (c.max_seats || 10) + ' m\xE1y</b></div>')
          : ('<span class="text-zinc-500 italic text-[11px]">Ch\u01B0a c\u1EA5p license</span>');

        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-medium text-white">' + c.name + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300 uppercase">' + c.code + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + licenseDisplay + '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-medium ' + (c.mask_revenue_from_staff ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-400') + '">' +
              (c.mask_revenue_from_staff ? '\u0110ang \u1EA8n (B\u1EA3o m\u1EADt)' : 'Hi\u1EC3n th\u1ECB') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-medium ' + (c.cross_leader_collaboration ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400') + '">' +
              (c.cross_leader_collaboration ? 'B\u1EADt H\u1EE3p T\xE1c' : 'Kh\xF3a') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5">' +
            '<span class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase ' + (c.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20') + '">' +
              (c.is_active ? 'Ho\u1EA1t \u0110\u1ED9ng' : 'T\u1EA1m Kh\xF3a') +
            '</span>' +
          '</td>' +
          '<td class="px-5 py-3.5 text-right space-x-1.5">' +
            '<button onclick="openEditCompanyModal(&apos;' + c.id + '&apos;)" data-tooltip="S\u1EEDa t\xEAn, m\xE3 c\xF4ng ty ho\u1EB7c c\xE1c thi\u1EBFt l\u1EADp b\u1EA3o m\u1EADt." data-tooltip-title="S\u1EEDa C\xF4ng Ty" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-200 text-[11px] transition font-medium">' +
              'S\u1EEDa' +
            '</button>' +
            '<button onclick="handleToggleCompanyRevenueMask(&apos;' + c.id + '&apos;, ' + c.mask_revenue_from_staff + ')" data-tooltip="B\u1EADt/T\u1EAFt t\u1EE9c th\xEC ch\xEDnh s\xE1ch che gi\u1EA5u doanh thu \u0111\u1ED1i v\u1EDBi nh\xE2n vi\xEAn c\xF4ng ty n\xE0y." data-tooltip-title="B\u1EA3o M\u1EADt Doanh Thu" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-300 text-[11px] transition">' +
              (c.mask_revenue_from_staff ? 'Hi\u1EC7n DT' : '\u1EA8n DT') +
            '</button>' +
            (c.id === 'e51f4953-587e-4a5e-af09-e76471ca0326' ? '' :
            '<button onclick="handleDeleteCompany(&apos;' + c.id + '&apos;, &apos;' + (c.name || '').replace(/'/g, "'") + '&apos;)" data-tooltip="X\xF3a c\xF4ng ty kh\u1ECFi h\u1EC7 th\u1ED1ng." data-tooltip-title="X\xF3a C\xF4ng Ty" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">' +
              'X\xF3a' +
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i khi t\u1EA1o c\xF4ng ty');
        showToast('T\u1EA1o c\xF4ng ty ' + name + ' th\xE0nh c\xF4ng!', 'success');
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EADp nh\u1EADt');
        showToast('\u0110\xE3 c\u1EADp nh\u1EADt c\xE0i \u0111\u1EB7t c\xF4ng ty', 'success');
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

      // 1. Ph\xE2n quy\u1EC1n hi\u1EC3n th\u1ECB theo Role ng\u01B0\u1EDDi \u0111\u0103ng nh\u1EADp
      if (myRole === 'admin') {
        // Admin: Th\u1EA5y c\xE1c th\xE0nh vi\xEAn trong c\xF4ng ty m\xECnh (ngo\u1EA1i tr\u1EEB Master Owner)
        list = list.filter(u => u.company_id === myCompanyId && u.role !== 'owner');
      } else if (myRole === 'leader') {
        // Leader: Th\u1EA5y c\xE1c User trong c\xF4ng ty
        list = list.filter(u => u.company_id === myCompanyId && u.role === 'user');
      }
      // Owner: Th\u1EA5y to\xE0n b\u1ED9 th\xE0nh vi\xEAn c\u1EE7a m\u1ECDi c\xF4ng ty + th\xE0nh vi\xEAn m\u1EDBi \u0111\u0103ng k\xFD ch\u01B0a c\xF3 c\xF4ng ty

      // 2. T\xECm ki\u1EBFm theo h\u1ECD t\xEAn, email, thi\u1EBFt b\u1ECB
      if (q) {
        list = list.filter(u => 
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.company_name || '').toLowerCase().includes(q) ||
          (u.company_code || '').toLowerCase().includes(q) ||
          (u.bound_device && (u.bound_device.device_name || '').toLowerCase().includes(q))
        );
      }

      // 3. L\u1ECDc theo C\xF4ng ty
      if (compFilter !== 'all') {
        if (compFilter === 'unassigned') {
          list = list.filter(u => !u.company_id);
        } else {
          list = list.filter(u => u.company_id === compFilter);
        }
      }

      // 4. L\u1ECDc theo Role
      if (roleFilter !== 'all') {
        list = list.filter(u => u.role === roleFilter);
      }

      // 5. L\u1ECDc theo HWID
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
        tbody.innerHTML = '<tr><td colSpan="7" class="px-5 py-8 text-center text-zinc-500">Kh\xF4ng t\xECm th\u1EA5y th\xE0nh vi\xEAn n\xE0o ph\xF9 h\u1EE3p.</td></tr>';
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
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Admin (S\u1EBFp)</span>';
        } else if (u.role === 'leader') {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Leader</span>';
        } else {
          roleBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase tracking-wide">User (Nh\xE2n Vi\xEAn)</span>';
        }

        let deviceStatus = '';
        if (u.role === 'owner') {
          deviceStatus = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">Bypass HWID (M\u1ECDi m\xE1y)</span>';
        } else if (u.has_device_bound && u.bound_device) {
          deviceStatus = '<div class="text-xs text-white font-medium flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' + (u.bound_device.device_name || 'Windows PC') + '</div>' +
            '<div class="text-[10px] text-zinc-500 font-mono">' + (u.bound_device.last_ip || '127.0.0.1') + ' \u2022 ' + (u.bound_device.os_info || 'Win') + '</div>';
        } else {
          deviceStatus = '<span class="text-[11px] text-zinc-500 italic">Ch\u01B0a g\u1EAFn m\xE1y</span>';
        }

        let companyDisplay = '';
        if (u.company_id && u.company_name) {
          companyDisplay = '<div class="text-white font-medium">' + u.company_name + '</div>' +
            '<div class="text-[10px] text-zinc-500 font-mono">(' + (u.company_code || '') + ')</div>';
        } else {
          companyDisplay = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">Ch\u01B0a g\xE1n c\xF4ng ty</span>';
        }

        const isUserMasterOwner = u.role === 'owner' || u.email === 'dungdong333@gmail.com' || u.id === '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44';
        const formattedDate = u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '\u2014';

        // X\xE2y d\u1EF1ng b\u1ED9 n\xFAt Thao t\xE1c d\u1EF1a tr\xEAn ph\xE2n quy\u1EC1n nghi\xEAm ng\u1EB7t
        let actionsHtml = '';

        // 1. N\xFAt G\xE1n V\xE0o C\xF4ng Ty: D\xE0nh cho Owner
        if (isOwner) {
          actionsHtml += '<button onclick="openAssignCompanyModal(&apos;' + u.id + '&apos;)" data-tooltip="G\xE1n th\xE0nh vi\xEAn n\xE0y v\xE0o c\xF4ng ty tr\u1EF1c thu\u1ED9c." data-tooltip-title="G\xE1n C\xF4ng Ty" class="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[11px] transition font-medium">G\xE1n Cty</button> ';
        }

        // 2. N\xFAt Ph\xE2n Quy\u1EC1n:
        // Owner: ph\xE2n quy\u1EC1n Admin, Leader, User
        // Admin: chuy\u1EC3n User <-> Leader
        if (isOwner || (isAdmin && (u.role === 'user' || u.role === 'leader'))) {
          actionsHtml += '<button onclick="openChangeRoleModal(&apos;' + u.id + '&apos;)" data-tooltip="Thi\u1EBFt l\u1EADp c\u1EA5p b\u1EADc ph\xE2n quy\u1EC1n cho th\xE0nh vi\xEAn." data-tooltip-title="Ph\xE2n Quy\u1EC1n" class="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-[11px] transition font-medium">Ph\xE2n Quy\u1EC1n</button> ';
        }

        // 3. N\xFAt S\u1EEDa: Owner, Admin, Leader
        if (isOwner || isAdmin || (isLeader && u.role === 'user')) {
          actionsHtml += '<button onclick="openEditUserModal(&apos;' + u.id + '&apos;)" data-tooltip="S\u1EEDa h\u1ECD t\xEAn v\xE0 tr\u1EA1ng th\xE1i k\xEDch ho\u1EA1t." data-tooltip-title="S\u1EEDa Th\xF4ng Tin" class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] transition font-medium">S\u1EEDa</button> ';
        }

        // 4. N\xFAt Reset M\xE1y: N\u1EBFu m\xE1y \u0111\xE3 b\u1ECB bind HWID
        if (u.has_device_bound && (isOwner || isAdmin)) {
          actionsHtml += '<button onclick="handleResetUserHwid(&apos;' + u.id + '&apos;, &apos;' + u.email + '&apos;)" data-tooltip="Gi\u1EA3i ph\xF3ng m\xE1y HWID hi\u1EC7n t\u1EA1i ngay l\u1EADp t\u1EE9c." data-tooltip-title="Gi\u1EA3i Ph\xF3ng M\xE1y" class="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] transition font-medium">Reset M\xE1y</button> ';
        }

        // 5. N\xFAt X\xF3a: 
        // Owner: x\xF3a m\u1ECDi user (tr\u1EEB Master Owner)
        // Admin: x\xF3a User ho\u1EB7c Leader trong cty m\xECnh
        // Leader: x\xF3a User trong cty m\xECnh
        const canDelete = 
          (!isUserMasterOwner) && (
            isOwner ||
            (isAdmin && (u.role === 'user' || u.role === 'leader') && u.id !== currentUser?.id) ||
            (isLeader && u.role === 'user')
          );

        if (canDelete) {
          actionsHtml += '<button onclick="handleDeleteUser(&apos;' + u.id + '&apos;, &apos;' + u.email + '&apos;)" data-tooltip="X\xF3a v\u0129nh vi\u1EC5n t\xE0i kho\u1EA3n kh\u1ECFi h\u1EC7 th\u1ED1ng." data-tooltip-title="X\xF3a T\xE0i Kho\u1EA3n" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] transition">X\xF3a</button>';
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
              (u.is_active ? 'Ho\u1EA1t \u0110\u1ED9ng' : '\u0110\xE3 Kh\xF3a') +
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
          optAll.innerText = 'T\u1EA5t c\u1EA3 c\xF4ng ty';
          el.appendChild(optAll);

          const optUnassigned = document.createElement('option');
          optUnassigned.value = 'unassigned';
          optUnassigned.innerText = 'Ch\u01B0a g\xE1n c\xF4ng ty';
          el.appendChild(optUnassigned);
        } else if (selId === 'modal-assign-company-select') {
          const optNone = document.createElement('option');
          optNone.value = '';
          optNone.innerText = '-- Kh\xF4ng g\xE1n (H\u1EE7y g\xE1n c\xF4ng ty) --';
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

    // Modal G\xE1n V\xE0o C\xF4ng Ty
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
        showToast('Vui l\xF2ng ch\u1ECDn c\xF4ng ty \u0111\u1EC3 g\xE1n cho th\xE0nh vi\xEAn', 'error');
        return;
      }

      try {
        const res = await authFetch('/v1/admin/users/assign-company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, company_id, activate: true })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i g\xE1n c\xF4ng ty');
        showToast(data.message || 'G\xE1n th\xE0nh vi\xEAn v\xE0o c\xF4ng ty th\xE0nh c\xF4ng!', 'success');
        closeAssignCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // Modal Ph\xE2n Quy\u1EC1n Vai Tr\xF2
    function openChangeRoleModal(userId) {
      const user = (systemData.users || []).find(u => u.id === userId);
      if (!user) return;

      const myRole = (currentUser && currentUser.role) || 'owner';
      const roleSelect = document.getElementById('modal-role-select');
      roleSelect.innerHTML = '';

      if (myRole === 'owner') {
        const roles = [
          { value: 'admin', label: 'Admin (Qu\u1EA3n tr\u1ECB vi\xEAn / S\u1EBFp c\xF4ng ty)' },
          { value: 'leader', label: 'Leader (Tr\u01B0\u1EDFng nh\xF3m)' },
          { value: 'user', label: 'User (Nh\xE2n vi\xEAn th\xF4ng th\u01B0\u1EDDng)' }
        ];
        roles.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.value;
          opt.innerText = r.label;
          roleSelect.appendChild(opt);
        });
      } else if (myRole === 'admin') {
        const roles = [
          { value: 'leader', label: 'Leader (Tr\u01B0\u1EDFng nh\xF3m)' },
          { value: 'user', label: 'User (Nh\xE2n vi\xEAn)' }
        ];
        roles.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.value;
          opt.innerText = r.label;
          roleSelect.appendChild(opt);
        });
      }

      document.getElementById('modal-role-user-id').value = user.id;
      document.getElementById('modal-role-user-info').innerText = (user.full_name || user.email) + ' \u2022 Hi\u1EC7n t\u1EA1i: ' + (user.role || 'user').toUpperCase();
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EADp nh\u1EADt vai tr\xF2');
        showToast('C\u1EADp nh\u1EADt ph\xE2n quy\u1EC1n th\xE0nh c\xF4ng sang: ' + role.toUpperCase(), 'success');
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
        if (comp && comp.license_key && comp.license_key !== 'Ch\u01B0a c\u1EA5p license') {
          hintEl.innerText = comp.license_key + ' (' + (comp.tier || 'pro').toUpperCase() + ')';
        } else {
          hintEl.innerText = 'Ch\u01B0a c\xF3 license key';
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
            { value: 'admin', label: 'Admin (Qu\u1EA3n tr\u1ECB vi\xEAn / Gi\xE1m \u0111\u1ED1c c\xF4ng ty)' },
            { value: 'leader', label: 'Leader (Tr\u01B0\u1EDFng nh\xF3m)' },
            { value: 'user', label: 'User (Nh\xE2n vi\xEAn)' }
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
            { value: 'leader', label: 'Leader (Tr\u01B0\u1EDFng nh\xF3m)' },
            { value: 'user', label: 'User (Nh\xE2n vi\xEAn)' }
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
          opt.innerText = 'User (Nh\xE2n vi\xEAn)';
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
      document.getElementById('created-acc-company').innerText = (comp ? comp.name + ' (' + comp.code + ')' : (userObj.company_id || 'Ch\u01B0a g\xE1n'));
      document.getElementById('created-acc-lic').innerText = (comp?.license_key && comp.license_key !== 'Ch\u01B0a c\u1EA5p license') ? comp.license_key : 'Ch\u01B0a c\xF3 license';
      
      document.getElementById('modal-account-created').classList.remove('hidden');
    }

    function closeCreatedAccountModal() {
      document.getElementById('modal-account-created').classList.add('hidden');
    }

    function copyFullAccountCredentials() {
      if (!lastCreatedAccount) return;
      const comp = (systemData.companies || []).find(c => c.id === lastCreatedAccount.company_id);
      const compName = comp ? comp.name + ' (' + comp.code + ')' : 'M\u1EB7c \u0111\u1ECBnh';
      const licKey = (comp && comp.license_key && comp.license_key !== 'Ch\u01B0a c\u1EA5p license') ? comp.license_key : 'RTM-MASTER-ENTERPRISE-2026';
      const text = 
        'TH\xD4NG TIN T\xC0I KHO\u1EA2N RETUBEMATRIX\\n' +
        '----------------------------------------\\n' +
        '- Email: ' + lastCreatedAccount.email + '\\n' +
        '- M\u1EADt kh\u1EA9u: ' + (lastCreatedAccount.plain_password || '********') + '\\n' +
        '- Vai tr\xF2: ' + (lastCreatedAccount.role || 'user').toUpperCase() + '\\n' +
        '- C\xF4ng ty: ' + compName + '\\n' +
        '- License Key k\xEDch ho\u1EA1t: ' + licKey + '\\n' +
        '----------------------------------------\\n' +
        'Vui l\xF2ng s\u1EED d\u1EE5ng th\xF4ng tin tr\xEAn \u0111\u1EC3 \u0111\u0103ng nh\u1EADp ph\u1EA7n m\u1EC1m RETubeMatrix Desktop!';

      copyToClipboard(text);
      showToast('\u0110\xE3 sao ch\xE9p to\xE0n b\u1ED9 th\xF4ng tin t\xE0i kho\u1EA3n!', 'success');
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EA5p t\xE0i kho\u1EA3n');
        
        closeAddUserModal();
        loadAllData();
        showToast('C\u1EA5p t\xE0i kho\u1EA3n ' + email + ' th\xE0nh c\xF4ng!', 'success');
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EADp nh\u1EADt');

        // N\u1EBFu c\xF3 thay \u0111\u1ED5i vai tr\xF2:
        const user = systemData.users.find(u => u.id === user_id);
        if (user && user.role !== role) {
          const roleRes = await authFetch('/v1/admin/users/update-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, role })
          });
          const roleData = await roleRes.json();
          if (!roleRes.ok || !roleData.success) throw new Error(roleData.error || 'L\u1ED7i ph\xE2n quy\u1EC1n');
        }

        // N\u1EBFu l\xE0 Master Owner v\xE0 c\xF3 ch\u1ECDn c\xF4ng ty kh\xE1c:
        const myRole = (currentUser && currentUser.role) || 'owner';
        if (myRole === 'owner' && company_id && user && user.company_id !== company_id) {
          await authFetch('/v1/admin/users/assign-company', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, company_id, activate: is_active })
          });
        }

        showToast('C\u1EADp nh\u1EADt th\xF4ng tin th\xE0nh vi\xEAn th\xE0nh c\xF4ng', 'success');
        closeEditUserModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleDeleteUser(userId, email) {
      if (!confirm('B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n x\xF3a t\xE0i kho\u1EA3n ' + email + ' kh\u1ECFi h\u1EC7 th\u1ED1ng? Thao t\xE1c n\xE0y kh\xF4ng th\u1EC3 ho\xE0n t\xE1c!')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/users/' + userId, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i x\xF3a ng\u01B0\u1EDDi d\xF9ng');
        showToast(data.message || ('\u0110\xE3 x\xF3a ng\u01B0\u1EDDi d\xF9ng ' + email), 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleResetUserHwid(userId, email) {
      if (!confirm('Gi\u1EA3i ph\xF3ng kh\xF3a m\xE1y (HWID) cho ' + email + '? Ng\u01B0\u1EDDi d\xF9ng s\u1EBD c\xF3 th\u1EC3 \u0111\u0103ng nh\u1EADp tr\xEAn m\xE1y m\u1EDBi ngay l\u1EADp t\u1EE9c.')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/users/reset-hwid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i reset m\xE1y');
        showToast('\u0110\xE3 gi\u1EA3i ph\xF3ng m\xE1y cho ' + email, 'success');
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
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i c\u1EADp nh\u1EADt c\xF4ng ty');
        showToast('C\u1EADp nh\u1EADt c\xF4ng ty ' + name + ' th\xE0nh c\xF4ng', 'success');
        closeEditCompanyModal();
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleDeleteCompany(companyId, name) {
      if (!confirm('B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n x\xF3a c\xF4ng ty "' + name + '"? C\xE1c nh\xE2n vi\xEAn thu\u1ED9c c\xF4ng ty n\xE0y s\u1EBD \u0111\u01B0\u1EE3c t\u1EF1 \u0111\u1ED9ng chuy\u1EC3n v\u1EC1 T\u1ED5ng b\u1ED9 (RETubeMatrix HQ).')) {
        return;
      }
      try {
        const res = await authFetch('/v1/admin/companies/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_id: companyId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i x\xF3a c\xF4ng ty');
        showToast('\u0110\xE3 x\xF3a c\xF4ng ty th\xE0nh c\xF4ng', 'success');
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
      document.getElementById('pending-reset-count-badge').innerText = pendingList.length + ' Y\xEAu c\u1EA7u';

      if (pendingList.length === 0) {
        pendingTbody.innerHTML = '<tr><td colspan="6" class="px-5 py-6 text-center text-zinc-500">Kh\xF4ng c\xF3 y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y n\xE0o \u0111ang ch\u1EDD duy\u1EC7t.</td></tr>';
      } else {
        pendingList.forEach(req => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-white/[0.02] transition';
          tr.innerHTML = 
            '<td class="px-5 py-3.5">' +
              '<div class="font-medium text-white">' + (req.user_name || req.user_email) + '</div>' +
              '<div class="text-[10px] text-zinc-400 font-mono">' + req.user_email + '</div>' +
            '</td>' +
            '<td class="px-5 py-3.5 text-zinc-300">' + (req.company_name || 'C\xF4ng Ty') + '</td>' +
            '<td class="px-5 py-3.5 text-amber-300">' + (req.reason || 'C\xE0i l\u1EA1i Win / \u0110\u1ED5i m\xE1y') + '</td>' +
            '<td class="px-5 py-3.5 font-mono text-[11px] text-zinc-400">' + ((req.new_hwid_hash || '').substring(0, 16)) + '...</td>' +
            '<td class="px-5 py-3.5 text-zinc-400">' + new Date(req.created_at).toLocaleDateString('vi-VN') + '</td>' +
            '<td class="px-5 py-3.5 text-right space-x-1.5">' +
              '<button onclick="handleReviewHwidReset(&apos;' + req.id + '&apos;, true)" data-tooltip="Ph\xEA duy\u1EC7t s\u1EBD gi\u1EA3i ph\xF3ng m\xE1y c\u0169 v\xE0 cho ph\xE9p ph\u1EA7n c\u1EE9ng m\xE1y m\u1EDBi k\xEDch ho\u1EA1t ngay l\u1EADp t\u1EE9c." data-tooltip-title="Ph\xEA Duy\u1EC7t \u0110\u1ED5i M\xE1y" class="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm">Ph\xEA Duy\u1EC7t</button>' +
              '<button onclick="handleReviewHwidReset(&apos;' + req.id + '&apos;, false)" data-tooltip="B\xE1c b\u1ECF y\xEAu c\u1EA7u. Nh\xE2n vi\xEAn kh\xF4ng th\u1EC3 s\u1EED d\u1EE5ng m\xE1y m\u1EDBi v\u1EDBi t\xE0i kho\u1EA3n n\xE0y." data-tooltip-title="T\u1EEB Ch\u1ED1i \u0110\u1ED5i M\xE1y" class="px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition">T\u1EEB Ch\u1ED1i</button>' +
            '</td>';
          pendingTbody.appendChild(tr);
        });
      }

      // 2. Active Devices Table
      const activeTbody = document.getElementById('active-devices-tbody');
      activeTbody.innerHTML = '';
      const devList = systemData.devices;
      document.getElementById('total-bound-devices-count').innerText = devList.length + ' thi\u1EBFt b\u1ECB';

      if (devList.length === 0) {
        activeTbody.innerHTML = '<tr><td colspan="8" class="px-5 py-6 text-center text-zinc-500">Ch\u01B0a c\xF3 thi\u1EBFt b\u1ECB n\xE0o k\xEDch ho\u1EA1t.</td></tr>';
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
            '<button onclick="handleUnbindDevice(&apos;' + d.id + '&apos;)" data-tooltip="H\u1EE7y li\xEAn k\u1EBFt ph\u1EA7n c\u1EE9ng m\xE1y n\xE0y ngay l\u1EADp t\u1EE9c. Nh\xE2n vi\xEAn s\u1EBD ph\u1EA3i \u0111\u0103ng k\xFD l\u1EA1i ho\u1EB7c g\u1EEDi y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y." data-tooltip-title="H\u1EE7y G\u1EAFn M\xE1y HWID" class="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition">H\u1EE7y G\u1EAFn M\xE1y</button>' +
          '</td>';
        activeTbody.appendChild(tr);
      });
    }

    function refreshDevices() {
      loadAllData();
      showToast('\u0110\xE3 c\u1EADp nh\u1EADt danh s\xE1ch thi\u1EBFt b\u1ECB', 'info');
    }

    async function handleReviewHwidReset(requestId, approved) {
      const actionName = approved ? 'Ph\xEA duy\u1EC7t' : 'T\u1EEB ch\u1ED1i';
      if (!confirm('B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n ' + actionName + ' y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y n\xE0y kh\xF4ng?')) return;

      try {
        const res = await authFetch('/v1/admin/devices/review-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_id: requestId, approved })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i x\u1EED l\xFD y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y');
        showToast(approved ? '\u0110\xE3 ph\xEA duy\u1EC7t \u0111\u1ED5i m\xE1y th\xE0nh c\xF4ng! Nh\xE2n vi\xEAn c\xF3 th\u1EC3 \u0111\u0103ng nh\u1EADp.' : '\u0110\xE3 t\u1EEB ch\u1ED1i y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y.', 'success');
        loadAllData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function handleUnbindDevice(bindingId) {
      if (!confirm('H\u1EE7y li\xEAn k\u1EBFt ph\u1EA7n c\u1EE9ng m\xE1y n\xE0y? Nh\xE2n vi\xEAn s\u1EBD b\u1ECB y\xEAu c\u1EA7u k\xEDch ho\u1EA1t l\u1EA1i ho\u1EB7c g\u1EEDi y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y.')) return;
      try {
        const res = await authFetch('/v1/admin/devices/unbind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ binding_id: bindingId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'L\u1ED7i h\u1EE7y li\xEAn k\u1EBFt');
        showToast('\u0110\xE3 h\u1EE7y li\xEAn k\u1EBFt m\xE1y th\xE0nh c\xF4ng', 'success');
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
        tbody.innerHTML = '<tr><td colspan="9" class="px-5 py-8 text-center text-zinc-500">Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u Studio n\xE0o \u0111\u01B0\u1EE3c n\u1EA1p.</td></tr>';
        return;
      }
      systemData.analytics.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-white/[0.02] transition';
        tr.innerHTML = 
          '<td class="px-5 py-3.5 font-medium text-white">' + (row.channel_name || 'YouTube Studio') + '</td>' +
          '<td class="px-5 py-3.5 text-zinc-400">' + (row.company_name || 'C\xF4ng Ty') + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-400">' + (row.report_date || 'H\xF4m nay') + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(row.views || 0).toLocaleString() + '</td>' +
          '<td class="px-5 py-3.5 font-mono">' + Number(row.watch_time_hours || 0).toFixed(1) + ' h</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">$' + Number(row.rpm || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-300">$' + Number(row.cpm || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-emerald-400 font-medium">$' + Number(row.estimated_revenue || 0).toFixed(2) + '</td>' +
          '<td class="px-5 py-3.5 font-mono text-zinc-200">' + Number(row.estimated_revenue_vnd || 0).toLocaleString() + ' \u20AB</td>';
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
        showToast('\u0110\xE3 sao ch\xE9p v\xE0o b\u1ED9 nh\u1EDB t\u1EA1m: ' + text, 'success');
      }).catch(() => {
        showToast('Kh\xF4ng th\u1EC3 sao ch\xE9p t\u1EF1 \u0111\u1ED9ng', 'error');
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
  showToast('\u0110\xE3 l\xE0m m\u1EDBi danh s\xE1ch th\xE0nh vi\xEAn', 'info');
}

function scrollToPermissionsMatrix(e) {
  if (e) e.preventDefault();
  const el = document.getElementById('permissions-matrix');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  } else {
    showToast('B\u1EA3ng ma tr\u1EADn quy\u1EC1n h\u1EA1n hi\u1EC3n th\u1ECB \u1EDF cu\u1ED1i trang qu\u1EA3n tr\u1ECB', 'info');
  }
}

async function loadWorkReports() {
  if (!authToken) return;
  try {
    const [wrRes, teamsRes] = await Promise.all([
      fetch('/v1/admin/work-reports', {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/v1/admin/teams-comparison', {
        headers: { 'Authorization': 'Bearer ' + authToken }
      }).then(r => r.ok ? r.json() : null).catch(() => null),
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
    console.error('L\u1ED7i n\u1EA1p d\u1EEF li\u1EC7u Work Reports:', err);
    showToast('L\u1ED7i n\u1EA1p b\xE1o c\xE1o c\xF4ng vi\u1EC7c: ' + err.message, 'error');
  }
}

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
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-zinc-500">Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u x\u1EBFp h\u1EA1ng nh\xE2n s\u1EF1</td></tr>';
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
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (item.target_channels_count || 0) + ' k\xEAnh</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-amber-400">' + (item.videos_uploaded_today || 0) + ' video</td>' +
      '<td class="px-5 py-3.5 font-semibold text-zinc-200 font-mono">' + Number(item.total_views || 0).toLocaleString() + '</td>' +
      '<td class="px-5 py-3.5 font-bold text-white font-mono">' + Number(item.estimated_revenue_vnd || 0).toLocaleString() + ' \u0111</td>' +
      '<td class="px-5 py-3.5 text-center">' +
        '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">' + (item.quality_score || 100) + '% S\u1EA1ch</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderTeamsComparison(teams) {
  const tbody = document.getElementById('wr-teams-tbody');
  if (!tbody) return;
  if (!teams || teams.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-zinc-500">Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u so s\xE1nh gi\u1EEFa c\xE1c \u0111\u1ED9i nh\xF3m</td></tr>';
    return;
  }

  tbody.innerHTML = teams.map(tm => {
    let evalColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (tm.evaluation === 'Xu\u1EA5t s\u1EAFc') evalColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    else if (tm.evaluation === 'Hi\u1EC7u qu\u1EA3 cao') evalColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';

    return '<tr class="hover:bg-white/[0.02] transition">' +
      '<td class="px-5 py-3.5 font-bold text-white">' + (tm.team_name || '\u0110\u1ED9i Nh\xF3m') + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-medium text-zinc-200">' + (tm.leader_name || tm.leader_email) + '</p>' +
        '<p class="text-[10px] text-zinc-400">' + tm.leader_email + '</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 text-center text-zinc-300">' + (tm.members_count || 0) + '</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (tm.target_channels_count || 0) + '</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-amber-400">' + (tm.videos_uploaded_today || 0) + '</td>' +
      '<td class="px-5 py-3.5 font-semibold text-zinc-200 font-mono">' + Number(tm.total_views || 0).toLocaleString() + '</td>' +
      '<td class="px-5 py-3.5 font-bold text-white font-mono">' + Number(tm.revenue_vnd || 0).toLocaleString() + ' \u0111</td>' +
      '<td class="px-5 py-3.5 text-center font-bold text-emerald-400">' + (tm.quality_rate || 100) + '%</td>' +
      '<td class="px-5 py-3.5 text-center">' +
        '<span class="px-2.5 py-0.5 rounded-lg border text-xs font-semibold ' + evalColor + '">' + (tm.evaluation || '\u0110\u1EA1t') + '</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function renderStaffWorkReports(reports) {
  const tbody = document.getElementById('wr-staff-tbody');
  if (!tbody) return;
  if (!reports || reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-zinc-500">Ch\u01B0a c\xF3 b\xE1o c\xE1o c\xF4ng vi\u1EC7c t\u1EEB nh\xE2n s\u1EF1</td></tr>';
    return;
  }

  tbody.innerHTML = reports.map((r, rIdx) => {
    let compHtml = '<span class="text-zinc-500">Ch\u01B0a theo d\xF5i k\xEAnh \u0111\u1ED1i th\u1EE7</span>';
    if (r.competitor_channels && r.competitor_channels.length > 0) {
      compHtml = r.competitor_channels.map(c => {
        const link = c.channel_url ? '<a href="' + c.channel_url + '" target="_blank" rel="noreferrer" class="text-sky-400 hover:underline inline-flex items-center gap-1 font-medium">' + (c.channel_name || c.channel_url) + '</a>' : '<span class="text-zinc-300">' + c.channel_name + '</span>';
        const kw = c.primary_keyword ? '<span class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">' + c.primary_keyword + '</span>' : '';
        return '<div class="space-y-0.5">' + link + ' ' + kw + '<div class="text-[10px] text-zinc-400 font-mono">' + Number(c.subscriber_count || 0).toLocaleString() + ' subs \u2022 ' + Number(c.total_views || 0).toLocaleString() + ' views</div></div>';
      }).join('<div class="my-1 border-t border-white/5"></div>');
    }

    let view5Btn = '<span class="text-zinc-500 text-[11px]">\u2014</span>';
    if (r.competitor_channels && r.competitor_channels.length > 0 && r.competitor_channels[0].recent_5_videos && r.competitor_channels[0].recent_5_videos.length > 0) {
      view5Btn = '<button onclick="openRecentVideosModal(' + rIdx + ', 0)" class="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-sky-400 text-xs font-medium transition flex items-center gap-1 ml-auto"><span>5 Video M\u1EDBi</span></button>';
    }

    return '<tr class="hover:bg-white/[0.02] transition">' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-white">' + (r.full_name || r.email) + '</p>' +
        '<p class="text-[10px] text-zinc-400">' + r.email + '</p>' +
        (r.assigned_niche ? '<span class="inline-block mt-1 px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px]">' + r.assigned_niche + '</span>' : '') +
      '</td>' +
      '<td class="px-5 py-3.5 text-zinc-300">' + (r.company_name || 'N/A') + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-emerald-400">' + (r.target_channels_count || 0) + ' K\xEAnh \u0110\xEDch</p>' +
        '<p class="text-[10px] text-zinc-400">' + (r.test_channels_count || 0) + ' K\xEAnh Test BKT</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 max-w-xs">' + compHtml + '</td>' +
      '<td class="px-5 py-3.5">' +
        '<p class="font-bold text-amber-400">' + (r.videos_uploaded_today || 0) + ' h\xF4m nay</p>' +
        '<p class="text-[10px] text-zinc-400 font-mono">Tu\u1EA7n: ' + (r.videos_uploaded_week || 0) + ' | Th\xE1ng: ' + (r.videos_uploaded_month || 0) + '</p>' +
      '</td>' +
      '<td class="px-5 py-3.5 font-medium">' +
        '<span class="text-emerald-400">' + (r.videos_tested_green || 0) + ' Xanh</span> / <span class="text-rose-400">' + (r.videos_tested_red || 0) + ' \u0110\u1ECF</span>' +
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

  if (titleEl) titleEl.innerText = 'K\xEAnh \u0111\u1ED1i th\u1EE7: ' + (comp.channel_name || comp.channel_url);

  const videos = comp.recent_5_videos || [];
  if (listEl) {
    if (videos.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8 text-zinc-500">Ch\u01B0a c\xF3 video n\xE0o \u0111\u01B0\u1EE3c c\xE0o t\u1EEB k\xEAnh n\xE0y.</div>';
    } else {
      listEl.innerHTML = videos.map((v, i) => {
        return '<div class="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-start justify-between gap-3">' +
          '<div class="space-y-1 flex-1">' +
            '<p class="font-semibold text-zinc-200 text-xs line-clamp-2">#' + (i + 1) + '. ' + (v.title || 'Video') + '</p>' +
            '<div class="flex items-center gap-3 text-[11px] text-zinc-400 font-mono">' +
              '<span>L\u01B0\u1EE3t xem: ' + Number(v.view_count || v.views || 0).toLocaleString() + '</span>' +
              (v.upload_date ? '<span>Ng\xE0y \u0111\u0103ng: ' + v.upload_date + '</span>' : '') +
            '</div>' +
          '</div>' +
          (v.url ? '<a href="' + v.url + '" target="_blank" rel="noreferrer" class="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/20 px-2.5 py-1 rounded-lg shrink-0">M\u1EDF Video</a>' : '') +
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

<\/script>

  <!-- MODAL: XEM 5 VIDEO G\u1EA6N NH\u1EA4T C\u1EE6A K\xCANH \u0110\u1ED0I TH\u1EE6 -->
  <div id="modal-recent-videos" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-card bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
      <div class="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <div>
          <h3 class="font-bold text-white text-sm flex items-center gap-2">
            <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"/>
            </svg>
            <span>5 Video M\u1EDBi Nh\u1EA5t & T\u0103ng Tr\u01B0\u1EDFng</span>
          </h3>
          <p id="mrv-channel-name" class="text-xs text-zinc-400 mt-0.5">K\xEAnh \u0111\u1ED1i th\u1EE7: </p>
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
        <button onclick="closeRecentVideosModal()" class="px-4 py-1.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white text-xs">\u0110\xF3ng</button>
      </div>
    </div>
  </div>

</body>
</html>`;
}
__name(getPortalHtml, "getPortalHtml");

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-signature, x-rtm-signature, x-timestamp, x-hwid, apikey",
  "Access-Control-Max-Age": "86400"
};
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}
__name(json, "json");
function badRequest(message, code = "BAD_REQUEST") {
  return json({ success: false, code, error: message }, 400);
}
__name(badRequest, "badRequest");
function unauthorized(message, code = "UNAUTHORIZED") {
  return json({ success: false, code, error: message }, 401);
}
__name(unauthorized, "unauthorized");
function forbidden(message, code = "FORBIDDEN", extra = {}) {
  return json({ success: false, code, error: message, ...extra }, 403);
}
__name(forbidden, "forbidden");
function internalError(message, details) {
  return json({ success: false, code: "INTERNAL_SERVER_ERROR", error: message, details }, 500);
}
__name(internalError, "internalError");
async function computeHmacSha256(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(computeHmacSha256, "computeHmacSha256");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
var MASTER_OWNER_ID = "2e57fca9-0e31-4d1c-b7bf-0eb837f47f44";
var MASTER_OWNER_EMAIL = "dungdong333@gmail.com";
function isMasterOwner(userId, email, role) {
  if (role === "owner") return true;
  if (email && email.toLowerCase() === MASTER_OWNER_EMAIL.toLowerCase()) return true;
  if (userId && userId === MASTER_OWNER_ID) return true;
  return false;
}
__name(isMasterOwner, "isMasterOwner");
var getAdminAuthContext = authenticateAdminCaller;
async function authenticateAdminCaller(request, env, serviceKey) {
  const authHeader = request.headers.get("Authorization") || "";
  const apiKeyHeader = request.headers.get("apikey") || "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && serviceRoleKey !== env.SUPABASE_ANON_KEY && (apiKeyHeader === serviceRoleKey || authHeader === `Bearer ${serviceRoleKey}`)) {
    return {
      auth: {
        userId: MASTER_OWNER_ID,
        email: MASTER_OWNER_EMAIL,
        role: "owner",
        companyId: "e51f4953-587e-4a5e-af09-e76471ca0326",
        fullName: "Ti\u1EBFn D\u0169ng (Master Owner)",
        teamId: null
      }
    };
  }
  if (!authHeader.startsWith("Bearer ")) {
    return {
      errorResponse: unauthorized(
        "Vui l\xF2ng \u0111\u0103ng nh\u1EADp \u0111\u1EC3 th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y (Thi\u1EBFu Bearer Token)"
      )
    };
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      errorResponse: unauthorized("Token x\xE1c th\u1EF1c kh\xF4ng h\u1EE3p l\u1EC7")
    };
  }
  let cached = null;
  if (env.RETUBEMATRIX_KV) {
    try {
      const cachedStr = await env.RETUBEMATRIX_KV.get(`adm_auth:${token.slice(-32)}`);
      if (cachedStr) {
        cached = JSON.parse(cachedStr);
      }
    } catch (_) {
    }
  }
  if (cached) {
    return { auth: cached };
  }
  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  let authUser = null;
  if (!authRes.ok) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(b64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
        );
        const payload = JSON.parse(jsonPayload);
        const tokenEmail = (payload.email || "").toLowerCase();
        const tokenSub = payload.sub;
        if (tokenEmail === MASTER_OWNER_EMAIL || tokenSub === MASTER_OWNER_ID) {
          const adminCheck = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${tokenSub}`, {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          });
          if (adminCheck.ok) {
            authUser = await adminCheck.json();
            console.log(
              "[Gateway Auth] Master Owner session extended & verified via Supabase Admin API."
            );
          }
        }
      }
    } catch (_) {
    }
    if (!authUser) {
      return {
        errorResponse: unauthorized(
          "Phi\xEAn \u0111\u0103ng nh\u1EADp \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i."
        )
      };
    }
  } else {
    authUser = await authRes.json();
  }
  const userId = authUser.id;
  const email = (authUser.email || "").toLowerCase();
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,team_id,is_active,companies(id,is_active)`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    }
  );
  const profiles = await profileRes.json().catch(() => []) || [];
  const profile = profiles[0];
  if (!profile) {
    return {
      errorResponse: forbidden("Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1 ng\u01B0\u1EDDi d\xF9ng trong h\u1EC7 th\u1ED1ng")
    };
  }
  const role = isMasterOwner(userId, email, profile.role) ? "owner" : profile.role || "user";
  if (role !== "owner") {
    if (profile.is_active === false || profile.companies && profile.companies.is_active === false) {
      return {
        errorResponse: forbidden("T\xE0i kho\u1EA3n ho\u1EB7c doanh nghi\u1EC7p \u0111\xE3 b\u1ECB t\u1EA1m kh\xF3a.", "ACCOUNT_DISABLED")
      };
    }
  }
  const authContext = {
    userId,
    email: profile.email || email,
    role,
    companyId: profile.company_id || null,
    fullName: profile.full_name || email,
    teamId: profile.team_id || null
  };
  if (env.RETUBEMATRIX_KV) {
    try {
      const kvTtl = role === "owner" ? 7 * 86400 : role === "admin" || role === "leader" ? 86400 : 3600;
      await env.RETUBEMATRIX_KV.put(`adm_auth:${token.slice(-32)}`, JSON.stringify(authContext), {
        expirationTtl: kvTtl
      });
    } catch (_) {
    }
  }
  return { auth: authContext };
}
__name(authenticateAdminCaller, "authenticateAdminCaller");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    try {
      const acceptHeader = request.headers.get("accept") || "";
      const isHtmlRequest = acceptHeader.includes("text/html") || url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/dashboard" || url.pathname === "/login" || url.pathname === "/licenses" || url.pathname === "/devices" || url.pathname === "/companies" || url.pathname === "/users" || url.pathname === "/analytics";
      if (isHtmlRequest && !url.pathname.startsWith("/v1/")) {
        return new Response(getPortalHtml(), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        });
      }
      if (url.pathname === "/v1/health") {
        let kvStatus = "ok";
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.get("__health_ping__");
          }
        } catch (e) {
          kvStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
        }
        return json({
          status: kvStatus === "ok" ? "healthy" : "degraded",
          gateway: "retubematrix-gateway",
          version: "1.0.0",
          portal_url: `${url.origin}/admin`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          kv_status: kvStatus
        });
      }
      const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
      if (url.pathname === "/v1/admin/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const { email, password } = body;
        if (!email || !password) {
          return badRequest("Vui l\xF2ng nh\u1EADp email v\xE0 m\u1EADt kh\u1EA9u");
        }
        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password })
        });
        if (!authRes.ok) {
          const errData = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || "Email ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c"
          );
        }
        const authData = await authRes.json();
        const userId = authData.user?.id;
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,company_id,role,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          }
        );
        const profiles = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];
        if (!profile || profile.role !== "owner" && profile.role !== "admin" && profile.role !== "leader") {
          return forbidden("T\xE0i kho\u1EA3n kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp v\xE0o b\u1EA3ng qu\u1EA3n tr\u1ECB SaaS");
        }
        const isOwner = isMasterOwner(profile.id, profile.email, profile.role);
        if (!isOwner) {
          if (profile.is_active === false || profile.companies && profile.companies.is_active === false) {
            return forbidden("T\xE0i kho\u1EA3n ho\u1EB7c doanh nghi\u1EC7p \u0111\xE3 b\u1ECB t\u1EA1m kh\xF3a.", "ACCOUNT_DISABLED");
          }
        }
        const loginAuthCtx = {
          userId,
          email: profile.email || authData.user.email,
          role: isOwner ? "owner" : profile.role || "user",
          companyId: profile.company_id || null,
          fullName: profile.full_name || authData.user.email,
          teamId: profile.team_id || null
        };
        if (env.RETUBEMATRIX_KV && authData.access_token) {
          try {
            await env.RETUBEMATRIX_KV.put(
              `adm_auth:${authData.access_token.slice(-32)}`,
              JSON.stringify(loginAuthCtx),
              { expirationTtl: isOwner ? 7 * 86400 : 86400 }
            );
          } catch (_) {
          }
        }
        return json({
          success: true,
          token: authData.access_token,
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          user: {
            id: userId,
            email: authData.user.email,
            full_name: profile.full_name,
            role: profile.role,
            company_id: profile.company_id
          }
        });
      }
      if (url.pathname === "/v1/admin/stats" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp d\u1EEF li\u1EC7u th\u1ED1ng k\xEA");
        }
        const compFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const [licRes, devRes, compRes, chanRes, revRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?select=id,tier,max_seats,used_seats,status${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            caller.role === "owner" ? `${env.SUPABASE_URL}/rest/v1/companies?is_active=eq.true&select=id` : `${env.SUPABASE_URL}/rest/v1/companies?id=eq.${caller.companyId}&select=id`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          ).then((r) => r.json()).catch(() => []),
          fetch(`${env.SUPABASE_URL}/rest/v1/managed_channels?select=id${compFilter}`, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          }).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/channel_revenue_daily?select=estimated_revenue,estimated_revenue_vnd${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          ).then((r) => r.json()).catch(() => [])
        ]);
        const licenses = Array.isArray(licRes) ? licRes : [];
        const devices = Array.isArray(devRes) ? devRes : [];
        const channels = Array.isArray(chanRes) ? chanRes : [];
        const revs = Array.isArray(revRes) ? revRes : [];
        let totalSeats = 0;
        let usedSeats = 0;
        licenses.forEach((l) => {
          totalSeats += l.max_seats || 0;
          usedSeats += l.used_seats || 0;
        });
        let totalUsd = 0;
        let totalVnd = 0;
        revs.forEach((r) => {
          totalUsd += Number(r.estimated_revenue || 0);
          totalVnd += Number(r.estimated_revenue_vnd || 0);
        });
        return json({
          success: true,
          stats: {
            total_licenses: licenses.length,
            max_seats: totalSeats,
            used_seats: usedSeats,
            active_devices: devices.length,
            monitored_channels: channels.length,
            revenue_usd: totalUsd,
            revenue_vnd: totalVnd
          }
        });
      }
      if (url.pathname === "/v1/admin/licenses" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem th\xF4ng tin b\u1EA3n quy\u1EC1n");
        }
        const compFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const licRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/licenses?select=id,license_key,company_id,tier,status,max_seats,used_seats,valid_from,expires_at,features,companies(id,name,code)&order=created_at.desc${compFilter}`,
          {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          }
        );
        const data = await licRes.json().catch(() => []) || [];
        const formatted = Array.isArray(data) ? data.map((l) => ({
          id: l.id,
          license_key: l.license_key,
          company_id: l.company_id,
          company_name: l.companies?.name || "RETubeMatrix HQ",
          company_code: l.companies?.code || "HQ",
          tier: l.tier,
          status: l.status,
          max_seats: l.max_seats,
          used_seats: l.used_seats,
          valid_from: l.valid_from,
          expires_at: l.expires_at,
          features: l.features
        })) : [];
        return json({ success: true, licenses: formatted });
      }
      if (url.pathname === "/v1/admin/licenses/issue" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden("Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n c\u1EA5p m\u1EDBi License b\u1EA3n quy\u1EC1n");
        }
        const body = await request.json().catch(() => ({}));
        const { company_id, tier = "pro", max_seats = 10, duration_days = 365, license_key } = body;
        if (!company_id || !license_key) {
          return badRequest("Vui l\xF2ng ch\u1ECDn c\xF4ng ty v\xE0 cung c\u1EA5p m\xE3 license key");
        }
        const validFrom = /* @__PURE__ */ new Date();
        const expiresAt = new Date(validFrom.getTime() + duration_days * 24 * 60 * 60 * 1e3);
        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/licenses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            license_key: license_key.trim(),
            company_id,
            tier,
            status: "active",
            max_seats,
            used_seats: 0,
            valid_from: validFrom.toISOString(),
            expires_at: expiresAt.toISOString(),
            features: {
              max_browser_profiles: tier === "enterprise" ? 100 : 25,
              bkt_daily_quota: tier === "enterprise" ? 200 : 45,
              allow_cross_leader_collab: true
            }
          })
        });
        if (!insertRes.ok) {
          const err = await insertRes.text();
          return internalError("Kh\xF4ng th\u1EC3 t\u1EA1o License trong c\u01A1 s\u1EDF d\u1EEF li\u1EC7u", err);
        }
        const createdLic = await insertRes.json();
        return json({ success: true, message: "C\u1EA5p License m\u1EDBi th\xE0nh c\xF4ng", license: createdLic });
      }
      if (url.pathname === "/v1/admin/licenses/action" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden("Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n gia h\u1EA1n ho\u1EB7c thu h\u1ED3i License");
        }
        const body = await request.json().catch(() => ({}));
        const { action, license_id, days = 365, status } = body;
        if (!license_id) return badRequest("Thi\u1EBFu license_id");
        if (action === "extend") {
          const curRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}&select=expires_at`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          );
          const curList = await curRes.json();
          const curExpiry = curList && curList[0]?.expires_at ? new Date(curList[0].expires_at) : /* @__PURE__ */ new Date();
          const baseDate = curExpiry.getTime() > Date.now() ? curExpiry : /* @__PURE__ */ new Date();
          const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1e3);
          await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              expires_at: newExpiry.toISOString(),
              status: "active",
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            })
          });
          return json({
            success: true,
            message: "\u0110\xE3 gia h\u1EA1n th\xE0nh c\xF4ng",
            new_expires_at: newExpiry.toISOString()
          });
        }
        if (action === "set_status") {
          await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?id=eq.${license_id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
          });
          return json({ success: true, message: "\u0110\xE3 c\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i license" });
        }
        return badRequest("H\xE0nh \u0111\u1ED9ng kh\xF4ng h\u1EE3p l\u1EC7");
      }
      if (url.pathname === "/v1/admin/companies" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem danh s\xE1ch c\xF4ng ty");
        }
        const compFilter = caller.role === "owner" ? "" : `&id=eq.${caller.companyId}`;
        const licFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const [compRes, licRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/companies?select=id,name,code,is_active,mask_revenue_from_staff,cross_leader_collaboration,created_at&order=created_at.asc${compFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          ),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/licenses?select=id,license_key,company_id,tier,status,max_seats,used_seats,valid_from,expires_at&order=created_at.desc${licFilter}`,
            {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            }
          )
        ]);
        const compList = await compRes.json().catch(() => []) || [];
        const licList = await licRes.json().catch(() => []) || [];
        const licMap = /* @__PURE__ */ new Map();
        licList.forEach((lic) => {
          if (lic.company_id && (!licMap.has(lic.company_id) || lic.status === "active")) {
            licMap.set(lic.company_id, lic);
          }
        });
        const companies = compList.map((c) => {
          const lic = licMap.get(c.id);
          return {
            ...c,
            license_key: lic?.license_key || "Ch\u01B0a c\u1EA5p license",
            tier: lic?.tier || "pro",
            max_seats: lic?.max_seats ?? 10,
            used_seats: lic?.used_seats ?? 0,
            expires_at: lic?.expires_at || null,
            license_status: lic?.status || "inactive",
            license: lic || null
          };
        });
        return json({ success: true, companies });
      }
      if (url.pathname === "/v1/admin/companies/create" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden("Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n t\u1EA1o c\xF4ng ty m\u1EDBi");
        }
        const body = await request.json().catch(() => ({}));
        const {
          name,
          code,
          mask_revenue_from_staff = false,
          cross_leader_collaboration = true,
          tier = "pro"
        } = body;
        if (!name || !code) return badRequest("Vui l\xF2ng nh\u1EADp t\xEAn v\xE0 m\xE3 c\xF4ng ty");
        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim().toUpperCase(),
            is_active: true,
            mask_revenue_from_staff,
            cross_leader_collaboration
          })
        });
        let compObj = null;
        if (!insertRes.ok) {
          const err = await insertRes.text();
          if (err.includes("duplicate key") || err.includes("companies_code_key") || insertRes.status === 409) {
            const findRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/companies?code=eq.${code.trim().toUpperCase()}`,
              {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
              }
            );
            const foundComps = await findRes.json().catch(() => []);
            if (Array.isArray(foundComps) && foundComps.length > 0) {
              compObj = foundComps[0];
              console.log(
                "[Gateway Create Company] Company code already exists, reusing existing record:",
                compObj.name
              );
            } else {
              return internalError("Kh\xF4ng th\u1EC3 t\u1EA1o c\xF4ng ty: M\xE3 Code \u0111\xE3 t\u1ED3n t\u1EA1i", err);
            }
          } else {
            return internalError("Kh\xF4ng th\u1EC3 t\u1EA1o c\xF4ng ty", err);
          }
        } else {
          const newComp = await insertRes.json();
          compObj = Array.isArray(newComp) ? newComp[0] : newComp;
        }
        let createdLicense = null;
        if (compObj?.id) {
          try {
            const targetTier = tier || "pro";
            const maxSeats = targetTier === "enterprise" ? 9999 : targetTier === "trial" ? 3 : 10;
            const durationDays = targetTier === "trial" ? 14 : targetTier === "enterprise" ? 3650 : 365;
            const expiresAt = new Date(Date.now() + durationDays * 864e5).toISOString();
            const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "RTM";
            const licenseKey = `RTM-${cleanCode}-${targetTier.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            const licRes = await fetch(`${env.SUPABASE_URL}/rest/v1/licenses`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Prefer: "return=representation"
              },
              body: JSON.stringify({
                license_key: licenseKey,
                company_id: compObj.id,
                tier: targetTier,
                status: "active",
                issued_by: "2e57fca9-0e31-4d1c-b7bf-0eb837f47f44",
                max_seats: maxSeats,
                used_seats: 0,
                valid_from: (/* @__PURE__ */ new Date()).toISOString(),
                expires_at: expiresAt,
                features: {
                  max_browser_profiles: targetTier === "enterprise" ? 100 : targetTier === "pro" ? 20 : 5,
                  bkt_daily_quota: targetTier === "enterprise" ? 999 : targetTier === "pro" ? 50 : 15,
                  allow_cross_leader_collab: cross_leader_collaboration
                }
              })
            });
            if (licRes.ok) {
              createdLicense = await licRes.json().catch(() => null);
              if (Array.isArray(createdLicense)) createdLicense = createdLicense[0];
            }
          } catch (e) {
            console.error("L\u1ED7i khi t\u1EF1 sinh License cho c\xF4ng ty m\u1EDBi:", e);
          }
        }
        return json({
          success: true,
          message: "T\u1EA1o c\xF4ng ty v\xE0 c\u1EA5p ph\xE1t License th\xE0nh c\xF4ng",
          company: {
            ...compObj,
            license_key: createdLicense?.license_key || "Ch\u01B0a c\u1EA5p license",
            tier: createdLicense?.tier || tier,
            max_seats: createdLicense?.max_seats || 10,
            expires_at: createdLicense?.expires_at || null,
            license: createdLicense
          }
        });
      }
      if (url.pathname === "/v1/admin/companies/update" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden("Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n c\u1EADp nh\u1EADt th\xF4ng tin c\xF4ng ty");
        }
        const body = await request.json().catch(() => ({}));
        const {
          company_id,
          name,
          code,
          owner_user_id,
          is_active,
          mask_revenue_from_staff,
          cross_leader_collaboration
        } = body;
        if (!company_id) return badRequest("Thi\u1EBFu company_id");
        const updateFields = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        if (name !== void 0) updateFields.name = name.trim();
        if (code !== void 0) updateFields.code = code.trim().toUpperCase();
        if (owner_user_id !== void 0) updateFields.owner_user_id = owner_user_id;
        if (is_active !== void 0) updateFields.is_active = is_active;
        if (mask_revenue_from_staff !== void 0)
          updateFields.mask_revenue_from_staff = mask_revenue_from_staff;
        if (cross_leader_collaboration !== void 0)
          updateFields.cross_leader_collaboration = cross_leader_collaboration;
        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify(updateFields)
        });
        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError("L\u1ED7i c\u1EADp nh\u1EADt c\xF4ng ty: " + err);
        }
        const updated = await patchRes.json().catch(() => null);
        return json({ success: true, message: "C\u1EADp nh\u1EADt c\xF4ng ty th\xE0nh c\xF4ng", company: updated });
      }
      if (url.pathname === "/v1/admin/companies/delete" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden("Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n x\xF3a c\xF4ng ty");
        }
        const body = await request.json().catch(() => ({}));
        const { company_id } = body;
        if (!company_id) return badRequest("Thi\u1EBFu company_id");
        if (company_id === "e51f4953-587e-4a5e-af09-e76471ca0326") {
          return forbidden("Kh\xF4ng th\u1EC3 x\xF3a c\xF4ng ty T\u1ED5ng b\u1ED9 (RETubeMatrix HQ)");
        }
        await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?company_id=eq.${company_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ company_id: "e51f4953-587e-4a5e-af09-e76471ca0326" })
        });
        await fetch(`${env.SUPABASE_URL}/rest/v1/licenses?company_id=eq.${company_id}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        const delRes = await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        if (!delRes.ok) {
          const err = await delRes.text();
          return internalError("L\u1ED7i khi x\xF3a c\xF4ng ty: " + err);
        }
        return json({ success: true, message: "\u0110\xE3 x\xF3a c\xF4ng ty th\xE0nh c\xF4ng" });
      }
      if (url.pathname === "/v1/admin/companies/update-settings" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        const body = await request.json().catch(() => ({}));
        const { company_id, mask_revenue_from_staff, cross_leader_collaboration } = body;
        if (!company_id) return badRequest("Thi\u1EBFu company_id");
        if (caller.role !== "owner" && (caller.role !== "admin" || caller.companyId !== company_id)) {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n s\u1EEDa c\xE0i \u0111\u1EB7t c\u1EE7a c\xF4ng ty n\xE0y");
        }
        const updateFields = {};
        if (mask_revenue_from_staff !== void 0)
          updateFields.mask_revenue_from_staff = mask_revenue_from_staff;
        if (cross_leader_collaboration !== void 0)
          updateFields.cross_leader_collaboration = cross_leader_collaboration;
        await fetch(`${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify(updateFields)
        });
        return json({ success: true, message: "C\u1EADp nh\u1EADt c\xE0i \u0111\u1EB7t c\xF4ng ty th\xE0nh c\xF4ng" });
      }
      if (url.pathname === "/v1/admin/users" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem danh s\xE1ch nh\xE2n s\u1EF1");
        }
        let queryUrl = `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,company_id,role,team_id,full_name,email,commission_rate,is_active,assigned_niche,created_at,companies(id,name,code)&order=created_at.asc`;
        let deviceQueryUrl = `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id,user_id,device_name,os_info,client_version,hwid_hash,last_ip,last_heartbeat_at`;
        if (caller.role === "admin" || caller.role === "leader") {
          if (!caller.companyId) {
            return json({ success: true, users: [] });
          }
          queryUrl += `&company_id=eq.${caller.companyId}`;
          deviceQueryUrl += `&company_id=eq.${caller.companyId}`;
        } else if (caller.role === "owner") {
          const filterComp = url.searchParams.get("company_id");
          if (filterComp) {
            queryUrl += `&company_id=eq.${filterComp}`;
            deviceQueryUrl += `&company_id=eq.${filterComp}`;
          }
        }
        const [profilesRes, devicesRes] = await Promise.all([
          fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          }).then((r) => r.json()).catch(() => []),
          fetch(deviceQueryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          }).then((r) => r.json()).catch(() => [])
        ]);
        const profilesList = Array.isArray(profilesRes) ? profilesRes : [];
        const devicesList = Array.isArray(devicesRes) ? devicesRes : [];
        const devMap = /* @__PURE__ */ new Map();
        devicesList.forEach((d) => {
          devMap.set(d.user_id, d);
        });
        const users = profilesList.map((p) => {
          const boundDev = devMap.get(p.id);
          return {
            id: p.id,
            email: p.email,
            full_name: p.full_name || p.email,
            role: p.role,
            is_active: p.is_active,
            commission_rate: p.commission_rate,
            company_id: p.company_id,
            company_name: p.companies?.name || (p.company_id ? "N/A" : "Ch\u01B0a g\xE1n c\xF4ng ty (Ch\u1EDD duy\u1EC7t)"),
            company_code: p.companies?.code || (p.company_id ? "N/A" : "PENDING"),
            team_id: p.team_id,
            assigned_niche: p.assigned_niche || null,
            created_at: p.created_at,
            has_device_bound: !!boundDev,
            bound_device: boundDev ? {
              binding_id: boundDev.id,
              device_name: boundDev.device_name || "Windows PC",
              os_info: boundDev.os_info || "Windows 11",
              hwid_hash: boundDev.hwid_hash,
              last_ip: boundDev.last_ip || "127.0.0.1",
              last_heartbeat_at: boundDev.last_heartbeat_at
            } : null
          };
        });
        return json({ success: true, users });
      }
      if (url.pathname === "/v1/admin/users/create" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n t\u1EA1o t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const body = await request.json().catch(() => ({}));
        let {
          email,
          password,
          full_name,
          role = "user",
          company_id,
          commission_rate = 0,
          assigned_niche,
          assigned_niches
        } = body;
        const finalAssignedNiche = assigned_niche || (Array.isArray(assigned_niches) ? assigned_niches.join(", ") : assigned_niches) || null;
        if (!email || !password) {
          return badRequest("Vui l\xF2ng nh\u1EADp email v\xE0 m\u1EADt kh\u1EA9u cho ng\u01B0\u1EDDi d\xF9ng m\u1EDBi");
        }
        const cleanEmail = email.trim().toLowerCase();
        if (caller.role === "admin") {
          company_id = caller.companyId;
          if (role !== "user" && role !== "leader") {
            return forbidden(
              "Admin ch\u1EC9 c\xF3 th\u1EC3 t\u1EA1o ng\u01B0\u1EDDi d\xF9ng v\u1EDBi vai tr\xF2 Nh\xE2n vi\xEAn (user) ho\u1EB7c Tr\u01B0\u1EDFng nh\xF3m (leader)"
            );
          }
        } else if (caller.role === "leader") {
          company_id = caller.companyId;
          role = "user";
        } else if (caller.role === "owner") {
          if (!company_id) {
            company_id = "e51f4953-587e-4a5e-af09-e76471ca0326";
          }
        }
        const authCreateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || cleanEmail.split("@")[0] }
          })
        });
        if (!authCreateRes.ok) {
          const err = await authCreateRes.json().catch(() => ({}));
          const errMsg = err.msg || err.message || "";
          if (errMsg.toLowerCase().includes("already") || errMsg.toLowerCase().includes("registered")) {
            return json(
              {
                success: false,
                code: "EMAIL_ALREADY_EXISTS",
                error: "Email n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD tr\xEAn h\u1EC7 th\u1ED1ng"
              },
              409
            );
          }
          return badRequest(errMsg || "Kh\xF4ng th\u1EC3 t\u1EA1o t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const createdAuthUser = await authCreateRes.json();
        const newUserId = createdAuthUser.id;
        const compId = company_id || null;
        const profileInsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify({
            id: newUserId,
            company_id: compId,
            role,
            full_name: full_name || cleanEmail.split("@")[0],
            email: cleanEmail,
            commission_rate: Number(commission_rate) || 0,
            is_active: true,
            assigned_niche: finalAssignedNiche
          })
        });
        if (!profileInsertRes.ok) {
          const profErr = await profileInsertRes.text();
          return internalError("L\u1ED7i t\u1EA1o h\u1ED3 s\u01A1 ng\u01B0\u1EDDi d\xF9ng: " + profErr);
        }
        return json({
          success: true,
          message: "C\u1EA5p t\xE0i kho\u1EA3n th\xE0nh c\xF4ng",
          user: {
            id: newUserId,
            email: cleanEmail,
            full_name: full_name || cleanEmail.split("@")[0],
            role,
            company_id: compId,
            assigned_niche: finalAssignedNiche,
            plain_password: password
          }
        });
      }
      if (url.pathname === "/v1/admin/users/assign-company" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner") {
          return forbidden(
            "Ch\u1EC9 Master Owner m\u1EDBi c\xF3 quy\u1EC1n g\xE1n ho\u1EB7c chuy\u1EC3n \u0111\u1ED5i c\xF4ng ty cho ng\u01B0\u1EDDi d\xF9ng"
          );
        }
        const body = await request.json().catch(() => ({}));
        const { user_id, company_id, activate = true } = body;
        if (!user_id || !company_id) {
          return badRequest("Vui l\xF2ng cung c\u1EA5p \u0111\u1EA7y \u0111\u1EE7 user_id v\xE0 company_id");
        }
        const compRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/companies?id=eq.${company_id}&select=id,name,code,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const comps = await compRes.json().catch(() => []) || [];
        if (!comps || comps.length === 0) {
          return badRequest("C\xF4ng ty \u0111\u01B0\u1EE3c ch\u1EC9 \u0111\u1ECBnh kh\xF4ng t\u1ED3n t\u1EA1i tr\xEAn h\u1EC7 th\u1ED1ng");
        }
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const targetProfiles = await userRes.json().catch(() => []) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest("Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const target = targetProfiles[0];
        const patchData = {
          company_id,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (activate && target.is_active === false) {
          patchData.is_active = true;
        }
        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify(patchData)
        });
        if (!patchRes.ok) {
          const errText = await patchRes.text();
          return internalError("L\u1ED7i khi g\xE1n c\xF4ng ty cho ng\u01B0\u1EDDi d\xF9ng: " + errText);
        }
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {
          }
        }
        const updatedList = await patchRes.json().catch(() => []);
        return json({
          success: true,
          message: `\u0110\xE3 g\xE1n ng\u01B0\u1EDDi d\xF9ng ${target.email} v\xE0o c\xF4ng ty ${comps[0].name} th\xE0nh c\xF4ng!`,
          user: updatedList[0] || {
            id: user_id,
            company_id,
            is_active: patchData.is_active ?? target.is_active
          }
        });
      }
      if (url.pathname === "/v1/admin/users/update-role" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin") {
          return forbidden(
            "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n ph\xE2n quy\u1EC1n ng\u01B0\u1EDDi d\xF9ng (ch\u1EC9 Owner v\xE0 Admin m\u1EDBi c\xF3 quy\u1EC1n)"
          );
        }
        const body = await request.json().catch(() => ({}));
        const {
          user_id,
          role,
          company_id,
          full_name,
          commission_rate,
          is_active,
          assigned_niche,
          assigned_niches
        } = body;
        if (!user_id) return badRequest("Thi\u1EBFu user_id");
        if (!role && full_name === void 0 && commission_rate === void 0 && is_active === void 0 && company_id === void 0 && assigned_niche === void 0 && assigned_niches === void 0) {
          return badRequest("Vui l\xF2ng cung c\u1EA5p \xEDt nh\u1EA5t m\u1ED9t th\xF4ng tin c\u1EA7n c\u1EADp nh\u1EADt");
        }
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const targetProfiles = await userRes.json().catch(() => []) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest("Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const target = targetProfiles[0];
        if (isMasterOwner(target.id, target.email, target.role)) {
          if (role && role !== "owner") {
            return forbidden("Kh\xF4ng th\u1EC3 thay \u0111\u1ED5i quy\u1EC1n h\u1EA1n Master Owner t\u1ED1i cao");
          }
        }
        if (caller.role === "admin") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n ph\xE2n quy\u1EC1n cho nh\xE2n s\u1EF1 thu\u1ED9c c\xF4ng ty m\xECnh");
          }
          if (target.role === "owner" || target.role === "admin" && target.id !== caller.userId) {
            return forbidden("Admin kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p thay \u0111\u1ED5i quy\u1EC1n h\u1EA1n c\u1EE7a Owner ho\u1EB7c Admin kh\xE1c");
          }
          if (target.id === caller.userId && role && role !== caller.role) {
            return forbidden("Admin kh\xF4ng th\u1EC3 t\u1EF1 thay \u0111\u1ED5i vai tr\xF2 c\u1EE7a ch\xEDnh m\xECnh");
          }
          if (role && role !== "user" && role !== "leader") {
            return forbidden(
              "Admin ch\u1EC9 \u0111\u01B0\u1EE3c quy\u1EC1n ph\xE2n quy\u1EC1n gi\u1EEFa Nh\xE2n vi\xEAn (user) v\xE0 Tr\u01B0\u1EDFng nh\xF3m (leader)"
            );
          }
          if (company_id !== void 0 && company_id !== caller.companyId) {
            return forbidden(
              "Admin kh\xF4ng c\xF3 quy\u1EC1n g\xE1n ho\u1EB7c chuy\u1EC3n \u0111\u1ED5i c\xF4ng ty cho nh\xE2n s\u1EF1 (Ch\u1EC9 Master Owner c\xF3 quy\u1EC1n)"
            );
          }
        }
        const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        if (role !== void 0) updates.role = role;
        if (full_name !== void 0) updates.full_name = full_name;
        if (commission_rate !== void 0) updates.commission_rate = Number(commission_rate);
        if (is_active !== void 0) updates.is_active = is_active;
        if (company_id !== void 0 && caller.role === "owner") updates.company_id = company_id;
        if (assigned_niche !== void 0 || assigned_niches !== void 0) {
          updates.assigned_niche = assigned_niche || (Array.isArray(assigned_niches) ? assigned_niches.join(", ") : assigned_niches) || null;
        }
        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify(updates)
        });
        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError("L\u1ED7i c\u1EADp nh\u1EADt ph\xE2n quy\u1EC1n ng\u01B0\u1EDDi d\xF9ng: " + err);
        }
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {
          }
        }
        return json({
          success: true,
          message: "C\u1EADp nh\u1EADt ph\xE2n quy\u1EC1n ng\u01B0\u1EDDi d\xF9ng th\xE0nh c\xF4ng",
          user: { id: user_id, ...updates }
        });
      }
      if (url.pathname === "/v1/admin/users/update-info" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n ch\u1EC9nh s\u1EEDa th\xF4ng tin ng\u01B0\u1EDDi d\xF9ng");
        }
        const body = await request.json().catch(() => ({}));
        const {
          user_id,
          full_name,
          commission_rate,
          is_active,
          team_id,
          assigned_niche,
          assigned_niches
        } = body;
        if (!user_id) return badRequest("Thi\u1EBFu user_id");
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,full_name,role,company_id,team_id,is_active`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const targetProfiles = await userRes.json().catch(() => []) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest("Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const target = targetProfiles[0];
        if (isMasterOwner(target.id, target.email, target.role) && caller.role !== "owner") {
          return forbidden("Kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p ch\u1EC9nh s\u1EEDa th\xF4ng tin c\u1EE7a Master Owner");
        }
        if (caller.role === "admin") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n ch\u1EC9nh s\u1EEDa nh\xE2n s\u1EF1 thu\u1ED9c c\xF4ng ty m\xECnh");
          }
          if (target.role === "owner" || target.role === "admin" && target.id !== caller.userId) {
            return forbidden("Admin kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p s\u1EEDa th\xF4ng tin c\u1EE7a Admin kh\xE1c ho\u1EB7c Owner");
          }
        }
        if (caller.role === "leader") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Leader ch\u1EC9 c\xF3 quy\u1EC1n ch\u1EC9nh s\u1EEDa nh\xE2n s\u1EF1 thu\u1ED9c c\xF4ng ty m\xECnh");
          }
          if (target.role !== "user") {
            return forbidden("Leader ch\u1EC9 c\xF3 quy\u1EC1n s\u1EEDa th\xF4ng tin c\u1EE7a Nh\xE2n vi\xEAn (user)");
          }
          if (caller.teamId && target.team_id && target.team_id !== caller.teamId) {
            return forbidden(
              "Leader ch\u1EC9 c\xF3 quy\u1EC1n s\u1EEDa th\xF4ng tin nh\xE2n vi\xEAn thu\u1ED9c nh\xF3m m\xECnh ph\u1EE5 tr\xE1ch"
            );
          }
        }
        const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        if (full_name !== void 0) updates.full_name = full_name;
        if (commission_rate !== void 0) updates.commission_rate = Number(commission_rate);
        if (is_active !== void 0) updates.is_active = is_active;
        if (team_id !== void 0 && caller.role !== "leader") updates.team_id = team_id;
        if (assigned_niche !== void 0 || assigned_niches !== void 0) {
          updates.assigned_niche = assigned_niche || (Array.isArray(assigned_niches) ? assigned_niches.join(", ") : assigned_niches) || null;
        }
        const patchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation"
          },
          body: JSON.stringify(updates)
        });
        if (!patchRes.ok) {
          const err = await patchRes.text();
          return internalError("L\u1ED7i c\u1EADp nh\u1EADt th\xF4ng tin ng\u01B0\u1EDDi d\xF9ng: " + err);
        }
        if (env.RETUBEMATRIX_KV) {
          try {
            await env.RETUBEMATRIX_KV.delete(`adm_auth:${user_id}`);
          } catch (_) {
          }
        }
        return json({
          success: true,
          message: "C\u1EADp nh\u1EADt th\xF4ng tin ng\u01B0\u1EDDi d\xF9ng th\xE0nh c\xF4ng",
          user: { id: user_id, ...updates }
        });
      }
      const isUsersDeletePath = url.pathname === "/v1/admin/users/delete" && request.method === "POST" || url.pathname === "/v1/admin/users" && request.method === "DELETE" || url.pathname.startsWith("/v1/admin/users/") && request.method === "DELETE" && ![
        "assign-company",
        "update-role",
        "update-info",
        "create",
        "delete",
        "reset-hwid"
      ].includes(url.pathname.split("/")[4] || "");
      if (isUsersDeletePath) {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n x\xF3a ng\u01B0\u1EDDi d\xF9ng kh\u1ECFi h\u1EC7 th\u1ED1ng");
        }
        let targetUserId = "";
        if (url.pathname.startsWith("/v1/admin/users/") && request.method === "DELETE") {
          const pathPart = url.pathname.split("/")[4];
          if (pathPart && pathPart !== "delete") {
            targetUserId = pathPart;
          }
        }
        if (!targetUserId) {
          const body = await request.json().catch(() => ({}));
          targetUserId = body.user_id || url.searchParams.get("user_id") || "";
        }
        if (!targetUserId) {
          return badRequest("Thi\u1EBFu user_id c\u1EA7n x\xF3a");
        }
        if (targetUserId === caller.userId) {
          return forbidden("B\u1EA1n kh\xF4ng th\u1EC3 t\u1EF1 x\xF3a t\xE0i kho\u1EA3n c\u1EE7a ch\xEDnh m\xECnh");
        }
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${targetUserId}&select=id,email,full_name,role,company_id,team_id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const targetProfiles = await userRes.json().catch(() => []) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest("Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng c\u1EA7n x\xF3a");
        }
        const target = targetProfiles[0];
        if (isMasterOwner(target.id, target.email, target.role)) {
          return forbidden("TUY\u1EC6T \u0110\u1ED0I KH\xD4NG \u0110\u01AF\u1EE2C X\xD3A T\xC0I KHO\u1EA2N MASTER OWNER");
        }
        if (caller.role === "admin") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n x\xF3a nh\xE2n s\u1EF1 trong c\xF4ng ty c\u1EE7a m\xECnh");
          }
          if (target.role === "owner" || target.role === "admin") {
            return forbidden("Admin kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p x\xF3a t\xE0i kho\u1EA3n c\u1EE7a Admin kh\xE1c ho\u1EB7c Owner");
          }
        }
        if (caller.role === "leader") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Leader ch\u1EC9 c\xF3 quy\u1EC1n x\xF3a nh\xE2n s\u1EF1 trong c\xF4ng ty c\u1EE7a m\xECnh");
          }
          if (target.role !== "user") {
            return forbidden("Leader ch\u1EC9 c\xF3 quy\u1EC1n x\xF3a t\xE0i kho\u1EA3n Nh\xE2n vi\xEAn (user)");
          }
          if (caller.teamId && target.team_id && target.team_id !== caller.teamId) {
            return forbidden("Leader ch\u1EC9 c\xF3 quy\u1EC1n x\xF3a nh\xE2n vi\xEAn thu\u1ED9c nh\xF3m m\xECnh ph\u1EE5 tr\xE1ch");
          }
        }
        await Promise.all([
          fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${targetUserId}`, {
            method: "DELETE",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          }),
          fetch(`${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?user_id=eq.${targetUserId}`, {
            method: "DELETE",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          })
        ]);
        await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${targetUserId}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${targetUserId}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        try {
          if (env.RETUBEMATRIX_KV) {
            await Promise.all([
              env.RETUBEMATRIX_KV.delete(`binding:${targetUserId}`),
              env.RETUBEMATRIX_KV.delete(`adm_auth:${targetUserId}`)
            ]);
          }
        } catch (_) {
        }
        return json({
          success: true,
          message: `\u0110\xE3 x\xF3a ng\u01B0\u1EDDi d\xF9ng ${target.email} kh\u1ECFi h\u1EC7 th\u1ED1ng th\xE0nh c\xF4ng!`
        });
      }
      if (url.pathname === "/v1/admin/users/reset-hwid" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n reset HWID ng\u01B0\u1EDDi d\xF9ng");
        }
        const body = await request.json().catch(() => ({}));
        const { user_id } = body;
        if (!user_id) return badRequest("Thi\u1EBFu user_id");
        const userRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${user_id}&select=id,email,role,company_id,team_id`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const targetProfiles = await userRes.json().catch(() => []) || [];
        if (!targetProfiles || targetProfiles.length === 0) {
          return badRequest("Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const target = targetProfiles[0];
        if (caller.role === "admin") {
          if (target.company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n reset m\xE1y cho nh\xE2n s\u1EF1 thu\u1ED9c c\xF4ng ty m\xECnh");
          }
          if (target.role === "owner" || target.role === "admin" && target.id !== caller.userId) {
            return forbidden("Admin kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p can thi\u1EC7p m\xE1y c\u1EE7a Owner ho\u1EB7c Admin kh\xE1c");
          }
        } else if (caller.role === "leader") {
          if (target.company_id !== caller.companyId || target.role !== "user") {
            return forbidden(
              "Leader ch\u1EC9 c\xF3 quy\u1EC1n reset m\xE1y cho Nh\xE2n vi\xEAn (user) trong c\xF4ng ty m\xECnh"
            );
          }
        }
        await fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${user_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
        });
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.delete(`binding:${user_id}`);
          }
        } catch (_) {
        }
        return json({
          success: true,
          message: "\u0110\xE3 gi\u1EA3i ph\xF3ng m\xE1y cho ng\u01B0\u1EDDi d\xF9ng th\xE0nh c\xF4ng! Ng\u01B0\u1EDDi d\xF9ng c\xF3 th\u1EC3 \u0111\u0103ng nh\u1EADp tr\xEAn m\xE1y m\u1EDBi."
        });
      }
      if (url.pathname === "/v1/admin/devices" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem th\xF4ng tin thi\u1EBFt b\u1ECB");
        }
        const compFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const [devRes, reqRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?is_active=eq.true&select=id,user_id,company_id,device_name,os_info,client_version,hwid_hash,last_ip,last_heartbeat_at,user_profiles(full_name,email,role),companies(name)&order=last_heartbeat_at.desc${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?status=eq.pending&select=id,user_id,company_id,reason,new_hwid_hash,created_at,user_profiles(full_name,email),companies(name)&order=created_at.desc${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => [])
        ]);
        const rawDevices = Array.isArray(devRes) ? devRes : [];
        const rawResets = Array.isArray(reqRes) ? reqRes : [];
        const devices = rawDevices.map((d) => ({
          id: d.id,
          user_id: d.user_id,
          user_name: d.user_profiles?.full_name || d.user_profiles?.email || "Nh\xE2n vi\xEAn",
          user_email: d.user_profiles?.email || "",
          user_role: d.user_profiles?.role || "user",
          company_name: d.companies?.name || "C\xF4ng Ty",
          device_name: d.device_name || "Windows Desktop",
          os_info: d.os_info || "Windows 11",
          client_version: d.client_version || "0.20.16",
          hwid_hash: d.hwid_hash,
          last_ip: d.last_ip || "127.0.0.1",
          last_heartbeat_at: d.last_heartbeat_at
        }));
        const pendingResets = rawResets.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          user_name: r.user_profiles?.full_name || r.user_profiles?.email || "Nh\xE2n vi\xEAn",
          user_email: r.user_profiles?.email || "",
          company_name: r.companies?.name || "C\xF4ng Ty",
          reason: r.reason,
          new_hwid_hash: r.new_hwid_hash,
          created_at: r.created_at
        }));
        return json({ success: true, devices, pending_resets: pendingResets });
      }
      if (url.pathname === "/v1/admin/devices/review-reset" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin") {
          return forbidden("Ch\u1EC9 Owner ho\u1EB7c Admin m\u1EDBi c\xF3 quy\u1EC1n ph\xEA duy\u1EC7t \u0111\u1ED5i m\xE1y");
        }
        const body = await request.json().catch(() => ({}));
        const { request_id, approved } = body;
        if (!request_id || approved === void 0)
          return badRequest("Thi\u1EBFu request_id ho\u1EB7c approved status");
        if (caller.role === "admin") {
          const reqCheckRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}&select=company_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          );
          const reqChecks = await reqCheckRes.json().catch(() => []) || [];
          if (!reqChecks.length || reqChecks[0].company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n ph\xEA duy\u1EC7t \u0111\u1ED5i m\xE1y cho nh\xE2n s\u1EF1 trong c\xF4ng ty m\xECnh");
          }
        }
        const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/review_hwid_reset_request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            p_request_id: request_id,
            p_approved: approved,
            p_notes: approved ? "Duy\u1EC7t qua Web SaaS Master Control" : "T\u1EEB ch\u1ED1i b\u1EDFi Qu\u1EA3n tr\u1ECB vi\xEAn"
          })
        });
        if (!rpcRes.ok) {
          if (approved) {
            const reqDataRes = await fetch(
              `${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}&select=user_id`,
              {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
              }
            );
            const reqList = await reqDataRes.json();
            const targetUserId = reqList && reqList[0]?.user_id;
            if (targetUserId) {
              await fetch(
                `${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${targetUserId}`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`
                  },
                  body: JSON.stringify({ is_active: false })
                }
              );
              try {
                if (env.RETUBEMATRIX_KV) {
                  await env.RETUBEMATRIX_KV.delete(`binding:${targetUserId}`);
                }
              } catch (_) {
              }
            }
          }
          await fetch(`${env.SUPABASE_URL}/rest/v1/hwid_reset_requests?id=eq.${request_id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              status: approved ? "approved" : "rejected",
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            })
          });
          return json({
            success: true,
            message: approved ? "\u0110\xE3 ph\xEA duy\u1EC7t \u0111\u1ED5i m\xE1y" : "\u0110\xE3 t\u1EEB ch\u1ED1i y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y"
          });
        }
        const rpcResult = await rpcRes.json();
        return json(rpcResult);
      }
      if (url.pathname === "/v1/admin/devices/unbind" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin") {
          return forbidden("Ch\u1EC9 Owner ho\u1EB7c Admin m\u1EDBi c\xF3 quy\u1EC1n h\u1EE7y li\xEAn k\u1EBFt thi\u1EBFt b\u1ECB");
        }
        const body = await request.json().catch(() => ({}));
        const { binding_id } = body;
        if (!binding_id) return badRequest("Thi\u1EBFu binding_id");
        if (caller.role === "admin") {
          const bindCheckRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/device_bindings?id=eq.${binding_id}&select=company_id,user_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          );
          const bindChecks = await bindCheckRes.json().catch(() => []) || [];
          if (!bindChecks.length || bindChecks[0].company_id !== caller.companyId) {
            return forbidden("Admin ch\u1EC9 c\xF3 quy\u1EC1n h\u1EE7y li\xEAn k\u1EBFt thi\u1EBFt b\u1ECB trong c\xF4ng ty m\xECnh");
          }
        }
        await fetch(`${env.SUPABASE_URL}/rest/v1/device_bindings?id=eq.${binding_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ is_active: false, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
        });
        return json({ success: true, message: "\u0110\xE3 h\u1EE7y li\xEAn k\u1EBFt m\xE1y th\xE0nh c\xF4ng" });
      }
      if (url.pathname === "/v1/admin/analytics" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem b\xE1o c\xE1o doanh thu");
        }
        const compFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const anaRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/channel_revenue_daily?select=id,company_id,report_date,views,watch_time_hours,rpm,cpm,estimated_revenue,estimated_revenue_vnd,managed_channels(channel_name),companies(name)&order=report_date.desc&limit=50${compFilter}`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
        );
        const rawAna = await anaRes.json().catch(() => []) || [];
        const analytics = Array.isArray(rawAna) ? rawAna.map((a) => ({
          id: a.id,
          channel_name: a.managed_channels?.channel_name || "YouTube Studio",
          company_name: a.companies?.name || "C\xF4ng Ty",
          report_date: a.report_date,
          views: a.views,
          watch_time_hours: a.watch_time_hours,
          rpm: a.rpm,
          cpm: a.cpm,
          estimated_revenue: a.estimated_revenue,
          estimated_revenue_vnd: a.estimated_revenue_vnd
        })) : [];
        return json({ success: true, analytics });
      }
      if (url.pathname === "/v1/auth/register" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const {
          email,
          password,
          full_name,
          company_code_or_license,
          hwid_hash,
          cpu_id = "UNKNOWN_CPU",
          motherboard_uuid = "UNKNOWN_MB",
          machine_guid = "UNKNOWN_GUID",
          device_name = "Windows Desktop",
          os_info = "Windows 10/11 x64",
          client_version = "0.20.16"
        } = body;
        if (!email || !password) {
          return badRequest("Vui l\xF2ng \u0111i\u1EC1n \u0111\u1EE7 email v\xE0 m\u1EADt kh\u1EA9u");
        }
        const cleanEmail = email.trim().toLowerCase();
        const codeOrLic = (company_code_or_license || "").trim();
        if (!codeOrLic) {
          const adminCreateRes2 = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              email: cleanEmail,
              password,
              email_confirm: true,
              user_metadata: { full_name: full_name || cleanEmail.split("@")[0] }
            })
          });
          if (!adminCreateRes2.ok) {
            const errData = await adminCreateRes2.json().catch(() => ({}));
            return badRequest(errData.msg || errData.message || "Kh\xF4ng th\u1EC3 t\u1EA1o t\xE0i kho\u1EA3n");
          }
          const newUser2 = await adminCreateRes2.json();
          const userId2 = newUser2.id;
          const profileInsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: "resolution=merge-duplicates"
            },
            body: JSON.stringify({
              id: userId2,
              company_id: null,
              role: "user",
              full_name: full_name || cleanEmail.split("@")[0],
              email: cleanEmail,
              commission_rate: 0,
              is_active: false
            })
          });
          if (!profileInsertRes.ok) {
            const profErr = await profileInsertRes.text();
            return internalError("L\u1ED7i t\u1EA1o h\u1ED3 s\u01A1 ng\u01B0\u1EDDi d\xF9ng: " + profErr);
          }
          return json({
            success: true,
            status: "pending_approval",
            pending_approval: true,
            message: "\u0110\u0103ng k\xFD th\xE0nh c\xF4ng! T\xE0i kho\u1EA3n c\u1EE7a b\u1EA1n \u0111ang \u1EDF tr\u1EA1ng th\xE1i ch\u1EDD duy\u1EC7t. Vui l\xF2ng li\xEAn h\u1EC7 Master Owner \u0111\u1EC3 \u0111\u01B0\u1EE3c c\u1EA5p quy\u1EC1n v\xE0 ph\xE2n b\u1ED5 v\xE0o c\xF4ng ty.",
            user: {
              id: userId2,
              email: cleanEmail,
              full_name: full_name || cleanEmail.split("@")[0],
              role: "user",
              company_id: null,
              is_active: false
            },
            user_id: userId2
          });
        }
        if (!hwid_hash) {
          return badRequest(
            "Vui l\xF2ng cung c\u1EA5p th\xF4ng tin ph\u1EA7n c\u1EE9ng m\xE1y (hwid_hash) khi \u0111\u0103ng k\xFD theo c\xF4ng ty/license"
          );
        }
        let companyId = null;
        const role = "user";
        const licRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/licenses?license_key=eq.${encodeURIComponent(codeOrLic)}&status=eq.active&select=id,company_id,max_seats,used_seats,expires_at`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          }
        );
        const licenses = await licRes.json();
        if (licenses && licenses.length > 0) {
          const lic = licenses[0];
          if (new Date(lic.expires_at).getTime() < Date.now()) {
            return badRequest("M\xE3 License n\xE0y \u0111\xE3 h\u1EBFt h\u1EA1n s\u1EED d\u1EE5ng");
          }
          if (lic.used_seats >= lic.max_seats) {
            return badRequest(`License \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n s\u1ED1 m\xE1y t\u1ED1i \u0111a (${lic.max_seats} m\xE1y)`);
          }
          companyId = lic.company_id;
        } else {
          const compRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/companies?code=eq.${encodeURIComponent(codeOrLic.toUpperCase())}&is_active=eq.true&select=id,name`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              }
            }
          );
          const companies = await compRes.json();
          if (companies && companies.length > 0) {
            companyId = companies[0].id;
          } else {
            return badRequest("M\xE3 c\xF4ng ty ho\u1EB7c License Key kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a");
          }
        }
        const adminCreateRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            email_confirm: true,
            user_metadata: { full_name: full_name || cleanEmail.split("@")[0] }
          })
        });
        if (!adminCreateRes.ok) {
          const errData = await adminCreateRes.json().catch(() => ({}));
          return badRequest(errData.msg || errData.message || "Kh\xF4ng th\u1EC3 t\u1EA1o t\xE0i kho\u1EA3n");
        }
        const newUser = await adminCreateRes.json();
        const userId = newUser.id;
        const rpcRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/rpc/setup_registered_profile_and_bind`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              p_user_id: userId,
              p_company_id: companyId,
              p_role: role,
              p_full_name: full_name || email.split("@")[0],
              p_email: email,
              p_hwid_hash: hwid_hash,
              p_cpu_id: cpu_id,
              p_motherboard_uuid: motherboard_uuid,
              p_machine_guid: machine_guid,
              p_device_name: device_name,
              p_os_info: os_info,
              p_client_version: client_version
            })
          }
        );
        const rpcData = await rpcRes.json();
        if (!rpcRes.ok || !rpcData.success) {
          return badRequest(rpcData.error || "L\u1ED7i khi k\xEDch ho\u1EA1t thi\u1EBFt b\u1ECB cho t\xE0i kho\u1EA3n m\u1EDBi");
        }
        return json({
          success: true,
          message: "\u0110\u0103ng k\xFD t\xE0i kho\u1EA3n v\xE0 kh\xF3a thi\u1EBFt b\u1ECB th\xE0nh c\xF4ng! B\u1EA1n c\xF3 th\u1EC3 \u0111\u0103ng nh\u1EADp ngay.",
          user_id: userId
        });
      }
      if (url.pathname === "/v1/auth/login" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const { email, password, hwid_hash } = body;
        if (!email || !password) {
          return badRequest("Vui l\xF2ng cung c\u1EA5p email v\xE0 m\u1EADt kh\u1EA9u");
        }
        const cleanEmail = email.trim().toLowerCase();
        const authUrl = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
        const authRes = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email: cleanEmail, password })
        });
        if (!authRes.ok) {
          const errData = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c",
            "AUTH_FAILED"
          );
        }
        const authData = await authRes.json();
        const userId = authData.user?.id;
        if (!userId) {
          return internalError("Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c \u0111\u1ECBnh danh ng\u01B0\u1EDDi d\xF9ng sau khi x\xE1c th\u1EF1c");
        }
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          }
        );
        const profiles = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];
        const isOwnerAccount = profile?.role === "owner" || isMasterOwner(userId, cleanEmail, profile?.role) || cleanEmail === "dungdong333@gmail.com";
        if (isOwnerAccount) {
          return json({
            success: true,
            status: "active",
            role: "owner",
            user_role: "owner",
            owner_bypass: true,
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user?.email || cleanEmail,
              full_name: profile?.full_name || "Ti\u1EBFn D\u0169ng (Master Owner)",
              role: "owner",
              company_id: profile?.company_id || "e51f4953-587e-4a5e-af09-e76471ca0326",
              user_metadata: authData.user?.user_metadata
            },
            device: {
              success: true,
              status: "active",
              bound: true,
              role: "owner",
              owner_bypass: true,
              full_name: profile?.full_name || "Ti\u1EBFn D\u0169ng (Master Owner)",
              company_id: profile?.company_id || "e51f4953-587e-4a5e-af09-e76471ca0326",
              company_name: "RETubeMatrix HQ",
              company_code: "RTM-HQ",
              commission_rate: 0,
              tier: "enterprise",
              mask_revenue_from_staff: false,
              cross_leader_collaboration: true,
              features: {
                unlimited_seats: true,
                bkt_daily_quota: 9999,
                owner_unrestricted: true,
                max_browser_profiles: 999
              }
            }
          });
        }
        if (!profile) {
          return forbidden("Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1 ng\u01B0\u1EDDi d\xF9ng trong h\u1EC7 th\u1ED1ng.", "ACCOUNT_DISABLED");
        }
        if (profile.is_active === false || profile.companies && profile.companies.is_active === false) {
          return forbidden("T\xE0i kho\u1EA3n ho\u1EB7c doanh nghi\u1EC7p \u0111\xE3 b\u1ECB t\u1EA1m kh\xF3a.", "ACCOUNT_DISABLED");
        }
        const effectiveRole = profile.role || "user";
        if (hwid_hash) {
          const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
          const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              p_user_id: userId,
              p_hwid_hash: hwid_hash,
              p_cpu_id: body.cpu_id || body.device_info?.cpu_id || "UNKNOWN_CPU",
              p_motherboard_uuid: body.motherboard_uuid || body.device_info?.motherboard_uuid || "UNKNOWN_MB",
              p_machine_guid: body.machine_guid || body.device_info?.machine_guid || "UNKNOWN_GUID",
              p_device_name: body.device_name || body.device_info?.device_name || "Windows Desktop",
              p_os_info: body.os_info || body.device_info?.os_info || "Windows 10/11 x64",
              p_client_version: body.client_version || body.device_info?.client_version || "0.20.16",
              p_ip: clientIp
            })
          });
          if (!rpcRes.ok) {
            const rpcErr = await rpcRes.text();
            return internalError("L\u1ED7i h\u1EC7 th\u1ED1ng khi r\xE0ng bu\u1ED9c thi\u1EBFt b\u1ECB (RPC failed)", rpcErr);
          }
          const rpcData = await rpcRes.json();
          if (!rpcData.success) {
            return forbidden(
              rpcData.error || "Kh\xF4ng th\u1EC3 k\xEDch ho\u1EA1t thi\u1EBFt b\u1ECB",
              rpcData.code || "BINDING_REJECTED",
              { ...rpcData, user_id: userId }
            );
          }
          try {
            if (env.RETUBEMATRIX_KV) {
              await env.RETUBEMATRIX_KV.put(
                `binding:${userId}`,
                JSON.stringify({
                  hwid_hash,
                  role: rpcData.role || effectiveRole,
                  bound_at: Date.now(),
                  clientIp
                }),
                { expirationTtl: 86400 }
              );
            }
          } catch (_) {
          }
          return json({
            success: true,
            role: rpcData.role || effectiveRole,
            user_role: rpcData.role || effectiveRole,
            status: rpcData.status || "active",
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user.email,
              full_name: profile.full_name,
              role: rpcData.role || effectiveRole,
              company_id: profile.company_id,
              user_metadata: authData.user.user_metadata
            },
            device: {
              ...rpcData,
              role: rpcData.role || effectiveRole
            }
          });
        }
        return json({
          success: true,
          role: effectiveRole,
          user_role: effectiveRole,
          status: "active",
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token,
          user: {
            id: userId,
            email: authData.user.email,
            full_name: profile.full_name,
            role: effectiveRole,
            company_id: profile.company_id,
            user_metadata: authData.user.user_metadata
          },
          device: {
            success: true,
            role: effectiveRole,
            company_id: profile.company_id
          }
        });
      }
      if (url.pathname === "/v1/auth/verify-device" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const { email, password, hwid_hash } = body;
        const cpu_id = body.cpu_id || body.device_info?.cpu_id || "UNKNOWN_CPU";
        const motherboard_uuid = body.motherboard_uuid || body.device_info?.motherboard_uuid || "UNKNOWN_MB";
        const machine_guid = body.machine_guid || body.device_info?.machine_guid || "UNKNOWN_GUID";
        const device_name = body.device_name || body.device_info?.device_name || "Windows Desktop";
        const os_info = body.os_info || body.device_info?.os_info || "Windows 10/11 x64";
        const client_version = body.client_version || body.device_info?.client_version || "0.20.16";
        if (!email) {
          return badRequest("Missing required field: email");
        }
        const isMaster = (email || "").trim().toLowerCase() === "dungdong333@gmail.com";
        if (!hwid_hash && !isMaster) {
          return badRequest("Missing required field: hwid_hash");
        }
        if (!password) {
          return badRequest("Missing required field: password");
        }
        const authUrl = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`;
        const authRes = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password })
        });
        if (!authRes.ok) {
          const errData = await authRes.json().catch(() => ({}));
          return unauthorized(
            errData.error_description || errData.msg || "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng ch\xEDnh x\xE1c",
            "AUTH_FAILED"
          );
        }
        const authData = await authRes.json();
        const userId = authData.user?.id;
        if (!userId) {
          return internalError("Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c \u0111\u1ECBnh danh ng\u01B0\u1EDDi d\xF9ng sau khi x\xE1c th\u1EF1c");
        }
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,full_name,email,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          }
        );
        const profiles = await profileRes.json().catch(() => []);
        const profile = profiles && profiles[0];
        const isOwnerAccount = profile?.role === "owner" || (authData.user.email || "").toLowerCase() === "dungdong333@gmail.com" || (email || "").toLowerCase() === "dungdong333@gmail.com";
        if (!isOwnerAccount) {
          if (!profile) {
            return forbidden("Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1 ng\u01B0\u1EDDi d\xF9ng trong h\u1EC7 th\u1ED1ng.", "ACCOUNT_DISABLED");
          }
          if (profile.is_active === false || profile.companies && profile.companies.is_active === false) {
            return forbidden("T\xE0i kho\u1EA3n ho\u1EB7c doanh nghi\u1EC7p \u0111\xE3 b\u1ECB t\u1EA1m kh\xF3a.", "ACCOUNT_DISABLED");
          }
          if (!profile.company_id) {
            return forbidden(
              "T\xE0i kho\u1EA3n ch\u01B0a \u0111\u01B0\u1EE3c g\xE1n v\xE0o doanh nghi\u1EC7p n\xE0o. Vui l\xF2ng li\xEAn h\u1EC7 qu\u1EA3n tr\u1ECB vi\xEAn.",
              "ACCOUNT_DISABLED"
            );
          }
        }
        if (isOwnerAccount) {
          try {
            await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              },
              body: JSON.stringify({
                p_user_id: userId,
                p_hwid_hash: hwid_hash,
                p_cpu_id: cpu_id,
                p_motherboard_uuid: motherboard_uuid,
                p_machine_guid: machine_guid,
                p_device_name: device_name,
                p_os_info: os_info,
                p_client_version: client_version,
                p_ip: clientIp
              })
            });
          } catch (_) {
          }
          if (env.RETUBEMATRIX_KV && authData.access_token) {
            try {
              const ownerCtx = {
                userId,
                email: authData.user.email,
                role: "owner",
                companyId: profile?.company_id || "e51f4953-587e-4a5e-af09-e76471ca0326",
                fullName: profile?.full_name || "Ti\u1EBFn D\u0169ng (Master Owner)",
                teamId: null
              };
              await env.RETUBEMATRIX_KV.put(
                `adm_auth:${authData.access_token.slice(-32)}`,
                JSON.stringify(ownerCtx),
                { expirationTtl: 7 * 86400 }
              );
            } catch (_) {
            }
          }
          return json({
            success: true,
            status: "active",
            role: "owner",
            user_role: "owner",
            owner_bypass: true,
            access_token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_in: authData.expires_in,
            token: authData.access_token,
            user: {
              id: userId,
              email: authData.user.email,
              user_metadata: authData.user.user_metadata
            },
            device: {
              success: true,
              status: "active",
              bound: true,
              role: "owner",
              owner_bypass: true,
              full_name: profile?.full_name || "Ti\u1EBFn D\u0169ng (Master Owner)",
              company_id: profile?.company_id || "e51f4953-587e-4a5e-af09-e76471ca0326",
              company_name: "RETubeMatrix HQ",
              company_code: "RTM-HQ",
              commission_rate: 0,
              tier: "enterprise",
              mask_revenue_from_staff: false,
              cross_leader_collaboration: true,
              features: {
                unlimited_seats: true,
                bkt_daily_quota: 9999,
                owner_unrestricted: true,
                max_browser_profiles: 999
              }
            }
          });
        }
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/verify_or_bind_device`;
        const rpcRes = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            p_user_id: userId,
            p_hwid_hash: hwid_hash,
            p_cpu_id: cpu_id,
            p_motherboard_uuid: motherboard_uuid,
            p_machine_guid: machine_guid,
            p_device_name: device_name,
            p_os_info: os_info,
            p_client_version: client_version,
            p_ip: clientIp
          })
        });
        if (!rpcRes.ok) {
          const rpcErr = await rpcRes.text();
          return internalError("L\u1ED7i h\u1EC7 th\u1ED1ng khi r\xE0ng bu\u1ED9c thi\u1EBFt b\u1ECB (RPC failed)", rpcErr);
        }
        const rpcData = await rpcRes.json();
        if (!rpcData.success) {
          return forbidden(
            rpcData.error || "Kh\xF4ng th\u1EC3 k\xEDch ho\u1EA1t thi\u1EBFt b\u1ECB",
            rpcData.code || "BINDING_REJECTED",
            { ...rpcData, user_id: userId }
          );
        }
        try {
          if (env.RETUBEMATRIX_KV) {
            await env.RETUBEMATRIX_KV.put(
              `binding:${userId}`,
              JSON.stringify({ hwid_hash, role: rpcData.role, bound_at: Date.now(), clientIp }),
              { expirationTtl: 86400 }
            );
          }
        } catch (kvErr) {
          console.error("KV cache error:", kvErr);
        }
        const effectiveRole = rpcData?.role || profile?.role || "user";
        return json({
          success: true,
          role: effectiveRole,
          user_role: effectiveRole,
          status: rpcData?.status || "active",
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token,
          user: {
            id: userId,
            email: authData.user.email,
            user_metadata: authData.user.user_metadata
          },
          device: {
            ...rpcData,
            role: effectiveRole
          }
        });
      }
      if ((url.pathname === "/v1/auth/request-hwid-reset" || url.pathname === "/v1/auth/request-device-change") && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const { user_id, new_hwid_hash, new_device_info, reason } = body;
        if (!user_id || !new_hwid_hash || !reason) {
          return badRequest("Thi\u1EBFu th\xF4ng tin user_id, new_hwid_hash ho\u1EB7c l\xFD do \u0111\u1ED5i m\xE1y");
        }
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/submit_hwid_reset_request`;
        const rpcRes = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            p_user_id: user_id,
            p_new_hwid_hash: new_hwid_hash,
            p_new_device_info: new_device_info || {},
            p_reason: reason
          })
        });
        if (!rpcRes.ok) {
          const errText = await rpcRes.text();
          return internalError("L\u1ED7i g\u1EEDi y\xEAu c\u1EA7u \u0111\u1ED5i m\xE1y", errText);
        }
        const rpcResult = await rpcRes.json();
        return json(rpcResult);
      }
      if (url.pathname === "/v1/device/heartbeat" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const userId = body.user_id || body.userId;
        const hwidHash = body.hwid_hash || body.hwidHash;
        if (!userId || !hwidHash) {
          return badRequest("Thi\u1EBFu th\xF4ng tin user_id ho\u1EB7c hwid_hash");
        }
        const profileRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=id,role,company_id,is_active,companies(id,is_active)`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            }
          }
        );
        const profiles = await profileRes.json().catch(() => []) || [];
        const profile = profiles[0];
        if (!profile) {
          return forbidden("T\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a.", "SESSION_REVOKED", {
            message: "T\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a."
          });
        }
        const isOwner = isMasterOwner(profile.id, void 0, profile.role);
        if (!isOwner) {
          if (profile.is_active === false || profile.companies && profile.companies.is_active === false) {
            return forbidden("T\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a.", "SESSION_REVOKED", {
              message: "T\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB v\xF4 hi\u1EC7u h\xF3a."
            });
          }
        }
        const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const patchBody = {
          last_heartbeat_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (clientIp) {
          patchBody.last_ip = clientIp;
        }
        await fetch(
          `${env.SUPABASE_URL}/rest/v1/device_bindings?user_id=eq.${userId}&hwid_hash=eq.${hwidHash}&is_active=eq.true`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`
            },
            body: JSON.stringify(patchBody)
          }
        );
        const effectiveRole = isOwner ? "owner" : profile.role || "user";
        const effectiveCompanyId = profile.company_id || (isOwner ? "e51f4953-587e-4a5e-af09-e76471ca0326" : null);
        return json({
          success: true,
          timestamp: Date.now(),
          user_role: effectiveRole,
          role: effectiveRole,
          company_id: effectiveCompanyId
        });
      }
      if (url.pathname === "/v1/auth/refresh" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const { refresh_token } = body;
        if (!refresh_token) {
          return badRequest("Thi\u1EBFu refresh_token");
        }
        const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token })
        });
        if (!authRes.ok) {
          return unauthorized("Refresh token kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n", "TOKEN_EXPIRED");
        }
        const authData = await authRes.json();
        return json({
          success: true,
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expires_in: authData.expires_in,
          token: authData.access_token
        });
      }
      if (url.pathname === "/v1/telemetry/studio-analytics" && request.method === "POST") {
        const rawBody = await request.text();
        const signature = request.headers.get("x-signature") || request.headers.get("x-rtm-signature") || request.headers.get("x-hub-signature-256");
        if (!signature) {
          return unauthorized(
            "Missing required HMAC signature header (x-signature)",
            "MISSING_SIGNATURE"
          );
        }
        const expectedSig = await computeHmacSha256(rawBody, env.SHARED_TELEMETRY_HMAC_SECRET);
        const cleanSig = signature.replace(/^sha256=/, "").toLowerCase();
        if (!timingSafeEqual(expectedSig.toLowerCase(), cleanSig)) {
          return unauthorized("Invalid HMAC signature", "INVALID_SIGNATURE");
        }
        let payload;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return badRequest("Invalid JSON body");
        }
        const timestampHeader = request.headers.get("x-timestamp");
        const reqTimestamp = timestampHeader ? parseInt(timestampHeader, 10) : payload.timestamp;
        if (reqTimestamp) {
          const nowSec = Math.floor(Date.now() / 1e3);
          if (Math.abs(nowSec - reqTimestamp) > 300) {
            return unauthorized(
              "Request timestamp out of allowed window (drift detected)",
              "TIMESTAMP_DRIFT"
            );
          }
        }
        if (env.RETUBEMATRIX_KV) {
          const clientIp = request.headers.get("cf-connecting-ip") || "unknown_ip";
          const rateLimitKeyId = payload.channel_id || payload.hwid_hash || clientIp;
          const currentMinute = Math.floor(Date.now() / 6e4);
          const kvRateLimitKey = `rl:telemetry:${rateLimitKeyId}:${currentMinute}`;
          const currentCountStr = await env.RETUBEMATRIX_KV.get(kvRateLimitKey);
          const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;
          if (currentCount >= 60) {
            return json(
              {
                success: false,
                code: "RATE_LIMITED",
                error: "Qu\xE1 t\u1EA3i t\u1EA7n su\u1EA5t g\u1EEDi telemetry (t\u1ED1i \u0111a 60 requests/ph\xFAt)"
              },
              429,
              { "Retry-After": "60" }
            );
          }
          await env.RETUBEMATRIX_KV.put(kvRateLimitKey, (currentCount + 1).toString(), {
            expirationTtl: 120
          });
        }
        const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/ingest_studio_analytics`;
        const rpcRes = await fetch(rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            p_company_id: payload.company_id || null,
            p_youtube_channel_id: payload.channel_id || null,
            p_channel_name: payload.channel_name || null,
            p_report_date: payload.report_date,
            p_views: payload.views || 0,
            p_watch_time_hours: payload.watch_time_hours || 0,
            p_subscribers_gained: payload.subscribers_gained || 0,
            p_estimated_revenue: payload.estimated_revenue || 0,
            p_estimated_revenue_vnd: payload.estimated_revenue_vnd || 0,
            p_rpm: payload.rpm || 0,
            p_cpm: payload.cpm || 0,
            p_monetization_status: payload.monetization_status || "active"
          })
        });
        if (!rpcRes.ok) {
          const errText = await rpcRes.text();
          return internalError("Kh\xF4ng th\u1EC3 n\u1EA1p d\u1EEF li\u1EC7u v\xE0o c\u01A1 s\u1EDF d\u1EEF li\u1EC7u Supabase", errText);
        }
        const rpcResult = await rpcRes.json().catch(() => ({ success: true }));
        return json({
          success: true,
          message: "Studio analytics snapshot ingested successfully",
          synced_at: (/* @__PURE__ */ new Date()).toISOString(),
          result: rpcResult
        });
      }
      if (url.pathname === "/v1/telemetry/sync-competitor" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        const body = await request.json().catch(() => ({}));
        const {
          action = "upsert",
          channel_name,
          channel_url,
          youtube_channel_id,
          primary_keyword = "",
          subscriber_count = 0,
          total_views = 0,
          total_videos = 0,
          recent_5_videos = []
        } = body;
        if (!channel_url) {
          return badRequest("Vui l\xF2ng cung c\u1EA5p URL k\xEAnh \u0111\u1ED1i th\u1EE7 (channel_url)");
        }
        const compId = caller.companyId || "e51f4953-587e-4a5e-af09-e76471ca0326";
        const cleanUrl = channel_url.trim();
        if (action === "delete") {
          const delRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?company_id=eq.${compId}&user_id=eq.${caller.userId}&channel_url=eq.${encodeURIComponent(cleanUrl)}`,
            {
              method: "DELETE",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              }
            }
          );
          if (!delRes.ok) {
            const err = await delRes.text();
            return internalError("L\u1ED7i x\xF3a k\xEAnh \u0111\u1ED1i th\u1EE7 tr\xEAn m\xE1y ch\u1EE7: " + err);
          }
          return json({
            success: true,
            message: "\u0110\xE3 h\u1EE7y theo d\xF5i v\xE0 x\xF3a \u0111\u1ED3ng b\u1ED9 k\xEAnh \u0111\u1ED1i th\u1EE7 th\xE0nh c\xF4ng",
            channel_url: cleanUrl
          });
        }
        const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_competitor_channels`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            company_id: compId,
            team_id: caller.teamId || null,
            user_id: caller.userId,
            channel_name: channel_name || cleanUrl.split("/").pop() || "\u0110\u1ED1i th\u1EE7",
            channel_url: cleanUrl,
            youtube_channel_id: youtube_channel_id || null,
            primary_keyword: String(primary_keyword || ""),
            subscriber_count: Number(subscriber_count) || 0,
            total_views: Number(total_views) || 0,
            total_videos: Number(total_videos) || 0,
            recent_5_videos: Array.isArray(recent_5_videos) ? recent_5_videos : [],
            is_active: true,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (!upsertRes.ok) {
          const err = await upsertRes.text();
          return internalError("L\u1ED7i l\u01B0u k\xEAnh \u0111\u1ED1i th\u1EE7 tr\xEAn m\xE1y ch\u1EE7: " + err);
        }
        return json({
          success: true,
          message: "\u0110\xE3 \u0111\u1ED3ng b\u1ED9 k\xEAnh \u0111\u1ED1i th\u1EE7 th\xE0nh c\xF4ng",
          channel_url: cleanUrl
        });
      }
      if (url.pathname === "/v1/telemetry/sync-managed-channel" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        const body = await request.json().catch(() => ({}));
        const {
          action = "upsert",
          channel_type,
          channel_name,
          youtube_channel_id,
          channel_url,
          profile_id,
          total_views = 0,
          estimated_revenue = 0
        } = body;
        if (!channel_type || !youtube_channel_id) {
          return badRequest("Vui l\xF2ng cung c\u1EA5p channel_type (target|test) v\xE0 youtube_channel_id");
        }
        const compId = caller.companyId || "e51f4953-587e-4a5e-af09-e76471ca0326";
        if (action === "delete") {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?company_id=eq.${compId}&user_id=eq.${caller.userId}&youtube_channel_id=eq.${encodeURIComponent(youtube_channel_id)}&channel_type=eq.${channel_type}`,
            {
              method: "DELETE",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              }
            }
          );
          return json({
            success: true,
            message: "\u0110\xE3 x\xF3a k\xEAnh qu\u1EA3n l\xFD \u0111\u1ED3ng b\u1ED9 th\xE0nh c\xF4ng"
          });
        }
        const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/user_managed_channels`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            company_id: compId,
            team_id: caller.teamId || null,
            user_id: caller.userId,
            channel_type,
            channel_name: channel_name || youtube_channel_id,
            youtube_channel_id,
            channel_url: channel_url || null,
            profile_id: profile_id || null,
            total_views: Number(total_views) || 0,
            estimated_revenue: Number(estimated_revenue) || 0,
            is_active: true,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (!upsertRes.ok) {
          const err = await upsertRes.text();
          return internalError("L\u1ED7i l\u01B0u k\xEAnh qu\u1EA3n l\xFD: " + err);
        }
        return json({
          success: true,
          message: "\u0110\xE3 \u0111\u1ED3ng b\u1ED9 k\xEAnh qu\u1EA3n l\xFD th\xE0nh c\xF4ng"
        });
      }
      if (url.pathname === "/v1/telemetry/report-bkt-result" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        const body = await request.json().catch(() => ({}));
        const { competitor_channel_url, status = "green" } = body;
        const compId = caller.companyId || "e51f4953-587e-4a5e-af09-e76471ca0326";
        const isGreen = status === "green" || status === "completed";
        if (competitor_channel_url) {
          const field = isGreen ? "videos_tested_green" : "videos_tested_red";
          const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?company_id=eq.${compId}&user_id=eq.${caller.userId}&channel_url=eq.${encodeURIComponent(competitor_channel_url)}`;
          const getRes = await fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          });
          const list = await getRes.json().catch(() => []);
          if (list && list.length > 0) {
            const current = list[0];
            const newVal = (Number(current[field]) || 0) + 1;
            await fetch(queryUrl, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              },
              body: JSON.stringify({ [field]: newVal, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
            });
          }
        }
        return json({
          success: true,
          message: "\u0110\xE3 ghi nh\u1EADn k\u1EBFt qu\u1EA3 test BKT th\xE0nh c\xF4ng",
          status: isGreen ? "green" : "red"
        });
      }
      if (url.pathname === "/v1/telemetry/report-upload" && request.method === "POST") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        const body = await request.json().catch(() => ({}));
        const { target_youtube_channel_id } = body;
        const compId = caller.companyId || "e51f4953-587e-4a5e-af09-e76471ca0326";
        if (target_youtube_channel_id) {
          const queryUrl = `${env.SUPABASE_URL}/rest/v1/user_managed_channels?company_id=eq.${compId}&user_id=eq.${caller.userId}&youtube_channel_id=eq.${encodeURIComponent(target_youtube_channel_id)}&channel_type=eq.target`;
          const getRes = await fetch(queryUrl, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          });
          const list = await getRes.json().catch(() => []);
          if (list && list.length > 0) {
            const current = list[0];
            await fetch(queryUrl, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`
              },
              body: JSON.stringify({
                videos_uploaded_today: (Number(current.videos_uploaded_today) || 0) + 1,
                videos_uploaded_week: (Number(current.videos_uploaded_week) || 0) + 1,
                videos_uploaded_month: (Number(current.videos_uploaded_month) || 0) + 1,
                updated_at: (/* @__PURE__ */ new Date()).toISOString()
              })
            });
          }
        }
        return json({
          success: true,
          message: "\u0110\xE3 ghi nh\u1EADn xu\u1EA5t b\u1EA3n video l\xEAn K\xEAnh \u0110\xEDch th\xE0nh c\xF4ng"
        });
      }
      if (url.pathname === "/v1/admin/work-reports" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        let userFilter = "";
        let compFilter = "";
        if (caller.role === "owner") {
          const queryComp = url.searchParams.get("company_id");
          if (queryComp) {
            userFilter = `&company_id=eq.${queryComp}`;
            compFilter = `&company_id=eq.${queryComp}`;
          }
        } else if (caller.role === "admin") {
          userFilter = `&company_id=eq.${caller.companyId}`;
          compFilter = `&company_id=eq.${caller.companyId}`;
        } else if (caller.role === "leader") {
          userFilter = `&company_id=eq.${caller.companyId}&or=(team_id.eq.${caller.teamId},id.eq.${caller.userId})`;
          compFilter = `&company_id=eq.${caller.companyId}`;
        } else {
          userFilter = `&id=eq.${caller.userId}`;
          compFilter = `&company_id=eq.${caller.companyId}&user_id=eq.${caller.userId}`;
        }
        const [usersRes, managedRes, compRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,full_name,email,role,company_id,team_id,assigned_niche,companies(id,name,code)&order=created_at.asc${userFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?is_active=eq.true${compFilter}&order=created_at.desc`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?is_active=eq.true${compFilter}&order=created_at.desc`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => [])
        ]);
        const usersList = Array.isArray(usersRes) ? usersRes : [];
        const managedList = Array.isArray(managedRes) ? managedRes : [];
        const competitorList = Array.isArray(compRes) ? compRes : [];
        const reports = usersList.map((u) => {
          const userManaged = managedList.filter((m) => m.user_id === u.id);
          const userCompetitors = competitorList.filter((c) => c.user_id === u.id);
          const targetChannels = userManaged.filter((m) => m.channel_type === "target");
          const testChannels = userManaged.filter((m) => m.channel_type === "test");
          let uploadsToday = 0;
          let uploadsWeek = 0;
          let uploadsMonth = 0;
          let totalViews = 0;
          let totalRevenueUsd = 0;
          targetChannels.forEach((tc) => {
            uploadsToday += Number(tc.videos_uploaded_today) || 0;
            uploadsWeek += Number(tc.videos_uploaded_week) || 0;
            uploadsMonth += Number(tc.videos_uploaded_month) || 0;
            totalViews += Number(tc.total_views) || 0;
            totalRevenueUsd += Number(tc.estimated_revenue) || 0;
          });
          let totalGreen = 0;
          let totalRed = 0;
          userCompetitors.forEach((c) => {
            totalGreen += Number(c.videos_tested_green) || 0;
            totalRed += Number(c.videos_tested_red) || 0;
          });
          const totalTested = totalGreen + totalRed;
          const qualityScore = totalTested > 0 ? Math.round(totalGreen / totalTested * 100) : 100;
          return {
            user_id: u.id,
            full_name: u.full_name || u.email?.split("@")[0] || "Th\xE0nh vi\xEAn",
            email: u.email,
            role: u.role,
            company_id: u.company_id,
            company_name: u.companies?.name || "Doanh Nghi\u1EC7p",
            team_id: u.team_id,
            assigned_niche: u.assigned_niche || "T\u1ED5ng h\u1EE3p",
            target_channels_count: targetChannels.length,
            target_channels: targetChannels.map((tc) => ({
              id: tc.id,
              channel_name: tc.channel_name,
              youtube_channel_id: tc.youtube_channel_id,
              channel_url: tc.channel_url,
              videos_uploaded_today: tc.videos_uploaded_today,
              videos_uploaded_week: tc.videos_uploaded_week,
              videos_uploaded_month: tc.videos_uploaded_month,
              total_views: tc.total_views,
              estimated_revenue: tc.estimated_revenue
            })),
            test_channels_count: testChannels.length,
            competitor_channels_count: userCompetitors.length,
            competitor_channels: userCompetitors.map((cc) => ({
              id: cc.id,
              channel_name: cc.channel_name,
              channel_url: cc.channel_url,
              youtube_channel_id: cc.youtube_channel_id,
              primary_keyword: cc.primary_keyword,
              subscriber_count: cc.subscriber_count,
              total_views: cc.total_views,
              total_videos: cc.total_videos,
              recent_5_videos: cc.recent_5_videos || [],
              videos_tested_green: cc.videos_tested_green,
              videos_tested_red: cc.videos_tested_red
            })),
            videos_uploaded_today: uploadsToday,
            videos_uploaded_week: uploadsWeek,
            videos_uploaded_month: uploadsMonth,
            videos_tested_green: totalGreen,
            videos_tested_red: totalRed,
            total_views: totalViews,
            estimated_revenue_usd: totalRevenueUsd,
            estimated_revenue_vnd: totalRevenueUsd * 25e3,
            quality_score: qualityScore
          };
        });
        const sortedForLeaderboard = [...reports].sort((a, b) => {
          if (b.target_channels_count !== a.target_channels_count) {
            return b.target_channels_count - a.target_channels_count;
          }
          if (b.total_views !== a.total_views) {
            return b.total_views - a.total_views;
          }
          return b.videos_uploaded_today - a.videos_uploaded_today;
        });
        const leaderboard = sortedForLeaderboard.map((item, idx) => ({
          rank: idx + 1,
          user_id: item.user_id,
          full_name: item.full_name,
          email: item.email,
          role: item.role,
          target_channels_count: item.target_channels_count,
          total_views: item.total_views,
          estimated_revenue_usd: item.estimated_revenue_usd,
          estimated_revenue_vnd: item.estimated_revenue_vnd,
          videos_uploaded_today: item.videos_uploaded_today,
          quality_score: item.quality_score
        }));
        return json({
          success: true,
          staff_reports: reports,
          leaderboard,
          total_monitored_competitors: competitorList.length,
          total_target_channels: managedList.filter((m) => m.channel_type === "target").length,
          total_test_channels: managedList.filter((m) => m.channel_type === "test").length
        });
      }
      if (url.pathname === "/v1/admin/teams-comparison" && request.method === "GET") {
        const { auth: caller, errorResponse } = await authenticateAdminCaller(
          request,
          env,
          serviceKey
        );
        if (errorResponse) return errorResponse;
        if (caller.role !== "owner" && caller.role !== "admin" && caller.role !== "leader") {
          return forbidden("B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp b\xE1o c\xE1o so s\xE1nh \u0111\u1ED9i nh\xF3m");
        }
        const compFilter = caller.role === "owner" ? "" : `&company_id=eq.${caller.companyId}`;
        const [teamsRes, usersRes, managedRes, compRes] = await Promise.all([
          fetch(
            `${env.SUPABASE_URL}/rest/v1/teams?select=id,name,company_id,leader_id,created_at${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_profiles?select=id,full_name,email,role,company_id,team_id${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_managed_channels?is_active=eq.true${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => []),
          fetch(
            `${env.SUPABASE_URL}/rest/v1/user_competitor_channels?is_active=eq.true${compFilter}`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          ).then((r) => r.json()).catch(() => [])
        ]);
        const teamsList = Array.isArray(teamsRes) ? teamsRes : [];
        const usersList = Array.isArray(usersRes) ? usersRes : [];
        const managedList = Array.isArray(managedRes) ? managedRes : [];
        const competitorList = Array.isArray(compRes) ? compRes : [];
        const leaders = usersList.filter((u) => u.role === "leader");
        const teamStats = [];
        if (teamsList.length > 0) {
          teamsList.forEach((t) => {
            const teamUsers = usersList.filter((u) => u.team_id === t.id);
            const userIds = new Set(teamUsers.map((u) => u.id));
            const teamManaged = managedList.filter((m) => userIds.has(m.user_id));
            const teamCompetitors = competitorList.filter((c) => userIds.has(c.user_id));
            const targetChannels = teamManaged.filter((m) => m.channel_type === "target");
            let uploadsToday = 0;
            let totalViews = 0;
            let totalRevUsd = 0;
            targetChannels.forEach((tc) => {
              uploadsToday += Number(tc.videos_uploaded_today) || 0;
              totalViews += Number(tc.total_views) || 0;
              totalRevUsd += Number(tc.estimated_revenue) || 0;
            });
            let green = 0;
            let red = 0;
            teamCompetitors.forEach((c) => {
              green += Number(c.videos_tested_green) || 0;
              red += Number(c.videos_tested_red) || 0;
            });
            const tested = green + red;
            const qualityRate = tested > 0 ? Math.round(green / tested * 100) : 100;
            const leader = teamUsers.find((u) => u.id === t.leader_id || u.role === "leader");
            teamStats.push({
              team_id: t.id,
              team_name: t.name || "\u0110\u1ED9i Nh\xF3m",
              leader_name: leader?.full_name || "Ch\u01B0a ch\u1EC9 \u0111\u1ECBnh Leader",
              leader_email: leader?.email || "",
              members_count: teamUsers.length,
              target_channels_count: targetChannels.length,
              competitor_channels_count: teamCompetitors.length,
              videos_uploaded_today: uploadsToday,
              total_views: totalViews,
              revenue_usd: totalRevUsd,
              revenue_vnd: totalRevUsd * 25e3,
              videos_tested_green: green,
              videos_tested_red: red,
              quality_rate: qualityRate
            });
          });
        } else if (leaders.length > 0) {
          leaders.forEach((lead, idx) => {
            const teamManaged = managedList.filter((m) => m.user_id === lead.id);
            const teamCompetitors = competitorList.filter((c) => c.user_id === lead.id);
            const targetChannels = teamManaged.filter((m) => m.channel_type === "target");
            let uploadsToday = 0;
            let totalViews = 0;
            let totalRevUsd = 0;
            targetChannels.forEach((tc) => {
              uploadsToday += Number(tc.videos_uploaded_today) || 0;
              totalViews += Number(tc.total_views) || 0;
              totalRevUsd += Number(tc.estimated_revenue) || 0;
            });
            let green = 0;
            let red = 0;
            teamCompetitors.forEach((c) => {
              green += Number(c.videos_tested_green) || 0;
              red += Number(c.videos_tested_red) || 0;
            });
            const tested = green + red;
            const qualityRate = tested > 0 ? Math.round(green / tested * 100) : 100;
            teamStats.push({
              team_id: lead.id,
              team_name: `Nh\xF3m Leader ${lead.full_name || "Nh\xF3m " + (idx + 1)}`,
              leader_name: lead.full_name || lead.email,
              leader_email: lead.email,
              members_count: 1,
              target_channels_count: targetChannels.length,
              competitor_channels_count: teamCompetitors.length,
              videos_uploaded_today: uploadsToday,
              total_views: totalViews,
              revenue_usd: totalRevUsd,
              revenue_vnd: totalRevUsd * 25e3,
              videos_tested_green: green,
              videos_tested_red: red,
              quality_rate: qualityRate
            });
          });
        }
        const evaluatedTeams = teamStats.map((team) => {
          const notes = [];
          if (team.quality_rate >= 95) notes.push("Ki\u1EC3m duy\u1EC7t BKT s\u1EA1ch xu\u1EA5t s\u1EAFc (\u226595%)");
          if (team.target_channels_count > 0)
            notes.push(`V\u1EADn h\xE0nh ${team.target_channels_count} k\xEAnh \u0111\xEDch`);
          if (team.videos_uploaded_today > 0)
            notes.push(`\u0110\u0103ng ${team.videos_uploaded_today} video h\xF4m nay`);
          return {
            ...team,
            evaluation: notes.length > 0 ? notes.join(" \u2022 ") : "\u0110ang thi\u1EBFt l\u1EADp k\xEAnh v\xE0 s\u1EA3n xu\u1EA5t ban \u0111\u1EA7u"
          };
        });
        return json({
          success: true,
          teams_comparison: evaluatedTeams
        });
      }
      return json(
        {
          success: false,
          code: "NOT_FOUND",
          error: `Route not found: ${request.method} ${url.pathname}`
        },
        404
      );
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return internalError("Unhandled gateway exception: " + msg);
    }
  }
};
export {
  MASTER_OWNER_EMAIL,
  MASTER_OWNER_ID,
  index_default as default,
  getAdminAuthContext,
  isMasterOwner
};
//# sourceMappingURL=index.js.map
