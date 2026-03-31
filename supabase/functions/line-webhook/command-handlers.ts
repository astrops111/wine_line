import type { SupabaseClient } from './types.ts';
import { priorityLabel, statusLabel, PRIORITY_COLOR, STATUS_COLOR } from './constants.ts';
import { text, pushAndLog } from './line-api.ts';
import {
  mkBtn, infoRow, withQuickReplies,
  flexTaskList, flexGroupTaskList, flexSuccess, flexWorkflowStatus,
} from './flex-builders.ts';

// ── Task List Command ────────────────────────────────────────────────────────

export async function cmdTaskList(userId: string, db: SupabaseClient, displayName?: string, isGroup = false, lineGroupId?: string | null, liffNewTaskId = "", showAll = false) {
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

    const statusFilter = showAll ? ["pending", "in_progress", "completed", "cancelled"] : ["pending", "in_progress"];
    if (instances && instances.length > 0) {
      const instanceIds = instances.map((i: any) => i.id);
      const { data: wfTasks } = await db
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .in("workflow_instance_id", instanceIds)
        .in("status", statusFilter)
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
        .in("status", statusFilter)
        .order("priority", { ascending: false })
        .limit(10);
      tasks = fallback;
    }
    return flexTaskList(tasks ?? [], undefined, liffNewTaskId);
  }
}

// ── Task Create Command ──────────────────────────────────────────────────────

