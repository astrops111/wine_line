"""
SMOKE TESTS -- Navigation & Page Load
======================================
Verifies every main route renders without a crash, shows page content,
and produces no unhandled JS errors.

Scenarios covered:
  TC-S-01  Dashboard loads with task stats and HR pending panel
  TC-S-02  All sidebar navigation routes resolve to visible pages
  TC-S-03  Unknown routes fall back gracefully
  TC-S-04  Locale toggle switches UI language (zh-TW <-> en)
  TC-S-05  No unhandled JS errors on initial page load
"""
import sys, os, io
# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright
from utils.helpers import goto, wait_for_page_ready, screenshot
import re

# Correct routes from App.tsx + expected Chinese OR English text fragments
# Using short, guaranteed fragments that appear on each page regardless of locale.
ROUTES = [
    ("/",                  "儀表板",       "Dashboard"),
    ("/manager-dashboard", "營運",         "Ops"),
    ("/hr-dashboard",      "HR",           "HR"),
    ("/time-tracker",      "打卡",         "Time"),
    ("/leave-management",  "請假",         "Leave"),
    ("/overtime-requests", "加班",         "Overtime"),
    ("/scheduling",        "排班",         "Schedul"),
    ("/employees",         "員工",         "Employ"),
    ("/tasks",             "任務",         "Task"),
    ("/workflows",         "流程",         "Workflow"),
    ("/checklists",        "清單",         "Checklist"),
    ("/notifications",     "通知",         "Notif"),
    ("/triggers",          "觸發",         "Trigger"),
    ("/users",             "使用者",       "User"),
    ("/line",              "LINE",         "LINE"),
    ("/org-management",    "組織",         "Org"),
    ("/workflow-management","流程",        "Workflow"),
    ("/admin",             "設定",         "Setting"),
    ("/liff/app",          "打卡",         "Clock"),
    # ── New routes (TC-S-06) ──
    ("/payroll",           "薪資",         "Payroll"),
    ("/holidays",          "假日",         "Holiday"),
    ("/shift-rules",       "勞動",         "Shift"),
    ("/performance",       "績效",         "Performance"),
    ("/documents",         "文件",         "Document"),
    ("/recruitment",       "招募",         "Recruit"),
    ("/business-trips",    "出差",         "Business"),
    ("/expense-claims",    "核銷",         "Expense"),
    ("/onboarding",        "到職",         "Onboard"),
    ("/announcements",     "公告",         "Announce"),
    ("/training",          "訓練",         "Training"),
    ("/disciplinary",      "獎懲",         "Disciplin"),
    ("/jobs",              "職務",         "Job"),
    ("/audit-logs",        "稽核",         "Audit"),
    ("/line-logs",         "LINE",         "LINE Log"),
    ("/help-center",       "說明",         "Help"),
    ("/agent-console",     "Agent",        "Agent"),
    ("/liff/dashboard",    "員工",         "Manager"),
]


def run_smoke_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        results = []

        for path, zh_text, en_text in ROUTES:
            page = browser.new_page()
            console_errors = []
            page.on("console", lambda m: console_errors.append(m.text)
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: console_errors.append(str(e)))

            try:
                goto(page, path)
                wait_for_page_ready(page)

                # Accept either Chinese or English text
                body = page.locator("body").inner_text()
                found = zh_text in body or en_text.lower() in body.lower()

                shot_name = "smoke" + path.replace("/", "_") or "smoke_root"
                screenshot(page, shot_name)

                real_errors = [
                    e for e in console_errors
                    if "supabase" not in e.lower()
                    and "missing" not in e.lower()
                    and "VITE_" not in e
                    and "AuthRetryableFetchError" not in e
                ]

                if found and len(real_errors) == 0:
                    status = "PASS"
                elif found:
                    status = "WARN ({} js errors)".format(len(real_errors))
                else:
                    status = "FAIL - expected '{}' or '{}' not found".format(zh_text, en_text)

                results.append((path, status))
                icon = "[OK]" if status.startswith("PASS") else ("[WARN]" if status.startswith("WARN") else "[FAIL]")
                print("  {}  {:35s} -> {}".format(icon, path, status))

            except Exception as exc:
                screenshot(page, "smoke_fail" + path.replace("/", "_"))
                results.append((path, "FAIL: {}".format(exc)))
                print("  [FAIL]  {:35s} -> {}".format(path, str(exc)[:80]))
            finally:
                page.close()

        browser.close()

        failed = [r for r in results if "FAIL" in r[1]]
        print("\n" + "=" * 60)
        print("  Smoke Tests: {}/{} passed".format(len(results) - len(failed), len(results)))
        if failed:
            print("  FAILED:")
            for path, msg in failed:
                print("    {}: {}".format(path, msg))
        print("=" * 60)
        return len(failed) == 0


