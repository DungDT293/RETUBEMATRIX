import postgres from 'postgres';

const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Running Supabase Remediation Script for Web Admin Portal...');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  await sql.unsafe(`
    -- 1. THÊM FOREIGN KEYS SANG public.user_profiles ĐỂ FIX LỖI PostgREST PGRST200
    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_device_bindings_user_profiles'
        ) THEN
            ALTER TABLE public.device_bindings
            ADD CONSTRAINT fk_device_bindings_user_profiles
            FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
        END IF;
    END $$;

    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_hwid_reset_requests_user_profiles'
        ) THEN
            ALTER TABLE public.hwid_reset_requests
            ADD CONSTRAINT fk_hwid_reset_requests_user_profiles
            FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
        END IF;
    END $$;

    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_proposals_user_profiles'
        ) THEN
            ALTER TABLE public.proposals
            ADD CONSTRAINT fk_proposals_user_profiles
            FOREIGN KEY (submitted_by) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
        END IF;
    END $$;

    -- 2. TẠO BẢNG AUDIT RAW TELEMETRY CHO YOUTUBE STUDIO
    CREATE TABLE IF NOT EXISTS public.studio_telemetry_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
        channel_id UUID REFERENCES public.managed_channels(id) ON DELETE SET NULL,
        youtube_channel_id TEXT,
        payload JSONB NOT NULL,
        client_ip INET,
        ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE public.studio_telemetry_logs ENABLE ROW LEVEL SECURITY;

    -- 3. TẠO VIEWS TƯƠNG THÍCH THEO DANH ĐẶT TÊN SPEC (ALIASES)
    CREATE OR REPLACE VIEW public.profiles AS 
    SELECT * FROM public.user_profiles;

    CREATE OR REPLACE VIEW public.user_devices AS 
    SELECT * FROM public.device_bindings;

    CREATE OR REPLACE VIEW public.key_proposals AS 
    SELECT * FROM public.proposals;

    CREATE OR REPLACE VIEW public.daily_summaries AS 
    SELECT * FROM public.v_channel_revenue_daily;

    -- 4. BỔ SUNG TOÀN BỘ RLS POLICIES BỊ THIẾU
    DROP POLICY IF EXISTS "owner_companies_all" ON public.companies;
    CREATE POLICY "owner_companies_all" ON public.companies FOR ALL
        USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

    DROP POLICY IF EXISTS "company_member_select" ON public.companies;
    CREATE POLICY "company_member_select" ON public.companies FOR SELECT
        USING (id = public.get_auth_company_id());

    DROP POLICY IF EXISTS "admin_update_company" ON public.companies;
    CREATE POLICY "admin_update_company" ON public.companies FOR UPDATE
        USING (id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin'))
        WITH CHECK (id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin'));

    -- User Profiles Policies
    DROP POLICY IF EXISTS "owner_user_profiles_all" ON public.user_profiles;
    CREATE POLICY "owner_user_profiles_all" ON public.user_profiles FOR ALL
        USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

    DROP POLICY IF EXISTS "company_view_staff_profiles" ON public.user_profiles;
    CREATE POLICY "company_view_staff_profiles" ON public.user_profiles FOR SELECT
        USING (
            company_id = public.get_auth_company_id() 
            OR id = auth.uid()
        );

    DROP POLICY IF EXISTS "user_update_own_profile" ON public.user_profiles;
    CREATE POLICY "user_update_own_profile" ON public.user_profiles FOR UPDATE
        USING (id = auth.uid()) WITH CHECK (id = auth.uid());

    -- Device Bindings Policies
    DROP POLICY IF EXISTS "owner_device_bindings_all" ON public.device_bindings;
    CREATE POLICY "owner_device_bindings_all" ON public.device_bindings FOR ALL
        USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

    DROP POLICY IF EXISTS "admin_device_bindings_select" ON public.device_bindings;
    CREATE POLICY "admin_device_bindings_select" ON public.device_bindings FOR SELECT
        USING (
            (company_id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin', 'leader'))
            OR user_id = auth.uid()
        );

    DROP POLICY IF EXISTS "admin_device_bindings_update" ON public.device_bindings;
    CREATE POLICY "admin_device_bindings_update" ON public.device_bindings FOR UPDATE
        USING (company_id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin'))
        WITH CHECK (company_id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin'));

    -- HWID Reset Requests Policies
    DROP POLICY IF EXISTS "owner_hwid_requests_all" ON public.hwid_reset_requests;
    CREATE POLICY "owner_hwid_requests_all" ON public.hwid_reset_requests FOR ALL
        USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

    DROP POLICY IF EXISTS "admin_hwid_requests_select" ON public.hwid_reset_requests;
    CREATE POLICY "admin_hwid_requests_select" ON public.hwid_reset_requests FOR SELECT
        USING (
            (company_id = public.get_auth_company_id() AND public.get_auth_role() IN ('owner', 'admin'))
            OR user_id = auth.uid()
        );

    DROP POLICY IF EXISTS "user_hwid_requests_insert" ON public.hwid_reset_requests;
    CREATE POLICY "user_hwid_requests_insert" ON public.hwid_reset_requests FOR INSERT
        WITH CHECK (user_id = auth.uid() AND company_id = public.get_auth_company_id());

    -- Managed Channels & Revenue Policies
    DROP POLICY IF EXISTS "owner_channels_all" ON public.managed_channels;
    CREATE POLICY "owner_channels_all" ON public.managed_channels FOR ALL
        USING (public.get_auth_role() = 'owner') WITH CHECK (public.get_auth_role() = 'owner');

    DROP POLICY IF EXISTS "company_channels_select" ON public.managed_channels;
    CREATE POLICY "company_channels_select" ON public.managed_channels FOR SELECT
        USING (company_id = public.get_auth_company_id());

    DROP POLICY IF EXISTS "company_revenue_select" ON public.channel_revenue_daily;
    CREATE POLICY "company_revenue_select" ON public.channel_revenue_daily FOR SELECT
        USING (
            company_id = public.get_auth_company_id() 
            OR public.get_auth_role() = 'owner'
        );

    -- 5. SỬA TRIỆT ĐỂ LỖI RPC submit_proposal (DROP CẢ 2 BẢN OVERLOAD CŨ VÀ TẠO MỚI)
    DROP FUNCTION IF EXISTS public.submit_proposal(proposal_type, text, text, text, jsonb);
    DROP FUNCTION IF EXISTS public.submit_proposal(proposal_type, text, text, text, uuid, jsonb);

    CREATE OR REPLACE FUNCTION public.submit_proposal(
        p_proposal_type proposal_type,
        p_target_value TEXT,
        p_target_name TEXT DEFAULT '',
        p_reason TEXT DEFAULT '',
        p_niche_id UUID DEFAULT NULL,
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
        v_pending_exists BOOLEAN;
        v_exists BOOLEAN;
        v_new_id UUID;
    BEGIN
        v_user_id := auth.uid();
        v_company_id := public.get_auth_company_id();
        v_team_id := public.get_auth_team_id();

        IF v_company_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Chưa xác định công ty của tài khoản gửi đề xuất');
        END IF;

        SELECT EXISTS(
            SELECT 1 FROM public.proposals 
            WHERE company_id = v_company_id 
              AND proposal_type = p_proposal_type 
              AND lower(trim(target_value)) = lower(trim(p_target_value))
              AND status IN ('pending', 'approved')
        ) INTO v_pending_exists;

        IF v_pending_exists THEN
            RETURN jsonb_build_object('success', false, 'error', 'Mục tiêu này đang có đề xuất chờ duyệt hoặc đã được duyệt');
        END IF;

        IF p_proposal_type = 'keyword' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.keywords 
                WHERE company_id = v_company_id AND lower(trim(keyword_text)) = lower(trim(p_target_value))
            ) INTO v_exists;
            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Từ khóa này đã tồn tại trong kho tài nguyên của công ty');
            END IF;

        ELSIF p_proposal_type = 'competitor_channel' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.managed_channels 
                WHERE company_id = v_company_id 
                  AND (lower(trim(youtube_channel_id)) = lower(trim(p_target_value)) 
                       OR lower(trim(channel_name)) = lower(trim(p_target_name)))
            ) INTO v_exists;
            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Kênh này đã nằm trong danh mục quản lý của công ty');
            END IF;

        ELSIF p_proposal_type = 'niche' THEN
            SELECT EXISTS(
                SELECT 1 FROM public.niches 
                WHERE company_id = v_company_id AND lower(trim(name)) = lower(trim(p_target_value))
            ) INTO v_exists;
            IF v_exists THEN
                RETURN jsonb_build_object('success', false, 'error', 'Ngách này đã tồn tại trong danh mục công ty');
            END IF;
        END IF;

        INSERT INTO public.proposals (
            company_id, team_id, submitted_by, proposal_type, target_value, target_name, niche_id, reason, metadata, status
        ) VALUES (
            v_company_id, v_team_id, v_user_id, p_proposal_type, trim(p_target_value), trim(p_target_name), p_niche_id, trim(p_reason), p_metadata, 'pending'
        ) RETURNING id INTO v_new_id;

        RETURN jsonb_build_object('success', true, 'proposal_id', v_new_id, 'message', 'Đã gửi đề xuất thành công. Đang chờ xét duyệt.');
    END;
    $$;

    -- 6. CẤP QUYỀN TRUY CẬP (GRANTS)
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
    GRANT ALL ON public.licenses TO authenticated;
    GRANT ALL ON public.device_bindings TO authenticated;
    GRANT ALL ON public.hwid_reset_requests TO authenticated;
    GRANT ALL ON public.proposals TO authenticated;

    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.verify_or_bind_device TO anon, authenticated, service_role;

    -- Nạp lại schema cache của PostgREST
    NOTIFY pgrst, 'reload schema';
  `);

  console.log('Remediation script executed successfully!');
  await sql.end();
}

main().catch(console.error);
