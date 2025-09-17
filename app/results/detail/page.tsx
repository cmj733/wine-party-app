'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/** Matches Items page so headers render consistently */
type ItemRow = {
  item_id: number;
  event_id: number;
  kind: 'wine' | 'cheese';
  number: number;
  brought_by_id: number | null;
  // wine_details
  wine_name: string | null;
  wine_vintage: string | null; // TEXT now
  wine_grapes: string | null;
  wine_country: string | null;
  wine_abv: number | null;
  vivino_avg: number | null;
  vivino_url: string | null;
  // cheese_details
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null;
  cheese_style: string | null;
};

type RatingRow = {
  event_id: number;
  kind: 'wine' | 'cheese';
  item_id: number;
  number: number;
  item_name: string | null;
  guest_name: string | null;
  score: number | null;
  short_prompt: string | null;
  prompt_answer: string | null;
  additional_comment: string | null;
  created_at: string; // timestamptz ISO
};

type StatRow = {
  event_id: number;
  kind: 'wine' | 'cheese';
  item_id: number;
  number: number;
  name: string | null;
  avg_score: number | null;
  stddev_score: number | null;
  score_count: number | null;
  vivino_avg: number | null;
  diff_vivino: number | null; // |avg - vivino|
};

export default function ResultsDetailPage() {
  const router = useRouter();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);

  const [revealed, setRevealed] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({}); // item_id -> expanded

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));
    if (!g || !e) { router.push('/join'); return; }

    (async () => {
      try {
        setLoading(true);

        const { data: flags } = await supabase.rpc('get_event_flags_for_guest', { p_guest_id: g });
        const f = flags?.[0];
        if (!f?.revealed) {
          setRevealed(false);
          setErr('Results are not revealed yet.');
          return;
        }
        setRevealed(true);

        const { data: itemsData, error: itemsErr } = await supabase.rpc('get_items_for_guest', { p_guest_id: g });
        if (itemsErr) throw itemsErr;
        setItems((itemsData ?? []) as ItemRow[]);

        const { data: rateData, error: rateErr } = await supabase.rpc('get_event_ratings_detailed', { p_guest_id: g });
        if (rateErr) throw rateErr;
        setRatings((rateData ?? []) as RatingRow[]);

        const { data: statsData, error: statsErr } = await supabase.rpc('get_event_results_for_guest', { p_guest_id: g });
        if (statsErr) throw statsErr;
        setStats((statsData ?? []) as StatRow[]);
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load results');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Build maps for quick lookup
  const statsByItem = useMemo(() => {
    const m = new Map<number, StatRow>();
    for (const s of stats) m.set(s.item_id, s);
    return m;
  }, [stats]);

  const ratingsByItem = useMemo(() => {
    const m = new Map<number, RatingRow[]>();
    for (const r of ratings) {
      if (!m.has(r.item_id)) m.set(r.item_id, []);
      m.get(r.item_id)!.push(r);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return m;
  }, [ratings]);

  const wines = useMemo(() => items.filter(i => i.kind === 'wine').sort((a, b) => a.number - b.number), [items]);
  const cheeses = useMemo(() => items.filter(i => i.kind === 'cheese').sort((a, b) => a.number - b.number), [items]);

  // ---------- Determine winners for icons (same logic as /results; vote tie-breaker) ----------
  type RankGroup = { rank: number; rows: StatRow[] };

  function groupByRank(sorted: StatRow[], metricPicker: (r: StatRow) => number, topRanks: number): RankGroup[] {
    const groups: RankGroup[] = [];
    let currentRank = 0;
    let lastScore: number | null = null;
    let lastVotes: number | null = null;

    for (const row of sorted) {
      const score = metricPicker(row);
      const votes = row.score_count ?? 0;
      if (lastScore === null || score !== lastScore || votes !== lastVotes) {
        currentRank = groups.length + 1;
        if (currentRank > topRanks) break;
        groups.push({ rank: currentRank, rows: [row] });
      } else {
        groups[groups.length - 1].rows.push(row);
      }
      lastScore = score;
      lastVotes = votes;
    }
    return groups;
  }

  const wineStats = useMemo(() => stats.filter(s => s.kind === 'wine'), [stats]);
  const cheeseStats = useMemo(() => stats.filter(s => s.kind === 'cheese'), [stats]);

  function top3Groups(list: StatRow[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.avg_score != null && (r.score_count ?? 0) > 0)
      .sort((a, b) =>
        (b.avg_score! - a.avg_score!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.avg_score!, 3);
  }

  function minDiffGroups(list: StatRow[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.diff_vivino != null && r.avg_score != null)
      .sort((a, b) =>
        (a.diff_vivino! - b.diff_vivino!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.diff_vivino!, 1);
  }

  function maxDiffGroups(list: StatRow[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.diff_vivino != null && r.avg_score != null)
      .sort((a, b) =>
        (b.diff_vivino! - a.diff_vivino!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.diff_vivino!, 1);
  }

  function mostDivisiveGroups(list: StatRow[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => (r.stddev_score ?? 0) > 0 && (r.score_count ?? 0) >= 2)
      .sort((a, b) =>
        (b.stddev_score! - a.stddev_score!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.stddev_score!, 1);
  }

  const wineTop3 = useMemo(() => top3Groups(wineStats), [wineStats]);
  const cheeseTop3 = useMemo(() => top3Groups(cheeseStats), [cheeseStats]);
  const wineAligned = useMemo(() => minDiffGroups(wineStats), [wineStats]);        // 🎯 Most aligned
  const wineLeastAlign = useMemo(() => maxDiffGroups(wineStats), [wineStats]);     // 🔀 Least aligned
  const wineDivisive = useMemo(() => mostDivisiveGroups(wineStats), [wineStats]);  // ⚡️ Most divisive
  const cheeseDivisive = useMemo(() => mostDivisiveGroups(cheeseStats), [cheeseStats]);

  // Quick lookup sets for icons
  const medalByItemId = useMemo(() => {
    const map = new Map<number, 1|2|3>();
    for (const g of wineTop3.concat(cheeseTop3)) {
      for (const r of g.rows) if (!map.has(r.item_id)) map.set(r.item_id, g.rank as 1|2|3);
    }
    return map;
  }, [wineTop3, cheeseTop3]);
  const alignedSet      = useMemo(() => new Set((wineAligned[0]?.rows ?? []).map(r => r.item_id)), [wineAligned]);
  const leastAlignedSet = useMemo(() => new Set((wineLeastAlign[0]?.rows ?? []).map(r => r.item_id)), [wineLeastAlign]);
  const wineDivSet      = useMemo(() => new Set((wineDivisive[0]?.rows ?? []).map(r => r.item_id)), [wineDivisive]);
  const cheeseDivSet    = useMemo(() => new Set((cheeseDivisive[0]?.rows ?? []).map(r => r.item_id)), [cheeseDivisive]);

  // ---------- Styles ----------
  const h1 = { fontSize: 26, fontWeight: 800, marginBottom: 20 } as const;
  const h2 = { fontSize: 20, fontWeight: 700, marginBottom: 8 } as const;
  const small = { fontSize: 13, color: '#666' } as const;

  const boxBase = { borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #eee' } as const;
  const boxWineRed = { ...boxBase, borderLeft: '6px solid #b91c1c', boxShadow: '0 1px 0 rgba(185,28,28,0.15)' } as const;
  const boxCheese  = { ...boxBase, borderLeft: '6px solid #e6b800', boxShadow: '0 1px 0 rgba(230,184,0,0.15)' } as const;

  const toggleBtn = {
    background: 'none', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 8, cursor: 'pointer'
  } as const;

  const topControlsWrap = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 12
  } as const;

  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 10 } as const;
  const thtd = { border: '1px solid #eee', padding: '8px 10px', verticalAlign: 'top' } as const;
  const th = { ...thtd, background: '#fafafa', fontWeight: 700 } as const;

  const statsLineStyle = { fontSize: 13, color: '#555' } as const; // medium grey

  function iconsFor(itemId: number, kind: 'wine' | 'cheese') {
    const medal = medalByItemId.get(itemId);
    const parts: string[] = [];
    if (medal === 1) parts.push('🥇');
    if (medal === 2) parts.push('🥈');
    if (medal === 3) parts.push('🥉');
    if (kind === 'wine') {
      if (alignedSet.has(itemId)) parts.push('🎯');
      if (leastAlignedSet.has(itemId)) parts.push('🔀');
      if (wineDivSet.has(itemId)) parts.push('⚡️');
    } else {
      if (cheeseDivSet.has(itemId)) parts.push('⚡️');
    }
    return parts.join(' ');
  }

  function itemHeader(it: ItemRow) {
    if (it.kind === 'wine') {
      return (
        <>
          <strong>Wine #{it.number}</strong>
          {it.wine_name ? ` — ${it.wine_name}${it.wine_vintage ? ` (${it.wine_vintage})` : ''}` : ''}
          {it.wine_country ? ` • ${it.wine_country}` : ''}
          {it.wine_abv != null ? ` • ${it.wine_abv}% ABV` : ''}
        </>
      );
    } else {
      return (
        <>
          <strong>Cheese #{it.number}</strong>
          {it.cheese_name ? ` — ${it.cheese_name}` : ''}
          {it.cheese_country ? ` • ${it.cheese_country}` : ''}
          {it.cheese_milk ? ` • ${it.cheese_milk}` : ''}
          {it.cheese_style ? ` • ${it.cheese_style}` : ''}
        </>
      );
    }
  }

  function itemStats(it: ItemRow) {
    const s = statsByItem.get(it.item_id);
    if (!s) return null;
    const avg = s.avg_score != null ? s.avg_score.toFixed(2) : '—';
    const sd  = s.stddev_score != null ? s.stddev_score.toFixed(2) : '—';
    const cnt = s.score_count ?? 0;
    if (it.kind === 'wine') {
      const viv = s.vivino_avg != null ? s.vivino_avg.toFixed(2) : '—';
      const dif = s.diff_vivino != null ? s.diff_vivino.toFixed(2) : '—';
      return (
        <div style={statsLineStyle}>
          Avg: {avg} • SD: {sd} • Votes: {cnt} • Vivino: {viv} • Δ: {dif}
          {it.vivino_url ? <> • <a href={it.vivino_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Vivino link</a></> : null}
        </div>
      );
    }
    return (
      <div style={statsLineStyle}>
        Avg: {avg} • SD: {sd} • Votes: {cnt}
      </div>
    );
  }

  function section(kind: 'wine' | 'cheese', list: ItemRow[], boxStyle: React.CSSProperties) {
    return (
      <section style={boxStyle}>
        <h2 style={h2}>{kind === 'wine' ? 'Wines' : 'Cheeses'}</h2>
        {list.length === 0 ? (
          <p>No items.</p>
        ) : (
          <ul>
            {list.map(it => {
              const rows = ratingsByItem.get(it.item_id) ?? [];
              const isOpen = !!open[it.item_id];

              return (
                <li key={it.item_id} style={{ marginBottom: 16 }}>
                  {/* Two-column layout: fixed icon column + fluid content column */}
                  <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr', alignItems: 'start', gap: 8 }}>
                    {/* Icon column (fixed width). 
                        Tweak with lineHeight + translateY to visually align with the title text. */}
                    <div style={{ width: 54, textAlign: 'center', lineHeight: '24px', transform: 'translateY(7.5px)' }}>
                      {iconsFor(it.item_id, it.kind)}
                    </div>

                    {/* Content column */}
                    <div>
                      {/* Title row + controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div>{itemHeader(it)}</div>
                        <button
                          style={toggleBtn}
                          onClick={() => setOpen(prev => ({ ...prev, [it.item_id]: !isOpen }))}
                          disabled={rows.length === 0}
                          title={rows.length === 0 ? 'No ratings yet' : isOpen ? 'Hide ratings' : 'View all ratings'}
                        >
                          {rows.length === 0 ? 'No ratings' : (isOpen ? 'Hide ratings' : 'View all ratings')}
                        </button>
                        {/* removed duplicate "(n ratings)" count */}
                      </div>

                      {/* Stats line (aligned with title) */}
                      <div style={{ marginTop: 4 }}>
                        {itemStats(it)}
                      </div>

                      {/* Ratings table */}
                      {isOpen && rows.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <table style={tableStyle}>
                            <thead>
                              <tr>
                                <th style={th}>Guest</th>
                                <th style={th}>Score</th>
                                <th style={th}>Short&nbsp;prompt</th>
                                <th style={th}>Prompt answer</th>
                                <th style={th}>Additional comments</th>
                                <th style={th}>Timestamp</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, idx) => (
                                <tr key={idx}>
                                  <td style={thtd}>{r.guest_name ?? '—'}</td>
                                  <td style={thtd}>{r.score != null ? r.score.toFixed(1) : '—'}</td>
                                  <td style={thtd}>{r.short_prompt ?? '—'}</td>
                                  <td style={thtd}>{r.prompt_answer || '—'}</td>
                                  <td style={thtd}>{r.additional_comment || '—'}</td>
                                  <td style={thtd}>{new Date(r.created_at).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  // ---------- Expand / Collapse all ----------
  const allItemIdsWithRatings = useMemo(() => {
    const ids: number[] = [];
    for (const it of items) {
      if ((ratingsByItem.get(it.item_id)?.length ?? 0) > 0) ids.push(it.item_id);
    }
    return ids;
  }, [items, ratingsByItem]);

  function expandAll() {
    const next: Record<number, boolean> = {};
    for (const id of allItemIdsWithRatings) next[id] = true;
    setOpen(next);
  }
  function collapseAll() {
    setOpen({});
  }

  return (
    <main style={{ maxWidth: 940, margin: '32px auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={h1}>Results — All Ratings</h1>
        <div style={topControlsWrap}>
          <button style={toggleBtn} onClick={expandAll}>View All</button>
          <button style={toggleBtn} onClick={collapseAll}>Hide All</button>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {err && !loading && <p style={{ color: 'crimson' }}>{err}</p>}

      {!loading && revealed && !err && (
        <>
          {section('wine', wines, boxWineRed)}
          {section('cheese', cheeses, boxCheese)}

          <p style={{ marginTop: 12 }}>
            <a href="/results" style={{ textDecoration: 'underline' }}>← Back to Results Summary</a>
          </p>
        </>
      )}
    </main>
  );
}


