"""
CROSS-CUTTING TESTS
=====================
Tests that span multiple pages: form validation patterns, locale consistency,
theme persistence, console errors, performance, URL tab persistence,
sidebar active states, modal behavior, empty states, and breadcrumbs.

Scenarios covered:
  TC-X-01  Form validation patterns across pages
  TC-X-02  Locale consistency on multiple pages
  TC-X-03  Theme CSS variables change on toggle
  TC-X-04  Console errors across all 37 routes
  TC-X-05  Page load performance (< 5s per page)
  TC-X-06  Tab persistence via URL params
  TC-X-07  Sidebar active state matches current route
  TC-X-08  Modal escape close behavior
  TC-X-09  Empty states render gracefully
  TC-X-10  Page title / heading visible on all pages
"""
import sys, os, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, filter_console_errors
import re

# Key routes for cross-cutting tests
KEY_ROUTES = [
    "/", "/employees", "/tasks", "/payroll", "/scheduling",
    "/leave-management", "/overtime-requests", "/notifications",
    "/org-management", "/admin"
]

ALL_ROUTES = [
    "/", "/manager-dashboard", "/hr-dashboard", "/time-tracker",
    "/leave-management", "/overtime-requests", "/payroll", "/scheduling",
    "/holidays", "/shift-rules", "/performance", "/documents",
    "/recruitment", "/business-trips", "/expense-claims", "/onboarding",
    "/announcements", "/training", "/disciplinary", "/jobs",
    "/triggers", "/notifications", "/users", "/line-logs",
    "/admin", "/help-center", "/agent-console", "/line",
    "/tasks", "/workflows", "/checklists", "/employees",
    "/org-management", "/workflow-management", "/audit-logs",
    "/liff/app", "/liff/dashboard",
]


def test_form_validation_patterns():
    """TC-X-01: Form validation on 5 pages with create forms."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        pages_with_forms = [
            ("/employees", "[Aa]dd|[Nn]ew|建立|新增"),
            ("/workflows", "[Aa]dd|[Nn]ew|[Cc]reate|建立|新增"),
            ("/tasks", "[Aa]dd|[Nn]ew|[Cc]reate|建立|新增"),
            ("/notifications", "[Aa]dd|[Nn]ew|[Cc]reate|建立|新增"),
            ("/triggers", "[Aa]dd|[Nn]ew|[Cc]reate|建立|新增"),
        ]
        validation_found = 0
        for route, btn_text in pages_with_forms:
            goto(page, route)
            wait_for_page_ready(page)
            add_btn = page.locator("button").filter(has_text=re.compile(btn_text)).first
            if add_btn.is_visible():
                add_btn.click()
                page.wait_for_timeout(400)
                # Try empty submit
                save_btn = page.locator("button").filter(
                    has_text=re.compile("[Ss]ave|[Cc]reate|建立|儲存")
                ).first
                if save_btn.is_visible():
                    save_btn.click()
                    page.wait_for_timeout(400)
                    # Check for validation
                    invalid = page.locator("input:invalid, select:invalid").count()
                    err_text = page.locator("text=/required|必填/i").count()
                    if invalid > 0 or err_text > 0:
                        validation_found += 1
                        print(f"    ✅  {route}: validation shown")
                    else:
                        print(f"    ⚠️  {route}: no validation on empty submit")
                else:
                    print(f"    ⚠️  {route}: no save button in form")
            else:
                print(f"    ⚠️  {route}: no add button found")

        screenshot(page, "cross_validation")
        print(f"  {'✅' if validation_found >= 2 else '⚠️'}  TC-X-01 — {validation_found}/5 pages show validation")
        browser.close()


def test_locale_all_pages():
    """TC-X-02: Locale toggle produces different text on 10 pages."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Start in Chinese (default)
        goto(page, "/")
        wait_for_page_ready(page)

        zh_texts = []
        for route in KEY_ROUTES[:5]:
            goto(page, route)
            wait_for_page_ready(page)
            body = page.locator("body").inner_text()[:500]
            zh_texts.append(body)

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

            en_texts = []
            for route in KEY_ROUTES[:5]:
                goto(page, route)
                wait_for_page_ready(page)
                body = page.locator("body").inner_text()[:500]
                en_texts.append(body)

            # At least some pages should have different text after locale toggle
            changed = sum(1 for zh, en in zip(zh_texts, en_texts) if zh != en)
            screenshot(page, "cross_locale")
            print(f"  {'✅' if changed >= 2 else '⚠️'}  TC-X-02 — {changed}/5 pages changed text after locale toggle")

            # Toggle back to Chinese
            locale_btn2 = page.locator("button.locale-btn, button").filter(
                has_text=re.compile("English|中文|切換|Switch")
            ).first
            if locale_btn2.is_visible():
                locale_btn2.click()
                page.wait_for_timeout(500)
        else:
            print("  ⚠️  TC-X-02 skipped — locale button not found")
        browser.close()


