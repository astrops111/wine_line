import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    console_msgs = []
    all_supabase = []

    page.on('console', lambda msg: console_msgs.append(f'[{msg.type}] {msg.text}'))

    def on_response(response):
        if 'supabase' in response.url:
            entry = {'url': response.url, 'status': response.status}
            if response.status not in (204, 300, 301, 302):
                try:
                    body = response.json()
                    entry['count'] = len(body) if isinstance(body, list) else 'object'
                    if isinstance(body, list) and len(body) > 0:
                        entry['first'] = body[0]
                    elif isinstance(body, dict):
                        entry['body'] = body
                except:
                    pass
            all_supabase.append(entry)

    page.on('response', on_response)

    print('Navigating...')
    page.goto('http://localhost:5173/employees', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(4000)
    page.screenshot(path='admin/tests/screenshots/employees_debug2.png', full_page=True)

    print('\n--- All Supabase API Calls ---')
    for r in all_supabase:
        print(json.dumps(r, indent=2, ensure_ascii=False, default=str))

    print('\n--- Console ---')
    for m in console_msgs:
        print(m)

    # Check DOM for employee data
    print('\n--- DOM Check ---')
    # Try to find any text that looks like employee names
    body_text = page.locator('body').inner_text()
    # Check if known employee names appear
    for name in ['Zoey', '學文', 'Ken', '營運', 'Wang']:
        if name in body_text:
            print(f'Found employee name: {name}')
        else:
            print(f'NOT found: {name}')

    # Check what's visible
    print(f'\nPage body text (first 1000 chars):\n{body_text[:1000]}')

    browser.close()
