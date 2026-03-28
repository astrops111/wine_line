import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('http://localhost:5175')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)

    # 1. Light mode dashboard
    page.screenshot(path='tests/screenshots/design-light-dashboard.png', full_page=False)
    print('1. Light dashboard')

    # 2. Navigate to HR Dashboard via URL
    page.goto('http://localhost:5175/hr-dashboard')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path='tests/screenshots/design-light-hr.png', full_page=False)
    print('2. Light HR dashboard')

    # 3. Navigate to Payroll via URL
    page.goto('http://localhost:5175/payroll')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path='tests/screenshots/design-light-payroll.png', full_page=False)
    print('3. Light payroll')

    # 4. Navigate to Employees
    page.goto('http://localhost:5175/employees')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path='tests/screenshots/design-light-employees.png', full_page=False)
    print('4. Light employees')

    # 5. Toggle dark mode and go to dashboard
    theme_btn = page.locator('button.theme-btn')
    theme_btn.click()
    page.wait_for_timeout(500)
    page.goto('http://localhost:5175/')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path='tests/screenshots/design-dark-dashboard.png', full_page=False)
    print('5. Dark dashboard')

    # 6. Dark payroll
    page.goto('http://localhost:5175/payroll')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)
    page.screenshot(path='tests/screenshots/design-dark-payroll.png', full_page=False)
    print('6. Dark payroll')

    browser.close()
    print('All screenshots saved')
