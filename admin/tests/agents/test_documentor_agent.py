"""
TestDocumentorAgent — Agent 3
==============================
Takes structured test execution results and generates a comprehensive
markdown QA report saved to admin/tests/reports/qa_report_{run_id}.md
"""
import os
import json
from datetime import datetime
from .base_agent import BaseAgent

SYSTEM_PROMPT = """\
You are a QA documentation specialist. You receive structured test execution results
and generate a comprehensive markdown QA report.

The report MUST include these sections in order:
1. Title with run ID and date
2. Executive Summary — table with Total/Passed/Failed/Warned/Bugs counts and Health %
3. Suite Results — table with per-suite pass/warn/fail breakdown and PASS/FAIL status
4. Failure Details — each failure in a subsection with error in a code block
5. Known Deficiencies (BUG items) — separate section if any [BUG] items exist
6. Coverage Analysis — routes tested vs total known routes, coverage %
7. Screenshots — list of screenshots taken (filenames only, no paths)
8. Recommendations — 3-5 actionable next steps based on the failures
9. Footer with timestamp

Use markdown: tables, ## headings, ``` code blocks for errors, ✅/❌/⚠️ icons in tables.
Health % = (passed / total * 100) rounded to 1 decimal place.
Suite status = PASS if returncode == 0, else FAIL.

After composing the report, call write_report with the run_id and full markdown content.
Then call finish with a 1-sentence summary.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_screenshots",
            "description": "List all PNG screenshots in the screenshots directory.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_report",
            "description": "Write the QA report markdown to admin/tests/reports/qa_report_{run_id}.md",
            "parameters": {
                "type": "object",
                "properties": {
                    "run_id":  {"type": "string", "description": "Run ID for the filename"},
                    "content": {"type": "string", "description": "Full markdown report content"},
                },
                "required": ["run_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "Signal that the report is written and return the report path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "report_path": {"type": "string", "description": "Absolute path of the written report"},
                    "summary":     {"type": "string", "description": "One-sentence summary"},
                },
                "required": ["report_path", "summary"],
            },
        },
    },
]


class TestDocumentorAgent(BaseAgent):
    def __init__(self, tests_dir: str):
        self.tests_dir   = tests_dir
        self.reports_dir = os.path.join(tests_dir, "reports")
        self._report_path = ""
        super().__init__("TestDocumentor", SYSTEM_PROMPT, TOOLS)

    # ── Tool dispatch ─────────────────────────────────────────────────────────

    def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "list_screenshots":
            return self._list_screenshots()

        elif tool_name == "write_report":
            return self._write_report(tool_input["run_id"], tool_input["content"])

        elif tool_name == "finish":
            self._report_path = tool_input.get("report_path", self._report_path)
            return "OK"

        return f"ERROR: unknown tool '{tool_name}'"

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _list_screenshots(self) -> str:
        shots_dir = os.path.join(self.tests_dir, "screenshots")
        if not os.path.exists(shots_dir):
            return "[]"
        files = sorted(f for f in os.listdir(shots_dir) if f.endswith(".png"))
        return json.dumps(files)

    def _write_report(self, run_id: str, content: str) -> str:
        try:
            os.makedirs(self.reports_dir, exist_ok=True)
            filename = f"qa_report_{run_id}.md"
            path = os.path.join(self.reports_dir, filename)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            self._report_path = path
            return f"OK: report written to {path}"
        except Exception as exc:
            return f"ERROR writing report: {exc}"

    # ── Public entry point ────────────────────────────────────────────────────

    @staticmethod
    def _truncate_exec_result(exec_result: dict) -> dict:
        """Trim stdout/stderr per suite to avoid blowing up the prompt size."""
        trimmed = {
            "summary":  exec_result.get("summary", {}),
            "failures": exec_result.get("failures", []),
            "suites":   {},
        }
        for name, data in exec_result.get("suites", {}).items():
            trimmed["suites"][name] = {
                "returncode": data.get("returncode"),
                "tests":      data.get("tests", []),
                # keep only last 500 chars of stdout for context
                "stdout_tail": (data.get("stdout") or "")[-500:],
            }
        return trimmed

    def run(self, exec_result: dict, run_id: str, created_files: list[str]) -> dict:
        self._report_path = ""

        date_str    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        screenshots = json.loads(self._list_screenshots())
        trimmed     = self._truncate_exec_result(exec_result)

        prompt = (
            f"run_id={run_id}, date={date_str}\n"
            f"created_test_files={json.dumps(created_files)}\n"
            f"screenshots={json.dumps(screenshots[:30])} "
            f"({'...' if len(screenshots) > 30 else 'all shown'})\n"
            f"exec_result={json.dumps(trimmed, indent=2)}\n\n"
            "Generate the full QA report markdown and call write_report, then finish."
        )

        self.run_loop(prompt)
        return {"report_path": self._report_path}
