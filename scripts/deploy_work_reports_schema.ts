import postgres from 'postgres';

const DB_URL =
  'postgres://postgres.pgfvolnxtvnmvoxnwsza:Dung%400772512599@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require';

async function main() {
  console.log('--- TRIEN KHAI SCHEMA BAO CAO CONG VIEC & KENH DOI THU ---');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  try {
    const migrationSql = `
-- ============================================================================
-- 1. BANG KENH QUAN LY CUA NHAN SU (Target & Test Channels)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_managed_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('target', 'test')),
    channel_name TEXT NOT NULL,
    youtube_channel_id TEXT NOT NULL,
    channel_url TEXT,
    profile_id TEXT,
    videos_uploaded_today INT NOT NULL DEFAULT 0,
    videos_uploaded_week INT NOT NULL DEFAULT 0,
    videos_uploaded_month INT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    estimated_revenue NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id, youtube_channel_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_user_managed_user ON public.user_managed_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_managed_team ON public.user_managed_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_user_managed_type ON public.user_managed_channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_user_managed_company ON public.user_managed_channels(company_id);

-- ============================================================================
-- 2. BANG KENH DOI THU NHAN SU DANG CAO & THEO DOI
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_competitor_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    channel_name TEXT NOT NULL,
    channel_url TEXT NOT NULL,
    youtube_channel_id TEXT,
    primary_keyword TEXT DEFAULT '',
    subscriber_count INT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    total_videos INT NOT NULL DEFAULT 0,
    recent_5_videos JSONB NOT NULL DEFAULT '[]'::jsonb,
    videos_tested_green INT NOT NULL DEFAULT 0,
    videos_tested_red INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id, channel_url)
);

CREATE INDEX IF NOT EXISTS idx_user_comp_user ON public.user_competitor_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_comp_team ON public.user_competitor_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_user_comp_active ON public.user_competitor_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_user_comp_company ON public.user_competitor_channels(company_id);

-- ============================================================================
-- 3. BANG BAO CAO HIEU SUAT TONG HOP THEO NGAY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_work_reports_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    target_channels_count INT NOT NULL DEFAULT 0,
    test_channels_count INT NOT NULL DEFAULT 0,
    competitor_channels_count INT NOT NULL DEFAULT 0,
    videos_uploaded_today INT NOT NULL DEFAULT 0,
    videos_tested_green INT NOT NULL DEFAULT 0,
    videos_tested_red INT NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    estimated_revenue NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    estimated_revenue_vnd NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    quality_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_work_report_date ON public.user_work_reports_daily(report_date);
CREATE INDEX IF NOT EXISTS idx_work_report_team ON public.user_work_reports_daily(team_id);
CREATE INDEX IF NOT EXISTS idx_work_report_company ON public.user_work_reports_daily(company_id);
CREATE INDEX IF NOT EXISTS idx_work_report_user ON public.user_work_reports_daily(user_id);

-- ============================================================================
-- 4. CAP QUYEN CHO SERVICE ROLE & AUTHENTICATED
-- ============================================================================
GRANT ALL ON TABLE public.user_managed_channels TO authenticated, service_role, anon;
GRANT ALL ON TABLE public.user_competitor_channels TO authenticated, service_role, anon;
GRANT ALL ON TABLE public.user_work_reports_daily TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
    `;

    console.log('Dang chay cau lenh SQL migration...');
    await sql.unsafe(migrationSql);
    console.log('DA TRIEN KHAI THANH CONG 3 BANG MOI TREN SUPABASE!');
  } catch (err) {
    console.error('Loi trien khai schema:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
