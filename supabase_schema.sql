-- ============================================================================
-- RETubeMatrix Enterprise Multi-Tenant & HWID License System (PostgreSQL 15+)
-- Nền tảng SaaS: Quản lý Kim Tự Tháp, Hợp Tác Chéo Leader, Đề Xuất & Khóa HWID
-- ============================================================================

-- 0. KÍCH HOẠT EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'leader', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE license_tier AS ENUM ('trial', 'pro', 'enterprise');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE license_status AS ENUM ('active', 'suspended', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE proposal_type AS ENUM ('keyword', 'competitor_channel', 'niche');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE proposal_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE hwid_reset_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. BẢNG CỐT LÕI (CORE TABLES)
-- ============================================================================

-- 2.1. Bảng Công ty (Tenants)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code CITEXT UNIQUE NOT NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    mask_revenue_from_staff BOOLEAN NOT NULL DEFAULT true,   -- Cờ bảo mật doanh thu đối với User
    cross_leader_collaboration BOOLEAN NOT NULL DEFAULT true, -- Cho phép các Leader xem chéo kho Key
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2. Bảng Teams (Nhóm trong công ty)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    leader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

-- 2.3. Bảng Hồ sơ Người dùng (User Profiles)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT,
    role user_role NOT NULL DEFAULT 'user',
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email CITEXT NOT NULL,
    avatar_url TEXT,
    commission_rate NUMERIC(5, 2) DEFAULT 20.00, -- % hoa hồng của nhân viên
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4. Bảng Giấy phép Thương mại (Licenses) - CHỈ DUY NHẤT OWNER CÓ QUYỀN TẠO/SỬA
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    tier license_tier NOT NULL DEFAULT 'pro',
    status license_status NOT NULL DEFAULT 'active',
    issued_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    max_seats INT NOT NULL DEFAULT 5 CHECK (max_seats > 0),
    used_seats INT NOT NULL DEFAULT 0 CHECK (used_seats >= 0 AND used_seats <= max_seats),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    features JSONB NOT NULL DEFAULT '{"max_browser_profiles": 10, "bkt_daily_quota": 15, "allow_cross_leader_collab": true}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.5. Bảng Ràng buộc Thiết bị (1 MÁY = 1 TÀI KHOẢN DUY NHẤT)
CREATE TABLE IF NOT EXISTS public.device_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE RESTRICT,
    hwid_hash VARCHAR(64) NOT NULL,
    cpu_id TEXT NOT NULL,
    motherboard_uuid TEXT NOT NULL,
    machine_guid TEXT NOT NULL,
    device_name TEXT,
    os_info TEXT,
    client_version TEXT,
    last_ip INET,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    binding_token UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ràng buộc cốt lõi: 1 user chỉ có duy nhất 1 thiết bị active
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_binding 
ON public.device_bindings (user_id) 
WHERE is_active = true;

-- 2.6. Bảng Yêu cầu Đổi Máy / Reset HWID
CREATE TABLE IF NOT EXISTS public.hwid_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    current_hwid_hash VARCHAR(64) NOT NULL,
    new_hwid_hash VARCHAR(64) NOT NULL,
    new_device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
    status hwid_reset_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.7. Bảng Ngách & Từ khóa (Niches & Keywords)
CREATE TABLE IF NOT EXISTS public.niches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    niche_id UUID REFERENCES public.niches(id) ON DELETE SET NULL,
    keyword_text TEXT NOT NULL,
    keyword_type TEXT DEFAULT 'keyword',
    status TEXT DEFAULT 'testing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, keyword_text)
);

-- 2.8. Bảng Kênh YouTube Quản lý (Managed Channels)
CREATE TABLE IF NOT EXISTS public.managed_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    youtube_channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    channel_url TEXT,
    monetization_status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, youtube_channel_id)
);

-- 2.9. Bảng Đề Xuất Kênh / Key Mới (Proposals)
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proposal_type proposal_type NOT NULL,
    target_value TEXT NOT NULL,         -- URL kênh hoặc từ khóa
    target_name TEXT,                   -- Tên kênh hoặc nhãn
    niche_id UUID REFERENCES public.niches(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL,
    status proposal_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    converted_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.10. Bảng Doanh Thu Hàng Ngày (Channel Revenue Daily)
CREATE TABLE IF NOT EXISTS public.channel_revenue_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES public.managed_channels(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    views BIGINT NOT NULL DEFAULT 0,
    watch_time_hours NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subscribers_gained INT NOT NULL DEFAULT 0,
    estimated_revenue NUMERIC(14, 4) NOT NULL DEFAULT 0.0000, -- USD
    estimated_revenue_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0.00, -- VNĐ
    rpm NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    cpm NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    monetization_status TEXT NOT NULL DEFAULT 'active',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, report_date)
);

