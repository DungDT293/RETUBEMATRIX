import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const connectionString =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Connecting to Supabase PostgreSQL direct...');
  const sql = postgres(connectionString, {
    max: 1,
    ssl: 'require',
  });

  try {
    const versionRes = await sql`SELECT version();`;
    console.log('PostgreSQL Connected successfully:', versionRes[0].version);

    // 1. Read and execute supabase_schema.sql
    const schemaSql = fs.readFileSync(path.resolve('supabase_schema.sql'), 'utf-8');
    console.log('Deploying base schema (tables, enums, views, RLS)...');
    await sql.unsafe(schemaSql);
    console.log('Base schema deployed successfully!');

    // 2. Deploy RPC Functions (verify_or_bind_device, etc.)
    const rpcSql = `
    -- RPC: verify_or_bind_device
    CREATE OR REPLACE FUNCTION public.verify_or_bind_device(
        p_user_id UUID,
        p_hwid_hash TEXT,
        p_cpu_id TEXT,
        p_motherboard_uuid TEXT,
        p_machine_guid TEXT,
        p_device_name TEXT DEFAULT NULL,
        p_os_info TEXT DEFAULT NULL,
        p_client_version TEXT DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_profile RECORD;
        v_license RECORD;
        v_existing_binding RECORD;
        v_binding_id UUID;
        v_token UUID;
    BEGIN
        -- 1. Lấy thông tin profile người dùng
        SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'status', 'user_not_found', 'message', 'Không tìm thấy hồ sơ người dùng');
        END IF;

        IF v_profile.is_active = false THEN
            RETURN jsonb_build_object('success', false, 'status', 'user_suspended', 'message', 'Tài khoản người dùng đã bị tạm khóa');
        END IF;

        -- 2. Kiểm tra License của công ty
        SELECT * INTO v_license FROM public.licenses 
        WHERE company_id = v_profile.company_id AND status = 'active'
        ORDER BY created_at DESC LIMIT 1;

        IF NOT FOUND AND v_profile.role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'status', 'no_license', 'message', 'Công ty chưa được cấp bản quyền hoạt động');
        END IF;

        IF v_license.expires_at < now() AND v_profile.role != 'owner' THEN
            RETURN jsonb_build_object('success', false, 'status', 'license_expired', 'message', 'Bản quyền công ty đã hết hạn');
        END IF;

        -- 3. Kiểm tra liên kết thiết bị hiện tại
        SELECT * INTO v_existing_binding FROM public.device_bindings 
        WHERE user_id = p_user_id AND is_active = true LIMIT 1;

        IF FOUND THEN
            -- Đã có máy liên kết
            IF v_existing_binding.hwid_hash = p_hwid_hash THEN
                -- Đúng máy: Cập nhật heartbeat và thông số
                UPDATE public.device_bindings 
                SET last_heartbeat_at = now(),
                    client_version = COALESCE(p_client_version, client_version),
                    device_name = COALESCE(p_device_name, device_name),
                    os_info = COALESCE(p_os_info, os_info)
                WHERE id = v_existing_binding.id;

                RETURN jsonb_build_object(
                    'success', true, 
                    'status', 'verified', 
                    'message', 'Xác thực thiết bị hợp lệ',
                    'binding_token', v_existing_binding.binding_token,
                    'role', v_profile.role,
                    'company_id', v_profile.company_id,
                    'features', COALESCE(v_license.features, '{}'::jsonb)
                );
            ELSE
                -- Máy khác: Chặn và yêu cầu gửi đơn xin đổi máy
                RETURN jsonb_build_object(
                    'success', false, 
                    'status', 'hwid_mismatch', 
                    'message', 'Tài khoản này đã bị khóa vào một thiết bị khác. 1 Tài Khoản chỉ dùng được trên 1 Máy duy nhất. Vui lòng gửi yêu cầu đổi máy để được Admin phê duyệt.',
                    'current_device_name', v_existing_binding.device_name,
                    'current_last_seen', v_existing_binding.last_heartbeat_at
                );
            END IF;
        ELSE
            -- Chưa liên kết máy nào: Tiến hành ràng buộc máy đầu tiên (First-time Binding)
            IF v_license.id IS NOT NULL AND v_license.used_seats >= v_license.max_seats AND v_profile.role != 'owner' THEN
                RETURN jsonb_build_object('success', false, 'status', 'seats_exceeded', 'message', 'Công ty đã dùng hết số lượng máy cho phép (Seats Limit)');
            END IF;

            v_token := gen_random_uuid();
            INSERT INTO public.device_bindings (
                user_id, company_id, license_id, hwid_hash, cpu_id, 
                motherboard_uuid, machine_guid, device_name, os_info, 
                client_version, is_active, binding_token
            ) VALUES (
                p_user_id, v_profile.company_id, v_license.id, p_hwid_hash, p_cpu_id,
                p_motherboard_uuid, p_machine_guid, p_device_name, p_os_info,
                p_client_version, true, v_token
            ) RETURNING id INTO v_binding_id;

            -- Tăng used_seats
            IF v_license.id IS NOT NULL THEN
                UPDATE public.licenses SET used_seats = used_seats + 1 WHERE id = v_license.id;
            END IF;

            RETURN jsonb_build_object(
                'success', true, 
                'status', 'bound', 
                'message', 'Khóa thiết bị vào tài khoản thành công',
                'binding_token', v_token,
                'role', v_profile.role,
                'company_id', v_profile.company_id,
                'features', COALESCE(v_license.features, '{}'::jsonb)
            );
        END IF;
    END;
    $$;

    -- RPC: submit_hwid_reset_request
    CREATE OR REPLACE FUNCTION public.submit_hwid_reset_request(
        p_user_id UUID,
        p_new_hwid_hash TEXT,
        p_new_device_info JSONB,
        p_reason TEXT
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_profile RECORD;
        v_current_binding RECORD;
        v_request_id UUID;
    BEGIN
        SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_user_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Người dùng không tồn tại');
        END IF;

        SELECT * INTO v_current_binding FROM public.device_bindings WHERE user_id = p_user_id AND is_active = true LIMIT 1;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Tài khoản chưa có máy cũ để reset');
        END IF;

        INSERT INTO public.hwid_reset_requests (
            user_id, company_id, license_id, current_hwid_hash,
            new_hwid_hash, new_device_info, reason, status
        ) VALUES (
            p_user_id, v_profile.company_id, v_current_binding.license_id,
            v_current_binding.hwid_hash, p_new_hwid_hash, p_new_device_info,
            p_reason, 'pending'
        ) RETURNING id INTO v_request_id;

        RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'message', 'Đã gửi yêu cầu đổi máy tới Admin / Quản lý');
    END;
    $$;

    -- RPC: review_hwid_reset_request
    CREATE OR REPLACE FUNCTION public.review_hwid_reset_request(
        p_request_id UUID,
        p_approved BOOLEAN,
        p_notes TEXT DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_req RECORD;
    BEGIN
        SELECT * INTO v_req FROM public.hwid_reset_requests WHERE id = p_request_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Yêu cầu không tồn tại');
        END IF;

        IF v_req.status != 'pending' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Yêu cầu này đã được xử lý trước đó');
        END IF;

        IF p_approved THEN
            -- Hủy kích hoạt máy cũ
            UPDATE public.device_bindings 
            SET is_active = false, updated_at = now()
            WHERE user_id = v_req.user_id AND is_active = true;

            -- Kích hoạt yêu cầu
            UPDATE public.hwid_reset_requests
            SET status = 'approved',
                reviewed_by = auth.uid(),
                reviewed_at = now(),
                review_notes = p_notes
            WHERE id = p_request_id;

            RETURN jsonb_build_object('success', true, 'message', 'Đã duyệt đổi máy thành công. Người dùng có thể đăng nhập trên thiết bị mới.');
        ELSE
            UPDATE public.hwid_reset_requests
            SET status = 'rejected',
                reviewed_by = auth.uid(),
                reviewed_at = now(),
                review_notes = p_notes
            WHERE id = p_request_id;

            RETURN jsonb_build_object('success', true, 'message', 'Đã từ chối yêu cầu đổi máy');
        END IF;
    END;
    $$;

    -- RPC: submit_proposal (Đề xuất Key hoặc Kênh đối thủ mới)
    CREATE OR REPLACE FUNCTION public.submit_proposal(
        p_proposal_type proposal_type,
        p_target_value TEXT,
        p_target_name TEXT,
        p_reason TEXT,
        p_niche_id UUID DEFAULT NULL,
        p_metadata JSONB DEFAULT '{}'::jsonb
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_company_id UUID;
        v_team_id UUID;
        v_proposal_id UUID;
        v_collision_count INT;
    BEGIN
        SELECT company_id, team_id INTO v_company_id, v_team_id 
        FROM public.user_profiles WHERE id = auth.uid();

        IF v_company_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Chưa xác định công ty của người gửi');
        END IF;

        -- Kiểm tra trùng lặp (Collision Check)
        IF p_proposal_type = 'keyword' THEN
            SELECT count(*) INTO v_collision_count FROM public.keywords 
            WHERE company_id = v_company_id AND lower(keyword_text) = lower(trim(p_target_value));
            IF v_collision_count > 0 THEN
                RETURN jsonb_build_object('success', false, 'message', 'Từ khóa này đã tồn tại trong kho tài nguyên của công ty');
            END IF;
        ELSIF p_proposal_type = 'competitor_channel' THEN
            SELECT count(*) INTO v_collision_count FROM public.managed_channels 
            WHERE company_id = v_company_id AND youtube_channel_id = trim(p_target_value);
            IF v_collision_count > 0 THEN
                RETURN jsonb_build_object('success', false, 'message', 'Kênh này đã nằm trong danh sách quản lý của công ty');
            END IF;
        END IF;

        INSERT INTO public.proposals (
            company_id, team_id, submitted_by, proposal_type,
            target_value, target_name, niche_id, metadata, reason, status
        ) VALUES (
            v_company_id, v_team_id, auth.uid(), p_proposal_type,
            trim(p_target_value), p_target_name, p_niche_id, p_metadata, p_reason, 'pending'
        ) RETURNING id INTO v_proposal_id;

        RETURN jsonb_build_object('success', true, 'proposal_id', v_proposal_id, 'message', 'Gửi đề xuất thành công. Đang chờ Leader / Admin xét duyệt.');
    END;
    $$;
    `;

    console.log('Deploying RPC Functions...');
    await sql.unsafe(rpcSql);
    console.log('RPC Functions deployed successfully!');

    // 3. Verify deployed tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('\nDeployed tables count:', tables.length);
    console.log('Tables:', tables.map((t) => t.table_name).join(', '));

    // 4. Verify RPC functions
    const routines = await sql`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    `;
    console.log('\nDeployed functions:', routines.map((r) => r.routine_name).join(', '));
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
