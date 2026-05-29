const { getSupabase, setCors } = require('./_supabase');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('streaky_leaderboard')
      .select('name, streak, best_streak, total_correct, total_wrong, updated_at')
      .order('streak', { ascending: false })
      .order('best_streak', { ascending: false })
      .order('total_correct', { ascending: false })
      .limit(100);

    if (error) throw error;

    const players = (data || []).map((p) => ({
      username: p.name,
      streak: p.streak || 0,
      best: p.best_streak || 0,
      totalCorrect: p.total_correct || 0,
      totalWrong: p.total_wrong || 0,
      lastEventText: '',
      updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now()
    }));

    return res.status(200).json({ ok: true, updatedAt: Date.now(), players });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error), players: [] });
  }
};
