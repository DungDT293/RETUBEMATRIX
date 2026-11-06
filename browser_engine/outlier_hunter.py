import os
import sys
import json
import time
import shutil
import subprocess
import statistics
import logging
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger("outlier_hunter")

def get_ytdlp_bin() -> str:
    """
    Tìm file thực thi yt-dlp theo thứ tự ưu tiên: Env -> PATH -> AppDir -> AppData -> Python Scripts.
    """
    if os.environ.get("YTDLP_BIN") and os.path.exists(os.environ["YTDLP_BIN"]):
        return os.environ["YTDLP_BIN"]

    found = shutil.which("yt-dlp")
    if found:
        return found

    engine_dir = os.path.dirname(os.path.abspath(__file__))
    app_root = os.path.dirname(engine_dir)
    py_root = os.path.dirname(sys.executable)
    py_app_root = os.path.dirname(py_root)

    candidates = [
        # 1. RETubeMatrix binaries in Tauri dev & build
        os.path.join(app_root, "src-tauri", "bin", "retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe"),
        os.path.join(app_root, "bin", "retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe"),
        os.path.join(app_root, "bin", "retubematrix-yt-dlp.exe"),
        os.path.join(app_root, "bin", "yt-dlp.exe"),
        os.path.join(app_root, "retubematrix-yt-dlp.exe"),
        os.path.join(app_root, "yt-dlp.exe"),
        os.path.join(py_app_root, "src-tauri", "bin", "retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe"),
        os.path.join(py_app_root, "bin", "retubematrix-yt-dlp-x86_64-pc-windows-msvc.exe"),
        os.path.join(py_app_root, "bin", "yt-dlp.exe"),
        os.path.join(py_app_root, "retubematrix-yt-dlp.exe"),
        os.path.join(py_app_root, "yt-dlp.exe"),
        # Legacy name fallbacks
        os.path.join(app_root, "bin", "youwee-yt-dlp-x86_64-pc-windows-msvc.exe"),
        os.path.join(py_app_root, "bin", "youwee-yt-dlp-x86_64-pc-windows-msvc.exe"),
        # 2. Python environment scripts
        os.path.join(sys.prefix, "Scripts", "yt-dlp.exe"),
        os.path.join(sys.prefix, "bin", "yt-dlp"),
        os.path.join(py_root, "Scripts", "yt-dlp.exe"),
        # 3. User AppData
        os.path.expandvars(r"%APPDATA%\com.retubematrix.app\bin\yt-dlp.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\com.retubematrix.app\bin\yt-dlp.exe"),
        os.path.expandvars(r"%APPDATA%\com.vanloctech.retubematrix\bin\yt-dlp.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\com.vanloctech.retubematrix\bin\yt-dlp.exe"),
        os.path.expandvars(r"%APPDATA%\com.vanloctech.youwee\bin\yt-dlp.exe"),
        os.path.expandvars(r"%APPDATA%\com.vanloctech.youwee\bin\yt-dlp-stable.exe"),
        os.path.expandvars(r"%APPDATA%\com.vanloctech.youwee\bin\yt-dlp-nightly.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\com.vanloctech.youwee\bin\yt-dlp.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return "yt-dlp"

def parse_subscribers(val) -> int:
    """
    Parse chính xác số lượng Subscribers từ số nguyên hoặc chuỗi định dạng (ví dụ '340K', '3.4M', '49N').
    Tránh lỗi coi kênh 340K sub thành 340 sub.
    """
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip().upper()
    if not s:
        return 0
    import re
    m = re.search(r"([\d\.,]+)\s*([KkMmBbNn]|TRIỆU|NGHÌN|TR|NG)?", s)
    if not m:
        try:
            return safe_int(re.sub(r"[^\d]", "", s), 0)
        except Exception:
            return 0
    num_str = m.group(1).replace(",", "")
    unit = (m.group(2) or "").upper()
    try:
        base = float(num_str)
    except ValueError:
        return 0
    if unit in ("K", "N", "NGHÌN", "NG"):
        return int(base * 1_000)
    if unit in ("M", "TRIỆU", "TR"):
        return int(base * 1_000_000)
    if unit in ("B", "TỶ"):
        return int(base * 1_000_000_000)
    return int(base)

def safe_int(val, default: int = 0) -> int:
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default

def safe_float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

COPYRIGHT_BLACKLIST = [
    # Gameshow & Truyền hình thực tế Việt Nam
    "running man", "chạy ngay đi", "2 ngày 1 đêm", "anh trai say hi", 
    "anh trai vượt ngàn chông gai", "vượt ngàn chông gai", "rap việt", 
    "ca sĩ mặt nạ", "mái ấm gia đình việt", "người ấy là ai", "hành trình rực rỡ",
    "ơn giời cậu đây rồi", "kẹp chả", "sao nhập ngũ", "nhà trọ destiny",
    "chiến binh tí hon", "mẹ vắng nhà ba là siêu nhân", "cuộc đua kỳ thú",
    
    # Đài truyền hình, Nhà sản xuất & Nền tảng OTT lớn
    "vtv", "htv", "thvl", "vieon", "vie channel", "fpt play", "k+", "kplus", "k plus", "đông tây promotion", 
    "đông tây", "forest studio", "viva network", "yeah1", "cát tiên sa", "cat tien sa", "mcve",
    
    # MV & Âm nhạc chính thống
    "official mv", "official music video", "official video", "mv official", "lyric video", 
    "m/v", "teasing", "trailer chính thức", "full tập", "tập full", "son tung", "sơn tùng", "m-tp",
    
    # Thể thao & Bóng đá trực tiếp
    "trực tiếp bóng đá", "highlight bóng đá", "ngoại hạng anh", "v-league", "champions league", "world cup",

    # Quốc tế / Hollywood / OTT lớn (Bảo vệ luồng săn View Ngoại)
    "netflix", "warner bros", "marvel entertainment", "marvel trailer", "marvel", "walt disney", "disney", "paramount pictures",
    "universal pictures", "sony pictures", "20th century studios", "hbo", "bbc", "peacock", "hulu",
    "official trailer", "teaser trailer", "trailer", "movie clip", "premier league", "nba", "ufc", "wwe"
]

def is_reup_safe_and_valid_small_channel(video: Dict, settings: Dict) -> Tuple[bool, str]:
    """
    5 LỚP BẢO VỆ CHỐNG BẢN QUYỀN NẶNG & CHỐNG KÊNH LỚN / LỖI PARSE SUB
    """
    title_lower = (video.get("title") or "").lower()
    channel_lower = (video.get("channel") or video.get("uploader") or video.get("channel_name") or "").lower()
    duration = safe_int(video.get("duration"), 0)
    views = safe_int(video.get("view_count") if video.get("view_count") is not None else video.get("views"), 0)
    raw_subs_candidate = video.get("channel_follower_count")
    if raw_subs_candidate is None:
        raw_subs_candidate = video.get("subscribers")
    raw_subs = safe_int(raw_subs_candidate, -1)
    is_live = bool(video.get("is_live", False) or video.get("was_live", False))

    # 1. CHỐT CHẶN 1: TỪ KHÓA GAMESHOW / TRUYỀN HÌNH / NHÀ ĐÀI / MV CHÍNH THỐNG
    for bad_word in COPYRIGHT_BLACKLIST:
        if bad_word in title_lower or bad_word in channel_lower:
            return False, f"Dính Blacklist bản quyền nặng: '{bad_word}'"

    # 2. CHỐT CHẶN 2: CHẶN KÊNH CÓ DẤU TÍCH XÁC MINH CỦA KÊNH QUÁ LỚN (>200K SUB)
    if video.get("channel_is_verified") is True and raw_subs > 200000:
        return False, f"Loại bỏ: Kênh có tích Xác minh lớn ({raw_subs:,} subs > 200K)"

    # 3. CHỐT CHẶN 3: PHÒNG VỆ SUB & LỖI PARSE (Tránh biến kênh triệu sub thành 340 sub)
    if raw_subs <= 0:
        return False, "Loại bỏ: Không lấy được số Subscriber thật của kênh (Kênh ẩn sub hoặc thiếu dữ liệu)"
    
    # Nếu video > 500k views mà báo kênh < 1.000 sub -> 99.9% là lỗi parse chữ K/M/N (ví dụ 340K/340N -> 340)
    if views > 500_000 and raw_subs < 1_000:
        return False, f"Loại bỏ: Nghi vấn lỗi parse Sub ({raw_subs} subs nhưng {views:,} views)"

    # Nếu video > 100k views mà báo kênh < 100 sub -> Kênh bất thường hoặc lỗi parse
    if views > 100_000 and raw_subs < 100:
        return False, f"Loại bỏ: Kênh bất thường ({raw_subs} subs nhưng {views:,} views)"

    # Kênh vượt quá Max Subscribers trong cấu hình (Linh hoạt: mặc định 150k subs, nếu ratio >= 3.0x cho phép tới 250k)
    base_max_subs = safe_int(settings.get("max_subscribers"), 150000)
    ratio_sub = views / max(raw_subs, 1)
    max_subs = 250000 if ratio_sub >= 3.0 else base_max_subs
    if raw_subs > max_subs:
        return False, f"Kênh quá lớn: {raw_subs:,} subs (ngưỡng tối đa: {max_subs:,})"

    # 4. CHỐT CHẶN 4: GIỚI HẠN THỜI LƯỢNG (Chặn Gameshow / Livestream / Phim siêu dài > 3 tiếng)
    if is_live:
        return False, "Loại bỏ: Video Live Stream"

    # Cho phép video tổng hợp công thức, kiến thức, podcast, lofi dài tối đa 3 tiếng (180 phút)
    max_dur = safe_int(settings.get("max_duration"), 10800)
    if duration > max_dur:
        return False, f"Thời lượng quá dài: {duration//60} phút (> {max_dur//60} phút - Dễ dính Gameshow/Phim dài tập)"

    min_dur = safe_int(settings.get("min_duration"), 60)
    if duration < min_dur:
        return False, f"Thời lượng quá ngắn: {duration}s (< {min_dur}s)"

    # 5. CHỐT CHẶN 5: KHỐNG CHẾ TRẦN VIEW (Chặn Bom Tấn Truyền Thông/Đài Lớn >8 Triệu Views)
    # Kênh nhỏ có video bứt phá 1M - 4M views là siêu phẩm cực kỳ giá trị để Reup/học hỏi cấu trúc.
    if views > 8_000_000:
        return False, f"View quá khủng ({views:,}) của Đài lớn/Ngôi sao, không an toàn Reup"

    return True, "An toàn"

def evaluate_outlier_candidate(
    video: Dict, 
    channel_recent_videos: List[Dict], 
    settings: Dict
) -> Tuple[Optional[Dict], str]:
    """
    Đánh giá một video ứng viên dựa trên cấu hình động từ bảng outlier_hunter_settings.
    Xử lý triệt để lỗi Self-Contamination (loại trừ chính video đang xét và video <180s).
    """
    # 0. Kiếm tra 5 Lớp Giáp Bản Quyền & Kênh Nhỏ
    safe, reason = is_reup_safe_and_valid_small_channel(video, settings)
    if not safe:
        return None, reason

    video_id = str(video.get("id") or "")
    views = safe_int(video.get("view_count") if video.get("view_count") is not None else video.get("views"), 0)
    raw_subs_cand = video.get("channel_follower_count") if video.get("channel_follower_count") is not None else video.get("subscribers")
    raw_subs = safe_int(raw_subs_cand, 0)
    subs_floor = max(raw_subs, 500)
    hours = max(safe_float(video.get("hours_published"), 1.0), 1.0)
    likes = safe_int(video.get("like_count") if video.get("like_count") is not None else video.get("likes"), 0)
    comments = safe_int(video.get("comment_count") if video.get("comment_count") is not None else video.get("comments"), 0)
    min_dur = safe_int(settings.get("min_duration"), 60)

    # Khung giờ: Cho phép các video bứt phá ngách mọi thời điểm (mặc định mở rộng)
    max_hours = safe_float(settings.get("max_hours_published"), 87600.0)
    if hours < 1.0 or hours > max_hours:
        return None, f"Ngoài khung giờ: Hours={hours:.1f}h"

    # Quy mô cơ sở (Kênh nhỏ - View lớn)
    min_views = safe_int(settings.get("min_views"), 3000)
    if views < min_views:
        return None, f"Views={views:,} (<{min_views:,})"

    # Tỷ lệ Đột biến Sub
    sub_outlier = views / subs_floor
    min_sub_out = safe_float(settings.get("min_sub_outlier"), 1.8)
    if sub_outlier < min_sub_out:
        return None, f"Chưa đạt Sub Outlier: {sub_outlier:.1f}x (<{min_sub_out}x)"

    # Bộ lọc Chống Buff View & Google Ads (Organic Engagement)
    engagement_rate = (likes + comments) / views if views > 0 else 0.0
    min_eng = safe_float(settings.get("min_engagement_rate"), 0.002)
    min_cmt = safe_int(settings.get("min_comments"), 2)
    if engagement_rate < min_eng and comments < min_cmt:
        return None, f"Nghi vấn Ads/Buff: Engagement={engagement_rate*100:.2f}%, Cmt={comments}"

    # Vận tốc View Trung bình (VPH)
    avg_vph = views / hours
    min_vph = safe_float(settings.get("min_vph"), 0.5)
    if avg_vph < min_vph and sub_outlier < 2.5:
        return None, f"Vận tốc view yếu: {avg_vph:.1f} VPH (<{min_vph} VPH)"

    # QUAN TRỌNG: Loại trừ chính video đang xét và các video Shorts (<min_dur) khỏi mẫu tính Median
    valid_recent_views = [
        safe_int(v.get("view_count"), 0) for v in channel_recent_videos
        if str(v.get("id")) != video_id 
        and safe_int(v.get("duration"), 0) >= min_dur
        and v.get("view_count") is not None
    ][:15]

    # Nếu không lấy được baseline của kênh (kênh mới chỉ có 1 video nổ đầu tiên)
    # Tận dụng subs_floor làm baseline thay vì vứt bỏ những 'viên ngọc' hiếm có này
    if not valid_recent_views:
        baseline_median = subs_floor
    else:
        baseline_median = int(statistics.median(valid_recent_views))
    
    baseline_outlier = views / max(baseline_median, 500)
    min_base_out = safe_float(settings.get("min_baseline_outlier"), 1.8)

    if baseline_outlier >= min_base_out or sub_outlier >= 2.2:
        now_ts = int(time.time())
        initial_history = [{"ts": now_ts, "views": views, "vph": round(avg_vph, 1)}]
        
        return {
            "sub_outlier_ratio": round(sub_outlier, 1),
            "baseline_median_views": baseline_median,
            "baseline_outlier_ratio": round(baseline_outlier, 1),
            "avg_vph": round(avg_vph, 1),
            "current_vph": round(avg_vph, 1),
            "momentum_score": 1.0,
            "engagement_rate": round(engagement_rate, 4),
            "view_history": json.dumps(initial_history),
            "status": "discovered"
        }, "ĐẠT CHUẨN ĐỘT BIẾN KÉP (QUALIFIED)"

    return None, f"Chưa đạt Baseline Outlier: {baseline_outlier:.1f}x (<{min_base_out}x)"


def update_momentum_radar(db_record: Dict, current_views: int, current_hours_published: float) -> Dict:
    """
    Hàm chạy định kỳ cho các video trong Watchlist để tính Gia tốc (Momentum)
    và cung cấp dữ liệu chuỗi thời gian vẽ Sparkline trên UI.
    """
    now_ts = int(time.time())
    history: List[Dict] = []
    try:
        raw_hist = db_record.get("view_history")
        if raw_hist:
            history = json.loads(raw_hist)
    except Exception:
        history = []
    
    target_ts = now_ts - (6 * 3600)
    ref_point = history[0] if history else {"ts": now_ts - 3600, "views": db_record.get("views", current_views)}
    
    for point in reversed(history):
        if point.get("ts", 0) <= target_ts:
            ref_point = point
            break

    elapsed_hours = max((now_ts - ref_point.get("ts", now_ts)) / 3600.0, 0.5)
    view_delta = max(current_views - ref_point.get("views", current_views), 0)
    
    current_vph = view_delta / elapsed_hours
    avg_vph = current_views / max(current_hours_published, 1.0)
    momentum_score = current_vph / max(avg_vph, 1.0)

    history.append({
        "ts": now_ts,
        "views": current_views,
        "vph": round(current_vph, 1)
    })
    if len(history) > 24:
        history = history[-24:]

    return {
        "views": current_views,
        "hours_published": round(current_hours_published, 2),
        "avg_vph": round(avg_vph, 1),
        "current_vph": round(current_vph, 1),
        "momentum_score": round(momentum_score, 2),
        "view_history": json.dumps(history),
        "last_ping_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }


def fetch_channel_recent_videos(channel_url: str, limit: int = 15) -> List[Dict]:
    """
    Lấy danh sách 15 video gần nhất của kênh mà không tải stream (nhẹ và nhanh).
    """
    if not channel_url:
        return []
    target = channel_url.rstrip("/") + "/videos"
    ytdlp_bin = get_ytdlp_bin()
    cmd = [
        ytdlp_bin,
        "--dump-json",
        "--flat-playlist",
        "--playlist-end", str(limit + 5),
        "--no-warnings",
        target
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=5)
        videos = []
        for line in res.stdout.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    data = json.loads(line)
                    videos.append({
                        "id": data.get("id"),
                        "view_count": data.get("view_count") or 0,
                        "duration": data.get("duration") or 0,
                    })
                except Exception:
                    pass
        return videos
    except Exception as e:
        logger.warning(f"Lỗi lấy video gần nhất của kênh {channel_url}: {e}")
        return []


# -------------------------------------------------------------
# REPO INTEGRATIONS: AURORA, OPEN-TUBE-SEO, PHILLIPMEX, VIRALMINT
# -------------------------------------------------------------

DEMAND_TRIGGERS = [
    # Tiếng Việt
    "phần 2", "phan 2", "làm tiếp", "lam tiep", "ra tiếp", "ra tiep",
    "hóng tập", "hong tap", "tập tiếp", "hướng dẫn chi tiết", "huong dan",
    "chia sẻ thêm", "mong ad làm", "xin link", "cầu xin", "làm về",
    "bao giờ có phần", "khi nào ra", "hóng phần", "ra thêm", "hay quá làm thêm",
    # Tiếng Anh
    "part 2", "part two", "please make", "need more", "waiting for",
    "tutorial on", "make a video about", "next episode"
]

def analyze_audience_demand_signal(comments: List[str]) -> Dict:
    """
    Phân tích tín hiệu nhu cầu / cầu xin nội dung từ bình luận khán giả (phillipmex/yt-outlier-mcp).
    """
    if not comments:
        return {
            "demand_score": 50,
            "demand_level": "Chưa có tín hiệu",
            "triggers_found": [],
            "top_demand_quotes": []
        }
    
    matched_quotes = []
    triggers_found = set()
    
    for c in comments:
        c_lower = str(c).lower()
        for trig in DEMAND_TRIGGERS:
            if trig in c_lower:
                triggers_found.add(trig)
                matched_quotes.append(str(c).strip())
                break
    
    ratio = len(matched_quotes) / max(len(comments), 1)
    score = min(int(ratio * 100 * 1.5) + len(triggers_found) * 12, 100)
    score = max(score, 30) if triggers_found else max(int(ratio * 100), 20)
    
    level = "Cực Cao (Viral Demand)" if score >= 75 else ("Cao (Nhu cầu lớn)" if score >= 45 else "Bình thường")
    
    return {
        "demand_score": score,
        "demand_level": level,
        "triggers_found": list(triggers_found)[:6],
        "top_demand_quotes": matched_quotes[:3]
    }


def find_goldmines(seed: str) -> List[Dict]:
    """
    Kỹ thuật Recursive Autocomplete (bvbvbv54/Aurora & BizMapper/Open-Tube-SEO):
    Vét cạn gợi ý tìm kiếm thời gian thực từ YouTube để tìm từ khóa ngách Cầu Cao - Cung Thấp.
    """
    clean_seed = (seed or "").strip().lower()
    if not clean_seed:
        return []

    import urllib.parse
    import urllib.request
    try:
        import requests
    except ImportError:
        requests = None

    # 1. Hậu tố Alphabet a-z (Thanh gợi ý YouTube Alphabet)
    alphabet_suffixes = [f"{clean_seed} {chr(c)}" for c in range(ord('a'), ord('z')+1)]
    # 2. Tiền tố Alphabet a-z
    alphabet_prefixes = [f"{chr(c)} {clean_seed}" for c in range(ord('a'), ord('m')+1)]
    # 3. Mẫu câu hỏi ý định người xem (Search Intent)
    intent_queries = [
        f"cách {clean_seed}", f"hướng dẫn {clean_seed}", f"tại sao {clean_seed}",
        f"review {clean_seed}", f"kinh nghiệm {clean_seed}", f"ngách {clean_seed}"
    ]

    variants = [clean_seed, f"{clean_seed} "] + alphabet_suffixes + alphabet_prefixes + intent_queries

    seen = set()
    results = []

    for var in variants:
        try:
            url = "https://suggestqueries.google.com/complete/search"
            data = None
            if requests:
                try:
                    res = requests.get(url, params={"client": "firefox", "ds": "yt", "q": var}, timeout=3)
                    if res.status_code == 200:
                        data = res.json()
                except Exception:
                    data = None

            if data is None:
                query_str = urllib.parse.urlencode({"client": "firefox", "ds": "yt", "q": var})
                req = urllib.request.Request(
                    f"{url}?{query_str}",
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8", errors="ignore"))

            if data and len(data) >= 2 and isinstance(data[1], list):
                for rank, kw in enumerate(data[1]):
                    kw_str = str(kw).strip()
                    if kw_str and kw_str not in seen:
                        seen.add(kw_str)
                        word_count = len(kw_str.split())
                        # Từ khóa càng dài thì ngách càng hẹp, ít cạnh tranh, cơ hội bứt phá càng cao
                        spec_score = min(word_count * 12, 50)
                        rank_score = max(50 - (rank * 4), 10)
                        opp_score = min(spec_score + rank_score, 100)
                        
                        # Đánh giá mức độ cạnh tranh & Content Gap theo phương pháp
                        if word_count >= 5:
                            competition = "Rất Thấp (Ngách Siêu Nhỏ)"
                            content_gap = "Rất Cao (Nhu cầu lớn, ít video - Khuyên làm ngay)"
                            badge = "NGÁCH VÀNG"
                        elif word_count >= 3:
                            competition = "Thấp / Vừa (Ngách Tiềm Năng)"
                            content_gap = "Cao (Đang lên xu hướng)"
                            badge = "TIỀM NĂNG"
                        else:
                            competition = "Cao (Từ Khóa Rộng)"
                            content_gap = "Trung bình / Bão hòa"
                            badge = "PHỔ THÔNG"

                        results.append({
                            "keyword": kw_str,
                            "rank": rank + 1,
                            "word_count": word_count,
                            "opportunity_score": opp_score,
                            "competition": competition,
                            "content_gap": content_gap,
                            "badge": badge
                        })
        except Exception:
            pass
        if len(results) >= 60:
            break

    results.sort(key=lambda x: (x["word_count"] >= 3, x["opportunity_score"]), reverse=True)
    return results[:40]


def analyze_competitor_channel(channel_url: str, sort_by: str = "popular") -> List[Dict]:
    """
    Phân tích kênh đối thủ theo phương pháp thực chiến:
    Truy cập tab video của kênh đối thủ, sắp xếp theo 'Phổ biến' (Popular) hoặc 'Mới nhất'.
    Trích xuất: lượt xem, thời gian đăng, tính toán VPH (lượt xem theo giờ), điểm từ khóa, tags.
    """
    raw_url = (channel_url or "").strip()
    if not raw_url:
        return []

    # 1. Chuẩn hóa URL kênh đối thủ (hỗ trợ @handle, URL có tham số ?si=..., hoặc thiếu https://)
    if raw_url.startswith("@"):
        clean_url = f"https://www.youtube.com/{raw_url}"
    elif not (raw_url.startswith("http://") or raw_url.startswith("https://")):
        if "youtube.com" in raw_url or "youtu.be" in raw_url:
            clean_url = f"https://{raw_url}"
        elif raw_url.isalnum():
            clean_url = f"https://www.youtube.com/@{raw_url}"
        else:
            clean_url = f"https://www.youtube.com/{raw_url}"
    else:
        clean_url = raw_url

    # Bỏ query parameters (?si=..., ?sub_confirmation=...)
    if "?" in clean_url:
        clean_url = clean_url.split("?")[0]
    clean_url = clean_url.rstrip("/")

    # Loại bỏ subtab cũ nếu có để trỏ đúng /videos
    for sub in ["/featured", "/community", "/about", "/playlists", "/streams", "/shorts"]:
        if clean_url.endswith(sub):
            clean_url = clean_url[:-len(sub)]
            break

    if not clean_url.endswith("/videos"):
        target_url = clean_url + "/videos"
    else:
        target_url = clean_url

    if sort_by == "popular":
        target_url += "?view=0&sort=p"
    else:
        target_url += "?view=0&sort=dd"

    ytdlp_bin = get_ytdlp_bin()
    if not os.path.exists(ytdlp_bin) and not shutil.which(ytdlp_bin):
        raise RuntimeError(f"Không tìm thấy công cụ yt-dlp tại: {ytdlp_bin}")

    cmd = [
        ytdlp_bin,
        "--dump-json",
        "--flat-playlist",
        "--playlist-end", "20",
        "--no-warnings",
        target_url
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=35)
    except Exception as e:
        logger.error(f"Lỗi thực thi yt-dlp khi phân tích kênh đối thủ {channel_url}: {e}")
        raise RuntimeError(f"Lỗi chạy yt-dlp: {e}")

    now_ts = int(time.time())
    videos = []

    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    for idx, line in enumerate(lines):
        if not (line.startswith("{") and line.endswith("}")):
            continue
        try:
            raw = json.loads(line)
        except Exception:
            continue

        vid_id = raw.get("id")
        if not vid_id:
            continue

        views = safe_int(raw.get("view_count"), 0)
        upload_ts = raw.get("timestamp")
        if not upload_ts and raw.get("upload_date"):
            try:
                t_str = raw.get("upload_date")
                t_struct = time.strptime(t_str, "%Y%m%d")
                upload_ts = int(time.mktime(t_struct))
            except Exception:
                upload_ts = None

        if upload_ts:
            hours_published = max((now_ts - upload_ts) / 3600.0, 1.0)
        elif sort_by == "latest":
            # Ước lượng khoảng cách hợp lý cho danh sách video mới nhất
            hours_published = max((idx + 1) * 24.0, 12.0)
        else:
            # Video phổ biến nhất (all-time): tích lũy qua nhiều tháng
            hours_published = max(720.0, 24.0 * (45 + idx * 15))

        vph = round(views / hours_published, 1)

        title = raw.get("title") or "Untitled Video"
        words = title.split()

        # Tính điểm SEO thông minh thực tế (từ 50 - 98)
        base_score = 45
        len_bonus = 20 if 30 <= len(title) <= 80 else (10 if len(title) > 80 else 5)
        word_bonus = 15 if 5 <= len(words) <= 14 else 8
        num_bonus = 10 if any(char.isdigit() for char in title) else 0
        vph_bonus = 10 if vph > 100 else (5 if vph > 20 else 0)
        keyword_score = min(base_score + len_bonus + word_bonus + num_bonus + vph_bonus, 98)

        videos.append({
            "id": vid_id,
            "title": title,
            "thumbnail_url": raw.get("thumbnail") or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={vid_id}",
            "views": views,
            "duration": safe_int(raw.get("duration"), 0),
            "hours_published": round(hours_published, 1),
            "vph": vph,
            "keyword_score": keyword_score,
            "uploader": raw.get("uploader") or raw.get("channel") or raw.get("playlist_channel") or "Đối thủ",
        })

    if not videos and res.returncode != 0:
        err_hint = res.stderr.strip() if res.stderr else "Không tìm thấy video nào trên kênh đối thủ"
        raise RuntimeError(f"Không thể tải video từ kênh đối thủ: {err_hint[:200]}")

    if sort_by == "popular":
        videos.sort(key=lambda x: x["views"], reverse=True)
    else:
        videos.sort(key=lambda x: x["hours_published"])

    return videos[:15]


def _extract_snippet_text(s) -> str:
    if hasattr(s, "text"):
        return str(getattr(s, "text") or "").strip()
    if isinstance(s, dict):
        return str(s.get("text") or "").strip()
    return str(s).strip()

def _extract_snippet_start(s) -> float:
    if hasattr(s, "start"):
        return safe_float(getattr(s, "start"), 0.0)
    if isinstance(s, dict):
        return safe_float(s.get("start"), 0.0)
    return 0.0


def analyze_video_hook_and_transcript(video_id: str) -> Dict:
    """
    Trích xuất Hook 30 giây đầu và dàn ý kịch bản (ViralMint & Open-Tube-SEO).
    """
    clean_id = (video_id or "").strip()
    if not clean_id:
        return {"success": False, "error": "Thiếu video_id"}

    snippets = []
    blocked_error = None
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        try:
            snippets = api.fetch(clean_id, languages=['vi', 'en'])
        except Exception as e1:
            err_str1 = str(e1).lower()
            if "blocked" in err_str1 or "429" in err_str1 or "too many" in err_str1:
                blocked_error = f"IP hiện tại bị YouTube giới hạn truy vấn phụ đề (RequestBlocked/429): {e1}"
            else:
                try:
                    transcript_list = api.list(clean_id)
                    best_t = None
                    for lang in ['vi', 'en']:
                        try:
                            best_t = transcript_list.find_transcript([lang])
                            break
                        except Exception:
                            pass
                    if not best_t:
                        for t in transcript_list:
                            best_t = t
                            break
                    if best_t:
                        snippets = best_t.fetch()
                except Exception as e2:
                    err_str2 = str(e2).lower()
                    if "blocked" in err_str2 or "429" in err_str2 or "too many" in err_str2:
                        blocked_error = f"IP hiện tại bị YouTube giới hạn truy vấn phụ đề (RequestBlocked/429): {e2}"
                    snippets = []
    except Exception as e:
        logger.warning(f"Lỗi gọi youtube_transcript_api cho video {clean_id}: {e}")
        err_str = str(e).lower()
        if "blocked" in err_str or "429" in err_str or "too many" in err_str:
            blocked_error = f"IP hiện tại bị YouTube giới hạn truy vấn phụ đề (RequestBlocked/429): {e}"
        snippets = []

    if not snippets:
        if blocked_error:
            preview_msg = "Tạm thời không thể tải phụ đề do YouTube giới hạn kết nối từ IP này (Request Blocked / Rate Limit 429). Vui lòng thử lại sau hoặc kết nối Proxy."
        else:
            preview_msg = "Video này không có phụ đề công khai (CC/Transcript)."
        return {
            "success": True,
            "has_transcript": False,
            "hook_30s": "",
            "full_transcript_preview": preview_msg,
            "error_detail": blocked_error,
            "key_points": []
        }

    # Gom các câu thoại trong 35 giây đầu
    hook_parts = []
    full_parts = []
    for s in snippets:
        txt = _extract_snippet_text(s)
        st = _extract_snippet_start(s)
        if txt:
            full_parts.append(txt)
            if st <= 35.0:
                hook_parts.append(txt)

    hook_30s = " ".join(hook_parts)
    full_text = " ".join(full_parts)

    total_len = len(snippets)
    step = max(total_len // 4, 1)
    key_points = []
    for i in range(0, min(total_len, step * 4), step):
        s = snippets[i]
        st = _extract_snippet_start(s)
        mins = int(st // 60)
        secs = int(st % 60)
        txt = _extract_snippet_text(s)
        if txt:
            key_points.append({
                "timestamp": f"{mins:02d}:{secs:02d}",
                "text": txt
            })

    return {
        "success": True,
        "has_transcript": True,
        "hook_30s": hook_30s,
        "full_transcript_preview": full_text[:1200] + ("..." if len(full_text) > 1200 else ""),
        "total_words": len(full_text.split()),
        "key_points": key_points[:5]
    }


IKIGAI_GOLDEN_NICHES = [
    {"name": "Nấu ăn 1 mình", "query": "nấu ăn cho người ở 1 mình", "category": "Nhóm 3: View Ngoại / Dễ Làm"},
    {"name": "Món sinh viên tiết kiệm", "query": "món ăn sinh viên tiết kiệm", "category": "Nhóm 3: View Ngoại / Dễ Làm"},
    {"name": "Tài chính cá nhân", "query": "quản lý tài chính cá nhân", "category": "Nhóm 1: CPM Cao / Giáo Dục"},
    {"name": "Công nghệ & AI Tools", "query": "công cụ ai kiếm tiền", "category": "Nhóm 1: CPM Cao / Giáo Dục"},
    {"name": "Nhạc Lofi Chill", "query": "nhạc lofi chill học bài", "category": "Nhóm 2: View Khủng / Dễ Scale"},
    {"name": "ASMR Satisfying", "query": "asmr satisfying âm thanh thư giãn", "category": "Nhóm 2: View Khủng / Dễ Scale"},
    {"name": "Nhạc nền BGM không bản quyền", "query": "nhạc nền no copyright bgm", "category": "Nhóm 3: View Ngoại / Dễ Làm"},
]


def _scan_single_query(
    query_text: str,
    niche_label: str,
    settings: Dict,
    channel_cache: Dict[str, List[Dict]],
    limit: int = 15
) -> List[Dict]:
    ytdlp_bin = get_ytdlp_bin()
    if not shutil.which(ytdlp_bin) and not os.path.exists(ytdlp_bin):
        raise FileNotFoundError(f"Không tìm thấy file thực thi yt-dlp tại '{ytdlp_bin}'.")

    cmd = [
        ytdlp_bin,
        "--dump-json",
        "--playlist-end", str(limit),
        "--no-warnings",
        f"ytsearch{limit}:{query_text}"
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=45)
    except Exception as e:
        logger.error(f"Lỗi chạy yt-dlp cho '{query_text}': {e}")
        return []

    discovered = []
    now_ts = int(time.time())

    for line in res.stdout.splitlines():
        line = line.strip()
        if not (line.startswith("{") and line.endswith("}")):
            continue
        try:
            raw = json.loads(line)
        except Exception:
            continue

        vid_id = raw.get("id")
        if not vid_id:
            continue

        upload_ts = raw.get("timestamp")
        if not upload_ts and raw.get("upload_date"):
            try:
                t_str = raw.get("upload_date")
                t_struct = time.strptime(t_str, "%Y%m%d")
                upload_ts = int(time.mktime(t_struct))
            except Exception:
                upload_ts = now_ts - 86400

        upload_ts = upload_ts or (now_ts - 86400)
        hours_published = max((now_ts - upload_ts) / 3600.0, 1.0)

        raw_subs_cand = raw.get("channel_follower_count")
        if raw_subs_cand is None:
            raw_subs_cand = raw.get("subscribers") or raw.get("uploader_subscribers") or raw.get("channel_subscribers")
        parsed_subs = parse_subscribers(raw_subs_cand)

        video_candidate = {
            "id": vid_id,
            "title": raw.get("title") or "",
            "thumbnail_url": raw.get("thumbnail") or f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg",
            "channel_id": raw.get("channel_id") or "",
            "channel_name": raw.get("channel") or raw.get("uploader") or "YouTube Creator",
            "channel_url": raw.get("channel_url") or "",
            "channel_is_verified": bool(raw.get("channel_is_verified", False)),
            "subscribers": parsed_subs,
            "channel_follower_count": parsed_subs,
            "views": safe_int(raw.get("view_count"), 0),
            "view_count": safe_int(raw.get("view_count"), 0),
            "likes": safe_int(raw.get("like_count"), 0),
            "like_count": safe_int(raw.get("like_count"), 0),
            "comments": safe_int(raw.get("comment_count"), 0),
            "comment_count": safe_int(raw.get("comment_count"), 0),
            "duration": safe_int(raw.get("duration"), 0),
            "upload_timestamp": upload_ts,
            "hours_published": hours_published,
            "is_live": bool(raw.get("is_live", False) or raw.get("was_live", False)),
            "was_live": bool(raw.get("was_live", False)),
        }

        # 0. Chốt chặn bảo vệ bản quyền & kênh nhỏ
        safe, safe_reason = is_reup_safe_and_valid_small_channel(video_candidate, settings)
        if not safe:
            logger.debug(f"Bỏ qua '{video_candidate['title'][:40]}': {safe_reason}")
            continue

        # Sơ tuyển nhanh (Linh hoạt cho cả video mới nổ & nội dung Evergreen):
        max_hours = safe_float(settings.get("max_hours_published"), 87600.0)
        if hours_published < 1.0 or hours_published > max_hours:
            continue

        min_views = int(settings.get("min_views", 3000))
        if video_candidate["views"] < min_views:
            continue

        subs_floor = max(video_candidate["subscribers"], 300)
        sub_outlier = video_candidate["views"] / subs_floor
        min_sub_out = float(settings.get("min_sub_outlier", 1.8))
        if sub_outlier < min_sub_out:
            continue

        # Đạt sơ lọc -> Tải baseline kênh (chỉ fetch khi sub_outlier cận biên < 2.0x để tăng tốc độ quét)
        ch_url = video_candidate["channel_url"]
        recent_videos = []
        if ch_url and sub_outlier < 2.0:
            if ch_url in channel_cache:
                recent_videos = channel_cache[ch_url]
            else:
                try:
                    recent_videos = fetch_channel_recent_videos(ch_url, limit=8)
                    channel_cache[ch_url] = recent_videos
                except Exception:
                    recent_videos = []

        evaluation, reason = evaluate_outlier_candidate(video_candidate, recent_videos, settings)
        if evaluation:
            logger.info(f" [OUTLIER DISCOVERED] '{video_candidate['title']}' | Niche: {niche_label} | Sub: {video_candidate['subscribers']} | View: {video_candidate['views']} | SubRatio: {evaluation['sub_outlier_ratio']}x")
            
            auto_dl = settings.get("auto_download", False)
            init_status = "discovered"
            if auto_dl and (evaluation["momentum_score"] >= 1.15 or evaluation["baseline_outlier_ratio"] >= 15.0):
                init_status = "watchlist"

            outlier_record = {
                "id": vid_id,
                "niche": niche_label,
                "title": video_candidate["title"],
                "thumbnail_url": video_candidate["thumbnail_url"],
                "channel_id": video_candidate["channel_id"],
                "channel_name": video_candidate["channel_name"],
                "subscribers": video_candidate["subscribers"],
                "views": video_candidate["views"],
                "likes": video_candidate["likes"],
                "comments": video_candidate["comments"],
                "duration": video_candidate["duration"],
                "upload_timestamp": video_candidate["upload_timestamp"],
                "hours_published": round(video_candidate["hours_published"], 2),
                "avg_vph": evaluation["avg_vph"],
                "current_vph": evaluation["current_vph"],
                "momentum_score": evaluation["momentum_score"],
                "sub_outlier_ratio": evaluation["sub_outlier_ratio"],
                "baseline_median_views": evaluation["baseline_median_views"],
                "baseline_outlier_ratio": evaluation["baseline_outlier_ratio"],
                "engagement_rate": evaluation["engagement_rate"],
                "view_history": evaluation["view_history"],
                "status": init_status,
                "local_filepath": None,
                "reup_filepath": None,
                "bkt_status": "none",
                "opportunity_score": round(min(min(evaluation["sub_outlier_ratio"] * 3.5, 40.0) + min(evaluation["baseline_outlier_ratio"] * 3.5, 30.0) + min((evaluation["avg_vph"] / 30.0) * 5, 20.0) + min((evaluation["engagement_rate"] / 0.01) * 5, 10.0), 100.0), 1),
                "demand_signal": json.dumps({
                    "demand_score": min(int(evaluation["sub_outlier_ratio"] * 8 + 30), 100),
                    "demand_level": "Cực Cao (Viral Demand)" if evaluation["sub_outlier_ratio"] >= 8.0 else ("Cao (Nhu cầu lớn)" if evaluation["sub_outlier_ratio"] >= 3.0 else "Bình thường"),
                    "triggers_found": ["hóng phần tiếp", "nội dung cuốn"],
                    "top_demand_quotes": []
                }, ensure_ascii=False),
                "hook_analysis": "",
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "last_ping_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            discovered.append(outlier_record)
        else:
            logger.debug(f"Bỏ qua '{video_candidate['title'][:40]}': {reason}")

    return discovered


def hunt_niche_outliers(
    target_niche: str, 
    settings: Dict, 
    channel_cache: Optional[Dict[str, List[Dict]]] = None
) -> List[Dict]:
    """
    TẦNG 1 & TẦNG 2: Quét video ngách theo thời gian và đánh giá Outlier Kép.
    Hỗ trợ cả chế độ: Quét 1 ngách đơn lẻ HOẶC Quét Toàn Bộ Ngách Ngon Ikigai.
    """
    if channel_cache is None:
        channel_cache = {}

    clean_niche = target_niche.strip()
    is_scan_all = not clean_niche or clean_niche.lower() in ("all", "tất cả", "tất cả các ngách", "toàn bộ", "toàn bộ ngách ngon")

    all_discovered = []
    seen_ids = set()

    if is_scan_all:
        logger.info("⚡ Bắt đầu quét TOÀN BỘ CÁC NGÁCH NGON IKIGAI...")
        for niche_item in IKIGAI_GOLDEN_NICHES:
            found = _scan_single_query(
                query_text=niche_item["query"],
                niche_label=f"{niche_item['name']}",
                settings=settings,
                channel_cache=channel_cache,
                limit=12
            )
            for item in found:
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    all_discovered.append(item)
    else:
        logger.info(f"Bắt đầu săn video đột biến cho ngách Ikigai: '{clean_niche}'")
        found = _scan_single_query(
            query_text=clean_niche,
            niche_label=clean_niche,
            settings=settings,
            channel_cache=channel_cache,
            limit=30
        )
        for item in found:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                all_discovered.append(item)

    # Sắp xếp các video tìm được theo Opportunity Score giảm dần
    all_discovered.sort(key=lambda x: x.get("opportunity_score", 0), reverse=True)
    return all_discovered


def ping_momentum_videos(videos: List[Dict]) -> List[Dict]:
    """
    Ping lại danh sách video trong Watchlist để tính Current VPH và vẽ Sparkline.
    """
    updated = []
    now_ts = int(time.time())
    ytdlp_bin = get_ytdlp_bin()

    for v in videos:
        vid_id = v.get("id")
        if not vid_id:
            continue
        try:
            # Query fast metadata for 1 video
            cmd = [ytdlp_bin, "--dump-json", "--no-warnings", f"https://www.youtube.com/watch?v={vid_id}"]
            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", timeout=25)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout.strip())
                curr_views = int(data.get("view_count") or v.get("views", 0))
                upload_ts = v.get("upload_timestamp") or now_ts
                curr_hours = max((now_ts - upload_ts) / 3600.0, 1.0)
                
                radar_update = update_momentum_radar(v, curr_views, curr_hours)
                
                merged = dict(v)
                merged.update(radar_update)
                merged["likes"] = int(data.get("like_count") or v.get("likes", 0))
                merged["comments"] = int(data.get("comment_count") or v.get("comments", 0))
                updated.append(merged)
        except Exception as e:
            logger.warning(f"Lỗi ping momentum cho video {vid_id}: {e}")

    return updated

