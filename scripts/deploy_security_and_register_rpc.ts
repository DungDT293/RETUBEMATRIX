import postgres from 'postgres';

const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Deploying security fixes and registration RPC to Supabase...');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  try {
    await sql.unsafe(`
    -- 1. CẬP NHẬT: verify_or_bind_device trả về đầy đủ Company info & Profile info
    CREATE OR REPLACE FUNCTION public.verify_or_bind_device(
        p_user_id UUID,
        p_hwid_hash VARCHAR(64),
        p_cpu_id TEXT DEFAULT '',
        p_motherboard_uuid TEXT DEFAULT '',
        p_machine_guid TEXT DEFAULT '',
        p_device_name TEXT DEFAULT '',
        p_os_info TEXT DEFAULT '',
        p_client_version TEXT DEFAULT '',
        p_ip INET DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_profile RECORD;
        v_company RECORD;
        v_license RECORD;
        v_binding RECORD;
    BEGIN
        SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND', 'error', 'Không tìm thấy hồ sơ người dùng');
        END IF;

        IF NOT v_profile.is_active THEN
            RETURN jsonb_build_object('success', false, 'code', 'USER_INACTIVE', 'error', 'Tài khoản người dùng đã bị vô hiệu hóa');
        END IF;

        SELECT * INTO v_company FROM public.companies WHERE id = v_profile.company_id;

        SELECT * INTO v_license FROM public.licenses 
        WHERE company_id = v_profile.company_id AND status = 'active' AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;

        IF NOT FOUND AND v_profile.role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_LICENSE', 'error', 'Công ty chưa có License hợp lệ hoặc đã hết hạn');
        END IF;

        SELECT * INTO v_binding FROM public.device_bindings 
        WHERE user_id = p_user_id AND is_active = true LIMIT 1;

        IF FOUND THEN
            -- ĐẶC QUYỀN OWNER: MIỄN TRỪ HOÀN TOÀN KHÓA MÁY (Bypass HWID 100%)
            -- Owner được phép dùng trên MỌI MÁY MỌI THIẾT BỊ KHÔNG GIỚI HẠN!
            IF v_profile.role = 'owner' OR v_profile.email = 'dungdong333@gmail.com' THEN
                UPDATE public.device_bindings 
                SET hwid_hash = p_hwid_hash,
                    cpu_id = COALESCE(NULLIF(p_cpu_id, ''), cpu_id),
                    motherboard_uuid = COALESCE(NULLIF(p_motherboard_uuid, ''), motherboard_uuid),
                    machine_guid = COALESCE(NULLIF(p_machine_guid, ''), machine_guid),
                    device_name = COALESCE(NULLIF(p_device_name, ''), device_name),
                    os_info = COALESCE(NULLIF(p_os_info, ''), os_info),
                    last_heartbeat_at = now(),
                    last_ip = COALESCE(p_ip, last_ip),
                    client_version = COALESCE(NULLIF(p_client_version, ''), client_version),
                    updated_at = now()
                WHERE id = v_binding.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'bound', true,
                    'is_new_binding', false,
                    'binding_id', v_binding.id,
                    'binding_token', v_binding.binding_token,
                    'tier', 'enterprise',
                    'features', COALESCE(v_license.features, '{"unlimitedSeats": true}'::jsonb),
                    'role', 'owner',
                    'full_name', v_profile.full_name,
                    'commission_rate', COALESCE(v_profile.commission_rate, 100.0),
                    'company_id', v_profile.company_id,
                    'company_name', COALESCE(v_company.name, 'RETubeMatrix HQ'),
                    'company_code', COALESCE(v_company.code, 'HQ'),
                    'mask_revenue_from_staff', false,
                    'cross_leader_collaboration', true
                );
            END IF;

            IF v_binding.hwid_hash = p_hwid_hash THEN
                UPDATE public.device_bindings 
                SET last_heartbeat_at = now(),
                    last_ip = COALESCE(p_ip, last_ip),
                    client_version = COALESCE(NULLIF(p_client_version, ''), client_version),
                    updated_at = now()
                WHERE id = v_binding.id;

                RETURN jsonb_build_object(
                    'success', true,
                    'bound', true,
                    'is_new_binding', false,
                    'binding_id', v_binding.id,
                    'binding_token', v_binding.binding_token,
                    'tier', COALESCE(v_license.tier::text, 'enterprise'),
                    'features', COALESCE(v_license.features, '{}'::jsonb),
                    'role', v_profile.role,
                    'full_name', v_profile.full_name,
                    'commission_rate', COALESCE(v_profile.commission_rate, 20.0),
                    'company_id', v_profile.company_id,
                    'company_name', COALESCE(v_company.name, 'RETubeMatrix HQ'),
                    'company_code', COALESCE(v_company.code, 'HQ'),
                    'mask_revenue_from_staff', COALESCE(v_company.mask_revenue_from_staff, false),
                    'cross_leader_collaboration', COALESCE(v_company.cross_leader_collaboration, true)
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'HWID_MISMATCH',
                    'error', 'Tài khoản đã được gắn với máy khác (' || COALESCE(v_binding.device_name, 'Thiết bị cũ') || '). 1 Tài khoản chỉ được dùng trên 1 Máy duy nhất. Vui lòng gửi yêu cầu Reset HWID.',
                    'current_device_name', v_binding.device_name,
                    'bound_at', v_binding.created_at
                );
            END IF;
        ELSE
            IF v_license.id IS NOT NULL AND v_license.used_seats >= v_license.max_seats AND v_profile.role != 'owner' THEN
                RETURN jsonb_build_object('success', false, 'code', 'MAX_SEATS_EXCEEDED', 'error', 'License công ty đã đạt tối đa số máy (' || v_license.max_seats || ' seats)');
            END IF;

            INSERT INTO public.device_bindings (
                user_id, company_id, license_id, hwid_hash, cpu_id, motherboard_uuid,
                machine_guid, device_name, os_info, client_version, last_ip, last_heartbeat_at, is_active
            ) VALUES (
                p_user_id, v_profile.company_id, v_license.id, p_hwid_hash, p_cpu_id, p_motherboard_uuid,
                p_machine_guid, p_device_name, p_os_info, p_client_version, p_ip, now(), true
            ) RETURNING id, binding_token INTO v_binding;

            IF v_license.id IS NOT NULL THEN
                UPDATE public.licenses SET used_seats = used_seats + 1, updated_at = now() WHERE id = v_license.id;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'bound', true,
                'is_new_binding', true,
                'binding_id', v_binding.id,
                'binding_token', v_binding.binding_token,
                'tier', COALESCE(v_license.tier::text, 'enterprise'),
                'features', COALESCE(v_license.features, '{}'::jsonb),
                'role', v_profile.role,
                'full_name', v_profile.full_name,
                'commission_rate', COALESCE(v_profile.commission_rate, 20.0),
                'company_id', v_profile.company_id,
                'company_name', COALESCE(v_company.name, 'RETubeMatrix HQ'),
                'company_code', COALESCE(v_company.code, 'HQ'),
                'mask_revenue_from_staff', COALESCE(v_company.mask_revenue_from_staff, false),
                'cross_leader_collaboration', COALESCE(v_company.cross_leader_collaboration, true)
            );
        END IF;
    END;
    $$;

    -- 2. CẬP NHẬT: review_hwid_reset_request — SIẾT CHẶT ROLE CHECK & TENANT CHECK
    CREATE OR REPLACE FUNCTION public.review_hwid_reset_request(
        p_request_id UUID,
        p_approved BOOLEAN,
        p_notes TEXT DEFAULT ''
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_caller_role user_role;
        v_caller_company UUID;
        v_req RECORD;
    BEGIN
        v_caller_role := public.get_auth_role();
        v_caller_company := public.get_auth_company_id();

        IF v_caller_role NOT IN ('owner', 'admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Chỉ Quản trị viên (Admin) hoặc Chủ dự án (Owner) mới có quyền duyệt đổi máy HWID');
        END IF;

        SELECT * INTO v_req FROM public.hwid_reset_requests WHERE id = p_request_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy yêu cầu đổi máy');
        END IF;

        IF v_caller_role = 'admin' AND v_req.company_id != v_caller_company THEN
            RETURN jsonb_build_object('success', false, 'error', 'Bạn không có quyền duyệt yêu cầu của công ty khác');
        END IF;

        IF v_req.status != 'pending' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Yêu cầu này đã được xử lý trước đó (' || v_req.status || ')');
        END IF;

        IF p_approved THEN
            UPDATE public.device_bindings
            SET is_active = false, updated_at = now()
            WHERE user_id = v_req.user_id AND is_active = true;

            UPDATE public.hwid_reset_requests
            SET status = 'approved',
                reviewed_by = auth.uid(),
                reviewed_at = now(),
                review_notes = p_notes,
                updated_at = now()
            WHERE id = p_request_id;

            RETURN jsonb_build_object('success', true, 'message', 'Đã duyệt yêu cầu đổi máy. Người dùng có thể đăng nhập trên máy mới.');
        ELSE
            UPDATE public.hwid_reset_requests
            SET status = 'rejected',
                reviewed_by = auth.uid(),
                reviewed_at = now(),
                review_notes = p_notes,
                updated_at = now()
            WHERE id = p_request_id;

            RETURN jsonb_build_object('success', true, 'message', 'Đã từ chối yêu cầu đổi máy.');
        END IF;
    END;
    $$;

    -- 3. CẬP NHẬT: submit_proposal — BẢO VỆ CHỐNG TRÙNG LẶP PENDING & NICHE
    CREATE OR REPLACE FUNCTION public.submit_proposal(
        p_proposal_type proposal_type,
        p_target_value TEXT,
        p_target_name TEXT DEFAULT '',
        p_reason TEXT DEFAULT '',
        p_metadata JSONB DEFAULT '{}'::jsonb
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_user_id UUID;
        v_company_id UUID;
        v_team_id UUID;
        v_user_name TEXT;
        v_exists BOOLEAN;
        v_pending_exists BOOLEAN;
        v_new_id UUID;
    BEGIN
        v_user_id := auth.uid();
        v_company_id := public.get_auth_company_id();
        v_team_id := public.get_auth_team_id();

        SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;

        -- Kiểm tra trùng proposal đang pending hoặc đã duyệt
        SELECT EXISTS(
            SELECT 1 FROM public.proposals 
            WHERE company_id = v_company_id 
              AND proposal_type = p_proposal_type 
              AND lower(trim(target_value)) = lower(trim(p_target_value))
              AND status IN ('pending', 'approved')
        ) INTO v_pending_exists;

        IF v_pending_exists THEN
            RETURN jsonb_build_object('success', false, 'error', 'Mục tiêu này đang có đề xuất chờ duyệt hoặc đã được duyệt trước đó.');
        END IF;

        IF p_proposal_type = 'keyword' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.keywords 
                WHERE company_id = v_company_id AND lower(trim(keyword_text)) = lower(trim(p_target_value))
            ) INTO v_exists;

            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Từ khóa này đã tồn tại trong kho tài nguyên của công ty.');
            END IF;

        ELSIF p_proposal_type = 'competitor_channel' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.managed_channels 
                WHERE company_id = v_company_id 
                  AND (lower(trim(youtube_channel_id)) = lower(trim(p_target_value)) 
                       OR lower(trim(channel_name)) = lower(trim(p_target_name)))
            ) INTO v_exists;

            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Kênh này đã có trong danh mục quản lý của công ty.');
            END IF;

        ELSIF p_proposal_type = 'niche' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.niches 
                WHERE company_id = v_company_id AND lower(trim(name)) = lower(trim(p_target_value))
            ) INTO v_exists;

            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Ngách này đã tồn tại trong danh mục công ty.');
            END IF;
        END IF;

        INSERT INTO public.proposals (
            company_id, team_id, submitted_by, proposal_type, target_value, target_name, reason, metadata, status
        ) VALUES (
            v_company_id, v_team_id, COALESCE(v_user_name, 'Nhân viên'), p_proposal_type, trim(p_target_value), trim(p_target_name), trim(p_reason), p_metadata, 'pending'
        ) RETURNING id INTO v_new_id;

        RETURN jsonb_build_object('success', true, 'proposal_id', v_new_id, 'message', 'Đã gửi đề xuất thành công. Đang chờ Leader hoặc Admin thẩm định.');
    END;
    $$;

    -- 4. CẬP NHẬT: View v_channel_revenue_daily với Tenant Isolation chuẩn mực
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
    LEFT JOIN public.user_profiles up ON up.id = auth.uid()
    WHERE (crd.company_id = public.get_auth_company_id() OR public.get_auth_role() = 'owner');

    -- 5. RPC ĐĂNG KÝ MỚI GẮN VỚI TENANT / LICENSE KEY
    CREATE OR REPLACE FUNCTION public.setup_registered_profile_and_bind(
        p_user_id UUID,
        p_company_id UUID,
        p_role user_role,
        p_full_name TEXT,
        p_email TEXT,
        p_hwid_hash VARCHAR(64),
        p_cpu_id TEXT DEFAULT '',
        p_motherboard_uuid TEXT DEFAULT '',
        p_machine_guid TEXT DEFAULT '',
        p_device_name TEXT DEFAULT '',
        p_os_info TEXT DEFAULT '',
        p_client_version TEXT DEFAULT ''
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_license RECORD;
        v_binding RECORD;
    BEGIN
        SELECT * INTO v_license FROM public.licenses
        WHERE company_id = p_company_id AND status = 'active' AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;

        IF NOT FOUND AND p_role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Công ty chưa có License kích hoạt');
        END IF;

        IF v_license.id IS NOT NULL AND v_license.used_seats >= v_license.max_seats AND p_role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'code', 'SEATS_LIMIT_REACHED', 'error', 'Công ty đã hết số lượng máy cho phép (' || v_license.max_seats || ' seats)');
        END IF;

        INSERT INTO public.user_profiles (
            id, company_id, role, full_name, email, commission_rate, is_active
        ) VALUES (
            p_user_id, p_company_id, p_role, p_full_name, p_email, 20.0, true
        )
        ON CONFLICT (id) DO UPDATE SET
            company_id = EXCLUDED.company_id,
            role = EXCLUDED.role,
            full_name = EXCLUDED.full_name,
            updated_at = now();

        INSERT INTO public.device_bindings (
            user_id, company_id, license_id, hwid_hash, cpu_id, motherboard_uuid,
            machine_guid, device_name, os_info, client_version, last_heartbeat_at, is_active
        ) VALUES (
            p_user_id, p_company_id, v_license.id, p_hwid_hash, p_cpu_id, p_motherboard_uuid,
            p_machine_guid, p_device_name, p_os_info, p_client_version, now(), true
        ) RETURNING id INTO v_binding;

        IF v_license.id IS NOT NULL THEN
            UPDATE public.licenses SET used_seats = used_seats + 1, updated_at = now() WHERE id = v_license.id;
        END IF;

        RETURN jsonb_build_object('success', true, 'binding_id', v_binding.id, 'company_id', p_company_id);
    END;
    $$;
    `);

    console.log('Successfully deployed security fixes and registration RPC!');
  } catch (err) {
    console.error('Error deploying:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
