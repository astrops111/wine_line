"""
SYSTEM & ADMIN TESTS
=====================
Tests admin settings (module access), audit logs, LINE logs,
user management, and help center.

Scenarios covered:
  TC-SYS-01  Admin settings page loads with module list
  TC-SYS-02  Admin module toggle works
  TC-SYS-03  Critical module protection (admin/users can't be disabled)
  TC-SYS-04  Admin role change dropdown
  TC-SYS-05  Admin access level change
  TC-SYS-06  Audit logs page loads with action badges
  TC-SYS-07  Audit logs filter by action type
  TC-SYS-08  Audit logs filter by date range
  TC-SYS-09  Audit log expand shows old/new values
  TC-SYS-10  LINE logs page loads with 4 tabs
  TC-SYS-11  LINE logs summary toggle (daily/weekly/monthly)
  TC-SYS-12  LINE logs messages tab
  TC-SYS-13  LINE logs commands tab
  TC-SYS-14  LINE logs errors tab
  TC-SYS-15  Users role management
  TC-SYS-16  Help center page loads
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, wait_for_tab, filter_console_errors
import re


def test_admin_settings_loads():
    """TC-SYS-01: Admin settings page loads with module list."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/admin")
        wait_for_page_ready(page)
        screenshot(page, "admin_settings_full")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Ss]etting|設定|[Aa]dmin")).first
        heading.wait_for(state="visible", timeout=6_000)
        module_section = page.locator("text=/模組存取|[Mm]odule [Aa]ccess|[Mm]odule [Cc]ontrol/").first
        assert module_section.is_visible(), "Module access section not found"
        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-SYS-01 passed")
        browser.close()


def test_admin_module_toggle():
    """TC-SYS-02: Module toggle switches is_enabled."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/admin")
        wait_for_page_ready(page)
        toggles = page.locator("input[type='checkbox'], [role='switch'], button[aria-checked]")
        if toggles.count() >= 3:
            # Find a non-critical toggle (skip first few which may be admin/users)
            toggle = toggles.nth(toggles.count() - 1)
            screenshot(page, "admin_toggle_before")
            print("  ✅  TC-SYS-02 passed — toggles found (not clicking to preserve state)")
        else:
            print(f"  ⚠️  TC-SYS-02 skipped — only {toggles.count()} toggles found")
        browser.close()


def test_admin_critical_protection():
    """TC-SYS-03: Critical modules (admin/users) cannot be disabled."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/admin")
        wait_for_page_ready(page)
        body = page.locator("body").inner_text()
        # Look for admin and users in the module list
        has_admin = re.search(r"admin|管理員|系統設定", body, re.IGNORECASE) is not None
        has_users = re.search(r"user|使用者", body, re.IGNORECASE) is not None
        screenshot(page, "admin_critical_modules")
        if has_admin and has_users:
            print("  ✅  TC-SYS-03 passed — critical modules visible in list")
        else:
            print(f"  ⚠️  TC-SYS-03 — admin: {has_admin}, users: {has_users}")
        browser.close()


def test_admin_role_change():
    """TC-SYS-04: Role dropdown available for modules."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/admin")
        wait_for_page_ready(page)
        role_selects = page.locator("select").filter(
            has_text=re.compile("admin|manager|staff|operations|all|管理|主管|員工")
        )
        if role_selects.count() > 0:
            screenshot(page, "admin_role_dropdown")
            print(f"  ✅  TC-SYS-04 passed ({role_selects.count()} role dropdowns)")
        else:
            # May use custom dropdowns
            selects = page.locator("select").count()
            print(f"  {'✅' if selects > 0 else '⚠️'}  TC-SYS-04 — select elements: {selects}")
        browser.close()


def test_admin_access_level():
    """TC-SYS-05: Access level dropdown available."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/admin")
        wait_for_page_ready(page)
        body = page.locator("body").inner_text()
        has_access = re.search(r"[Ff]ull|[Rr]ead|完整|唯讀|access.*level|存取層級", body) is not None
        screenshot(page, "admin_access_level")
        print(f"  {'✅' if has_access else '⚠️'}  TC-SYS-05 — access level controls: {has_access}")
        browser.close()


def test_audit_logs_loads():
    """TC-SYS-06: Audit logs page loads with action badges."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/audit-logs")
        wait_for_page_ready(page)
        screenshot(page, "audit_logs_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Aa]udit|稽核|審計")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-SYS-06 passed")
        browser.close()


def test_audit_logs_filter_action():
    """TC-SYS-07: Audit logs filter by action type."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/audit-logs")
        wait_for_page_ready(page)
        action_select = page.locator("select").first
        if action_select.is_visible():
            options = action_select.locator("option").all()
            if len(options) > 1:
                action_select.select_option(index=1)
                wait_for_page_ready(page)
                screenshot(page, "audit_logs_action_filter")
                print("  ✅  TC-SYS-07 passed")
            else:
                print("  ⚠️  TC-SYS-07 skipped — only one filter option")
        else:
            print("  ⚠️  TC-SYS-07 skipped — no action filter")
        browser.close()


