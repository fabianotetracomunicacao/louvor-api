import { createClient } from '@supabase/supabase-js';

function getIncomingMessage(payload) {
  return String(
    payload?.text?.message ||
      payload?.buttonReply?.message ||
      payload?.buttonReply?.text ||
      payload?.buttonsResponseMessage?.message ||
      payload?.listResponseMessage?.title ||
      payload?.listResponseMessage?.message ||
      '',
  ).trim();
}

function getButtonId(payload) {
  return String(
    payload?.buttonReply?.id ||
      payload?.buttonReply?.buttonId ||
      payload?.buttonsResponseMessage?.buttonId ||
      payload?.buttonsResponseMessage?.selectedButtonId ||
      payload?.selectedButtonId ||
      '',
  ).trim();
}

function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (!digits.startsWith('55')) digits = `55${digits}`;
  if (digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    digits = `55${ddd}9${rest}`;
  }
  return digits;
}

async function getZApiConfig(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['zapi_instance_id', 'zapi_instance_token', 'zapi_client_token']);

  if (error) throw error;

  const config = {};
  for (const row of data || []) {
    config[row.key] = row.value || '';
  }

  return {
    instanceId: config.zapi_instance_id || '',
    instanceToken: config.zapi_instance_token || '',
    clientToken: config.zapi_client_token || '',
  };
}

async function sendTextMessage(supabase, targetPhone, message) {
  const config = await getZApiConfig(supabase);
  const phone = normalizePhone(targetPhone);

  if (!config.instanceId || !config.instanceToken || !phone || !message) {
    return { skipped: true };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (config.clientToken) {
    headers['Client-Token'] = config.clientToken;
  }

  const response = await fetch(
    `https://api.z-api.io/instances/${config.instanceId}/token/${config.instanceToken}/send-text`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone,
        message,
        delayMessage: 1,
        delayTyping: 1,
      }),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, status: response.status, error: body };
  }

  return { success: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};

  if (payload.fromMe === true || payload.isGroup === true || payload.isNewsletter === true) {
    return res.status(200).json({ ignored: true, reason: 'not_direct_incoming_message' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase environment is not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('process_zapi_scale_response', {
    p_phone: payload.phone || '',
    p_message: getIncomingMessage(payload),
    p_button_id: getButtonId(payload),
    p_secret: req.query?.secret || req.headers['x-zapi-webhook-secret'] || '',
  });

  if (error) {
    console.error('[zapi-webhook] RPC error:', error);
    return res.status(500).json({ error: 'webhook_processing_failed' });
  }

  if (data?.success) {
    const responsePayload = { ...data };

    if (data?.leaderPhone && data?.leaderMessage) {
      try {
        responsePayload.leaderNotification = await sendTextMessage(supabase, data.leaderPhone, data.leaderMessage);
      } catch (notificationError) {
        console.error('[zapi-webhook] Leader notification error:', notificationError);
        responsePayload.leaderNotification = { success: false, error: 'leader_notification_failed' };
      }
    }

    if (data?.musicianPhone && data?.musicianMessage) {
      try {
        responsePayload.musicianNotification = await sendTextMessage(supabase, data.musicianPhone, data.musicianMessage);
      } catch (notificationError) {
        console.error('[zapi-webhook] Musician notification error:', notificationError);
        responsePayload.musicianNotification = { success: false, error: 'musician_notification_failed' };
      }
    }

    return res.status(200).json(responsePayload);
  }

  return res.status(200).json(data);
}
