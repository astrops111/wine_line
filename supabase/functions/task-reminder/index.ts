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

function buildReminderFlex(task: { title: string; due_date: string | null }) {
  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "未設定";
  return {
    type: "flex",
    altText: `⏰ 提醒：任務「${task.title}」即將到期`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#F59E0B", paddingAll: "14px",
        contents: [{ type: "text", text: "⏰ 任務提醒", weight: "bold", color: "#FFFFFF", size: "md" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px",
        contents: [
          { type: "text", text: task.title, weight: "bold", size: "md", wrap: true },
          { type: "text", text: `到期時間：${dueLabel}`, size: "sm", color: "#666666" },
        ],
      },
    },
  };
}

function buildOverdueFlex(task: { title: string; due_date: string }) {
  const dueLabel = new Date(task.due_date).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return {
    type: "flex",
    altText: `🔴 逾期：任務「${task.title}」已超過到期時間`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#EF4444", paddingAll: "14px",
        contents: [{ type: "text", text: "🔴 任務逾期通知", weight: "bold", color: "#FFFFFF", size: "md" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px",
        contents: [
          { type: "text", text: task.title, weight: "bold", size: "md", wrap: true },
          { type: "text", text: `到期時間：${dueLabel}`, size: "sm", color: "#666666" },
          { type: "text", text: "此任務已超過到期時間，請盡快處理。", size: "sm", color: "#EF4444", wrap: true },
        ],
      },
    },
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
    const sb = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();
    let reminderCount = 0;
    let overdueCount = 0;

    // 1. Process reminder_at notifications
    const { data: reminderTasks } = await sb.from("tasks")
      .select("id, title, due_date, assigned_to, reminder_at")
      .lte("reminder_at", now)
      .eq("reminder_sent", false)
      .not("status", "in", '("completed","cancelled")')
      .limit(50);

    if (reminderTasks && reminderTasks.length > 0) {
      for (const task of reminderTasks) {
        // Mark sent first to avoid double-sends
        await sb.from("tasks").update({ reminder_sent: true }).eq("id", task.id);

        if (!task.assigned_to || !lineToken) continue;

        // Look up user's LINE ID
        const { data: user } = await sb.from("users")
          .select("line_user_id")
          .eq("id", task.assigned_to)
          .maybeSingle();

        if (user?.line_user_id) {
          await pushLine(user.line_user_id, [buildReminderFlex(task)], lineToken);
          reminderCount++;
        }

        // Also insert a system comment on the task
        await sb.from("task_comments").insert({
          task_id: task.id,
          content: `⏰ 提醒通知已發送 (${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })})`,
          source: "system",
        });
      }
    }

    // 2. Process overdue notifications (due_date passed, not yet notified)
    const { data: overdueTasks } = await sb.from("tasks")
      .select("id, title, due_date, assigned_to, metadata")
      .lt("due_date", now)
      .not("status", "in", '("completed","cancelled")')
      .limit(50);

    if (overdueTasks && overdueTasks.length > 0) {
      for (const task of overdueTasks) {
        const meta = (task.metadata || {}) as Record<string, unknown>;
        if (meta.overdue_notified) continue; // Already notified

        // Mark as notified
        await sb.from("tasks").update({
          metadata: { ...meta, overdue_notified: true },
        }).eq("id", task.id);

        if (!task.assigned_to || !lineToken) continue;

        const { data: user } = await sb.from("users")
          .select("line_user_id")
          .eq("id", task.assigned_to)
          .maybeSingle();

        if (user?.line_user_id) {
          await pushLine(user.line_user_id, [buildOverdueFlex(task)], lineToken);
          overdueCount++;
        }

        await sb.from("task_comments").insert({
          task_id: task.id,
          content: `🔴 逾期通知已發送 (${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })})`,
          source: "system",
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      reminders_sent: reminderCount,
      overdue_sent: overdueCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("task-reminder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
