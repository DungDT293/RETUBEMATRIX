import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  BktBatchDispatchRequest,
  BktDispatchResult,
  BktTestChannel,
  BktTestChannelInput,
  BktTestJob,
  ChannelStats,
  ChannelVideo,
  DailyReportStats,
  DownloadProgress,
  FollowedChannel,
  MultiBrowserProfile,
  PlaylistVideoEntry,
  YoutubeChannelContentType,
} from '@/lib/types';

type ChannelInfo = {
  name: string;
  avatar_url: string | null;
};

export type ChannelNewVideosEvent = {
  channel_id: string;
  channel_name: string;
  new_count: number;
  total_new: number;
};

export type ChannelAutoDownloadEvent = {
  channel_id: string;
  channel_name: string;
  quality: string;
  format: string;
  video_codec: string;
  preferred_fps: string;
  audio_bitrate: string;
  download_threads: number;
};

export async function pickChannelsOutputFolder(defaultPath?: string): Promise<string | null> {
  const folder = await open({
    directory: true,
    multiple: false,
    title: 'Select Download Folder',
    defaultPath,
  });
  return typeof folder === 'string' ? folder : null;
}

export async function getFollowedChannels(): Promise<FollowedChannel[]> {
  return invoke<FollowedChannel[]>('get_followed_channels');
}

export async function getNewVideosCount(channelId: string): Promise<number> {
  return invoke<number>('get_new_videos_count', { channelId });
}

export async function followChannelCommand(input: {
  url: string;
  name: string;
  thumbnail: string | null;
  platform: string;
  downloadQuality: string;
  downloadFormat: string;
  downloadVideoCodec: string;
  downloadPreferredFps: string;
  downloadAudioBitrate: string;
  youtubeContentType: YoutubeChannelContentType;
}): Promise<string> {
  return invoke<string>('follow_channel', input);
}

export async function unfollowChannelCommand(id: string): Promise<void> {
  await invoke('unfollow_channel', { id });
}

export async function rebuildTrayMenu(): Promise<void> {
  await invoke('rebuild_tray_menu_cmd');
}

export async function updateChannelSettingsCommand(input: {
  id: string;
  checkInterval: number;
  autoDownload: boolean;
  downloadQuality: string;
  downloadFormat: string;
  downloadVideoCodec: string;
  downloadPreferredFps: string;
  downloadAudioBitrate: string;
  filterMinDuration: number | null;
  filterMaxDuration: number | null;
  filterIncludeKeywords: string | null;
  filterExcludeKeywords: string | null;
  filterMaxVideos: number | null;
  downloadThreads: number;
  youtubeContentType: YoutubeChannelContentType;
  reupModEnabled?: boolean;
  reupModSpeed?: number;
  reupModPitch?: number;
  reupModFlip?: boolean;
  reupModCrop?: number;
  customFilenameTemplate?: string | null;
}): Promise<void> {
  await invoke('update_channel_settings', {
    id: input.id,
    checkInterval: input.checkInterval,
    check_interval: input.checkInterval,
    autoDownload: input.autoDownload,
    auto_download: input.autoDownload,
    downloadQuality: input.downloadQuality,
    download_quality: input.downloadQuality,
    downloadFormat: input.downloadFormat,
    download_format: input.downloadFormat,
    downloadVideoCodec: input.downloadVideoCodec,
    download_video_codec: input.downloadVideoCodec,
    downloadPreferredFps: input.downloadPreferredFps,
    download_preferred_fps: input.downloadPreferredFps,
    downloadAudioBitrate: input.downloadAudioBitrate,
    download_audio_bitrate: input.downloadAudioBitrate,
    filterMinDuration: input.filterMinDuration,
    filter_min_duration: input.filterMinDuration,
    filterMaxDuration: input.filterMaxDuration,
    filter_max_duration: input.filterMaxDuration,
    filterIncludeKeywords: input.filterIncludeKeywords,
    filter_include_keywords: input.filterIncludeKeywords,
    filterExcludeKeywords: input.filterExcludeKeywords,
    filter_exclude_keywords: input.filterExcludeKeywords,
    filterMaxVideos: input.filterMaxVideos,
    filter_max_videos: input.filterMaxVideos,
    downloadThreads: input.downloadThreads,
    download_threads: input.downloadThreads,
    youtubeContentType: input.youtubeContentType,
    youtube_content_type: input.youtubeContentType,
    reupModEnabled: input.reupModEnabled ?? false,
    reup_mod_enabled: input.reupModEnabled ?? false,
    reupModSpeed: input.reupModSpeed ?? 1.03,
    reup_mod_speed: input.reupModSpeed ?? 1.03,
    reupModPitch: input.reupModPitch ?? 1.02,
    reup_mod_pitch: input.reupModPitch ?? 1.02,
    reupModFlip: input.reupModFlip ?? false,
    reup_mod_flip: input.reupModFlip ?? false,
    reupModCrop: input.reupModCrop ?? 0.015,
    reup_mod_crop: input.reupModCrop ?? 0.015,
    customFilenameTemplate: input.customFilenameTemplate ?? null,
    custom_filename_template: input.customFilenameTemplate ?? null,
  });
}

