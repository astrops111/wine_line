"""
QA Agents Team Orchestrator
============================
4-agent pipeline powered by Qwen via DashScope API:

  Agent 1 — TestCreator   : generates missing Playwright test files
  Agent 2 — TestExecutor  : auto-starts Vite, runs suites, parses results
  Agent 3 — TestDocumentor: writes qa_report_{run_id}.md
  Agent 4 — ResultFixer   : patches test bugs; reports app bugs

Usage:
  python tests/orchestrator.py                        # full pipeline
  python tests/orchestrator.py --skip-create          # skip creator
  python tests/orchestrator.py --skip-fix             # skip fixer
  python tests/orchestrator.py --suite smoke          # single suite
  python tests/orchestrator.py --skip-create --skip-fix --suite all

Requires:
  pip install openai
  DASHSCOPE_API_KEY in root .env or admin/.env
"""
import sys
import io
import os
import argparse

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ADMIN_DIR  = os.path.dirname(SCRIPT_DIR)

sys.path.insert(0, SCRIPT_DIR)

# ── Colour helpers ────────────────────────────────────────────────────────────
try:
    import colorama
    colorama.init()
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    RESET  = "\033[0m"
except ImportError:
    GREEN = RED = YELLOW = CYAN = RESET = ""


def section(title: str) -> None:
    print(f"\n{'='*62}")
    print(f"  {CYAN}{title}{RESET}")
    print(f"{'='*62}")


def check_dependencies() -> None:
    """Verify required packages are installed before loading agents."""
    try:
        import openai  # noqa: F401
    except ImportError:
        print(f"{RED}ERROR: 'openai' package not installed.{RESET}")
        print("  Run: pip install openai")
        sys.exit(1)


def main() -> int:
    check_dependencies()

    parser = argparse.ArgumentParser(description="QA Agents Team Orchestrator")
    parser.add_argument("--skip-create", action="store_true",
                        help="Skip TestCreatorAgent (use existing tests only)")
    parser.add_argument("--skip-fix",    action="store_true",
                        help="Skip ResultFixerAgent even if failures exist")
    parser.add_argument("--suite",       default="all",
                        help="Suite for executor: all|smoke|employee|time_tracking|…")
    parser.add_argument("--scope",       default="new",
                        help="Scope for creator: new|all")
    args = parser.parse_args()

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*62}")
    print(f"  {YELLOW}QA AGENTS TEAM — HRM Admin Panel{RESET}")
    print(f"  Run ID : {run_id}")
    print(f"  Model  : {os.environ.get('QWEN_MODEL', 'qwen3.5-plus')} via DashScope")
    print(f"  Suite  : {args.suite}")
    print(f"{'='*62}")

    # ── Import agents (after dependency check) ────────────────────────────────
    from agents.test_creator_agent    import TestCreatorAgent
    from agents.test_executor_agent   import TestExecutorAgent
    from agents.test_documentor_agent import TestDocumentorAgent
    from agents.result_fixer_agent    import ResultFixerAgent

    context: dict = {"run_id": run_id, "created_files": []}

    # ── Agent 1: Test Creator ─────────────────────────────────────────────────
    if not args.skip_create:
        section("AGENT 1 — Test Creator")
        try:
            creator = TestCreatorAgent(SCRIPT_DIR, ADMIN_DIR)
            result  = creator.run(scope=args.scope)
            context["created_files"] = result.get("created_files", [])
            if context["created_files"]:
                print(f"  {GREEN}Created:{RESET}")
                for f in context["created_files"]:
                    print(f"    + {os.path.relpath(f, SCRIPT_DIR)}")
            else:
                print(f"  {YELLOW}No new test files needed.{RESET}")
        except Exception as exc:
            print(f"  {RED}TestCreatorAgent error: {exc}{RESET}")
    else:
        print(f"\n  {YELLOW}[skip] TestCreatorAgent{RESET}")

    # ── Agent 2: Test Executor ────────────────────────────────────────────────
    section("AGENT 2 — Test Executor")
    exec_result: dict = {"suites": {}, "summary": {}, "failures": []}
    try:
        executor    = TestExecutorAgent(SCRIPT_DIR)
        exec_result = executor.run(suite=args.suite)
        summary     = exec_result.get("summary", {})
        failures    = exec_result.get("failures", [])
        print(
            f"  Total   : {summary.get('total', 0)}\n"
            f"  {GREEN}Passed{RESET}  : {summary.get('passed', 0)}\n"
            f"  {RED}Failed{RESET}  : {summary.get('failed', 0)}\n"
            f"  {YELLOW}Warned{RESET}  : {summary.get('warned', 0)}\n"
            f"  Bugs    : {summary.get('bugs', 0)}"
        )
    except Exception as exc:
        print(f"  {RED}TestExecutorAgent error: {exc}{RESET}")
        failures = []

    # ── Agent 3: Test Documentor ──────────────────────────────────────────────
    section("AGENT 3 — Test Documentor")
    report_path = ""
    try:
        documentor  = TestDocumentorAgent(SCRIPT_DIR)
        doc_result  = documentor.run(
            exec_result=exec_result,
            run_id=run_id,
            created_files=context["created_files"],
        )
        report_path = doc_result.get("report_path", "")
        if report_path:
            print(f"  {GREEN}Report:{RESET} {report_path}")
        else:
            print(f"  {YELLOW}Report path not returned by agent.{RESET}")
    except Exception as exc:
        print(f"  {RED}TestDocumentorAgent error: {exc}{RESET}")

    # ── Agent 4: Result Fixer ─────────────────────────────────────────────────
    fix_result: dict = {"fixes": [], "app_bugs": []}
    if failures and not args.skip_fix:
        section("AGENT 4 — Result Fixer")
        try:
            fixer      = ResultFixerAgent(SCRIPT_DIR, ADMIN_DIR)
            fix_result = fixer.run(failures=failures)
            fixes      = fix_result.get("fixes", [])
            app_bugs   = fix_result.get("app_bugs", [])
            print(f"  {GREEN}Test fixes applied : {len(fixes)}{RESET}")
            for fix in fixes:
                print(f"    [{fix.get('type','?')}] {fix.get('test','')} — {fix.get('description','')[:60]}")
            if app_bugs:
                print(f"  {YELLOW}App bugs reported  : {len(app_bugs)}{RESET}")
                for bug in app_bugs:
                    print(f"    {bug.get('test_name','')} → {bug.get('file_path','')}")
        except Exception as exc:
            print(f"  {RED}ResultFixerAgent error: {exc}{RESET}")
    elif not failures:
        print(f"\n  {GREEN}No failures — Result Fixer not needed.{RESET}")
    else:
        print(f"\n  {YELLOW}[skip] ResultFixerAgent{RESET}")

    # ── Final summary ─────────────────────────────────────────────────────────
    summary = exec_result.get("summary", {})
    print(f"\n{'='*62}")
    print(f"  {YELLOW}ORCHESTRATION COMPLETE{RESET}")
    print(f"  Run ID  : {run_id}")
    print(f"  Report  : {report_path or '(not generated)'}")
    print(
        f"  Results : {summary.get('total', 0)} total  "
        f"{GREEN}{summary.get('passed', 0)} passed{RESET}  "
        f"{RED}{summary.get('failed', 0)} failed{RESET}"
    )
    print(f"  Fixes   : {len(fix_result.get('fixes', []))} applied  "
          f"App bugs: {len(fix_result.get('app_bugs', []))}")
    print(f"{'='*62}\n")

    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