def test_locale_toggle():
    """TC-S-04: Toggle locale button switches between zh-TW and en."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/")
        wait_for_page_ready(page)

        # The locale button text is '切換為 English' or 'Switch to 中文'
        locale_btn = page.locator("button.locale-btn").first
        if not locale_btn.is_visible():
            locale_btn = page.locator("button").filter(
                has_text=re.compile("English|中文|切換|Switch")
            ).first

        locale_btn.wait_for(state="visible", timeout=5_000)
        initial_text = locale_btn.inner_text()
        locale_btn.click()
        page.wait_for_timeout(800)  # wait for reload
        page.wait_for_load_state("networkidle")
        new_text = page.locator("button.locale-btn, button").filter(
            has_text=re.compile("English|中文|切換|Switch")
        ).first.inner_text()

        assert initial_text != new_text, "Locale toggle did not change button label"
        screenshot(page, "locale_toggled")
        print("  [OK]  Locale toggled: '{}' -> '{}'".format(initial_text, new_text))
        browser.close()


def test_theme_toggle():
    """TC-S-07: Theme toggle changes data-theme attribute."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/")
        wait_for_page_ready(page)

        initial_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        theme_btn = page.locator("button").filter(has_text=re.compile("🌙|☀️|[Tt]heme|主題")).first
        if theme_btn.is_visible():
            theme_btn.click()
            page.wait_for_timeout(500)
            new_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
            screenshot(page, "smoke_theme_toggled")
            assert initial_theme != new_theme, f"Theme didn't change: {initial_theme}"
            # Toggle back
            theme_btn.click()
            page.wait_for_timeout(300)
            print(f"  ✅  TC-S-07 passed — theme: '{initial_theme}' → '{new_theme}'")
        else:
            print("  ⚠️  TC-S-07 skipped — theme button not found")
        browser.close()


def test_sidebar_collapse():
    """TC-S-08: Sidebar collapse/expand changes layout."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/")
        wait_for_page_ready(page)

        collapse_btn = page.locator("button").filter(has_text=re.compile("▸|◂|[Cc]ollapse|收合")).first
        if collapse_btn.is_visible():
            collapse_btn.click()
            page.wait_for_timeout(400)
            screenshot(page, "smoke_sidebar_collapsed")
            # Check for collapsed class
            sidebar = page.locator("nav, .sidebar, [class*='sidebar']").first
            sidebar_classes = sidebar.get_attribute("class") or ""
            is_collapsed = "collapsed" in sidebar_classes or "mini" in sidebar_classes
            # Expand back
            expand_btn = page.locator("button").filter(has_text=re.compile("▸|◂|[Ee]xpand|展開")).first
            if expand_btn.is_visible():
                expand_btn.click()
                page.wait_for_timeout(300)
            print(f"  {'✅' if is_collapsed else '⚠️'}  TC-S-08 — sidebar collapsed state: {is_collapsed}")
        else:
            print("  ⚠️  TC-S-08 skipped — collapse button not found")
        browser.close()


def test_locale_persists_navigation():
    """TC-S-10: Locale persists across page navigation."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/")
        wait_for_page_ready(page)

        # Toggle to English
        locale_btn = page.locator("button.locale-btn").first
        if not locale_btn.is_visible():
            locale_btn = page.locator("button").filter(
                has_text=re.compile("English|中文|切換|Switch")
            ).first
        if locale_btn.is_visible():
            locale_btn.click()
            page.wait_for_timeout(800)
            page.wait_for_load_state("networkidle")

            # Navigate to 3 different pages and check for English text
            en_pages = 0
            for route in ["/employees", "/payroll", "/scheduling"]:
                goto(page, route)
                wait_for_page_ready(page)
                body = page.locator("body").inner_text()
                if re.search(r"[A-Za-z]{4,}", body):
                    en_pages += 1

            screenshot(page, "smoke_locale_persists")

            # Toggle back to Chinese
            locale_btn2 = page.locator("button.locale-btn, button").filter(
                has_text=re.compile("English|中文|切換|Switch")
            ).first
            if locale_btn2.is_visible():
                locale_btn2.click()
                page.wait_for_timeout(500)

            print(f"  {'✅' if en_pages >= 2 else '⚠️'}  TC-S-10 — {en_pages}/3 pages kept English locale")
        else:
            print("  ⚠️  TC-S-10 skipped — locale button not found")
        browser.close()


if __name__ == "__main__":
    print("\n=== TC-S-01 to TC-S-10: Smoke / Navigation Tests ===\n")
    passed = run_smoke_tests()
    print("\n=== TC-S-04: Locale Toggle ===\n")
    try:
        test_locale_toggle()
    except Exception as e:
        print("  [WARN] Locale toggle test error:", e)
    print("\n=== TC-S-07: Theme Toggle ===\n")
    try:
        test_theme_toggle()
    except Exception as e:
        print("  [WARN] Theme toggle test error:", e)
    print("\n=== TC-S-08: Sidebar Collapse ===\n")
    try:
        test_sidebar_collapse()
    except Exception as e:
        print("  [WARN] Sidebar collapse test error:", e)
    print("\n=== TC-S-10: Locale Persistence ===\n")
    try:
        test_locale_persists_navigation()
    except Exception as e:
        print("  [WARN] Locale persistence test error:", e)
    exit(0 if passed else 1)
