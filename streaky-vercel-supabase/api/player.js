const { getSupabase, setCors, cleanName, toInt } = require('./_supabase');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const username = cleanName(req.body && req.body.username);
    if (!username) return res.status(400).json({ ok: false, error: 'username missing' });

    const streak = toInt(req.body.streak);
    const bestFromClient = Math.max(toInt(req.body.best), streak);
    const totalCorrect = toInt(req.body.totalCorrect);
    const totalWrong = toInt(req.body.totalWrong);

    const supabase = getSupabase();

    const { data: oldRow, error: readError } = await supabase
      .from('streaky_leaderboard')
      .select('best_streak')
      .eq('name', username)
      .maybeSingle();

    if (readError) throw readError;

    const bestStreak = Math.max(bestFromClient, oldRow ? toInt(oldRow.best_streak) : 0);

    const row = {
      name: username,
      streak,
      best_streak: bestStreak,
      total_correct: totalCorrect,
      total_wrong: totalWrong,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('streaky_leaderboard')
      .upsert(row, { onConflict: 'name' })
      .select('name, streak, best_streak, total_correct, total_wrong, updated_at')
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, player: data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
