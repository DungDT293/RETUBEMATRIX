/**
 * Tiện ích Tự Động Hóa Reup & BKT (Auto-Pilot Utilities)
 * Hỗ trợ: Thuật toán 95% Core - 5% Hook theo ranh giới từ (Word-Boundary),
 * Tính điểm CTR động, Lắp ghép Mô tả đa tầng, và Quản lý file ảnh bìa đi kèm.
 */

// Ngân hàng Hook phân loại theo nhóm tâm lý kích thích click YouTube
export const HOOK_BANK: Record<
  'curiosity' | 'secret' | 'urgency' | 'value' | 'cta',
  { templates: string[]; label: string; tag: string }
> = {
  curiosity: {
    label: 'Tò mò cao độ (Curiosity Hook)',
    tag: 'Tò mò',
    templates: [
      '| Bất ngờ ở phút cuối!',
      '— Liệu bạn có nhận ra?',
      '| Cái kết không ai ngờ tới',
      '— Sự thật khiến ai cũng giật mình',
      '| Xem xong không thốt nên lời 😱',
    ],
  },
  secret: {
    label: 'Tiết lộ bí mật (Insight Hook)',
    tag: 'Bí mật',
    templates: [
      '— Sự thật chưa ai kể',
      '| Bí mật người trong nghề mới biết',
      '— Điều mà bạn chưa từng được nghe',
      '| Lộ diện toàn bộ sự thật ngầm',
      '— Tiết lộ bất ngờ từ chuyên gia',
    ],
  },
  urgency: {
    label: 'Thúc giục / Cảnh báo (Urgency Hook)',
    tag: 'Cảnh báo',
    templates: [
      '(Xem ngay kẻo lỡ!)',
      '| Đừng bỏ qua nếu bạn chưa biết!',
      '⚠️ Cảnh báo quan trọng cần xem ngay',
      '— Hãy lưu lại trước khi bị xóa',
      '| Xem trước khi quá muộn!',
    ],
  },
  value: {
    label: 'Giá trị cao (Value Hook)',
    tag: 'Giá trị',
    templates: [
      '| Đơn giản đến không ngờ 🔥',
      '— Hướng dẫn chi tiết từ A đến Z',
      '| Cách làm hiệu quả gấp 10 lần',
      '— Bí quyết chuẩn chỉnh nhất 2026',
      '| Áp dụng ngay cực kỳ dễ dàng',
    ],
  },
  cta: {
    label: 'Kêu gọi tương tác (Call to Action)',
    tag: 'Kêu gọi',
    templates: [
      '👉 Bạn nhất định phải thử!',
      '| Bạn nghĩ sao về điều này?',
      '— Xem ngay và cho ý kiến nhé!',
      '👉 Thử ngay hôm nay!',
      '| Để lại bình luận của bạn!',
    ],
  },
};

/**
 * Bóc tách 90% - 95% cốt lõi của tiêu đề gốc theo ranh giới từ vựng (Word-Boundary),
 * loại bỏ hoàn toàn hook cũ, tên kênh đối thủ ở đuôi và dấu câu treo.
 */
export function extractCoreTitle(raw: string): string {
  if (!raw?.trim()) return '';

  // 1. Loại bỏ các đuôi hook, tên kênh đối thủ, hashtag cũ ở cuối
  const clean = raw
    .trim()
    .replace(/\s*([|\-—–~•:/]|\[[^\]]*\]|\([^)]*\)|#[^\s]+)\s*$/g, '')
    .trim();

  // 2. Tách từ theo khoảng trắng
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return raw.trim();

  // 3. Giữ 90 - 95% số từ, bảo toàn trọn vẹn từ ghép tiếng Việt (không cắt cụt âm tiết)
  let coreCount = words.length;
  if (words.length >= 8) {
    coreCount = Math.max(2, Math.floor(words.length * 0.9));
  } else if (words.length >= 4) {
    coreCount = words.length - 1;
  }

  const core = words.slice(0, coreCount).join(' ');

  // 4. Xóa sạch dấu câu treo ở cuối (phẩy, chấm, gạch, hai chấm)
  return core.replace(/[,;:.!?|\-—–~•]+$/, '').trim();
}

/**
 * Tính điểm CTR ước tính động dựa trên tiêu chí YouTube ranking
 */
export function estimateDynamicCtr(core: string, hook: string): string {
  const full = `${core} ${hook}`.trim();
  let score = 30; // Điểm nền tảng

  // Độ dài vàng (40 - 65 ký tự)
  if (full.length >= 40 && full.length <= 65) score += 7;
  else if (full.length > 25 && full.length <= 80) score += 4;

  // Có số / phần trăm (kích thích thị giác)
  if (/\d+/.test(full)) score += 5;

  // Có từ khóa mạnh
  const powerWords = [
    'bí mật',
    'sự thật',
    'bất ngờ',
    'cực',
    'nhanh',
    'đơn giản',
    'hướng dẫn',
    'cảnh báo',
    'bí quyết',
    'thử',
    'đỉnh',
  ];
  if (powerWords.some((w) => full.toLowerCase().includes(w))) score += 5;

  // Có ký tự nhấn mạnh (dấu ngoặc, gạch đứng, emoji)
  if (/[!?[\]()|—–]/.test(full) || /[\u{1F300}-\u{1FAFF}]/u.test(full)) score += 4;

  return `CTR +${Math.min(49, score)}%`;
}

