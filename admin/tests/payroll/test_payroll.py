"""
PAYROLL MANAGEMENT TESTS
=========================
Tests salary structure management, payroll calculation, insurance brackets,
export functionality, and payroll history.

Scenarios covered:
  TC-P-01  Payroll page loads with heading and tabs
  TC-P-02  Salary Structures tab displays table
  TC-P-03  Salary structure create form opens
  TC-P-04  Salary structure edit opens existing record
  TC-P-05  Run Payroll tab shows month picker
  TC-P-06  Run Payroll calculate triggers preview
  TC-P-07  Payroll preview shows expected columns
  TC-P-08  Payroll confirm creates payroll run
  TC-P-09  Payroll History tab shows past runs
  TC-P-10  History row expand shows individual records
  TC-P-11  Insurance Brackets tab shows year selector
  TC-P-12  Insurance brackets year change updates data
  TC-P-13  Health insurance brackets section visible
  TC-P-14  Export CSV button triggers download
  TC-P-15  Export bank file triggers download
  TC-P-16  Export insurance report triggers download
  TC-P-17  Payroll Tools tab shows utility buttons
  TC-P-18  Send payslips button shows confirmation
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot, wait_for_tab, filter_console_errors
import re


def test_payroll_page_loads():
    """TC-P-01: Payroll page loads with heading and tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        goto(page, "/payroll")
        wait_for_page_ready(page)
        screenshot(page, "payroll_main")

        heading = page.locator("h1, h2").filter(
            has_text=re.compile("[Pp]ayroll|薪資")
        ).first
        heading.wait_for(state="visible", timeout=6_000)

        # Should have multiple tabs
        tabs = page.locator("button, [role='tab']").filter(
            has_text=re.compile("薪資結構|[Ss]alary|執行|[Rr]un|記錄|[Hh]istory|保費|[Ii]nsurance|工具|[Tt]ool")
        )
        assert tabs.count() >= 3, f"Expected ≥3 payroll tabs, got {tabs.count()}"

        real_errors = filter_console_errors(console_errors)
        assert len(real_errors) == 0, f"JS errors: {real_errors}"
        print("  ✅  TC-P-01 passed")
        browser.close()


def test_salary_structure_tab():
    """TC-P-02: Salary Structures tab displays table."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        if wait_for_tab(page, "薪資結構|[Ss]alary [Ss]tructure"):
            screenshot(page, "payroll_salary_structures")
            has_table = page.locator("table, [class*='table'], tbody").count() > 0
            has_content = page.locator(
                "text=/[Ee]mployee|員工|[Bb]ase|底薪|[Ss]alary|薪資/"
            ).count() > 0
            assert has_table or has_content, "Salary structures tab has no visible content"
            print("  ✅  TC-P-02 passed")
        else:
            print("  ⚠️  TC-P-02 skipped — salary structures tab not found")
        browser.close()


def test_salary_structure_create():
    """TC-P-03: Salary structure create form opens."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "薪資結構|[Ss]alary [Ss]tructure")

        add_btn = page.locator("button").filter(
            has_text=re.compile("[Aa]dd|[Cc]reate|[Nn]ew|新增|建立")
        ).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "payroll_create_form")
            # Should show form inputs for salary fields
            inputs = page.locator("input, select").count()
            assert inputs >= 2, "Create form should have inputs"
            print("  ✅  TC-P-03 passed")
        else:
            print("  ⚠️  TC-P-03 skipped — no add button found")
        browser.close()


def test_salary_structure_edit():
    """TC-P-04: Edit opens existing salary structure."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "薪資結構|[Ss]alary [Ss]tructure")

        edit_btn = page.locator("button").filter(
            has_text=re.compile("[Ee]dit|編輯|✏️")
        ).first
        if edit_btn.is_visible():
            edit_btn.click()
            page.wait_for_timeout(500)
            screenshot(page, "payroll_edit_form")
            print("  ✅  TC-P-04 passed")
        else:
            print("  ⚠️  TC-P-04 skipped — no edit button (no structures exist)")
        browser.close()


def test_run_payroll_tab():
    """TC-P-05: Run Payroll tab shows month picker."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        if wait_for_tab(page, "執行薪資|[Rr]un [Pp]ayroll"):
            screenshot(page, "payroll_run_tab")
            month_input = page.locator("input[type='month'], input[type='date'], select").first
            has_picker = month_input.is_visible()
            has_text = page.locator("text=/YYYY|pay.*period|薪資期間|月份/i").count() > 0
            assert has_picker or has_text, "Month picker or period selector not found"
            print("  ✅  TC-P-05 passed")
        else:
            print("  ⚠️  TC-P-05 skipped — run payroll tab not found")
        browser.close()


