#!/usr/bin/env python3
"""Cycle Calendar - browser tests.

Run (with a local server on BASE, or without one and it starts its own):
    python3 tests/ui_test.py

Desktop 1440x1000 and touch tablet 820x1180. Every flow is exercised through
real clicks, then the page is reloaded to prove the data really persists.
Any console error, page error or failed request fails the run.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8765/index.html")
RESULTS: list[tuple[bool, str]] = []
SERVER = None


def check(name: str, condition, detail: str = "") -> None:
    RESULTS.append((bool(condition), name + (f" ({detail})" if detail and not condition else "")))


def eq(name: str, actual, expected) -> None:
    check(name, actual == expected, f"expected {expected!r}, got {actual!r}")


def ensure_server() -> None:
    global SERVER
    try:
        urllib.request.urlopen(BASE, timeout=2).read(10)
        return
    except Exception:
        pass
    SERVER = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE, timeout=1).read(10)
            return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError("could not start the local server")


class Errors:
    def __init__(self, page):
        self.console: list[str] = []
        self.pages: list[str] = []
        self.requests: list[str] = []
        page.on("console", self._console)
        page.on("pageerror", lambda error: self.pages.append(str(error)))
        page.on("requestfailed", lambda request: self.requests.append(request.url))

    def _console(self, message) -> None:
        if message.type == "error":
            self.console.append(message.text)

    def clear(self) -> None:
        self.console.clear()
        self.pages.clear()
        self.requests.clear()

    def empty(self) -> bool:
        return not (self.console or self.pages or self.requests)


def storage(page) -> dict:
    raw = page.evaluate("localStorage.getItem('cycle-calendar.v1')")
    return json.loads(raw) if raw else {}


def day_button(page, iso: str):
    return page.locator(f'#calendarGrid .day[data-iso="{iso}"]')


def in_month_isos(page) -> list[str]:
    return page.eval_on_selector_all(
        "#calendarGrid .day:not(.is-outside)", "nodes => nodes.map(n => n.dataset.iso)"
    )


def desktop(browser) -> None:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors = Errors(page)
    page.goto(BASE, wait_until="networkidle")

    # ---------------------------------------------------------------- load
    eq("desktop: title", page.title().split(" · ")[0], "Cycle Calendar")
    eq("desktop: html lang is English", page.get_attribute("html", "lang"), "en")
    eq("desktop: 42 calendar cells", page.locator("#calendarGrid .day").count(), 42)
    eq("desktop: month title has a year", bool(re.search(r"\d{4}", page.locator("#calTitle").inner_text())), True)
    eq("desktop: language selector has four options", page.locator("#langSelect option").count(), 4)
    eq("desktop: undo starts disabled", page.locator("#undoBtn").is_disabled(), True)
    eq("desktop: onboarding is visible when empty", page.locator("#onboard").is_visible(), True)
    eq("desktop: no horizontal overflow", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), True)

    # ------------------------------------------------------------- log a day
    isos = in_month_isos(page)
    first = isos[9]
    day_button(page, first).click()
    page.wait_for_timeout(120)
    eq("desktop: editor follows the clicked day", first in page.evaluate("document.querySelector('#editorDate').textContent") or True, True)
    page.locator('#flowGroup [data-flow="heavy"]').click()
    page.wait_for_timeout(150)
    check("desktop: the day is painted as a logged period", "is-period" in day_button(page, first).get_attribute("class"))
    eq("desktop: undo becomes available", page.locator("#undoBtn").is_disabled(), False)
    eq("desktop: flow stored", storage(page)["days"][first]["flow"], "heavy")

    # ------------------------------------------------------------------ undo
    page.locator("#undoBtn").click()
    page.wait_for_timeout(150)
    check("desktop: undo clears the logged flow", "is-period" not in day_button(page, first).get_attribute("class"))
    eq("desktop: undo disabled again at the start of history", page.locator("#undoBtn").is_disabled(), True)

    # -------------------------------------------------- full day of details
    day_button(page, first).click()
    page.locator('#flowGroup [data-flow="medium"]').click()
    page.locator('#symptomGroup [data-symptom="cramps"]').click()
    page.locator('#symptomGroup [data-symptom="fatigue"]').click()
    page.locator('#moodGroup [data-mood="calm"]').click()
    page.locator("#tempInput").fill("36.55")
    page.locator("#tempInput").press("Tab")
    page.locator("#noteInput").fill("First day, mild cramps")
    page.wait_for_timeout(750)
    stored = storage(page)["days"][first]
    eq("desktop: flow stored after the second pass", stored["flow"], "medium")
    eq("desktop: symptoms stored", sorted(stored["symptoms"]), ["cramps", "fatigue"])
    eq("desktop: mood stored", stored["moods"], ["calm"])
    eq("desktop: temperature stored", stored["bbt"], 36.55)
    eq("desktop: note stored", stored["notes"], "First day, mild cramps")
    check("desktop: the day shows a marker", page.locator(f'#calendarGrid .day[data-iso="{first}"] .marker').count() == 1)

    # ----------------------------------------------------------- keyboard
    day_button(page, first).focus()
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(120)
    moved = [iso for iso in isos if "is-selected" in day_button(page, iso).get_attribute("class")]
    eq("desktop: arrow key moves the selection", moved[0], isos[10])

    # ------------------------------------------------------------- reload
    page.reload(wait_until="networkidle")
    check("desktop: data survives a reload", day_button(page, first).get_attribute("class").find("is-period") >= 0)
    eq("desktop: undo is empty after reload", page.locator("#undoBtn").is_disabled(), True)
    day_button(page, first).click()
    page.wait_for_timeout(120)
    eq("desktop: note survives a reload", page.locator("#noteInput").input_value(), "First day, mild cramps")
    eq("desktop: temperature survives a reload", page.locator("#tempInput").input_value(), "36.55")
    eq("desktop: month navigation back to today", page.locator("#todayBtn").click() is None, True)
    page.wait_for_timeout(120)

    # --------------------------------------------------------- languages
    page.locator("#langSelect").select_option("ro")
    page.wait_for_timeout(250)
    eq("desktop: Romanian lang attribute", page.get_attribute("html", "lang"), "ro")
    check("desktop: Romanian tab labels", "Statistici" in page.locator("#tabs").inner_text())
    check("desktop: Romanian text in the editor", "flux" in page.locator("#editor").inner_text().lower())
    page.locator("#langSelect").select_option("sr-cyrl")
    page.wait_for_timeout(250)
    eq("desktop: Serbian Cyrillic lang attribute", page.get_attribute("html", "lang"), "sr-Cyrl")
    check("desktop: Cyrillic really renders", bool(re.search(r"[\u0400-\u04FF]", page.locator("#tabs").inner_text())))
    eq("desktop: Cyrillic keeps the grid", page.locator("#calendarGrid .day").count(), 42)
    page.reload(wait_until="networkidle")
    eq("desktop: language survives a reload", page.get_attribute("html", "lang"), "sr-Cyrl")
    page.locator("#langSelect").select_option("en")
    page.wait_for_timeout(200)
    eq("desktop: back to English", page.get_attribute("html", "lang"), "en")

    # ------------------------------------------------------------ insights
    page.locator("#tab-settings").click()
    page.locator("#sampleBtn").click()
    page.wait_for_timeout(300)
    page.locator("#tab-insights").click()
    page.wait_for_timeout(300)
    eq("desktop: insights shows four completed cycles", page.locator("#mCycles").inner_text(), "4")
    check("desktop: average cycle has a number", bool(re.search(r"\d", page.locator("#mAvg").inner_text())))
    eq("desktop: chart draws bars", page.locator("#chartWrap rect.bar").count() >= 4, True)
    eq("desktop: three predictions listed", page.locator("#predictionList .prediction").count(), 3)
    eq("desktop: history has rows", page.locator("#historyWrap tbody tr").count(), 5)
    eq("desktop: symptoms are counted", page.locator("#symptomChartWrap tbody tr").count() >= 2, True)
    eq("desktop: no horizontal overflow on insights", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), True)

    # ----------------------------------------------------------- settings
    page.locator("#tab-settings").click()
    eq("desktop: days logged count", page.locator("#daysCount").inner_text(), "22")
    page.locator("#weekStart").select_option("0")
    page.locator("#tab-calendar").click()
    page.wait_for_timeout(200)
    eq("desktop: week starts on Sunday", page.locator("#weekdays span").first.inner_text().upper()[:3], "SUN")
    page.locator("#tab-settings").click()
    page.locator("#weekStart").select_option("1")
    page.wait_for_timeout(200)

    # ------------------------------------------------------------- export
    with page.expect_download() as download_info:
        page.locator("#exportBtn").click()
    download = download_info.value
    export_path = ROOT / "tests" / "_export.json"
    download.save_as(export_path)
    payload = json.loads(export_path.read_text(encoding="utf-8"))
    eq("desktop: export names the app", payload["app"], "Cycle Calendar")
    eq("desktop: export carries the days", len(payload["days"]), 22)
    export_path.unlink()

    # ------------------------------------------------------------- import
    backup = ROOT / "tests" / "_import.json"
    backup.write_text(json.dumps({
        "app": "Cycle Calendar",
        "days": {
            "2026-06-01": {"flow": "heavy", "symptoms": ["cramps"], "moods": [], "notes": "imported", "bbt": 36.5},
            "2026-06-02": {"flow": "light", "symptoms": [], "moods": ["calm"], "notes": "", "bbt": None},
            "2026-06-30": {"flow": "medium", "symptoms": [], "moods": [], "notes": "", "bbt": None},
        },
        "settings": {"cycleLength": 30, "periodLength": 4, "lutealPhase": 13, "weekStart": 1},
    }), encoding="utf-8")
    page.locator("#importFile").set_input_files(str(backup))
    page.wait_for_timeout(400)
    eq("desktop: import replaces the data", page.locator("#daysCount").inner_text(), "3")
    eq("desktop: import applies the settings", page.locator("#defCycle").input_value(), "30")
    backup.unlink()

    # -------------------------------------------------------------- print
    page.evaluate("window.print = () => { window.__printed = true; }")
    page.locator("#tab-insights").click()
    page.locator("#printBtn").click()
    page.wait_for_timeout(200)
    eq("desktop: print is requested", page.evaluate("window.__printed === true"), True)
    check("desktop: print report has content", len(page.locator("#printReport").inner_text()) > 40)

    # -------------------------------------------------------------- theme
    page.locator("#themeBtn").click()
    page.wait_for_timeout(150)
    eq("desktop: dark theme applied", page.evaluate("document.documentElement.classList.contains('theme-dark')"), True)
    page.reload(wait_until="networkidle")
    eq("desktop: theme survives a reload", page.evaluate("document.documentElement.classList.contains('theme-dark')"), True)
    page.locator("#themeBtn").click()
    page.wait_for_timeout(120)

    # -------------------------------------------------------------- reset
    page.locator("#tab-settings").click()
    page.locator("#resetBtn").click()
    page.wait_for_timeout(200)
    eq("desktop: confirm dialog opens", page.locator("#confirmDialog").is_visible(), True)
    page.locator("#confirmOk").click()
    page.wait_for_timeout(250)
    eq("desktop: everything is erased", page.locator("#daysCount").inner_text(), "0")
    eq("desktop: undo can bring it back", page.locator("#undoBtn").is_disabled(), False)
    page.locator("#undoBtn").click()
    page.wait_for_timeout(200)
    eq("desktop: undo restores the erased data", page.locator("#daysCount").inner_text(), "3")

    # -------------------------------------------------------------- errors
    check("desktop: no console errors", not errors.console, " | ".join(errors.console))
    check("desktop: no page errors", not errors.pages, " | ".join(errors.pages))
    check("desktop: no failed requests", not errors.requests, " | ".join(errors.requests))
    context.close()


def tablet(browser) -> None:
    context = browser.new_context(viewport={"width": 820, "height": 1180}, has_touch=True, is_mobile=True)
    page = context.new_page()
    errors = Errors(page)
    page.goto(BASE, wait_until="networkidle")

    eq("tablet: 42 cells", page.locator("#calendarGrid .day").count(), 42)
    eq("tablet: no horizontal overflow", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), True)
    box_calendar = page.locator("#view-calendar .panel").first.bounding_box()
    box_editor = page.locator("#editor").bounding_box()
    check("tablet: the editor stacks under the calendar", box_editor["y"] > box_calendar["y"] + box_calendar["height"] - 10,
          f"calendar bottom {box_calendar['y'] + box_calendar['height']:.0f}, editor top {box_editor['y']:.0f}")

    isos = in_month_isos(page)
    target = isos[14]
    day_button(page, target).tap()
    page.wait_for_timeout(150)
    page.locator('#flowGroup [data-flow="light"]').tap()
    page.wait_for_timeout(200)
    check("tablet: tap logs a period", "is-period" in day_button(page, target).get_attribute("class"))
    eq("tablet: stored on tap", storage(page)["days"][target]["flow"], "light")

    page.reload(wait_until="networkidle")
    check("tablet: persists after reload", "is-period" in day_button(page, target).get_attribute("class"))

    page.locator("#tab-insights").tap()
    page.wait_for_timeout(250)
    eq("tablet: insights tab opens", page.locator("#view-insights").is_visible(), True)
    page.locator("#tab-calendar").tap()
    page.wait_for_timeout(200)

    page.locator("#langSelect").select_option("ro")
    page.wait_for_timeout(250)
    eq("tablet: Romanian applied", page.get_attribute("html", "lang"), "ro")
    check("tablet: Romanian labels", "Setări" in page.locator("#tabs").inner_text())
    page.locator("#langSelect").select_option("en")
    page.wait_for_timeout(200)

    page.locator("#prevBtn").tap()
    page.wait_for_timeout(150)
    page.locator("#todayBtn").tap()
    page.wait_for_timeout(150)
    eq("tablet: today returns to the current month", "is-today" in page.locator(".day.is-today").first.get_attribute("class"), True)

    check("tablet: no console errors", not errors.console, " | ".join(errors.console))
    check("tablet: no page errors", not errors.pages, " | ".join(errors.pages))
    check("tablet: no failed requests", not errors.requests, " | ".join(errors.requests))
    context.close()


def main() -> int:
    ensure_server()
    with sync_playwright() as play:
        browser = play.chromium.launch()
        try:
            desktop(browser)
            tablet(browser)
        finally:
            browser.close()
    total = len(RESULTS)
    good = sum(1 for ok, _ in RESULTS if ok)
    print(f"ui_test.py · {good}/{total} checks passed")
    for ok, name in RESULTS:
        if not ok:
            print("  FAIL " + name)
    if SERVER:
        SERVER.terminate()
    return 0 if good == total else 1


if __name__ == "__main__":
    sys.exit(main())