-- 2.11. Bảng Hiệu Quả Key (Keyword Performance Daily)
CREATE TABLE IF NOT EXISTS public.keyword_performance_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    keyword_id UUID NOT NULL REFERENCES public.keywords(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_videos_published INT DEFAULT 0,
    breakout_videos_count INT DEFAULT 0,
    total_views BIGINT DEFAULT 0,
    suggested_views BIGINT DEFAULT 0,
    total_revenue_usd NUMERIC(12, 4) DEFAULT 0.0000,
    total_revenue_vnd NUMERIC(15, 2) DEFAULT 0.00,
    avg_rpm NUMERIC(8, 4) DEFAULT 0.0000,
    synced_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (keyword_id, report_date)
);

-- ============================================================================
-- 3. HELPER FUNCTIONS & RLS POLICIES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_team_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT team_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Kích hoạt RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hwid_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_revenue_daily ENABLE ROW LEVEL SECURITY;

-- Policy Licenses: Chỉ Owner tạo/sửa
CREATE POLICY "owner_licenses_all" ON public.licenses FOR ALL
    USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

CREATE POLICY "company_view_license" ON public.licenses FOR SELECT
    USING (company_id = public.get_auth_company_id());

-- Policy Hợp tác chéo Leader: Leader xem được toàn bộ Key trong công ty
CREATE POLICY "cross_leader_keywords_select" ON public.keywords FOR SELECT
    USING (
        company_id = public.get_auth_company_id() 
        AND (public.get_auth_role() IN ('owner', 'admin', 'leader'))
    );

-- Policy Proposals: Leader xem được toàn bộ Proposals của công ty để đối chiếu
CREATE POLICY "leader_admin_view_proposals" ON public.proposals FOR SELECT
    USING (
        company_id = public.get_auth_company_id() 
        AND (public.get_auth_role() IN ('owner', 'admin', 'leader'))
    );

-- ============================================================================
-- 4. VIEW CHE GIẤU DOANH THU ĐỘNG (COMMISSION MASKING)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_channel_revenue_daily AS
SELECT
    crd.id,
    crd.company_id,
    crd.channel_id,
    mc.channel_name,
    crd.report_date,
    crd.views,
    crd.watch_time_hours,
    crd.subscribers_gained,
    crd.monetization_status,
    -- Nếu công ty bật bảo mật và người xem là User: Chỉ hiện tiền hoa hồng
    CASE
        WHEN co.mask_revenue_from_staff = true AND public.get_auth_role() = 'user'
        THEN ROUND(crd.estimated_revenue * (COALESCE(up.commission_rate, 20.0) / 100.0), 4)
        ELSE crd.estimated_revenue
    END AS estimated_revenue_usd,
    CASE
        WHEN co.mask_revenue_from_staff = true AND public.get_auth_role() = 'user'
        THEN ROUND(crd.estimated_revenue_vnd * (COALESCE(up.commission_rate, 20.0) / 100.0), 2)
        ELSE crd.estimated_revenue_vnd
    END AS estimated_revenue_vnd,
    (co.mask_revenue_from_staff = true AND public.get_auth_role() = 'user') AS is_commission_only
FROM public.channel_revenue_daily crd
JOIN public.managed_channels mc ON mc.id = crd.channel_id
JOIN public.companies co ON co.id = crd.company_id
LEFT JOIN public.user_profiles up ON up.id = auth.uid();


-- ============================================================================
-- 5. ADMIN RPC FUNCTIONS (MA TRẬN PHÂN QUYỀN 4 CẤP BẬC)
-- ============================================================================

-- 5.1. Gán Công Ty (Chỉ Master Owner có quyền)
CREATE OR REPLACE FUNCTION public.admin_assign_company(
    p_user_id UUID,
    p_company_id UUID,
    p_activate BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role user_role;
    v_company_exists BOOLEAN;
BEGIN
    SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'owner' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ Master Owner mới có quyền gán hoặc chuyển đổi công ty cho người dùng');
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) INTO v_company_exists;
    IF NOT v_company_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Công ty không tồn tại trên hệ thống');
    END IF;

    UPDATE public.user_profiles
    SET company_id = p_company_id,
        is_active = CASE WHEN p_activate IS TRUE THEN true ELSE is_active END,
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy người dùng');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã gán công ty thành công');
END;
$$;

-- 5.2. Phân Quyền Vai Trò (Owner toàn quyền, Admin chỉ User <-> Leader cùng công ty)
CREATE OR REPLACE FUNCTION public.admin_update_role(
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role user_role;
    v_caller_company_id UUID;
    v_target_role user_role;
    v_target_company_id UUID;
BEGIN
    SELECT role, company_id INTO v_caller_role, v_caller_company_id
    FROM public.user_profiles WHERE id = auth.uid();

    SELECT role, company_id INTO v_target_role, v_target_company_id
    FROM public.user_profiles WHERE id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy người dùng cần phân quyền');
    END IF;

    IF v_target_role = 'owner' AND p_role <> 'owner' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không thể thay đổi quyền hạn Master Owner tối cao');
    END IF;

    IF v_caller_role = 'owner' THEN
        UPDATE public.user_profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật vai trò thành công');
    ELSIF v_caller_role = 'admin' THEN
        IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin chỉ có quyền phân quyền cho nhân sự thuộc công ty mình');
        END IF;

        IF v_target_role IN ('owner', 'admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin không được phép thay đổi quyền hạn của Owner hoặc Admin khác');
        END IF;

        IF p_role NOT IN ('user', 'leader') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin chỉ có quyền phân quyền giữa Nhân viên (user) và Trưởng nhóm (leader)');
        END IF;

        UPDATE public.user_profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật vai trò thành công');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Bạn không có quyền phân quyền nhân sự');
    END IF;
