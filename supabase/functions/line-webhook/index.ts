import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── LINE helpers ─────────────────────────────────────────────────────────────

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

async function reply(replyToken: string, messages: object[], accessToken: string) {
  console.log("[reply] sending reply, token=", replyToken?.slice(0, 10) + "...", "msgs count=", messages.length);
  try {
    const payload = JSON.stringify({ replyToken, messages });
    console.log("[reply] payload length=", payload.length);
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: payload,
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[reply] LINE reply failed ${res.status}: ${body}`);
    } else {
      console.log(`[reply] LINE reply success ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[reply] fetch exception:", err);
  }
}

async function push(to: string, messages: object[], accessToken: string) {
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

function text(msg: string) {
  return { type: "text", text: msg };
}

async function getLineProfile(lineUserId: string, accessToken: string, groupId?: string | null): Promise<{ displayName: string }> {
  // In group chats, use group member profile endpoint (direct profile only works for bot friends)
  const url = groupId
    ? `https://api.line.me/v2/bot/group/${groupId}/member/${lineUserId}`
    : `https://api.line.me/v2/bot/profile/${lineUserId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return await res.json();
  // Fallback: try direct profile if group endpoint failed
  if (groupId) {
    const res2 = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res2.ok) return await res2.json();
  }
  return { displayName: "使用者" };
}

async function getGroupSummary(groupId: string, accessToken: string): Promise<{ groupName: string }> {
  const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok ? await res.json() : { groupName: "" };
}

// ── DB helpers ───────────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>;

async function upsertLineUser(lineUserId: string, displayName: string, db: SupabaseClient) {
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("line_users")
    .select("id, line_user_id, display_name, is_verified, user_id, pending_action")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = { last_active_at: now };
    // Update display_name if we got a real name and stored value is the fallback
    if (displayName && displayName !== "使用者" && existing.display_name !== displayName) {
      updates.display_name = displayName;
    }
    await db.from("line_users").update(updates).eq("id", existing.id);
    return { row: { ...existing, display_name: updates.display_name as string ?? existing.display_name }, isNew: false };
  }

  const { data: inserted } = await db
    .from("line_users")
    .insert({ line_user_id: lineUserId, display_name: displayName, is_verified: false, last_active_at: now })
    .select("id, line_user_id, display_name, is_verified, user_id, pending_action")
    .single();

  return { row: inserted, isNew: true };
}

async function upsertLineGroup(groupId: string, groupName: string, db: SupabaseClient) {
  const { data: existing } = await db
    .from("line_groups")
    .select("id, group_name")
    .eq("line_group_id", groupId)
    .maybeSingle();

  if (existing) {
    if (groupName && groupName !== existing.group_name) {
      await db.from("line_groups").update({ group_name: groupName, is_active: true }).eq("id", existing.id);
    }
    return existing;
  }

  const { data: inserted } = await db
    .from("line_groups")
    .insert({ line_group_id: groupId, group_name: groupName || groupId, group_type: "general", is_active: true, joined_at: new Date().toISOString() })
    .select("id")
    .single();

  return inserted;
}

// ── Labels ────────────────────────────────────────────────────────────────────

function priorityLabel(p: string) {
  return ({ low: "🟢低", medium: "🟡中", high: "🔴高", urgent: "🚨緊急" })[p] ?? p;
}
function statusLabel(s: string) {
  return ({ pending: "待處理", in_progress: "進行中", completed: "已完成", cancelled: "已取消" })[s] ?? s;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "#4CAF50", medium: "#E67E22", high: "#E74C3C", urgent: "#8E44AD",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "#95A5A6", in_progress: "#2980B9", completed: "#27AE60", cancelled: "#7F8C8D",
};

// ── Flex Message Builders ─────────────────────────────────────────────────────

/** A single button row for Flex body/footer */
function mkBtn(
  label: string,
  msgText: string,
  style: "primary" | "secondary" | "link" = "secondary",
  color?: string,
) {
  return {
    type: "button",
    action: { type: "message", label, text: msgText },
    style,
    height: "sm",
    margin: "xs",
    ...(color ? { color } : {}),
  };
}

/** Two-column label/value row for Flex body */
function infoRow(label: string, value: string, valueColor = "#333333") {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "xs",
    contents: [
      { type: "text", text: label, color: "#AAAAAA", size: "xs", flex: 2 },
      { type: "text", text: value, color: valueColor, size: "xs", flex: 5, weight: "bold" },
    ],
  };
}

/** Append quick reply chips to any message object */
function withQuickReplies(msg: object, items: Array<{ label: string; text: string }>) {
  return {
    ...msg,
    quickReply: {
      items: items.map(it => ({
        type: "action",
        action: { type: "message", label: it.label, text: it.text },
      })),
    },
  };
}

// ── Main Menu Flex ────────────────────────────────────────────────────────────

function flexMenu(isGroup = false, isManager = false, liffNewTaskId = "") {
  const newTaskBtn = liffNewTaskId
    ? { type: "button", action: { type: "uri", label: "➕ 新增任務", uri: `https://liff.line.me/${liffNewTaskId}` }, style: "secondary", height: "sm" }
    : mkBtn("➕ 新增任務", "/任務 新增", "secondary");
  return {
    type: "flex",
    altText: "📖 功能選單",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: "#722F37",
        contents: [
          { type: "text", text: "🍷 葡萄酒管理助理", weight: "bold", color: "#FFFFFF", size: "xl" },
          { type: "text", text: "請選擇要執行的功能", color: "#FFCCCC", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "12px",
        contents: [
          mkBtn("📋 任務列表", "/任務 列表", "primary"),
          newTaskBtn,
          mkBtn("⚙️ 工作流程狀態", "/流程 狀態", "secondary"),
          mkBtn("🌿 假期餘額", "/假期餘額", "secondary"),
          ...(isManager ? [mkBtn("🔑 管理員選單", "/管理", "secondary")] : []),
          ...(isGroup ? [] : [mkBtn("👤 帳號連結說明", "/說明", "link")]),
        ],
      },
    },
  };
}

// ── Task List Flex Carousel ───────────────────────────────────────────────────

function flexTaskList(tasks: any[], ownerName?: string, liffNewTaskId = "") {
  const altText = ownerName
    ? `📋 ${ownerName} 的任務（${tasks.length} 件）`
    : `📋 您的任務（${tasks.length} 件）`;

  // Empty state
  if (tasks.length === 0) {
    return withQuickReplies(
      {
        type: "flex",
        altText: ownerName ? `✅ ${ownerName} 目前沒有進行中的任務` : "✅ 目前沒有待處理的任務",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            contents: [
              { type: "text", text: "✅", size: "3xl", align: "center" },
              {
                type: "text",
                text: ownerName ? `${ownerName} 目前沒有進行中任務` : "沒有待處理任務",
                weight: "bold",
                size: "lg",
                align: "center",
                margin: "md",
              },
              { type: "text", text: "目前所有任務均已完成", color: "#AAAAAA", size: "sm", align: "center", margin: "sm" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "8px",
            contents: [liffNewTaskId
              ? { type: "button", action: { type: "uri", label: "➕ 新增任務", uri: `https://liff.line.me/${liffNewTaskId}` }, style: "primary", height: "sm" }
              : mkBtn("➕ 新增任務", "/任務 新增", "primary")],
          },
        },
      },
      liffNewTaskId
        ? [{ label: "➕ 新增任務", text: "/說明" }, { label: "⚙️ 流程狀態", text: "/流程 狀態" }]
        : [{ label: "➕ 新增任務", text: "/任務 新增" }, { label: "⚙️ 流程狀態", text: "/流程 狀態" }],
    );
  }

  const bubbles = tasks.slice(0, 10).map((t: any, i: number) => {
    const shortId = t.id.slice(0, 6);
    const due = t.due_date ? t.due_date.slice(0, 10) : "無截止日";
    const pColor = PRIORITY_COLOR[t.priority] ?? "#95A5A6";
    const sColor = STATUS_COLOR[t.status] ?? "#95A5A6";

    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        backgroundColor: pColor,
        contents: [
          {
            type: "text",
            text: `${i + 1}. ${t.title}`,
            color: "#FFFFFF",
            weight: "bold",
            size: "sm",
            wrap: true,
            maxLines: 2,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          infoRow("狀態", statusLabel(t.status), sColor),
          infoRow("優先", priorityLabel(t.priority), pColor),
          infoRow("截止", due),
          { type: "text", text: `#${shortId}`, color: "#CCCCCC", size: "xxs", margin: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "8px",
        contents: [
          {
            type: "button",
            action: { type: "message", label: "✅ 標記完成", text: `/任務 #${shortId} 完成` },
            style: "primary",
            height: "sm",
            color: "#27AE60",
          },
          {
            type: "button",
            action: { type: "message", label: "📝 更新備註", text: `/任務 #${shortId} 更新` },
            style: "secondary",
            height: "sm",
          },
        ],
      },
    };
  });

  // In group context, prepend a header bubble showing whose tasks these are
  if (ownerName) {
    bubbles.unshift({
      type: "bubble",
      size: "nano",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        justifyContent: "center",
        backgroundColor: "#722F37",
        contents: [
          { type: "text", text: `📋 ${ownerName}`, color: "#FFFFFF", weight: "bold", size: "md", align: "center" },
          { type: "text", text: "的進行中任務", color: "#FFCCCC", size: "xs", align: "center", margin: "xs" },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            paddingAll: "6px",
            backgroundColor: "#FFFFFF22",
            cornerRadius: "20px",
            contents: [
              { type: "text", text: `${tasks.length} 件`, color: "#FFFFFF", size: "xl", weight: "bold", align: "center" },
            ],
          },
        ],
      },
    } as any);
  }

  return withQuickReplies(
    {
      type: "flex",
      altText,
      contents: { type: "carousel", contents: bubbles },
    },
    [
      { label: "⚙️ 流程狀態", text: "/流程 狀態" },
      { label: "📖 指令說明", text: "/說明" },
    ],
  );
}

