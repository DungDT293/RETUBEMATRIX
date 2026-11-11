/**
 * Tiện ích Tự Động Hóa Reup & BKT (Auto-Pilot Utilities)
 * Hỗ trợ: Thuật toán 95% Core - 5% Hook theo ranh giới từ (Word-Boundary),
 * Nhận diện Ngôn ngữ & Thể loại (Phonk/Music, Gaming, How-to, General),
 * Trích xuất đuôi đối thủ thành công,
 * Tính điểm CTR động, Lắp ghép Mô tả đa tầng SEO Quốc tế, và Quản lý file ảnh bìa đi kèm.
 */

// Ký tự tiếng Việt có dấu chuẩn Unicode
const VIETNAMESE_ACCENT_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

// Dải ký tự Unicode cho ngôn ngữ Đông Nam Á và Quốc tế
const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;
const LAO_CHAR_REGEX = /[\u0E80-\u0EFF]/;
const KHMER_CHAR_REGEX = /[\u1780-\u17FF]/;
const CJK_CHAR_REGEX = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

// Danh sách từ tiếng Việt không dấu thông dụng đặc trưng
const VIETNAMESE_UNACCENTED_WORDS = new Set([
  'cach',
  'huong',
  'dan',
  'nhanh',
  'nhat',
  'va',
  'cho',
  'nguoi',
  'moi',
  'bat',
  'dau',
  'kham',
  'pha',
  'bi',
  'quyet',
  'chia',
  'se',
  'tap',
  'tai',
  'sao',
  'khong',
  'the',
  'tin',
  'duoc',
  'dinh',
  'trong',
  'ngay',
  'muon',
  'biet',
  'chua',
  'xem',
  'keo',
  'su',
  'that',
  'ngo',
  'cuoi',
  'cung',
  'tuyet',
  'hay',
  'nhan',
  'dien',
  'kiem',
  'tien',
  'meo',
  'kinh',
  'nghiem',
  'bai',
  'hoc',
  'lam',
  'mon',
  'an',
  'nau',
  'ngon',
  'nha',
  'don',
  'gian',
  'de',
  'hieu',
  'qua',
  'cuc',
]);

export type AutoPilotLanguage = 'vi' | 'en' | 'th' | 'lo' | 'km' | 'cjk';

/**
 * Nhận diện chính xác ngôn ngữ của tiêu đề (Hỗ trợ: Tiếng Thái, Lào, Campuchia, CJK, Việt Nam, Quốc tế)
 */
export function detectTitleLanguage(title: string): AutoPilotLanguage {
  if (!title?.trim()) return 'en';

  // 1. Kiểm tra chữ Thái Lan (Thai Script)
  if (THAI_CHAR_REGEX.test(title)) {
    return 'th';
  }

  // 2. Kiểm tra chữ Lào (Lao Script)
  if (LAO_CHAR_REGEX.test(title)) {
    return 'lo';
  }

  // 3. Kiểm tra chữ Campuchia / Khmer
  if (KHMER_CHAR_REGEX.test(title)) {
    return 'km';
  }

  // 4. Kiểm tra chữ CJK (Trung/Nhật/Hàn)
  if (CJK_CHAR_REGEX.test(title)) {
    return 'cjk';
  }

  // 5. Kiểm tra ký tự tiếng Việt có dấu -> 100% tiếng Việt
  if (VIETNAMESE_ACCENT_REGEX.test(title)) {
    return 'vi';
  }

  // 6. Tách từ không dấu và đối chiếu từ điển tiếng Việt không dấu
  const words = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  if (words.length === 0) return 'en';

  let vnMatchCount = 0;
  for (const w of words) {
    if (VIETNAMESE_UNACCENTED_WORDS.has(w)) {
      vnMatchCount++;
    }
  }

  // Nếu có từ 2 từ không dấu tiếng Việt hoặc tỉ lệ từ tiếng Việt >= 30%
  if (vnMatchCount >= 2 || (words.length <= 4 && vnMatchCount >= 1)) {
    return 'vi';
  }

  return 'en';
}

/**
 * Cắt chuỗi an toàn theo cụm Grapheme Cluster (ngăn ngừa đứt gãy nguyên âm/dấu thanh tiếng Thái, Lào, Việt)
 */
export function safeTruncateGraphemes(text: string, maxGraphemes: number): string {
  if (!text) return '';
  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new (
        Intl as unknown as {
          Segmenter: new (
            locales?: string,
            options?: { granularity?: string },
          ) => { segment: (input: string) => Iterable<{ segment: string }> };
        }
      ).Segmenter(undefined, { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(text), (s) => s.segment);
      if (segments.length <= maxGraphemes) return text;
      return segments.slice(0, maxGraphemes).join('').trim();
    }
  } catch {
    // Fallback nếu không hỗ trợ
  }
  const chars = Array.from(text);
  if (chars.length <= maxGraphemes) return text;
  return chars.slice(0, maxGraphemes).join('').trim();
}

/**
 * Giới hạn tiêu đề YouTube an toàn dưới 95 ký tự (ngăn chặn hoàn toàn lỗi tràn 100 ký tự của YouTube Studio)
 */
export function sanitizeYouTubeTitle(title: string, maxGraphemes = 95): string {
  const truncated = safeTruncateGraphemes(title.trim(), maxGraphemes);
  return truncated.replace(/[,;:.!?|\-—–~•\s]+$/, '').trim();
}

/**
 * Giới hạn danh sách tags an toàn dưới 450 ký tự (ngăn chặn hoàn toàn lỗi tràn trần 500 ký tự của YouTube Studio)
 */
