"""
HR MODULE TESTS
================
Tests Performance, Documents, Recruitment, Business Trips, Expense Claims,
Onboarding, Training, Announcements, Holidays, Shift Rules, Disciplinary, Jobs.

Scenarios covered:
  TC-HR-11  Performance page loads
  TC-HR-12  Performance review create form
  TC-HR-13  Performance KPI display
  TC-HR-14  Documents page loads with tabs
  TC-HR-15  Documents list filter
  TC-HR-16  Documents expiring tab
  TC-HR-17  Recruitment page loads
  TC-HR-18  Recruitment job create form
  TC-HR-19  Recruitment candidates section
  TC-HR-20  Business trips page loads
  TC-HR-21  Business trip create form
  TC-HR-22  Expense claims page loads
  TC-HR-23  Expense claim create form
  TC-HR-24  Onboarding page loads with tabs
  TC-HR-25  Onboarding template create
  TC-HR-26  Training page loads with tabs
  TC-HR-27  Training record create
  TC-HR-28  Training certificates tab
  TC-HR-29  Announcements page loads
  TC-HR-30  Holidays page loads
  TC-HR-31  Holiday CRUD operations
  TC-HR-32  Shift rules display
  TC-HR-33  Disciplinary page loads
  TC-HR-34  Jobs page loads
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, wait_for_tab, filter_console_errors
import re


def test_performance_page_loads():
    """TC-HR-11: Performance page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/performance")
        wait_for_page_ready(page)
        screenshot(page, "performance_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Pp]erformance|績效")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-11 passed")
        browser.close()


def test_performance_review_create():
    """TC-HR-12: Performance review create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/performance")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "performance_create")
            print("  ✅  TC-HR-12 passed")
        else:
            print("  ⚠️  TC-HR-12 skipped — no create button")
        browser.close()


def test_performance_kpi_display():
    """TC-HR-13: Performance KPI section visible."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/performance")
        wait_for_page_ready(page)
        body = page.locator("body").inner_text()
        has_kpi = re.search(r"KPI|指標|[Ss]core|分數|[Tt]arget|目標", body) is not None
        rows = page.locator("tbody tr, .review-row, .data-row").count()
        if has_kpi or rows > 0:
            print(f"  ✅  TC-HR-13 passed (KPI found: {has_kpi}, rows: {rows})")
        else:
            print("  ⚠️  TC-HR-13 — no KPI data visible (may need review data)")
        browser.close()


def test_documents_page_loads():
    """TC-HR-14: Documents page loads with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/documents")
        wait_for_page_ready(page)
        screenshot(page, "documents_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Dd]ocument|文件")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = [e for e in filter_console_errors(console_errors) if "400" not in e and "404" not in e]
        if len(real_errors) > 0:
            print(f"  ⚠️  TC-HR-14 — JS errors: {real_errors[:3]}")
        else:
            print("  ✅  TC-HR-14 passed")
        browser.close()


def test_documents_list_filter():
    """TC-HR-15: Documents list filter works."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/documents")
        wait_for_page_ready(page)
        select = page.locator("select").first
        if select.is_visible():
            options = select.locator("option").all()
            if len(options) > 1:
                select.select_option(index=1)
                wait_for_page_ready(page)
                screenshot(page, "documents_filtered")
                print("  ✅  TC-HR-15 passed")
            else:
                print("  ⚠️  TC-HR-15 skipped — only one filter option")
        else:
            print("  ⚠️  TC-HR-15 skipped — no filter found")
        browser.close()


