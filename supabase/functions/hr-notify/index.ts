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

function buildLeaveNotification(type: "approved" | "rejected", details: {
  leave_type: string; start_date: string; end_date: string;
  total_days: number; rejection_reason?: string; approver_name?: string;
}) {
  const leaveLabels: Record<string, string> = {
    annual: "特休", sick: "病假", personal: "事假",
    bereavement: "喪假", marriage: "婚假", maternity: "產假",
    paternity: "陪產假", unpaid: "無薪假",
  };
  const leaveLabel = leaveLabels[details.leave_type] || details.leave_type;
  const isApproved = type === "approved";
  const headerColor = isApproved ? "#276749" : "#C53030";
  const icon = isApproved ? "✅" : "❌";
  const statusText = isApproved ? "已核准" : "已拒絕";

  return {
    type: "flex",
    altText: `${icon} 請假申請${statusText}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "14px",
        contents: [
          { type: "text", text: `${icon} 請假申請${statusText}`, weight: "bold", color: "#FFFFFF", size: "md" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "假別", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: leaveLabel, size: "sm", weight: "bold", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "日期", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${details.start_date} ~ ${details.end_date}`, size: "sm", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "天數", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${details.total_days} 天`, size: "sm", flex: 5 },
            ],
          },
          ...(!isApproved && details.rejection_reason ? [{
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "原因", size: "sm", color: "#C53030", flex: 2 },
              { type: "text", text: details.rejection_reason, size: "sm", color: "#C53030", flex: 5, wrap: true },
            ],
          }] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "10px",
        backgroundColor: "#F7FAFC",
        contents: [{
          type: "button", style: "link", height: "sm",
          action: { type: "message", label: "查看假期餘額", text: "假期餘額" },
        }],
      },
    },
  };
}

function buildLeaveSubmissionNotification(details: {
  leave_id: string; requester_name: string; leave_type: string;
  start_date: string; end_date: string; total_days: number; reason?: string;
}) {
  const leaveLabels: Record<string, string> = {
    annual: "特休", sick: "病假", personal: "事假",
    bereavement: "喪假", marriage: "婚假", maternity: "產假",
    paternity: "陪產假", unpaid: "無薪假",
  };
  const leaveLabel = leaveLabels[details.leave_type] || details.leave_type;

  return {
    type: "flex",
    altText: `📥 新的請假申請：${details.requester_name}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#E67E22", paddingAll: "14px",
        contents: [
          { type: "text", text: `📥 待審核請假：${details.requester_name}`, weight: "bold", color: "#FFFFFF", size: "md" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "申請人", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: details.requester_name, size: "sm", weight: "bold", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "假別", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: leaveLabel, size: "sm", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "日期", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${details.start_date} ~ ${details.end_date}`, size: "sm", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "天數", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${details.total_days} 天`, size: "sm", flex: 5 },
            ],
          },
          ...(details.reason ? [{
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "原因", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: details.reason, size: "sm", flex: 5, wrap: true },
            ],
          }] : []),
        ],
      },
      footer: {
        type: "box", layout: "horizontal", paddingAll: "10px", spacing: "sm", backgroundColor: "#F7FAFC",
        contents: [
          {
            type: "button", style: "primary", color: "#276749", height: "sm",
            action: { type: "message", label: "✅ 核准", text: `/管理 核准請假 ${details.leave_id}` },
          },
          {
            type: "button", style: "primary", color: "#C53030", height: "sm",
            action: { type: "message", label: "❌ 退回", text: `/管理 退回請假 ${details.leave_id}` },
          }
        ],
      },
    },
  };
}