export async function cmdTaskCreate(userId: string, title: string, db: SupabaseClient) {
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

// ── Task Done Command ────────────────────────────────────────────────────────

export async function cmdTaskDone(rawId: string, userId: string, db: SupabaseClient, accessToken: string, groupId?: string | null, displayName?: string) {
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

    await pushAndLog(lineUser.line_user_id, [
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
    ], accessToken, db, { sourceType: "user" });
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

// ── Task Update Command ──────────────────────────────────────────────────────

export async function cmdTaskUpdate(rawId: string, note: string, db: SupabaseClient, lineUserRowId?: string) {
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

// ── Notes Command ────────────────────────────────────────────────────────────

export async function cmdNotes(userId: string, db: SupabaseClient) {
  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, notes, status")
    .eq("assigned_to", userId)
    .not("notes", "is", null)
    .neq("notes", "")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!tasks || tasks.length === 0) {
    return text("📝 目前沒有包含備註的任務。");
  }

  const bubbles = tasks.map((t: any) => {
    const shortId = t.id.slice(0, 6);
    const lastNote = t.notes.split("\n").filter(Boolean).slice(-2).join("\n");
    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        backgroundColor: "#3498DB",
        contents: [
          { type: "text", text: `📝 ${t.title}`, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true, maxLines: 2 },
          { type: "text", text: `#${shortId} · ${statusLabel(t.status)}`, color: "#D6EAF8", size: "xxs", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "10px",
        contents: [
          { type: "text", text: lastNote, size: "xs", color: "#555555", wrap: true, maxLines: 6 },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        contents: [
          mkBtn("📝 新增備註", `/任務 #${shortId} 更新`, "secondary"),
        ],
      },
    };
  });

  return {
    type: "flex",
    altText: `📝 最近備註（${tasks.length} 件）`,
    contents: { type: "carousel", contents: bubbles },
  };
}

// ── Project Tasks Commands ───────────────────────────────────────────────────

export async function cmdProjectList(db: SupabaseClient) {
  const { data: tasks } = await db
    .from("project_tasks")
    .select("task_no, name, assignee, planned_end, actual_end, status, note1")
    .order("task_no", { ascending: true });

  if (!tasks || tasks.length === 0) {
    return text("📭 目前沒有專案任務。");
  }

  const inProgress = tasks.filter((t: any) => t.status !== '已完成');
  const completed = tasks.filter((t: any) => t.status === '已完成');

  const statusIcon = (s: string) => s === '已完成' ? '✅' : s === '進行中' ? '🔄' : '⏳';

  const bubbles = [];
  // Show in-progress first, then batches of 10
  const display = [...inProgress.slice(0, 20)];

  for (let i = 0; i < display.length; i += 5) {
    const batch = display.slice(i, i + 5);
    const rows = batch.map((t: any) => ({
      type: "box",
      layout: "horizontal",
      paddingTop: "6px",
      paddingBottom: "6px",
      borderWidth: "0.5px",
      borderColor: "#EEEEEE",
      contents: [
        { type: "text", text: `#${t.task_no}`, size: "xs", flex: 1, color: "#888888", weight: "bold" },
        { type: "text", text: t.name, size: "xs", flex: 4, color: "#333333", wrap: true },
        { type: "text", text: t.assignee || '-', size: "xs", flex: 2, color: "#666666", align: "center" },
        { type: "text", text: statusIcon(t.status), size: "xs", flex: 1, align: "right" },
      ],
    }));

    bubbles.push({
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#2D3748", paddingAll: "14px",
        contents: [
          { type: "text", text: "🏗️ 專案進度", weight: "bold", color: "#FFFFFF", size: "lg" },
          { type: "text", text: `${inProgress.length} 進行中 / ${completed.length} 完成`, color: "#A0AEC0", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [
          {
            type: "box", layout: "horizontal", paddingBottom: "6px",
            contents: [
              { type: "text", text: "#", size: "xs", flex: 1, color: "#AAAAAA", weight: "bold" },
              { type: "text", text: "任務", size: "xs", flex: 4, color: "#AAAAAA", weight: "bold" },
              { type: "text", text: "負責人", size: "xs", flex: 2, color: "#AAAAAA", weight: "bold", align: "center" },
              { type: "text", text: "", size: "xs", flex: 1 },
            ],
          },
          ...rows,
        ],
      },
    });
  }

  return withQuickReplies(
    { type: "flex", altText: `🏗️ 專案進度（${inProgress.length} 進行中）`, contents: { type: "carousel", contents: bubbles.slice(0, 10) } },
    [{ label: "📖 說明", text: "/說明" }],
  );
}

export async function cmdProjectDone(taskNo: number, db: SupabaseClient): Promise<object> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: task, error } = await db
    .from("project_tasks")
    .update({ status: '已完成', actual_end: today, sync_source: 'line' })
    .eq("task_no", taskNo)
    .select("name")
    .single();

  if (error || !task) return text(`❌ 找不到專案任務 #${taskNo}`);

  return withQuickReplies(
    flexSuccess("✅", `任務 #${taskNo} 完成`, `「${task.name}」已標記為完成`),
    [{ label: "🏗️ 專案列表", text: "/專案 列表" }],
  );
}

export async function cmdProjectNote(taskNo: number, note: string, db: SupabaseClient): Promise<object> {
  const { data: task, error } = await db
    .from("project_tasks")
    .update({ note1: note, sync_source: 'line' })
    .eq("task_no", taskNo)
    .select("name")
    .single();

  if (error || !task) return text(`❌ 找不到專案任務 #${taskNo}`);

  return withQuickReplies(
    text(`📝 任務 #${taskNo}「${task.name}」備註已更新：\n${note}`),
    [{ label: "🏗️ 專案列表", text: "/專案 列表" }],
  );
}

export async function cmdProjectStatus(taskNo: number, newStatus: string, db: SupabaseClient): Promise<object> {
  const validStatuses = ['未開始', '進行中', '已完成'];
  if (!validStatuses.includes(newStatus)) {
    return text(`❌ 無效狀態。請使用：${validStatuses.join('、')}`);
  }

  const updates: any = { status: newStatus, sync_source: 'line' };
  if (newStatus === '已完成') updates.actual_end = new Date().toISOString().slice(0, 10);

  const { data: task, error } = await db
    .from("project_tasks")
    .update(updates)
    .eq("task_no", taskNo)
    .select("name")
    .single();

  if (error || !task) return text(`❌ 找不到專案任務 #${taskNo}`);

  return withQuickReplies(
    text(`📋 任務 #${taskNo}「${task.name}」狀態已更新為：${newStatus}`),
    [{ label: "🏗️ 專案列表", text: "/專案 列表" }],
  );
}
