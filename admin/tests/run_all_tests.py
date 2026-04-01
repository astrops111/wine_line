"""
MASTER TEST RUNNER — HRM Admin Panel
======================================
Starts the Vite dev server, runs all test suites, and prints a
colour-coded summary.

Usage:
  python tests/run_all_tests.py [--suite SUITE]

  SUITE options: smoke | employee | time_tracking | leave | scheduling | workflows | hr_dashboard | payroll | notifications | org | hr_modules | system | liff | rbac | cross_cutting | all (default)

The script uses the with_server.py helper from the webapp-testing skill
to start the Vite dev server and then runs each suite.
"""
import subprocess
import sys
import os
import io
import argparse
import traceback
import time

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
ADMIN_DIR   = os.path.dirname(SCRIPT_DIR)
SERVER_SCRIPT = r"C:\Users\TING\.claude\skills\webapp-testing\scripts\with_server.py"

# ── Colour helpers (Windows-safe) ─────────────────────────────────────────────
try:
    import colorama; colorama.init()
    GREEN  = "\033[92m"; RED = "\033[91m"; YELLOW = "\033[93m"; RESET = "\033[0m"
except ImportError:
    GREEN = RED = YELLOW = RESET = ""

SUITES = {
    "smoke":          "smoke/test_navigation.py",
    "employee":       "employee/test_employee_management.py",
    "time_tracking":  "time_tracking/test_time_tracker.py",
    "leave":          "leave/test_leave_overtime.py",
    "scheduling":     "scheduling/test_scheduling.py",
    "workflows":      "workflows/test_workflows.py",
    "hr_dashboard":   "hr_dashboard/test_hr_dashboard.py",
    "payroll":        "payroll/test_payroll.py",
    "notifications":  "notifications/test_notifications.py",
    "org":            "org/test_org_management.py",
    "hr_modules":     "hr_modules/test_hr_modules.py",
    "system":         "system/test_system_admin.py",
    "liff":           "liff/test_liff_app.py",
    "rbac":           "rbac/test_permissions.py",
    "cross_cutting":  "cross_cutting/test_cross_cutting.py",
}

SUITE_LABELS = {
    "smoke":          "Smoke / Navigation",
    "employee":       "Employee Management",
    "time_tracking":  "Time Tracking",
    "leave":          "Leave & Overtime",
    "scheduling":     "Scheduling & Labor Law",
    "workflows":      "Workflow & Tasks",
    "hr_dashboard":   "HR Dashboard & Admin",
    "payroll":        "Payroll Management",
    "notifications":  "Notifications & Triggers",
    "org":            "Organization Management",
    "hr_modules":     "HR Modules (Performance, Docs, etc.)",
    "system":         "System & Admin",
    "liff":           "LIFF Mobile App",
    "rbac":           "RBAC & Permissions",
    "cross_cutting":  "Cross-Cutting Tests",
}


def run_suite(name: str) -> tuple[int, int]:
    """Run a single test suite as a subprocess. Returns (passed, failed)."""
    script = os.path.join(SCRIPT_DIR, SUITES[name])
    print("\n" + "-"*60)
    print("  " + YELLOW + ">> " + SUITE_LABELS[name] + RESET)
    print("-"*60)
    result = subprocess.run(
        [sys.executable, script],
        capture_output=False,
        text=True,
        cwd=SCRIPT_DIR,
    )
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="HRM Test Runner")
    parser.add_argument(
        "--suite",
        choices=[*SUITES.keys(), "all"],
        default="all",
        help="Which test suite to run",
    )
    args = parser.parse_args()

    suites_to_run = list(SUITES.keys()) if args.suite == "all" else [args.suite]

    print(f"\n{'='*60}")
    print("  HRM ADMIN PANEL — AUTOMATED TEST SUITE")
    print(f"  Running: {', '.join(suites_to_run)}")
    print(f"{'='*60}")

    results = {}
    for name in suites_to_run:
        rc = run_suite(name)
        results[name] = rc

    # ── Final summary ─────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  RESULTS SUMMARY")
    print(f"{'='*60}")
    all_pass = True
    for name, rc in results.items():
        icon  = f"{GREEN}PASS{RESET}" if rc == 0 else f"{RED}FAIL{RESET}"
        print(f"  {icon}  {SUITE_LABELS[name]}")
        if rc != 0:
            all_pass = False

    print(f"{'='*60}")
    if all_pass:
        print(f"  {GREEN}All suites passed ✅{RESET}")
    else:
        print(f"  {RED}Some suites failed ❌ — review output above{RESET}")
    print()

    return 0 if all_pass else 1


if __name__ == "__main__":
    # ── Ensure Playwright browsers are installed ──────────────────────────────
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(f"{RED}ERROR: playwright not installed. Run: pip install playwright && python -m playwright install chromium{RESET}")
        sys.exit(1)

    sys.exit(main())