function buildOtNotification(type: "approved" | "rejected", details: {
  request_date: string; ot_hours: number; ot_type: string;
  filing_type: string; rejection_reason?: string;
}) {
  const isApproved = type === "approved";
  const headerColor = isApproved ? "#1A365D" : "#C53030";
  const icon = isApproved ? "✅" : "❌";
  const statusText = isApproved ? "已核准" : "已拒絕";
  const otTypeLabel = details.ot_type === "comp" ? "補休" : "加班費";
  const filingLabel = details.filing_type === "pre" ? "事前申請" : "事後補報";

  return {
    type: "flex",
    altText: `${icon} 加班申請${statusText}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "14px",
        contents: [
          { type: "text", text: `${icon} 加班申請${statusText}`, weight: "bold", color: "#FFFFFF", size: "md" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "日期", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: details.request_date, size: "sm", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "加班時數", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `${details.ot_hours} 小時`, size: "sm", weight: "bold", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "補償方式", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: otTypeLabel, size: "sm", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "申請類型", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: filingLabel, size: "sm", flex: 5 },
            ],
          },
          ...(!isApproved && details.rejection_reason ? [{
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "原因", size: "sm", color: "#C53030", flex: 2 },
              { type: "text", text: details.rejection_reason, size: "sm", color: "#C53030", flex: 5, wrap: true },
            ],
          }] : []),
        ],
      },
    },
  };
}

function buildCorrectionNotification(type: "approved" | "rejected", details: {
  correction_type: string; requested_clock_in?: string; requested_clock_out?: string;
  rejection_reason?: string;
}) {
  const isApproved = type === "approved";
  const icon = isApproved ? "✅" : "❌";
  const statusText = isApproved ? "已核准" : "已拒絕";
  const typeLabel = {
    clock_in: "更正上班", clock_out: "更正下班", both: "上下班均更正", missing: "補登打卡",
  }[details.correction_type] || details.correction_type;

  const bodyContents: object[] = [
    {
      type: "box", layout: "horizontal",
      contents: [
        { type: "text", text: "申請類型", size: "sm", color: "#888888", flex: 3 },
        { type: "text", text: typeLabel, size: "sm", weight: "bold", flex: 5 },
      ],
    },
    ...(details.requested_clock_in ? [{
      type: "box", layout: "horizontal",
      contents: [
        { type: "text", text: "申請上班", size: "sm", color: "#888888", flex: 3 },
        { type: "text", text: new Date(details.requested_clock_in).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), size: "sm", flex: 5 },
      ],
    }] : []),
    ...(details.requested_clock_out ? [{
      type: "box", layout: "horizontal",
      contents: [
        { type: "text", text: "申請下班", size: "sm", color: "#888888", flex: 3 },
        { type: "text", text: new Date(details.requested_clock_out).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }), size: "sm", flex: 5 },
      ],
    }] : []),
    ...(!isApproved && details.rejection_reason ? [{
      type: "box", layout: "horizontal",
      contents: [
        { type: "text", text: "拒絕原因", size: "sm", color: "#C53030", flex: 3 },
        { type: "text", text: details.rejection_reason, size: "sm", color: "#C53030", flex: 5, wrap: true },
      ],
    }] : []),
  ];

  return {
    type: "flex",
    altText: `${icon} 補打申請${statusText}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: isApproved ? "#276749" : "#C53030",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `${icon} 補打申請${statusText}`, weight: "bold", color: "#FFFFFF", size: "md" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        spacing: "sm",
        contents: bodyContents,
      },
    },
  };
}