// ── Group Task List (shows all tasks with owner names) ────────────────────────

function flexGroupTaskList(tasks: any[]) {
  if (tasks.length === 0) {
    return withQuickReplies(
      text("✅ 此群組目前沒有進行中的流程任務。"),
      [{ label: "⚙️ 流程狀態", text: "/流程 狀態" }],
    );
  }

  const bubbles: any[] = tasks.slice(0, 10).map((t: any, i: number) => {
    const shortId = t.id.slice(0, 6);
    const due = t.due_date ? t.due_date.slice(0, 10) : "無截止日";
    const pColor = PRIORITY_COLOR[t.priority] ?? "#95A5A6";
    const sColor = STATUS_COLOR[t.status] ?? "#95A5A6";
    const assigneeName = t.assignee?.name ?? "—";

    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        backgroundColor: pColor,
        contents: [
          { type: "text", text: `${i + 1}. ${t.title}`, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true, maxLines: 2 },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          infoRow("負責人", assigneeName, "#1A252F"),
          infoRow("狀態", statusLabel(t.status), sColor),
          infoRow("優先", priorityLabel(t.priority), pColor),
          infoRow("截止", due),
          { type: "text", text: `#${shortId}`, color: "#CCCCCC", size: "xxs", margin: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "8px",
        contents: [
          {
            type: "button",
            action: { type: "message", label: "✅ 標記完成", text: `/任務 #${shortId} 完成` },
            style: "primary",
            height: "sm",
            color: "#27AE60",
          },
        ],
      },
    };
  });

  // Header bubble
  bubbles.unshift({
    type: "bubble",
    size: "nano",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      justifyContent: "center",
      backgroundColor: "#722F37",
      contents: [
        { type: "text", text: "📋 群組流程任務", color: "#FFFFFF", weight: "bold", size: "md", align: "center" },
        { type: "text", text: "所有成員任務", color: "#FFCCCC", size: "xs", align: "center", margin: "xs" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          paddingAll: "6px",
          backgroundColor: "#FFFFFF22",
          cornerRadius: "20px",
          contents: [
            { type: "text", text: `${tasks.length} 件`, color: "#FFFFFF", size: "xl", weight: "bold", align: "center" },
          ],
        },
      ],
    },
  } as any);

  return withQuickReplies(
    {
      type: "flex",
      altText: `📋 群組流程任務（${tasks.length} 件）`,
      contents: { type: "carousel", contents: bubbles },
    },
    [
      { label: "⚙️ 流程狀態", text: "/流程 狀態" },
      { label: "📖 說明", text: "/說明" },
    ],
  );
}

// ── Task Created / Done Flex ──────────────────────────────────────────────────

function flexSuccess(emoji: string, title: string, subtitle: string) {
  return withQuickReplies(
    {
      type: "flex",
      altText: title,
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          contents: [
            { type: "text", text: emoji, size: "3xl", align: "center" },
            { type: "text", text: title, weight: "bold", size: "md", align: "center", margin: "md", wrap: true },
            { type: "text", text: subtitle, color: "#AAAAAA", size: "sm", align: "center", margin: "sm", wrap: true },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "8px",
          contents: [mkBtn("📋 查看任務列表", "/任務 列表", "primary")],
        },
      },
    },
    [
      { label: "📋 任務列表", text: "/任務 列表" },
      { label: "➕ 再新增", text: "/任務 新增" },
      { label: "⚙️ 流程狀態", text: "/流程 狀態" },
    ],
  );
}

// ── Workflow Status Flex ──────────────────────────────────────────────────────

function flexWorkflowStatus(instances: any[]) {
  if (!instances || instances.length === 0) {
    return withQuickReplies(
      text("📭 目前沒有進行中的流程。"),
      [{ label: "📋 任務列表", text: "/任務 列表" }],
    );
  }

  const bodyContents: any[] = [];
  instances.forEach((wi: any, idx: number) => {
    const shortId = (wi.id as string).slice(0, 6);
    const date = wi.started_at ? (wi.started_at as string).slice(0, 10) : "";
    const wiStatusLabel = wi.status === "paused" ? "⏸ 暫停" : "🔄 進行中";

    if (idx > 0) bodyContents.push({ type: "separator", margin: "md" });

    bodyContents.push({
      type: "box", layout: "vertical", margin: idx === 0 ? "none" : "md",
      contents: [
        { type: "text", text: wi.name ?? "—", weight: "bold", size: "sm", wrap: true },
        { type: "text", text: `${wiStatusLabel}　開始：${date}`, color: "#AAAAAA", size: "xs", margin: "xs" },
        {
          type: "box", layout: "horizontal", spacing: "sm", margin: "sm",
          contents: [
            {
              type: "button",
              action: { type: "message", label: "🔄 進行中", text: `/流程 任務 #${shortId}` },
              style: "secondary", height: "sm", flex: 1,
            },
            {
              type: "button",
              action: { type: "message", label: "📋 全部", text: `/流程 任務 #${shortId} 全部` },
              style: "secondary", height: "sm", flex: 1,
            },
          ],
        },
      ],
    });
  });

  return withQuickReplies(
    {
      type: "flex",
      altText: `⚙️ 進行中的流程（${instances.length} 件）`,
      contents: {
        type: "bubble",
        header: {
          type: "box", layout: "vertical", paddingAll: "12px", backgroundColor: "#2C3E50",
          contents: [
            { type: "text", text: `⚙️ 進行中的流程（${instances.length} 件）`, color: "#FFFFFF", weight: "bold", size: "md" },
          ],
        },
        body: { type: "box", layout: "vertical", paddingAll: "12px", contents: bodyContents },
        footer: {
          type: "box", layout: "vertical", paddingAll: "8px",
          contents: [mkBtn("📋 查看任務列表", "/任務 列表", "primary")],
        },
      },
    },
    [{ label: "📋 任務列表", text: "/任務 列表" }, { label: "📖 說明", text: "/說明" }],
  );
}

// ── Manager Flex Builders ─────────────────────────────────────────────────────

function flexManagerMenu() {
  return withQuickReplies(
    {
      type: "flex",
      altText: "🔑 管理員選單",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          paddingAll: "16px",
          backgroundColor: "#1A252F",
          contents: [
            { type: "text", text: "🔑 管理員選單", weight: "bold", color: "#FFFFFF", size: "xl" },
            { type: "text", text: "選擇管理功能", color: "#AEB6BF", size: "sm", margin: "xs" },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          paddingAll: "12px",
          contents: [
            mkBtn("📊 團隊任務全覽", "/管理 全覽", "primary"),
            mkBtn("➕ 指派任務", "/管理 指派", "secondary"),
            mkBtn("⚙️ 流程狀態", "/流程 狀態", "secondary"),
            mkBtn("📋 我的任務", "/任務 列表", "secondary"),
          ],
        },
      },
    },
    [
      { label: "📊 全覽", text: "/管理 全覽" },
      { label: "➕ 指派", text: "/管理 指派" },
      { label: "⚙️ 流程", text: "/流程 狀態" },
    ],
  );
}

