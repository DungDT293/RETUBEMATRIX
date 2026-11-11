import postgres from 'postgres';

const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

async function main() {
  console.log('Seeding demo channels, revenue and devices...');
  const sql = postgres(DB_URL, { max: 1, ssl: 'require' });

  // 1. Get companies
  const [hqCompany] = await sql`SELECT id FROM public.companies WHERE code = 'RTM-HQ' LIMIT 1`;
  const [youweeCompany] = await sql`SELECT id FROM public.companies WHERE code = 'YOUWEE' LIMIT 1`;
  const [ownerProfile] =
    await sql`SELECT id FROM public.user_profiles WHERE role = 'owner' LIMIT 1`;
  const [staffProfile] =
    await sql`SELECT id FROM public.user_profiles WHERE email = 'staff@youwee.vn' LIMIT 1`;

  console.log('Found:', {
    hqCompany: !!hqCompany,
    youweeCompany: !!youweeCompany,
    ownerProfile: !!ownerProfile,
    staffProfile: !!staffProfile,
  });

  // 2. Insert managed channels
  const [channel1] = await sql`
    INSERT INTO public.managed_channels (company_id, youtube_channel_id, channel_name, channel_url, monetization_status)
    VALUES (${youweeCompany.id}, 'UC_TienDung_Official', 'Tiến Dũng Official (Reup Pro)', 'https://youtube.com/@tiendung', 'active')
    ON CONFLICT (company_id, youtube_channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name
    RETURNING id;
  `;

  const [channel2] = await sql`
    INSERT INTO public.managed_channels (company_id, youtube_channel_id, channel_name, channel_url, monetization_status)
    VALUES (${youweeCompany.id}, 'UC_Luminous_Music', 'Luminous Electronic Waves', 'https://youtube.com/@luminous', 'active')
    ON CONFLICT (company_id, youtube_channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name
    RETURNING id;
  `;

  const [channel3] = await sql`
    INSERT INTO public.managed_channels (company_id, youtube_channel_id, channel_name, channel_url, monetization_status)
    VALUES (${hqCompany.id}, 'UC_Matrix_Global', 'RETubeMatrix HQ Showcase', 'https://youtube.com/@matrix', 'active')
    ON CONFLICT (company_id, youtube_channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name
    RETURNING id;
  `;

  console.log('Channels created:', { channel1, channel2, channel3 });
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  await sql`
    INSERT INTO public.channel_revenue_daily (company_id, channel_id, report_date, views, watch_time_hours, subscribers_gained, estimated_revenue, estimated_revenue_vnd, rpm, cpm, monetization_status)
    VALUES 
      (${youweeCompany.id}, ${channel1.id}, ${today}, 45200, 312.5, 148, 86.40, 2190000, 1.91, 4.20, 'active'),
      (${youweeCompany.id}, ${channel2.id}, ${today}, 128900, 940.0, 520, 245.50, 6220000, 1.90, 3.85, 'active'),
      (${hqCompany.id}, ${channel3.id}, ${today}, 312000, 2150.0, 1140, 620.00, 15720000, 1.98, 4.50, 'active'),
      (${youweeCompany.id}, ${channel1.id}, ${yesterday}, 42100, 290.0, 130, 78.20, 1980000, 1.85, 4.10, 'active')
    ON CONFLICT (channel_id, report_date) DO UPDATE 
    SET views = EXCLUDED.views, estimated_revenue = EXCLUDED.estimated_revenue, estimated_revenue_vnd = EXCLUDED.estimated_revenue_vnd;
  `;

  // 4. Insert active device binding
  const [demoLicense] =
    await sql`SELECT id FROM public.licenses WHERE company_id = ${youweeCompany.id} LIMIT 1`;
  if (staffProfile && demoLicense) {
    await sql`
      INSERT INTO public.device_bindings (
        user_id, company_id, license_id, hwid_hash, cpu_id, motherboard_uuid, machine_guid, device_name, os_info, client_version, last_ip, last_heartbeat_at, is_active
      ) VALUES (
        ${staffProfile.id}, ${youweeCompany.id}, ${demoLicense.id}, 'a7b94c3d8e1f02549a3c7b2e1d0f8a9e', 'AMD Ryzen 9 5900X', 'MB-UUID-9912-AA', 'GUID-7712', 'DESKTOP-STAFF-YOUWEE', 'Windows 11 Pro 64-bit', '0.20.16', '113.161.44.82', now(), true
      ) ON CONFLICT DO NOTHING;
    `;

    // 5. Insert demo pending reset request
    await sql`
      INSERT INTO public.hwid_reset_requests (
        user_id, company_id, license_id, current_hwid_hash, new_hwid_hash, reason, status
      ) VALUES (
        ${staffProfile.id}, ${youweeCompany.id}, ${demoLicense.id}, 'a7b94c3d8e1f02549a3c7b2e1d0f8a9e', 'c4f2a1b9d8e70352a1b4c6e8f0a2d3e5', 'Nâng cấp CPU và cài lại Windows 11 mới, xin sếp duyệt đổi máy', 'pending'
      ) ON CONFLICT DO NOTHING;
    `;
  }

  console.log('Demo analytics, devices, and reset requests seeded!');
  await sql.end();
}

main().catch(console.error);
