
"""Generate varied Google Sheets content for automation steps.

The generator uses optional open-source providers when installed:
- Faker: names, companies, dates, short phrases (en_US / vi_VN).
- Mimesis: extra English company/text/finance variation.
- Polyfactory: typed random row seeds for numbers and IDs.

If any package is missing in a local/dev/bundled build, the internal fallback pools
keep automation working.
"""
from __future__ import annotations

from dataclasses import dataclass
import random
from typing import Callable, TypedDict

try:  # optional dependency
    from faker import Faker
except Exception:  # pragma: no cover - exercised by fallback deployments
    Faker = None  # type: ignore[assignment]

try:  # optional dependency
    from mimesis import Generic
    from mimesis.locales import Locale
except Exception:  # pragma: no cover
    Generic = None  # type: ignore[assignment]
    Locale = None  # type: ignore[assignment]

try:  # optional dependency
    from polyfactory.factories import DataclassFactory
except Exception:  # pragma: no cover
    DataclassFactory = None  # type: ignore[assignment]


class SheetPayload(TypedDict):
    title: str
    headers: list[str]
    rows: list[list[str]]
    language: str
    scenario: str
    provider: str


@dataclass
class RowSeed:
    ticket: int
    score: int
    quantity: int


if DataclassFactory is not None:
    class RowSeedFactory(DataclassFactory[RowSeed]):
        __model__ = RowSeed
else:
    RowSeedFactory = None  # type: ignore[assignment]


def normalize_keyword_preset(value: str | None) -> str:
    preset = str(value or "mixed").strip().lower()
    return preset if preset in {"english", "vietnam", "mixed"} else "mixed"


def _provider_label() -> str:
    labels = ["internal"]
    if Faker is not None:
        labels.append("faker")
    if Generic is not None:
        labels.append("mimesis")
    if DataclassFactory is not None:
        labels.append("polyfactory")
    return "+".join(labels)


def _faker(locale: str):
    if Faker is None:
        return None
    try:
        return Faker(locale)
    except Exception:
        return None


def _mimesis_en():
    if Generic is None or Locale is None:
        return None
    try:
        return Generic(Locale.EN)
    except Exception:
        return None


def _row_seed() -> RowSeed:
    if RowSeedFactory is not None:
        try:
            seed = RowSeedFactory.build()
            return RowSeed(
                ticket=abs(int(seed.ticket)) % 9000 + 1000,
                score=abs(int(seed.score)) % 91 + 10,
                quantity=abs(int(seed.quantity)) % 140 + 12,
            )
        except Exception:
            pass
    return RowSeed(
        ticket=random.randint(1000, 9999),
        score=random.randint(10, 100),
        quantity=random.randint(12, 150),
    )


def _date(day: int | None = None, *, language: str = "english") -> str:
    fake = _faker("vi_VN" if language == "vietnam" else "en_US")
    if fake is not None:
        try:
            return fake.date_between(start_date="-60d", end_date="+90d").strftime("%d/%m/%Y")
        except Exception:
            pass
    day = day or random.randint(1, 28)
    return f"{day:02d}/{random.randint(1, 12):02d}/2026"


def _usd_amount(low: int = 80, high: int = 2500) -> str:
    generic = _mimesis_en()
    if generic is not None:
        try:
            return f"${float(generic.finance.price(minimum=low, maximum=high)):,.2f}"
        except Exception:
            pass
    return f"${random.randint(low, high):,}"


def _vnd_amount(low: int = 120_000, high: int = 8_500_000) -> str:
    return f"{random.randint(low, high):,} VND"


def _name(language: str) -> str:
    fake = _faker("vi_VN" if language == "vietnam" else "en_US")
    if fake is not None:
        try:
            return fake.name()
        except Exception:
            pass
    return random.choice(_VN_NAMES if language == "vietnam" else _EN_NAMES)


def _company() -> str:
    generic = _mimesis_en()
    if generic is not None:
        try:
            return generic.finance.company()
        except Exception:
            pass
    fake = _faker("en_US")
    if fake is not None:
        try:
            return fake.company()
        except Exception:
            pass
    return random.choice(["Northwind Labs", "Blue Oak Media", "Summit Cloud", "Riverstone Group"])


def _short_note(language: str) -> str:
    if language == "english":
        generic = _mimesis_en()
        if generic is not None:
            try:
                words = generic.text.words(quantity=random.randint(2, 4))
                return " ".join(str(word).title() for word in words)[:42]
            except Exception:
                pass
        fake = _faker("en_US")
        if fake is not None:
            try:
                return fake.sentence(nb_words=random.randint(3, 6)).rstrip(".")[:42]
            except Exception:
                pass
    return random.choice(_VN_NOTES if language == "vietnam" else _EN_NOTES)


_EN_NAMES = ["Alex", "Taylor", "Jordan", "Morgan", "Casey", "Riley", "Sam", "Jamie"]
_VN_NAMES = ["Minh", "An", "Linh", "Trang", "Huy", "Khanh", "Phuong", "Nam"]
_EN_NOTES = ["Need follow-up", "On track", "Check details", "Waiting for data", "Ready to share"]
_VN_NOTES = ["Can theo doi", "Dung tien do", "Cho du lieu", "Da gui nhom", "Can bo sung"]


