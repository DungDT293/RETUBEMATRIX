import postgres from 'postgres';

const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Deploying 4 RBAC RPCs to Supabase...');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  try {
    const rpcSql = `
-- 5.1. Gán User vào Công Ty (Chỉ Master Owner có quyền)
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
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ Master Owner mới có quyền phân bổ người dùng vào Công ty');
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
    `;

    await sql.unsafe(rpcSql);
    console.log('✅ Successfully deployed all 4 RBAC RPC functions to Supabase!');
    await sql.end();
  } catch (err) {
    console.error('❌ Failed to deploy RBAC RPCs:', err);
    process.exit(1);
  }
}

main();