END;
$$;

-- 5.3. Sửa Thông Tin User (Tên, hoa hồng, trạng thái, team)
CREATE OR REPLACE FUNCTION public.admin_update_info(
    p_user_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_commission_rate NUMERIC DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role user_role;
    v_caller_company_id UUID;
    v_caller_team_id UUID;
    v_target_role user_role;
    v_target_company_id UUID;
    v_target_team_id UUID;
BEGIN
    SELECT role, company_id, team_id INTO v_caller_role, v_caller_company_id, v_caller_team_id
    FROM public.user_profiles WHERE id = auth.uid();

    SELECT role, company_id, team_id INTO v_target_role, v_target_company_id, v_target_team_id
    FROM public.user_profiles WHERE id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy người dùng');
    END IF;

    IF v_caller_role = 'owner' THEN
        NULL;
    ELSIF v_caller_role = 'admin' THEN
        IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin chỉ có quyền sửa nhân sự trong công ty mình');
        END IF;
        IF v_target_role IN ('owner', 'admin') AND p_user_id <> auth.uid() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin không được phép sửa thông tin của Admin khác hoặc Owner');
        END IF;
    ELSIF v_caller_role = 'leader' THEN
        IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền sửa nhân sự trong công ty mình');
        END IF;
        IF v_target_role <> 'user' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền sửa thông tin của Nhân viên (user)');
        END IF;
        IF v_caller_team_id IS NOT NULL AND v_target_team_id IS NOT NULL AND v_target_team_id <> v_caller_team_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền sửa thông tin nhân viên thuộc nhóm mình');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Bạn không có quyền chỉnh sửa thông tin người dùng');
    END IF;

    UPDATE public.user_profiles
    SET full_name = COALESCE(p_full_name, full_name),
        commission_rate = COALESCE(p_commission_rate, commission_rate),
        is_active = COALESCE(p_is_active, is_active),
        team_id = CASE WHEN p_team_id IS NOT NULL THEN p_team_id ELSE team_id END,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thông tin thành công');
END;
$$;

-- 5.4. Xóa User (Owner xóa mọi người, Admin xóa User/Leader cùng công ty, Leader xóa User cùng công ty)
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role user_role;
    v_caller_company_id UUID;
    v_caller_team_id UUID;
    v_target_role user_role;
    v_target_company_id UUID;
    v_target_team_id UUID;
BEGIN
    SELECT role, company_id, team_id INTO v_caller_role, v_caller_company_id, v_caller_team_id
    FROM public.user_profiles WHERE id = auth.uid();

    SELECT role, company_id, team_id INTO v_target_role, v_target_company_id, v_target_team_id
    FROM public.user_profiles WHERE id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy người dùng cần xóa');
    END IF;

    IF v_target_role = 'owner' THEN
        RETURN jsonb_build_object('success', false, 'error', 'TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA TÀI KHOẢN MASTER OWNER');
    END IF;

    IF p_user_id = auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bạn không thể tự xóa tài khoản của chính mình');
    END IF;

    IF v_caller_role = 'owner' THEN
        NULL;
    ELSIF v_caller_role = 'admin' THEN
        IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin chỉ có quyền xóa nhân sự trong công ty mình');
        END IF;
        IF v_target_role IN ('owner', 'admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin không được phép xóa tài khoản của Admin khác hoặc Owner');
        END IF;
    ELSIF v_caller_role = 'leader' THEN
        IF v_target_company_id IS DISTINCT FROM v_caller_company_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền xóa nhân sự trong công ty mình');
        END IF;
        IF v_target_role <> 'user' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền xóa tài khoản Nhân viên (user)');
        END IF;
        IF v_caller_team_id IS NOT NULL AND v_target_team_id IS NOT NULL AND v_target_team_id <> v_caller_team_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Leader chỉ có quyền xóa nhân viên thuộc nhóm mình phụ trách');
        END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Bạn không có quyền xóa người dùng');
    END IF;

    DELETE FROM public.device_bindings WHERE user_id = p_user_id;
    DELETE FROM public.hwid_reset_requests WHERE user_id = p_user_id;
    DELETE FROM public.user_profiles WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã xóa người dùng khỏi hệ thống');
END;
$$;