export function sanitizeYouTubeTags(tags: string[], maxTotalChars = 450): string[] {
  const safeTags: string[] = [];
  let currentLen = 0;
  for (const raw of tags) {
    const clean = raw.trim().replace(/^#+/, '');
    if (!clean || clean.length < 2) continue;
    const tagCost = clean.length + (safeTags.length > 0 ? 2 : 0);
    if (currentLen + tagCost <= maxTotalChars) {
      safeTags.push(clean);
      currentLen += tagCost;
    } else {
      break;
    }
  }
  return safeTags;
}

/**
 * Nhận diện thể loại nội dung của tiêu đề ('music' | 'gaming' | 'howto' | 'general')
 */
export function detectGenre(title: string): 'music' | 'gaming' | 'howto' | 'general' {
  if (!title?.trim()) return 'general';
  const lower = title.toLowerCase();

  // Nhạc, Phonk, EDM, Beat, Audio
  const musicKeywords = [
    'phonk',
    'remix',
    'edm',
    'bass',
    'audio',
    'song',
    'lofi',
    'jazz',
    'beat',
    'track',
    'music',
    'slowed',
    'reverb',
    'soundtrack',
    'ost',
    'instrumental',
    'lyrics',
    'dj',
    'trap',
    'synthwave',
    'chill',
    'banger',
    'prod',
    'drill',
    'rap',
    'hiphop',
    'playlist',
    'drift phonk',
    'amv',
    'nhạc',
    'bài hát',
    'lời bài hát',
  ];
  if (musicKeywords.some((k) => lower.includes(k))) {
    return 'music';
  }

  // Trò chơi / Gaming
  const gamingKeywords = [
    'gameplay',
    'gaming',
    'walkthrough',
    'playthrough',
    'speedrun',
    'roblox',
    'minecraft',
    'gta',
    'valorant',
    'csgo',
    'highlight',
    'highlights',
    'stream',
    'clips',
    'pvp',
    'boss fight',
    'mod',
    'epic moments',
    'trò chơi',
    'liên quân',
    'free fire',
  ];
  if (gamingKeywords.some((k) => lower.includes(k))) {
    return 'gaming';
  }

  // Hướng dẫn / How-to / Tutorial
  const howtoKeywords = [
    'review',
    'tutorial',
    'hướng dẫn',
    'huong dan',
    'cách',
    'cach',
    'how to',
    'diy',
    'guide',
    'tips',
    'tricks',
    'mẹo',
    'bí quyết',
    'bi quyet',
    'làm sao',
    'lam sao',
    'bước',
    'step by step',
    'masterclass',
  ];
  if (howtoKeywords.some((k) => lower.includes(k))) {
    return 'howto';
  }

  return 'general';
}

// ================= KHO MẪU ĐUÔI CHUYÊN NGÀNH QUỐC TẾ & ĐA NGỮ =================

export const NICHE_TAILS_EN = {
  music: [
    '[Slowed + Reverb]',
    '[Bass Boosted]',
    '| Best 2026 Mix',
    '(Official Audio)',
    '[1 Hour Loop]',
    '| Workout Motivation',
    '(Remix 2026)',
    '[Audio Edit]',
    '(Lyrics)',
    '[Ultra Bass]',
    '| Phonk Drift',
    '[Full Track]',
  ],
  gaming: [
    '| Best Highlights 2026',
    '(Full Gameplay)',
    '| Insane Clutch Play',
    '[No Commentary - 4K 60FPS]',
    '| Pro Strategy Breakdown',
    '(Epic Moments 2026)',
  ],
  howto: [
    '[Step-by-Step Guide]',
    '(Beginner Friendly)',
    '| Complete 2026 Masterclass',
    '— Fast & Proven Method',
    '(5 Pro Tips to Master It)',
  ],
  general: [
    '[2026 Edition]',
    '(Complete Breakdown)',
    '| In-Depth Perspective',
    '(Everything You Need to Know)',
    '[Complete Master Edition]',
  ],
};

export const NICHE_TAILS_VI = {
  music: [
    '[Bản Phối Mới 2026]',
    '[Bass Cực Căng]',
    '| Tuyển Tập Hay Nhất 2026',
    '(Bản Chuẩn Gốc)',
    '[Bản Lặp 1 Giờ]',
    '| Nghe Để Có Động Lực',
    '(Remix 2026)',
    '[Bản Edit Cực Cuốn]',
    '(Lời Bài Hát)',
    '[Full Track]',
  ],
  gaming: [
    '| Highlight Đỉnh Cao 2026',
    '(Full Trận Đấu Mãn Nhãn)',
    '| Pha Xử Lý Không Tưởng',
    '[Không Bình Luận - 4K 60FPS]',
    '| Chiến Thuật Pro',
    '(Khoảnh Khắc Xuất Thần)',
  ],
  howto: [
    '[Hướng Dẫn Chi Tiết A-Z]',
    '(Cực Kỳ Dễ Làm Cho Người Mới)',
    '| Bí Quyết Chuẩn Nhất 2026',
    '— Cách Làm Nhanh Gấp 10 Lần',
    '[Công Thức Bất Bại]',
  ],
  general: [
    '[Bản Cập Nhật 2026]',
    '(Chi Tiết Từ A Đến Z)',
    '| Góc Nhìn Thực Tế Mới Nhất',
    '(Những Điều Cần Biết Trước)',
    '[Phiên Bản Hoàn Chỉnh]',
  ],
};

export const NICHE_TAILS_TH = {
  music: [
    '[เวอร์ชันใหม่ 2026]',
    '[เบสแน่นกระหึ่ม]',
    '| รวมเพลงฮิต 2026',
    '(ฉบับรีมิกซ์ 2026)',
    '[วนซ้ำ 1 ชั่วโมง]',
    '| ฟังตอนทำงานและออกกำลังกาย',
    '[เสียงคมชัดระดับมาสเตอร์]',
    '(เนื้อเพลงเต็ม)',
    '[Full Track]',
  ],
  gaming: [
    '| ไฮไลท์สุดมันส์ 2026',
    '(ฟูลแมตช์ระดับโปร)',
    '| ช็อตปาฏิหาริย์ ไม่คิดว่าจะรอด',
    '[ไม่มีพากย์ 4K 60FPS]',
    '| กลยุทธ์ระดับเทพ',
    '(ช็อตเด็ดประจำวัน 2026)',
  ],
  howto: [
    '[คู่มือแบบละเอียด A-Z 2026]',
    '(เข้าใจง่ายสำหรับมือใหม่)',
    '| เคล็ดลับเพิ่มความเร็ว 10 เท่า',
    '— วิธีทำฉบับใช้งานได้จริง',
    '[สูตรลับที่ไม่เคยบอกใคร]',
  ],
  general: [
    '[อัปเดตใหม่ 2026]',
    '(เจาะลึกตั้งแต่เริ่มต้น)',
    '| สรุปประเด็นสำคัญล่าสุด',
    '(สิ่งที่ควรรู้ก่อนเริ่ม)',
    '[ฉบับสมบูรณ์]',
  ],
};

export const NICHE_TAILS_LO = {
  music: [
    '[ສະບັບໃໝ່ 2026]',
    '[ເບສແໜ້ນໆ]',
    '| ລວມເພງດັງ 2026',
    '(ຣີມິກ 2026)',
    '[ຟັງຍາວ 1 ຊົ່ວໂມງ]',
    '| ຟັງແລ້ວມີພະລັງ',
  ],
  gaming: ['| ໄຮໄລ້ສຸດມັນ 2026', '(ຫຼິ້ນແບບລະດັບໂປ)', '[ບໍ່ມີພາກ 4K 60FPS]', '| ຈັງຫວະຄາດບໍ່ເຖິງ'],
  howto: ['[ວິທີເຮັດແບບລະອຽດ 2026]', '(ງ່າຍສຳລັບມືໃໝ່)', '— ເຄັດລັບເຮັດໄວຂຶ້ນ 10 ເທົ່າ', '[ສູດສຳເລັດ]'],
  general: ['[ອັບເດດລ່າສຸດ 2026]', '(ລາຍລະອຽດຄົບຖ້ວນ)', '| ມຸມມອງໃໝ່ລ່າສຸດ', '[ສະບັບສົມບູນ]'],
};

// ================= NGÂN HÀNG HOOK TÂM LÝ CLICK YOUTUBE (VI & EN) =================

export const HOOK_BANK_VI: Record<
  'curiosity' | 'secret' | 'urgency' | 'value' | 'cta',
  { templates: string[]; label: string; tag: string }
> = {
  curiosity: {
    label: 'Góc nhìn mới lạ (Perspective)',
    tag: 'Góc nhìn',
    templates: [
      '| Góc Nhìn Độc Quyền 2026',
      '— Chi Tiết Ít Ai Nhận Ra',
      '| Những Điểm Thú Vị Chưa Kể',
      '— Phân Tích Bất Ngờ',
      '| Trải Nghiệm Thực Tế',
    ],
  },
  secret: {
    label: 'Bí quyết chuyên sâu (Insight)',
    tag: 'Bí quyết',
    templates: [
      '— Bí Quyết Người Trong Ngành',
      '| Toàn Bộ Sự Thật Chưa Kể',
      '— Thông Tin Độc Quyền',
      '| Phân Tích Chuyên Sâu 2026',
      '— Chia Sẻ Từ Chuyên Gia',
    ],
  },
  urgency: {
    label: 'Cập nhật quan trọng (Update)',
    tag: 'Cập nhật',
    templates: [
      '[Bản Cập Nhật Mới Nhất 2026]',
      '| Lưu Ý Quan Trọng Cần Biết',
      '(Không Thể Bỏ Qua)',
      '— Điểm Mới Nhất Cần Nắm',
      '(Xem Trước Khi Bắt Đầu)',
    ],
  },
  value: {
    label: 'Giá trị thực chiến (Value)',
    tag: 'Giá trị',
    templates: [
      '| Hướng Dẫn Từng Bước A-Z',
      '— Cách Làm Nhanh Gọn Cực Dễ',
      '| Bí Quyết Chuẩn 2026',
      '— Tối Ưu Hiệu Quả Gấp Đôi',
      '| Công Thức Thực Chiến',
    ],
  },
  cta: {
    label: 'Trải nghiệm trọn vẹn (Experience)',
    tag: 'Trải nghiệm',
    templates: [
      '[Phiên Bản Đầy Đủ 2026]',
      '| Đánh Giá Chi Tiết',
      '— Trải Nghiệm Thực Tế',
      '[Bản Hoàn Chỉnh Nhất]',
      '| Tổng Hợp Toàn Diện',
    ],
  },
};

export const HOOK_BANK_EN: Record<
  'curiosity' | 'secret' | 'urgency' | 'value' | 'cta',
  { templates: string[]; label: string; tag: string }
> = {
  curiosity: {
    label: 'Fresh Perspective',
    tag: 'Perspective',
    templates: [
      '| In-Depth Perspective 2026',
      '— Details You Might Have Missed',
      '| What Actually Happened',
      '— Surprising Analysis',
      '| Real World Experience',
    ],
  },
  secret: {
    label: 'Insider Insight',
    tag: 'Insight',
    templates: [
      '— Insider Secrets Revealed',
      '| The Full Untold Story',
      '— Exclusive Breakdown',
      '| Industry Deep Dive 2026',
      '— Expert Insights Exposed',
    ],
  },
  urgency: {
    label: 'Essential Update',
    tag: 'Update',
    templates: [
      '[Latest 2026 Update]',
      '| Critical Things You Must Know',
      "(Don't Miss This)",
      '— Essential 2026 Guide',
      '(Must Know Before Starting)',
    ],
  },
  value: {
    label: 'High Value & Mastery',
    tag: 'Value',
    templates: [
      '| Step-by-Step Blueprint',
      '— Fast & Proven Method',
      '| Complete 2026 Breakdown',
      '— Simple & Highly Effective',
      '| Masterclass Edition',
    ],
  },
  cta: {
    label: 'Complete Experience',
    tag: 'Experience',
    templates: [
      '[Full 2026 Edition]',
      '| In-Depth Experience',
      '— Honest Review & Breakdown',
      '[Practical Field Test]',
      '| Complete Overview',
    ],
  },
};

// Giữ lại HOOK_BANK để tương thích 100% các component cũ
export const HOOK_BANK = HOOK_BANK_VI;

/**
 * Trích xuất các mẫu đuôi thực tế từ tiêu đề đối thủ thành công (Outlier Titles & Spy Tags).
 * Tách lấy các khối [...], (...) hoặc các vế sau ký tự phân tách (| / — / – / •)
 */
export function extractCompetitorTailPatterns(
  competitorTitles: string[] = [],
  competitorTags: string[] = [],
  _lang: 'vi' | 'en' = 'en',
): string[] {
  const extracted: string[] = [];
  const seen = new Set<string>();

  const addTail = (tail: string, isDelimited = false) => {
    let clean = tail.replace(/^[\s|—–•~/:]+|[\s|—–•~/:]+$/g, '').trim();
    if (!clean) return;
    // Bỏ qua nếu quá ngắn hoặc quá dài
    if (clean.length < 3 || clean.length > 40) return;
    // Bỏ qua nếu có dấu hiệu tên kênh, email, liên kết
    if (/@|http|www|\.com|channel|subscribe|đăng ký/i.test(clean)) return;

    if (isDelimited && !clean.startsWith('[') && !clean.startsWith('(')) {
      clean = `| ${clean}`;
    }

    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      extracted.push(clean);
    }
  };

  for (const title of competitorTitles) {
    if (!title?.trim()) continue;

    // 1. Tìm các khối ngoặc vuông [...]
    const bracketMatches = title.match(/\[([^\]]+)\]/g);
    if (bracketMatches) {
      for (const m of bracketMatches) {
        addTail(m);
      }
    }

    // 2. Tìm các khối ngoặc tròn (...)
    const parenMatches = title.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      for (const m of parenMatches) {
        addTail(m);
      }
    }

    // 3. Tách theo dấu phân tách (lấy vế đuôi cuối cùng)
    const parts = title.split(/\s*([|—–•~/])\s*/);
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart.length >= 3 && lastPart.length <= 40) {
        // Đặt tiền tố phân tách gọn
        addTail(lastPart, true);
      }
    }
  }

  // 4. Nếu có tags đối thủ nổi bật (ví dụ 'slowed', 'bass boosted')
  if (competitorTags && competitorTags.length > 0) {
    for (const tag of competitorTags.slice(0, 10)) {
      const t = tag.trim();
      if (t.length >= 4 && t.length <= 25 && !t.startsWith('#') && !/@|channel|video/i.test(t)) {
        // Viết hoa chữ cái đầu mỗi từ
        const formattedTag = t
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        addTail(`[${formattedTag}]`);
      }
    }
  }

  return extracted;
}