export async function saveChannelVideos(channelId: string, videos: ChannelVideo[]): Promise<void> {
  await invoke('save_channel_videos', { channelId, videos });
}

export async function updateChannelLastChecked(id: string, lastVideoId: string): Promise<void> {
  await invoke('update_channel_last_checked', { id, lastVideoId });
}

export async function getChannelVideos(input: {
  url: string;
  limit: number | null;
  start: number;
  requestId: number;
  cookieMode?: string;
  cookieBrowser?: string | null;
  cookieBrowserProfile?: string | null;
  cookieFilePath?: string | null;
  proxyUrl?: string | null;
  youtubeContentType?: YoutubeChannelContentType;
}): Promise<PlaylistVideoEntry[]> {
  return invoke<PlaylistVideoEntry[]>('get_channel_videos', input);
}

export async function getChannelInfo(input: {
  url: string;
  cookieMode?: string;
  cookieBrowser?: string | null;
  cookieBrowserProfile?: string | null;
  cookieFilePath?: string | null;
  proxyUrl?: string | null;
  youtubeContentType?: YoutubeChannelContentType;
}): Promise<ChannelInfo> {
  return invoke<ChannelInfo>('get_channel_info', input);
}

export async function stopChannelFetchCommand(): Promise<void> {
  await invoke('stop_channel_fetch');
}

export async function getSavedChannelVideos(input: {
  channelId: string;
  status: ChannelVideo['status'] | null;
  limit: number;
}): Promise<ChannelVideo[]> {
  return invoke<ChannelVideo[]>('get_saved_channel_videos', input);
}

export async function getSavedChannelVideosByVideoIds(input: {
  channelId: string;
  videoIds: string[];
}): Promise<ChannelVideo[]> {
  return invoke<ChannelVideo[]>('get_saved_channel_videos_by_video_ids', input);
}

export async function downloadVideoCommand(input: Record<string, unknown>): Promise<void> {
  await invoke('download_video', input);
}

export async function stopDownloadCommand(): Promise<void> {
  await invoke('stop_download');
}

export async function updateChannelVideoStatusByVideoId(input: {
  channelUrl: string;
  videoId: string;
  status: string;
}): Promise<void> {
  await invoke('update_channel_video_status_by_video_id', input);
}

export async function updateChannelInfoCommand(input: {
  id: string;
  name: string;
  thumbnail: string | null;
}): Promise<void> {
  await invoke('update_channel_info', input);
}

export async function updateChannelVideoStatus(input: {
  id: string;
  status: string;
}): Promise<void> {
  await invoke('update_channel_video_status', input);
}

export function onDownloadProgress(
  handler: (event: { payload: DownloadProgress }) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>('download-progress', handler);
}

export function onChannelNewVideos(
  handler: (event: { payload: ChannelNewVideosEvent }) => void,
): Promise<UnlistenFn> {
  return listen<ChannelNewVideosEvent>('channel-new-videos', handler);
}

export function onChannelFetchProgress<T>(
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return listen<T>('channel-fetch-progress', handler);
}

export function onTrayOpenChannel(
  handler: (event: { payload: string }) => void,
): Promise<UnlistenFn> {
  return listen<string>('tray-open-channel', handler);
}

export function onChannelAutoDownload(
  handler: (event: { payload: ChannelAutoDownloadEvent }) => void,
): Promise<UnlistenFn> {
  return listen<ChannelAutoDownloadEvent>('channel-auto-download', handler);
}

export async function getChannelStats(channelId: string): Promise<ChannelStats | null> {
  try {
    return await invoke<ChannelStats>('get_channel_stats', { channelId });
  } catch {
    return null;
  }
}

