import { invoke } from '@tauri-apps/api/core';

export type ArrangePreset =
  | 'auto'
  | 'twoCols'
  | 'threeCols'
  | 'fourWide'
  | 'small'
  | 'medium'
  | 'full';

interface WindowArrangerModalProps {
  layout: string;
  setLayout: (value: string) => void;
  width: string;
  setWidth: (value: string) => void;
  height: string;
  setHeight: (value: string) => void;
  scale: string;
  setScale: (value: string) => void;
  applyVisible: boolean;
  setApplyVisible: (value: boolean) => void;
  arrangeOnOpen: boolean;
  setArrangeOnOpen: (value: boolean) => void;
  working: boolean;
  setWorking: (value: boolean) => void;
  result: string;
  setResult: (value: string) => void;
  onClose: () => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  applyPreset: (preset: ArrangePreset) => void;
}

function parseArrangeNumber(value: string, fallback: number, min: number, max?: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  const upperBounded = typeof max === 'number' ? Math.min(max, parsed) : parsed;
  return Math.max(min, upperBounded);
}

export function WindowArrangerModal({
  layout,
  setLayout,
  width,
  setWidth,
  height,
  setHeight,
  scale,
  setScale,
  applyVisible,
  setApplyVisible,
  arrangeOnOpen,
  setArrangeOnOpen,
  working,
  setWorking,
  result,
  setResult,
  onClose,
  setError,
  setMessage,
  applyPreset,
}: WindowArrangerModalProps) {
  async function arrangeNow() {
    setWorking(true);
    try {
      const response = await invoke<{
        ok?: boolean;
        arranged_count?: number;
        arranged?: unknown[];
        found_count?: number;
        total?: number;
        skipped?: Array<{ reason?: string }>;
        message?: string;
        error?: string;
      }>('arrange_multibrowser_windows', {
        params: {
          mode: layout === 'auto' ? 'auto_fit' : 'user_defined',
          layout,
          columns: layout === 'auto' ? undefined : 0,
          gap: 8,
          preset: layout,
          window_width: parseArrangeNumber(width, 516, 300),
          window_height: parseArrangeNumber(height, 600, 300),
          scale_percent: parseArrangeNumber(scale, 100, 50, 200),
          apply_to_visible_area: applyVisible,
          arrange_on_open: arrangeOnOpen,
        },
      });

      if (response && response.ok !== false) {
        const arranged = response.arranged_count ?? response.arranged?.length ?? 0;
        const found = response.found_count ?? response.total ?? arranged;
        const skipped = response.skipped?.length ?? Math.max(0, found - arranged);
        const skippedReasons = (response.skipped || [])
          .map((item) => item.reason)
          .filter(Boolean)
          .join(' ');
        const text =
          response.message ||
          `Tìm thấy ${found} cửa sổ, đã xếp ${arranged}${skipped ? `, bỏ qua ${skipped}` : ''}.`;
        setResult(skippedReasons ? `${text} ${skippedReasons}` : text);
        setMessage(text);
        onClose();
      } else {
        setError(response?.error || 'Không sắp xếp được cửa sổ');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="surface-card card-enter max-h-[90vh] w-full max-w-md overflow-auto p-5 border border-border">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Window Arranger
            </div>
            <h2 className="mt-1 text-lg font-bold text-foreground">Sắp xếp cửa sổ</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cấu hình cách sắp xếp các cửa sổ trình duyệt đang mở.
            </p>
          </div>
          <button
            type="button"
            title="Đóng dialog"
            onClick={onClose}
            className="btn-ghost px-2.5 py-1 text-xs"
          >
            Đóng
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="arrange-layout-select"
              className="block text-xs font-medium text-foreground mb-1.5"
              title="Auto-fit tự tính kích thước theo màn hình; Tile dùng kích thước bạn nhập; Cascade xếp tầng."
            >
              Chế độ sắp xếp
            </label>
            <select
              id="arrange-layout-select"
              title="Chọn cách sắp xếp các cửa sổ đang mở"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="input-field w-full py-2 text-sm"
            >
              <option value="auto">Tự động lấp đầy màn hình (Auto-fit)</option>
              <option value="tile">Xếp lưới (Tile)</option>
              <option value="cascade">Xếp tầng (Cascade)</option>
            </select>
          </div>

          <div>
            <div
              className="block text-xs font-medium text-foreground mb-1.5"
              title="Preset chọn nhanh thông số sắp xếp."
            >
              Preset nhanh
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => applyPreset('auto')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                Tự động phù hợp
              </button>
              <button
                type="button"
                onClick={() => applyPreset('twoCols')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                2 cột
              </button>
              <button
                type="button"
                onClick={() => applyPreset('threeCols')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                3 cột
              </button>
              <button
                type="button"
                onClick={() => applyPreset('fourWide')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                4 cửa sổ ngang
              </button>
              <button
                type="button"
                onClick={() => applyPreset('small')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                Small 516x600
              </button>
              <button
                type="button"
                onClick={() => applyPreset('medium')}
                className="btn-secondary px-2 py-1.5 text-xs text-center"
              >
                Medium 800x700
              </button>
              <button
                type="button"
                onClick={() => applyPreset('full')}
                className="btn-secondary col-span-2 px-2 py-1.5 text-xs text-center"
              >
                Full visible area
              </button>
            </div>
          </div>

          {layout === 'auto' ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Chế độ Auto-fit tự tính số cột, hàng và kích thước cửa sổ dựa trên số trình duyệt đang
              mở và độ phân giải màn hình.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="arrange-width-input"
                    className="block text-xs font-medium text-foreground mb-1"
                  >
                    Chiều rộng (px)
                  </label>
                  <input
                    id="arrange-width-input"
                    inputMode="numeric"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="input-field w-full py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="arrange-height-input"
                    className="block text-xs font-medium text-foreground mb-1"
                  >
                    Chiều cao (px)
                  </label>
                  <input
                    id="arrange-height-input"
                    inputMode="numeric"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="input-field w-full py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="arrange-scale-input"
                  className="block text-xs font-medium text-foreground mb-1"
                >
                  Scale (%)
                </label>
                <input
                  id="arrange-scale-input"
                  inputMode="numeric"
                  value={scale}
                  onChange={(e) => setScale(e.target.value)}
                  className="input-field w-full py-1.5 text-xs"
                />
              </div>
            </>
          )}

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyVisible}
                onChange={(e) => setApplyVisible(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span className="text-xs text-foreground">
                Áp dụng cho vùng hiển thị (tránh taskbar)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={arrangeOnOpen}
                onChange={(e) => {
                  setArrangeOnOpen(e.target.checked);
                  localStorage.setItem('bm.window.arrangeOnOpen', String(e.target.checked));
                }}
                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span className="text-xs text-foreground">Tự động sắp xếp khi mở hồ sơ</span>
            </label>
          </div>

          {result && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {result}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 py-2 text-xs font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={working}
              onClick={arrangeNow}
              className="btn-primary flex-1 py-2 text-xs font-medium"
            >
              {working ? 'Đang sắp xếp...' : 'Sắp xếp ngay'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