/**
 * Bóc tách 90% - 95% cốt lõi của tiêu đề gốc theo ranh giới từ vựng (Word-Boundary),
 * loại bỏ hoàn toàn hook cũ, tên kênh đối thủ ở đuôi và dấu câu treo.
 */
export function extractCoreTitle(raw: string): string {
  if (!raw?.trim()) return '';

  let clean = raw.trim();

  // 1. Loại bỏ toàn bộ hashtag (#shorts, #xuhuong,...)
  clean = clean.replace(/#[^\s]+/g, '').trim();

  // 2. Loại bỏ toàn bộ khối đóng mở ngoặc [...], (...), {...}
  clean = clean.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '').trim();

  // 3. Nếu có phân tách ống dẫn (| / — / – / • / ~ / :), lấy vế đầu tiên (cốt lõi đề tài)
  const pipeParts = clean.split(/\s*([|—–•~:])\s*/);
  if (pipeParts.length > 0 && pipeParts[0].trim().length >= 4) {
    clean = pipeParts[0].trim();
  }

  // 4. Xóa sạch dấu câu treo ở đầu và cuối
  clean = clean.replace(/^[,;:.!?|\-—–~•\s]+|[,;:.!?|\-—–~•\s]+$/g, '').trim();

  // 5. Tách từ theo khoảng trắng
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return clean;

  // 6. Giữ 90 - 95% số từ nếu câu quá dài (> 12 từ) để bảo toàn từ ghép tiếng Việt
  let coreCount = words.length;
  if (words.length >= 12) {
    coreCount = Math.max(8, Math.floor(words.length * 0.9));
  }

  const core = words.slice(0, coreCount).join(' ');
  return core.replace(/[,;:.!?|\-—–~•]+$/, '').trim();
}

