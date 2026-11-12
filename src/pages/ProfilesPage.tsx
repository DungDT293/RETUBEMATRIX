import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Edit3,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Square,
  Tag,
  Trash2,
  UserCheck,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ArrangePreset, WindowArrangerModal } from '@/components/profiles/WindowArrangerModal';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QuickUploadDialog } from '@/components/upload/QuickUploadDialog';
import type {
  MultiBrowserProfile,
  MultiBrowserProfileInput,
  MultiBrowserProxyTestResult,
} from '@/lib/types';
import { maskProxy } from '@/lib/utils';
import { workTelemetryService } from '@/services/workTelemetryService';

const STATUS_CONFIG: Record<string, { label: string; pill: string; dot: string }> = {
  idle: { label: 'Sẵn sàng', pill: 'pill-neutral', dot: 'bg-muted-foreground' },
  ready: { label: 'Sẵn sàng', pill: 'pill-neutral', dot: 'bg-muted-foreground' },
  opening: { label: 'Đang mở', pill: 'pill-info', dot: 'bg-sky-500' },
  running: { label: 'Đang chạy', pill: 'pill-success', dot: 'bg-emerald-500' },
  success: { label: 'Hoàn thành', pill: 'pill-success', dot: 'bg-emerald-500' },
  error: { label: 'Lỗi', pill: 'pill-error', dot: 'bg-red-500' },
  stopped: { label: 'Đã dừng', pill: 'pill-neutral', dot: 'bg-muted-foreground' },
};

function YoutubeIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <title>YouTube</title>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const key = status || 'idle';
  const item = STATUS_CONFIG[key] ?? {
    label: key,
    pill: 'pill-neutral',
    dot: 'bg-muted-foreground',
  };
  const live = key === 'running' || key === 'opening';
  return (
    <span className={`pill ${item.pill} inline-flex items-center gap-1.5 px-2 py-0.5 text-xs`}>
      <span className={`h-1.5 w-1.5 rounded-full ${item.dot} ${live ? 'pulse-dot' : ''}`} />
      {item.label}
    </span>
  );
}

function formatTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function proxyRiskLabel(risk?: string) {
  if (!risk) return 'Chưa test';
  if (['good', 'low'].includes(risk)) return 'Thấp';
  if (['caution', 'medium'].includes(risk)) return 'Trung bình';
  if (['risky', 'high'].includes(risk)) return 'Cao';
  if (['avoid', 'critical'].includes(risk)) return 'Rất cao';
  return risk;
}

function proxyRiskBadgeClass(risk?: string) {
  if (!risk) return 'border-border bg-muted/30 text-muted-foreground';
  if (['good', 'low'].includes(risk))
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
  if (['caution', 'medium'].includes(risk))
    return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300';
  if (['risky', 'high'].includes(risk))
    return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
  return 'border-red-500/40 bg-red-500/10 text-red-300';
}

const PROFILE_OPTIONAL_COLUMNS = [
  { id: 'stt', label: 'STT' },
  { id: 'group', label: 'Nhóm' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'lastRun', label: 'Lần chạy gần nhất' },
  { id: 'country', label: 'Quốc gia' },
  { id: 'proxy', label: 'Proxy' },
  { id: 'proxyRisk', label: 'Rủi ro proxy' },
] as const;

type ProfileOptionalColumnId = (typeof PROFILE_OPTIONAL_COLUMNS)[number]['id'];
type ProfileColumnVisibility = Record<ProfileOptionalColumnId, boolean>;

const DEFAULT_PROFILE_COLUMN_VISIBILITY: ProfileColumnVisibility = {
  stt: true,
  group: true,
  status: true,
  lastRun: true,
  country: true,
  proxy: true,
  proxyRisk: true,
};

