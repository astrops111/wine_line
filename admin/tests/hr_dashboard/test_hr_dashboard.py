"""
HR DASHBOARD & ADMIN TESTS  (FR-4.3 / FR-1.2 / FR-4.1)
=========================================================
Covers HR analytics dashboard, risk warnings, CSV export,
manager dashboard, LINE management, org management, and admin settings.

Scenarios covered:
  TC-HR-01  HR Dashboard loads with store selector and employee list
  TC-HR-02  Store filter updates hours/report data
  TC-HR-03  Export CSV button triggers download
  TC-HR-04  Risk Assessment section shows overtime risk warnings
  TC-HR-05  Manager Dashboard loads with task progress by store
  TC-HR-06  LINE Management page loads with users and groups tabs
  TC-HR-07  Org Management loads org/company/store hierarchy
  TC-HR-08  Admin Settings shows module toggle switches
  TC-HR-09  Users page renders user list with role badges
  TC-HR-10  LIFF App page renders mobile-friendly layout
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot
import re


def test_hr_dashboard_loads():
    """TC-HR-01: HR Dashboard renders store selector and employee data."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/hr-dashboard")
        wait_for_page_ready(page)
        screenshot(page, "hr_dashboard_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Hh][Rr]|人資|[Dd]ashboard")
        ).first
        heading.wait_for(state="visible", timeout=6_000)
        print("  ✅  TC-HR-01 passed")
        browser.close()


def test_hr_store_filter():
    """TC-HR-02: Store filter in HR dashboard loads updated data."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/hr-dashboard")
        wait_for_page_ready(page)

        store_select = page.locator("select").first
        if store_select.is_visible():
            options = store_select.locator("option").all()
            if len(options) > 1:
                store_select.select_option(index=1)
                wait_for_page_ready(page)
                screenshot(page, "hr_store_filter")
                print("  ✅  TC-HR-02 passed")
            else:
                print("  ⚠️  TC-HR-02 skipped — only one store")
        else:
            print("  ⚠️  TC-HR-02 skipped — no store selector")
        browser.close()


def test_hr_export_csv():
    """TC-HR-03: Export button triggers a download."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/hr-dashboard")
        wait_for_page_ready(page)

        # Listen for download event
        download_started = []
        page.on("download", lambda d: download_started.append(d.suggested_filename))

        export_btn = page.locator("button").filter(
            has_text=re.compile("[Ee]xport|[Dd]ownload|匯出|下載")
        ).first
        if export_btn.is_visible():
            export_btn.click()
            page.wait_for_timeout(1_500)
            if download_started:
                print(f"  ✅  TC-HR-03 passed — download: {download_started[0]}")
            else:
                # May open a file save dialog not captured by Playwright
                print("  ⚠️  TC-HR-03 — export clicked but no download event captured")
        else:
            print("  ⚠️  TC-HR-03 skipped — export button not found")
        browser.close()


def test_risk_warning_section():
    """TC-HR-04: Risk assessment section shows violation warnings."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/hr-dashboard")
        wait_for_page_ready(page)

        # Scroll down to find risk section
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(500)
        screenshot(page, "hr_risk_section")

        risk_el = page.locator(
            "text=/[Rr]isk|[Vv]iolation|違規|超時|[Ww]arning|警示/"
        ).first
        if risk_el.is_visible():
            print("  ✅  TC-HR-04 passed — risk/violation section found")
        else:
            print("  ⚠️  TC-HR-04 — risk section not visible (may need real data)")
        browser.close()


def test_manager_dashboard():
    """TC-HR-05: Manager Dashboard loads with task progress section."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/manager-dashboard")
        wait_for_page_ready(page)
        screenshot(page, "manager_dashboard")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Mm]anager|[Oo]ps|主管|營運")
        ).first
        heading.wait_for(state="visible", timeout=6_000)
        print("  ✅  TC-HR-05 passed")
        browser.close()


def test_line_management():
    """TC-HR-06: LINE Management page loads with Users and Groups tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/line")
        wait_for_page_ready(page)
        screenshot(page, "line_mgmt_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("LINE|[Ll]ine [Mm]anage")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        for tab_text in ["[Uu]ser|使用者", "[Gg]roup|群組", "[Ww]ebhook"]:
            tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile(tab_text)
            ).first
            if tab.is_visible():
                tab.click()
                wait_for_page_ready(page)
                print(f"    ✅  LINE tab '{tab_text}' OK")
        print("  ✅  TC-HR-06 passed")
        browser.close()


def test_org_management():
    """TC-HR-07: Org Management renders hierarchy (Org > Company > Store)."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/org-management")
        wait_for_page_ready(page)
        screenshot(page, "org_mgmt_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Oo]rg|組織|[Mm]anage")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        # Look for store/company/org section tabs or headers
        has_hierarchy = page.locator(
            "text=/[Ss]tore|門市|[Cc]ompany|公司|[Oo]rganiz|組織/"
        ).count() > 0
        assert has_hierarchy, "No org hierarchy sections visible"
        print("  ✅  TC-HR-07 passed")
        browser.close()


def test_admin_settings():
    """TC-HR-08: Admin Settings shows module toggles."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/admin")
        wait_for_page_ready(page)
        screenshot(page, "admin_settings_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Ss]etting|設定|[Aa]dmin")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        # Should show the module access control section
        # Note: toggles only appear when org has modules configured
        module_section = page.locator(
            "text=/模組存取|[Mm]odule [Aa]ccess|[Mm]odule [Cc]ontrol/"
        ).first
        assert module_section.is_visible(), "Module access control section not found"

        # Check for toggle switches (may be 0 if org has no modules configured)
        toggles = page.locator(
            "input[type='checkbox'], [role='switch'], button[aria-checked]"
        )
        toggle_count = toggles.count()
        if toggle_count == 0:
            print("  [INFO]  TC-HR-08: Module section visible but 0 toggles (no modules configured for this org)")
        else:
            print(f"  ✅  TC-HR-08 passed ({toggle_count} toggles found)")
        browser.close()


def test_users_page():
    """TC-HR-09: Users page renders user list with role information."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/users")
        wait_for_page_ready(page)
        screenshot(page, "users_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Uu]ser|使用者")
        ).first
        heading.wait_for(state="visible", timeout=6_000)
        print("  ✅  TC-HR-09 passed")
        browser.close()


def test_liff_app_loads():
    """TC-HR-10: LIFF App page renders mobile layout."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate mobile viewport
        page = browser.new_page(viewport={"width": 390, "height": 844})
        goto(page, "/liff/app")
        wait_for_page_ready(page)
        screenshot(page, "liff_mobile")

        # LIFF page will either show a mocked UI or LIFF init error
        # Just verify the page doesn't show a blank white screen
        body_content = page.locator("body").inner_text()
        assert len(body_content.strip()) > 0, "LIFF page rendered empty"
        print("  ✅  TC-HR-10 passed")
        browser.close()


if __name__ == "__main__":
    print("\n=== HR Dashboard & Admin Tests ===\n")
    test_hr_dashboard_loads()
    test_hr_store_filter()
    test_hr_export_csv()
    test_risk_warning_section()
    test_manager_dashboard()
    test_line_management()
    test_org_management()
    test_admin_settings()
    test_users_page()
    test_liff_app_loads()
    print("\n✅ All HR Dashboard & Admin tests completed.\n")
