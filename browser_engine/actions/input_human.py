"""
Human input simulation — timing, keyboard typing, mouse movement, scrolling.
"""
import asyncio
import logging
import math
import random

from actions.constants import _ADJACENT_KEYS

logger = logging.getLogger(__name__)

_LAST_MOUSE_POS: dict[int, tuple[float, float]] = {}


# Timing

async def random_delay(min_seconds: float, max_seconds: float):
    delay = random.uniform(min_seconds, max_seconds)
    logger.debug("Đang chờ %.2f giây", delay)
    await asyncio.sleep(delay)


# Typing

_KEY_POSITIONS = {
    "q": (0.0, 0.0), "w": (1.0, 0.0), "e": (2.0, 0.0), "r": (3.0, 0.0), "t": (4.0, 0.0),
    "y": (5.0, 0.0), "u": (6.0, 0.0), "i": (7.0, 0.0), "o": (8.0, 0.0), "p": (9.0, 0.0),
    "a": (0.5, 1.0), "s": (1.5, 1.0), "d": (2.5, 1.0), "f": (3.5, 1.0), "g": (4.5, 1.0),
    "h": (5.5, 1.0), "j": (6.5, 1.0), "k": (7.5, 1.0), "l": (8.5, 1.0),
    "z": (1.0, 2.0), "x": (2.0, 2.0), "c": (3.0, 2.0), "v": (4.0, 2.0), "b": (5.0, 2.0),
    "n": (6.0, 2.0), "m": (7.0, 2.0),
    "1": (0.0, -1.0), "2": (1.0, -1.0), "3": (2.0, -1.0), "4": (3.0, -1.0), "5": (4.0, -1.0),
    "6": (5.0, -1.0), "7": (6.0, -1.0), "8": (7.0, -1.0), "9": (8.0, -1.0), "0": (9.0, -1.0),
}


def _key_distance(previous: str | None, current: str) -> float:
    if not previous or not current:
        return 1.0
    left = _KEY_POSITIONS.get(previous.lower())
    right = _KEY_POSITIONS.get(current.lower())
    if left is None or right is None:
        return 1.35 if ord(current[:1] or " ") > 127 else 1.0
    return math.dist(left, right)


def _typing_pause(previous: str | None, current: str) -> float:
    """Return a small, distance-aware pause after a key press.

    The average stays only slightly slower than the previous 80-250ms range,
    but far-away key transitions and punctuation feel less robotic.
    """
    distance = min(_key_distance(previous, current), 5.0)
    pause = random.uniform(0.075, 0.145) + distance * random.uniform(0.018, 0.032)
    if current in ".,;:!?":
        pause += random.uniform(0.08, 0.22)
    elif current == " ":
        pause += random.uniform(0.035, 0.13)
    elif current.isupper():
        pause += random.uniform(0.015, 0.05)
    return min(pause, random.uniform(0.30, 0.38))


async def human_type(page, locator, text: str, typo_rate: float = 0.02, click_first: bool = True):
    """
    Type characters with a human-like rhythm:
    - Small delay changes based on QWERTY key distance.
    - Default typo rate is about 2%, only for ASCII a-z to avoid Unicode errors.
    - Occasional short pauses on spaces to simulate thinking.
    """
    if click_first:
        try:
            await locator.click()
        except Exception as exc:
            logger.debug("Locator click failed before typing, using focus fallback: %s", exc)
            try:
                await locator.focus()
            except Exception:
                pass
        await random_delay(0.35, 0.75)

    previous_char: str | None = None
    for i, char in enumerate(text):
        if char == " " and random.random() < 0.035:
            await asyncio.sleep(random.uniform(0.55, 1.65))
            logger.debug("Typing pause to simulate thinking")

        should_typo = (
            typo_rate > 0
            and char.isascii()
            and char.isalpha()
            and i > 0
            and i < len(text) - 1
            and random.random() < typo_rate
        )
        if should_typo:
            wrong = random.choice(_ADJACENT_KEYS.get(char.lower(), char))
            await page.keyboard.press(wrong)
            await asyncio.sleep(random.uniform(0.18, 0.42))
            await page.keyboard.press("Backspace")
            await asyncio.sleep(random.uniform(0.10, 0.24))
            logger.debug("Typing typo corrected: '%s' -> '%s'", wrong, char)

        if len(char) == 1 and (ord(char) > 127 or char in ' 	'):
            await page.keyboard.type(char)
        else:
            try:
                await page.keyboard.press(char)
            except Exception:
                await page.keyboard.type(char)

        if random.random() < 0.045:
            await asyncio.sleep(random.uniform(0.045, 0.095))
        else:
            await asyncio.sleep(_typing_pause(previous_char, char))
        previous_char = char

