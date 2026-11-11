import postgres from 'postgres';

const BASE_URL = 'https://retubematrix-gateway.dungdong333.workers.dev';
const SUPABASE_URL = 'https://pgfvolnxtvnmvoxnwsza.supabase.co';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZnZvbG54dHZubXZveG53c3phIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDIwODQwNywiZXhwIjoyMTA5Nzg0NDA3fQ.fXQ2LjYma2vx7wZd96OeThtwfGl978FbspChSbTAaR0';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZnZvbG54dHZubXZveG53c3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDg0MDcsImV4cCI6MjEwOTc4NDQwN30.fk-THKxFxXQgNVf_U62FkaiO3xc8TmIDLpyUyJVEKT4';
const DB_URL =
  'postgresql://postgres:Dung@0772512599@db.pgfvolnxtvnmvoxnwsza.supabase.co:5432/postgres?sslmode=require';

const HQ_COMPANY_ID = 'e51f4953-587e-4a5e-af09-e76471ca0326';
const MASTER_OWNER_ID = '2e57fca9-0e31-4d1c-b7bf-0eb837f47f44';

async function loginUser(email: string, password = 'Password123!') {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function createSupabaseUser(email: string, role: string, companyId: string | null = null) {
  // Create via admin API
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { full_name: `Test ${role}` },
    }),
  });
  const authUser: any = await res.json();
  if (!res.ok) throw new Error(`Create user error: ${JSON.stringify(authUser)}`);

  // Update profile
  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      id: authUser.id,
      email,
      full_name: `Test ${role}`,
      role,
      company_id: companyId,
      is_active: true,
    }),
  });

  return authUser.id as string;
}