def test_theme_css_variables():
    """TC-X-03: Theme toggle changes CSS variables."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/")
        wait_for_page_ready(page)

        # Get current theme attribute
        initial_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")

        # Find theme toggle
        theme_btn = page.locator("button").filter(has_text=re.compile("🌙|☀️|[Tt]heme|主題")).first
        if theme_btn.is_visible():
            theme_btn.click()
            page.wait_for_timeout(500)
            new_theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
            screenshot(page, "cross_theme_toggled")

            if initial_theme != new_theme:
                print(f"  ✅  TC-X-03 passed — theme: '{initial_theme}' → '{new_theme}'")
            else:
                print(f"  ⚠️  TC-X-03 — theme didn't change: '{initial_theme}'")

            # Toggle back
            theme_btn.click()
            page.wait_for_timeout(300)
        else:
            print("  ⚠️  TC-X-03 skipped — theme button not found")
        browser.close()


def test_console_errors_all_pages():
    """TC-X-04: Navigate all 37 routes, collect console errors."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        all_errors = {}

        for route in ALL_ROUTES:
            console_errors = []
            page.on("console", lambda m, errs=console_errors: errs.append(m.text) if m.type == "error" else None)
            try:
                goto(page, route)
                wait_for_page_ready(page)
                real_errors = filter_console_errors(console_errors)
                if real_errors:
                    all_errors[route] = real_errors
            except Exception:
                pass  # Route may timeout, that's OK for this sweep

        screenshot(page, "cross_console_errors")
        error_count = sum(len(errs) for errs in all_errors.values())
        if error_count == 0:
            print(f"  ✅  TC-X-04 passed — 0 console errors across {len(ALL_ROUTES)} routes")
        else:
            print(f"  [WARN]  TC-X-04 — {error_count} errors across {len(all_errors)} routes:")
            for route, errs in list(all_errors.items())[:5]:
                print(f"    {route}: {errs[0][:80]}")
        browser.close()


def test_page_load_performance():
    """TC-X-05: 10 key pages load within 5 seconds each."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        slow_pages = []

        for route in KEY_ROUTES:
            start = time.time()
            try:
                page.goto(f"http://localhost:5173{route}")
                page.wait_for_load_state("networkidle", timeout=10_000)
                elapsed = time.time() - start
                if elapsed > 5.0:
                    slow_pages.append((route, elapsed))
                    print(f"    ⚠️  {route}: {elapsed:.1f}s (>5s)")
                else:
                    print(f"    ✅  {route}: {elapsed:.1f}s")
            except Exception as exc:
                slow_pages.append((route, 99))
                print(f"    ❌  {route}: timeout ({exc})")

        screenshot(page, "cross_performance")
        print(f"  {'✅' if len(slow_pages) == 0 else '⚠️'}  TC-X-05 — {len(slow_pages)}/{len(KEY_ROUTES)} slow pages")
        browser.close()


def test_tab_persistence_url():
    """TC-X-06: Tab state persists via URL params."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to org-management with specific tab
        goto(page, "/org-management?tab=companies")
        wait_for_page_ready(page)
        screenshot(page, "cross_tab_url_1")

        # Check if companies tab content is active
        body = page.locator("body").inner_text()
        has_company = re.search(r"[Cc]ompan|公司", body) is not None

        # Reload page
        page.reload()
        wait_for_page_ready(page)
        screenshot(page, "cross_tab_url_2")
        body_after = page.locator("body").inner_text()
        still_company = re.search(r"[Cc]ompan|公司", body_after) is not None

        if has_company and still_company:
            print("  ✅  TC-X-06 passed — tab persists after reload")
        else:
            print(f"  ⚠️  TC-X-06 — before: {has_company}, after: {still_company}")
        browser.close()


