import { invoke } from '@tauri-apps/api/core';

export interface OutlierHunterSettings {
  id: string;
  enabled: boolean;
  niches: string; // JSON array of string niches
  min_views: number;
  max_subscribers: number;
  min_sub_outlier: number;
  min_baseline_outlier: number;
  min_duration: number;
  min_vph: number;
  min_engagement_rate: number;
  min_comments: number;
  auto_download: boolean;
  auto_reup_level: 'v1' | 'v2';
  auto_bkt_test: boolean;
  scan_interval_minutes: number;
  updated_at: string;
}

export interface OutlierVideo {
  id: string;
  niche: string;
  title: string;
  thumbnail_url: string;
  channel_id: string;
  channel_name: string;
  subscribers: number;
  views: number;
  likes: number;
  comments: number;
  duration: number;
  upload_timestamp: number;
  hours_published: number;
  avg_vph: number;
  current_vph?: number | null;
  momentum_score: number;
  sub_outlier_ratio: number;
  baseline_median_views: number;
  baseline_outlier_ratio: number;
  engagement_rate: number;
  view_history: string; // JSON Array of [{ts, views, vph}]
  status: 'discovered' | 'watchlist' | 'downloading' | 'reup_ready' | 'bkt_passed' | 'ignored';
  local_filepath?: string | null;
  reup_filepath?: string | null;
  bkt_status: string;
  opportunity_score?: number | null;
  demand_signal?: string | null;
  hook_analysis?: string | null;
  competitorTags?: string[] | null;
  created_at: string;
  last_ping_at: string;
  tags?: string | null;
  categories?: string | null;
}

export interface KeywordGoldmine {
  keyword: string;
  rank: number;
  word_count: number;
  opportunity_score: number;
  competition?: string;
  content_gap?: string;
  badge: 'NGÁCH VÀNG' | 'TIỀM NĂNG' | 'PHỔ THÔNG' | 'GEM' | 'HOT' | 'GOOD';
}

export interface CompetitorVideo {
  id: string;
  title: string;
  thumbnail_url: string;
  url: string;
  views: number;
  duration: number;
  hours_published: number;
  vph: number;
  keyword_score: number;
  uploader: string;
}

export interface HookAnatomyResult {
  success: boolean;
  has_transcript: boolean;
  hook_30s: string;
  full_transcript_preview: string;
  total_words?: number;
  key_points?: { timestamp: string; text: string }[];
  error?: string;
}

export async function getOutlierSettings(): Promise<OutlierHunterSettings> {
  return await invoke<OutlierHunterSettings>('get_outlier_settings_cmd');
}

export async function updateOutlierSettings(settings: OutlierHunterSettings): Promise<void> {
  await invoke('update_outlier_settings_cmd', { settings });
}

export async function getOutlierVideos(
  status?: string | null,
  niche?: string | null,
  limit?: number | null,
): Promise<OutlierVideo[]> {
  return await invoke<OutlierVideo[]>('get_outlier_videos_cmd', {
    status: status || null,
    niche: niche || null,
    limit: limit || null,
  });
}

export async function updateOutlierVideoStatus(input: {
  id: string;
  status: string;
  localFilepath?: string | null;
  reupFilepath?: string | null;
  bktStatus?: string | null;
}): Promise<void> {
  await invoke('update_outlier_video_status_cmd', {
    id: input.id,
    status: input.status,
    localFilepath: input.localFilepath || null,
    reupFilepath: input.reupFilepath || null,
    bktStatus: input.bktStatus || null,
  });
}

export async function deleteOutlierVideo(id: string): Promise<void> {
  await invoke('delete_outlier_video_cmd', { id });
}

export async function clearAllOutlierVideos(): Promise<void> {
  await invoke('clear_all_outliers_cmd');
}

export async function analyzeCompetitorChannel(
  channelUrl: string,
  sortBy: 'popular' | 'latest' = 'popular',
): Promise<CompetitorVideo[]> {
  const res = await invoke<{ success: boolean; error?: string; videos: CompetitorVideo[] }>(
    'analyze_competitor_channel_cmd',
    { channelUrl, sortBy },
  );
  if (res && res.success === false && res.error) {
    throw new Error(res.error);
  }
  return res?.videos || [];
}

export interface LiveTrendingTopic {
  title: string;
  traffic: string;
  pub_date: string;
  geo: string;
  description: string;
}