def _project_row_en(index: int) -> list[str]:
    seed = _row_seed()
    tasks = ["Draft brief", "Review dashboard", "Update roadmap", "Check campaign", "Prepare summary", "Test workflow"]
    statuses = ["Planned", "In progress", "Waiting", "Done", "Needs review"]
    return [str(index), random.choice(tasks), _name("english"), _date(language="english"), random.choice(statuses), _short_note("english"), f"T-{seed.ticket}"]


def _expenses_row_en(index: int) -> list[str]:
    items = ["Cloud tools", "Stock images", "Taxi", "Lunch meeting", "Domain renewal", "Office supplies", _company()]
    categories = ["Software", "Marketing", "Travel", "Food", "Operations", "Admin"]
    return [_date(index + 1, language="english"), random.choice(items), _usd_amount(), random.choice(categories), _short_note("english")]


def _sales_row_en(index: int) -> list[str]:
    seed = _row_seed()
    channels = ["Website", "Email", "Marketplace", "Social", "Referral", "Partner"]
    regions = ["US", "EU", "APAC", "Global", "Canada", "Australia"]
    return [random.choice(channels), random.choice(regions), str(seed.quantity), _usd_amount(500, 9000), random.choice(["Stable", "Growing", "Needs follow-up"]), _company()]


def _project_row_vn(index: int) -> list[str]:
    seed = _row_seed()
    tasks = ["Lap ke hoach", "Kiem tra bao cao", "Cap nhat tien do", "Tong hop du lieu", "Chuan bi noi dung", "Theo doi viec moi"]
    statuses = ["Chua bat dau", "Dang lam", "Cho phan hoi", "Hoan thanh", "Can xem lai"]
    return [str(index), random.choice(tasks), _name("vietnam"), _date(language="vietnam"), random.choice(statuses), _short_note("vietnam"), f"CV-{seed.ticket}"]


def _expenses_row_vn(index: int) -> list[str]:
    items = ["An trua", "Di chuyen", "Mua sach", "Cong cu online", "Van phong pham", "Chi phi hop"]
    categories = ["An uong", "Di chuyen", "Hoc tap", "Phan mem", "Van phong", "Nhom"]
    return [_date(index + 1, language="vietnam"), random.choice(items), _vnd_amount(), random.choice(categories), _short_note("vietnam")]


def _sales_row_vn(index: int) -> list[str]:
    seed = _row_seed()
    channels = ["Website", "Email", "Dai ly", "Mang xa hoi", "Gioi thieu", "Cua hang"]
    regions = ["Ha Noi", "TP HCM", "Da Nang", "Can Tho", "Mien Bac", "Mien Nam"]
    return [random.choice(channels), random.choice(regions), str(seed.quantity), _vnd_amount(1_000_000, 90_000_000), random.choice(["On dinh", "Tang truong", "Can cham soc"])]


ScenarioFactory = Callable[[int], list[str]]

_SCENARIOS: dict[str, list[tuple[str, str, list[str], ScenarioFactory]]] = {
    "english": [
        ("weekly project tracker", "Project Tracker", ["No", "Task", "Owner", "Due date", "Status", "Note", "Ticket"], _project_row_en),
        ("monthly expense log", "Expense Log", ["Date", "Item", "Amount", "Category", "Note"], _expenses_row_en),
        ("sales channel summary", "Sales Summary", ["Channel", "Region", "Leads", "Revenue", "Status", "Company"], _sales_row_en),
    ],
    "vietnam": [
        ("bang theo doi cong viec", "Theo doi cong viec", ["STT", "Cong viec", "Phu trach", "Han xu ly", "Trang thai", "Ghi chu", "Ma viec"], _project_row_vn),
        ("so chi phi thang", "Theo doi chi phi", ["Ngay", "Khoan chi", "So tien", "Danh muc", "Ghi chu"], _expenses_row_vn),
        ("tong hop kenh ban hang", "Tong hop ban hang", ["Kenh", "Khu vuc", "Khach tiem nang", "Doanh thu", "Trang thai"], _sales_row_vn),
    ],
}


def generate_sheet_payload(keyword_preset: str = "mixed", rows_count: int | None = None) -> SheetPayload:
    preset = normalize_keyword_preset(keyword_preset)
    language = random.choice(["english", "vietnam"]) if preset == "mixed" else preset
    scenario_name, title_base, headers, row_factory = random.choice(_SCENARIOS[language])
    count = rows_count if rows_count is not None else random.randint(3, 5)
    rows = [row_factory(index) for index in range(1, max(1, count) + 1)]
    suffix = random.choice([f"{random.randint(1, 12):02d}/2026", f"Q{random.randint(1, 4)} 2026", str(_row_seed().ticket)])
    return {
        "title": f"{title_base} {suffix}",
        "headers": list(headers),
        "rows": rows,
        "language": language,
        "scenario": scenario_name,
        "provider": _provider_label(),
    }