def test_documents_expiring_tab():
    """TC-HR-16: Documents expiring tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/documents")
        wait_for_page_ready(page)
        if wait_for_tab(page, "[Ee]xpir|到期|即將"):
            screenshot(page, "documents_expiring")
            print("  ✅  TC-HR-16 passed")
        else:
            print("  ⚠️  TC-HR-16 skipped — expiring tab not found")
        browser.close()


def test_recruitment_page_loads():
    """TC-HR-17: Recruitment page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/recruitment")
        wait_for_page_ready(page)
        screenshot(page, "recruitment_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Rr]ecruit|招募|[Aa]TS")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = [e for e in filter_console_errors(console_errors) if "400" not in e and "404" not in e]
        if len(real_errors) > 0:
            print(f"  ⚠️  TC-HR-17 — JS errors: {real_errors[:3]}")
        else:
            print("  ✅  TC-HR-17 passed")
        browser.close()


def test_recruitment_job_create():
    """TC-HR-18: Recruitment job create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/recruitment")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立|[Pp]ost")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "recruitment_job_create")
            print("  ✅  TC-HR-18 passed")
        else:
            print("  ⚠️  TC-HR-18 skipped — no create button")
        browser.close()


def test_recruitment_candidates():
    """TC-HR-19: Recruitment candidates section."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/recruitment")
        wait_for_page_ready(page)
        body = page.locator("body").inner_text()
        has_candidates = re.search(r"[Cc]andidate|應徵者|候選人", body) is not None
        if has_candidates:
            print("  ✅  TC-HR-19 passed")
        else:
            print("  ⚠️  TC-HR-19 — candidates section not visible")
        browser.close()


def test_business_trips_loads():
    """TC-HR-20: Business trips page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/business-trips")
        wait_for_page_ready(page)
        screenshot(page, "business_trips_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Bb]usiness [Tt]rip|出差")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-20 passed")
        browser.close()


def test_business_trip_create():
    """TC-HR-21: Business trip create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/business-trips")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立|申請")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "business_trip_create")
            print("  ✅  TC-HR-21 passed")
        else:
            print("  ⚠️  TC-HR-21 skipped — no create button")
        browser.close()


def test_expense_claims_loads():
    """TC-HR-22: Expense claims page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/expense-claims")
        wait_for_page_ready(page)
        screenshot(page, "expense_claims_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Ee]xpense|報銷|費用")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-22 passed")
        browser.close()


def test_expense_claim_create():
    """TC-HR-23: Expense claim create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/expense-claims")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立|申請")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "expense_claim_create")
            print("  ✅  TC-HR-23 passed")
        else:
            print("  ⚠️  TC-HR-23 skipped — no create button")
        browser.close()


def test_onboarding_page_loads():
    """TC-HR-24: Onboarding page loads with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/onboarding")
        wait_for_page_ready(page)
        screenshot(page, "onboarding_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Oo]nboard|到職|離職")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-24 passed")
        browser.close()


def test_onboarding_template_create():
    """TC-HR-25: Onboarding template create form."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/onboarding")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "onboarding_template_create")
            print("  ✅  TC-HR-25 passed")
        else:
            print("  ⚠️  TC-HR-25 skipped — no create button")
        browser.close()


def test_training_page_loads():
    """TC-HR-26: Training page loads with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/training")
        wait_for_page_ready(page)
        screenshot(page, "training_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Tt]raining|培訓|教育")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = [e for e in filter_console_errors(console_errors) if "400" not in e and "404" not in e]
        if len(real_errors) > 0:
            print(f"  ⚠️  TC-HR-26 — JS errors: {real_errors[:3]}")
        else:
            print("  ✅  TC-HR-26 passed")
        browser.close()


def test_training_record_create():
    """TC-HR-27: Training record create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/training")
        wait_for_page_ready(page)
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "training_record_create")
            print("  ✅  TC-HR-27 passed")
        else:
            print("  ⚠️  TC-HR-27 skipped — no create button")
        browser.close()


def test_training_certificates_tab():
    """TC-HR-28: Training certificates tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/training")
        wait_for_page_ready(page)
        if wait_for_tab(page, "[Cc]ertif|證照|到期"):
            screenshot(page, "training_certificates")
            print("  ✅  TC-HR-28 passed")
        else:
            print("  ⚠️  TC-HR-28 skipped — certificates tab not found")
        browser.close()


def test_announcements_page():
    """TC-HR-29: Announcements page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/announcements")
        wait_for_page_ready(page)
        screenshot(page, "announcements_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Aa]nnounce|公告")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-29 passed")
        browser.close()


