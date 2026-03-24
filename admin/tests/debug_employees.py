import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    console_msgs = []
    network_errors = []
    api_responses = []

    page.on('console', lambda msg: console_msgs.append(f'[{msg.type}] {msg.text}'))
    page.on('pageerror', lambda err: network_errors.append(f'[pageerror] {err}'))

    def on_response(response):
        if 'supabase' in response.url and '/users' in response.url:
            try:
                body = response.json()
                api_responses.append({
                    'url': response.url,
                    'status': response.status,
                    'body_length': len(body) if isinstance(body, list) else 'not a list',
                    'body_preview': body[:2] if isinstance(body, list) else body,
                })
            except Exception as e:
                api_responses.append({'url': response.url, 'status': response.status, 'error': str(e)})

    page.on('response', on_response)

    print('Navigating to employees page...')
    page.goto('http://localhost:5173/employees', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    page.screenshot(path='admin/tests/screenshots/employees_debug.png', full_page=True)

    # Get employee list content
    content = page.content()

    # Check for employee list items or empty state
    emp_rows = page.locator('tr, .employee-row, [class*="employee"]').all()
    print(f'\nEmployee-related elements found: {len(emp_rows)}')

    # Check for any error messages
    error_els = page.locator('[class*="error"], [class*="empty"], [class*="no-data"]').all()
    for el in error_els:
        print(f'Error/empty element: {el.text_content()}')

    # Check loading state
    loading_els = page.locator('[class*="loading"], [class*="spinner"]').all()
    print(f'Loading elements still visible: {len(loading_els)}')

    print('\n--- Console Messages ---')
    for msg in console_msgs:
        print(msg)

    print('\n--- Supabase /users API Responses ---')
    if api_responses:
        for r in api_responses:
            print(json.dumps(r, indent=2, ensure_ascii=False))
    else:
        print('No /users API calls captured')

    print('\n--- Page Errors ---')
    for e in network_errors:
        print(e)

    # Also check current URL (in case of redirect)
    print(f'\nFinal URL: {page.url}')

    browser.close()
    print('\nScreenshot saved to admin/tests/screenshots/employees_debug.png')
