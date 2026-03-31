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
  return res.ok;
}

function buildNotification(taskNo: number, taskName: string, assignee: string, changes: Record<string, string>) {
  const changeRows = Object.entries(changes).map(([field, value]) => ({
    type: "box",
    layout: "horizontal",
    paddingTop: "4px",
    paddingBottom: "4px",
    contents: [
      { type: "text", text: field, size: "sm", color: "#888888", flex: 2 },
      { type: "text", text: value || "-", size: "sm", flex: 5, wrap: true },
    ],
  }));

  return {
    type: "flex",
    altText: `📋 專案更新：#${taskNo} ${taskName}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2D3748",
        paddingAll: "14px",
        contents: [
          { type: "text", text: "📋 專案任務更新", weight: "bold", color: "#FFFFFF", size: "md" },
          { type: "text", text: "來自 Google Sheet 的變更", color: "#A0AEC0", size: "xs", margin: "xs" },
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
              { type: "text", text: "任務", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: `#${taskNo} ${taskName}`, size: "sm", weight: "bold", flex: 5, wrap: true },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "負責人", size: "sm", color: "#888888", flex: 2 },
              { type: "text", text: assignee || "-", size: "sm", flex: 5 },
            ],
          },
          { type: "separator", margin: "md" },
          { type: "text", text: "變更內容", size: "xs", color: "#AAAAAA", weight: "bold", margin: "md" },
          ...changeRows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "message", label: "🏗️ 查看專案進度", text: "/專案 列表" },
          },
        ],
      },
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { task_no, name, assignee, changes } = body;

    if (!task_no || !assignee) {
      return new Response(JSON.stringify({ ok: false, error: "missing task_no or assignee" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up assignee → LINE user ID via users + line_users join
    // Match by users.name (case-insensitive, partial match)
    const { data: mappings } = await db
      .from("users")
      .select("name, line_users!inner(line_user_id)")
      .eq("line_users.is_verified", true);

    // Find matching user by name (fuzzy: contains or equals, case-insensitive)
    const assigneeLower = (assignee as string).toLowerCase().trim();
    const match = (mappings || []).find((m: any) => {
      const userName = (m.name || "").toLowerCase().trim();
      return userName === assigneeLower || userName.includes(assigneeLower) || assigneeLower.includes(userName);
    });

    if (!match) {
      console.log(`No LINE user found for assignee "${assignee}" — skipping notification`);
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no_line_user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lineUserId = (match as any).line_users[0]?.line_user_id;
    if (!lineUserId) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: "no_line_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msg = buildNotification(task_no, name || "", assignee, changes || {});
    const sent = await pushLine(lineUserId, [msg], accessToken);

    console.log(`Project notify: task #${task_no} → ${match.name} (${lineUserId}) sent=${sent}`);

    return new Response(JSON.stringify({ ok: true, sent, user: match.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("project-notify error:", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
