import { FlaskConical, Sparkles, Tv, Wand2 } from 'lucide-react';
import { AiTitleThumbnailTab } from '@/components/bkt/AiTitleThumbnailTab';
import type { Page } from '@/components/layout';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  BktChannelsTab,
  BktUploadSection,
  ReupAutoPilotBanner,
  ReupPipelineSection,
  useReupBktController,
} from './reup';

export function ReupBktPage({ onNavigate }: { onNavigate?: (page: Page) => void } = {}) {
  const toast = useToast();
  const controller = useReupBktController(onNavigate);
  const {
    activeTab,
    setActiveTab,
    uploadTitle,
    setUploadTitle,
    inputVideoPath,
    uploadThumbnailPath,
    setUploadThumbnailPath,
    uploadTags,
    setUploadTags,
    setUploadDescription,
  } = controller;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/40 backdrop-blur-md flex-shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FlaskConical className="w-4 h-4 text-amber-500" />
            </div>
            <h1 className="text-lg font-bold text-foreground">
              Reup Pipeline &amp; Test Bản Quyền
            </h1>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs py-0"
            >
              Chuyên biệt Reup
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quản lý kênh test bản quyền độc lập, xử lý lách bản quyền video chuyên sâu &amp; tự động
            kiểm tra trên YouTube Studio
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemePicker />
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ================= 100% ZERO-TOUCH AUTO-PILOT BANNER ================= */}
        <ReupAutoPilotBanner controller={controller} />

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as 'bkt_channels' | 'pipeline' | 'bkt_upload' | 'ai_optimization')
          }
          className="w-full space-y-5"
        >
          <TabsList className="grid grid-cols-4 max-w-2xl bg-muted/60 p-1 border border-border/40">
            <TabsTrigger value="bkt_channels" className="flex items-center gap-1.5 text-xs py-2">
              <Tv className="w-4 h-4 text-emerald-500" />
              <span className="font-medium">1. Kênh Test Bản Quyền</span>
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-1.5 text-xs py-2">
              <Wand2 className="w-4 h-4 text-rose-500" />
              <span className="font-medium">2. Xử Lý Reup</span>
            </TabsTrigger>
            <TabsTrigger value="bkt_upload" className="flex items-center gap-1.5 text-xs py-2">
              <FlaskConical className="w-4 h-4 text-amber-500" />
              <span className="font-medium">3. Đăng Test Bản Quyền</span>
            </TabsTrigger>
            <TabsTrigger value="ai_optimization" className="flex items-center gap-1.5 text-xs py-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="font-medium">4. AI Tiêu Đề &amp; Thumb</span>
            </TabsTrigger>
          </TabsList>

          {/* ================= TAB 1: QUẢN LÝ KÊNH TEST BẢN QUYỀN ================= */}
          <TabsContent value="bkt_channels" className="space-y-5">
            <BktChannelsTab />
          </TabsContent>

          {/* ================= TAB 2: REUP PIPELINE ================= */}
          <TabsContent value="pipeline" className="space-y-5">
            <ReupPipelineSection controller={controller} />
          </TabsContent>

          {/* ================= TAB 3: ĐĂNG TEST BẢN QUYỀN ================= */}
          <TabsContent value="bkt_upload" className="space-y-5">
            <BktUploadSection controller={controller} />
          </TabsContent>

          {/* ================= TAB 4: AI TỐI ƯU TIÊU ĐỀ & THUMBNAIL ================= */}
          <TabsContent value="ai_optimization" className="space-y-5">
            <AiTitleThumbnailTab
              activeVideoTitle={
                uploadTitle ||
                (inputVideoPath
                  ? inputVideoPath
                      .split(/[\\/]/)
                      .pop()
                      ?.replace(/\.[^/.]+$/, '')
                  : '')
              }
              activeThumbnailPath={uploadThumbnailPath}
              activeVideoUrl={
                inputVideoPath &&
                (inputVideoPath.startsWith('http://') || inputVideoPath.startsWith('https://'))
                  ? inputVideoPath
                  : undefined
              }
              activeTags={
                uploadTags
                  ? uploadTags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                  : undefined
              }
              onApplyTitle={(title) => {
                setUploadTitle(title);
                toast.success({
                  title: 'Đã cập nhật tiêu đề',
                  description: 'Tiêu đề đã được đồng bộ sang BKT Upload & Auto-Publish.',
                });
              }}
              onApplyThumbnail={(thumbPath) => {
                setUploadThumbnailPath(thumbPath);
                toast.success({
                  title: 'Đã cập nhật thumbnail',
                  description: 'Ảnh bìa đã được gắn vào quy trình BKT Upload & Auto-Publish.',
                });
              }}
              onApplyTags={(tagsArr) => {
                const tagsStr = tagsArr.join(', ');
                setUploadTags(tagsStr);
                try {
                  sessionStorage.setItem('reup_input_video_tags', tagsStr);
                } catch {}
                toast.success({
                  title: 'Đã cập nhật Thẻ Tags',
                  description: `Đã đồng bộ ${tagsArr.length} thẻ tags sang form BKT & Kênh Chính.`,
                });
              }}
              onApplyDescription={(desc) => {
                setUploadDescription(desc);
                toast.success({
                  title: 'Đã cập nhật Mô tả',
                  description: 'Mô tả tối ưu đã được đồng bộ sang form BKT & Kênh Chính.',
                });
              }}
              onNavigateToBkt={() => {
                setActiveTab('bkt_upload');
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
