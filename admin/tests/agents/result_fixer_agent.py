"""
ResultFixerAgent — Agent 4
===========================
Diagnoses test failures and either:
  • Patches the test file (test bugs — wrong selectors, timing issues)
  • Reports the app bug with file path + proposed fix (genuine feature gaps)
"""
import os
import re
import sys
import json
import subprocess
from .base_agent import BaseAgent

SUITE_FILES = {
    "smoke":         "smoke/test_navigation.py",
    "employee":      "employee/test_employee_management.py",
    "time_tracking": "time_tracking/test_time_tracker.py",
    "leave":         "leave/test_leave_overtime.py",
    "scheduling":    "scheduling/test_scheduling.py",
    "workflows":     "workflows/test_workflows.py",
    "hr_dashboard":  "hr_dashboard/test_hr_dashboard.py",
    "payroll":       "payroll/test_payroll.py",
    "holidays":      "holidays/test_holidays.py",
    "shift_rules":   "shift_rules/test_shift_rules.py",
}

SYSTEM_PROMPT = """\
You are a senior full-stack QA engineer who diagnoses test failures and applies fixes.

For each failing test you receive:
1. Call read_file on the test file to see the failing assertion/selector.
2. Call find_in_source to locate the real element in the React source (class names, button text, etc.).
3. Diagnose:
   - TEST BUG: wrong selector, wrong expected text, timing issue, modal vs inline location
   - APP BUG: feature genuinely missing, route returns 404, validation silently ignored
4. For TEST BUG: call write_file with the corrected test function (preserve file style).
5. For APP BUG: call report_app_bug with the source file path, line hint, and a concrete code fix.
6. Optionally call run_single_suite to verify a fix works (check output for [FAIL]).

IMPORTANT RULES:
- Only modify the specific failing function — do not rewrite the whole file.
- Preserve the exact code style (UTF-8 header, print format, spacing).
- When in doubt, prefer marking as APP BUG rather than silently breaking the test.
- After processing all failures, call finish with the fixes summary.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file with optional line range. Returns content with line numbers prepended.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path":       {"type": "string"},
                    "start_line": {"type": "integer", "description": "1-based start line (optional)"},
                    "end_line":   {"type": "integer", "description": "1-based end line (optional)"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_in_source",
            "description": "Search all .tsx files in admin/src/ for a pattern. Returns file:line matches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Regex or literal string to search"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write updated content to a test file (full file replacement).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path":    {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_single_suite",
            "description": "Re-run a test suite to verify that a fix worked. Returns last 2000 chars of stdout.",
            "parameters": {
                "type": "object",
                "properties": {
                    "suite": {"type": "string", "description": "Suite name to re-run"},
                },
                "required": ["suite"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "report_app_bug",
            "description": "Record an application bug that requires a source code change (not a test fix).",
            "parameters": {
                "type": "object",
                "properties": {
                    "test_name":    {"type": "string"},
                    "file_path":    {"type": "string", "description": "React source file path"},
                    "line_hint":    {"type": "integer", "description": "Approximate line number (optional)"},
                    "description":  {"type": "string", "description": "What is broken"},
                    "proposed_fix": {"type": "string", "description": "Exact code change to make"},
                },
                "required": ["test_name", "file_path", "description", "proposed_fix"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "Signal completion with a summary of all fixes applied.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fixes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "test":        {"type": "string"},
                                "type":        {"type": "string", "description": "test_bug|app_bug"},
                                "description": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["fixes"],
            },
        },
    },
]


class ResultFixerAgent(BaseAgent):
    def __init__(self, tests_dir: str, admin_dir: str):
        self.tests_dir  = tests_dir
        self.admin_dir  = admin_dir
        self.src_dir    = os.path.join(admin_dir, "src")
        self._app_bugs: list[dict]  = []
        self._fixes:    list[dict]  = []
        super().__init__("ResultFixer", SYSTEM_PROMPT, TOOLS)

    # ── Tool dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "read_file":
            return self._read_file(
                tool_input["path"],
                tool_input.get("start_line"),
                tool_input.get("end_line"),
            )

        elif tool_name == "find_in_source":
            return self._find_in_source(tool_input["pattern"])

        elif tool_name == "write_file":
            return self._write_file(tool_input["path"], tool_input["content"])

        elif tool_name == "run_single_suite":
            return self._run_single_suite(tool_input["suite"])

        elif tool_name == "report_app_bug":
            bug = {k: tool_input[k] for k in tool_input}
            self._app_bugs.append(bug)
            return f"OK: app bug recorded for {tool_input['test_name']}"

        elif tool_name == "finish":
            self._fixes = tool_input.get("fixes", [])
            return "OK"

        return f"ERROR: unknown tool '{tool_name}'"

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _read_file(self, path: str, start_line: int | None, end_line: int | None) -> str:
        try:
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
            s = (start_line or 1) - 1
            e = end_line or len(lines)
            chunk = lines[s:e]
            return "".join(f"{s + i + 1:4d}  {l}" for i, l in enumerate(chunk))
        except Exception as exc:
            return f"ERROR reading {path}: {exc}"

    def _find_in_source(self, pattern: str) -> str:
        results = []
        try:
            rx = re.compile(pattern, re.IGNORECASE)
        except re.error:
            rx = re.compile(re.escape(pattern), re.IGNORECASE)

        for root, _, files in os.walk(self.src_dir):
            for fname in files:
                if not fname.endswith((".tsx", ".ts", ".jsx", ".js")):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, encoding="utf-8") as f:
                        for i, line in enumerate(f, 1):
                            if rx.search(line):
                                rel = os.path.relpath(fpath, self.admin_dir)
                                results.append(f"{rel}:{i}: {line.rstrip()}")
                except Exception:
                    continue

        if not results:
            return f"No matches found for pattern: {pattern}"
        return "\n".join(results[:40])  # cap at 40 lines

    def _write_file(self, path: str, content: str) -> str:
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"OK: wrote {len(content)} chars to {path}"
        except Exception as exc:
            return f"ERROR writing {path}: {exc}"

    def _run_single_suite(self, suite: str) -> str:
        if suite not in SUITE_FILES:
            return f"ERROR: Unknown suite '{suite}'"
        script = os.path.join(self.tests_dir, SUITE_FILES[suite])
        if not os.path.exists(script):
            return f"ERROR: Test file not found: {script}"
        try:
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True,
                text=True,
                cwd=self.tests_dir,
                timeout=180,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
            tail = (result.stdout + result.stderr)[-2000:]
            return f"returncode={result.returncode}\n{tail}"
        except subprocess.TimeoutExpired:
            return "TIMEOUT after 180s"
        except Exception as exc:
            return f"ERROR: {exc}"

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self, failures: list[dict]) -> dict:
        if not failures:
            return {"fixes": [], "app_bugs": []}

        self._app_bugs = []
        self._fixes    = []

        # Build paths for relevant test files
        suite_paths = {}
        for f in failures:
            s = f.get("suite", "")
            if s in SUITE_FILES:
                suite_paths[s] = os.path.join(self.tests_dir, SUITE_FILES[s])

        prompt = (
            f"failures={json.dumps(failures, indent=2)}\n\n"
            f"test_file_paths={json.dumps(suite_paths)}\n"
            f"src_pages_dir={os.path.join(self.src_dir, 'pages')}\n\n"
            "Diagnose each failure. Read the test file, find the real selector in React source, "
            "fix test bugs by writing the corrected test file, and report app bugs. "
            "Then call finish with the fixes list."
        )

        self.run_loop(prompt)

        return {
            "fixes":    self._fixes,
            "app_bugs": self._app_bugs,
        }