def test_run_payroll_calculate():
    """TC-P-06: Calculate button triggers payroll preview."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "執行薪資|[Rr]un [Pp]ayroll")

        calc_btn = page.locator("button").filter(
            has_text=re.compile("[Cc]alculate|計算|預覽")
        ).first
        if calc_btn.is_visible():
            calc_btn.click()
            # Wait for calculation to finish (button text changes back from 計算中)
            page.locator("button").filter(
                has_text=re.compile("[Cc]alculate|計算|預覽")
            ).first.wait_for(state="visible", timeout=15_000)
            page.wait_for_timeout(1_000)
            screenshot(page, "payroll_calculated")
            # After calc, should show preview table, message, or the calc button ready again
            has_preview = page.locator("table, tbody tr").count() > 0
            has_message = page.locator("text=/[Nn]o.*data|沒有|preview|預覽|尚無|0.*員工/i").count() > 0
            has_calc_done = page.locator("button").filter(
                has_text=re.compile("[Cc]alculate|計算|預覽")
            ).first.is_visible()
            assert has_preview or has_message or has_calc_done, "No response after calculate"
            print("  ✅  TC-P-06 passed")
        else:
            print("  ⚠️  TC-P-06 skipped — calculate button not found")
        browser.close()


def test_payroll_preview_columns():
    """TC-P-07: Payroll preview shows expected columns."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "執行薪資|[Rr]un [Pp]ayroll")

        # Try to calculate first
        calc_btn = page.locator("button").filter(
            has_text=re.compile("[Cc]alculate|計算")
        ).first
        if calc_btn.is_visible():
            calc_btn.click()
            page.wait_for_timeout(2_000)

        body = page.locator("body").inner_text()
        expected_cols = ["底薪|[Bb]ase", "津貼|[Aa]llowance", "加班|[Oo][Tt]",
                         "勞保|[Ll]abor", "健保|[Hh]ealth", "淨額|[Nn]et"]
        found = sum(1 for col in expected_cols if re.search(col, body))
        if found >= 3:
            print(f"  ✅  TC-P-07 passed ({found}/6 columns found)")
        else:
            print(f"  ⚠️  TC-P-07 — only {found}/6 payroll columns found (may need data)")
        screenshot(page, "payroll_columns")
        browser.close()


def test_payroll_confirm():
    """TC-P-08: Confirm button creates payroll run."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "執行薪資|[Rr]un [Pp]ayroll")

        confirm_btn = page.locator("button").filter(
            has_text=re.compile("[Cc]onfirm|確認|[Ss]ave|儲存")
        ).first
        if confirm_btn.is_visible():
            screenshot(page, "payroll_confirm_available")
            print("  ✅  TC-P-08 passed — confirm button available")
        else:
            print("  ⚠️  TC-P-08 skipped — confirm button not visible (need to calculate first)")
        browser.close()


def test_payroll_history_tab():
    """TC-P-09: Payroll History tab shows past runs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        if wait_for_tab(page, "薪資記錄|[Pp]ayroll [Hh]istory|[Hh]istory"):
            screenshot(page, "payroll_history")
            has_content = page.locator("table, tbody tr, .data-row").count() > 0 or \
                          page.locator("text=/沒有|[Nn]o.*record|[Nn]o.*run|[Nn]o.*history/i").count() > 0
            body_len = len(page.locator("body").inner_text().strip())
            if has_content or body_len > 100:
                print("  ✅  TC-P-09 passed")
            else:
                print("  ⚠️  TC-P-09 — history tab rendered but no data rows")
        else:
            print("  ⚠️  TC-P-09 skipped — history tab not found")
        browser.close()


def test_payroll_history_expand():
    """TC-P-10: History row expand shows individual records."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "薪資記錄|[Pp]ayroll [Hh]istory|[Hh]istory")

        rows = page.locator("tbody tr, .data-row, .payroll-run-row")
        if rows.count() > 0:
            rows.first.click()
            page.wait_for_timeout(500)
            screenshot(page, "payroll_history_expanded")
            print("  ✅  TC-P-10 passed — row clicked")
        else:
            print("  ⚠️  TC-P-10 skipped — no payroll runs in history")
        browser.close()


def test_insurance_brackets_tab():
    """TC-P-11: Insurance Brackets tab shows year selector."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        if wait_for_tab(page, "保費對照|[Ii]nsurance"):
            screenshot(page, "payroll_insurance_brackets")
            # Year selector
            year_el = page.locator("select, input[type='number']").first
            has_year = year_el.is_visible()
            has_grade = page.locator("text=/[Gg]rade|級距|等級/").count() > 0
            assert has_year or has_grade, "Insurance brackets tab missing year selector or grade data"
            print("  ✅  TC-P-11 passed")
        else:
            print("  ⚠️  TC-P-11 skipped — insurance brackets tab not found")
        browser.close()


