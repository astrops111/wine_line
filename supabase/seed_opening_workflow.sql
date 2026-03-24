-- Seed: 開店前置作業 workflow template + steps + completion triggers
-- Replace the org_id before running.

begin;

do $$
declare
  v_org_id uuid := '00000000-0000-0000-0000-000000000001';
  v_workflow_id u uid;
  v_instance_id uuid;
begin
  insert into public.workflows (
    organization_id,
    name,
    description,
    status,
    metadata
  ) values (
    v_org_id,
    '開店前置作業',
    '由開店前置作業表單建立的流程範本',
    'active',
    jsonb_build_object('type', '開店前置作業')
  )
  returning id into v_workflow_id;

  insert into public.workflow_instances (
    workflow_id,
    organization_id,
    name,
    status
  ) values (
    v_workflow_id,
    v_org_id,
    '開店前置作業（種子任務）',
    'running'
  )
  returning id into v_instance_id;

  with steps_data as (
    select * from (values
      (1,  '設計圖確認',             'Zoey',  null, null, null, '未開始', '平面圖、3D圖', null, null, '與dave確認是否同意', '通知任務2', null, null),
      (2,  '工程第一次報價',         'Zoey',  null, null, null, '未開始', null, null, null, '第二次報價  確認是否最後一次', '通知任務3', null, null),
      (3,  '工程最終報價定案',       'Zoey',  null, null, null, '未開始', null, null, null, '跟Dave確認', '通知任務4', null, null),
      (4,  '現場規劃圖初稿確認',     'Zoey',  null, null, null, '未開始', '規劃設備跟座位擺設', null, null, null, '通知任務33', '通知任務34', null),
      (33, '確認桌椅排位',           'Zoey',  null, null, null, null, null, null, null, '通知DAVE', '通知任務5', null, null),
      (34, '確認規劃廚房',           'Vicky', null, null, null, null, null, null, null, null, '通知任務5', null, null),
      (5,  '施工圖面確認及工程發包', 'Zoey',  null, null, null, '未開始', '確認時間給dave', null, null, '給Dave&Zoey確認時間', '通知任務6-9', '通知任務14-15', null),
      (6,  '電力申請',               '學文',  null, null, null, '未開始', '不受其他任務引響', null, null, null, null, null, null),
      (7,  '大陸設備採購',           'Antia', null, null, null, '未開始', null, null, null, null, null, null, null),
      (8,  '台灣設備採購',           '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (9,  '小家電及小五金採購',     '營運',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (35, '任務6-914-15完成',       null,   null, null, null, null, null, null, null, null, '通知DAVE', '通知任務36', null),
      (36, '監工進度(回報DAVE)',     '學文',  null, null, null, null, null, null, null, '回復施工進度', '通知任務10-20、32', '通知任務25-28', null),
      (10, '統編及稅籍申請',         'Alicia',null, null, null, '未開始', null, null, null, null, null, null, null),
      (11, '電子發票申請',           'Alicia',null, null, null, '未開始', null, null, null, null, null, null, null),
      (12, 'POS機準備',              'Alicia',null, null, null, '未開始', null, null, null, null, null, null, null),
      (13, '刷卡機準備',             'Alicia',null, null, null, '未開始', null, null, null, null, null, null, null),
      (14, '家具採購',               'Zoey',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (15, '招牌安裝',               'Ken',   null, null, null, '未開始', null, null, null, null, null, null, null),
      (16, '軟裝及布置物採購＋植栽', 'Zoey',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (17, '電話及網路申請',         '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (18, '監視器採購及安裝',       '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (19, '音響採購及安裝',         '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (20, '門市用筆電及印表機採購', '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (37, '監工回報(DAVE)',         null,   null, null, null, null, null, null, null, '時間段開始上油漆', '回報DAVE', null, null),
      (38, '完成任務10-20, 32',      null,   null, null, null, null, null, null, null, null, '通知任務21-24', '通知任務30-31', null),
      (21, '裝修後細清廠商',         '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (22, '垃圾清運廠商',           '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (23, '除蟲防治廠商',           '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (24, '保險投保',               '學文',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (25, '人力編制到位',           '營運',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (26, '人力訓練安排',           '營運',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (27, '門市營業用小物件採購',   '營運',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (28, '首次庫存需求請購',       '營運',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (29, '完工前施工狀況檢視',     '學文',  null, null, null, '未開始', '看是否有需要調整', null, null, '通知DAVE', '通知任務39 (有的話)', null, null),
      (39, '須調整項目',             'Zoey',  null, null, null, null, null, null, null, '直到確認完工', '通知任務29', '通知任務40-43', null),
      (30, '行銷廣告案確認及發布',   'Zoey',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (31, '傳單及廣告輸出物',       'Zoey',  null, null, null, '未開始', null, null, null, null, null, null, null),
      (32, '收銀機準備',             'Vicky', null, null, null, '未開始', null, null, null, null, null, null, null),
      (40, '家具進場確認',           'Vicky', null, null, null, null, null, null, null, null, null, null, null),
      (41, '設備進場確認',           'Vicky', null, null, null, null, null, null, null, null, null, null, null),
      (42, '硬體設備確認',           'Vicky', null, null, null, null, null, null, null, null, null, null, null),
      (43, '人員培訓完成確認',       'Vicky', null, null, null, null, null, null, null, null, null, null, null),
      (44, '任務完成40-43',          null,   null, null, null, null, null, null, null, null, '通知任務45', '通知DAVE', null),
      (45, '確認開幕時間',           'Zoey',  null, null, null, null, null, null, null, null, null, null, null)
    ) as t(
      step_no, name, owner, plan_start, plan_end, actual_done, status,
      note1, note2, note3, updated_note, trigger1, trigger2, trigger3
    )
  ),
  inserted_steps as (
    insert into public.workflow_steps (
      workflow_id,
      name,
      step_order,
      step_type,
      config
    )
    select
      v_workflow_id,
      name,
      step_no,
      'task',
      jsonb_build_object(
        'owner', owner,
        'plan_start', plan_start,
        'plan_end', plan_end,
        'actual_done', actual_done,
        'status', status,
        'notes', jsonb_build_array(note1, note2, note3),
        'updated_note', updated_note,
        'triggers', jsonb_build_array(trigger1, trigger2, trigger3)
      )
    from steps_data
    returning id, step_order, name
  ),
  inserted_tasks as (
    insert into public.tasks (
      organization_id,
      workflow_instance_id,
      workflow_step_id,
      title,
      status,
      sort_order,
      metadata
    )
    select
      v_org_id,
      v_instance_id,
      ws.id,
      sd.name,
      case
        when sd.status = '未開始' then 'pending'
        when sd.status is null then 'pending'
        when sd.status = '進行中' then 'in_progress'
        when sd.status = '已完成' then 'completed'
        else 'pending'
      end,
      sd.step_no,
      jsonb_build_object(
        'owner', sd.owner,
        'plan_start', sd.plan_start,
        'plan_end', sd.plan_end,
        'actual_done', sd.actual_done,
        'notes', jsonb_build_array(sd.note1, sd.note2, sd.note3),
        'updated_note', sd.updated_note,
        'trigger_actions', jsonb_build_array(sd.trigger1, sd.trigger2, sd.trigger3)
      )
    from steps_data sd
    join inserted_steps ws on ws.step_order = sd.step_no
    returning id
  ),
  trigger_rows as (
    select
      s.step_no,
      s.name as step_name,
      t.trigger
    from steps_data s
    cross join lateral (values (s.trigger1), (s.trigger2), (s.trigger3)) t(trigger)
    where t.trigger is not null and btrim(t.trigger) <> ''
  )
  insert into public.workflow_triggers (
    organization_id,
    name,
    trigger_type,
    event_source,
    conditions,
    actions,
    is_active
  )
  select
    v_org_id,
    '開店前置作業 - 任務' || step_no || ' 完成 -> ' || trigger,
    'event',
    'task_status_changed',
    jsonb_build_object(
      'field', 'task_title',
      'operator', 'equals',
      'value', step_name,
      'status', 'completed',
      'workflow_id', v_workflow_id
    ),
    jsonb_build_object(
      'type', 'notify',
      'channel', 'system',
      'message', trigger
    ),
    true
  from trigger_rows;
end $$;

commit;