/**
 * Tính điểm CTR ước tính động dựa trên tiêu chí YouTube ranking và đa ngôn ngữ
 */
export function estimateDynamicCtr(core: string, hook: string, lang: 'vi' | 'en' = 'vi'): string {
  const full = `${core} ${hook}`.trim();
  let score = 32; // Điểm nền tảng

  // Độ dài vàng (40 - 70 ký tự)
  if (full.length >= 40 && full.length <= 70) score += 7;
  else if (full.length > 25 && full.length <= 85) score += 4;

  // Có số / năm / phần trăm (kích thích thị giác)
  if (/\d+/.test(full)) score += 5;

  // Có từ khóa mạnh theo ngôn ngữ
  const powerWordsVi = [
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
    'hay nhất',
  ];
  const powerWordsEn = [
    'secret',
    'truth',
    'shocking',
    'best',
    'fast',
    'easy',
    'guide',
    'warning',
    'ultimate',
    'official',
    'insane',
    'pro',
    'review',
    'viral',
    'mix',
    'loop',
    'slowed',
    'boosted',
  ];

  const powerWords = lang === 'en' ? powerWordsEn : powerWordsVi;
  const lowerFull = full.toLowerCase();
  if (powerWords.some((w) => lowerFull.includes(w))) score += 5;

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
 * Tạo danh sách 5 biến thể tiêu đề theo quy tắc 95/5, bảo toàn Core Topic,
 * Nhận diện chính xác Thể loại & Ngôn ngữ, ưu tiên đuôi của đối thủ thành công.
 */
export function generateAllHookTitles(
  rawTitle: string,
  style: 'curiosity' | 'secret' | 'urgency' | 'value' | 'cta' | 'all' = 'all',
  seed = 0,
  competitorTitles?: string[],
  competitorTags?: string[],
  forcedGenre?: 'music' | 'gaming' | 'howto' | 'general',
  forcedLang?: AutoPilotLanguage,
): GeneratedTitleVariant[] {
  const core = extractCoreTitle(rawTitle);
  if (!core) return [];

  const lang = forcedLang || detectTitleLanguage(rawTitle);
  const genre = forcedGenre || detectGenre(rawTitle);

  // Trích xuất các mẫu đuôi thực tế từ đối thủ
  const competitorTails = extractCompetitorTailPatterns(
    competitorTitles || [],
    competitorTags || [],
    lang === 'vi' ? 'vi' : 'en',
  );

  // Chọn kho đuôi chuyên biệt theo ngôn ngữ (Thái, Lào, Việt, Quốc tế)
  const getNicheTailSet = (g: 'music' | 'gaming' | 'howto' | 'general') => {
    if (lang === 'th') return NICHE_TAILS_TH[g];
    if (lang === 'lo') return NICHE_TAILS_LO[g];
    if (lang === 'vi') return NICHE_TAILS_VI[g];
    return NICHE_TAILS_EN[g];
  };

  // 1. THỂ LOẠI MUSIC / PHONK / REMIX
  if (genre === 'music') {
    const defaultMusicTails = getNicheTailSet('music');
    const combinedTails = [
      ...competitorTails,
      ...defaultMusicTails.filter(
        (t) => !competitorTails.some((ct) => ct.toLowerCase() === t.toLowerCase()),
      ),
    ];

    const typesEn = [
      'Audio Aesthetic #1',
      'Bass & Drift #2',
      'Extended Mix #3',
      'Official Master #4',
      'Viral Edit #5',
    ];
    const typesVi = [
      'Phối Khí Mới #1',
      'Bass Tăng Cường #2',
      'Bản Lặp Chuyên Sâu #3',
      'Bản Chuẩn Gốc #4',
      'Edit Xu Hướng #5',
    ];
    const types = lang === 'vi' ? typesVi : typesEn;

    return types.map((typeName, index) => {
      const tailIndex = (seed + index) % combinedTails.length;
      const hook = combinedTails[tailIndex] || defaultMusicTails[0];
      const fullTitle = sanitizeYouTubeTitle(`${core} ${hook}`.trim(), 95);
      const score = estimateDynamicCtr(core, hook, lang === 'vi' ? 'vi' : 'en');

      return {
        title: fullTitle,
        core,
        hook,
        type: typeName,
        score,
      };
    });
  }

  // 2. THỂ LOẠI GAMING
  if (genre === 'gaming') {
    const defaultGamingTails = getNicheTailSet('gaming');
    const combinedTails = [
      ...competitorTails,
      ...defaultGamingTails.filter(
        (t) => !competitorTails.some((ct) => ct.toLowerCase() === t.toLowerCase()),
      ),
    ];

    const typesEn = [
      'Epic Highlight #1',
      'Pro Gameplay #2',
      'Insane Play #3',
      'No Commentary #4',
      'Season Best #5',
    ];
    const typesVi = [
      'Khoảnh Khắc Đỉnh Cao #1',
      'Trận Đấu Đầy Đủ #2',
      'Pha Xử Lý Đỉnh #3',
      'Không Bình Luận #4',
      'Highlights Xu Hướng #5',
    ];
    const types = lang === 'vi' ? typesVi : typesEn;

    return types.map((typeName, index) => {
      const tailIndex = (seed + index) % combinedTails.length;
      const hook = combinedTails[tailIndex] || defaultGamingTails[0];
      const fullTitle = sanitizeYouTubeTitle(`${core} ${hook}`.trim(), 95);
      const score = estimateDynamicCtr(core, hook, lang === 'vi' ? 'vi' : 'en');

      return {
        title: fullTitle,
        core,
        hook,
        type: typeName,
        score,
      };
    });
  }

  // 3. THỂ LOẠI HOW-TO / TUTORIAL
  if (genre === 'howto') {
    const defaultHowtoTails = getNicheTailSet('howto');
    const combinedTails = [
      ...competitorTails,
      ...defaultHowtoTails.filter(
        (t) => !competitorTails.some((ct) => ct.toLowerCase() === t.toLowerCase()),
      ),
    ];

    const typesEn = [
      'Step-by-Step #1',
      'Mastery Guide #2',
      'Fast Method #3',
      'Pro Tips #4',
      'Complete Walkthrough #5',
    ];
    const typesVi = [
      'Từng Bước Chi Tiết #1',
      'Bí Quyết Chuẩn #2',
      'Cách Làm Cực Nhanh #3',
      'Mẹo Đỉnh Cao #4',
      'Toàn Diện A-Z #5',
    ];
    const types = lang === 'vi' ? typesVi : typesEn;

    return types.map((typeName, index) => {
      const tailIndex = (seed + index) % combinedTails.length;
      const hook = combinedTails[tailIndex] || defaultHowtoTails[0];
      const fullTitle = sanitizeYouTubeTitle(`${core} ${hook}`.trim(), 95);
      const score = estimateDynamicCtr(core, hook, lang === 'vi' ? 'vi' : 'en');

      return {
        title: fullTitle,
        core,
        hook,
        type: typeName,
        score,
      };
    });
  }

  // 4. THỂ LOẠI GENERAL / VLOG
  const activeHookBank = lang === 'vi' ? HOOK_BANK_VI : HOOK_BANK_EN;
  const styles: Array<'curiosity' | 'secret' | 'urgency' | 'value' | 'cta'> =
    style === 'all'
      ? ['curiosity', 'secret', 'urgency', 'value', 'cta']
      : [style, style, style, style, style];

  return styles.map((st, index) => {
    let hook: string;
    let label = activeHookBank[st].label;

    if (competitorTails.length > index && index === 0) {
      hook = competitorTails[0];
      label = lang === 'vi' ? 'Đuôi Đối Thủ Thành Công' : 'Competitor Proven Tail';
    } else {
      const group = activeHookBank[st];
      const templateIndex = (seed + index) % group.templates.length;
      hook = group.templates[templateIndex];
    }

    const fullTitle = sanitizeYouTubeTitle(`${core} ${hook}`.trim(), 95);
    const score = estimateDynamicCtr(core, hook, lang === 'vi' ? 'vi' : 'en');

    return {
      title: fullTitle,
      core,
      hook,
      type: `${label} #${index + 1}`,
      score,
    };
  });
}

/**
 * Lấy 1 tiêu đề tối ưu tốt nhất cho luồng Tự Động Hóa (Auto-Pilot)
 */
export function getBestAutoPilotTitle(
  rawTitle: string,
  seed = 0,
  competitorTitles?: string[],
  competitorTags?: string[],
): string {
  const variants = generateAllHookTitles(rawTitle, 'all', seed, competitorTitles, competitorTags);
  const best = variants[0]?.title || rawTitle;
  return sanitizeYouTubeTitle(best, 95);
}

/**
 * Lắp ghép mô tả video tự động đa tầng SEO Quốc tế (Tóm tắt + Khung Kênh + Disclaimer + Hashtags)
 * Tự động chuyển 100% tiếng Anh nếu video là tiếng Anh, không bao giờ pha tạp tiếng Việt.
 */
export interface DescriptionBuilderOptions {
  videoTitle: string;
  originalDescription?: string;
  channelName?: string;
  customChannelTemplate?: string;
  socialLinks?: string;
  includeDisclaimer?: boolean;
  hashtags?: string[];
  lang?: 'vi' | 'en';
}

export interface AdaptCompetitorDescriptionOptions {
  originalDescription: string;
  targetChannelName?: string;
  targetChannelHandle?: string;
  competitorChannelName?: string;
  competitorHandle?: string;
  videoTitle?: string;
  customCtaTemplate?: string;
  includeFairUseDisclaimer?: boolean;
  removeCompetitorLinks?: boolean;
  extraHashtags?: string[];
  lang?: 'vi' | 'en';
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Thích ứng mô tả video đối thủ:
 * 1. BẢO TOÀN 100% Tracklist, Timestamps/Chapters (00:00 - 10:30), lời bài hát, credits và từ khóa SEO.
 * 2. Thay thế tên kênh/handle đối thủ thành tên kênh đích (targetChannelName/realtacc).
 * 3. Lọc bỏ các liên kết MXH riêng, Patreon, Paypal, affiliate của đối thủ.
 * 4. Tự động gắn Tuyên bố Bản quyền Fair Use Section 107 chuẩn quốc tế.
 */
export function adaptCompetitorDescription(options: AdaptCompetitorDescriptionOptions): string {
  const raw = options.originalDescription?.trim() || '';
  if (!raw) {
    return buildAutoPilotDescription({
      videoTitle: options.videoTitle || 'Trending Video',
      channelName: options.targetChannelName,
      includeDisclaimer: options.includeFairUseDisclaimer ?? true,
      hashtags: options.extraHashtags,
      lang: options.lang,
    });
  }

  const lang =
    options.lang ||
    (options.videoTitle ? detectTitleLanguage(options.videoTitle) : detectTitleLanguage(raw));
  const targetName = options.targetChannelName?.trim() || '';
  const targetHandle =
    options.targetChannelHandle?.trim() || (targetName ? `@${targetName.replace(/\s+/g, '')}` : '');
  const competitorName = options.competitorChannelName?.trim() || '';
  const competitorHandle = options.competitorHandle?.trim() || '';

  const SPAM_DONATE_REGEX =
    /https?:\/\/(?:www\.)?(?:patreon\.com|paypal\.me|ko-fi\.com|buymeacoffee\.com|linktr\.ee|beacons\.ai|discord\.(?:gg|com)|instagram\.com|tiktok\.com|twitter\.com|x\.com|t\.me|telegram\.me|threads\.net|twitch\.tv|amzn\.to|bit\.ly|tinyurl\.com|shopee\.vn|lazada\.vn)\/[^\s]+/gi;
  const COMPETITOR_YT_REGEX =
    /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:@|c\/|channel\/|user\/)[^\s]+|youtu\.be\/[^\s]+)/gi;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const TIMESTAMP_LINE_REGEX = /^(?:\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\))?\s*[-–—:]?\s*(.+)$/i;
  const TRACKLIST_INDEX_REGEX = /^\s*(?:\d{1,2}[.\-)]|track\s*\d{1,2}[:-]|#\d{1,2})\s+.+/i;

  const lines = raw.split('\n');
  const preservedLines: string[] = [];
  const existingHashtags = new Set<string>();

  for (let line of lines) {
    const trimmed = line.trim();

    // 1. Dòng Timestamps hoặc Tracklist -> BẢO TOÀN TUYỆT ĐỐI 100%
    if (TIMESTAMP_LINE_REGEX.test(trimmed) || TRACKLIST_INDEX_REGEX.test(trimmed)) {
      if (competitorName && targetName) {
        line = line.replace(new RegExp(`\\b${escapeRegExp(competitorName)}\\b`, 'gi'), targetName);
      }
      preservedLines.push(line);
      continue;
    }

    // 2. Thu thập hashtags hiện có
    if (trimmed.startsWith('#')) {
      for (const w of trimmed.split(/\s+/)) {
        if (w.startsWith('#') && w.length > 1) {
          if (
            competitorName &&
            w.toLowerCase().includes(competitorName.toLowerCase().replace(/\s+/g, ''))
          ) {
            continue;
          }
          existingHashtags.add(w);
        }
      }
      continue;
    }

    // 3. Lọc bỏ liên kết donate / mạng xã hội đối thủ
    if (options.removeCompetitorLinks !== false) {
      if (
        /contact\s+for\s+(?:work|business|promotion)|liên\s*hệ\s*(?:quảng\s*cáo|hợp\s*tác)|follow\s+(?:me|us)|join\s+(?:our|my)\s+discord|patreon|paypal|donate|support.*(?:patreon|channel)|buy\s*me\s*a\s*coffee|ko-fi/i.test(
          trimmed,
        )
      ) {
        continue;
      }
      line = line
        .replace(SPAM_DONATE_REGEX, '')
        .replace(COMPETITOR_YT_REGEX, '')
        .replace(EMAIL_REGEX, '');
    }

    // 4. Thay thế tên kênh và handle đối thủ thành kênh đích
    if (competitorName && targetName) {
      line = line.replace(new RegExp(`\\b${escapeRegExp(competitorName)}\\b`, 'gi'), targetName);
    }
    if (competitorHandle && targetHandle) {
      line = line.replace(new RegExp(`${escapeRegExp(competitorHandle)}`, 'gi'), targetHandle);
    } else if (competitorHandle && targetName) {
      line = line.replace(
        new RegExp(`${escapeRegExp(competitorHandle)}`, 'gi'),
        `@${targetName.replace(/\s+/g, '')}`,
      );
    }

    if (targetName) {
      line = line.replace(/subscribe\s+to\s+[a-zA-Z0-9_\-\s]+/i, `Subscribe to ${targetName}`);
      line = line.replace(/đăng\s*ký\s*kênh\s+[a-zA-Z0-9_\-\s]+/i, `Đăng ký kênh ${targetName}`);
    }

    if (line.trim().length > 0 || trimmed.length === 0) {
      preservedLines.push(line);
    }
  }

  const adaptedBody = preservedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sections: string[] = [adaptedBody];

  // CTA Đăng ký kênh đích đa ngôn ngữ (Việt, Thái, Lào, Quốc tế)
  if (targetName) {
    if (options.customCtaTemplate?.trim()) {
      sections.push(options.customCtaTemplate.trim());
    } else {
      let ctaText = `🔔 Subscribe to ${targetName} for daily updates! If you enjoyed this video, please Like and Share!`;
      if (lang === 'vi') {
        ctaText = `🔔 Đăng ký kênh ${targetName} để theo dõi các video mới nhất mỗi ngày! Hãy Like và Chia sẻ nếu bạn thấy hay nhé!`;
      } else if (lang === 'th') {
        ctaText = `🔔 กดติดตามช่อง ${targetName} เพื่อไม่พลาดคลิปใหม่ทุกวัน! ช่วยกด Like และ Share เป็นกำลังใจให้ด้วยนะครับ/ค่ะ!`;
      } else if (lang === 'lo') {
        ctaText = `🔔 ກົດຕິດຕາມຊ່ອງ ${targetName} ເພື່ອອັບເດດຄລິບໃໝ່ໆທຸກມື້! ຢ່າລືມກົດ Like ແລະ Share ເພື່ອເປັນກຳລັງໃຈເດີ!`;
      }
      sections.push(ctaText);
    }
  }

  // Tuyên bố bản quyền Fair Use đa ngôn ngữ chuẩn quốc tế
  if (options.includeFairUseDisclaimer !== false) {
    const hasDisclaimer = /Section 107|Fair Use|Sử dụng hợp lý|ลิขสิทธิ์|ລິຂະສິດ/i.test(adaptedBody);
    if (!hasDisclaimer) {
      let disclaimerText = `--- \n© Copyright Disclaimer under Section 107 of the Copyright Act 1976, allowance is made for "fair use" for purposes such as criticism, comment, news reporting, teaching, scholarship, and research. All rights belong to their respective owners. For any copyright inquiries or removal requests, please contact us directly.`;
      if (lang === 'vi') {
        disclaimerText = `--- \n© Tuyên bố miễn trừ trách nhiệm Bản quyền theo Mục 107 Đạo luật Bản quyền 1976: Video sử dụng nội dung theo nguyên tắc Sử dụng hợp lý (Fair Use). Mọi quyền thuộc về chủ sở hữu hợp pháp. Vui lòng liên hệ trực tiếp với chúng tôi để được giải quyết nhanh nhất.`;
      } else if (lang === 'th') {
        disclaimerText = `--- \n© ข้อจำกัดความรับผิดชอบด้านลิขสิทธิ์: วิดีโอนี้จัดทำขึ้นภายใต้หลักเกณฑ์ Fair Use (การใช้อย่างเป็นธรรมตามมาตรา 107 ของกฎหมายลิขสิทธิ์) เพื่อความบันเทิงและการศึกษา หากมีข้อสงสัยหรือต้องการให้ลบเนื้อหา กรุณาติดต่อเราโดยตรง`;
      } else if (lang === 'lo') {
        disclaimerText = `--- \n© ຂໍ້ກຳນົດລິຂະສິດ: ວິດີໂອນີ້ສ້າງຂຶ້ນພາຍໃຕ້ຫຼັກການ Fair Use ເພື່ອຄວາມບັນເທິງ ແລະ ການສຶກສາ. ຫາກມີບັນຫາລິຂະສິດ ກະລຸນາຕິດຕໍ່ພວກເຮົາໂດຍກົງ`;
      }
      sections.push(disclaimerText);
    }
  }

  // Ghép thẻ Hashtags
  const allTags = new Set<string>();
  for (const tag of existingHashtags) {
    allTags.add(tag);
  }
  if (options.extraHashtags) {
    for (const tag of options.extraHashtags) {
      const clean = tag.trim().replace(/^#+/, '');
      if (clean) allTags.add(`#${clean}`);
    }
  }
  if (targetName) {
    allTags.add(`#${targetName.replace(/\s+/g, '').toLowerCase()}`);
  }

  if (allTags.size > 0) {
    sections.push(Array.from(allTags).slice(0, 15).join(' '));
  }

  const combinedDesc = sections.filter(Boolean).join('\n\n');
  return safeTruncateGraphemes(combinedDesc, 4900);
}

