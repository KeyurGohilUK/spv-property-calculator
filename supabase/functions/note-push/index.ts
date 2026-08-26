import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import webpush from 'npm:web-push@3.6.7';

type NoteRecord = {
  id: string;
  property_id: string;
  author_user_id: string;
  author_name: string;
};

type DatabaseWebhook = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NoteRecord | null;
};

type PushRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const constantTimeEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } }
);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const webhookSecret = requiredEnv('NOTE_PUSH_WEBHOOK_SECRET');
    if (!constantTimeEqual(request.headers.get('x-note-push-secret') || '', webhookSecret)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const payload = await request.json() as DatabaseWebhook;
    if (
      payload.type !== 'INSERT'
      || payload.schema !== 'public'
      || payload.table !== 'property_notes'
      || !payload.record?.id
      || !payload.record.property_id
      || !payload.record.author_user_id
    ) {
      return json({ error: 'Invalid property-note insert payload' }, 400);
    }

    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,workspace_members!inner(active)')
      .eq('workspace_members.active', true)
      .neq('user_id', payload.record.author_user_id);
    if (subscriptionError) throw subscriptionError;

    const { data: property } = await supabase
      .from('properties')
      .select('data')
      .eq('id', payload.record.property_id)
      .maybeSingle();
    const propertyTitle = String(property?.data?.title || 'a shared property').slice(0, 120);
    const authorName = String(payload.record.author_name || 'A team member').slice(0, 120);

    webpush.setVapidDetails(
      requiredEnv('VAPID_SUBJECT'),
      requiredEnv('VAPID_PUBLIC_KEY'),
      requiredEnv('VAPID_PRIVATE_KEY')
    );

    const message = JSON.stringify({
      title: 'New property note',
      body: `${authorName} added a note to ${propertyTitle}.`,
      tag: `property-note-${payload.record.property_id}`,
      url: `./?property=${encodeURIComponent(payload.record.property_id)}`
    });
    const staleIds: string[] = [];
    const deliveries = await Promise.allSettled(
      ((subscriptions || []) as PushRow[]).map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, message, { TTL: 3600, urgency: 'normal' });
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
          if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id);
          else throw error;
        }
      })
    );

    if (staleIds.length) {
      const { error: cleanupError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', staleIds);
      if (cleanupError) console.error('Could not remove stale push subscriptions:', cleanupError);
    }

    const failed = deliveries.filter((result) => result.status === 'rejected').length;
    if (failed) console.error(`Failed to deliver ${failed} note notification(s).`);
    return json({
      attempted: deliveries.length,
      delivered: deliveries.length - failed,
      failed,
      removed_stale: staleIds.length
    });
  } catch (error) {
    console.error('Note push function failed:', error);
    return json({ error: 'Push delivery failed' }, 500);
  }
});