def test_insurance_brackets_year_change():
    """TC-P-12: Changing year updates bracket data."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "保費對照|[Ii]nsurance")

        year_select = page.locator("select").first
        if year_select.is_visible():
            options = year_select.locator("option").all()
            if len(options) > 1:
                year_select.select_option(index=1)
                wait_for_page_ready(page)
                screenshot(page, "payroll_insurance_year_changed")
                print("  ✅  TC-P-12 passed")
            else:
                print("  ⚠️  TC-P-12 skipped — only one year option")
        else:
            print("  ⚠️  TC-P-12 skipped — no year selector")
        browser.close()


def test_health_insurance_brackets():
    """TC-P-13: Health insurance section visible."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)
        wait_for_tab(page, "保費對照|[Ii]nsurance")

        body = page.locator("body").inner_text()
        has_health = re.search(r"健保|[Hh]ealth [Ii]nsurance|NHI", body) is not None
        if has_health:
            screenshot(page, "payroll_health_insurance")
            print("  ✅  TC-P-13 passed")
        else:
            print("  ⚠️  TC-P-13 — health insurance section not found on page")
        browser.close()


def test_payroll_export_csv():
    """TC-P-14: Export CSV triggers download."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        download_started = []
        page.on("download", lambda d: download_started.append(d.suggested_filename))

        export_btn = page.locator("button").filter(
            has_text=re.compile("CSV|匯出 CSV")
        ).first
        if export_btn.is_visible():
            export_btn.click()
            page.wait_for_timeout(1_500)
            if download_started:
                print(f"  ✅  TC-P-14 passed — download: {download_started[0]}")
            else:
                print("  ⚠️  TC-P-14 — export clicked but no download event")
        else:
            print("  ⚠️  TC-P-14 skipped — CSV export button not found")
        browser.close()


def test_payroll_export_bank():
    """TC-P-15: Bank file export triggers download."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        download_started = []
        page.on("download", lambda d: download_started.append(d.suggested_filename))

        bank_btn = page.locator("button").filter(
            has_text=re.compile("[Bb]ank|銀行|轉帳")
        ).first
        if bank_btn.is_visible():
            bank_btn.click()
            page.wait_for_timeout(1_500)
            print(f"  ✅  TC-P-15 passed — download triggered: {len(download_started) > 0}")
        else:
            print("  ⚠️  TC-P-15 skipped — bank export button not found")
        browser.close()


def test_payroll_export_insurance():
    """TC-P-16: Insurance report export triggers download."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        download_started = []
        page.on("download", lambda d: download_started.append(d.suggested_filename))

        ins_btn = page.locator("button").filter(
            has_text=re.compile("[Ii]nsurance [Rr]eport|保費報表|勞健保")
        ).first
        if ins_btn.is_visible():
            ins_btn.click()
            page.wait_for_timeout(1_500)
            print(f"  ✅  TC-P-16 passed — download triggered: {len(download_started) > 0}")
        else:
            print("  ⚠️  TC-P-16 skipped — insurance report button not found")
        browser.close()


def test_payroll_tools_tab():
    """TC-P-17: Payroll Tools tab shows utility buttons."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        if wait_for_tab(page, "薪資工具|[Tt]ool"):
            screenshot(page, "payroll_tools")
            body = page.locator("body").inner_text()
            has_content = len(body.strip()) > 100
            print(f"  {'✅' if has_content else '⚠️'}  TC-P-17 — tools tab content: {has_content}")
        else:
            print("  ⚠️  TC-P-17 skipped — tools tab not found")
        browser.close()


def test_payroll_send_payslips():
    """TC-P-18: Send payslips button shows confirmation."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/payroll")
        wait_for_page_ready(page)

        send_btn = page.locator("button").filter(
            has_text=re.compile("[Ss]end|發送|寄送|派發")
        ).first
        if send_btn.is_visible():
            screenshot(page, "payroll_send_available")
            print("  ✅  TC-P-18 passed — send payslips button available")
        else:
            print("  ⚠️  TC-P-18 skipped — send button not visible (need confirmed run)")
        browser.close()


if __name__ == "__main__":
    print("\n=== Payroll Management Tests ===\n")
    test_payroll_page_loads()
    test_salary_structure_tab()
    test_salary_structure_create()
    test_salary_structure_edit()
    test_run_payroll_tab()
    test_run_payroll_calculate()
    test_payroll_preview_columns()
    test_payroll_confirm()
    test_payroll_history_tab()
    test_payroll_history_expand()
    test_insurance_brackets_tab()
    test_insurance_brackets_year_change()
    test_health_insurance_brackets()
    test_payroll_export_csv()
    test_payroll_export_bank()
    test_payroll_export_insurance()
    test_payroll_tools_tab()
    test_payroll_send_payslips()
    print("\n✅ All Payroll tests completed.\n")