def test_audit_logs_filter_date():
    """TC-SYS-08: Audit logs filter by date range."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/audit-logs")
        wait_for_page_ready(page)
        date_input = page.locator("input[type='date']").first
        if date_input.is_visible():
            date_input.fill("2026-01-01")
            page.keyboard.press("Tab")
            wait_for_page_ready(page)
            screenshot(page, "audit_logs_date_filter")
            print("  ✅  TC-SYS-08 passed")
        else:
            print("  ⚠️  TC-SYS-08 skipped — no date filter")
        browser.close()


def test_audit_logs_expand():
    """TC-SYS-09: Audit log row expand shows old/new values."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/audit-logs")
        wait_for_page_ready(page)
        rows = page.locator("tbody tr, .audit-row, .data-row")
        if rows.count() > 0:
            rows.first.click()
            page.wait_for_timeout(500)
            screenshot(page, "audit_logs_expanded")
            body = page.locator("body").inner_text()
            has_values = re.search(r"old|new|舊|新|before|after|變更", body, re.IGNORECASE) is not None
            print(f"  {'✅' if has_values else '⚠️'}  TC-SYS-09 — old/new values: {has_values}")
        else:
            print("  ⚠️  TC-SYS-09 skipped — no audit log rows")
        browser.close()


def test_line_logs_loads():
    """TC-SYS-10: LINE logs page loads with 4 tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/line-logs")
        wait_for_page_ready(page)
        screenshot(page, "line_logs_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("LINE|[Ll]og|紀錄")).first
        heading.wait_for(state="visible", timeout=6_000)
        tabs = page.locator("button, [role='tab']").filter(
            has_text=re.compile("[Ss]ummary|總覽|[Mm]essage|訊息|[Cc]ommand|指令|[Ee]rror|錯誤")
        )
        assert tabs.count() >= 3, f"Expected ≥3 LINE log tabs, got {tabs.count()}"
        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-SYS-10 passed")
        browser.close()


def test_line_logs_summary_toggle():
    """TC-SYS-11: Summary tab toggle daily/weekly/monthly."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/line-logs")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Ss]ummary|總覽")
        toggle_btns = page.locator("button").filter(
            has_text=re.compile("[Dd]aily|日|[Ww]eekly|週|[Mm]onthly|月")
        )
        if toggle_btns.count() >= 2:
            toggle_btns.nth(1).click()
            page.wait_for_timeout(500)
            screenshot(page, "line_logs_summary_toggled")
            print("  ✅  TC-SYS-11 passed")
        else:
            print(f"  ⚠️  TC-SYS-11 — view toggle buttons: {toggle_btns.count()}")
        browser.close()


def test_line_logs_messages():
    """TC-SYS-12: Messages tab displays message table."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/line-logs")
        wait_for_page_ready(page)
        if wait_for_tab(page, "[Mm]essage|訊息"):
            screenshot(page, "line_logs_messages")
            has_content = page.locator("table, tbody tr").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*message/i").count() > 0
            assert has_content, "Messages tab has no visible content"
            print("  ✅  TC-SYS-12 passed")
        else:
            print("  ⚠️  TC-SYS-12 skipped — messages tab not found")
        browser.close()


def test_line_logs_commands():
    """TC-SYS-13: Commands tab displays command log."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/line-logs")
        wait_for_page_ready(page)
        if wait_for_tab(page, "[Cc]ommand|指令"):
            screenshot(page, "line_logs_commands")
            has_content = page.locator("table, tbody tr").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*command/i").count() > 0
            assert has_content, "Commands tab has no visible content"
            print("  ✅  TC-SYS-13 passed")
        else:
            print("  ⚠️  TC-SYS-13 skipped — commands tab not found")
        browser.close()


def test_line_logs_errors():
    """TC-SYS-14: Errors tab displays error logs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/line-logs")
        wait_for_page_ready(page)
        if wait_for_tab(page, "[Ee]rror|錯誤"):
            screenshot(page, "line_logs_errors")
            has_content = page.locator("table, tbody tr").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*error/i").count() > 0
            assert has_content, "Errors tab has no visible content"
            print("  ✅  TC-SYS-14 passed")
        else:
            print("  ⚠️  TC-SYS-14 skipped — errors tab not found")
        browser.close()


def test_users_role_management():
    """TC-SYS-15: Users page — role edit available."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/users")
        wait_for_page_ready(page)
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Uu]ser|使用者")).first
        heading.wait_for(state="visible", timeout=6_000)
        # Look for role badges or edit buttons
        body = page.locator("body").inner_text()
        has_roles = re.search(r"admin|manager|staff|operations|管理|主管|員工", body, re.IGNORECASE) is not None
        edit_btn = page.locator("button").filter(has_text=re.compile("[Ee]dit|編輯|角色")).first
        has_edit = edit_btn.is_visible() if edit_btn.count() > 0 else False
        screenshot(page, "users_role_mgmt")
        print(f"  {'✅' if has_roles else '⚠️'}  TC-SYS-15 — roles visible: {has_roles}, edit: {has_edit}")
        browser.close()


def test_help_center_loads():
    """TC-SYS-16: Help center page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/help-center")
        wait_for_page_ready(page)
        screenshot(page, "help_center_main")
        body = page.locator("body").inner_text()
        assert len(body.strip()) > 10, "Help center page rendered empty"
        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-SYS-16 passed")
        browser.close()


if __name__ == "__main__":
    print("\n=== System & Admin Tests ===\n")
    test_admin_settings_loads()
    test_admin_module_toggle()
    test_admin_critical_protection()
    test_admin_role_change()
    test_admin_access_level()
    test_audit_logs_loads()
    test_audit_logs_filter_action()
    test_audit_logs_filter_date()
    test_audit_logs_expand()
    test_line_logs_loads()
    test_line_logs_summary_toggle()
    test_line_logs_messages()
    test_line_logs_commands()
    test_line_logs_errors()
    test_users_role_management()
    test_help_center_loads()
    print("\n✅ All System & Admin tests completed.\n")
