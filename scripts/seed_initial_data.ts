import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://pgfvolnxtvnmvoxnwsza.supabase.co';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZnZvbG54dHZubXZveG53c3phIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDIwODQwNywiZXhwIjoyMTA5Nzg0NDA3fQ.fXQ2LjYma2vx7wZd96OeThtwfGl978FbspChSbTAaR0';
const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

async function seed() {
  console.log('Seeding initial SaaS data...');

  // 1. Create or get Master Owner User
  const ownerEmail = 'dungdong333@gmail.com';
  const ownerPass = 'Dung@0772512599';

  let ownerUserId: string;
  const { data: listData } = await supabase.auth.admin.listUsers();
  const existingOwner = listData.users.find((u) => u.email === ownerEmail);

  if (existingOwner) {
    ownerUserId = existingOwner.id;
    console.log('Found existing Owner User in auth.users:', ownerUserId);
  } else {
    const { data: newOwner, error: createOwnerErr } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPass,
      email_confirm: true,
      user_metadata: { role: 'owner', full_name: 'Tiến Dũng (Master Owner)' },
    });
    if (createOwnerErr) throw createOwnerErr;
    ownerUserId = newOwner.user.id;
    console.log('Created Master Owner User in auth.users:', ownerUserId);
  }

  // 2. Create Master HQ Company in DB
  const [hqCompany] = await sql`
    INSERT INTO public.companies (name, code, owner_user_id, is_active, mask_revenue_from_staff, cross_leader_collaboration)
    VALUES ('RETubeMatrix HQ', 'RTM-HQ', ${ownerUserId}, true, false, true)
    ON CONFLICT (code) DO UPDATE SET owner_user_id = ${ownerUserId}
    RETURNING id;
  `;
  console.log('HQ Company ID:', hqCompany.id);

  // 3. Create or update Owner Profile
  await sql`
    INSERT INTO public.user_profiles (id, company_id, role, full_name, email, is_active)
    VALUES (${ownerUserId}, ${hqCompany.id}, 'owner', 'Tiến Dũng (Master Owner)', ${ownerEmail}, true)
    ON CONFLICT (id) DO UPDATE SET role = 'owner', company_id = ${hqCompany.id};
  `;
  console.log('Owner Profile synced.');

  // 4. Issue Master Enterprise License
  const [masterLicense] = await sql`
    INSERT INTO public.licenses (license_key, company_id, tier, status, issued_by, max_seats, valid_from, expires_at, features)
    VALUES (
      'RTM-MASTER-ENTERPRISE-2026', 
      ${hqCompany.id}, 
      'enterprise', 
      'active', 
      ${ownerUserId}, 
      9999, 
      now(), 
      now() + INTERVAL '10 years',
      '{"unlimited_seats": true, "max_browser_profiles": 999, "bkt_daily_quota": 999, "allow_cross_leader_collab": true}'::jsonb
    )
    ON CONFLICT (license_key) DO UPDATE SET status = 'active'
    RETURNING id;
  `;
  console.log('Master License ID:', masterLicense.id);

  // 5. Seed Demo Tenant: "YouWee Media Corp" with Admin, Leader, and User
  console.log('\nSeeding Demo Company: YouWee Media Corp...');

  // Admin User
  let adminUserId: string;
  const adminEmail = 'admin@youwee.vn';
  const existingAdmin = listData.users.find((u) => u.email === adminEmail);
  if (existingAdmin) {
    adminUserId = existingAdmin.id;
  } else {
    const { data: newAdmin, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Nguyễn Văn Sếp (Admin)' },
    });
    if (error) throw error;
    adminUserId = newAdmin.user.id;
  }

  // Leader User
  let leaderUserId: string;
  const leaderEmail = 'leader@youwee.vn';
  const existingLeader = listData.users.find((u) => u.email === leaderEmail);
  if (existingLeader) {
    leaderUserId = existingLeader.id;
  } else {
    const { data: newLeader, error } = await supabase.auth.admin.createUser({
      email: leaderEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'leader', full_name: 'Trần Trưởng Nhóm (Leader)' },
    });
    if (error) throw error;
    leaderUserId = newLeader.user.id;
  }

  // User (Nhân viên)
  let staffUserId: string;
  const staffEmail = 'staff@youwee.vn';
  const existingStaff = listData.users.find((u) => u.email === staffEmail);
  if (existingStaff) {
    staffUserId = existingStaff.id;
  } else {
    const { data: newStaff, error } = await supabase.auth.admin.createUser({
      email: staffEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'user', full_name: 'Lê Nhân Viên (User)' },
    });
    if (error) throw error;
    staffUserId = newStaff.user.id;
  }

  // Insert Demo Company
  const [demoCompany] = await sql`
    INSERT INTO public.companies (name, code, owner_user_id, is_active, mask_revenue_from_staff, cross_leader_collaboration)
    VALUES ('YouWee Media Corp', 'YOUWEE', ${ownerUserId}, true, true, true)
    ON CONFLICT (code) DO UPDATE SET name = 'YouWee Media Corp'
    RETURNING id;
  `;

  // Demo Team
  const [demoTeam] = await sql`
    INSERT INTO public.teams (company_id, name, leader_id, description)
    VALUES (${demoCompany.id}, 'Team Alpha (Shorts & Drama)', ${leaderUserId}, 'Chuyên săn ngách triệu view US/UK')
    ON CONFLICT (company_id, name) DO UPDATE SET leader_id = ${leaderUserId}
    RETURNING id;
  `;

  // Sync Profiles
  await sql`
    INSERT INTO public.user_profiles (id, company_id, role, full_name, email, is_active)
    VALUES (${adminUserId}, ${demoCompany.id}, 'admin', 'Nguyễn Văn Sếp (Admin)', ${adminEmail}, true)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', company_id = ${demoCompany.id};
  `;

  await sql`
    INSERT INTO public.user_profiles (id, company_id, role, team_id, full_name, email, is_active)
    VALUES (${leaderUserId}, ${demoCompany.id}, 'leader', ${demoTeam.id}, 'Trần Trưởng Nhóm (Leader)', ${leaderEmail}, true)
    ON CONFLICT (id) DO UPDATE SET role = 'leader', team_id = ${demoTeam.id}, company_id = ${demoCompany.id};
  `;

  await sql`
    INSERT INTO public.user_profiles (id, company_id, role, team_id, full_name, email, commission_rate, is_active)
    VALUES (${staffUserId}, ${demoCompany.id}, 'user', ${demoTeam.id}, 'Lê Nhân Viên (User)', ${staffEmail}, 25.00, true)
    ON CONFLICT (id) DO UPDATE SET role = 'user', team_id = ${demoTeam.id}, company_id = ${demoCompany.id};
  `;

  // Demo License for YouWee Media
  await sql`
    INSERT INTO public.licenses (license_key, company_id, tier, status, issued_by, max_seats, valid_from, expires_at, features)
    VALUES (
      'RTM-YOUWEE-PRO-2026', 
      ${demoCompany.id}, 
      'pro', 
      'active', 
      ${ownerUserId}, 
      10, 
      now(), 
      now() + INTERVAL '1 year',
      '{"max_browser_profiles": 20, "bkt_daily_quota": 30, "allow_cross_leader_collab": true}'::jsonb
    )
    ON CONFLICT (license_key) DO UPDATE SET status = 'active';
  `;

  console.log('Demo Company and accounts seeded successfully!');
  console.log('\n--- TÀI KHOẢN MẪU ĐÃ KHỞI TẠO ---');
  console.log('1. OWNER (Chủ dự án):   dungdong333@gmail.com   / Dung@0772512599');
  console.log('2. ADMIN (Sếp công ty):  admin@youwee.vn         / Password123!');
  console.log('3. LEADER (Quản lý):    leader@youwee.vn        / Password123!');
  console.log('4. USER (Nhân viên):     staff@youwee.vn         / Password123!');
  console.log('--------------------------------');

  await sql.end();
}

seed().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
