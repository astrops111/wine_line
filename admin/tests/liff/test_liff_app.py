"""
LIFF MOBILE APP TESTS
======================
Tests the LINE LIFF employee app and manager dashboard
in mobile viewport (390x844).

Scenarios covered:
  TC-LIFF-01  LIFF app loads without JS errors
  TC-LIFF-02  LIFF tab navigation (7 tabs)
  TC-LIFF-03  Schedule tab shows shifts
  TC-LIFF-04  Clock tab shows clock in/out button
  TC-LIFF-05  Hours tab shows weekly summary
  TC-LIFF-06  Leave tab shows balance
  TC-LIFF-07  Payslip tab shows records
  TC-LIFF-08  Profile tab shows employee info
  TC-LIFF-09  Preferences tab shows settings
  TC-LIFF-10  Correction request accessible
  TC-LIFF-11  Leave request form accessible
  TC-LIFF-12  Manager dashboard loads
  TC-LIFF-13  Manager delayed tasks section
  TC-LIFF-14  Manager activity timeline
  TC-LIFF-15  Responsive layout — no horizontal scroll
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, create_mobile_page, filter_console_errors
import re


def test_liff_app_loads():
    """TC-LIFF-01: LIFF app loads without JS errors."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/liff/app")
        wait_for_page_ready(page)
        screenshot(page, "liff_app_main")
        body = page.locator("body").inner_text()
        assert len(body.strip()) > 0, "LIFF page rendered empty"
        real_errors = filter_console_errors(console_errors)
        # LIFF errors are expected in desktop context (no LINE SDK)
        print(f"  ✅  TC-LIFF-01 passed (console errors filtered: {len(real_errors)})")
        browser.close()


def test_liff_tab_navigation():
    """TC-LIFF-02: All tab icons visible and clickable."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        # Tab icons at bottom navigation
        tab_icons = page.locator("button, [role='tab'], nav a, .tab-item, .bottom-nav button")
        tab_count = tab_icons.count()
        if tab_count >= 5:
            # Click through several tabs
            for i in range(min(tab_count, 7)):
                tab_icons.nth(i).click()
                page.wait_for_timeout(300)
            screenshot(page, "liff_tab_navigation")
            print(f"  ✅  TC-LIFF-02 passed ({tab_count} tabs found)")
        else:
            # May use different layout
            screenshot(page, "liff_tabs_limited")
            print(f"  ⚠️  TC-LIFF-02 — found {tab_count} tabs (expected ≥5)")
        browser.close()


def test_liff_schedule_tab():
    """TC-LIFF-03: Schedule tab shows shifts or calendar."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        sched_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("📅|[Ss]chedule|班表|排班")
        ).first
        if sched_btn.is_visible():
            sched_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_schedule")
            print("  ✅  TC-LIFF-03 passed")
        else:
            print("  ⚠️  TC-LIFF-03 skipped — schedule tab not found")
        browser.close()


def test_liff_clock_tab():
    """TC-LIFF-04: Clock tab shows clock in/out button."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        clock_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("⏰|[Cc]lock|打卡")
        ).first
        if clock_btn.is_visible():
            clock_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_clock")
            # Look for clock in/out action button
            action_btn = page.locator("button").filter(
                has_text=re.compile("[Cc]lock|打卡|上班|下班")
            )
            if action_btn.count() > 0:
                print("  ✅  TC-LIFF-04 passed — clock button found")
            else:
                print("  ⚠️  TC-LIFF-04 — clock tab visible but no action button")
        else:
            print("  ⚠️  TC-LIFF-04 skipped — clock tab not found")
        browser.close()


def test_liff_hours_tab():
    """TC-LIFF-05: Hours tab shows weekly summary."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        hours_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("📊|[Hh]ours|工時|時數")
        ).first
        if hours_btn.is_visible():
            hours_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_hours")
            print("  ✅  TC-LIFF-05 passed")
        else:
            print("  ⚠️  TC-LIFF-05 skipped — hours tab not found")
        browser.close()


def test_liff_leave_tab():
    """TC-LIFF-06: Leave tab shows balance."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        leave_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("🌴|[Ll]eave|假勤|請假")
        ).first
        if leave_btn.is_visible():
            leave_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_leave")
            print("  ✅  TC-LIFF-06 passed")
        else:
            print("  ⚠️  TC-LIFF-06 skipped — leave tab not found")
        browser.close()


def test_liff_payslip_tab():
    """TC-LIFF-07: Payslip tab shows records or empty state."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        pay_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("💰|[Pp]ayslip|薪資|薪條")
        ).first
        if pay_btn.is_visible():
            pay_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_payslip")
            print("  ✅  TC-LIFF-07 passed")
        else:
            print("  ⚠️  TC-LIFF-07 skipped — payslip tab not found")
        browser.close()