# Mouse movement
# cloakbrowser patches page.mouse.move into async_human_move (Bezier + wobble + burst).
# Chỉ cần gọi page.mouse.move(x, y) — không cần tự implement Bézier.

async def _move_with_settle(page, x: float, y: float, *, allow_overshoot: bool = True) -> None:
    """Move once, with occasional hesitation and settle pause around intent."""
    destination_x = float(x)
    destination_y = float(y)
    previous = _LAST_MOUSE_POS.get(id(page))
    try:
        if previous is not None:
            previous_x, previous_y = previous
            distance = math.hypot(destination_x - previous_x, destination_y - previous_y)
            if distance > 120 and random.random() < 0.30:
                await asyncio.sleep(random.uniform(0.05, 0.22))

        await page.mouse.move(destination_x, destination_y)
        _LAST_MOUSE_POS[id(page)] = (destination_x, destination_y)
        if random.random() < 0.22:
            await asyncio.sleep(random.uniform(0.035, 0.13))
    except Exception:
        pass


async def move_mouse_to(page, x: float, y: float):
    """Move mouse to (x, y); cloakbrowser handles smooth movement."""
    await _move_with_settle(page, x, y)


async def move_to_locator(page, locator):
    """Move mouse to a locator."""
    try:
        box = await locator.bounding_box(timeout=3000)
        if box:
            tx = box["x"] + box["width"] * random.uniform(0.3, 0.7)
            ty = box["y"] + box["height"] * random.uniform(0.3, 0.7)
            await _move_with_settle(page, tx, ty)
    except Exception:
        pass


# Scrolling

async def human_scroll(page, direction: str = "down", amount: int = None):
    """Scroll with varied speed like a real user."""
    if amount is None:
        amount = random.randint(200, 700)
    delta = amount if direction == "down" else -amount
    remaining = float(delta)
    target_steps = random.randint(5, 9) if abs(delta) >= 360 else random.randint(4, 6)
    step_index = 0
    while abs(remaining) >= 1 and step_index < 14:
        remaining_steps = max(1, target_steps - step_index)
        base_delta = remaining / remaining_steps
        raw_delta = int(base_delta * random.uniform(0.84, 1.10) + random.randint(-10, 10))
        max_step = random.randint(48, 72)
        if abs(raw_delta) > max_step:
            raw_delta = max_step if raw_delta > 0 else -max_step
        if abs(remaining - raw_delta) < 12 or step_index >= 13:
            raw_delta = int(remaining)
        if raw_delta == 0:
            raw_delta = 1 if remaining > 0 else -1
        try:
            await page.mouse.wheel(0, raw_delta)
        except Exception as exc:
            logger.debug("Mouse wheel failed, using keyboard scroll fallback: %s", exc)
            await page.keyboard.press("PageDown" if direction == "down" else "PageUp")
        remaining -= raw_delta
        pause = random.uniform(0.045, 0.14)
        if step_index in {0, target_steps - 1} and random.random() < 0.25:
            pause += random.uniform(0.04, 0.12)
        await asyncio.sleep(pause)
        step_index += 1


async def human_read_and_scroll(page, cycles: int = 4):
    """Read and scroll through the page."""
    # Local import avoids circular imports
    from actions.popup_handler import maybe_handle_notification_popup, dismiss_popups

    logger.info("Simulate reading and scrolling (%d cycles)", cycles)

    await maybe_handle_notification_popup(page)
    await dismiss_popups(page)

    for i in range(cycles):
        await human_scroll(page, "down")
        logger.debug("Scrolled down (cycle %d)", i + 1)
        await random_delay(2.5, 5.5)

        if random.random() < 0.4:
            tx = random.uniform(200, 900)
            ty = random.uniform(200, 600)
            await move_mouse_to(page, tx, ty)
            await random_delay(0.5, 1.5)

        if random.random() < 0.35:
            await human_scroll(page, "up", random.randint(80, 250))
            logger.debug("Scrolled up a little")
            await random_delay(0.8, 2.0)

        if i == 1:
            await dismiss_popups(page)
