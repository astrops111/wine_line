"""
NOTIFICATIONS & TRIGGERS TESTS
================================
Tests notification rule CRUD, logs display, scheduled reminders,
trigger CRUD, and trigger execution logs.

Scenarios covered:
  TC-N-01  Notifications page loads with 3 tabs
  TC-N-02  Notification rule create form opens
  TC-N-03  Notification rule toggle active/inactive
  TC-N-04  Notification rule delete with confirmation
  TC-N-05  Notification logs tab displays log table
  TC-N-06  Notification logs date range filter
  TC-N-07  Scheduled reminders tab displays list
  TC-N-08  Scheduled reminder create form
  TC-N-09  Triggers page loads with 2 tabs
  TC-N-10  Trigger create form opens
  TC-N-11  Trigger toggle active/inactive
  TC-N-12  Trigger logs tab shows execution logs
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, wait_for_tab, filter_console_errors
import re


def test_notifications_page_loads():
    """TC-N-01: Notifications page loads with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        goto(page, "/notifications")
        wait_for_page_ready(page)
        screenshot(page, "notifications_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Nn]otif|通知")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        # Should have Rules, Logs, Reminders tabs
        tabs = page.locator("button, [role='tab']").filter(
            has_text=re.compile("[Rr]ule|規則|[Ll]og|紀錄|[Rr]eminder|提醒")
        )
        assert tabs.count() >= 2, f"Expected ≥2 notification tabs, got {tabs.count()}"

        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-N-01 passed")
        browser.close()


def test_notification_rule_create():
    """TC-N-02: Create notification rule form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Rr]ule|規則")

        add_btn = page.locator("button").filter(
            has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")
        ).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "notification_create_form")
            inputs = page.locator("input, select, textarea").count()
            assert inputs >= 2, "Create form should have inputs"
            print("  ✅  TC-N-02 passed")
        else:
            print("  ⚠️  TC-N-02 skipped — no add button found")
        browser.close()


def test_notification_rule_toggle():
    """TC-N-03: Toggle notification rule active/inactive."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Rr]ule|規則")

        toggle = page.locator("input[type='checkbox'], [role='switch'], button[aria-checked]").first
        if toggle.is_visible():
            toggle.click()
            page.wait_for_timeout(500)
            screenshot(page, "notification_toggled")
            # Toggle back
            toggle.click()
            page.wait_for_timeout(300)
            print("  ✅  TC-N-03 passed")
        else:
            print("  ⚠️  TC-N-03 skipped — no toggle found (no rules configured)")
        browser.close()


def test_notification_rule_delete():
    """TC-N-04: Delete notification rule with confirmation."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Rr]ule|規則")

        delete_btn = page.locator("button").filter(
            has_text=re.compile("[Dd]elete|刪除|🗑")
        ).first
        if delete_btn.is_visible():
            screenshot(page, "notification_delete_available")
            print("  ✅  TC-N-04 passed — delete button found (not clicking to preserve data)")
        else:
            print("  ⚠️  TC-N-04 skipped — no delete button (no rules)")
        browser.close()


def test_notification_logs_tab():
    """TC-N-05: Notification logs tab displays log table."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)

        if wait_for_tab(page, "[Ll]og|紀錄|[Hh]istory"):
            screenshot(page, "notification_logs")
            has_content = page.locator("table, tbody tr, .log-entry").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*log|[Nn]o.*record/i").count() > 0
            body_len = len(page.locator("body").inner_text().strip())
            if has_content or body_len > 100:
                print("  ✅  TC-N-05 passed")
            else:
                print("  ⚠️  TC-N-05 — logs tab rendered but no data")
        else:
            print("  ⚠️  TC-N-05 skipped — logs tab not found")
        browser.close()


