import postgres from 'postgres';

const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Deploying extra RPCs to Supabase...');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  const rpcSql = `
  DROP FUNCTION IF EXISTS public.verify_or_bind_device(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
  DROP FUNCTION IF EXISTS public.verify_or_bind_device(UUID, VARCHAR, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET);
  DROP FUNCTION IF EXISTS public.ingest_studio_analytics;

  -- 5.1. RPC: verify_or_bind_device
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

      SELECT * INTO v_license FROM public.licenses 
      WHERE company_id = v_profile.company_id AND status = 'active' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1;

      IF NOT FOUND AND v_profile.role != 'owner' THEN
          RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_LICENSE', 'error', 'Công ty chưa có License hợp lệ hoặc đã hết hạn');
      END IF;

      SELECT * INTO v_binding FROM public.device_bindings 
      WHERE user_id = p_user_id AND is_active = true LIMIT 1;

      IF FOUND THEN
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
                  'company_id', v_profile.company_id
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
              'company_id', v_profile.company_id
          );
      END IF;
  END;
  $$;

  -- 5.2. RPC: ingest_studio_analytics
  CREATE OR REPLACE FUNCTION public.ingest_studio_analytics(
      p_company_id UUID DEFAULT NULL,
      p_youtube_channel_id TEXT DEFAULT NULL,
      p_channel_name TEXT DEFAULT NULL,
      p_report_date DATE DEFAULT CURRENT_DATE,
      p_views BIGINT DEFAULT 0,
      p_watch_time_hours NUMERIC DEFAULT 0.0,
      p_subscribers_gained INT DEFAULT 0,
      p_estimated_revenue NUMERIC DEFAULT 0.0,
      p_estimated_revenue_vnd NUMERIC DEFAULT 0.0,
      p_rpm NUMERIC DEFAULT 0.0,
      p_cpm NUMERIC DEFAULT 0.0,
      p_monetization_status TEXT DEFAULT 'active'
  )
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  DECLARE
      v_channel_id UUID;
      v_target_company_id UUID := p_company_id;
  BEGIN
      IF p_youtube_channel_id IS NOT NULL THEN
          SELECT id, company_id INTO v_channel_id, v_target_company_id 
          FROM public.managed_channels 
          WHERE youtube_channel_id = p_youtube_channel_id 
          LIMIT 1;

          IF v_channel_id IS NULL AND v_target_company_id IS NOT NULL THEN
              INSERT INTO public.managed_channels (
                  company_id, youtube_channel_id, channel_name, monetization_status
              ) VALUES (
                  v_target_company_id, p_youtube_channel_id, COALESCE(p_channel_name, p_youtube_channel_id), p_monetization_status
              ) RETURNING id INTO v_channel_id;
          END IF;
      END IF;

      IF v_channel_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Không xác định được managed_channel cho youtube_channel_id: ' || COALESCE(p_youtube_channel_id, 'null'));
      END IF;

      INSERT INTO public.channel_revenue_daily (
          company_id, channel_id, report_date, views, watch_time_hours,
          subscribers_gained, estimated_revenue, estimated_revenue_vnd, rpm, cpm,
          monetization_status, synced_at
      ) VALUES (
          v_target_company_id, v_channel_id, p_report_date, p_views, p_watch_time_hours,
          p_subscribers_gained, p_estimated_revenue, p_estimated_revenue_vnd, p_rpm, p_cpm,
          p_monetization_status, now()
      )
      ON CONFLICT (channel_id, report_date) DO UPDATE SET
          views = EXCLUDED.views,
          watch_time_hours = EXCLUDED.watch_time_hours,
          subscribers_gained = EXCLUDED.subscribers_gained,
          estimated_revenue = EXCLUDED.estimated_revenue,
          estimated_revenue_vnd = EXCLUDED.estimated_revenue_vnd,
          rpm = EXCLUDED.rpm,
          cpm = EXCLUDED.cpm,
          monetization_status = EXCLUDED.monetization_status,
          synced_at = now();

      RETURN jsonb_build_object('success', true, 'channel_id', v_channel_id, 'report_date', p_report_date);
  END;
  $$;

  GRANT EXECUTE ON FUNCTION public.verify_or_bind_device TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.ingest_studio_analytics TO anon, authenticated, service_role;
  `;

  await sql.unsafe(rpcSql);
  console.log('All extra RPCs deployed and permissions granted successfully!');
  await sql.end();
}

main().catch(console.error);
