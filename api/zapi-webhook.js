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

  return res.status(200).json(data);
}
