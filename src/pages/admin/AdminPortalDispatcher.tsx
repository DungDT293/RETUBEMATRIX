import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isOwnerEmail, useAuth } from '@/contexts/AuthContext';
import { CompanyAdminPortalPage } from '@/pages/admin/CompanyAdminPortalPage';
import { LeaderWorkspacePage } from '@/pages/admin/LeaderWorkspacePage';
import { SaasMasterHubPage } from '@/pages/SaasMasterHubPage';

interface AdminPortalDispatcherProps {
  onNavigateHome?: () => void;
}

export function AdminPortalDispatcher({ onNavigateHome }: AdminPortalDispatcherProps) {
  const { user } = useAuth();
  const role = user?.role || 'user';
  const isOwner = role === 'owner' || isOwnerEmail(user?.email);

  // 1. Master Owner: Xem toàn bộ Hub Multi-Tenant, Quản trị mọi công ty & Cấp phép License
  if (isOwner) {
    return <SaasMasterHubPage />;
  }

  // 2. Admin (Sếp / Giám Đốc Công Ty): Chỉ quản trị nội bộ nhân sự, ngách, máy trạm công ty mình
  if (role === 'admin') {
    return <CompanyAdminPortalPage />;
  }

  // 3. Leader (Trưởng Nhóm): Xem tiến độ nhóm, ngách giao cho team và xác nhận sơ bộ đổi máy
  if (role === 'leader') {
    return <LeaderWorkspacePage />;
  }

  // 4. Kỹ thuật viên (User thường): Không có quyền truy cập
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 text-slate-100 min-h-[500px]">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-white mb-2">
        Khu Vực Quản Trị Giới Hạn
      </h2>
      <p className="text-xs text-slate-400 text-center max-w-md mb-6 leading-relaxed">
        Tài khoản của bạn ({user?.email}) thuộc vai trò{' '}
        <span className="text-slate-200 font-semibold uppercase">{role}</span>. Bạn không có quyền
        truy cập vào cổng điều hành này. Vui lòng liên hệ Quản trị viên (Admin) hoặc Chủ sở hữu để
        được cấp quyền phù hợp.
      </p>
      {onNavigateHome && (
        <Button
          onClick={onNavigateHome}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl gap-2 h-9"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại Bàn Làm Việc
        </Button>
      )}
    </div>
  );
}
