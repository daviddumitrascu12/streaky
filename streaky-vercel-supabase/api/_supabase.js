const { createClient } = require('@supabase/supabase-js');

function normalizeSupabaseUrl(raw) {
  let value = String(raw || '').trim();

  // Common copy mistake: users paste "SUPABASE_URL=https://..." as the value.
  value = value.replace(/^SUPABASE_URL\s*=\s*/i, '').trim();

  if (!value) return '';

  // Supabase client needs the project base URL only:
  // https://PROJECT-REF.supabase.co
  try {
    const url = new URL(value);
    const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    if (!match) return value.replace(/\/+$/, '');
    return `${url.protocol}//${url.hostname}`;
  } catch (_) {
    return value.replace(/\/+$/, '');
  }
}

function normalizeServiceKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*/i, '')
    .trim();
}

function getSupabase() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = normalizeServiceKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in Vercel Environment Variables.');
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(`SUPABASE_URL ist falsch. Nutze nur die Project URL im Format https://PROJECT-REF.supabase.co, aktuell: ${url}`);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function cleanName(value) {
  return String(value || '').trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

module.exports = { getSupabase, setCors, cleanName, toInt };
