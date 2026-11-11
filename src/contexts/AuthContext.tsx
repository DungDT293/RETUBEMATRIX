import { invoke } from '@tauri-apps/api/core';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthState, Company, HwidInfo, UserProfile, UserRole } from '../types/auth';

interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  companyCodeOrLicense?: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; message?: string }>;
  logout: (revocationReason?: string | unknown) => void;
  clearHwidMismatch: () => void;
  requestHwidReset: (reason: string) => Promise<{ success: boolean; message?: string }>;
  refreshSession: () => Promise<boolean>;
  hasRole: (requiredRoles: UserRole[]) => boolean;
  canViewFullRevenue: () => boolean;
  canCollaborateCrossLeader: () => boolean;
}

export const isOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 'dungdong333@gmail.com';
};

const GATEWAY_URL =
  import.meta.env.VITE_GATEWAY_URL || 'https://retubematrix-gateway.dungdong333.workers.dev';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  leader: 2,
  user: 1,
  pending: 0,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    license: null,
    hwid: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    isHwidMismatch: false,
    mismatchDetails: null,
    sessionRevokedMessage: null,
  });

  // Dọn dẹp cache và trạng thái phiên
  const logout = useCallback((revocationReason?: string | unknown) => {
    localStorage.removeItem('rtm_auth_session');
    localStorage.removeItem('rtm_saas_tenants_cache');
    localStorage.removeItem('rtm_saas_licenses_cache');
    localStorage.removeItem('rtm_saas_members_cache');
    const reason = typeof revocationReason === 'string' ? revocationReason : null;
    setState((prev) => ({
      ...prev,
      user: null,
      company: null,
      license: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHwidMismatch: false,
      mismatchDetails: null,
      sessionRevokedMessage: reason,
    }));
  }, []);

  // 1. Lấy thông tin Hardware ID & khôi phục phiên khi ứng dụng khởi động
  useEffect(() => {
    let isMounted = true;

    async function initHwidAndSession() {
      let hwidData: HwidInfo | null = null;
      try {
        hwidData = await invoke<HwidInfo>('get_system_hwid_cmd');
      } catch (err) {
        console.warn(
          'Không thể đọc HWID từ Rust Core (có thể đang chạy trong browser preview):',
          err,
        );
        hwidData = {
          machineGuid: 'DEV_PREVIEW_GUID',
          processorId: 'DEV_PREVIEW_CPU',
          motherboardUuid: 'DEV_PREVIEW_MB',
          hwidHash: 'mock_hwid_hash_test_1234567890abcdef',
          platform: 'windows',
        };
      }

      // Đọc cached session
      const cached = localStorage.getItem('rtm_auth_session');
      if (cached && hwidData) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.user && parsed.accessToken) {
            const isOwner = parsed.user.role === 'owner' || isOwnerEmail(parsed.user.email);

            // Vá VULN-04: Khóa HWID - Chống nhân bản session qua máy khác
            // Nếu session có hwidHash và không khớp với HWID máy hiện tại, và không phải Owner:
            if (!isOwner && parsed.hwidHash && parsed.hwidHash !== hwidData.hwidHash) {
              console.warn(
                '[AuthContext] HWID session mismatch: session belongs to another device. Clearing cached session.',
              );
              localStorage.removeItem('rtm_auth_session');
              localStorage.removeItem('rtm_saas_tenants_cache');
              localStorage.removeItem('rtm_saas_licenses_cache');
              localStorage.removeItem('rtm_saas_members_cache');

              if (isMounted) {
                setState((prev) => ({
                  ...prev,
                  hwid: hwidData,
                  isLoading: false,
                  isAuthenticated: false,
                  user: null,
                  accessToken: null,
                  refreshToken: null,
                }));
              }
              return;
            }

            let effectiveAccessToken = parsed.accessToken;
            let effectiveRefreshToken = parsed.refreshToken;

            // Tự động kiểm tra và làm mới JWT nếu token đã hết hạn
            try {
              const parts = effectiveAccessToken.split('.');
              if (parts.length === 3) {
                let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                while (b64.length % 4 !== 0) b64 += '=';
                const payload = JSON.parse(atob(b64));
                const expMs = payload.exp * 1000;
                if (expMs - Date.now() < 5 * 60 * 1000 && effectiveRefreshToken) {
                  const refreshRes = await fetch(`${GATEWAY_URL}/v1/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: effectiveRefreshToken }),
                  });
                  if (refreshRes.ok) {
                    const rData = await refreshRes.json();
                    if (rData.success && rData.access_token) {
                      effectiveAccessToken = rData.access_token;
                      parsed.accessToken = rData.access_token;
                      if (rData.refresh_token) {
                        effectiveRefreshToken = rData.refresh_token;
                        parsed.refreshToken = rData.refresh_token;
                      }
                      localStorage.setItem('rtm_admin_token', rData.access_token);
                    }
                  }
                }
              }
            } catch (_) {}

            if (isOwner) {
              parsed.user.role = 'owner';
              if (
                !parsed.user.fullName ||
                parsed.user.fullName.includes('Dũng Đồng') ||
                parsed.user.fullName.includes('Dũng Đỗ')
              ) {
                parsed.user.fullName = 'Tiến Dũng (Master Owner)';
              }
            }
            if (parsed.user.fullName) {
              parsed.user.fullName = parsed.user.fullName.replace(
                /Dũng\s+(Đỗ|Đồng)/gi,
                'Tiến Dũng',
              );
            }
            localStorage.setItem('rtm_auth_session', JSON.stringify(parsed));
            if (effectiveAccessToken) {
              localStorage.setItem('rtm_admin_token', effectiveAccessToken);
            }

            if (isMounted) {
              setState({
                user: parsed.user,
                company: parsed.company || null,
                license: parsed.license || null,
                hwid: hwidData,
                accessToken: effectiveAccessToken,
                refreshToken: effectiveRefreshToken || null,
                isAuthenticated: true,
                isLoading: false,
                isHwidMismatch: false,
                mismatchDetails: null,
                sessionRevokedMessage: null,
              });
              return;
            }
          }
        } catch {
          localStorage.removeItem('rtm_auth_session');
        }
      }

      if (isMounted) {
        setState((prev) => ({
          ...prev,
          hwid: hwidData,
          isLoading: false,
        }));
      }
    }

    initHwidAndSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Đăng nhập & Xác thực HWID tại Cloudflare Worker Edge Gateway
  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const isOwnerAccount = isOwnerEmail(email);

      setState((prev) => ({
        ...prev,
        isLoading: true,
        isHwidMismatch: false,
        mismatchDetails: null,
        sessionRevokedMessage: null,
      }));

      try {
        const hwidHash = state.hwid?.hwidHash || 'mock_hwid_hash_test_1234567890abcdef';
        const response = await fetch(`${GATEWAY_URL}/v1/auth/verify-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            hwid_hash: hwidHash,
            cpu_id: state.hwid?.processorId,
            motherboard_uuid: state.hwid?.motherboardUuid,
            machine_guid: state.hwid?.machineGuid,
            device_name: 'Windows Desktop',
            os_info: state.hwid?.platform || 'Windows',
            client_version: '0.20.16',
          }),
        });

        const data = await response.json().catch(() => ({}));

        const isOwner = isOwnerAccount || data.device?.role === 'owner' || data.role === 'owner';

        // Vá VULN-01: Nếu server trả về lỗi hoặc xác thực thất bại
        if (!response.ok || !data.success) {
          // CHỈ DUY NHẤT một ngoại lệ cho Owner: Server xác thực mật khẩu đúng NHƯNG bị chặn bởi HWID_MISMATCH
          if (data.code === 'HWID_MISMATCH' && isOwner) {
            console.log(
              '[AuthContext] Master Owner credentials verified - Bypassing HWID restriction.',
            );
            const ownerProfile: UserProfile = {
              id: data.user?.id || data.user_id || data.userId || 'owner-master-id',
              email: email.trim(),
              fullName:
                data.device?.full_name ||
                data.user?.user_metadata?.full_name ||
                'Tiến Dũng (Master Owner)',
              role: 'owner',
              companyId: data.device?.company_id || 'hq-company',
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            const ownerCompany: Company = {
              id: data.device?.company_id || 'hq-company',
              name: data.device?.company_name || 'RETubeMatrix HQ (Master)',
              code: data.device?.company_code || 'HQ',
              ownerUserId: ownerProfile.id,
              isActive: true,
              maskRevenueFromStaff: false,
              crossLeaderCollaboration: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            let resolvedToken = data.access_token || data.token || '';
            let resolvedRefreshToken = data.refresh_token || '';

            // Nếu chưa có token, gọi fallback /v1/admin/login để lấy token xác thực Gateway
            if (!resolvedToken && isOwner) {
              try {
                const admRes = await fetch(`${GATEWAY_URL}/v1/admin/login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
                });
                if (admRes.ok) {
                  const admData = await admRes.json();
                  if (admData.token || admData.access_token) {
                    resolvedToken = admData.token || admData.access_token;
                  }
                  if (admData.refresh_token) {
                    resolvedRefreshToken = admData.refresh_token;
                  }
                }
              } catch (_) {}
            }

            const sessionPayload = {
              user: ownerProfile,
              accessToken: resolvedToken,
              refreshToken: resolvedRefreshToken,
              company: ownerCompany,
              license: null,
              hwidHash: state.hwid?.hwidHash,
            };

            localStorage.setItem('rtm_auth_session', JSON.stringify(sessionPayload));
            if (resolvedToken) {
              localStorage.setItem('rtm_admin_token', resolvedToken);
            }
            if (resolvedToken) {
              localStorage.setItem('rtm_admin_token', resolvedToken);
            }

            setState((prev) => ({
              ...prev,
              user: ownerProfile,
              company: ownerCompany,
              accessToken: resolvedToken,
              refreshToken: resolvedRefreshToken,
              isAuthenticated: true,
              isLoading: false,
              isHwidMismatch: false,
              mismatchDetails: null,
              sessionRevokedMessage: null,
            }));

            return { success: true };
          }

          // Xử lý HWID_MISMATCH cho nhân viên thông thường (VULN-02)
          if (data.code === 'HWID_MISMATCH') {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              isHwidMismatch: true,
              mismatchDetails: {
                userId: data.user_id || data.userId || (data.user?.id ?? ''),
                email: email.trim(),
                currentDeviceName: data.current_device_name || data.currentDeviceName,
                boundAt: data.bound_at || data.boundAt,
              },
            }));
            return {
              success: false,
              error:
                'Tài khoản này đã bị khóa vào một thiết bị khác. Vui lòng gửi yêu cầu đổi máy.',
            };
          }

          // TUYỆT ĐỐI KHÔNG BYPASS MẬT KHẨU! Nếu sai mật khẩu hoặc lỗi xác thực:
          setState((prev) => ({ ...prev, isLoading: false }));
          return {
            success: false,
            error: data.error || 'Email hoặc mật khẩu không chính xác',
          };
        }

        // Kiểm tra tài khoản pending approval (chưa kích hoạt hoặc chưa gán công ty)
        const isPendingAccount =
          !isOwner &&
          (data.status === 'pending_approval' ||
            data.status === 'pending' ||
            data.code === 'USER_INACTIVE' ||
            data.code === 'NO_ACTIVE_LICENSE' ||
            data.code === 'PENDING_APPROVAL' ||
            data.code === 'NO_COMPANY' ||
            (data.device && !data.device.company_id) ||
            (data.device && data.device.is_active === false) ||
            (data.device && (data.device.role === 'pending' || data.role === 'pending')));

        if (isPendingAccount) {
          const pendingProfile: UserProfile = {
            id: data.user?.id || 'pending-user',
            email: data.user?.email || email.trim(),
            fullName:
              data.device?.full_name || data.user?.user_metadata?.full_name || email.split('@')[0],
            role: (data.device?.role as UserRole) || 'pending',
            companyId: data.device?.company_id || '',
            isActive: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const sessionPayload = {
            user: pendingProfile,
            accessToken: data.access_token || 'pending-token',
            refreshToken: data.refresh_token || '',
            company: null,
            license: null,
            hwidHash: state.hwid?.hwidHash,
          };

          localStorage.setItem('rtm_auth_session', JSON.stringify(sessionPayload));
          if (data.access_token) {
            localStorage.setItem('rtm_admin_token', data.access_token);
          }

          setState((prev) => ({
            ...prev,
            user: pendingProfile,
            company: null,
            license: null,
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            isAuthenticated: true,
            isLoading: false,
            isHwidMismatch: false,
            mismatchDetails: null,
            sessionRevokedMessage: null,
          }));

          return { success: true };
        }

        // Đăng nhập thành công và HWID hợp lệ
        const userRole: UserRole = isOwner ? 'owner' : (data.device?.role as UserRole) || 'user';

        const companyInfo: Company | null = data.device?.company_id
          ? {
              id: data.device.company_id,
              name: data.device.company_name || (isOwner ? 'RETubeMatrix HQ (Master)' : 'Công ty'),
              code: data.device.company_code || (isOwner ? 'HQ' : 'COMP'),
              ownerUserId: isOwner ? data.user.id : '',
              isActive: true,
              maskRevenueFromStaff: isOwner ? false : Boolean(data.device.mask_revenue_from_staff),
              crossLeaderCollaboration: isOwner
                ? true
                : Boolean(data.device.cross_leader_collaboration),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : isOwner
            ? {
                id: 'hq-company',
                name: 'RETubeMatrix HQ (Master)',
                code: 'HQ',
                ownerUserId: data.user.id,
                isActive: true,
                maskRevenueFromStaff: false,
                crossLeaderCollaboration: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : null;

        const userProfile: UserProfile = {
          id: data.user.id,
          email: data.user.email,
          fullName:
            data.device?.full_name ||
            data.user.user_metadata?.full_name ||
            (isOwner ? 'Tiến Dũng (Master Owner)' : email.split('@')[0]),
          role: userRole,
          companyId: data.device?.company_id || (isOwner ? 'hq-company' : ''),
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const resolvedToken = data.access_token || data.token || '';
        const resolvedRefreshToken = data.refresh_token || '';

        const sessionPayload = {
          user: userProfile,
          accessToken: resolvedToken,
          refreshToken: resolvedRefreshToken,
          company: companyInfo,
          license: null,
          hwidHash: state.hwid?.hwidHash,
        };

        localStorage.setItem('rtm_auth_session', JSON.stringify(sessionPayload));
        if (resolvedToken) {
          localStorage.setItem('rtm_admin_token', resolvedToken);
        }

        setState((prev) => ({
          ...prev,
          user: userProfile,
          company: companyInfo,
          accessToken: resolvedToken,
          refreshToken: resolvedRefreshToken || null,
          isAuthenticated: true,
          isLoading: false,
          isHwidMismatch: false,
          mismatchDetails: null,
          sessionRevokedMessage: null,
        }));

        return { success: true };
      } catch (err: unknown) {
        // VULN-01: Catch block TUYỆT ĐỐI KHÔNG BYPASS MẬT KHẨU CHO OWNER
        const msg = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, isLoading: false }));
        return { success: false, error: `Không thể kết nối đến License Server: ${msg}` };
      }
    },
    [state.hwid],
  );

  // 3. Đăng ký tài khoản mới gắn với Tenant / License
  const register = useCallback(
    async (payload: RegisterPayload): Promise<{ success: boolean; message?: string }> => {
      try {
        const hwidHash = state.hwid?.hwidHash || 'mock_hwid_hash_test_1234567890abcdef';
        const response = await fetch(`${GATEWAY_URL}/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload.email.trim(),
            password: payload.password,
            full_name: payload.fullName.trim(),
            company_code_or_license: payload.companyCodeOrLicense?.trim() || '',
            hwid_hash: hwidHash,
            cpu_id: state.hwid?.processorId,
            motherboard_uuid: state.hwid?.motherboardUuid,
            machine_guid: state.hwid?.machineGuid,
            device_name: 'Windows Desktop',
            os_info: state.hwid?.platform || 'Windows',
            client_version: '0.20.16',
          }),
        });

        const data = await response.json().catch(() => ({}));
        return {
          success: Boolean(data.success),
          message:
            data.message ||
            (data.success
              ? 'Đăng ký thành công! Tài khoản của bạn đã được ghi nhận. Vui lòng thông báo cho Master Owner (hoặc Quản lý) để được duyệt và phân bổ vào công ty.'
              : data.error || 'Đăng ký thất bại'),
        };
      } catch (err: unknown) {
        return {
          success: false,
          message: `Lỗi kết nối tới Server: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    [state.hwid],
  );

  // Xóa trạng thái HWID Mismatch khi người dùng muốn đổi tài khoản hoặc thử lại
  const clearHwidMismatch = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isHwidMismatch: false,
      mismatchDetails: null,
    }));
  }, []);

  // 4. Gửi yêu cầu đổi máy khi bị HWID Mismatch (Vá VULN-02)
  const requestHwidReset = useCallback(
    async (reason: string): Promise<{ success: boolean; message?: string }> => {
      try {
        const cached = localStorage.getItem('rtm_auth_session');
        const cachedUserId = cached ? JSON.parse(cached).user?.id : null;
        const userId = state.mismatchDetails?.userId || state.user?.id || cachedUserId;
        if (!userId) {
          return {
            success: false,
            message:
              'Không tìm thấy thông tin tài khoản để gửi yêu cầu. Vui lòng thử đăng nhập lại.',
          };
        }

        const hwidHash = state.hwid?.hwidHash || 'mock_hwid_hash_test_1234567890abcdef';
        const res = await fetch(`${GATEWAY_URL}/v1/auth/request-hwid-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            new_hwid_hash: hwidHash,
            new_device_info: {
              machineGuid: state.hwid?.machineGuid,
              cpuId: state.hwid?.processorId,
              motherboardUuid: state.hwid?.motherboardUuid,
              platform: state.hwid?.platform || 'windows',
            },
            reason,
          }),
        });

        const data = await res.json().catch(() => ({}));
        return {
          success: Boolean(data.success),
          message:
            data.message ||
            (data.success
              ? 'Đã gửi yêu cầu đổi máy thành công'
              : data.error || 'Gửi yêu cầu đổi máy thất bại'),
        };
      } catch (err: unknown) {
        return {
          success: false,
          message: `Lỗi gửi yêu cầu: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    [state.mismatchDetails?.userId, state.user?.id, state.hwid],
  );

  // 5. Tự động gia hạn JWT Session (Vá VULN-05)
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const cached = localStorage.getItem('rtm_auth_session');
      const parsed = cached ? JSON.parse(cached) : null;
      const refreshToken = state.refreshToken || parsed?.refreshToken;

      if (!refreshToken) {
        return false;
      }

      const res = await fetch(`${GATEWAY_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401 || errData.code === 'TOKEN_EXPIRED') {
          const isOwner = state.user?.role === 'owner' || isOwnerEmail(state.user?.email);
          if (!isOwner) {
            console.warn('[AuthContext] Refresh token expired, logging out.');
            logout();
          } else {
            console.warn(
              '[AuthContext] Master Owner refresh token issue, preserving active session.',
            );
          }
        }
        return false;
      }

      const data = await res.json().catch(() => ({}));
      if (!data.success || !data.access_token) {
        return false;
      }

      if (parsed) {
        parsed.accessToken = data.access_token;
        if (data.refresh_token) {
          parsed.refreshToken = data.refresh_token;
        }
        localStorage.setItem('rtm_auth_session', JSON.stringify(parsed));
        localStorage.setItem('rtm_admin_token', data.access_token);
      }

      setState((prev) => ({
        ...prev,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || prev.refreshToken,
      }));

      return true;
    } catch (err) {
      console.warn('[AuthContext] refreshSession failed:', err);
      return false;
    }
  }, [state.refreshToken, logout, state.user?.email, state.user?.role]);

  // Tự động kiểm tra và gia hạn JWT token trước khi hết hạn
  useEffect(() => {
    if (!state.isAuthenticated || !state.accessToken || !state.refreshToken) {
      return;
    }

    const checkTokenExp = () => {
      try {
        const parts = state.accessToken?.split('.');
        if (parts && parts.length === 3) {
          let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4 !== 0) b64 += '=';
          const payload = JSON.parse(atob(b64));
          if (typeof payload.exp === 'number') {
            const expMs = payload.exp * 1000;
            const now = Date.now();
            // Nếu token còn dưới 5 phút thì tự động refresh
            if (expMs - now < 5 * 60 * 1000) {
              refreshSession();
            }
          }
        }
      } catch {
        // Bỏ qua nếu không phải standard JWT
      }
    };

    const interval = setInterval(checkTokenExp, 5 * 60 * 1000);
    checkTokenExp();
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.accessToken, state.refreshToken, refreshSession]);

  // 6. Triển khai Client Heartbeat thời gian thực (Mỗi 3 phút)
  useEffect(() => {
    if (!state.isAuthenticated || !state.accessToken || !state.user?.id) {
      return;
    }

    const checkHeartbeat = async () => {
      try {
        const hwidHash = state.hwid?.hwidHash || 'mock_hwid_hash_test_1234567890abcdef';
        const res = await fetch(`${GATEWAY_URL}/v1/device/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.accessToken}`,
          },
          body: JSON.stringify({
            hwid_hash: hwidHash,
            user_id: state.user?.id,
          }),
        });

        if (res.status === 401 || res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (
            data.code === 'SESSION_REVOKED' ||
            data.code === 'DEVICE_UNBOUND' ||
            data.code === 'USER_INACTIVE'
          ) {
            console.warn('[AuthContext] Heartbeat: Session revoked by administrator.');
            logout('Tài khoản hoặc thiết bị của bạn đã bị khóa bởi quản trị viên.');
            return;
          }
        }

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.success === false && data.code === 'SESSION_REVOKED') {
            console.warn('[AuthContext] Heartbeat: Session revoked by administrator.');
            logout('Tài khoản hoặc thiết bị của bạn đã bị khóa bởi quản trị viên.');
            return;
          }

          // Tự động đồng bộ vai trò mới thời gian thực nếu Admin/Owner thăng/hạ quyền trên hệ thống
          const serverRole = data.user_role || data.role;
          if (serverRole && state.user && serverRole !== state.user.role) {
            console.info(
              `[AuthContext] Đồng bộ vai trò người dùng từ máy chủ: ${state.user.role} -> ${serverRole}`,
            );
            const updatedUser: UserProfile = { ...state.user, role: serverRole };
            setState((prev) => ({ ...prev, user: updatedUser }));
            try {
              const cached = localStorage.getItem('rtm_auth_session');
              if (cached) {
                const parsed = JSON.parse(cached);
                parsed.user = updatedUser;
                localStorage.setItem('rtm_auth_session', JSON.stringify(parsed));
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        // Lỗi kết nối mạng tạm thời, không ép logout
        console.debug('[AuthContext] Heartbeat skipped (offline):', err);
      }
    };

    const interval = setInterval(checkHeartbeat, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.accessToken, state.user, state.hwid?.hwidHash, logout]);

  // 7. Kiểm tra Role phân cấp Kim Tự Tháp
  const hasRole = useCallback(
    (requiredRoles: UserRole[]): boolean => {
      if (!state.user) return false;
      const currentLevel = ROLE_HIERARCHY[state.user.role] ?? 0;
      return requiredRoles.some((req) => currentLevel >= ROLE_HIERARCHY[req]);
    },
    [state.user],
  );

  // 8. Kiểm tra quyền xem Doanh thu thật
  const canViewFullRevenue = useCallback((): boolean => {
    if (!state.user) return false;
    if (
      state.user.role === 'owner' ||
      state.user.role === 'admin' ||
      state.user.role === 'leader'
    ) {
      return true;
    }
    // Đối với User nhân viên: Kiểm tra nếu công ty bật ẩn doanh thu
    if (state.company?.maskRevenueFromStaff) {
      return false;
    }
    return true;
  }, [state.user, state.company?.maskRevenueFromStaff]);

  // 9. Kiểm tra quyền xem chéo tài nguyên giữa các Leader
  const canCollaborateCrossLeader = useCallback((): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'owner' || state.user.role === 'admin') return true;
    if (state.user.role === 'leader') {
      return state.company?.crossLeaderCollaboration ?? true;
    }
    return false;
  }, [state.user, state.company?.crossLeaderCollaboration]);

  const contextValue = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      clearHwidMismatch,
      requestHwidReset,
      refreshSession,
      hasRole,
      canViewFullRevenue,
      canCollaborateCrossLeader,
    }),
    [
      state,
      login,
      register,
      logout,
      clearHwidMismatch,
      requestHwidReset,
      refreshSession,
      hasRole,
      canViewFullRevenue,
      canCollaborateCrossLeader,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