async function deleteSupabaseUser(userId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

async function main() {
  console.log('=== STARTING COMPLETE RBAC 4-TIER MATRIX TEST ===\n');
  const timestamp = Date.now();
  const testFreeEmail = `free_${timestamp}@testmatrix.com`;
  const testAdminEmail = `admin_${timestamp}@testmatrix.com`;
  const testLeaderEmail = `leader_${timestamp}@testmatrix.com`;
  const testStaffEmail = `staff_${timestamp}@testmatrix.com`;

  let freeUserId = '';
  let adminUserId = '';
  let leaderUserId = '';
  let staffUserId = '';

  try {
    // -------------------------------------------------------------
    // TEST 1: FREE REGISTRATION (No company / license)
    // -------------------------------------------------------------
    console.log('1. Testing POST /v1/auth/register (Free Registration)...');
    const regRes = await fetch(`${BASE_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testFreeEmail,
        password: 'Password123!',
        full_name: 'Nguyen Van Free',
      }),
    });

    const regData: any = await regRes.json();
    console.log('   Status:', regRes.status);
    console.log('   Response Message:', regData.message);

    if (regRes.status !== 200 || !regData.success) {
      throw new Error(`Register failed: ${JSON.stringify(regData)}`);
    }

    if (
      regData.message !==
      'Đăng ký thành công! Tài khoản của bạn đang ở trạng thái chờ duyệt. Vui lòng liên hệ Master Owner để được cấp quyền và phân bổ vào công ty.'
    ) {
      throw new Error(`Unexpected message: ${regData.message}`);
    }

    if (
      regData.user.company_id !== null ||
      regData.user.is_active !== false ||
      regData.user.role !== 'user'
    ) {
      throw new Error(`Profile fields mismatch: ${JSON.stringify(regData.user)}`);
    }
    freeUserId = regData.user_id;
    console.log('   ✅ PASS: Free registration matches exact requirements!\n');

    // -------------------------------------------------------------
    // SETUP: Create Admin, Leader, Staff for testing
    // -------------------------------------------------------------
    console.log('Setting up Test Admin, Leader, and Staff accounts...');
    adminUserId = await createSupabaseUser(testAdminEmail, 'admin', HQ_COMPANY_ID);
    leaderUserId = await createSupabaseUser(testLeaderEmail, 'leader', HQ_COMPANY_ID);
    staffUserId = await createSupabaseUser(testStaffEmail, 'user', HQ_COMPANY_ID);

    const adminToken = await loginUser(testAdminEmail);
    const leaderToken = await loginUser(testLeaderEmail);
    console.log('   ✅ Accounts setup and tokens acquired.\n');

    // -------------------------------------------------------------
    // TEST 2: MASTER OWNER - ASSIGN COMPANY
    // -------------------------------------------------------------
    console.log('2. Testing POST /v1/admin/users/assign-company (Master Owner)...');
    const assignRes = await fetch(`${BASE_URL}/v1/admin/users/assign-company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`, // Master Owner bypass
      },
      body: JSON.stringify({
        user_id: freeUserId,
        company_id: HQ_COMPANY_ID,
        activate: true,
      }),
    });

    const assignData: any = await assignRes.json();
    console.log('   Status:', assignRes.status);
    console.log('   Result:', assignData.message);
    if (assignRes.status !== 200 || !assignData.success) {
      throw new Error(`Assign company failed: ${JSON.stringify(assignData)}`);
    }
    console.log('   ✅ PASS: Master Owner successfully assigned company.\n');

    // -------------------------------------------------------------
    // TEST 3: MASTER OWNER - UPDATE ROLE (Promote to any role)
    // -------------------------------------------------------------
    console.log('3. Testing POST /v1/admin/users/update-role (Master Owner)...');
    // 3a. Promote to Leader
    const roleRes1 = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        user_id: freeUserId,
        role: 'leader',
      }),
    });
    const roleData1: any = await roleRes1.json();
    if (roleRes1.status !== 200 || !roleData1.success) {
      throw new Error(`Role update to leader failed: ${JSON.stringify(roleData1)}`);
    }
    console.log('   Promoted freeUser to leader: OK');

    // 3b. Promote to Admin
    const roleRes2 = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        user_id: freeUserId,
        role: 'admin',
      }),
    });
    const roleData2: any = await roleRes2.json();
    if (roleRes2.status !== 200 || !roleData2.success) {
      throw new Error(`Role update to admin failed: ${JSON.stringify(roleData2)}`);
    }
    console.log('   Promoted freeUser to admin: OK');
    console.log('   ✅ PASS: Master Owner can update any role.\n');

    // -------------------------------------------------------------
    // TEST 4: ADMIN PERMISSIONS & BOUNDARIES
    // -------------------------------------------------------------
    console.log('4. Testing Admin Role Permissions & Boundaries...');
    // 4a. Admin attempts to assign company -> MUST FAIL (403)
    const adminAssignRes = await fetch(`${BASE_URL}/v1/admin/users/assign-company`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        company_id: HQ_COMPANY_ID,
      }),
    });
    console.log('   Admin assign company status:', adminAssignRes.status);
    if (adminAssignRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for Admin assign-company, got: ${adminAssignRes.status}`,
      );
    }
    console.log('   Admin assign company blocked: OK (403)');

    // 4b. Admin promotes User -> Leader in same company -> MUST SUCCEED (200)
    const adminPromoteRes = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        role: 'leader',
      }),
    });
    const adminPromoteData: any = await adminPromoteRes.json();
    console.log('   Admin promote User->Leader status:', adminPromoteRes.status);
    if (adminPromoteRes.status !== 200 || !adminPromoteData.success) {
      throw new Error(`Admin promote User->Leader failed: ${JSON.stringify(adminPromoteData)}`);
    }
    console.log('   Admin promote User->Leader: OK (200)');

    // 4c. Admin attempts to promote Leader -> Admin -> MUST FAIL (403)
    const adminToAdminRes = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        role: 'admin',
      }),
    });
    console.log('   Admin promote to Admin status:', adminToAdminRes.status);
    if (adminToAdminRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for Admin promoting to Admin, got: ${adminToAdminRes.status}`,
      );
    }
    console.log('   Admin promote to Admin blocked: OK (403)');

    // 4d. Admin demotes Leader -> User -> MUST SUCCEED (200)
    const adminDemoteRes = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        role: 'user',
      }),
    });
    if (adminDemoteRes.status !== 200) {
      throw new Error(`Admin demote Leader->User failed: ${adminDemoteRes.status}`);
    }
    console.log('   Admin demote Leader->User: OK (200)');
    console.log('   ✅ PASS: Admin RBAC boundaries strictly enforced.\n');

    // -------------------------------------------------------------
    // TEST 5: LEADER PERMISSIONS & BOUNDARIES
    // -------------------------------------------------------------
    console.log('5. Testing Leader Role Permissions & Boundaries...');
    // 5a. Leader attempts to update role -> MUST FAIL (403)
    const leaderRoleRes = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        role: 'leader',
      }),
    });
    console.log('   Leader update role status:', leaderRoleRes.status);
    if (leaderRoleRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for Leader update-role, got: ${leaderRoleRes.status}`,
      );
    }
    console.log('   Leader update role blocked: OK (403)');

    // 5b. Leader updates info of User in same company -> MUST SUCCEED (200)
    const leaderInfoRes = await fetch(`${BASE_URL}/v1/admin/users/update-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leaderToken}`,
      },
      body: JSON.stringify({
        user_id: staffUserId,
        full_name: 'Staff Renamed by Leader',
        commission_rate: 25,
      }),
    });
    const leaderInfoData: any = await leaderInfoRes.json();
    console.log('   Leader update info status:', leaderInfoRes.status);
    if (leaderInfoRes.status !== 200 || !leaderInfoData.success) {
      throw new Error(`Leader update info failed: ${JSON.stringify(leaderInfoData)}`);
    }
    console.log('   Leader update info of user: OK (200)');

    // 5c. Leader attempts to delete an Admin -> MUST FAIL (403)
    const leaderDelAdminRes = await fetch(`${BASE_URL}/v1/admin/users/${adminUserId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leaderToken}`,
      },
    });
    console.log('   Leader delete Admin status:', leaderDelAdminRes.status);
    if (leaderDelAdminRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for Leader deleting Admin, got: ${leaderDelAdminRes.status}`,
      );
    }
    console.log('   Leader delete Admin blocked: OK (403)');

    // 5d. Leader deletes a User in same company -> MUST SUCCEED (200)
    const leaderDelUserRes = await fetch(`${BASE_URL}/v1/admin/users/${staffUserId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${leaderToken}`,
      },
    });
    const leaderDelUserData: any = await leaderDelUserRes.json();
    console.log('   Leader delete User status:', leaderDelUserRes.status);
    if (leaderDelUserRes.status !== 200 || !leaderDelUserData.success) {
      throw new Error(`Leader delete User failed: ${JSON.stringify(leaderDelUserData)}`);
    }
    console.log('   Leader delete User: OK (200)');
    console.log('   ✅ PASS: Leader RBAC boundaries strictly enforced.\n');

    // -------------------------------------------------------------
    // TEST 6: MASTER OWNER PROTECTION (ANTI-REGRESSION)
    // -------------------------------------------------------------
    console.log('6. Testing Master Owner Protection...');
    // 6a. Attempt to delete Master Owner -> MUST FAIL (403)
    const delOwnerRes = await fetch(`${BASE_URL}/v1/admin/users/${MASTER_OWNER_ID}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    console.log('   Delete Master Owner status:', delOwnerRes.status);
    if (delOwnerRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for deleting Master Owner, got: ${delOwnerRes.status}`,
      );
    }
    console.log('   Delete Master Owner blocked: OK (403)');

    // 6b. Attempt to demote Master Owner -> MUST FAIL (403)
    const demoteOwnerRes = await fetch(`${BASE_URL}/v1/admin/users/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        user_id: MASTER_OWNER_ID,
        role: 'user',
      }),
    });
    console.log('   Demote Master Owner status:', demoteOwnerRes.status);
    if (demoteOwnerRes.status !== 403) {
      throw new Error(
        `Expected 403 Forbidden for demoting Master Owner, got: ${demoteOwnerRes.status}`,
      );
    }
    console.log('   Demote Master Owner blocked: OK (403)');
    console.log('   ✅ PASS: Master Owner is completely unmodifiable and protected!\n');

    console.log('========================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY WITH ZERO REGRESSIONS!');
    console.log('========================================================');
  } finally {
    // Cleanup remaining created test users
    console.log('Cleaning up remaining test users from database...');
    if (freeUserId) await deleteSupabaseUser(freeUserId).catch(() => {});
    if (adminUserId) await deleteSupabaseUser(adminUserId).catch(() => {});
    if (leaderUserId) await deleteSupabaseUser(leaderUserId).catch(() => {});
    console.log('Cleanup completed.');
  }
}

main().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