function flexManagerOverview(tasks: any[]) {
  if (tasks.length === 0) {
    return withQuickReplies(
      {
        type: "flex",
        altText: "✅ 團隊目前沒有進行中任務",
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "20px",
            contents: [
              { type: "text", text: "✅", size: "3xl", align: "center" },
              { type: "text", text: "團隊目前沒有進行中任務", weight: "bold", size: "md", align: "center", margin: "md" },
              { type: "text", text: "所有任務均已完成", color: "#AAAAAA", size: "sm", align: "center", margin: "sm" },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "8px",
            contents: [mkBtn("➕ 指派新任務", "/管理 指派", "primary")],
          },
        },
      },
      [{ label: "➕ 指派任務", text: "/管理 指派" }, { label: "⚙️ 流程狀態", text: "/流程 狀態" }],
    );
  }

  const bubbles: any[] = tasks.slice(0, 10).map((t: any, i: number) => {
    const shortId = t.id.slice(0, 6);
    const due = t.due_date ? t.due_date.slice(0, 10) : "無截止日";
    const pColor = PRIORITY_COLOR[t.priority] ?? "#95A5A6";
    const assigneeName = t.assignee?.name ?? "—";

    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        backgroundColor: pColor,
        contents: [
          { type: "text", text: `${i + 1}. ${t.title}`, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true, maxLines: 2 },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          infoRow("負責人", assigneeName, "#1A252F"),
          infoRow("優先", priorityLabel(t.priority), pColor),
          infoRow("截止", due),
          { type: "text", text: `#${shortId}`, color: "#CCCCCC", size: "xxs", margin: "sm" },
        ],
      },
    };
  });

  // Prepend summary header bubble
  bubbles.unshift({
    type: "bubble",
    size: "nano",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      justifyContent: "center",
      backgroundColor: "#1A252F",
      contents: [
        { type: "text", text: "📊 團隊全覽", color: "#FFFFFF", weight: "bold", size: "md", align: "center" },
        { type: "text", text: "進行中任務", color: "#AEB6BF", size: "xs", align: "center", margin: "xs" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          paddingAll: "6px",
          backgroundColor: "#FFFFFF22",
          cornerRadius: "20px",
          contents: [
            { type: "text", text: `${tasks.length} 件`, color: "#FFFFFF", size: "xl", weight: "bold", align: "center" },
          ],
        },
      ],
    },
  });

  return withQuickReplies(
    {
      type: "flex",
      altText: `📊 團隊進行中任務（${tasks.length} 件）`,
      contents: { type: "carousel", contents: bubbles },
    },
    [
      { label: "➕ 指派任務", text: "/管理 指派" },
      { label: "⚙️ 流程狀態", text: "/流程 狀態" },
      { label: "📋 我的任務", text: "/任務 列表" },
    ],
  );
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdTaskList(userId: string, db: SupabaseClient, displayName?: string, isGroup = false, lineGroupId?: string | null, liffNewTaskId = "") {
  let tasks: any[] | null = null;
  console.log("[cmdTaskList] userId=", userId, "isGroup=", isGroup, "lineGroupId=", lineGroupId);

  if (isGroup && lineGroupId) {
    // Group chat: show all tasks from workflows assigned to this group, with assignee name
    const { data: groupRow } = await db
      .from("line_groups")
      .select("id")
      .eq("line_group_id", lineGroupId)
      .maybeSingle();

    console.log("[cmdTaskList] groupRow=", JSON.stringify(groupRow));
    if (groupRow?.id) {
      // Find running workflow instances directly assigned to this LINE group
      const { data: instanceAssignments } = await db
        .from("workflow_instance_line_group_assignments")
        .select("workflow_instance_id")
        .eq("line_group_id", groupRow.id);

      if (instanceAssignments && instanceAssignments.length > 0) {
        const instanceIds = instanceAssignments.map((a: any) => a.workflow_instance_id);
        const { data: allTasks } = await db
          .from("tasks")
          .select("id, title, status, priority, due_date, assignee:users!tasks_assigned_to_fkey(name)")
          .in("workflow_instance_id", instanceIds)
          .in("status", ["pending", "in_progress"])
          .order("priority", { ascending: false })
          .limit(10);
        tasks = allTasks;
      }
    }
    // Fall back to tasks directly assigned to this user if no workflow tasks found
    console.log("[cmdTaskList] group workflow tasks count=", tasks?.length ?? 0);
    if (!tasks || tasks.length === 0) {
      console.log("[cmdTaskList] falling back to user tasks for userId=", userId);
      const { data: fallback, error: fallbackErr } = await db
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("assigned_to", userId)
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: false })
        .limit(10);
      console.log("[cmdTaskList] fallback tasks=", JSON.stringify(fallback), "err=", fallbackErr);
      tasks = fallback;
    }
    console.log("[cmdTaskList] returning flexGroupTaskList with", tasks?.length ?? 0, "tasks");
    return flexGroupTaskList(tasks ?? []);
  } else {
    // Private chat: show tasks from workflow instances assigned to this user
    const { data: instances } = await db
      .from("workflow_instances")
      .select("id")
      .eq("assigned_user_id", userId)
      .in("status", ["running", "paused"]);

    if (instances && instances.length > 0) {
      const instanceIds = instances.map((i: any) => i.id);
      const { data: wfTasks } = await db
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .in("workflow_instance_id", instanceIds)
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: false })
        .limit(10);
      tasks = wfTasks;
    }
    // Fall back to tasks directly assigned to this user
    if (!tasks || tasks.length === 0) {
      const { data: fallback } = await db
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("assigned_to", userId)
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: false })
        .limit(10);
      tasks = fallback;
    }
    return flexTaskList(tasks ?? [], undefined, liffNewTaskId);
  }
}

async function cmdTaskCreate(userId: string, title: string, db: SupabaseClient) {
  if (!title) {
    // Prompt with instructions
    return withQuickReplies(
      {
        type: "flex",
        altText: "➕ 新增任務",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "12px",
            backgroundColor: "#E67E22",
            contents: [{ type: "text", text: "➕ 新增任務", color: "#FFFFFF", weight: "bold", size: "lg" }],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: [
              { type: "text", text: "請輸入以下格式：", color: "#555555", size: "sm" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                paddingAll: "10px",
                backgroundColor: "#F5F5F5",
                cornerRadius: "6px",
                contents: [
                  { type: "text", text: "/任務 新增 [任務標題]", size: "sm", color: "#E67E22", weight: "bold" },
                ],
              },
              { type: "text", text: "例如：", color: "#AAAAAA", size: "xs", margin: "md" },
              { type: "text", text: "/任務 新增 補充紅酒庫存", size: "sm", color: "#333333", margin: "xs" },
              { type: "text", text: "/任務 新增 清潔酒窖", size: "sm", color: "#333333", margin: "xs" },
            ],
          },
        },
      },
      [{ label: "📋 任務列表", text: "/任務 列表" }],
    );
  }

  const { error } = await db.from("tasks").insert({
    title,
    assigned_to: userId,
    status: "pending",
    priority: "medium",
  });

  if (error) return text(`❌ 建立失敗：${error.message}`);
  return flexSuccess("✅", `任務已建立`, `「${title}」已加入待處理清單`);
}

