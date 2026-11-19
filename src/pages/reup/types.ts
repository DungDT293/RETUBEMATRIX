import type {
  BktTestChannel,
  BktTestJob,
  MultiBrowserProfile,
  ReupPipelineResult,
} from '@/lib/types';

export type {
  BktTestChannelInput,
  DailyReportStats,
} from '@/lib/types';

import type { PreflightScanResult } from '@/utils/reup-auto-pilot';

export interface ReupProgressInfo {
  percent: number;
  speed?: string;
  fps?: number;
  eta_seconds?: number;
  status: string;
}

export interface StudioCopyrightStatus {
  status:
    | 'pending'
    | 'green_clean'
    | 'red_matched'
    | 'failed'
    | 'publishing'
    | 'published'
    | 'publish_failed';
  restriction?: string;
  checked_at?: string;
}

export interface UploadResult {
  success: boolean;
  video_url?: string;
  youtube_video_id?: string;
  error?: string;
}

export interface MainPublishResult {
  success: boolean;
  video_url?: string;
  youtube_video_id?: string;
  error?: string;
}

export type ReupTabKey = 'bkt_channels' | 'pipeline' | 'bkt_upload' | 'ai_optimization';

export interface BktChannelsManager {
  channels: BktTestChannel[];
  profiles: MultiBrowserProfile[];
  jobs: BktTestJob[];
  loading: boolean;
  totalSlots: number;
  totalUsed: number;
  totalRemaining: number;
  activeJobsCount: number;
  loadData: () => Promise<void>;
  handleResetQuota: () => Promise<void>;
  // Dialog state
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  editingChannel: BktTestChannel | null;
  formName: string;
  setFormName: (val: string) => void;
  formQuota: number;
  setFormQuota: (val: number) => void;
  formIsActive: boolean;
  setFormIsActive: (val: boolean) => void;
  formPriority: number;
  setFormPriority: (val: number) => void;
  formNote: string;
  setFormNote: (val: string) => void;
  saving: boolean;
  handleOpenAdd: () => void;
  handleOpenEdit: (ch: BktTestChannel) => void;
  handleSave: () => Promise<void>;
  handleDelete: (ch: BktTestChannel) => Promise<void>;
  handleToggleActive: (ch: BktTestChannel, nextActive: boolean) => Promise<void>;
  handleLaunchProfile: (profileId: string) => Promise<void>;
  // Job actions
  publishingJobId: string | null;
  handlePublishToMain: (jobId: string) => Promise<void>;
  handleRecheckJob: (jobId: string) => Promise<void>;
  cancellingJobId: string | null;
  cancellingAll: boolean;
  handleCancelJob: (jobId: string) => Promise<void>;
  handleCancelAllJobs: () => Promise<void>;
}

export interface ReupBktController {
  activeTab: ReupTabKey;
  setActiveTab: (tab: ReupTabKey) => void;

  // Pipeline
  inputVideoPath: string;
  setInputVideoPath: (path: string) => void;
  preflightScan: PreflightScanResult | null;
  isScanningPreflight: boolean;
  pipelineLevel: 'v1' | 'v2';
  setPipelineLevel: (level: 'v1' | 'v2') => void;
  isProcessing: boolean;
  pipelineResult: ReupPipelineResult | null;
  processError: string | null;
  reupProgress: ReupProgressInfo | null;
  activeBackgroundJob: BktTestJob | null;
  isLoginRequiredError: boolean;
  setIsLoginRequiredError: (val: boolean) => void;
  handleTriggerPreflightScan: (path: string) => Promise<PreflightScanResult | null>;
  handlePickInputVideo: () => Promise<void>;
  handleQuickDownloadUrl: (url: string) => Promise<void>;
  handleRunPipeline: () => Promise<void>;

  // BKT Upload
  profiles: MultiBrowserProfile[];
  bktChannels: BktTestChannel[];
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
  uploadVideoPath: string;
  setUploadVideoPath: (path: string) => void;
  uploadThumbnailPath: string;
  setUploadThumbnailPath: (path: string) => void;
  uploadTitle: string;
  setUploadTitle: (title: string) => void;
  uploadDescription: string;
  setUploadDescription: (desc: string) => void;
  uploadTags: string;
  setUploadTags: (tags: string) => void;
  isUploading: boolean;
  uploadResult: UploadResult | null;
  handlePickUploadVideo: () => Promise<void>;
  handleUploadBkt: () => Promise<void>;
  handleChangeBktProfileId: (id: string) => void;
  handleOpenProfileStudio: (profileId?: string) => Promise<void>;

  // Auto Publish Main
  autoPublishMain: boolean;
  handleToggleAutoPublish: (checked: boolean) => void;
  mainProfileId: string;
  handleChangeMainProfileId: (id: string) => void;
  mainVisibility: 'public' | 'schedule' | 'unlisted';
  handleChangeMainVisibility: (v: 'public' | 'schedule' | 'unlisted') => void;
  isPublishingMain: boolean;
  mainPublishProgress: string;
  mainPublishResult: MainPublishResult | null;
  isCatchingUp: boolean;
  handlePublishWaitingCleanVideos: () => Promise<void>;
  executePublishToMainChannel: (
    overrideVideoPath?: string,
    overrideTitle?: string,
    overrideDesc?: string,
    overrideThumb?: string,
    overrideTags?: string,
  ) => Promise<void>;

  // Auto Pilot
  isAutoPilotRunning: boolean;
  autoPilotStep: number;
  handleRunAutoPilot: () => Promise<void>;
  handleStopAutoPilot: () => Promise<void>;

  // Studio Monitor
  isCheckingStudio: boolean;
  studioStatus: StudioCopyrightStatus | null;
  autoPollSeconds: number | null;
  pollRetryCount: number;
  handleCheckStudioStatus: () => Promise<void>;
}
