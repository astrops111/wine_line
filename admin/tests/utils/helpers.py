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