async function cmdTaskDone(rawId: string, userId: string, db: SupabaseClient, accessToken: string, groupId?: string | null, displayName?: string) {
  const shortId = rawId.replace(/[[\]#\s]/g, "").toLowerCase();
  if (!shortId) return text("請提供任務 ID。例如：/任務 #abc123 完成");

  // Fetch only tasks assigned to this user (not completed)
  const { data: allTasks } = await db
    .from("tasks")
    .select("id, title, metadata, workflow_instance_id, sort_order")
    .eq("assigned_to", userId)
    .neq("status", "completed")
    .limit(300);

  const task = allTasks?.find((t: any) => t.id.startsWith(shortId));
  if (!task) return text(`❌ 此任務不存在或您不是負責人，無法完成。`);

  await db.from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", task.id);

  // Start triggered tasks and notify their assignees
  const triggerActions: string[] = (task.metadata as any)?.trigger_actions ?? [];
  let triggeredCount = 0;

  for (const triggeredId of triggerActions) {
    // Fetch the triggered task with its assignee
    const { data: triggered } = await db
      .from("tasks")
      .select("id, title, priority, due_date, assigned_to")
      .eq("id", triggeredId)
      .eq("status", "pending")
      .maybeSingle();

    if (!triggered) continue;

    // Update triggered task to in_progress
    await db.from("tasks").update({ status: "in_progress" }).eq("id", triggeredId);
    triggeredCount++;

    // Look up the assignee's LINE user ID
    if (!triggered.assigned_to) continue;
    const { data: lineUser } = await db
      .from("line_users")
      .select("line_user_id")
      .eq("user_id", triggered.assigned_to)
      .eq("is_verified", true)
      .maybeSingle();

    if (!lineUser?.line_user_id) continue;

    // Push notification to assignee
    const due = triggered.due_date ? triggered.due_date.slice(0, 10) : "無截止日";
    const pColor = PRIORITY_COLOR[triggered.priority] ?? "#95A5A6";
    const shortTriggeredId = triggered.id.slice(0, 6);

    await push(lineUser.line_user_id, [
      withQuickReplies(
        {
          type: "flex",
          altText: `🔔 新任務已指派：${triggered.title}`,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              paddingAll: "12px",
              backgroundColor: pColor,
              contents: [
                { type: "text", text: "🔔 您有新任務開始了", color: "#FFFFFF", weight: "bold", size: "md" },
                { type: "text", text: `由「${task.title}」完成後觸發`, color: "#FFFFFF", size: "xs", margin: "xs", wrap: true },
              ],
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "14px",
              contents: [
                { type: "text", text: triggered.title, weight: "bold", size: "lg", wrap: true },
                { type: "separator", margin: "md" },
                infoRow("優先", priorityLabel(triggered.priority), pColor),
                infoRow("截止", due),
                { type: "text", text: `#${shortTriggeredId}`, color: "#CCCCCC", size: "xxs", margin: "sm" },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "xs",
              paddingAll: "8px",
              contents: [
                {
                  type: "button",
                  action: { type: "message", label: "✅ 標記完成", text: `/任務 #${shortTriggeredId} 完成` },
                  style: "primary",
                  height: "sm",
                  color: "#27AE60",
                },
                {
                  type: "button",
                  action: { type: "message", label: "📋 查看所有任務", text: "/任務 列表" },
                  style: "secondary",
                  height: "sm",
                },
              ],
            },
          },
        },
        [
          { label: "✅ 完成", text: `/任務 #${shortTriggeredId} 完成` },
          { label: "📋 任務列表", text: "/任務 列表" },
        ],
      ),
    ], accessToken);
  }

  // Look up the next pending/in_progress task in the same workflow instance
  let nextTask: { title: string; assigneeName: string } | null = null;
  if (task.workflow_instance_id) {
    const { data: nextTasks } = await db
      .from("tasks")
      .select("id, title, sort_order, assignee:users!tasks_assigned_to_fkey(name)")
      .eq("workflow_instance_id", task.workflow_instance_id)
      .in("status", ["pending", "in_progress"])
      .neq("id", task.id)
      .order("sort_order", { ascending: true })
      .limit(1);
    if (nextTasks && nextTasks.length > 0) {
      const nt = nextTasks[0];
      nextTask = { title: nt.title, assigneeName: nt.assignee?.name ?? "—" };
    }
  }

  // Build single completion reply
  const bodyContents: any[] = [
    { type: "text", text: `✅ 「${task.title}」已標記為完成`, size: "sm", wrap: true, color: "#27AE60", weight: "bold" },
  ];

  if (triggeredCount > 0) {
    bodyContents.push({
      type: "text", text: `🔔 已通知 ${triggeredCount} 個後續任務負責人`,
      size: "xs", color: "#E67E22", margin: "sm",
    });
  }

  if (nextTask) {
    bodyContents.push({ type: "separator", margin: "md" });
    bodyContents.push({ type: "text", text: "下一個任務是", size: "xs", color: "#AAAAAA", margin: "md" });
    bodyContents.push({ type: "text", text: nextTask.title, weight: "bold", size: "sm", wrap: true, margin: "xs" });
    bodyContents.push({ type: "text", text: `👤 負責人：${nextTask.assigneeName}`, size: "xs", color: "#AAAAAA", margin: "xs" });
  }

  return withQuickReplies(
    {
      type: "flex",
      altText: `✅ 任務完成：${task.title}`,
      contents: {
        type: "bubble",
        header: {
          type: "box", layout: "vertical", paddingAll: "12px", backgroundColor: "#27AE60",
          contents: [
            { type: "text", text: "🎉 任務完成！", color: "#FFFFFF", weight: "bold", size: "lg" },
          ],
        },
        body: { type: "box", layout: "vertical", paddingAll: "14px", contents: bodyContents },
        footer: {
          type: "box", layout: "vertical", paddingAll: "8px",
          contents: [mkBtn("📋 任務列表", "/任務 列表", "secondary")],
        },
      },
    },
    [{ label: "📋 任務列表", text: "/任務 列表" }, { label: "⚙️ 流程狀態", text: "/流程 狀態" }],
  );
}

async function cmdTaskUpdate(rawId: string, note: string, db: SupabaseClient, lineUserRowId?: string) {
  const shortId = rawId.replace(/[[\]#\s]/g, "");
  if (!shortId) return text("請提供任務 ID。");

  const { data: allTasks2 } = await db
    .from("tasks")
    .select("id, title, notes")
    .neq("status", "completed")
    .limit(300);

  const tasks = allTasks2?.filter((t: any) => t.id.startsWith(shortId));
  if (!tasks || tasks.length === 0) return text(`❌ 找不到 ID 為 ${shortId} 的任務。`);
  const task = tasks![0];

  if (!note) {
    // Save pending action and ask user to type note
    if (lineUserRowId) {
      await db.from("line_users")
        .update({ pending_action: { action: "add_note", task_id: task.id, task_title: task.title } })
        .eq("id", lineUserRowId);
    }
    return text(`📝 請直接輸入「${task.title}」的備註內容：`);
  }

  const timestamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
  const existing = task.notes ? `${task.notes}\n` : "";
  const newNotes = `${existing}[${timestamp}] ${note}`;
  const { error: updateErr } = await db.from("tasks").update({ notes: newNotes }).eq("id", task.id);
  if (updateErr) return text(`❌ 備註更新失敗：${updateErr.message}`);
  return flexSuccess("📝", "備註已更新", `「${task.title}」\n${note}`);
}

async function cmdWorkflowStatus(db: SupabaseClient) {
  const { data: instances, error } = await db
    .from("workflow_instances")
    .select("id, name, status, started_at")
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(8);

  if (error) console.error("cmdWorkflowStatus error:", error.message);
  return flexWorkflowStatus(instances ?? []);
}

async function cmdWorkflowTasks(shortId: string, db: SupabaseClient, showAll = false, liffTaskId = "") {
  if (!shortId) return text("請提供流程 ID。例如：/流程 任務 #abc123");

  const { data: allInstances } = await db
    .from("workflow_instances")
    .select("id, name")
    .in("status", ["running", "paused"])
    .limit(100);

  const instance = allInstances?.find((i: any) => i.id.startsWith(shortId));
  if (!instance) return text(`❌ 找不到 ID 為 ${shortId} 的進行中流程。`);

  const baseQuery = db
    .from("tasks")
    .select("id, title, status, priority, due_date, notes, assignee:users!tasks_assigned_to_fkey(name)")
    .eq("workflow_instance_id", instance.id);

  const { data: tasks } = await (showAll
    ? baseQuery
        .order("status", { ascending: false })  // desc: pending → in_progress → completed → cancelled → blocked
        .order("priority", { ascending: false })
        .limit(30)
    : baseQuery.in("status", ["in_progress"]).order("priority", { ascending: false }).limit(10));

  if (!tasks || tasks.length === 0) {
    const emptyMsg = showAll
      ? `📭 「${instance.name}」目前沒有任務。`
      : `🔄 「${instance.name}」目前沒有進行中的任務。`;
    return withQuickReplies(
      text(emptyMsg),
      [{ label: "⚙️ 流程狀態", text: "/流程 狀態" }],
    );
  }

  // Build one bubble per task (carousel / horizontal slider)
  const bubbles: any[] = tasks.map((t: any) => {
    const shortTaskId = t.id.slice(0, 6);
    const due = t.due_date ? t.due_date.slice(0, 10) : "無截止日";
    const pColor = PRIORITY_COLOR[t.priority] ?? "#95A5A6";
    const sColor = STATUS_COLOR[t.status] ?? "#95A5A6";
    const assigneeName = t.assignee?.name ?? "—";
    const isDone = t.status === "completed";

    // Show last note line, truncated
    const lastNote = t.notes
      ? t.notes.trim().split("\n").pop()?.slice(0, 55) + (t.notes.trim().length > 55 ? "…" : "")
      : null;

    const bodyItems: any[] = [
      {
        type: "box", layout: "horizontal", spacing: "sm",
        contents: [
          { type: "text", text: "狀態", color: "#AAAAAA", size: "xs", flex: 2 },
          { type: "text", text: statusLabel(t.status), color: sColor, size: "xs", weight: "bold", flex: 5, wrap: true },
        ],
      },
      {
        type: "box", layout: "horizontal", spacing: "sm", margin: "xs",
        contents: [
          { type: "text", text: "負責人", color: "#AAAAAA", size: "xs", flex: 2 },
          { type: "text", text: assigneeName, size: "xs", flex: 5, wrap: true },
        ],
      },
      {
        type: "box", layout: "horizontal", spacing: "sm", margin: "xs",
        contents: [
          { type: "text", text: "截止日", color: "#AAAAAA", size: "xs", flex: 2 },
          { type: "text", text: due, size: "xs", flex: 5 },
        ],
      },
      {
        type: "box", layout: "horizontal", spacing: "sm", margin: "xs",
        contents: [
          { type: "text", text: "優先", color: "#AAAAAA", size: "xs", flex: 2 },
          { type: "text", text: priorityLabel(t.priority), color: pColor, size: "xs", weight: "bold", flex: 5 },
        ],
      },
    ];

    if (lastNote) {
      bodyItems.push({ type: "separator", margin: "sm" });
      bodyItems.push({
        type: "box", layout: "vertical", margin: "sm",
        contents: [
          { type: "text", text: "📝 備註", color: "#AAAAAA", size: "xxs" },
          { type: "text", text: lastNote, size: "xxs", wrap: true, margin: "xs", color: "#555555" },
        ],
      });
    }

    const footerBtns: any[] = [
      {
        type: "button",
        action: liffTaskId
          ? { type: "uri", label: "✏️ 更新任務", uri: `https://liff.line.me/${liffTaskId}?task_id=${t.id}` }
          : { type: "message", label: "✏️ 更新任務", text: `/任務 #${shortTaskId} 更新` },
        style: "secondary", height: "sm", flex: 1,
      },
    ];
    if (!isDone) {
      footerBtns.push({
        type: "button",
        action: { type: "message", label: "✅ 完成任務", text: `/任務 #${shortTaskId} 完成` },
        style: "primary", height: "sm", flex: 1, color: "#27AE60",
      });
    }

    return {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", paddingAll: "12px", backgroundColor: pColor,
        contents: [
          { type: "text", text: instance.name, color: "#FFFFFF99", size: "xxs", weight: "bold" },
          { type: "text", text: t.title, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true, maxLines: 3, margin: "xs" },
          { type: "text", text: `#${shortTaskId}`, color: "#FFFFFF99", size: "xxs", margin: "xs" },
        ],
      },
      body: { type: "box", layout: "vertical", paddingAll: "12px", contents: bodyItems },
      footer: { type: "box", layout: "horizontal", paddingAll: "8px", spacing: "sm", contents: footerBtns },
    };
  });

  // Navigation card at the end of the carousel
  bubbles.push({
    type: "bubble",
    body: {
      type: "box", layout: "vertical", paddingAll: "16px", justifyContent: "center", spacing: "sm",
      contents: [
        { type: "text", text: `⚙️ ${instance.name}`, weight: "bold", size: "sm", wrap: true, align: "center" },
        { type: "text", text: `${showAll ? "全部" : "進行中"}任務：${tasks.length} 件`, color: "#AAAAAA", size: "xs", align: "center" },
        { type: "separator", margin: "lg" },
        showAll
          ? mkBtn("🔄 進行中任務", `/流程 任務 #${shortId}`, "secondary")
          : mkBtn("📋 全部任務", `/流程 任務 #${shortId} 全部`, "secondary"),
        mkBtn("⚙️ 流程列表", "/流程 狀態", "secondary"),
      ],
    },
  } as any);

  return withQuickReplies(
    {
      type: "flex",
      altText: `⚙️ ${instance.name} 的任務（${tasks.length} 件）`,
      contents: { type: "carousel", contents: bubbles },
    },
    [{ label: "⚙️ 流程狀態", text: "/流程 狀態" }, { label: "📋 我的任務", text: "/任務 列表" }],
  );
}

async function checkManager(userId: string, db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from("users").select("is_line_manager").eq("id", userId).maybeSingle();
  return data?.is_line_manager === true;
}

async function cmdManagerOverview(db: SupabaseClient) {
  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, priority, due_date, assignee:users!tasks_assigned_to_fkey(name)")
    .eq("status", "in_progress")
    .order("priority", { ascending: false })
    .limit(10);

  return flexManagerOverview(tasks ?? []);
}

async function cmdManagerAssign(nameQuery: string, title: string, db: SupabaseClient, accessToken: string) {
  if (!nameQuery || !title) {
    return withQuickReplies(
      {
        type: "flex",
        altText: "➕ 指派任務",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "12px",
            backgroundColor: "#1A252F",
            contents: [{ type: "text", text: "➕ 指派任務", color: "#FFFFFF", weight: "bold", size: "lg" }],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: [
              { type: "text", text: "請輸入以下格式：", color: "#555555", size: "sm" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                paddingAll: "10px",
                backgroundColor: "#F5F5F5",
                cornerRadius: "6px",
                contents: [
                  { type: "text", text: "/管理 指派 [員工姓名] [任務標題]", size: "sm", color: "#1A252F", weight: "bold" },
                ],
              },
              { type: "text", text: "例如：", color: "#AAAAAA", size: "xs", margin: "md" },
              { type: "text", text: "/管理 指派 張小明 補充紅酒庫存", size: "sm", color: "#333333", margin: "xs" },
            ],
          },
        },
      },
      [{ label: "📊 團隊全覽", text: "/管理 全覽" }],
    );
  }

  const { data: users } = await db
    .from("users")
    .select("id, name")
    .ilike("name", `%${nameQuery}%`)
    .eq("status", "active")
    .limit(3);

  if (!users?.length) return text(`❌ 找不到員工「${nameQuery}」`);
  if (users.length > 1) {
    const list = users.map((u: any) => `• ${u.name}`).join("\n");
    return text(`找到多位符合的員工，請輸入完整姓名：\n${list}`);
  }

  const assignee = users[0];
  const { error } = await db.from("tasks").insert({
    title,
    assigned_to: assignee.id,
    status: "in_progress",
    priority: "medium",
  });

  if (error) return text(`❌ 指派失敗：${error.message}`);

  // Push notification to assignee if they have LINE linked
  const { data: lineUser } = await db
    .from("line_users")
    .select("line_user_id")
    .eq("user_id", assignee.id)
    .eq("is_verified", true)
    .maybeSingle();

  if (lineUser?.line_user_id) {
    await push(lineUser.line_user_id, [
      withQuickReplies(
        {
          type: "flex",
          altText: `🔔 新任務已指派：${title}`,
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              paddingAll: "12px",
              backgroundColor: "#E67E22",
              contents: [
                { type: "text", text: "🔔 新任務已指派給您", color: "#FFFFFF", weight: "bold", size: "md" },
                { type: "text", text: "管理員已指派以下任務", color: "#FFFFFF", size: "xs", margin: "xs" },
              ],
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "14px",
              contents: [
                { type: "text", text: title, weight: "bold", size: "lg", wrap: true },
                { type: "separator", margin: "md" },
                infoRow("優先", priorityLabel("medium"), "#E67E22"),
                infoRow("狀態", "進行中", "#2980B9"),
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              paddingAll: "8px",
              contents: [mkBtn("📋 查看我的任務", "/任務 列表", "primary")],
            },
          },
        },
        [{ label: "📋 任務列表", text: "/任務 列表" }],
      ),
    ], accessToken);
  }

  return flexSuccess("✅", "任務已指派", `「${title}」已指派給 ${assignee.name}`);
}