let cachedProfilesList: MultiBrowserProfile[] | null = null;

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<MultiBrowserProfile[]>(() => cachedProfilesList || []);
  const [loading, setLoading] = useState(() => !cachedProfilesList);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Column visibility
  const [columnVisibility, setColumnVisibility] = useState<ProfileColumnVisibility>(() => {
    try {
      const raw =
        localStorage.getItem('retubematrix.profile.columnVisibility') ||
        localStorage.getItem('youwee.profile.columnVisibility');
      if (raw) return { ...DEFAULT_PROFILE_COLUMN_VISIBILITY, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_PROFILE_COLUMN_VISIBILITY;
  });

  const toggleColumnVisible = (id: ProfileOptionalColumnId, visible: boolean) => {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: visible };
      localStorage.setItem('retubematrix.profile.columnVisibility', JSON.stringify(next));
      return next;
    });
  };

  // Mute audio toggle
  const [manualMuteAudio, setManualMuteAudio] = useState<boolean>(() => {
    return (
      (localStorage.getItem('retubematrix.profile.manualOpenMuteAudio') ??
        localStorage.getItem('youwee.profile.manualOpenMuteAudio')) === 'true'
    );
  });

  const handleToggleMute = (checked: boolean) => {
    setManualMuteAudio(checked);
    localStorage.setItem('retubematrix.profile.manualOpenMuteAudio', String(checked));
  };

  // Dialog State: Create / Edit
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<MultiBrowserProfile | null>(null);
  const [formName, setFormName] = useState('');
  const [formGroup, setFormGroup] = useState('Default');
  const [formProxy, setFormProxy] = useState('');
  const [formChannel, setFormChannel] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formColor, setFormColor] = useState('#E15B64');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Proxy test in dialog
  const [proxyTesting, setProxyTesting] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<MultiBrowserProxyTestResult | null>(null);

  // Row Proxy test
  const [rowProxyTestingId, setRowProxyTestingId] = useState<string | null>(null);
  const [rowProxyResults, setRowProxyResults] = useState<
    Record<string, MultiBrowserProxyTestResult>
  >({});

  // 1-Click Upload Dialog State
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTargetProfile, setUploadTargetProfile] = useState<MultiBrowserProfile | null>(null);

  // Window Arranger Dialog State
  const [showArrangeDialog, setShowArrangeDialog] = useState(false);
  const [arrangeLayout, setArrangeLayout] = useState('auto');
  const [arrangeWidth, setArrangeWidth] = useState('516');
  const [arrangeHeight, setArrangeHeight] = useState('600');
  const [arrangeScale, setArrangeScale] = useState('100');
  const [arrangeApplyVisible, setArrangeApplyVisible] = useState(true);
  const [arrangeOnOpen, setArrangeOnOpen] = useState(false);
  const [arrangeWorking, setArrangeWorking] = useState(false);
  const [arrangeResult, setArrangeResult] = useState('');

  // Group Modals
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAssignGroupModal, setShowAssignGroupModal] = useState(false);
  const [targetAssignGroup, setTargetAssignGroup] = useState('Default');

  // Bulk Proxy Modal
  const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
  const [bulkProxyText, setBulkProxyText] = useState('');
  const [bulkProxyWorking, setBulkProxyWorking] = useState(false);

  // Meta/Tag Modal
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaTarget, setMetaTarget] = useState<MultiBrowserProfile | null>(null);
  const [metaTags, setMetaTags] = useState('');
  const [metaNote, setMetaNote] = useState('');
  const [metaColor, setMetaColor] = useState('#E15B64');
  const [metaWorking, setMetaWorking] = useState(false);

  // Fetch profiles
  const fetchProfiles = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? cachedProfilesList !== null;
    try {
      if (!silent) setLoading(true);
      setError('');
      const data = await invoke<MultiBrowserProfile[]>('get_multibrowser_profiles');
      const list = data || [];
      cachedProfilesList = list;
      setProfiles(list);
    } catch (err) {
      console.error('Lỗi khi tải profiles:', err);
      setError(String(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Tự động đối soát trạng thái profile ngầm mỗi 4 giây khi có profile đang chạy/mở
  // Giúp UI tự nhảy về "Đã dừng" ngay khi tắt cửa sổ Chrome bên ngoài mà không cần bấm "Tải lại" thủ công
  useEffect(() => {
    const hasRunning = profiles.some(
      (p) => p.last_run_status === 'running' || p.last_run_status === 'opening',
    );
    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetchProfiles({ silent: true });
    }, 4000);

    return () => clearInterval(interval);
  }, [profiles, fetchProfiles]);

  // Extract distinct groups
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      if (p.group?.trim()) {
        set.add(p.group.trim());
      }
    }
    // Also include saved custom groups
    try {
      const raw =
        localStorage.getItem('retubematrix.profile.customGroups') ||
        localStorage.getItem('youwee.profile.customGroups');
      if (raw) {
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          for (const c of custom) set.add(c);
        }
      }
    } catch {}
    if (!set.has('Default')) set.add('Default');
    return Array.from(set).sort();
  }, [profiles]);

  // Filtered profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (selectedGroup !== 'all' && (p.group || 'Default') !== selectedGroup) {
        return false;
      }
      if (selectedStatus !== 'all') {
        const curStatus = p.last_run_status || 'idle';
        if (selectedStatus === 'running' && curStatus !== 'running' && curStatus !== 'opening') {
          return false;
        }
        if (selectedStatus === 'idle' && curStatus !== 'idle' && curStatus !== 'ready') {
          return false;
        }
        if (selectedStatus === 'stopped' && curStatus !== 'stopped') {
          return false;
        }
        if (selectedStatus === 'error' && curStatus !== 'error') {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          p.profile_name.toLowerCase().includes(q) ||
          p.youtube_preferred_channel?.toLowerCase().includes(q) ||
          p.proxy?.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.note?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [profiles, selectedGroup, selectedStatus, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProfiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProfiles.map((p) => p.id));
    }
  };

  const handleOpenCreate = () => {
    setEditingProfile(null);
    setFormName('');
    setFormGroup('Default');
    setFormProxy('');
    setFormChannel('');
    setFormNote('');
    setFormColor('#E15B64');
    setFormError('');
    setProxyTestResult(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (p: MultiBrowserProfile) => {
    setEditingProfile(p);
    setFormName(p.profile_name);
    setFormGroup(p.group || 'Default');
    setFormProxy(p.proxy || '');
    setFormChannel(p.youtube_preferred_channel || '');
    setFormNote(p.note || '');
    setFormColor(p.color || '#E15B64');
    setFormError('');
    setProxyTestResult(null);
    setIsDialogOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!formName.trim()) {
      setFormError('Vui lòng nhập tên hồ sơ');
      return;
    }

    try {
      setFormSaving(true);
      setFormError('');

      const payload: MultiBrowserProfileInput = {
        id: editingProfile ? editingProfile.id : undefined,
        profile_name: formName.trim(),
        group: formGroup.trim() || 'Default',
        proxy: formProxy.trim() || undefined,
        youtube_preferred_channel: formChannel.trim() || undefined,
        note: formNote.trim() || undefined,
        color: formColor,
      };

      await invoke('save_multibrowser_profile', {
        profile: payload,
        profile_input: payload,
        profileInput: payload,
      });

      // Telemetry: Đồng bộ kênh đích lên máy chủ
      if (payload.id) {
        workTelemetryService.syncManagedChannel({
          channel_type: 'target',
          channel_id: payload.id,
          channel_title: payload.youtube_preferred_channel || payload.profile_name,
          profile_id: payload.id,
          action: 'upsert',
        });
      }

      setIsDialogOpen(false);
      setMessage(editingProfile ? 'Đã cập nhật hồ sơ!' : 'Đã tạo hồ sơ mới thành công!');
      await fetchProfiles();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteProfile = async (p: MultiBrowserProfile) => {
    if (!window.confirm(`Bạn có chắc chắn muốn gỡ hồ sơ "${p.profile_name}"?`)) {
      return;
    }

    try {
      setActionLoadingId(p.id);
      await invoke('delete_multibrowser_profile', { profileId: p.id });

      // Telemetry: Đồng bộ xóa kênh đích 1-1
      workTelemetryService.syncManagedChannel({
        channel_type: 'target',
        channel_id: p.id,
        channel_title: p.profile_name,
        action: 'delete',
      });

      setMessage(`Đã gỡ hồ sơ "${p.profile_name}"`);
      await fetchProfiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLaunchProfile = async (p: MultiBrowserProfile) => {
    try {
      setActionLoadingId(p.id);
      setMessage(`Đang mở trình duyệt cho hồ sơ "${p.profile_name}"...`);
      await invoke('launch_multibrowser_profile', {
        profileId: p.id,
        profile_id: p.id,
        targetUrl: 'https://www.google.com/',
        target_url: 'https://www.google.com/',
      });
      setTimeout(() => {
        fetchProfiles();
      }, 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLaunchStudio = async (p: MultiBrowserProfile) => {
    try {
      setActionLoadingId(p.id);
      setMessage(`Đang mở YouTube Studio cho hồ sơ "${p.profile_name}"...`);
      await invoke('launch_multibrowser_profile', {
        profileId: p.id,
        profile_id: p.id,
        targetUrl: 'https://studio.youtube.com/',
        target_url: 'https://studio.youtube.com/',
      });
      setTimeout(() => {
        fetchProfiles();
      }, 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStopProfile = async (p: MultiBrowserProfile) => {
    try {
      setActionLoadingId(p.id);
      await invoke('stop_multibrowser_profile', { profileId: p.id });
      setMessage(`Đã dừng hồ sơ "${p.profile_name}"`);
      await fetchProfiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCleanCache = async (p: MultiBrowserProfile) => {
    if (
      !window.confirm(
        `Dọn dẹp cache của hồ sơ "${p.profile_name}"? Cookie và phiên đăng nhập sẽ được bảo toàn.`,
      )
    ) {
      return;
    }
    try {
      setActionLoadingId(p.id);
      const res = await invoke<string>('clean_multibrowser_profile_cache', { profileId: p.id });
      setMessage(res || 'Đã dọn dẹp cache.');
      await fetchProfiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTestRowProxy = async (p: MultiBrowserProfile) => {
    if (!p.proxy) return;
    try {
      setRowProxyTestingId(p.id);
      const res = await invoke<MultiBrowserProxyTestResult>('test_multibrowser_proxy', {
        proxy: p.proxy,
      });
      setRowProxyResults((prev) => ({ ...prev, [p.id]: res }));
    } catch (err) {
      setRowProxyResults((prev) => ({
        ...prev,
        [p.id]: { success: false, error: String(err) },
      }));
    } finally {
      setRowProxyTestingId(null);
    }
  };

  const handleTestDialogProxy = async () => {
    if (!formProxy.trim()) {
      setFormError('Chưa nhập proxy');
      return;
    }
    try {
      setProxyTesting(true);
      setFormError('');
      const res = await invoke<MultiBrowserProxyTestResult>('test_multibrowser_proxy', {
        proxy: formProxy.trim(),
      });
      setProxyTestResult(res);
    } catch (err) {
      setProxyTestResult({ success: false, error: String(err) });
    } finally {
      setProxyTesting(false);
    }
  };

  // Bulk Actions
  const handleBulkStop = async () => {
    if (selectedIds.length === 0) return;
    try {
      setLoading(true);
      await invoke('bulk_stop_multibrowser_profiles', { profileIds: selectedIds });
      setMessage(`Đã dừng ${selectedIds.length} hồ sơ đã chọn.`);
      await fetchProfiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} hồ sơ đã chọn?`)) {
      return;
    }
    try {
      setLoading(true);
      for (const id of selectedIds) {
        await invoke('delete_multibrowser_profile', { profileId: id });
      }
      setMessage(`Đã xóa ${selectedIds.length} hồ sơ.`);
      setSelectedIds([]);
      await fetchProfiles();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRun = async () => {
    if (selectedIds.length === 0) return;
    for (const id of selectedIds) {
      invoke('launch_multibrowser_profile', {
        profileId: id,
        profile_id: id,
        targetUrl: 'https://www.google.com/',
        target_url: 'https://www.google.com/',
      }).catch(() => {});
    }
    setMessage(`Đang mở ${selectedIds.length} hồ sơ...`);
    setTimeout(fetchProfiles, 1500);
  };

  // Presets for window arranger
  const applyPreset = (preset: ArrangePreset) => {
    setArrangeResult('');
    if (preset === 'auto') {
      setArrangeLayout('auto');
      setArrangeScale('100');
      return;
    }
    if (preset === 'twoCols') {
      setArrangeLayout('tile');
      setArrangeWidth('800');
      setArrangeHeight('900');
      setArrangeScale('100');
      return;
    }
    if (preset === 'threeCols') {
      setArrangeLayout('tile');
      setArrangeWidth('550');
      setArrangeHeight('850');
      setArrangeScale('100');
      return;
    }
    if (preset === 'fourWide') {
      setArrangeLayout('tile');
      setArrangeWidth('460');
      setArrangeHeight('760');
      setArrangeScale('100');
      return;
    }
    if (preset === 'small') {
      setArrangeLayout('tile');
      setArrangeWidth('516');
      setArrangeHeight('600');
      setArrangeScale('100');
      return;
    }
    if (preset === 'medium') {
      setArrangeLayout('tile');
      setArrangeWidth('800');
      setArrangeHeight('700');
      setArrangeScale('100');
      return;
    }
    if (preset === 'full') {
      setArrangeLayout('auto');
      setArrangeScale('100');
      setArrangeApplyVisible(true);
    }
  };

  // Import .bmprofile
  const handleImportProfile = async () => {
    try {
      const selected = await open({
        title: 'Chọn file .bmprofile để nhập',
        multiple: false,
        directory: false,
        filters: [{ name: 'Browser Profile', extensions: ['bmprofile', 'json'] }],
      });
      if (typeof selected === 'string') {
        setMessage(`Đã chọn file ${selected}. Tính năng nhập đang xử lý.`);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  // Copy public key
  const handleCopyPublicKey = () => {
    navigator.clipboard?.writeText('REUPYTB_BROWSER_ENGINE_LOCAL_KEY_1.0');
    setMessage('Đã sao chép Public key cục bộ vào clipboard.');
  };

  // Recovery modal prompt
  const handleOpenRecovery = () => {
    setMessage(
      'Hệ thống đang hoạt động với kho hồ sơ độc lập RETubeMatrix tại %LOCALAPPDATA%\\RETubeMatrix\\browser_engine.',
    );
  };

  return (
    <div className="h-full w-full min-w-0 overflow-auto p-6 space-y-4">
      {/* Top Header matching BrowserMulti */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-widest text-primary/80">
            PROFILES
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Hồ sơ trình duyệt</h1>
            <span className="pill pill-success text-[10px] px-1.5 py-0.5">Local</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quản lý profile, phiên mở, export/import và thao tác nhanh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="btn-primary flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm hồ sơ
          </button>
          <button
            type="button"
            onClick={handleOpenRecovery}
            className="btn-secondary px-3 py-2 text-xs"
          >
            Khôi phục hồ sơ
          </button>
          <button
            type="button"
            onClick={handleCopyPublicKey}
            className="btn-secondary px-3 py-2 text-xs"
          >
            Public key của tôi
          </button>
          <button
            type="button"
            onClick={handleImportProfile}
            className="btn-secondary px-3 py-2 text-xs"
          >
            Nhập .bmprofile
          </button>
          <button
            type="button"
            onClick={() => {
              fetchProfiles();
            }}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </div>

      {/* Messages / Alerts */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-emerald-400 flex items-center justify-between">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="max-w-xl relative flex items-center">
        <Search className="w-4 h-4 absolute left-3 text-muted-foreground pointer-events-none z-10" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm tên hồ sơ, proxy, ID..."
          className="w-full pl-9 pr-3 text-xs bg-background/50 border-input/80 h-9"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="input-field w-auto py-2 text-xs"
        >
          <option value="all">Tất cả nhóm</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="input-field w-auto py-2 text-xs"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="idle">Sẵn sàng</option>
          <option value="running">Đang chạy</option>
          <option value="stopped">Đã dừng</option>
          <option value="error">Lỗi</option>
        </select>

        <button
          type="button"
          onClick={() => setShowCreateGroupModal(true)}
          className="btn-secondary px-3 py-2 text-xs"
        >
          Tạo nhóm
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedIds.length === 0) {
              setError('Chọn hồ sơ trước khi gom nhóm');
              return;
            }
            setShowAssignGroupModal(true);
          }}
          disabled={selectedIds.length === 0}
          className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
        >
          Gom nhóm
        </button>

        <button
          type="button"
          onClick={() => setShowArrangeDialog(true)}
          className="btn-secondary px-3 py-2 text-xs"
        >
          Sắp xếp cửa sổ
        </button>

        {/* Column Visibility Dropdown */}
        <details className="relative">
          <summary className="btn-secondary cursor-pointer list-none px-3 py-2 text-xs flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Hiển thị cột
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-card p-3 shadow-xl space-y-2">
            <div className="text-[11px] text-muted-foreground pb-1 border-b border-border">
              Luôn hiện: Chọn, Tên, Thao tác
            </div>
            {PROFILE_OPTIONAL_COLUMNS.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center justify-between text-xs text-foreground hover:bg-muted/40 p-1.5 rounded-md"
              >
                <span>{col.label}</span>
                <input
                  type="checkbox"
                  checked={columnVisibility[col.id]}
                  onChange={(e) => toggleColumnVisible(col.id, e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
              </label>
            ))}
          </div>
        </details>

        {/* Mute toggle */}
        <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground ml-2">
          <input
            type="checkbox"
            checked={manualMuteAudio}
            onChange={(e) => handleToggleMute(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
          />
          <span>Tắt tiếng hồ sơ thủ công</span>
        </label>

        {/* Count Badge */}
        <div className="ml-auto text-xs text-muted-foreground font-mono">
          {filteredProfiles.length}/{profiles.length} hồ sơ
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-foreground">Đã chọn {selectedIds.length} hồ sơ</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkRun}
              className="btn-primary px-3 py-1.5 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" /> Chạy đã chọn
            </button>
            <button
              type="button"
              onClick={handleBulkStop}
              className="btn-secondary px-3 py-1.5 flex items-center gap-1.5"
            >
              <Square className="w-3 h-3" /> Dừng đã chọn
            </button>
            <button
              type="button"
              onClick={() => setShowAssignGroupModal(true)}
              className="btn-secondary px-3 py-1.5 flex items-center gap-1.5"
            >
              Gom nhóm
            </button>
            <button
              type="button"
              onClick={() => {
                const prefill = selectedIds
                  .map((id) => profiles.find((p) => p.id === id)?.proxy || '')
                  .join('\n');
                setBulkProxyText(prefill);
                setShowBulkProxyModal(true);
              }}
              className="btn-secondary px-3 py-1.5 flex items-center gap-1.5"
            >
              Gán proxy
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="btn-secondary text-destructive hover:bg-destructive/10 px-3 py-1.5 flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" /> Xóa đã chọn
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="surface-card overflow-hidden border border-border rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={
                      filteredProfiles.length > 0 && selectedIds.length === filteredProfiles.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                </th>
                {columnVisibility.stt && <th className="w-12 px-2 py-3 text-center">STT</th>}
                <th className="px-4 py-3 min-w-[240px]">TÊN HỒ SƠ</th>
                {columnVisibility.group && <th className="px-3 py-3 min-w-[100px]">NHÓM</th>}
                {columnVisibility.status && <th className="px-3 py-3 min-w-[110px]">TRẠNG THÁI</th>}
                {columnVisibility.lastRun && (
                  <th className="px-3 py-3 min-w-[140px]">LẦN CHẠY GẦN NHẤT</th>
                )}
                {columnVisibility.country && <th className="px-3 py-3 min-w-[90px]">QUỐC GIA</th>}
                {columnVisibility.proxy && <th className="px-3 py-3 min-w-[160px]">PROXY</th>}
                {columnVisibility.proxyRisk && (
                  <th className="px-3 py-3 min-w-[120px]">RỦI RO PROXY</th>
                )}
                <th className="px-4 py-3 text-right min-w-[200px]">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredProfiles.map((p, idx) => {
                const isSelected = selectedIds.includes(p.id);
                const isRunning = p.last_run_status === 'running';
                const rowTest = rowProxyResults[p.id];

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-muted/30 transition-colors ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                    </td>

                    {/* STT */}
                    {columnVisibility.stt && (
                      <td className="px-2 py-3 text-center text-muted-foreground font-mono">
                        {idx + 1}
                      </td>
                    )}

                    {/* Profile Name & Details */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || '#E15B64' }}
                        />
                        <span className="font-semibold text-foreground text-sm">
                          {p.profile_name}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                        Seed: {p.fingerprint_seed ?? p.id.slice(0, 8)} • ID: {p.id.slice(0, 8)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-sky-400 font-medium">
                        YouTube:{' '}
                        {p.youtube_preferred_channel
                          ? `@${p.youtube_preferred_channel.replace(/^@/, '')}`
                          : 'Chưa chọn kênh'}
                      </div>
                      {/* Fingerprint Tags */}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground">
                          {p.fingerprint_os || 'Windows 10'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground">
                          Theo proxy
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground">
                          Tự động
                        </span>
                      </div>
                      {p.note && (
                        <div className="mt-1 text-[11px] text-muted-foreground truncate max-w-xs italic">
                          "{p.note}"
                        </div>
                      )}
                      {p.last_run_error && (
                        <div className="mt-1 text-[11px] text-destructive truncate max-w-xs">
                          {p.last_run_error}
                        </div>
                      )}
                    </td>

                    {/* Group */}
                    {columnVisibility.group && (
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="pill pill-neutral px-2 py-0.5 text-[11px]">
                          {p.group || 'Default'}
                        </span>
                      </td>
                    )}

                    {/* Status */}
                    {columnVisibility.status && (
                      <td className="px-3 py-3">
                        <StatusBadge status={p.last_run_status} />
                      </td>
                    )}

                    {/* Last Run Time */}
                    {columnVisibility.lastRun && (
                      <td className="px-3 py-3 text-muted-foreground font-mono text-[11px]">
                        {formatTime(p.last_run_time)}
                      </td>
                    )}

                    {/* Country */}
                    {columnVisibility.country && (
                      <td className="px-3 py-3">
                        {rowTest?.country ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <span>🇻🇳</span>
                            <span>{rowTest.country}</span>
                          </span>
                        ) : p.proxy ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span>🌐</span>
                            <span>{p.proxy_country || 'Proxy'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <span>🇻🇳</span>
                            <span>Direct</span>
                          </span>
                        )}
                      </td>
                    )}

                    {/* Proxy */}
                    {columnVisibility.proxy && (
                      <td className="px-3 py-3">
                        {p.proxy ? (
                          <div>
                            <div className="font-mono text-[11px] text-foreground truncate max-w-[150px]">
                              {maskProxy(p.proxy)}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase">
                              {p.proxy_scheme || 'HTTP'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">-</span>
                        )}
                      </td>
                    )}

                    {/* Proxy Risk */}
                    {columnVisibility.proxyRisk && (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${proxyRiskBadgeClass(
                            p.proxy_risk,
                          )}`}
                        >
                          {p.proxy ? proxyRiskLabel(p.proxy_risk) : 'Trực tiếp'}
                        </span>
                      </td>
                    )}

                    {/* Action Buttons */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Play / Stop */}
                        {isRunning ? (
                          <button
                            type="button"
                            title="Dừng hồ sơ"
                            onClick={() => handleStopProfile(p)}
                            disabled={actionLoadingId === p.id}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Mở trình duyệt"
                            onClick={() => handleLaunchProfile(p)}
                            disabled={actionLoadingId === p.id}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}

                        {/* Open YouTube Studio */}
                        <button
                          type="button"
                          title="Mở YouTube Studio (đăng nhập hoặc quản lý kênh)"
                          onClick={() => handleLaunchStudio(p)}
                          disabled={actionLoadingId === p.id}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {/* YouTube Upload */}
                        <button
                          type="button"
                          title="Đăng video YouTube"
                          onClick={() => {
                            setUploadTargetProfile(p);
                            setUploadDialogOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        >
                          <YoutubeIcon className="w-3.5 h-3.5 text-red-500" />
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          title="Sửa hồ sơ"
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Test Proxy */}
                        {p.proxy && (
                          <button
                            type="button"
                            title="Kiểm tra proxy"
                            onClick={() => handleTestRowProxy(p)}
                            disabled={rowProxyTestingId === p.id}
                            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                          >
                            <Wifi
                              className={`w-3.5 h-3.5 ${
                                rowProxyTestingId === p.id ? 'animate-pulse text-primary' : ''
                              }`}
                            />
                          </button>
                        )}

                        {/* Clean Cache */}
                        <button
                          type="button"
                          title="Dọn dẹp cache"
                          onClick={() => handleCleanCache(p)}
                          disabled={actionLoadingId === p.id}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Meta / Tag */}
                        <button
                          type="button"
                          title="Ghi chú & Tag"
                          onClick={() => {
                            setMetaTarget(p);
                            setMetaTags((p.tags || []).join('\n'));
                            setMetaNote(p.note || '');
                            setMetaColor(p.color || '#E15B64');
                            setShowMetaModal(true);
                          }}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        >
                          <Tag className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          title="Xóa hồ sơ"
                          onClick={() => handleDeleteProfile(p)}
                          disabled={isRunning || actionLoadingId === p.id}
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProfiles.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                    <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <div className="font-medium text-sm text-foreground">Không có hồ sơ nào</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Bấm "+ Thêm hồ sơ" để tạo hồ sơ trình duyệt độc lập mới.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Window Arranger Modal */}
      {showArrangeDialog && (
        <WindowArrangerModal
          layout={arrangeLayout}
          setLayout={setArrangeLayout}
          width={arrangeWidth}
          setWidth={setArrangeWidth}
          height={arrangeHeight}
          setHeight={setArrangeHeight}
          scale={arrangeScale}
          setScale={setArrangeScale}
          applyVisible={arrangeApplyVisible}
          setApplyVisible={setArrangeApplyVisible}
          arrangeOnOpen={arrangeOnOpen}
          setArrangeOnOpen={setArrangeOnOpen}
          working={arrangeWorking}
          setWorking={setArrangeWorking}
          result={arrangeResult}
          setResult={setArrangeResult}
          onClose={() => setShowArrangeDialog(false)}
          setError={setError}
          setMessage={setMessage}
          applyPreset={applyPreset}
        />
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? 'Chỉnh sửa hồ sơ' : 'Tạo hồ sơ trình duyệt mới'}
            </DialogTitle>
            <DialogDescription>
              Hồ sơ lưu trữ riêng biệt trong kho dữ liệu cục bộ RETubeMatrix.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formError && (
              <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {formError}
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">Tên hồ sơ *</Label>
              <Input
                placeholder="VD: Channel 1 Main"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (formError) setFormError('');
                }}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Nhóm</Label>
                <Input
                  placeholder="Default"
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Màu nhận diện</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="h-8 w-10 p-0 rounded border cursor-pointer"
                  />
                  <span className="font-mono text-xs">{formColor}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Proxy (HTTP / SOCKS5)</Label>
                <button
                  type="button"
                  onClick={handleTestDialogProxy}
                  disabled={proxyTesting || !formProxy.trim()}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  {proxyTesting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wifi className="w-3 h-3" />
                  )}
                  Kiểm tra proxy
                </button>
              </div>
              <Input
                placeholder="IP:Port:User:Pass (Cloudmini) hoặc user:pass@ip:port"
                value={formProxy}
                onChange={(e) => setFormProxy(e.target.value)}
                className="mt-1 font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Hỗ trợ chuẩn Cloudmini:{' '}
                <span className="font-mono text-foreground font-medium">IP:Port:User:Pass</span>.
                Khuyên dùng Port HTTPS (ví dụ:{' '}
                <span className="font-mono text-foreground">20550</span>) cho Chromium.
              </p>
              {proxyTestResult && (
                <div
                  className={`mt-1.5 p-2 rounded text-xs ${
                    proxyTestResult.success
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-destructive/10 text-destructive border border-destructive/20'
                  }`}
                >
                  {proxyTestResult.success ? (
                    <div>
                      <div className="font-semibold">
                        Kết nối thành công! IP: {proxyTestResult.ip} (
                        {proxyTestResult.scheme?.toUpperCase() || 'HTTP'})
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        Độ trễ: {proxyTestResult.latency_ms}ms • Quốc gia:{' '}
                        {proxyTestResult.country || 'N/A'}
                        {proxyTestResult.city ? ` (${proxyTestResult.city})` : ''}
                      </div>
                    </div>
                  ) : (
                    <span>Thất bại: {proxyTestResult.error || 'Không thể kết nối proxy'}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold">Kênh YouTube ưu tiên</Label>
              <Input
                placeholder="VD: @tenkenh (để tự chọn kênh khi đăng video)"
                value={formChannel}
                onChange={(e) => setFormChannel(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Ghi chú</Label>
              <Textarea
                placeholder="Ghi chú nội bộ..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="mt-1 text-xs resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              disabled={formSaving}
            >
              Hủy
            </Button>
            <Button size="sm" onClick={handleSaveProfile} disabled={formSaving}>
              {formSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {editingProfile ? 'Lưu thay đổi' : 'Tạo hồ sơ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Modal */}
      <Dialog open={showCreateGroupModal} onOpenChange={setShowCreateGroupModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tạo nhóm mới</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs font-semibold">Tên nhóm</Label>
            <Input
              placeholder="VD: YouTube Shorts, Affiliate..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateGroupModal(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const name = newGroupName.trim();
                if (name) {
                  try {
                    const raw =
                      localStorage.getItem('retubematrix.profile.customGroups') ||
                      localStorage.getItem('youwee.profile.customGroups');
                    const arr = raw ? JSON.parse(raw) : [];
                    if (!arr.includes(name)) {
                      arr.push(name);
                      localStorage.setItem(
                        'retubematrix.profile.customGroups',
                        JSON.stringify(arr),
                      );
                    }
                  } catch {}
                  setMessage(`Đã tạo nhóm "${name}"`);
                  setShowCreateGroupModal(false);
                  setNewGroupName('');
                  fetchProfiles();
                }
              }}
            >
              Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Group Modal */}
      <Dialog open={showAssignGroupModal} onOpenChange={setShowAssignGroupModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gom nhóm {selectedIds.length} hồ sơ</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs font-semibold">Chọn nhóm đích</Label>
            <select
              value={targetAssignGroup}
              onChange={(e) => setTargetAssignGroup(e.target.value)}
              className="input-field w-full py-2 text-xs mt-1"
            >
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAssignGroupModal(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await invoke('bulk_set_multibrowser_group', {
                    profileIds: selectedIds,
                    group: targetAssignGroup,
                  });
                  setMessage(
                    `Đã chuyển ${selectedIds.length} hồ sơ sang nhóm "${targetAssignGroup}"`,
                  );
                  setShowAssignGroupModal(false);
                  await fetchProfiles();
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Proxy Modal */}
      <Dialog open={showBulkProxyModal} onOpenChange={setShowBulkProxyModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gán Proxy cho {selectedIds.length} hồ sơ</DialogTitle>
            <DialogDescription>
              Nhập mỗi dòng một proxy. Proxy sẽ được gán tuần tự theo thứ tự hồ sơ.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              rows={6}
              value={bulkProxyText}
              onChange={(e) => setBulkProxyText(e.target.value)}
              placeholder="ip:port&#10;user:pass@ip:port"
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkProxyModal(false)}
              disabled={bulkProxyWorking}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={bulkProxyWorking}
              onClick={async () => {
                setBulkProxyWorking(true);
                try {
                  const lines = bulkProxyText.split(/\r?\n/).map((l) => l.trim());
                  for (let i = 0; i < selectedIds.length; i++) {
                    const proxy = lines[i] !== undefined ? lines[i] : '';
                    const p = profiles.find((item) => item.id === selectedIds[i]);
                    if (p) {
                      await invoke('save_multibrowser_profile', {
                        profile: {
                          id: p.id,
                          profile_name: p.profile_name,
                          proxy: proxy || undefined,
                          group: p.group || 'Default',
                        },
                      });
                    }
                  }
                  setMessage(`Đã gán proxy cho ${selectedIds.length} hồ sơ.`);
                  setShowBulkProxyModal(false);
                  await fetchProfiles();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBulkProxyWorking(false);
                }
              }}
            >
              {bulkProxyWorking ? 'Đang lưu...' : 'Gán proxy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meta & Tag Modal */}
      <Dialog open={showMetaModal} onOpenChange={setShowMetaModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tag & Ghi chú: {metaTarget?.profile_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold">Màu hồ sơ</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={metaColor}
                  onChange={(e) => setMetaColor(e.target.value)}
                  className="h-8 w-10 p-0 rounded border cursor-pointer"
                />
                <span className="font-mono text-xs">{metaColor}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Tags (mỗi dòng một tag)</Label>
              <Textarea
                rows={3}
                value={metaTags}
                onChange={(e) => setMetaTags(e.target.value)}
                placeholder="tag1&#10;tag2"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Ghi chú</Label>
              <Textarea
                rows={2}
                value={metaNote}
                onChange={(e) => setMetaNote(e.target.value)}
                placeholder="Ghi chú hồ sơ..."
                className="mt-1 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMetaModal(false)}
              disabled={metaWorking}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={metaWorking}
              onClick={async () => {
                if (!metaTarget) return;
                setMetaWorking(true);
                try {
                  const tagsArr = metaTags
                    .split(/[\n,]+/)
                    .map((t) => t.trim())
                    .filter(Boolean);
                  await invoke('update_multibrowser_profile_meta', {
                    profileId: metaTarget.id,
                    note: metaNote,
                    tags: tagsArr,
                    color: metaColor,
                  });
                  setMessage(`Đã cập nhật tag cho hồ sơ ${metaTarget.profile_name}`);
                  setShowMetaModal(false);
                  await fetchProfiles();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setMetaWorking(false);
                }
              }}
            >
              {metaWorking ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1-Click Upload Dialog */}
      {uploadTargetProfile && (
        <QuickUploadDialog
          open={uploadDialogOpen}
          onOpenChange={(isOpen) => {
            setUploadDialogOpen(isOpen);
            if (!isOpen) setUploadTargetProfile(null);
          }}
          initialProfileId={uploadTargetProfile.id}
          onSuccess={() => {
            fetchProfiles();
          }}
        />
      )}
    </div>
  );
}
