import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  UserCheck,
  UserPlus,
  Users2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { isOwnerEmail, useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import type { UserRole } from '../../types/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  canClose?: boolean;
  closable?: boolean;
  onOpenSaasHub?: () => void;
}

type AuthTab = 'login' | 'register' | 'reset';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  canClose = true,
  closable,
  onOpenSaasHub,
}) => {
  const allowClose = closable !== undefined ? closable : canClose;
  const {
    user,
    company,
    hwid,
    isAuthenticated,
    isLoading,
    isHwidMismatch,
    mismatchDetails,
    sessionRevokedMessage,
    login,
    register,
    logout,
    clearHwidMismatch,
    requestHwidReset,
  } = useAuth();

  // Tab state
  const isOwner = user?.role === 'owner' || isOwnerEmail(user?.email);
  const hasRealMismatch = isHwidMismatch && !isOwner;

  const [activeTab, setActiveTab] = useState<AuthTab>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regCompanyOrLicense, setRegCompanyOrLicense] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Reset HWID form state
  const [resetReason, setResetReason] = useState('');

  // Status state
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto switch tab if real HWID mismatch happens
  useEffect(() => {
    if (hasRealMismatch) {
      setActiveTab('reset');
    }
  }, [hasRealMismatch]);

  // Reset messages when switching tabs
  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setErrorMsg('');
    setSuccessMsg('');
    if (tab !== 'reset' && isHwidMismatch) {
      clearHwidMismatch();
    }
  };

  if (!isOpen) return null;

  // Xử lý Đăng Nhập
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMsg('Vui lòng nhập đầy đủ Email và Mật khẩu');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    const res = await login(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg('Đăng nhập và xác thực thiết bị thành công!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setErrorMsg(res.error || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    }
  };

  // Xử lý Đăng Ký
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFullName.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg('Vui lòng điền họ tên, email và mật khẩu');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Mật khẩu phải có tối thiểu 6 ký tự');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    const res = await register({
      fullName: regFullName.trim(),
      email: regEmail.trim(),
      password: regPassword,
      companyCodeOrLicense: regCompanyOrLicense.trim(),
    });
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg(
        'Đăng ký thành công! Tài khoản của bạn đã được ghi nhận. Vui lòng thông báo cho Master Owner (hoặc Quản lý) để được duyệt và phân bổ vào công ty.',
      );
      setLoginEmail(regEmail);
      setLoginPassword(regPassword);
      setTimeout(() => {
        switchTab('login');
      }, 3000);
    } else {
      setErrorMsg(res.message || 'Đăng ký thất bại');
    }
  };

  // Xử lý Gửi đơn đổi máy
  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetReason.trim()) {
      setErrorMsg('Vui lòng nhập lý do cụ thể xin đổi máy');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    const res = await requestHwidReset(resetReason);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg(
        res.message || 'Đã gửi yêu cầu đổi máy tới Quản trị viên. Vui lòng đợi xét duyệt!',
      );
      setResetReason('');
    } else {
      setErrorMsg(res.message || 'Gửi yêu cầu thất bại');
    }
  };

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case 'owner':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500/20 to-amber-500/20 text-purple-300 border border-purple-500/30 shadow-sm shadow-purple-900/20">
            <Crown className="w-3.5 h-3.5 text-amber-400" /> Chủ dự án (Master Owner)
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
            <Building2 className="w-3.5 h-3.5 text-blue-400" /> Quản trị viên (Admin)
          </span>
        );
      case 'leader':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Users2 className="w-3.5 h-3.5 text-amber-400" /> Trưởng nhóm (Leader)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Thành viên (Staff)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
        {/* Glow hiệu ứng trên đầu Modal */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500" />

        {/* Nút đóng */}
        {allowClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header Modal */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-inner">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Xác thực & Bản quyền RETubeMatrix
              {user?.role === 'owner' && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  OWNER
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              Hệ thống Tài khoản SaaS, Phân Quyền & Ràng Buộc Phần Cứng
            </p>
          </div>
        </div>

        {/* Thông báo Thu hồi phiên (Session Revoked) */}
        {sessionRevokedMessage && (
          <div className="p-3 mb-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="leading-relaxed">
              <span className="font-semibold text-rose-200 block mb-0.5">
                Phiên làm việc đã bị thu hồi
              </span>
              <span>{sessionRevokedMessage}</span>
            </div>
          </div>
        )}

        {/* Thông báo Lỗi / Thành công */}
        {errorMsg && (
          <div className="p-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span className="leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* TRẠNG THÁI ĐÃ ĐĂNG NHẬP */}
        {isAuthenticated && user ? (
          <div className="space-y-4">
            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-slate-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Thiết bị hiện tại đã được liên kết và kích hoạt bản quyền hợp lệ.</span>
            </div>

            {/* Profile Card */}
            <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Vai trò phân cấp:</span>
                {getRoleBadge(user.role)}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Họ và tên:</span>
                <span className="font-semibold text-white">{user.fullName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Email:</span>
                <span className="font-mono text-slate-300">{user.email}</span>
              </div>
              {company && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Công ty / Nhóm:</span>
                  <span className="text-slate-200">
                    {company.name} ({company.code})
                  </span>
                </div>
              )}
            </div>

            {/* Thông tin phần cứng máy hiện tại */}
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-slate-400" /> Phần cứng hiện tại:
                </span>
                <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                  {hwid?.platform?.toUpperCase() || 'WINDOWS'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-400 truncate" title={hwid?.hwidHash}>
                HWID: {hwid?.hwidHash || 'Đang cập nhật...'}
              </div>
            </div>

            {/* Nút mở SaaS Master Hub cho Owner & Admin */}
            {(user.role === 'owner' || user.role === 'admin') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSaasHub?.();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-amber-500/20 via-purple-500/25 to-indigo-500/20 hover:from-amber-500/30 hover:to-indigo-500/30 text-amber-200 border border-amber-500/40 rounded-xl transition text-xs font-bold shadow-lg shadow-amber-500/10"
              >
                <Crown className="w-4 h-4 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                <span>Mở Bảng Quản Trị Hệ Thống (SaaS Master Hub)</span>
              </button>
            )}

            {/* Các nút hành động */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  logout();
                  switchTab('login');
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition text-xs font-medium border border-slate-700/60"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> Đổi tài khoản khác
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl transition text-xs font-medium border border-rose-500/20"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" /> Đăng xuất khỏi máy
              </button>
            </div>
          </div>
        ) : (
          /* TRẠNG THÁI CHƯA ĐĂNG NHẬP: TAB ĐĂNG NHẬP / ĐĂNG KÝ / XIN ĐỔI MÁY */
          <div>
            {/* Tab Header */}
            <div className="flex items-center border-b border-slate-800 mb-4 pb-1">
              <button
                type="button"
                onClick={() => switchTab('login')}
                className={cn(
                  'flex items-center gap-2 py-2 px-4 text-xs font-semibold rounded-t-lg transition border-b-2',
                  activeTab === 'login'
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                <LogIn className="w-3.5 h-3.5" /> Đăng Nhập
              </button>

              <button
                type="button"
                onClick={() => switchTab('register')}
                className={cn(
                  'flex items-center gap-2 py-2 px-4 text-xs font-semibold rounded-t-lg transition border-b-2',
                  activeTab === 'register'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                <UserPlus className="w-3.5 h-3.5" /> Đăng Ký Mới
              </button>

              {hasRealMismatch && (
                <button
                  type="button"
                  onClick={() => switchTab('reset')}
                  className={cn(
                    'flex items-center gap-2 py-2 px-4 text-xs font-semibold rounded-t-lg transition border-b-2 ml-auto',
                    activeTab === 'reset'
                      ? 'border-rose-500 text-rose-400 bg-rose-500/10'
                      : 'border-transparent text-rose-400/80 hover:text-rose-300',
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Xin Đổi Máy
                </button>
              )}
            </div>

            {/* TAB 1: FORM ĐĂNG NHẬP */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-3.5">
                {/* Email input */}
                <div>
                  <label
                    htmlFor="auth-email-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Email đăng nhập
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      id="auth-email-input"
                      type="email"
                      required
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Password input */}
                <div>
                  <label
                    htmlFor="auth-password-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      id="auth-password-input"
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Checkbox Ghi nhớ đăng nhập */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
                    />
                    <span>Ghi nhớ phiên đăng nhập trên máy này</span>
                  </label>
                </div>

                {/* Submit Login Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className="w-full py-2.5 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition text-xs shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang xác thực thông tin...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" /> Đăng Nhập Ngay
                    </>
                  )}
                </button>

                {/* Switch to Register */}
                <div className="text-center pt-2">
                  <span className="text-xs text-slate-400">Chưa có tài khoản? </span>
                  <button
                    type="button"
                    onClick={() => switchTab('register')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2"
                  >
                    Đăng ký tài khoản mới
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: FORM ĐĂNG KÝ TÀI KHOẢN MỚI */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Đăng ký tài khoản nhân viên mới (cho phép đăng ký tự do để chờ Owner phân bổ
                    sau).
                  </span>
                </div>

                {/* Họ tên */}
                <div>
                  <label
                    htmlFor="reg-fullname-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Họ và tên
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      id="reg-fullname-input"
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="VD: Nguyễn Văn A"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="reg-email-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Email công việc
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      id="reg-email-input"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Password & Confirm */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="reg-password-input"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        id="reg-password-input"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Tối thiểu 6 ký tự"
                        className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showRegPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm-password-input"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Nhập lại mật khẩu
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        id="reg-confirm-password-input"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Company Code or License */}
                <div>
                  <label
                    htmlFor="reg-code-input"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Mã Công Ty hoặc License (Không bắt buộc)
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      id="reg-code-input"
                      type="text"
                      value={regCompanyOrLicense}
                      onChange={(e) => setRegCompanyOrLicense(e.target.value)}
                      placeholder="Để trống nếu chờ Master Owner duyệt và gán công ty"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Nếu chưa có mã công ty, bạn cứ để trống. Master Owner sẽ phân bổ công ty và cấp
                    quyền cho bạn.
                  </p>
                </div>

                {/* Submit Register */}
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className="w-full py-2.5 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang tạo tài khoản...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> Tạo Tài Khoản & Kích Hoạt Máy
                    </>
                  )}
                </button>

                {/* Switch to Login */}
                <div className="text-center pt-1">
                  <span className="text-xs text-slate-400">Đã có tài khoản? </span>
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-2"
                  >
                    Đăng nhập ngay
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: XIN ĐỔI MÁY CỨNG (HWID RESET) */}
            {activeTab === 'reset' && (
              <div className="space-y-3">
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs space-y-2">
                  <div className="flex items-start gap-2.5 text-rose-300 font-semibold">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <p className="text-sm text-rose-300">Tài khoản đã liên kết với máy khác</p>
                      <p className="text-[11px] font-normal text-rose-300/80 mt-0.5">
                        Mỗi tài khoản nhân viên được bảo mật gắn với 1 thiết bị làm việc. Nếu bạn
                        đổi máy mới hoặc nâng cấp phần cứng, vui lòng gửi đơn để Quản trị viên
                        duyệt.
                      </p>
                    </div>
                  </div>

                  {mismatchDetails && (
                    <div className="p-2.5 bg-slate-900/90 rounded-lg border border-rose-900/50 text-[11px] text-slate-300 space-y-1">
                      {mismatchDetails.email && (
                        <div>
                          Tài khoản:{' '}
                          <span className="font-semibold text-white">{mismatchDetails.email}</span>
                        </div>
                      )}
                      <div>
                        Thiết bị cũ:{' '}
                        <span className="font-semibold text-white">
                          {mismatchDetails.currentDeviceName || 'Máy tính đã đăng ký trước đó'}
                        </span>
                      </div>
                      {mismatchDetails.boundAt && (
                        <div>
                          Thời điểm liên kết:{' '}
                          <span className="text-slate-400">
                            {new Date(mismatchDetails.boundAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Form gửi yêu cầu đổi máy */}
                <form onSubmit={handleResetRequest} className="space-y-2 pt-1">
                  <label
                    htmlFor="hwid-reset-reason"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Lý do xin đổi thiết bị sang máy hiện tại:
                  </label>
                  <textarea
                    id="hwid-reset-reason"
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    placeholder="VD: Em được công ty cấp máy tính mới / Máy cũ bị hỏng card đồ họa..."
                    className="w-full h-20 p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 text-xs resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition disabled:opacity-50 text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang gửi yêu cầu...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" /> Gửi Đơn Xin Đổi Máy Cho Admin
                      </>
                    )}
                  </button>
                </form>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
                  >
                    Quay lại Đăng nhập bằng tài khoản khác
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer HWID Info nhỏ gọn ở đáy Modal */}
        <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5 text-slate-400" />
            <span>Mã máy:</span>
            <span className="font-mono text-slate-400">
              {hwid?.hwidHash
                ? `${hwid.hwidHash.slice(0, 10)}...${hwid.hwidHash.slice(-8)}`
                : 'Đang đọc...'}
            </span>
          </span>
          <span className="font-medium text-slate-400">
            {hwid?.platform?.toUpperCase() || 'WINDOWS'}
          </span>
        </div>
      </div>
    </div>
  );
};