async function cmdRegister(lineUserRowId: string, namePart: string, db: SupabaseClient) {
  if (!namePart) return text("請提供姓名。例如：/註冊 張小明");

  const { data: users } = await db
    .from("users")
    .select("id, name")
    .ilike("name", `%${namePart}%`)
    .eq("status", "active")
    .limit(5);

  if (!users || users.length === 0) {
    return text(`❌ 找不到「${namePart}」的員工記錄。\n請確認姓名正確或聯絡管理員。`);
  }
  if (users.length > 1) {
    const list = users.map((u: any) => `• ${u.name}`).join("\n");
    return text(`找到多位符合的員工，請輸入完整姓名：\n${list}`);
  }

  const user = users[0];
  await db.from("line_users")
    .update({ user_id: user.id, is_verified: true })
    .eq("id", lineUserRowId);

  return withQuickReplies(
    flexSuccess("🎉", `歡迎，${user.name}！`, "帳號連結成功！您現在可以使用所有功能。"),
    [
      { label: "📋 任務列表", text: "/任務 列表" },
      { label: "📖 所有指令", text: "/說明" },
    ],
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  const channelSecret = Deno.env.get("LINE_CHANNEL_SECRET");
  const accessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const liffTaskId = Deno.env.get("LIFF_TASK_ID") ?? "";
  const liffNewTaskId = Deno.env.get("LIFF_NEW_TASK_ID") ?? "";

  if (!channelSecret || !accessToken) {
    console.error("Missing LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN");
    return new Response("Missing LINE credentials", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const valid = await verifySignature(rawBody, signature, channelSecret);
  if (!valid) {
    console.error("Invalid LINE signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const db = createClient(supabaseUrl, supabaseKey);

  for (const event of body.events ?? []) {
    const sourceType: string = event.source?.type ?? "user";
    const isGroup = sourceType === "group" || sourceType === "room";
    const groupId: string | null = event.source?.groupId ?? event.source?.roomId ?? null;

    // ── Join / Leave ─────────────────────────────────────────────────────────
    if (event.type === "join" && groupId) {
      const summary = await getGroupSummary(groupId, accessToken);
      await upsertLineGroup(groupId, summary.groupName, db);
      await reply(event.replyToken, [
        withQuickReplies(
          {
            type: "flex",
            altText: "👋 大家好！",
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                backgroundColor: "#722F37",
                contents: [
                  { type: "text", text: "🍷 葡萄酒管理助理", weight: "bold", color: "#FFFFFF", size: "xl" },
                  { type: "text", text: "已加入此群組", color: "#FFCCCC", size: "sm", margin: "xs" },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                contents: [
                  { type: "text", text: "我可以幫助您管理：", color: "#555555", size: "sm" },
                  { type: "text", text: "📋 任務指派與追蹤", size: "sm", margin: "sm" },
                  { type: "text", text: "⚙️ 工作流程狀態查詢", size: "sm", margin: "xs" },
                  { type: "separator", margin: "md" },
                  { type: "text", text: "💡 個人任務請先私訊機器人完成帳號連結", color: "#AAAAAA", size: "xs", margin: "md", wrap: true },
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                paddingAll: "8px",
                contents: [
                  mkBtn("📋 任務列表", "/任務 列表", "primary"),
                  mkBtn("⚙️ 工作流程狀態", "/流程 狀態", "secondary"),
                ],
              },
            },
          },
          [{ label: "📋 任務列表", text: "/任務 列表" }, { label: "⚙️ 流程狀態", text: "/流程 狀態" }],
        ),
      ], accessToken);
      continue;
    }

    if (event.type === "leave" && groupId) {
      await db.from("line_groups").update({ is_active: false }).eq("line_group_id", groupId);
      continue;
    }

    // ── Only text messages from here ─────────────────────────────────────────
    if (event.type !== "message" || event.message?.type !== "text") continue;
    if (!event.source?.userId) continue;

    const lineUserId: string = event.source.userId;
    const rawText: string = event.message.text.trim();

    // Normalize full-width spaces (U+3000) → ASCII space, collapse multiple spaces
    const lower = rawText.toLowerCase().replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
    console.log(`[cmd] isGroup=${isGroup} lower="${lower}"`);

    if (isGroup && groupId) {
      const summary = await getGroupSummary(groupId, accessToken);
      await upsertLineGroup(groupId, summary.groupName, db);
    }

    const profile = await getLineProfile(lineUserId, accessToken, groupId);
    const { row: lineUser, isNew } = await upsertLineUser(lineUserId, profile.displayName, db);

    if (!lineUser) {
      console.error("Failed to upsert line_user for", lineUserId);
      continue;
    }

    // In groups, only respond to command-like messages (unless user has a pending action)
    if (isGroup && !rawText.startsWith("/") && !["說明","任務","流程"].some(w => rawText.startsWith(w))) {
      if (!lineUser.pending_action) continue;
    }

    // ── Handle pending conversational action (free-text reply) ────────────────
    const pending = lineUser.pending_action as { action: string; task_id: string; task_title: string } | null;
    if (pending && !rawText.startsWith("/")) {
      if (pending.action === "add_note") {
        const { data: task } = await db.from("tasks").select("id, title, notes").eq("id", pending.task_id).maybeSingle();
        await db.from("line_users").update({ pending_action: null }).eq("id", lineUser.id);
        if (task) {
          const timestamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
          const newNotes = `${task.notes ? task.notes + "\n" : ""}[${timestamp}] ${rawText}`;
          const { error: noteErr } = await db.from("tasks").update({ notes: newNotes }).eq("id", task.id);
          const responseMsg = noteErr
            ? text(`❌ 備註儲存失敗：${noteErr.message}`)
            : flexSuccess("📝", "備註已儲存", `「${task.title}」\n${rawText}`);
          await reply(event.replyToken, [responseMsg], accessToken);
        } else {
          await reply(event.replyToken, [text("❌ 找不到對應任務，備註未儲存。")], accessToken);
        }
        continue;
      }
    }

    // ── Route commands ────────────────────────────────────────────────────────
    console.log("[ROUTE] rawText=", JSON.stringify(rawText), "lower=", JSON.stringify(lower), "isGroup=", isGroup, "verified=", lineUser.is_verified, "user_id=", lineUser.user_id);
    let responseMsg;

    if (lower === "/說明" || lower === "/help" || lower === "說明" || lower === "help" || lower === "指令") {
      const isManager = (lineUser.is_verified && lineUser.user_id)
        ? await checkManager(lineUser.user_id, db)
        : false;
      responseMsg = flexMenu(isGroup, isManager, liffNewTaskId);

    } else if (lower.startsWith("/註冊") || lower.startsWith("註冊")) {
      if (isGroup) {
        responseMsg = text(`帳號連結請私訊機器人：\n/註冊 您的姓名\n\n例如：/註冊 張小明`);
      } else {
        const namePart = rawText.replace(/^\/?(註冊)\s*/i, "").trim();
        responseMsg = await cmdRegister(lineUser.id, namePart, db);
      }

    } else if (lower === "/任務 列表" || lower === "/task list" || lower === "任務" || lower === "tasks"
      || lower.replace(/\s+/g, ' ') === "/任務 列表"
      || lower === "/任務列表") {
      console.log("[ROUTE] matched /任務 列表 branch");
      if (!lineUser.is_verified || !lineUser.user_id) {
        console.log("[ROUTE] user not verified or no user_id");
        responseMsg = isGroup
          ? text(`${profile.displayName}，請先私訊機器人：\n/註冊 您的姓名`)
          : withQuickReplies(text("您尚未連結帳號。\n請輸入：/註冊 您的姓名"), []);
      } else {
        try {
          console.log("[ROUTE] calling cmdTaskList");
          responseMsg = await cmdTaskList(lineUser.user_id, db, profile.displayName, isGroup, groupId, liffNewTaskId);
          console.log("[ROUTE] cmdTaskList returned, responseMsg type=", (responseMsg as any)?.type);
        } catch (err) {
          console.error("[ROUTE] cmdTaskList THREW:", err);
          responseMsg = text(`❗ 任務列表載入失敗：${(err as Error).message}`);
        }
      }

    } else if (lower.startsWith("/任務 新增") || lower.startsWith("/task create")) {
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = isGroup
          ? text(`${profile.displayName}，請先私訊機器人：\n/註冊 您的姓名`)
          : text("您尚未連結帳號。\n請輸入：/註冊 您的姓名");
      } else {
        const title = rawText.replace(/^\/任務 新增\s*|^\/task create\s*/i, "").trim();
        responseMsg = await cmdTaskCreate(lineUser.user_id, title, db);
      }

    } else if (lower.match(/^\/任務\s+\S+\s+完成/) || lower.match(/^\/task\s+\S+\s+done/)) {
      const m = rawText.match(/^\/任務\s+(\S+)\s+完成/i) || rawText.match(/^\/task\s+(\S+)\s+done/i);
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = isGroup
          ? text(`${profile.displayName}，請先私訊機器人：\n/註冊 您的姓名`)
          : text("您尚未連結帳號。\n請輸入：/註冊 您的姓名");
      } else {
        responseMsg = await cmdTaskDone(m ? m[1] : "", lineUser.user_id, db, accessToken, groupId, profile.displayName);
      }

    } else if (lower.match(/^\/任務\s+\S+\s+更新/) || lower.match(/^\/task\s+\S+\s+update/)) {
      const m = rawText.match(/^\/任務\s+(\S+)\s+更新\s*(.*)/i) || rawText.match(/^\/task\s+(\S+)\s+update\s*(.*)/i);
      const rawId = m ? m[1] : "";
      const note = m ? m[2].trim() : "";
      responseMsg = await cmdTaskUpdate(rawId, note, db, lineUser.id);

    } else if (lower === "/流程 狀態" || lower === "/workflow status" || lower === "流程" || lower === "workflows") {
      responseMsg = await cmdWorkflowStatus(db);

    } else if (lower.startsWith("/流程 任務") || lower.startsWith("/workflow tasks")) {
      const m = rawText.match(/\/流程 任務\s+#?(\S+?)(?:\s+(全部|all))?$/i);
      const shortId = (m ? m[1] : "").replace(/[#\s]/g, "").toLowerCase();
      const showAll = !!(m && m[2]);
      responseMsg = await cmdWorkflowTasks(shortId, db, showAll, liffTaskId);

    } else if (lower === "/管理" || lower === "/管理 選單" || lower === "管理") {
      if (isGroup) continue; // Manager commands: private chat only
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text("您尚未連結帳號。\n請輸入：/註冊 您的姓名");
      } else if (!await checkManager(lineUser.user_id, db)) {
        responseMsg = text("🔒 您沒有管理員權限。\n如需開通，請聯絡系統管理員。");
      } else {
        responseMsg = flexManagerMenu();
      }

    } else if (lower === "/管理 全覽" || lower === "/manage overview") {
      if (isGroup) continue; // Manager commands: private chat only
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text("您尚未連結帳號。\n請輸入：/註冊 您的姓名");
      } else if (!await checkManager(lineUser.user_id, db)) {
        responseMsg = text("🔒 您沒有管理員權限。");
      } else {
        responseMsg = await cmdManagerOverview(db);
      }

    } else if (lower.startsWith("/管理 指派") || lower.startsWith("/manage assign")) {
      if (isGroup) continue; // Manager commands: private chat only
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text("您尚未連結帳號。\n請輸入：/註冊 您的姓名");
      } else if (!await checkManager(lineUser.user_id, db)) {
        responseMsg = text("🔒 您沒有管理員權限。");
      } else {
        // Format: /管理 指派 [姓名] [任務標題]  (first word = name, rest = title)
        const args = rawText.replace(/^\/管理 指派\s*/i, "").trim().split(/\s+/);
        const nameQuery = args[0] ?? "";
        const title = args.slice(1).join(" ");
        responseMsg = await cmdManagerAssign(nameQuery, title, db, accessToken);
      }

    } else if (lower.startsWith('/管理 核准請假') || lower.startsWith('/管理 退回請假')) {
      if (isGroup) continue;
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text("您尚未連結帳號。");
      } else if (!await checkManager(lineUser.user_id, db)) {
        responseMsg = text("🔒 您沒有權限審核請假。");
      } else {
        const isApprove = lower.startsWith('/管理 核准請假');
        const prefixLength = isApprove ? 8 : 8; // "/管理 核准請假 " length
        const leaveId = rawText.substring(prefixLength).trim();
        responseMsg = await cmdManagerLeaveReview(leaveId, isApprove, db, lineUser.user_id);
      }

    } else if (!isGroup && (isNew || !lineUser.is_verified)) {
      // New user welcome with flex
      responseMsg = {
        type: "flex",
        altText: `👋 歡迎，${profile.displayName}！`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            backgroundColor: "#722F37",
            contents: [
              { type: "text", text: "🍷 葡萄酒管理助理", weight: "bold", color: "#FFFFFF", size: "xl" },
              { type: "text", text: `歡迎，${profile.displayName}！`, color: "#FFCCCC", size: "sm", margin: "xs" },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "16px",
            contents: [
              { type: "text", text: "請先連結您的員工帳號：", weight: "bold", size: "sm" },
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                paddingAll: "10px",
                backgroundColor: "#FFF3E0",
                cornerRadius: "6px",
                contents: [
                  { type: "text", text: "/註冊 您的姓名", size: "md", color: "#E67E22", weight: "bold" },
                ],
              },
              { type: "text", text: "例如：/註冊 張小明", color: "#AAAAAA", size: "xs", margin: "md" },
            ],
          },
        },
      };

    } else if (
      lower.includes('假期餘額') || lower.includes('特休餘額') ||
      lower.includes('特休還有') || lower.includes('剩幾天') ||
      lower.includes('請假餘額') || lower.includes('還有幾天假') ||
      lower === '假期' || lower === '特休'
    ) {
      // Leave balance query
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text('請先連結您的員工帳號。\n輸入：/註冊 您的姓名');
      } else {
        const currentYear = new Date().getFullYear();
        const { data: balances } = await db
          .from('leave_balances')
          .select('leave_type, total_days, used_days, carry_over_days')
          .eq('user_id', lineUser.user_id)
          .eq('year', currentYear);

        const leaveTypeLabel: Record<string, string> = {
          annual: '特休',
          sick: '病假',
          personal: '事假',
          bereavement: '喪假',
          marriage: '婚假',
          maternity: '產假',
          paternity: '陪產假',
          unpaid: '無薪假',
        };

        if (!balances || balances.length === 0) {
          responseMsg = text(`📋 ${currentYear} 年假期餘額尚未設定。\n請聯繫 HR 確認假期配額。`);
        } else {
          const rows = balances.map((b: any) => {
            const remaining = Number(b.total_days || 0) + Number(b.carry_over_days || 0) - Number(b.used_days || 0);
            const label = leaveTypeLabel[b.leave_type] || b.leave_type;
            return {
              type: "box",
              layout: "horizontal",
              paddingTop: "6px",
              paddingBottom: "6px",
              borderWidth: "0.5px",
              borderColor: "#EEEEEE",
              contents: [
                { type: "text", text: label, size: "sm", flex: 3, color: "#444444" },
                { type: "text", text: `${Number(b.total_days || 0) + Number(b.carry_over_days || 0)} 天`, size: "sm", flex: 2, color: "#888888", align: "center" },
                { type: "text", text: `已用 ${Number(b.used_days || 0)} 天`, size: "sm", flex: 3, color: "#888888", align: "center" },
                {
                  type: "text",
                  text: `剩 ${remaining.toFixed(1)} 天`,
                  size: "sm",
                  flex: 3,
                  color: remaining <= 0 ? "#E53E3E" : remaining <= 3 ? "#DD6B20" : "#276749",
                  weight: "bold",
                  align: "right",
                },
              ],
            };
          });

          responseMsg = {
            type: "flex",
            altText: `${currentYear} 年假期餘額查詢`,
            contents: {
              type: "bubble",
              size: "kilo",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#276749",
                paddingAll: "14px",
                contents: [
                  { type: "text", text: "🌿 假期餘額", weight: "bold", color: "#FFFFFF", size: "lg" },
                  { type: "text", text: `${currentYear} 年度`, color: "#C6F6D5", size: "xs", margin: "xs" },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "14px",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    paddingBottom: "6px",
                    contents: [
                      { type: "text", text: "假別", size: "xs", flex: 3, color: "#AAAAAA", weight: "bold" },
                      { type: "text", text: "總天數", size: "xs", flex: 2, color: "#AAAAAA", weight: "bold", align: "center" },
                      { type: "text", text: "已使用", size: "xs", flex: 3, color: "#AAAAAA", weight: "bold", align: "center" },
                      { type: "text", text: "剩餘", size: "xs", flex: 3, color: "#AAAAAA", weight: "bold", align: "right" },
                    ],
                  },
                  ...rows,
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "10px",
                backgroundColor: "#F7FAFC",
                contents: [
                  {
                    type: "button",
                    style: "link",
                    height: "sm",
                    action: { type: "message", label: "📋 查看主選單", text: "/說明" },
                  },
                ],
              },
            },
          };
        }
      }

    } else if (
      lower.includes('加班記錄') || lower.includes('我的加班') || lower.includes('本月加班') ||
      lower.includes('加班時數') || lower === '加班'
    ) {
      // OT hours query for current month
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text('請先連結您的員工帳號。\n輸入：/註冊 您的姓名');
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

        const { data: otRecords } = await db
          .from('overtime_requests')
          .select('request_date, ot_hours, ot_type, filing_type, status')
          .eq('user_id', lineUser.user_id)
          .gte('request_date', monthStart)
          .lt('request_date', nextMonth)
          .order('request_date', { ascending: false });

        if (!otRecords || otRecords.length === 0) {
          responseMsg = text(`📋 ${year}年${month}月 尚無加班記錄。`);
        } else {
          const approvedHours = otRecords.filter((r: any) => r.status === 'approved')
            .reduce((sum: number, r: any) => sum + Number(r.ot_hours || 0), 0);
          const pendingHours = otRecords.filter((r: any) => r.status === 'pending')
            .reduce((sum: number, r: any) => sum + Number(r.ot_hours || 0), 0);

          const otTypeLabel = (t: string) => t === 'comp' ? '補休' : '加班費';
          const statusLabel = (s: string) => s === 'approved' ? '✅' : s === 'rejected' ? '❌' : '⏳';

          const rowContents = otRecords.slice(0, 8).map((r: any) => ({
            type: "box",
            layout: "horizontal",
            paddingTop: "5px",
            paddingBottom: "5px",
            contents: [
              { type: "text", text: r.request_date, size: "xs", flex: 3, color: "#444444" },
              { type: "text", text: `${Number(r.ot_hours || 0)}h`, size: "xs", flex: 2, align: "center", weight: "bold" },
              { type: "text", text: otTypeLabel(r.ot_type), size: "xs", flex: 2, align: "center", color: "#888888" },
              { type: "text", text: statusLabel(r.status), size: "xs", flex: 1, align: "right" },
            ],
          }));

          responseMsg = {
            type: "flex",
            altText: `${year}年${month}月加班記錄`,
            contents: {
              type: "bubble",
              size: "kilo",
              header: {
                type: "box",
                layout: "vertical",
                backgroundColor: "#1A365D",
                paddingAll: "14px",
                contents: [
                  { type: "text", text: "⏰ 加班記錄", weight: "bold", color: "#FFFFFF", size: "lg" },
                  { type: "text", text: `${year}年${month}月`, color: "#90CDF4", size: "xs", margin: "xs" },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                paddingAll: "14px",
                contents: [
                  {
                    type: "box",
                    layout: "horizontal",
                    marginBottom: "8px",
                    contents: [
                      {
                        type: "box", layout: "vertical", flex: 1, alignItems: "center",
                        contents: [
                          { type: "text", text: `${approvedHours.toFixed(1)}h`, size: "xl", weight: "bold", color: "#276749", align: "center" },
                          { type: "text", text: "已核准", size: "xs", color: "#888888", align: "center" },
                        ],
                      },
                      {
                        type: "box", layout: "vertical", flex: 1, alignItems: "center",
                        contents: [
                          { type: "text", text: `${pendingHours.toFixed(1)}h`, size: "xl", weight: "bold", color: "#DD6B20", align: "center" },
                          { type: "text", text: "待審核", size: "xs", color: "#888888", align: "center" },
                        ],
                      },
                    ],
                  },
                  { type: "separator", margin: "md" },
                  {
                    type: "box", layout: "horizontal", margin: "md", paddingBottom: "4px",
                    contents: [
                      { type: "text", text: "日期", size: "xs", flex: 3, color: "#AAAAAA", weight: "bold" },
                      { type: "text", text: "時數", size: "xs", flex: 2, color: "#AAAAAA", weight: "bold", align: "center" },
                      { type: "text", text: "類型", size: "xs", flex: 2, color: "#AAAAAA", weight: "bold", align: "center" },
                      { type: "text", text: "", size: "xs", flex: 1 },
                    ],
                  },
                  ...rowContents,
                ],
              },
              footer: {
                type: "box", layout: "vertical", paddingAll: "10px",
                backgroundColor: "#F7FAFC",
                contents: [{
                  type: "button", style: "link", height: "sm",
                  action: { type: "message", label: "查看主選單", text: "/說明" },
                }],
              },
            },
          };
        }
      }

    } else if (
      lower.includes('薪資單') || lower.includes('薪資') || lower === '我的薪資' || lower === '查薪資'
    ) {
      // Payslip query — show recent payroll records
      if (!lineUser.is_verified || !lineUser.user_id) {
        responseMsg = text('請先連結您的員工帳號。\n輸入：/註冊 您的姓名');
      } else {
        const fmt = (n: number) => new Intl.NumberFormat('zh-TW').format(Math.round(n || 0));

        const { data: payslips } = await db
          .from('payroll_records')
          .select('pay_period, gross_salary, net_salary')
          .eq('user_id', lineUser.user_id)
          .order('pay_period', { ascending: false })
          .limit(3);

        if (!payslips || payslips.length === 0) {
          responseMsg = text('尚無薪資記錄，請聯繫 HR。');
        } else {
          responseMsg = {
            type: 'flex',
            altText: '近期薪資記錄',
            contents: {
              type: 'carousel',
              contents: payslips.map((p: any) => ({
                type: 'bubble',
                size: 'kilo',
                header: {
                  type: 'box', layout: 'vertical', backgroundColor: '#4f46e5',
                  contents: [{ type: 'text', text: p.pay_period, color: '#fff', weight: 'bold' }],
                  paddingAll: '12px',
                },
                body: {
                  type: 'box', layout: 'vertical', spacing: 'sm',
                  contents: [
                    { type: 'box', layout: 'horizontal', contents: [
                      { type: 'text', text: '應發', size: 'sm', color: '#777', flex: 1 },
                      { type: 'text', text: `NT$${fmt(p.gross_salary)}`, size: 'sm', align: 'end', flex: 1 },
                    ]},
                    { type: 'box', layout: 'horizontal', contents: [
                      { type: 'text', text: '實領', size: 'md', weight: 'bold', color: '#4f46e5', flex: 1 },
                      { type: 'text', text: `NT$${fmt(p.net_salary)}`, size: 'md', weight: 'bold', color: '#4f46e5', align: 'end', flex: 1 },
                    ]},
                  ],
                  paddingAll: '12px',
                },
              })),
            },
          };
        }
      }

    } else if (
      lower.startsWith('/請假') || lower.startsWith('請假申請') || lower === '請假'
    ) {
      // Leave request prompt — direct user to LIFF app
      responseMsg = text('📱 請假申請請使用 LIFF App：\n點選選單中的「請假申請」或輸入 /說明 查看功能選單。');

    } else if (!isGroup) {
      responseMsg = withQuickReplies(
        text(`❓ 未識別的指令「${rawText}」`),
        [
          { label: "📖 查看說明", text: "/說明" },
          { label: "📋 任務列表", text: "/任務 列表" },
        ],
      );

    } else {
      continue; // Ignore unknown commands in groups
    }

    console.log("[REPLY] about to reply, responseMsg type=", (responseMsg as any)?.type, "replyToken exists=", !!event.replyToken);
    await reply(event.replyToken, [responseMsg], accessToken);
  }

  return new Response("ok", { status: 200 });
});
