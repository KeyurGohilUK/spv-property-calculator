import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';
import { findDueTasks, todayInLondon, addDays } from './schedule.js';

type TaskRow = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  assigned_to: string | null;
  deleted_at: string | null;
};

type PushRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type DueTask = ReturnType<typeof findDueTasks>[number];

const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

const json = (body: Record<string, unknown>, status = 200): Response => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } }
);

function notificationPayload(task: DueTask): string {
  const overdue = task.reminderType === 'overdue';
  return JSON.stringify({
    title: overdue ? 'Overdue task' : 'Task due today',
    body: task.taskTitle,
    tag: `task-reminder-${task.taskId}-${task.dueDate}`,
    url: './tasks/'
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!constantTimeEqual(
      request.headers.get('x-task-reminder-secret') || '',
      requiredEnv('TASK_REMINDER_CRON_SECRET')
    )) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const today = todayInLondon();
    const cutoff = addDays(today, -7);

    const { data: taskRows, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, due_date, status, assigned_to, deleted_at')
      .is('deleted_at', null)
      .neq('status', 'done')
      .lte('due_date', today)
      .gte('due_date', cutoff);
    if (taskError) throw taskError;

    const dueTasks = findDueTasks((taskRows || []) as TaskRow[]);
    if (dueTasks.length === 0) return json({ due: 0, delivered: 0, skipped: 0, failed: 0 });

    // Fetch all active push subscriptions grouped by user.
    const { data: subscriptionRows, error: subError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, workspace_members!inner(active)')
      .eq('workspace_members.active', true);
    if (subError) throw subError;

    const subsByUser = new Map<string, PushRow[]>();
    for (const sub of (subscriptionRows || []) as PushRow[]) {
      const existing = subsByUser.get(sub.user_id) || [];
      existing.push(sub);
      subsByUser.set(sub.user_id, existing);
    }
    const allUserIds = [...subsByUser.keys()];

    webpush.setVapidDetails(
      requiredEnv('VAPID_SUBJECT'),
      requiredEnv('VAPID_PUBLIC_KEY'),
      requiredEnv('VAPID_PRIVATE_KEY')
    );

    let delivered = 0;
    let skipped = 0;
    let failed = 0;

    for (const task of dueTasks) {
      // Notify the assigned user if set; otherwise all active members.
      const recipientIds: string[] = task.assignedTo
        ? (subsByUser.has(task.assignedTo) ? [task.assignedTo] : [])
        : allUserIds;

      for (const userId of recipientIds) {
        // Claim a delivery slot — unique(task_id, user_id, sent_on) prevents double-sends.
        const { data: claim, error: claimError } = await supabase
          .from('task_reminder_deliveries')
          .insert({
            task_id: task.taskId,
            user_id: userId,
            reminder_type: task.reminderType,
            sent_on: today,
            status: 'processing'
          })
          .select('id')
          .maybeSingle();

        if (claimError?.code === '23505') { skipped += 1; continue; }
        if (claimError || !claim?.id) throw claimError || new Error('Could not claim task reminder');

        const subs = subsByUser.get(userId) || [];
        if (!subs.length) {
          await supabase.from('task_reminder_deliveries')
            .update({ status: 'skipped' }).eq('id', claim.id);
          skipped += 1;
          continue;
        }

        const staleIds: string[] = [];
        const results = await Promise.allSettled(subs.map(async (sub: PushRow) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              notificationPayload(task),
              { TTL: 43200, urgency: 'normal' }
            );
          } catch (error) {
            const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
            if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
            else throw error;
          }
        }));

        if (staleIds.length) {
          await supabase.from('push_subscriptions').delete().in('id', staleIds);
        }

        const successful = results.filter((r) => r.status === 'fulfilled').length;
        if (successful > 0) {
          await supabase.from('task_reminder_deliveries')
            .update({ status: 'delivered' }).eq('id', claim.id);
          delivered += 1;
        } else {
          // Remove the claim so tomorrow's run can retry.
          await supabase.from('task_reminder_deliveries').delete().eq('id', claim.id);
          failed += 1;
        }
      }
    }

    return json({ due: dueTasks.length, delivered, skipped, failed });
  } catch (error) {
    console.error('Task reminder function failed:', error);
    return json({ error: 'Task reminder delivery failed' }, 500);
  }
});