export interface GeneratedTitleVariant {
  title: string;
  core: string;
  hook: string;
  type: string;
  score: string;
}

/**
 * Tạo danh sách 5 biến thể tiêu đề theo quy tắc 95/5, hỗ trợ chọn Style và Seed xoay vòng
 */
export function generateAllHookTitles(
  rawTitle: string,
  style: 'curiosity' | 'secret' | 'urgency' | 'value' | 'cta' | 'all' = 'all',
  seed = 0,
): GeneratedTitleVariant[] {
  const core = extractCoreTitle(rawTitle);
  if (!core) return [];

  const styles: Array<'curiosity' | 'secret' | 'urgency' | 'value' | 'cta'> =
    style === 'all'
      ? ['curiosity', 'secret', 'urgency', 'value', 'cta']
      : [style, style, style, style, style];

  return styles.map((st, index) => {
    const group = HOOK_BANK[st];
    const templateIndex = (seed + index) % group.templates.length;
    const hook = group.templates[templateIndex];
    const fullTitle = `${core} ${hook}`.trim();
    const score = estimateDynamicCtr(core, hook);

    return {
      title: fullTitle,
      core,
      hook,
      type: `${group.label} #${index + 1}`,
      score,
    };
  });
}

/**
 * Lấy 1 tiêu đề tối ưu tốt nhất cho luồng Tự Động Hóa (Auto-Pilot)
 */
export function getBestAutoPilotTitle(rawTitle: string, seed = 0): string {
  const variants = generateAllHookTitles(rawTitle, 'all', seed);
  return variants[0]?.title || rawTitle;
}

/**
 * Lắp ghép mô tả video tự động 3 tầng (Tóm tắt + Khung Kênh + Disclaimer + Hashtags)
 */
export interface DescriptionBuilderOptions {
  videoTitle: string;
  originalDescription?: string;
  channelName?: string;
  customChannelTemplate?: string;
  socialLinks?: string;
  includeDisclaimer?: boolean;
  hashtags?: string[];
}

export function buildAutoPilotDescription(options: DescriptionBuilderOptions): string {
  const parts: string[] = [];

  // Tầng 1: Tóm tắt 1 - 2 dòng đầu
  if (options.originalDescription?.trim()) {
    const lines = options.originalDescription
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 15 && !l.startsWith('http') && !l.startsWith('#'))
      .slice(0, 2);
    if (lines.length > 0) {
      parts.push(lines.join('\n'));
    } else {
      parts.push(`Khám phá nội dung hấp dẫn về ${options.videoTitle}. Cùng theo dõi ngay!`);
    }
  } else {
    parts.push(`Khám phá nội dung hấp dẫn về ${options.videoTitle}. Cùng theo dõi ngay!`);
  }

  // Tầng 2: Khung Kênh Chính / Lời kêu gọi
  if (options.customChannelTemplate?.trim()) {
    parts.push(options.customChannelTemplate.trim());
  } else {
    parts.push(
      `Đăng ký kênh để không bỏ lỡ các video mới nhất mỗi ngày! ❤️\nNếu thấy hay đừng quên Like, Share và để lại bình luận phía dưới nhé.`,
    );
  }

  // Tầng 3: Disclaimer bản quyền (Fair Use)
  if (options.includeDisclaimer !== false) {
    parts.push(
      `--- \n© Bản quyền nội dung thuộc về các chủ sở hữu hợp pháp. Chúng tôi tôn trọng luật bản quyền và nguyên tắc Sử dụng Hợp lý (Fair Use). Nếu có bất kỳ vấn đề nào liên quan đến bản quyền, vui lòng liên hệ trực tiếp với chúng tôi để được giải quyết nhanh nhất.`,
    );
  }

  // Tầng 4: Bộ thẻ Hashtags SEO
  const tags =
    options.hashtags && options.hashtags.length > 0
      ? options.hashtags
      : ['#shorts', '#reup', '#trending', '#youtube'];
  parts.push(tags.join(' '));

  return parts.join('\n\n');
}

/**
 * Tự động tìm đường dẫn file ảnh thumbnail (.jpg) đi kèm trong cùng thư mục với video
 */
export function getCompanionThumbnailPath(videoPath: string): string | null {
  if (!videoPath?.trim()) return null;
  const lastDot = videoPath.lastIndexOf('.');
  if (lastDot === -1) return null;
  return `${videoPath.slice(0, lastDot)}.jpg`;
}
