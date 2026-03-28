"""
TestExecutorAgent — Agent 2
============================
Starts the Vite dev server, runs test suites via subprocess,
parses stdout into structured pass/fail/warn results, then stops the server.
"""
import os
import re
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
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

DEV_SERVER_URL = "http://localhost:5173"
DEV_SERVER_WAIT = 30   # seconds to wait for Vite to start

SYSTEM_PROMPT = """\
You are a QA automation engineer. Your job is to run all available test suites and
produce structured, JSON-serialisable results.

Workflow:
1. Call get_available_suites to see which test files exist.
2. Call start_dev_server to ensure the Vite dev server is running.
3. For each available suite, call run_test_suite and then parse_test_output.
4. Aggregate all results.
5. Call return_results with the complete structured dict.

The results dict must have this exact shape:
{
  "suites": {
    "<suite_name>": {
      "returncode": int,
      "stdout": str,
      "tests": [{"name": str, "status": "PASS"|"WARN"|"FAIL"|"BUG", "detail": str, "suite": str}]
    }
  },
  "summary": {"total": int, "passed": int, "failed": int, "warned": int, "bugs": int},
  "failures": [{"suite": str, "name": str, "error": str}]
}

Always call return_results as your last action.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_available_suites",
            "description": "Returns list of suite names whose test files exist on disk.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "start_dev_server",
            "description": "Checks if the Vite dev server is running; starts it if not. Returns status.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_test_suite",
            "description": "Run a single test suite as a subprocess. Returns returncode, stdout, stderr.",
            "parameters": {
                "type": "object",
                "properties": {
                    "suite":   {"type": "string", "description": "Suite name from get_available_suites"},
                    "timeout": {"type": "integer", "description": "Timeout seconds (default 300)"},
                },
                "required": ["suite"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "parse_test_output",
            "description": "Parse raw stdout into list of {name, status, detail, suite} test results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stdout":     {"type": "string"},
                    "suite_name": {"type": "string"},
                },
                "required": ["stdout", "suite_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_screenshot_list",
            "description": "Returns list of screenshot filenames taken during the test run.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "return_results",
            "description": "Store the final structured results and signal completion.",
            "parameters": {
                "type": "object",
                "properties": {
                    "results": {"type": "object", "description": "Full results dict"},
                },
                "required": ["results"],
            },
        },
    },
]


class TestExecutorAgent(BaseAgent):
    def __init__(self, tests_dir: str):
        self.tests_dir      = tests_dir
        self.admin_dir      = os.path.dirname(tests_dir)
        self._server_proc   = None
        self._final_results = None
        super().__init__("TestExecutor", SYSTEM_PROMPT, TOOLS)

    # ── Tool dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "get_available_suites":
            return self._get_available_suites()

        elif tool_name == "start_dev_server":
            return self._start_dev_server()

        elif tool_name == "run_test_suite":
            return json.dumps(
                self._run_test_suite(
                    tool_input["suite"],
                    tool_input.get("timeout", 300),
                )
            )

        elif tool_name == "parse_test_output":
            parsed = self._parse_test_output(
                tool_input["stdout"],
                tool_input["suite_name"],
            )
            return json.dumps(parsed)

        elif tool_name == "get_screenshot_list":
            return self._get_screenshot_list()

        elif tool_name == "return_results":
            self._final_results = tool_input["results"]
            return "OK: results stored"

        return f"ERROR: unknown tool '{tool_name}'"

    # ── Server management ─────────────────────────────────────────────────────

    def _is_server_running(self) -> bool:
        try:
            urllib.request.urlopen(DEV_SERVER_URL, timeout=3)
            return True
        except Exception:
            return False

    def _start_dev_server(self) -> str:
        if self._is_server_running():
            return "OK: dev server already running at " + DEV_SERVER_URL

        print("  [executor] Starting Vite dev server…")
        self._server_proc = subprocess.Popen(
            "npm run dev",
            cwd=self.admin_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=True,
        )

        deadline = time.time() + DEV_SERVER_WAIT
        while time.time() < deadline:
            if self._is_server_running():
                print("  [executor] Dev server ready.")
                return "OK: dev server started at " + DEV_SERVER_URL
            time.sleep(1)

        return "WARN: dev server may not be ready yet — proceeding anyway"

    def _stop_dev_server(self):
        if self._server_proc:
            print("  [executor] Stopping Vite dev server…")
            # shell=True spawns cmd.exe → terminate() only kills the shell,
            # leaving the Vite node process orphaned. Use taskkill /T to kill
            # the entire process tree on Windows.
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(self._server_proc.pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            else:
                self._server_proc.terminate()
                try:
                    self._server_proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self._server_proc.kill()
            self._server_proc = None

    # ── Test execution ────────────────────────────────────────────────────────

    def _get_available_suites(self) -> str:
        available = []
        for name, rel_path in SUITE_FILES.items():
            full = os.path.join(self.tests_dir, rel_path)
            if os.path.exists(full):
                available.append(name)
        return json.dumps(available)

    def _run_test_suite(self, suite: str, timeout: int = 300) -> dict:
        if suite not in SUITE_FILES:
            return {"error": f"Unknown suite: {suite}"}
        script = os.path.join(self.tests_dir, SUITE_FILES[suite])
        if not os.path.exists(script):
            return {"error": f"Test file not found: {script}"}

        print(f"  [executor] Running suite: {suite}")
        try:
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True,
                text=True,
                cwd=self.tests_dir,
                timeout=timeout,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
            return {
                "returncode": result.returncode,
                "stdout":     result.stdout,
                "stderr":     result.stderr[-500:] if result.stderr else "",
            }
        except subprocess.TimeoutExpired:
            return {"returncode": -1, "stdout": "", "stderr": f"TIMEOUT after {timeout}s"}
        except Exception as exc:
            return {"returncode": -1, "stdout": "", "stderr": str(exc)}

    # ── Output parsing ────────────────────────────────────────────────────────

    def _parse_test_output(self, stdout: str, suite_name: str) -> list[dict]:
        """
        Parse test output lines. Only match lines that contain a TC code
        (e.g. TC-E-01) or the explicit [OK]/[FAIL]/[BUG]/[WARN] markers.
        Skip summary lines like "Smoke Tests: 19/19 passed" and Supabase noise.
        """
        results = []
        for line in stdout.splitlines():
            stripped = line.strip()
            # Only parse lines with a TC code or explicit bracket markers
            has_tc  = bool(re.search(r"TC-[A-Z]+-\d+", stripped))
            has_tag = any(tag in stripped for tag in ["[OK]", "[FAIL]", "[BUG]", "[WARN]"])
            if not has_tc and not has_tag:
                # Also accept emoji-prefixed individual test result lines
                if not (stripped.startswith("✅") or stripped.startswith("⚠️")):
                    continue

            if "[BUG]" in stripped or "DEFICIENCY" in stripped:
                status = "BUG"
            elif "[FAIL]" in stripped or ("FAIL" in stripped and has_tc):
                status = "FAIL"
            elif any(kw in stripped for kw in ["⚠️", "[WARN]", "skipped"]):
                status = "WARN"
            elif any(kw in stripped for kw in ["✅", "[OK]", "passed"]):
                status = "PASS"
            else:
                continue

            tc_match = re.search(r"TC-[A-Z]+-\d+", stripped)
            name = tc_match.group(0) if tc_match else f"{suite_name}_line"
            results.append({
                "name":   name,
                "status": status,
                "detail": stripped[:200],
                "suite":  suite_name,
            })
        return results

    def _get_screenshot_list(self) -> str:
        shots_dir = os.path.join(self.tests_dir, "screenshots")
        if not os.path.exists(shots_dir):
            return "[]"
        files = sorted(os.listdir(shots_dir))
        return json.dumps([f for f in files if f.endswith(".png")])

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self, suite: str = "all") -> dict:
        self._final_results = None

        if suite == "all":
            prompt = (
                "Run ALL available test suites. "
                "1. get_available_suites "
                "2. start_dev_server "
                "3. For each suite: run_test_suite then parse_test_output "
                "4. Aggregate: suites dict, summary counts, failures list "
                "5. return_results with the complete dict"
            )
        else:
            prompt = (
                f"Run only the '{suite}' test suite. "
                "1. start_dev_server "
                f"2. run_test_suite(suite='{suite}') "
                "3. parse_test_output "
                "4. return_results with the structured dict"
            )

        self.run_loop(prompt)
        self._stop_dev_server()

        if self._final_results:
            return self._final_results

        # Fallback: return empty result structure
        return {
            "suites": {},
            "summary": {"total": 0, "passed": 0, "failed": 0, "warned": 0, "bugs": 0},
            "failures": [],
        }
