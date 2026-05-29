const { setCors } = require('./_supabase');

function normalize(raw) {
  let value = String(raw || '').trim().replace(/^SUPABASE_URL\s*=\s*/i, '').trim();
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname}`;
  } catch (_) {
    return value.replace(/\/+$/, '');
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const rawUrl = process.env.SUPABASE_URL || '';
  const normalizedUrl = normalize(rawUrl);
  return res.status(200).json({
    ok: true,
    hasSupabaseUrl: !!rawUrl,
    normalizedSupabaseUrl: normalizedUrl || null,
    supabaseUrlLooksCorrect: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedUrl),
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
  });
};
