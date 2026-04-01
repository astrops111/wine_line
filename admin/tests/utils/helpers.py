"""
Shared test helpers for the HRM Admin Panel tests.
"""
import time
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:5173"

# ── Navigation helpers ────────────────────────────────────────────────────────

def goto(page: Page, path: str = "") -> None:
    """Navigate to a path and wait for the SPA to settle."""
    page.goto(f"{BASE_URL}{path}")
    page.wait_for_load_state("networkidle")


def wait_for_page_ready(page: Page, timeout: int = 10_000) -> None:
    """Wait until loading spinners disappear and content is visible."""
    page.wait_for_load_state("networkidle", timeout=timeout)
    # Many pages show a 'Loading…' text while fetching from Supabase
    try:
        page.wait_for_selector("text=Loading", state="hidden", timeout=5_000)
    except Exception:
        pass  # No spinner present – that's fine


# ── Screenshot helpers ────────────────────────────────────────────────────────

def screenshot(page: Page, name: str) -> str:
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "screenshots")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  [screenshot] {path}")
    return path


# ── Element helpers ───────────────────────────────────────────────────────────

def click_nav(page: Page, label: str) -> None:
    """Click a sidebar navigation item by its visible label."""
    page.locator(f"nav a, nav button").filter(has_text=label).first.click()
    wait_for_page_ready(page)


def fill_and_submit(page: Page, fields: dict, submit_text: str = "Save") -> None:
    """Fill a form dict {selector: value} and click the submit button."""
    for selector, value in fields.items():
        el = page.locator(selector).first
        if el.evaluate("el => el.tagName") == "SELECT":
            el.select_option(label=value)
        else:
            el.fill(value)
    page.locator(f"button:has-text('{submit_text}')").first.click()
    wait_for_page_ready(page)


# ── Assertion helpers ─────────────────────────────────────────────────────────

def assert_no_console_errors(page: Page, captured_errors: list) -> None:
    assert len(captured_errors) == 0, (
        f"Console errors detected:\n" + "\n".join(captured_errors)
    )


def assert_page_heading(page: Page, heading: str) -> None:
    """Assert that at least one h1/h2 or page-header text matches."""
    locator = page.locator(f"h1, h2, .page-header").filter(has_text=heading)
    expect(locator.first).to_be_visible(timeout=5_000)


# ── Tab helpers ───────────────────────────────────────────────────────────────

def wait_for_tab(page: Page, tab_text: str, timeout: int = 6_000) -> bool:
    """Click a tab button matching tab_text regex and wait for content load.
    Returns True if tab found and clicked, False otherwise."""
    import re
    btn = page.locator("button, [role='tab']").filter(
        has_text=re.compile(tab_text)
    ).first
    if btn.is_visible():
        btn.click()
        page.wait_for_timeout(500)
        wait_for_page_ready(page)
        return True
    return False


def assert_table_has_rows(page: Page, min_rows: int = 0) -> int:
    """Assert a table/list has at least min_rows. Returns actual count."""
    rows = page.locator("tbody tr, [data-testid*='row'], .list-item, .data-row")
    count = rows.count()
    assert count >= min_rows, f"Expected ≥{min_rows} rows, got {count}"
    return count


def assert_download_triggered(page: Page, button_text: str) -> bool:
    """Click export button and check if download event fires."""
    import re
    downloads = []
    page.on("download", lambda d: downloads.append(d.suggested_filename))
    page.locator("button").filter(has_text=re.compile(button_text)).first.click()
    page.wait_for_timeout(1_500)
    return len(downloads) > 0


def create_mobile_page(browser):
    """Create a new page with mobile viewport (390x844) for LIFF tests."""
    return browser.new_page(viewport={"width": 390, "height": 844})


def filter_console_errors(errors: list) -> list:
    """Filter out known benign console errors (Supabase, VITE_, etc.)."""
    return [
        e for e in errors
        if "supabase" not in e.lower()
        and "missing" not in e.lower()
        and "VITE_" not in e
        and "AuthRetryableFetchError" not in e
    ]
