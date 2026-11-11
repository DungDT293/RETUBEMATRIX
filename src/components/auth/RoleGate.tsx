import { Lock } from 'lucide-react';
import type React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../types/auth';

interface RoleGateProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLockedCard?: boolean;
}

export const RoleGate: React.FC<RoleGateProps> = ({
  roles,
  children,
  fallback = null,
  showLockedCard = false,
}) => {
  const { hasRole, user } = useAuth();

  if (hasRole(roles)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showLockedCard) {
    return (
      <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
        <div className="w-12 h-12 mx-auto mb-3 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-white mb-1">Khu vực giới hạn phân quyền</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Tính năng này yêu cầu quyền tối thiểu là {roles.join(' hoặc ').toUpperCase()}. Tài khoản
          của bạn hiện tại là {user?.role.toUpperCase() || 'CHƯA ĐĂNG NHẬP'}.
        </p>
      </div>
    );
  }

  return null;
};
