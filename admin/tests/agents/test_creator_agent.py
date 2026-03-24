"""
TestCreatorAgent — Agent 1
===========================
Analyzes React source pages to find uncovered routes and generates
new Python Playwright test files that match the project's exact code style.
"""
import os
import json
from .base_agent import BaseAgent

# ── Coverage map: which routes are already tested ────────────────────────────
EXISTING_COVERAGE = {
    "smoke":         ["/", "/manager-dashboard", "/hr-dashboard", "/time-tracker",
                      "/leave-management", "/overtime-requests", "/scheduling",
                      "/employees", "/tasks", "/workflows", "/checklists",
                      "/notifications", "/triggers", "/users", "/line",
                      "/org-management", "/workflow-management", "/admin", "/liff/app"],
    "employee":      ["/employees"],
    "time_tracking": ["/time-tracker"],
    "leave":         ["/leave-management", "/overtime-requests"],
    "scheduling":    ["/scheduling"],
    "workflows":     ["/workflows", "/tasks", "/checklists", "/notifications",
                      "/triggers", "/workflow-management"],
    "hr_dashboard":  ["/hr-dashboard", "/manager-dashboard", "/line",
                      "/org-management", "/admin", "/users", "/liff/app"],
}

ALL_ROUTES = [
    ("/",                    "Dashboard.tsx"),
    ("/manager-dashboard",   "ManagerDashboard.tsx"),
    ("/hr-dashboard",        "HrDashboard.tsx"),
    ("/time-tracker",        "TimeTracker.tsx"),
    ("/leave-management",    "LeaveManagement.tsx"),
    ("/overtime-requests",   "OvertimeRequests.tsx"),
    ("/payroll",             "PayrollManagement.tsx"),
    ("/scheduling",          "Scheduling.tsx"),
    ("/holidays",            "Holidays.tsx"),
    ("/employees",           "Employees.tsx"),
    ("/tasks",               "Tasks.tsx"),
    ("/workflows",           "Workflows.tsx"),
    ("/checklists",          "Checklists.tsx"),
    ("/notifications",       "Notifications.tsx"),
    ("/triggers",            "Triggers.tsx"),
    ("/users",               "Users.tsx"),
    ("/line",                "LineManagement.tsx"),
    ("/org-management",      "OrgManagement.tsx"),
    ("/workflow-management", "WorkflowManagement.tsx"),
    ("/admin",               "AdminSettings.tsx"),
    ("/liff/app",            "LiffApp.tsx"),
]

EXISTING_SUITE_FILES = {
    "smoke":         "smoke/test_navigation.py",
    "employee":      "employee/test_employee_management.py",
    "time_tracking": "time_tracking/test_time_tracker.py",
    "leave":         "leave/test_leave_overtime.py",
    "scheduling":    "scheduling/test_scheduling.py",
    "workflows":     "workflows/test_workflows.py",
    "hr_dashboard":  "hr_dashboard/test_hr_dashboard.py",
}

