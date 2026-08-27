import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';
import { findDueViewingReminders } from './schedule.js';

type PushRow = { id: string; endpoint: string; p256dh: string; auth: string };
type Reminder = ReturnType<typeof findDueViewingReminders>[number];

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const constantTimeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }
);

function notificationPayload(reminder: Reminder) {
  const morning = reminder.reminderType === 'morning';
  return JSON.stringify({
    title: morning ? 'Property viewing today' : 'Property viewing in 1 hour',
    body: `${reminder.propertyTitle} at ${reminder.viewingTime}.`,
    tag: `property-viewing-${reminder.propertyId}-${reminder.reminderType}-${reminder.viewingAtLocal}`,
    url: `./?property=${encodeURIComponent(reminder.propertyId)}`
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!constantTimeEqual(
      request.headers.get('x-viewing-reminder-secret') || '',
      requiredEnv('VIEWING_REMINDER_CRON_SECRET')
    )) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: properties, error: propertyError } = await supabase
      .from('properties').select('id,user_id,data').is('deleted_at', null);
    if (propertyError) throw propertyError;

    webpush.setVapidDetails(
      requiredEnv('VAPID_SUBJECT'), requiredEnv('VAPID_PUBLIC_KEY'), requiredEnv('VAPID_PRIVATE_KEY')
    );
    const due = findDueViewingReminders(properties || []);
    let delivered = 0;
    let skipped = 0;
    let failed = 0;

    for (const reminder of due) {
      const { data: claim, error: claimError } = await supabase
        .from('viewing_reminder_deliveries')
        .insert({
          property_id: reminder.propertyId,
          user_id: reminder.userId,
          viewing_at_local: reminder.viewingAtLocal,
          reminder_type: reminder.reminderType,
          status: 'processing'
        }).select('id').maybeSingle();
      if (claimError?.code === '23505') { skipped += 1; continue; }
      if (claimError || !claim?.id) throw claimError || new Error('Could not claim reminder');

      try {
        const { data: subscriptions, error: subscriptionError } = await supabase
          .from('push_subscriptions')
          .select('id,endpoint,p256dh,auth,workspace_members!inner(active)')
          .eq('user_id', reminder.userId).eq('workspace_members.active', true);
        if (subscriptionError) throw subscriptionError;
        if (!subscriptions?.length) {
          await supabase.from('viewing_reminder_deliveries')
            .update({ status: 'skipped', delivered_at: new Date().toISOString() }).eq('id', claim.id);
          skipped += 1;
          continue;
        }

        const staleIds: string[] = [];
        const results = await Promise.allSettled((subscriptions as PushRow[]).map(async (subscription) => {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            }, notificationPayload(reminder), {
              TTL: reminder.reminderType === 'morning' ? 21600 : 3600,
              urgency: reminder.reminderType === 'morning' ? 'normal' : 'high'
            });
          } catch (error) {
            const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
            if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
            else throw error;
          }
        }));
        if (staleIds.length) await supabase.from('push_subscriptions').delete().in('id', staleIds);
        const successful = results.filter((result) => result.status === 'fulfilled').length;
        if (successful > 0) {
          await supabase.from('viewing_reminder_deliveries')
            .update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', claim.id);
          delivered += 1;
        } else {
          await supabase.from('viewing_reminder_deliveries').delete().eq('id', claim.id);
          failed += 1;
        }
      } catch (error) {
        await supabase.from('viewing_reminder_deliveries').delete().eq('id', claim.id);
        console.error(`Viewing reminder ${claim.id} failed:`, error);
        failed += 1;
      }
    }
    return json({ due: due.length, delivered, skipped, failed });
  } catch (error) {
    console.error('Viewing reminder function failed:', error);
    return json({ error: 'Viewing reminder delivery failed' }, 500);
  }
});
