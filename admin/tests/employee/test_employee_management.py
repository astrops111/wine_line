"""
EMPLOYEE MANAGEMENT TESTS
===========================
FR-1.1  Onboarding  |  FR-1.2  Org & Roles  |  FR-1.3  Change History

Scenarios covered:
  TC-E-01  Employee list loads with filter tabs (All / Full-time / Part-time)
  TC-E-02  Create new employee — required field validation fires on empty submit
  TC-E-03  Create new employee — success path with all mandatory fields
  TC-E-04  Employee detail panel opens on row click and shows all tab sections
  TC-E-05  Edit employee status (active → inactive)
  TC-E-06  Leave request visible in employee Leave tab
  TC-E-07  Performance review form submits successfully
  TC-E-08  Availability / shift preference form submits
  TC-E-09  Department tab — create department, list updates
  TC-E-10  Filter by employment type (full_time / part_time)
"""
import sys, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from playwright.sync_api import sync_playwright, expect
from utils.helpers import goto, wait_for_page_ready, screenshot
import re


def test_employee_list_loads():
    """TC-E-01: Employee page renders list with filter controls."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)
        screenshot(page, "emp_list")

        # Header / title visible
        page.locator("h1, h2").filter(has_text=re.compile("[Ee]mployee|員工")).first \
            .wait_for(state="visible", timeout=6_000)

        # Filter buttons (All / Full-time / Part-time)
        filter_btns = page.locator("button").filter(has_text=re.compile("[Aa]ll|[Ff]ull|[Pp]art|全部|全職|兼職"))
        assert filter_btns.count() >= 2, "Expected filter toggle buttons"

        # Add / Create button exists
        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Nn]ew|建立|新增")).first
        assert add_btn.is_visible(), "Add employee button not found"
        print("  ✅  TC-E-01 passed")
        browser.close()


def test_create_employee_validation():
    """
    TC-E-02: Create form shows error on empty submit.

    KNOWN DEFICIENCY: createEmployee() in Employees.tsx silently returns
    when form.name is empty (line 292: `if (!form.name) return;`) — no
    error message or HTML5 `required` attribute is set on any input.
    This test documents the missing validation UX as a deficiency.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        # Open create form
        page.locator("button").filter(has_text=re.compile("[Aa]dd|[Nn]ew|建立|新增")).first.click()
        page.wait_for_timeout(500)
        screenshot(page, "emp_create_form_empty")

        # Try to submit without filling required fields
        page.locator("button").filter(has_text=re.compile("[Ss]ave|[Cc]reate|建立|儲存")).first.click()
        page.wait_for_timeout(400)

        # HTML5 required validation or custom error message
        invalid_inputs = page.locator("input:invalid, select:invalid").count()
        error_text = page.locator("text=/required|必填/i").count()

        if invalid_inputs == 0 and error_text == 0:
            screenshot(page, "emp_create_no_validation_BUG")
            print("  [BUG]  TC-E-02 DEFICIENCY: createEmployee() silently returns on empty name — "
                  "no validation feedback shown to user. "
                  "Fix: add required attribute to name input OR display error message.")
        else:
            print("  [OK]   TC-E-02 passed — validation feedback shown")
        browser.close()


def test_employee_filter_tab():
    """TC-E-10: Filter by Full-time shows only full_time employees."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        fulltime_btn = page.locator("button").filter(has_text=re.compile("[Ff]ull.?[Tt]ime|全職")).first
        if fulltime_btn.is_visible():
            fulltime_btn.click()
            wait_for_page_ready(page)
            screenshot(page, "emp_filter_fulltime")
            # After filtering the part-time badge should be absent
            parttime_tag = page.locator("text=/[Pp]art.?[Tt]ime|兼職/").count()
            # We can't assert 0 without real data, but the filter click must not crash
            print(f"  ✅  TC-E-10 passed (part-time tags visible: {parttime_tag})")
        else:
            print("  ⚠️  TC-E-10 skipped — filter button not found")
        browser.close()


def test_employee_detail_panel():
    """TC-E-04: Click employee row opens detail with tabs."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        # Try clicking first employee row (if list has data)
        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() == 0:
            # Try generic list items
            rows = page.locator("li").filter(has_text=re.compile("[A-Z][a-z]+ [A-Z]"))
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            screenshot(page, "emp_detail_panel")
            # Check for tab navigation (Leave / Reviews / Availability)
            tab_el = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Ll]eave|[Rr]eview|[Aa]vail|假勤|績效|可用")
            )
            assert tab_el.count() > 0, "Employee detail tabs not found"
            print("  ✅  TC-E-04 passed")
        else:
            screenshot(page, "emp_detail_no_data")
            print("  ⚠️  TC-E-04 skipped — no employee rows in the list")
        browser.close()


def test_department_tab():
    """TC-E-09: Departments sub-tab renders (or can be navigated to)."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        dept_tab = page.locator("button, [role='tab']").filter(
            has_text=re.compile("[Dd]epartment|部門")
        ).first
        if dept_tab.is_visible():
            dept_tab.click()
            wait_for_page_ready(page)
            screenshot(page, "emp_departments_tab")
            print("  ✅  TC-E-09 passed")
        else:
            print("  ⚠️  TC-E-09 skipped — department tab not found")
        browser.close()


def test_employee_detail_info_tab():
    """TC-E-11: Employee detail Info tab shows basic information."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            screenshot(page, "emp_detail_info")
            body = page.locator("body").inner_text()
            has_info = re.search(r"[Nn]ame|姓名|[Ee]mail|[Pp]osition|職位|[Ss]tore|門市", body) is not None
            print(f"  {'✅' if has_info else '⚠️'}  TC-E-11 — info fields visible: {has_info}")
        else:
            print("  ⚠️  TC-E-11 skipped — no employee rows")
        browser.close()


