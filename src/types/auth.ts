export type UserRole = 'owner' | 'admin' | 'leader' | 'user' | 'pending';

export type LicenseTier = 'trial' | 'pro' | 'enterprise';

export type LicenseStatus = 'active' | 'suspended' | 'expired' | 'revoked';

export type ProposalType = 'keyword' | 'competitor_channel' | 'niche';

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export type HwidResetStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface HwidInfo {
  machineGuid: string;
  processorId: string;
  motherboardUuid: string;
  motherboardSerial?: string | null;
  hwidHash: string;
  platform: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  ownerUserId: string;
  isActive: boolean;
  maskRevenueFromStaff: boolean;
  crossLeaderCollaboration: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  companyId: string;
  name: string;
  leaderId?: string | null;
  description?: string | null;
}

export interface UserProfile {
  id: string;
  companyId?: string | null;
  role: UserRole;
  teamId?: string | null;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  companies?: Company;
  teams?: Team;
}

export interface LicenseFeatures {
  unlimitedSeats?: boolean;
  maxBrowserProfiles: number;
  bktDailyQuota: number;
  allowCrossLeaderCollab: boolean;
}

export interface License {
  id: string;
  licenseKey: string;
  companyId: string;
  tier: LicenseTier;
  status: LicenseStatus;
  maxSeats: number;
  usedSeats: number;
  validFrom: string;
  expiresAt: string;
  features: LicenseFeatures;
}

export interface Proposal {
  id: string;
  companyId: string;
  teamId?: string | null;
  submittedBy: string;
  proposalType: ProposalType;
  targetValue: string;
  targetName?: string | null;
  nicheId?: string | null;
  metadata: Record<string, unknown>;
  reason: string;
  status: ProposalStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelRevenueDaily {
  id: string;
  companyId: string;
  channelId: string;
  channelName?: string;
  reportDate: string;
  views: number;
  watchTimeHours: number;
  subscribersGained: number;
  estimatedRevenueUsd: number;
  estimatedRevenueVnd: number;
  rpm: number;
  cpm: number;
  monetizationStatus: string;
}

export interface AuthState {
  user: UserProfile | null;
  company: Company | null;
  license: License | null;
  hwid: HwidInfo | null;
  accessToken: string | null;
  refreshToken?: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHwidMismatch: boolean;
  mismatchDetails: {
    currentDeviceName?: string;
    boundAt?: string;
    userId?: string;
    email?: string;
  } | null;
  sessionRevokedMessage?: string | null;
}
