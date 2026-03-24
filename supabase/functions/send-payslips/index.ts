import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pushLine(to: string, messages: object[], accessToken: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`LINE push failed ${res.status}: ${body}`);
  }
}

function buildPayslipFlex(r: any, name: string) {
  const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(Math.round(n || 0));
  const rows = [
    ['底薪', r.base_salary],
    ['職務加給', r.role_allowance],
    ['伙食津貼', r.meal_allowance],
    ['交通津貼', r.transport_allowance],
    ['全勤獎金', r.attendance_bonus_earned],
    ['加班費', r.overtime_pay],
  ].filter(([, v]) => (v as number) > 0);

  const deductRows = [
    ['請假扣薪', r.leave_deduction],
    ['勞保', r.labor_ins_employee],
    ['健保', r.health_ins_employee],
  ].filter(([, v]) => (v as number) > 0);

  return {
    type: 'flex',
    altText: `${r.pay_period} 薪資單 - 實領 NT$${fmt(r.net_salary)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4f46e5',
        contents: [
          { type: 'text', text: `${r.pay_period} 薪資單`, color: '#ffffff', weight: 'bold', size: 'lg' },
          { type: 'text', text: name, color: '#c7d2fe', size: 'sm' },
        ],
        paddingAll: '16px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          // Earnings rows
          ...rows.map(([label, value]) => ({
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: label as string, size: 'sm', color: '#555', flex: 2 },
              { type: 'text', text: `NT$${fmt(value as number)}`, size: 'sm', align: 'end', flex: 1 },
            ],
          })),
          { type: 'separator' },
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '應發合計', size: 'sm', weight: 'bold', flex: 2 },
            { type: 'text', text: `NT$${fmt(r.gross_salary)}`, size: 'sm', weight: 'bold', align: 'end', flex: 1 },
          ]},
          { type: 'separator' },
          // Deduction rows
          ...deductRows.map(([label, value]) => ({
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: label as string, size: 'sm', color: '#ef4444', flex: 2 },
              { type: 'text', text: `-NT$${fmt(value as number)}`, size: 'sm', color: '#ef4444', align: 'end', flex: 1 },
            ],
          })),
          { type: 'separator' },
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '實領薪資', size: 'md', weight: 'bold', color: '#4f46e5', flex: 2 },
            { type: 'text', text: `NT$${fmt(r.net_salary)}`, size: 'md', weight: 'bold', color: '#4f46e5', align: 'end', flex: 1 },
          ]},
        ],
        paddingAll: '16px',
      },
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

    if (!accessToken) {
      console.error("Missing LINE_CHANNEL_ACCESS_TOKEN");
      return new Response(JSON.stringify({ error: "Missing LINE token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { payroll_run_id } = body;

    if (!payroll_run_id) {
      return new Response(JSON.stringify({ error: "Missing payroll_run_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all payroll_records for the given run, joined with users(name)
    const { data: records, error: recordsError } = await db
      .from("payroll_records")
      .select("*, user:users(name)")
      .eq("payroll_run_id", payroll_run_id);

    if (recordsError) {
      console.error("Failed to load payroll_records:", recordsError.message);
      return new Response(JSON.stringify({ error: recordsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0, message: "No records found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let skipped = 0;
    const sentIds: string[] = [];

    for (const record of records) {
      const userName = record.user?.name ?? "員工";

      // Look up line_employee_mapping for user_id → line_user_id
      const { data: mapping } = await db
        .from("line_employee_mapping")
        .select("line_user_id")
        .eq("user_id", record.user_id)
        .maybeSingle();

      if (!mapping?.line_user_id) {
        console.log(`No LINE mapping for user ${record.user_id}, skipping`);
        skipped++;
        continue;
      }

      // Build and send the payslip Flex Message
      const message = buildPayslipFlex(record, userName);
      await pushLine(mapping.line_user_id, [message], accessToken);
      sentIds.push(record.id);
      sent++;
    }

    // Update payslip_sent_at for all successfully sent records
    if (sentIds.length > 0) {
      const { error: updateError } = await db
        .from("payroll_records")
        .update({ payslip_sent_at: new Date().toISOString() })
        .in("id", sentIds);

      if (updateError) {
        console.error("Failed to update payslip_sent_at:", updateError.message);
      }
    }

    return new Response(JSON.stringify({ sent, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-payslips error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