export function buildAutoPilotDescription(options: DescriptionBuilderOptions): string {
  // Nếu có mô tả gốc từ đối thủ -> Sử dụng bộ thích ứng bảo toàn 100% Tracklist/Timestamps và SEO
  if (options.originalDescription?.trim()) {
    return adaptCompetitorDescription({
      originalDescription: options.originalDescription,
      targetChannelName: options.channelName,
      videoTitle: options.videoTitle,
      customCtaTemplate: options.customChannelTemplate,
      includeFairUseDisclaimer: options.includeDisclaimer,
      extraHashtags: options.hashtags,
      lang: options.lang,
    });
  }

  const parts: string[] = [];
  const lang = options.lang || detectTitleLanguage(options.videoTitle);
  const genre = detectGenre(options.videoTitle);

  // TẦNG 1: Tóm tắt nội dung khởi tạo khi không có mô tả gốc
  if (lang === 'en') {
    parts.push(
      genre === 'music'
        ? `Experience the best vibe with "${options.videoTitle}". Turn up the volume and enjoy!`
        : `Discover the ultimate content for "${options.videoTitle}". Enjoy the experience and stay tuned for more!`,
    );
  } else {
    parts.push(
      genre === 'music'
        ? `Thưởng thức giai điệu tuyệt vời với "${options.videoTitle}". Bật âm lượng và cùng chill nhé!`
        : `Khám phá nội dung hấp dẫn về ${options.videoTitle}. Cùng theo dõi ngay!`,
    );
  }

  // TẦNG 2: Khung Kênh Chính / Lời kêu gọi đăng ký (CTA)
  if (options.customChannelTemplate?.trim()) {
    parts.push(options.customChannelTemplate.trim());
  } else {
    if (lang === 'en') {
      parts.push(
        `Subscribe to the channel so you never miss out on our latest daily releases! ❤️\nIf you enjoyed this, don't forget to Like, Share, and leave your thoughts in the comments below!`,
      );
    } else {
      parts.push(
        `Đăng ký kênh để không bỏ lỡ các video mới nhất mỗi ngày! ❤️\nNếu thấy hay đừng quên Like, Share và để lại bình luận phía dưới nhé.`,
      );
    }
  }

  // TẦNG 3: Disclaimer bản quyền (Fair Use)
  if (options.includeDisclaimer !== false) {
    if (lang === 'en') {
      parts.push(
        `--- \n© Copyright Disclaimer under Section 107 of the Copyright Act 1976, allowance is made for "fair use" for purposes such as criticism, comment, news reporting, teaching, scholarship, and research. All rights belong to their respective owners. For any copyright inquiries or removal requests, please contact us directly for immediate resolution.`,
      );
    } else {
      parts.push(
        `--- \n© Bản quyền nội dung thuộc về các chủ sở hữu hợp pháp. Chúng tôi tôn trọng luật bản quyền và nguyên tắc Sử dụng Hợp lý (Fair Use). Nếu có bất kỳ vấn đề nào liên quan đến bản quyền, vui lòng liên hệ trực tiếp với chúng tôi để được giải quyết nhanh nhất.`,
      );
    }
  }

  // TẦNG 4: Bộ thẻ Hashtags SEO
  if (options.hashtags && options.hashtags.length > 0) {
    const formattedTags = options.hashtags.map((tag) => {
      const clean = tag.trim().replace(/^#+/, '');
      return `#${clean}`;
    });
    parts.push(formattedTags.join(' '));
  } else {
    if (lang === 'en') {
      if (genre === 'music') {
        parts.push('#shorts #music #phonk #remix #trending #viral #youtube');
      } else if (genre === 'gaming') {
        parts.push('#shorts #gaming #gameplay #highlights #trending #viral');
      } else {
        parts.push('#shorts #trending #viral #youtube #foryou');
      }
    } else {
      if (genre === 'music') {
        parts.push('#shorts #nhachay #remix #trending #xuhuong #youtube');
      } else if (genre === 'gaming') {
        parts.push('#shorts #gaming #highlight #lienquan #xuhuong');
      } else {
        parts.push('#shorts #reup #trending #xuhuong #youtube');
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Tự động tìm đường dẫn file mô tả (.description) đi kèm trong cùng thư mục với video
 */
export function getCompanionDescriptionPath(videoPath: string): string | null {
  if (!videoPath?.trim()) return null;
  const lastDot = videoPath.lastIndexOf('.');
  if (lastDot === -1) return null;
  return `${videoPath.slice(0, lastDot)}.description`;
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

/**
 * Tạo prompt chuẩn cho mô hình AI (LLM / SLM Qwen-0.5B) biến đổi đuôi tiêu đề theo đúng yêu cầu:
 * 1. Giữ nguyên 90-95% từ khóa chủ đề cốt lõi của tiêu đề gốc ở phần đầu.
 * 2. Giữ đúng 100% ngôn ngữ của tiêu đề gốc (tiếng Anh ra tiếng Anh, không pha tiếng Việt).
 * 3. Chỉ sáng tạo biến đổi 5-10% phần đuôi (suffix, ngoặc [...], (...), hoặc vế sau |) theo đúng ngách.
 * 4. Không dùng form mẫu cứng nhắc hay rập khuôn.
 */
export function buildAiTitleRewritePrompt(
  originalTitle: string,
  niche?: string,
  competitorKeywords?: string[],
): string {
  const lang = detectTitleLanguage(originalTitle);
  const genre = detectGenre(originalTitle);
  const isMusic = genre === 'music';

  let languageRule =
    'English (100% in English. CRITICAL: NEVER output Vietnamese, Thai or mix languages)';
  if (lang === 'vi') {
    languageRule = 'Vietnamese (100% Tiếng Việt chuẩn. TUYỆT ĐỐI không pha tiếng Anh)';
  } else if (lang === 'th') {
    languageRule =
      'Thai (100% ภาษาไทย. CRITICAL: Output strictly in natural Thai. Do NOT mix English)';
  } else if (lang === 'lo') {
    languageRule =
      'Lao (100% ພາສາລາວ. CRITICAL: Output strictly in natural Lao. Do NOT mix English)';
  }

  const fewShot =
    lang === 'vi'
      ? isMusic
        ? {
            inputTitle: 'Waiting For You - MONO',
            niche: 'Nhạc / Remix',
            json: '{"variants":[{"formula":"Bản Phối Mới","title":"Waiting For You - MONO [Bản Phối Mới 2026]","estimatedCtr":"+42%","psychologicalTrigger":"Thu hút người nghe tìm kiếm âm hưởng hiện đại mới lạ"},{"formula":"Remix Bass Căng","title":"Waiting For You - MONO (Remix Bass Cực Căng)","estimatedCtr":"+48%","psychologicalTrigger":"Đánh trúng thị hiếu thích giai điệu sôi động bùng nổ"},{"formula":"Giai Điệu Chill","title":"Waiting For You - MONO | Nhạc Chill Thư Giãn","estimatedCtr":"+39%","psychologicalTrigger":"Phục vụ nhu cầu nghe thư giãn khi học tập làm việc"},{"formula":"Bản Chuẩn Gốc","title":"Waiting For You - MONO (Official Audio)","estimatedCtr":"+36%","psychologicalTrigger":"Tạo độ tin cậy về chất lượng âm thanh gốc chuẩn studio"},{"formula":"Tuyển Tập Hay Nhất","title":"Waiting For You - MONO [Tuyển Tập Hay Nhất 2026]","estimatedCtr":"+45%","psychologicalTrigger":"Tối ưu tìm kiếm theo xu hướng tuyển tập thịnh hành"}]}',
          }
        : {
            inputTitle: 'Cách làm bánh mì tại nhà giòn xốp',
            niche: 'Ẩm thực / Hướng dẫn',
            json: '{"variants":[{"formula":"Bí Quyết Thực Chiến","title":"Cách làm bánh mì tại nhà giòn xốp [Công Thức Bất Bại]","estimatedCtr":"+42%","psychologicalTrigger":"Khẳng định tỷ lệ thành công cao cho người làm"},{"formula":"Tiết Kiệm Thời Gian","title":"Cách làm bánh mì tại nhà giòn xốp (Nhanh Gọn Cực Dễ)","estimatedCtr":"+45%","psychologicalTrigger":"Giảm rào cản thao tác cho người bận rộn"},{"formula":"Chuẩn Vị Lò Nướng","title":"Cách làm bánh mì tại nhà giòn xốp | Chuẩn Vị Lò Nướng 2026","estimatedCtr":"+48%","psychologicalTrigger":"Đảm bảo chất lượng thành phẩm thơm ngon chuẩn vị"},{"formula":"Hướng Dẫn Chi Tiết","title":"Cách làm bánh mì tại nhà giòn xốp [Hướng Dẫn Từng Bước A-Z]","estimatedCtr":"+39%","psychologicalTrigger":"Cung cấp chi tiết đầy đủ không bỏ sót thao tác"},{"formula":"Giải Pháp Gia Đình","title":"Cách làm bánh mì tại nhà giòn xốp (Bằng Nồi Chiên Không Dầu)","estimatedCtr":"+46%","psychologicalTrigger":"Tận dụng thiết bị sẵn có trong căn bếp gia đình"}]}',
          }
      : isMusic
        ? {
            inputTitle: 'METAMORPHOSIS - INTERWORLD',
            niche: 'Music / Phonk',
            json: '{"variants":[{"formula":"Aesthetic Format","title":"METAMORPHOSIS - INTERWORLD [Slowed + Reverb]","estimatedCtr":"+42%","psychologicalTrigger":"Captures high-intent search for atmospheric slowed editions"},{"formula":"Bass Boosted","title":"METAMORPHOSIS - INTERWORLD [Bass Boosted Edition]","estimatedCtr":"+48%","psychologicalTrigger":"Appeals to listeners seeking intense low-end impact"},{"formula":"Curated Mix","title":"METAMORPHOSIS - INTERWORLD | Best Viral Phonk Mix 2026","estimatedCtr":"+40%","psychologicalTrigger":"Curated continuous viral phonk streaming"},{"formula":"Official Release","title":"METAMORPHOSIS - INTERWORLD (Official Audio Visualizer)","estimatedCtr":"+36%","psychologicalTrigger":"Establishes authentic studio quality and visualizer"},{"formula":"Workout Energy","title":"METAMORPHOSIS - INTERWORLD [Gym Workout Motivation]","estimatedCtr":"+45%","psychologicalTrigger":"Targeted algorithmic fitness and focus context"}]}',
          }
        : {
            inputTitle: 'How to Build a Custom Mechanical Keyboard',
            niche: 'Technology / Guide',
            json: '{"variants":[{"formula":"Beginner Friendly","title":"How to Build a Custom Mechanical Keyboard [Beginner Friendly Guide]","estimatedCtr":"+44%","psychologicalTrigger":"Lowers entry barrier for first-time builders"},{"formula":"Sound Profile Focus","title":"How to Build a Custom Mechanical Keyboard (Ultra Thocky Sound Test)","estimatedCtr":"+48%","psychologicalTrigger":"Appeals directly to sound profile enthusiasts"},{"formula":"Step-by-Step Blueprint","title":"How to Build a Custom Mechanical Keyboard | Step-by-Step Walkthrough","estimatedCtr":"+41%","psychologicalTrigger":"Clear roadmap ensuring flawless execution"},{"formula":"Budget Build","title":"How to Build a Custom Mechanical Keyboard [Under $100 Budget Build]","estimatedCtr":"+46%","psychologicalTrigger":"Attracts cost-conscious builders seeking value"},{"formula":"2026 Masterclass","title":"How to Build a Custom Mechanical Keyboard (2026 Edition)","estimatedCtr":"+43%","psychologicalTrigger":"Signals fresh, up-to-date components and tools"}]}',
          };

  return `### MANDATORY RULES (STRICT QWEN/SLM RULES-FIRST):
1. Output ONLY a valid, raw JSON object matching the exact schema below. No markdown fences (no \`\`\`json), no explanations.
2. PRESERVE 90-95% CORE TOPIC: Keep the original core title keywords intact at the beginning. NEVER rephrase or translate the main topic. NEVER add clickbait prefixes (do NOT prepend "Warning", "Stop doing this", "Why 90%...", "I tested...").
3. TRANSFORM ONLY 5-10% TAIL: Creatively transform ONLY the ending tail (suffix brackets [...], (...), or after "|"). Do NOT use rigid or boilerplate templates. Adapt each tail naturally to the niche (e.g. edition, sound style, guide clarity, 2026 freshness).
4. STRICT 100% LANGUAGE MATCH: Output language MUST be ${languageRule}. NEVER mix languages.
5. STRICT YOUTUBE STUDIO SAFETY: Total title length MUST NEVER exceed 95 characters.
6. Generate EXACTLY 5 diverse tail variants with non-repetitive formula names and psychological triggers.

### FEW-SHOT EXAMPLE:
Input:
- Original Title: "${fewShot.inputTitle}"
- Niche: "${fewShot.niche}"
Output:
${fewShot.json}

### ACTUAL TASK:
- Original Title: "${originalTitle}"
- Niche: "${niche || (isMusic ? 'Music' : 'General')}"
- Competitor Keywords: "${competitorKeywords?.join(', ') || ''}"

JSON Output:`;
}

/**
 * Hàm hỗ trợ biến đổi đuôi tiêu đề tức thì theo đúng quy tắc 90-95% Core + 5-10% Tail biến đổi.
 * Không dùng form mẫu cứng nhắc, bảo toàn 100% ngôn ngữ gốc và bám sát ngách.
 */
export function transformTitleTail(
  originalTitle: string,
  options?: {
    niche?: string;
    competitorKeywords?: string[];
    competitorTags?: string[];
    seed?: number;
  },
): GeneratedTitleVariant[] {
  const lang = detectTitleLanguage(originalTitle);
  const genre = detectGenre(originalTitle);
  return generateAllHookTitles(
    originalTitle,
    'all',
    options?.seed ?? 0,
    options?.competitorKeywords,
    options?.competitorTags,
    genre,
    lang,
  );
}