export async function triggerOutlierScan(
  niche?: string | null,
  timeRange?: string | null,
  geo?: string | null,
): Promise<OutlierVideo[]> {
  return await invoke<OutlierVideo[]>('trigger_outlier_scan_cmd', {
    niche: niche || null,
    timeRange: timeRange || null,
    time_range: timeRange || null,
    geo: geo || null,
  });
}

export async function fetchLiveTrendingTopics(
  geo: string = 'VN',
  limit: number = 20,
): Promise<LiveTrendingTopic[]> {
  const res = await invoke<{ success: boolean; topics: LiveTrendingTopic[] }>(
    'fetch_live_trending_topics_cmd',
    { geo, limit },
  );
  return res?.topics || [];
}

export async function triggerOutlierPing(): Promise<OutlierVideo[]> {
  return await invoke<OutlierVideo[]>('trigger_outlier_ping_cmd');
}

export async function findKeywordGoldmines(seedKeyword: string): Promise<KeywordGoldmine[]> {
  const res = await invoke<{ success: boolean; keywords: KeywordGoldmine[] }>(
    'find_keyword_goldmines_cmd',
    { seedKeyword },
  );
  return res?.keywords || [];
}

export async function analyzeVideoHook(videoId: string): Promise<HookAnatomyResult> {
  return await invoke<HookAnatomyResult>('analyze_video_hook_cmd', { videoId });
}

export interface TitleVariantItem {
  formula: string;
  title: string;
  estimatedCtr: string;
  psychologicalTrigger: string;
}

export interface AiTitleVariants {
  originalTitle: string;
  variants: TitleVariantItem[];
  source: string;
}

export interface SmartDescriptionResult {
  tier1HookSeo: string;
  tier2SummaryChapters: string;
  tier3CtaCredits: string;
  tier4Hashtags: string[];
  fullDescription: string;
  source: string;
}

export interface HookScriptItem {
  hookType: string;
  durationSeconds: number;
  script: string;
  visualAction: string;
  retentionStrategy: string;
}

export interface HookAnalysisResult {
  title: string;
  hookDiagnosis: string;
  predictedRetentionRisk: string;
  targetAvdGoal: string;
  remakeHooks: HookScriptItem[];
  source: string;
}

export async function rewriteViralTitles(
  originalTitle: string,
  niche?: string | null,
  competitorKeywords?: string[] | null,
  slmMode?: boolean | null,
): Promise<AiTitleVariants> {
  return await invoke<AiTitleVariants>('ai_rewrite_viral_titles_cmd', {
    originalTitle,
    niche: niche || null,
    competitorKeywords: competitorKeywords || null,
    slmMode: slmMode ?? false,
    slm_mode: slmMode ?? false,
  });
}

export async function generateSmartDescription(
  title: string,
  niche?: string | null,
  competitorTags?: string[] | null,
  competitorChannel?: string | null,
  slmMode?: boolean | null,
): Promise<SmartDescriptionResult> {
  return await invoke<SmartDescriptionResult>('ai_generate_smart_description_cmd', {
    title,
    niche: niche || null,
    competitorTags: competitorTags || null,
    competitorChannel: competitorChannel || null,
    slmMode: slmMode ?? false,
    slm_mode: slmMode ?? false,
  });
}

export async function analyzeHookDeep(
  title: string,
  transcriptPreview?: string | null,
  niche?: string | null,
): Promise<HookAnalysisResult> {
  return await invoke<HookAnalysisResult>('ai_analyze_hook_deep_cmd', {
    title,
    transcriptPreview: transcriptPreview || null,
    niche: niche || null,
  });
}

export interface VideoSeoTagsResult {
  success: boolean;
  id?: string;
  title?: string;
  tags: string[];
  categories?: string[];
  description?: string;
  thumbnail?: string;
  thumbnail_url?: string;
  channelFollowerCount?: number | null;
  channel_follower_count?: number | null;
  channel?: string;
  viewCount?: number | null;
  view_count?: number | null;
}

export async function extractVideoSeoTags(videoUrl: string): Promise<VideoSeoTagsResult> {
  return await invoke<VideoSeoTagsResult>('extract_video_seo_tags_cmd', {
    videoUrl,
    video_url: videoUrl,
  });
}