SYSTEM_PROMPT = """\
You are a senior QA engineer specialising in Python Playwright browser tests for React TypeScript SPAs.

Your job: analyse React page source files and generate NEW Python Playwright test files that match
the existing project style EXACTLY.

━━━━━━━━  STYLE RULES (mandatory)  ━━━━━━━━
1. Module docstring listing TC codes, e.g.:
   \"\"\"
   PAYROLL MANAGEMENT TESTS
   ========================
   TC-P-01  Payroll page loads with Salary Structures tab
   TC-P-02  ...
   \"\"\"
2. UTF-8 header immediately after the docstring:
   import sys, os, io
   sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
   sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
3. Imports:
   from playwright.sync_api import sync_playwright, expect
   from utils.helpers import goto, wait_for_page_ready, screenshot
   import re
4. Each test is a standalone function:
   def test_xxx():
       with sync_playwright() as p:
           browser = p.chromium.launch(headless=True)
           page = browser.new_page()
           ...
           browser.close()
5. Output format:
   print("  ✅  TC-X-nn passed")       # success
   print("  ⚠️  TC-X-nn skipped — reason")  # graceful skip
   print("  [BUG]  TC-X-nn DEFICIENCY: description. Fix: suggestion.")
6. Always call screenshot(page, "descriptive_snake_case_name") before assertions.
7. Accept both Chinese AND English text:
   page.locator("h1, h2").filter(has_text=re.compile("English|中文")).first
8. Use .is_visible() guard before clicking optional elements.
9. When data may not exist, skip gracefully with ⚠️ rather than crashing.
10. Do NOT use pytest — plain Python only.
11. End file with:
    if __name__ == "__main__":
        print("\\n=== XXX Tests ===\\n")
        test_xxx_loads()
        test_xxx_tabs()
        ...
        print("\\n✅ All XXX tests completed.\\n")

━━━━━━━━  WHAT TO TEST  ━━━━━━━━
For each route you are given:
- Load the page and verify header/title visible
- Navigate each tab (if tabs exist)
- Verify key UI elements (buttons, tables, forms) present
- Open modals/forms and check they render
- Test form submit with empty fields (document as [BUG] if no validation feedback)
- Do NOT make real financial calculations or submit data to Supabase that cannot be undone

Produce complete, runnable test files — no placeholders, no TODOs.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_coverage_gaps",
            "description": "Returns list of routes that have no dedicated test suite, with source file paths and suggested output paths.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_existing_test",
            "description": "Read an existing test file as a style reference.",
            "parameters": {
                "type": "object",
                "properties": {
                    "suite": {
                        "type": "string",
                        "description": "Suite name: smoke|employee|time_tracking|leave|scheduling|workflows|hr_dashboard",
                    }
                },
                "required": ["suite"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file (React source page or test file). Returns up to max_lines lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path":      {"type": "string", "description": "Absolute file path"},
                    "max_lines": {"type": "integer", "description": "Max lines to return (default 250)"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file (creates parent dirs automatically).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path":    {"type": "string",  "description": "Absolute path to write"},
                    "content": {"type": "string",  "description": "Full file content"},
                },
                "required": ["path", "content"],
            },
        },
    },
]


class TestCreatorAgent(BaseAgent):
    def __init__(self, tests_dir: str, admin_dir: str):
        self.tests_dir = tests_dir
        self.admin_dir = admin_dir
        self.pages_dir = os.path.join(admin_dir, "src", "pages")
        self._created_files: list[str] = []
        super().__init__("TestCreator", SYSTEM_PROMPT, TOOLS)

    # ── Tool dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "get_coverage_gaps":
            return self._get_coverage_gaps()

        elif tool_name == "read_existing_test":
            suite = tool_input.get("suite", "employee")
            if suite not in EXISTING_SUITE_FILES:
                return f"ERROR: unknown suite '{suite}'"
            path = os.path.join(self.tests_dir, EXISTING_SUITE_FILES[suite])
            return self._read_file(path, 400)

        elif tool_name == "read_file":
            return self._read_file(
                tool_input["path"],
                tool_input.get("max_lines", 250),
            )

        elif tool_name == "write_file":
            return self._write_file(tool_input["path"], tool_input["content"])

        return f"ERROR: unknown tool '{tool_name}'"

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_coverage_gaps(self) -> str:
        covered = set()
        for routes in EXISTING_COVERAGE.values():
            covered.update(routes)

        gaps = []
        for route, source_file in ALL_ROUTES:
            if route in covered:
                continue
            slug = route.lstrip("/").replace("-", "_") or "root"
            gaps.append({
                "route":       route,
                "source_file": os.path.join(self.pages_dir, source_file),
                "output_file": os.path.join(self.tests_dir, slug, f"test_{slug}.py"),
            })
        return json.dumps(gaps, indent=2)

    def _read_file(self, path: str, max_lines: int = 250) -> str:
        try:
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            return "".join(lines[:max_lines])
        except Exception as exc:
            return f"ERROR reading {path}: {exc}"

    def _write_file(self, path: str, content: str) -> str:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            self._created_files.append(path)
            return f"OK: wrote {len(content)} chars to {path}"
        except Exception as exc:
            return f"ERROR writing {path}: {exc}"

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self, scope: str = "new") -> dict:
        self._created_files = []
        prompt = (
            f"scope={scope}. "
            "1. Call get_coverage_gaps to find uncovered routes. "
            "2. Call read_existing_test('employee') once for style reference. "
            "3. For each gap: call read_file on the React page source (max_lines=200) "
            "   to understand the UI structure, then write_file to create the test file. "
            "4. After writing each file, confirm the path. "
            "Generate ALL missing test suites. Produce complete, runnable files."
        )
        summary = self.run_loop(prompt)
        return {"created_files": self._created_files, "summary": summary}