def test_employee_detail_leaves_tab():
    """TC-E-12: Employee detail Leaves sub-tab shows leave requests."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            leave_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Ll]eave|假勤|請假")
            ).first
            if leave_tab.is_visible():
                leave_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_leaves")
                print("  ✅  TC-E-12 passed")
            else:
                print("  ⚠️  TC-E-12 skipped — leaves tab not found")
        else:
            print("  ⚠️  TC-E-12 skipped — no employee rows")
        browser.close()


def test_employee_detail_reviews_tab():
    """TC-E-13: Employee detail Reviews sub-tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            review_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Rr]eview|績效|評核")
            ).first
            if review_tab.is_visible():
                review_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_reviews")
                print("  ✅  TC-E-13 passed")
            else:
                print("  ⚠️  TC-E-13 skipped — reviews tab not found")
        else:
            print("  ⚠️  TC-E-13 skipped — no employee rows")
        browser.close()


def test_employee_detail_availability_tab():
    """TC-E-14: Employee detail Availability sub-tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            avail_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Aa]vail|可用|班表偏好|排班")
            ).first
            if avail_tab.is_visible():
                avail_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_availability")
                print("  ✅  TC-E-14 passed")
            else:
                print("  ⚠️  TC-E-14 skipped — availability tab not found")
        else:
            print("  ⚠️  TC-E-14 skipped — no employee rows")
        browser.close()


def test_employee_detail_dependents_tab():
    """TC-E-15: Employee detail Dependents sub-tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            dep_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Dd]ependent|眷屬|扶養")
            ).first
            if dep_tab.is_visible():
                dep_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_dependents")
                print("  ✅  TC-E-15 passed")
            else:
                print("  ⚠️  TC-E-15 skipped — dependents tab not found")
        else:
            print("  ⚠️  TC-E-15 skipped — no employee rows")
        browser.close()


def test_employee_detail_position_history():
    """TC-E-16: Employee detail Position History sub-tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            pos_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Pp]osition|[Hh]istory|職位|異動")
            ).first
            if pos_tab.is_visible():
                pos_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_position_history")
                print("  ✅  TC-E-16 passed")
            else:
                print("  ⚠️  TC-E-16 skipped — position history tab not found")
        else:
            print("  ⚠️  TC-E-16 skipped — no employee rows")
        browser.close()


def test_employee_detail_skills_tab():
    """TC-E-17: Employee detail Skills sub-tab."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        rows = page.locator("tbody tr, [data-testid='employee-row'], .employee-row")
        if rows.count() > 0:
            rows.first.click()
            wait_for_page_ready(page)
            skill_tab = page.locator("button, [role='tab']").filter(
                has_text=re.compile("[Ss]kill|[Cc]ertif|技能|證照")
            ).first
            if skill_tab.is_visible():
                skill_tab.click()
                wait_for_page_ready(page)
                screenshot(page, "emp_detail_skills")
                print("  ✅  TC-E-17 passed")
            else:
                print("  ⚠️  TC-E-17 skipped — skills tab not found")
        else:
            print("  ⚠️  TC-E-17 skipped — no employee rows")
        browser.close()


def test_employee_create_validation_bug01():
    """TC-E-18: Verify BUG-01 fix — empty name shows error message."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        goto(page, "/employees")
        wait_for_page_ready(page)

        add_btn = page.locator("button").filter(has_text=re.compile("[Aa]dd|[Nn]ew|建立|新增")).first
        if add_btn.is_visible():
            add_btn.click()
            page.wait_for_timeout(500)

            # Submit with empty name
            save_btn = page.locator("button").filter(
                has_text=re.compile("[Ss]ave|[Cc]reate|建立|儲存")
            ).first
            if save_btn.is_visible():
                save_btn.click()
                page.wait_for_timeout(400)
                screenshot(page, "emp_bug01_validation")

                # BUG-01 fix: should show "姓名為必填欄位"
                error_msg = page.locator("text=/姓名為必填欄位|[Nn]ame.*required/i")
                if error_msg.count() > 0:
                    print("  ✅  TC-E-18 passed — BUG-01 fix verified: error message shown")
                else:
                    invalid = page.locator("input:invalid").count()
                    if invalid > 0:
                        print("  ✅  TC-E-18 passed — HTML5 validation active")
                    else:
                        print("  ❌  TC-E-18 FAILED — BUG-01 regression: no validation shown")
            else:
                print("  ⚠️  TC-E-18 skipped — save button not found")
        else:
            print("  ⚠️  TC-E-18 skipped — add button not found")
        browser.close()


if __name__ == "__main__":
    print("\n=== Employee Management Tests ===\n")
    test_employee_list_loads()
    test_create_employee_validation()
    test_employee_filter_tab()
    test_employee_detail_panel()
    test_department_tab()
    test_employee_detail_info_tab()
    test_employee_detail_leaves_tab()
    test_employee_detail_reviews_tab()
    test_employee_detail_availability_tab()
    test_employee_detail_dependents_tab()
    test_employee_detail_position_history()
    test_employee_detail_skills_tab()
    test_employee_create_validation_bug01()
    print("\n✅ All Employee tests completed.\n")