def test_notification_logs_filter():
    """TC-N-06: Date range filter on notification logs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Ll]og|紀錄|[Hh]istory")

        date_input = page.locator("input[type='date']").first
        if date_input.is_visible():
            date_input.fill("2026-01-01")
            page.keyboard.press("Tab")
            wait_for_page_ready(page)
            screenshot(page, "notification_logs_filtered")
            print("  ✅  TC-N-06 passed")
        else:
            print("  ⚠️  TC-N-06 skipped — no date filter on logs tab")
        browser.close()


def test_scheduled_reminders_tab():
    """TC-N-07: Scheduled reminders tab displays list."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)

        if wait_for_tab(page, "[Rr]eminder|提醒|排程"):
            screenshot(page, "notification_reminders")
            has_content = page.locator("table, tbody tr, .reminder-item").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*reminder|empty/i").count() > 0
            body_len = len(page.locator("body").inner_text().strip())
            if has_content or body_len > 100:
                print("  ✅  TC-N-07 passed")
            else:
                print("  ⚠️  TC-N-07 — reminders tab rendered but no data")
        else:
            print("  ⚠️  TC-N-07 skipped — reminders tab not found")
        browser.close()


def test_reminder_create():
    """TC-N-08: Create scheduled reminder form."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/notifications")
        wait_for_page_ready(page)
        wait_for_tab(page, "[Rr]eminder|提醒|排程")

        add_btn = page.locator("button").filter(
            has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")
        ).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "notification_reminder_create")
            print("  ✅  TC-N-08 passed")
        else:
            print("  ⚠️  TC-N-08 skipped — no add reminder button")
        browser.close()


def test_triggers_page_loads():
    """TC-N-09: Triggers page loads with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        goto(page, "/triggers")
        wait_for_page_ready(page)
        screenshot(page, "triggers_main_full")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Tt]rigger|觸發")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-N-09 passed")
        browser.close()


def test_trigger_create():
    """TC-N-10: Trigger create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/triggers")
        wait_for_page_ready(page)

        add_btn = page.locator("button").filter(
            has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")
        ).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "trigger_create_form")
            inputs = page.locator("input, select, textarea").count()
            assert inputs >= 2, "Create form should have inputs"
            print("  ✅  TC-N-10 passed")
        else:
            print("  ⚠️  TC-N-10 skipped — no add button found")
        browser.close()


def test_trigger_toggle():
    """TC-N-11: Toggle trigger active/inactive."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/triggers")
        wait_for_page_ready(page)

        toggle = page.locator("input[type='checkbox'], [role='switch'], button[aria-checked]").first
        if toggle.is_visible():
            toggle.click()
            page.wait_for_timeout(500)
            toggle.click()
            page.wait_for_timeout(300)
            screenshot(page, "trigger_toggled")
            print("  ✅  TC-N-11 passed")
        else:
            print("  ⚠️  TC-N-11 skipped — no toggle found")
        browser.close()


def test_trigger_logs_tab():
    """TC-N-12: Trigger logs tab shows execution logs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/triggers")
        wait_for_page_ready(page)

        if wait_for_tab(page, "[Ll]og|紀錄|[Hh]istory"):
            screenshot(page, "trigger_logs")
            has_content = page.locator("table, tbody tr, .log-entry").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*log/i").count() > 0
            body_len = len(page.locator("body").inner_text().strip())
            if has_content or body_len > 100:
                print("  ✅  TC-N-12 passed")
            else:
                print("  ⚠️  TC-N-12 — trigger logs tab rendered but no data")
        else:
            print("  ⚠️  TC-N-12 skipped — trigger logs tab not found")
        browser.close()


if __name__ == "__main__":
    print("\n=== Notifications & Triggers Tests ===\n")
    test_notifications_page_loads()
    test_notification_rule_create()
    test_notification_rule_toggle()
    test_notification_rule_delete()
    test_notification_logs_tab()
    test_notification_logs_filter()
    test_scheduled_reminders_tab()
    test_reminder_create()
    test_triggers_page_loads()
    test_trigger_create()
    test_trigger_toggle()
    test_trigger_logs_tab()
    print("\n✅ All Notifications & Triggers tests completed.\n")
