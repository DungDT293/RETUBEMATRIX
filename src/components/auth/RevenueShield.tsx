import { EyeOff } from 'lucide-react';
import type React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface RevenueShieldProps {
  amountUsd?: number;
  amountVnd?: number;
  currency?: 'USD' | 'VND';
  className?: string;
}

export const RevenueShield: React.FC<RevenueShieldProps> = ({
  amountUsd = 0,
  amountVnd = 0,
  currency = 'USD',
  className = '',
}) => {
  const { canViewFullRevenue } = useAuth();
  const isFullView = canViewFullRevenue();

  const formatUsd = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatVnd = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  if (!isFullView) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700/50"
          title="Doanh thu đã được ẩn theo chính sách bảo mật của doanh nghiệp"
        >
          <EyeOff className="w-3 h-3 text-slate-400" /> ••••••
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-semibold text-emerald-400">
        {currency === 'USD' ? formatUsd(amountUsd) : formatVnd(amountVnd)}
      </span>
    </div>
  );
};