function buildScheduleNotification(details: {
  store_name: string; week_start: string; week_end: string;
  shifts: { date: string; start_time: string; end_time: string }[];
}) {
  const shiftRows: object[] = details.shifts.length > 0
    ? details.shifts.map(s => ({
        type: "box", layout: "horizontal",
        contents: [
          { type: "text", text: s.date.slice(5), size: "sm", color: "#888888", flex: 2 },
          { type: "text", text: `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}`, size: "sm", weight: "bold", flex: 5 },
        ],
      }))
    : [{
        type: "text", text: "本週無排班", size: "sm", color: "#888888",
      }];

  return {
    type: "flex",
    altText: `📅 新班表已發佈: ${details.store_name} ${details.week_start}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#2B6CB0", paddingAll: "14px",
        contents: [
          { type: "text", text: "📅 新班表已發佈", weight: "bold", color: "#FFFFFF", size: "md" },
          { type: "text", text: `${details.store_name} | ${details.week_start} ~ ${details.week_end}`, size: "xs", color: "#BEE3F8", marginTop: "4px" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm",
        contents: [
          { type: "text", text: "您的班次", size: "sm", weight: "bold", color: "#2D3748" },
          { type: "separator", margin: "sm" },
          ...shiftRows,
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "10px", backgroundColor: "#F7FAFC",
        contents: [{
          type: "button", style: "link", height: "sm",
          action: { type: "message", label: "查看完整班表", text: "我的班表" },
        }],
      },
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!accessToken) {
      console.error("Missing LINE_CHANNEL_ACCESS_TOKEN");
      return new Response(JSON.stringify({ error: "Missing LINE token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { user_id, type, details } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "Missing type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── schedule_published: broadcast to all employees in store ──
    if (type === "schedule_published") {
      const { store_id, store_name, week_start, assignments, employees } = details || {};
      if (!store_id || !assignments) {
        return new Response(JSON.stringify({ error: "Missing store_id or assignments" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const wStart = new Date(week_start + "T00:00:00");
      const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
      const weekEnd = wEnd.toISOString().split("T")[0];

      const empIds = (employees || []).map((e: { id: string }) => e.id);
      if (empIds.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: mappings } = await db
        .from("line_employee_mapping")
        .select("user_id, line_user_id")
        .in("user_id", empIds)
        .eq("is_verified", true);

      if (!mappings || mappings.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let sentCount = 0;
      for (const m of mappings) {
        const empShifts = (assignments as { user_id: string; date: string; start_time: string; end_time: string }[])
          .filter(a => a.user_id === m.user_id)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(a => ({ date: a.date, start_time: a.start_time, end_time: a.end_time }));

        const msg = buildScheduleNotification({
          store_name: store_name || "門市",
          week_start, week_end: weekEnd, shifts: empShifts,
        });
        await pushLine(m.line_user_id, [msg], accessToken);
        sentCount++;
      }

      return new Response(JSON.stringify({ ok: true, sent: true, count: sentCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other types require user_id
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the employee's LINE user ID
    const { data: mapping } = await db
      .from("line_employee_mapping")
      .select("line_user_id")
      .eq("user_id", user_id)
      .eq("is_verified", true)
      .maybeSingle();

    if (!mapping?.line_user_id && type !== "leave_submitted") {
      // Employee not linked to LINE — silently succeed (not an error)
      console.log(`No LINE mapping for user ${user_id}, skipping notification`);
      return new Response(JSON.stringify({ ok: true, sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let message: object;
    let targetLineUserId = mapping?.line_user_id;

    if (type === "leave_submitted") {
      // 1. Get the requester info
      const { data: requester } = await db.from("users").select("name, reporting_to").eq("id", user_id).single();
      const requesterName = requester?.name || "員工";
      
      message = buildLeaveSubmissionNotification({ ...details, requester_name: requesterName });

      // 2. Dynamic Routing Logic
      // If total_days >= 3, require Admin approval. Else, reporting_to or Admin.
      let approverIds: string[] = [];
      const totalDays = Number(details.total_days) || 1;
      
      if (totalDays >= 3) {
        // Escalate to admins
        const { data: admins } = await db.from("users").select("id").eq("role", "admin");
        approverIds = admins?.map(a => a.id) || [];
      } else if (requester?.reporting_to) {
        // Normal manager
        approverIds = [requester.reporting_to];
      }
      
      // Fallback: if no approver identified, send to all admins
      if (approverIds.length === 0) {
        const { data: admins } = await db.from("users").select("id").eq("role", "admin");
        approverIds = admins?.map(a => a.id) || [];
      }

      // 3. Get LINE IDs of approvers
      const { data: approverMappings } = await db
        .from("line_employee_mapping")
        .select("line_user_id")
        .in("user_id", approverIds)
        .eq("is_verified", true);

      if (!approverMappings || approverMappings.length === 0) {
        console.log(`No verified LINE accounts for approvers of ${user_id}`);
        return new Response(JSON.stringify({ ok: true, sent: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Send to all approvers
      for (const approver of approverMappings) {
        if (approver.line_user_id) {
          await pushLine(approver.line_user_id, [message], accessToken);
        }
      }

      return new Response(JSON.stringify({ ok: true, sent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (type === "leave_approved") {
      message = buildLeaveNotification("approved", details);
    } else if (type === "leave_rejected") {
      message = buildLeaveNotification("rejected", details);
    } else if (type === "ot_approved") {
      message = buildOtNotification("approved", details);
    } else if (type === "ot_rejected") {
      message = buildOtNotification("rejected", details);
    } else if (type === "correction_approved") {
      message = buildCorrectionNotification("approved", details);
    } else if (type === "correction_rejected") {
      message = buildCorrectionNotification("rejected", details);
    } else {
      return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetLineUserId) {
      await pushLine(targetLineUserId, [message], accessToken);
    }

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("hr-notify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
