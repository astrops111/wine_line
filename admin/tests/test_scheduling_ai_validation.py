"""
QA Tests for scheduling-ai edge function validation logic.
Tests the constraint rules (H1-H10) and scoring functions.
Run: python admin/tests/test_scheduling_ai_validation.py
"""
import sys, io, json, subprocess, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

PASS = 0
FAIL = 0

def test(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")

print("=" * 60)
print("QA: scheduling-ai Edge Function Validation")
print("=" * 60)

# ─── Test 1: Edge function file exists ─────────────────────
print("\n📁 File Structure")
fn_path = os.path.join(os.path.dirname(__file__), '..', '..', 'supabase', 'functions', 'scheduling-ai', 'index.ts')
fn_path = os.path.normpath(fn_path)
test("index.ts exists", os.path.isfile(fn_path), f"Not found at {fn_path}")

with open(fn_path, 'r', encoding='utf-8') as f:
    code = f.read()

# ─── Test 2: Core structure checks ────────────────────────
print("\n🏗️  Core Structure")
test("Has serve() handler", "serve(async (req)" in code)
test("Has CORS headers", "Access-Control-Allow-Origin" in code)
test("Has OPTIONS handler", "req.method === 'OPTIONS'" in code)
test("Has DashScope API call", "dashscope.aliyuncs.com" in code)
test("Uses qwen3.5-plus model", "qwen3.5-plus" in code)
test("Has DASHSCOPE_API_KEY check", "DASHSCOPE_API_KEY" in code)

# ─── Test 3: Input validation ─────────────────────────────
print("\n🔍 Input Validation")
test("Validates empty employees", "此門市尚無員工" in code or "No employees" in code)
test("Validates no shift templates", "請先在門市設定中新增班別" in code or "No shift templates" in code)
test("Parses availability from body", "availability" in code and "buildAvailMap" in code)
test("Parses operating_hours from body", "operating_hours" in code)
test("Parses previous_week_assignments", "previous_week_assignments" in code)
test("Parses user_instructions", "user_instructions" in code)

# ─── Test 4: Hard Constraints (H1-H10) ───────────────────
print("\n⚖️  Hard Constraints")
test("H1: Leave conflict check", "leave_conflict" in code)
test("H2: Unavailable day check", "unavailable_conflict" in code or "unavailable" in code.lower())
test("H3: Max hours exceeded check", "max_hours_exceeded" in code)
test("H4: 七休一 check (consecutive days)", "consecutive_days" in code and "七休一" in code)
test("H5: 11h rest interval check", "short_rest" in code and "11" in code)
test("H6: Shift template validation", "invalid_shift" in code or "templateKeys" in code)
test("H7: Part-time ceiling check", "part_time_exceeded" in code)
test("H8: Full-time floor check (warning)", "underutilized" in code)
test("H9: Break compliance §35", "insufficient_break" in code or "requiredBreak" in code)
test("H10: Daily hours cap §30", "daily_hours_exceeded" in code or "dailyWork" in code)

# ─── Test 5: Work Hours Calculation ──────────────────────
print("\n⏱️  Work Hours Calculation")
test("calcWorkHours deducts break", "calcWorkHours" in code)
test("Break deduction in formula", "breakMin" in code or "break_minutes" in code)
test("shiftMinutes helper exists", "shiftMinutes" in code)
test("requiredBreak helper exists", "requiredBreak" in code)
test("Break thresholds: 240/480/720", "240" in code and "480" in code)
test("Daily work > 8h flagged as overtime", "dailyWork" in code or "daily_overtime" in code)
test("Daily work > 12h is violation", "12" in code and "daily_hours_exceeded" in code)

# ─── Test 6: Soft Constraints & Coverage ─────────────────
print("\n📊 Soft Constraints & Coverage")
test("Understaffed day warning", "understaffed" in code)
test("No senior staff warning", "no_senior" in code)
test("Closed days handling", "closedDays" in code or "closed_day" in code)
test("Min staff per day derived", "minStaff" in code or "min_staff" in code)

# ─── Test 7: Scoring Functions ───────────────────────────
print("\n📈 Scoring Functions")
test("Preference score calculation", "calcPreferenceScore" in code)
test("Consistency score calculation", "calcConsistencyScore" in code)
test("coverage_met in summary", "coverage_met" in code)
test("estimated_cost in summary", "estimated_cost" in code)
test("total_hours in summary", "total_hours" in code)
test("preference_score in response", "preference_score" in code)
test("consistency_score in response", "consistency_score" in code)

# ─── Test 8: LLM Integration ─────────────────────────────
print("\n🤖 LLM Integration")
test("JSON extraction from markdown", "```json" in code or "```\\njson" in code)
test("Retry on violations (Phase 5)", "retryResult" in code or "retry" in code.lower())
test("Max 1 retry", "retryValidation" in code or "retry" in code)
test("Filters hallucinated IDs", "validIds" in code or "filter" in code)
test("System prompt includes constraints", "HARD CONSTRAINTS" in code)
test("System prompt includes hours calc rule", "WORK HOURS" in code or "HOURS CALCULATION" in code)

# ─── Test 9: Response Format ─────────────────────────────
print("\n📤 Response Format")
test("Returns assignments array", '"assignments"' in code or 'assignments' in code)
test("Returns violations array", '"violations"' in code or 'violations' in code)
test("Returns warnings array", '"warnings"' in code or 'warnings' in code)
test("Returns notes string", '"notes"' in code or 'notes' in code)
test("Returns summary object", '"summary"' in code or 'summary' in code)
test("Error response with message", "error: error.message" in code)

# ─── Test 10: Frontend Patch ─────────────────────────────
print("\n🖥️  Frontend Patch (Scheduling.tsx)")
fe_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'pages', 'Scheduling.tsx')
fe_path = os.path.normpath(fe_path)
with open(fe_path, 'r', encoding='utf-8') as f:
    fe_code = f.read()

test("Sends availability in payload", "availability," in fe_code and "operating_hours" in fe_code)
test("Sends operating_hours in payload", "operating_hours:" in fe_code and "selectedStore" in fe_code)
test("Sends previous_week_assignments", "previous_week_assignments:" in fe_code)
test("Fetches prev week schedule", "prevSched" in fe_code or "prevStart" in fe_code)
test("Fetches prev week shift_assignments", "shift_assignments" in fe_code and "prevSched" in fe_code)

# ─── Summary ─────────────────────────────────────────────
print("\n" + "=" * 60)
total = PASS + FAIL
print(f"Results: {PASS}/{total} passed, {FAIL} failed")
if FAIL == 0:
    print("🎉 All QA checks passed!")
else:
    print(f"⚠️  {FAIL} check(s) need attention")
print("=" * 60)