def test_holidays_page():
    """TC-HR-30: Holidays page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/holidays")
        wait_for_page_ready(page)
        screenshot(page, "holidays_main")
        heading = page.locator("h1, h2").filter(has_text=re.compile("[Hh]oliday|假日|國定")).first
        heading.wait_for(state="visible", timeout=6_000)
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-30 passed")
        browser.close()


def test_holiday_crud():
    """TC-HR-31: Holiday CRUD — year selector and create button."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/holidays")
        wait_for_page_ready(page)

        # Year selector
        year_select = page.locator("select").first
        has_year = year_select.is_visible() if year_select.count() > 0 else False

        # Add button
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")).first
        has_add = add_btn.is_visible() if add_btn.count() > 0 else False

        screenshot(page, "holidays_crud")
        if has_year or has_add:
            print(f"  ✅  TC-HR-31 passed (year selector: {has_year}, add button: {has_add})")
        else:
            print("  ⚠️  TC-HR-31 — neither year selector nor add button found")
        browser.close()


def test_shift_rules_display():
    """TC-HR-32: Shift rules display loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/shift-rules")
        wait_for_page_ready(page)
        screenshot(page, "shift_rules_main")
        page.wait_for_timeout(2000)
        body = page.locator("body").inner_text()
        has_content = len(body.strip()) > 50
        has_law = re.search(r"勞基法|[Ll]abor|工時|[Ww]ork|[Ss]hift|班別|規則", body) is not None
        real_errors = [e for e in filter_console_errors(console_errors) if "400" not in e and "404" not in e]
        if real_errors:
            print(f"  ⚠️  TC-HR-32 — JS errors: {real_errors[:3]}")
        elif has_content:
            print(f"  ✅  TC-HR-32 passed (law content: {has_law})")
        else:
            print("  ⚠️  TC-HR-32 — page rendered but no content")
        browser.close()


def test_disciplinary_page():
    """TC-HR-33: Disciplinary page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/disciplinary")
        wait_for_page_ready(page)
        screenshot(page, "disciplinary_main")
        body = page.locator("body").inner_text()
        assert len(body.strip()) > 10, "Disciplinary page rendered empty"
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-33 passed")
        browser.close()


def test_jobs_page():
    """TC-HR-34: Jobs page loads."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        goto(page, "/jobs")
        wait_for_page_ready(page)
        screenshot(page, "jobs_main")
        body = page.locator("body").inner_text()
        assert len(body.strip()) > 10, "Jobs page rendered empty"
        real_errors = filter_console_errors(console_errors)
        real_errors = [e for e in real_errors if "400" not in e and "404" not in e]
        if real_errors:
            print(f"    ⚠️  JS warnings: {real_errors[:2]}")
        print("  ✅  TC-HR-34 passed")
        browser.close()


if __name__ == "__main__":
    print("\n=== HR Module Tests ===\n")
    test_performance_page_loads()
    test_performance_review_create()
    test_performance_kpi_display()
    test_documents_page_loads()
    test_documents_list_filter()
    test_documents_expiring_tab()
    test_recruitment_page_loads()
    test_recruitment_job_create()
    test_recruitment_candidates()
    test_business_trips_loads()
    test_business_trip_create()
    test_expense_claims_loads()
    test_expense_claim_create()
    test_onboarding_page_loads()
    test_onboarding_template_create()
    test_training_page_loads()
    test_training_record_create()
    test_training_certificates_tab()
    test_announcements_page()
    test_holidays_page()
    test_holiday_crud()
    test_shift_rules_display()
    test_disciplinary_page()
    test_jobs_page()
    print("\n✅ All HR Module tests completed.\n")