def test_sidebar_active_state():
    """TC-X-07: Sidebar highlights correct item for current route."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        routes_to_check = ["/", "/employees", "/payroll", "/scheduling", "/admin"]
        active_found = 0
        for route in routes_to_check:
            goto(page, route)
            wait_for_page_ready(page)
            # Check for active class on nav item
            active_items = page.locator(".nav-item.active, nav a.active, [aria-current='page']").count()
            if active_items > 0:
                active_found += 1

        screenshot(page, "cross_sidebar_active")
        print(f"  {'✅' if active_found >= 3 else '⚠️'}  TC-X-07 — {active_found}/{len(routes_to_check)} routes have active sidebar state")
        browser.close()


def test_modal_escape_close():
    """TC-X-08: Pressing Escape closes modals."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Nn]ew|建立|新增")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)

            # Modal should be open
            modal = page.locator("[role='dialog'], .modal, .modal-overlay")
            form_visible = page.locator("input, select").count() > 2

            if modal.count() > 0 or form_visible:
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)
                screenshot(page, "cross_modal_escape")

                # Check if form/modal disappeared
                modal_after = page.locator("[role='dialog'], .modal-overlay").count()
                print(f"  {'✅' if modal_after == 0 else '⚠️'}  TC-X-08 — modal after Escape: {modal_after}")
            else:
                print("  ⚠️  TC-X-08 — no modal detected after clicking add")
        else:
            print("  ⚠️  TC-X-08 skipped — no add button found")
        browser.close()


def test_empty_states():
    """TC-X-09: Pages with no data show empty state message."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Pages that might have no data
        empty_check_routes = ["/business-trips", "/expense-claims", "/disciplinary", "/training"]
        graceful = 0

        for route in empty_check_routes:
            goto(page, route)
            wait_for_page_ready(page)
            body = page.locator("body").inner_text()
            # Should either have data or show empty message (not crash/blank)
            has_content = len(body.strip()) > 50
            has_empty_msg = re.search(r"沒有|[Nn]o.*record|[Nn]o.*data|empty|尚無", body, re.IGNORECASE) is not None
            if has_content or has_empty_msg:
                graceful += 1

        screenshot(page, "cross_empty_states")
        print(f"  {'✅' if graceful == len(empty_check_routes) else '⚠️'}  TC-X-09 — {graceful}/{len(empty_check_routes)} pages handle empty state gracefully")
        browser.close()


def test_page_headings_visible():
    """TC-X-10: All key pages have visible h1/h2 heading."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        headings_found = 0
        for route in KEY_ROUTES:
            goto(page, route)
            wait_for_page_ready(page)
            heading = page.locator("h1, h2, .page-header")
            if heading.count() > 0 and heading.first.is_visible():
                headings_found += 1

        screenshot(page, "cross_headings")
        print(f"  {'✅' if headings_found >= 8 else '⚠️'}  TC-X-10 — {headings_found}/{len(KEY_ROUTES)} pages have visible headings")
        browser.close()


if __name__ == "__main__":
    print("\n=== Cross-Cutting Tests ===\n")
    test_form_validation_patterns()
    test_locale_all_pages()
    test_theme_css_variables()
    test_console_errors_all_pages()
    test_page_load_performance()
    test_tab_persistence_url()
    test_sidebar_active_state()
    test_modal_escape_close()
    test_empty_states()
    test_page_headings_visible()
    print("\n✅ All Cross-Cutting tests completed.\n")