export async function getAllChannelStats(): Promise<ChannelStats[]> {
  try {
    return await invoke<ChannelStats[]>('get_all_channel_stats');
  } catch {
    return [];
  }
}

export async function checkChannelNow(channelId: string): Promise<number> {
  return await invoke<number>('check_channel_now', { channelId });
}

export async function toggleChannelAutoDownload(
  channelId: string,
  enabled: boolean,
): Promise<void> {
  await invoke('toggle_channel_auto_download', { channelId, enabled });
}

export async function updateChannelBktConfig(input: {
  channelId: string;
  bktTestMode: boolean | number;
  bktProfileId: string | null;
}): Promise<void> {
  await invoke('update_channel_bkt_config', {
    channelId: input.channelId,
    channel_id: input.channelId,
    bktTestMode: Boolean(input.bktTestMode),
    bkt_test_mode: Boolean(input.bktTestMode),
    bktProfileId: input.bktProfileId,
    bkt_profile_id: input.bktProfileId,
  });
}

export async function triggerBktTestVideo(input: {
  channelVideoId: string;
  channelId?: string | null;
  bktProfileId?: string | null;
}): Promise<void> {
  await invoke('trigger_bkt_test_video', {
    channelVideoId: input.channelVideoId,
    channelId: input.channelId ?? null,
    bktProfileId: input.bktProfileId ?? null,
  });
}

export async function triggerBktTestVideosBatch(
  items: Array<{
    channelVideoId: string;
    channelId?: string | null;
    bktProfileId?: string | null;
  }>,
): Promise<number> {
  return await invoke<number>('trigger_bkt_test_videos_batch', {
    items: items.map((i) => ({
      channel_video_id: i.channelVideoId,
      channel_id: i.channelId ?? null,
      bkt_profile_id: i.bktProfileId ?? null,
    })),
  });
}

export async function checkBktCopyrightStatus(input: {
  channelVideoId?: string | null;
  profileId?: string | null;
}): Promise<{
  success: boolean;
  checked_count?: number;
  results?: Record<
    string,
    { bkt_check_status: string; bkt_restriction: string; monetization?: string | null }
  >;
  status?: 'pending' | 'green_clean' | 'red_matched';
  restriction?: string;
  error?: string | null;
}> {
  return await invoke('check_bkt_copyright_status_cmd', {
    channelVideoId: input.channelVideoId ?? null,
    profileId: input.profileId ?? null,
  });
}

export async function getMultibrowserProfiles(): Promise<MultiBrowserProfile[]> {
  return await invoke<MultiBrowserProfile[]>('get_multibrowser_profiles');
}

export async function getBktTestChannels(): Promise<BktTestChannel[]> {
  return await invoke<BktTestChannel[]>('get_bkt_test_channels');
}

export async function saveBktTestChannel(input: BktTestChannelInput): Promise<BktTestChannel> {
  return await invoke<BktTestChannel>('save_bkt_test_channel', { input });
}

export async function deleteBktTestChannel(channelId: string): Promise<void> {
  await invoke('delete_bkt_test_channel', { channelId });
}

export async function getBktTestJobs(limit?: number): Promise<BktTestJob[]> {
  return await invoke<BktTestJob[]>('get_bkt_test_jobs', { limit: limit ?? null });
}

export async function dispatchBatchBktTest(
  payload: BktBatchDispatchRequest,
): Promise<BktDispatchResult> {
  return await invoke<BktDispatchResult>('dispatch_batch_bkt_test', { payload });
}

export async function getChannelVideoFilepath(videoId: string): Promise<string | null> {
  return await invoke<string | null>('get_channel_video_filepath', { videoId });
}

export async function publishBktJobToMain(jobId: string): Promise<string> {
  return await invoke<string>('publish_bkt_job_to_main_cmd', { jobId });
}

export async function recheckBktJob(jobId: string): Promise<void> {
  return await invoke<void>('recheck_bkt_job_cmd', { jobId });
}

export async function getDailyReportStats(date?: string): Promise<DailyReportStats> {
  return await invoke<DailyReportStats>('get_daily_report_stats', {
    date: date ?? null,
    dateFilter: date ?? null,
  });
}

export async function waitBktJobCompletion(
  jobId: string,
  timeoutSecs?: number,
): Promise<BktTestJob> {
  return await invoke<BktTestJob>('wait_bkt_job_completion', {
    jobId,
    timeoutSecs: timeoutSecs ?? 1800,
  });
}