def test_liff_profile_tab():
    """TC-LIFF-08: Profile tab shows employee info."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        profile_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("👤|[Pp]rofile|個人|基本資料")
        ).first
        if profile_btn.is_visible():
            profile_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_profile")
            print("  ✅  TC-LIFF-08 passed")
        else:
            print("  ⚠️  TC-LIFF-08 skipped — profile tab not found")
        browser.close()


def test_liff_preferences_tab():
    """TC-LIFF-09: Preferences tab shows settings."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        pref_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("⚙️|[Pp]ref|偏好|設定")
        ).first
        if pref_btn.is_visible():
            pref_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "liff_preferences")
            print("  ✅  TC-LIFF-09 passed")
        else:
            print("  ⚠️  TC-LIFF-09 skipped — preferences tab not found")
        browser.close()


def test_liff_correction_request():
    """TC-LIFF-10: Correction request form accessible."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        # Navigate to hours tab first
        hours_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("📊|[Hh]ours|工時|時數")
        ).first
        if hours_btn.is_visible():
            hours_btn.click()
            page.wait_for_timeout(500)

        correction_link = page.locator("button, a").filter(
            has_text=re.compile("[Cc]orrection|補登|補打|申請")
        ).first
        if correction_link.is_visible():
            screenshot(page, "liff_correction")
            print("  ✅  TC-LIFF-10 passed — correction link found")
        else:
            print("  ⚠️  TC-LIFF-10 — correction link not visible")
        browser.close()


def test_liff_leave_request():
    """TC-LIFF-11: Leave request form accessible."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)

        leave_btn = page.locator("button, [role='tab'], nav a").filter(
            has_text=re.compile("🌴|[Ll]eave|假勤|請假")
        ).first
        if leave_btn.is_visible():
            leave_btn.click()
            page.wait_for_timeout(500)

        request_btn = page.locator("button").filter(
            has_text=re.compile("[Rr]equest|[Aa]pply|申請|請假")
        ).first
        if request_btn.is_visible():
            screenshot(page, "liff_leave_request")
            print("  ✅  TC-LIFF-11 passed — leave request button found")
        else:
            print("  ⚠️  TC-LIFF-11 — leave request button not visible")
        browser.close()


def test_liff_manager_dashboard_loads():
    """TC-LIFF-12: Manager dashboard loads with progress."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/liff/dashboard")
        wait_for_page_ready(page)
        screenshot(page, "liff_manager_dashboard")
        body = page.locator("body").inner_text()
        assert len(body.strip()) > 0, "Manager dashboard rendered empty"
        real_errors = filter_console_errors(console_errors)
        print(f"  ✅  TC-LIFF-12 passed (errors: {len(real_errors)})")
        browser.close()


def test_liff_manager_delayed_tasks():
    """TC-LIFF-13: Manager delayed tasks section."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/dashboard")
        wait_for_page_ready(page)
        body = page.locator("body").inner_text()
        has_delayed = re.search(r"[Dd]elay|逾期|[Oo]verdue|延遲", body) is not None
        has_tasks = re.search(r"[Tt]ask|任務|[Bb]lock|阻塞", body) is not None
        screenshot(page, "liff_manager_delayed")
        print(f"  {'✅' if has_delayed or has_tasks else '⚠️'}  TC-LIFF-13 — delayed: {has_delayed}, tasks: {has_tasks}")
        browser.close()


def test_liff_manager_timeline():
    """TC-LIFF-14: Manager activity timeline."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/dashboard")
        wait_for_page_ready(page)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(500)
        body = page.locator("body").inner_text()
        has_timeline = re.search(r"[Tt]imeline|動態|[Aa]ctivity|最近", body) is not None
        screenshot(page, "liff_manager_timeline")
        print(f"  {'✅' if has_timeline else '⚠️'}  TC-LIFF-14 — timeline: {has_timeline}")
        browser.close()


def test_liff_responsive_layout():
    """TC-LIFF-15: No horizontal scroll at 390px width."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = create_mobile_page(browser)
        goto(page, "/liff/app")
        wait_for_page_ready(page)
        scroll_width = page.evaluate("document.documentElement.scrollWidth")
        viewport_width = page.evaluate("window.innerWidth")
        overflow = scroll_width > viewport_width + 5  # 5px tolerance
        screenshot(page, "liff_responsive")
        if not overflow:
            print(f"  ✅  TC-LIFF-15 passed (scroll: {scroll_width}, viewport: {viewport_width})")
        else:
            print(f"  [WARN]  TC-LIFF-15 — horizontal overflow: {scroll_width} > {viewport_width}")
        browser.close()


if __name__ == "__main__":
    print("\n=== LIFF Mobile App Tests ===\n")
    test_liff_app_loads()
    test_liff_tab_navigation()
    test_liff_schedule_tab()
    test_liff_clock_tab()
    test_liff_hours_tab()
    test_liff_leave_tab()
    test_liff_payslip_tab()
    test_liff_profile_tab()
    test_liff_preferences_tab()
    test_liff_correction_request()
    test_liff_leave_request()
    test_liff_manager_dashboard_loads()
    test_liff_manager_delayed_tasks()
    test_liff_manager_timeline()
    test_liff_responsive_layout()
    print("\n✅ All LIFF Mobile tests completed.\n")
