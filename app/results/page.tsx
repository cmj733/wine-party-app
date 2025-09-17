'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Row = {
  event_id: number;
  kind: 'wine' | 'cheese';
  item_id: number;
  number: number;
  name: string | null;
  avg_score: number | null;
  stddev_score: number | null;
  score_count: number | null;
  vivino_avg: number | null;
  diff_vivino: number | null; // |avg - vivino| (wines only)
};

type ItemsLookup = {
  item_id: number;
  kind: 'wine' | 'cheese';
  number: number;
  // wine
  wine_name: string | null;
  wine_vintage: string | null; // TEXT
  wine_country: string | null;
  wine_abv: number | null;
  vivino_url: string | null;
  // cheese
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null;
  cheese_style: string | null;
};

export default function ResultsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ItemsLookup[]>([]);

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
          setLoading(false);
          return;
        }
        setRevealed(true);

        const { data, error } = await supabase.rpc('get_event_results_for_guest', { p_guest_id: g });
        if (error) throw error;
        setRows((data ?? []) as Row[]);

        const { data: itemsData, error: itemsErr } = await supabase.rpc('get_items_for_guest', { p_guest_id: g });
        if (itemsErr) throw itemsErr;
        const map = (itemsData ?? []).map((it: any) => ({
          item_id: it.item_id,
          kind: it.kind,
          number: it.number,
          wine_name: it.wine_name,
          wine_vintage: it.wine_vintage,
          wine_country: it.wine_country,
          wine_abv: it.wine_abv,
          vivino_url: it.vivino_url,
          cheese_name: it.cheese_name,
          cheese_country: it.cheese_country,
          cheese_milk: it.cheese_milk,
          cheese_style: it.cheese_style,
        })) as ItemsLookup[];
        setItems(map);
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load results');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const byId = useMemo(() => {
    const m = new Map<number, ItemsLookup>();
    for (const it of items) m.set(it.item_id, it);
    return m;
  }, [items]);

  const wines   = useMemo(() => rows.filter(r => r.kind === 'wine'), [rows]);
  const cheeses = useMemo(() => rows.filter(r => r.kind === 'cheese'), [rows]);

  // ---------- Ranking helpers (vote-count tie-breakers, support ties) ----------
  type RankGroup = { rank: number; rows: Row[] };

  function groupByRank(sorted: Row[], metricPicker: (r: Row) => number, topRanks: number): RankGroup[] {
    const groups: RankGroup[] = [];
    let lastScore: number | null = null;
    let lastVotes: number | null = null;

    for (const row of sorted) {
      const val = metricPicker(row);
      const votes = row.score_count ?? 0;
      if (lastScore === null || val !== lastScore || votes !== lastVotes) {
        if (groups.length >= topRanks && topRanks > 0) break;
        groups.push({ rank: groups.length + 1, rows: [row] });
      } else {
        groups[groups.length - 1].rows.push(row);
      }
      lastScore = val;
      lastVotes = votes;
    }
    return groups;
  }

  // Top 3 by avg_score desc, tie-breaker votes desc
  function top3Groups(list: Row[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.avg_score != null && (r.score_count ?? 0) > 0)
      .sort((a, b) =>
        (b.avg_score! - a.avg_score!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.avg_score!, 3);
  }

  // Most aligned (min diff_vivino), least aligned (max diff_vivino) – wines only
  function minDiffGroups(list: Row[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.diff_vivino != null && r.avg_score != null)
      .sort((a, b) =>
        (a.diff_vivino! - b.diff_vivino!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.diff_vivino!, 1);
  }
  function maxDiffGroups(list: Row[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => r.diff_vivino != null && r.avg_score != null)
      .sort((a, b) =>
        (b.diff_vivino! - a.diff_vivino!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.diff_vivino!, 1);
  }

  // Most divisive: max stddev_score, tie-breaker votes desc; require ≥2 votes
  function mostDivisiveGroups(list: Row[]): RankGroup[] {
    const sorted = [...list]
      .filter(r => (r.stddev_score ?? 0) > 0 && (r.score_count ?? 0) >= 2)
      .sort((a, b) =>
        (b.stddev_score! - a.stddev_score!) ||
        ((b.score_count ?? 0) - (a.score_count ?? 0))
      );
    return groupByRank(sorted, r => r.stddev_score!, 1);
  }

  const winesTop3      = useMemo(() => top3Groups(wines), [wines]);
  const cheesesTop3    = useMemo(() => top3Groups(cheeses), [cheeses]);
  const wineAligned    = useMemo(() => minDiffGroups(wines), [wines]);      // 🎯
  const wineLeastAlign = useMemo(() => maxDiffGroups(wines), [wines]);      // 🔀
  const wineDivisive   = useMemo(() => mostDivisiveGroups(wines), [wines]); // ⚡️
  const cheeseDivisive = useMemo(() => mostDivisiveGroups(cheeses), [cheeses]);

  // ---------- UI helpers & styles ----------
  const h1    = { fontSize: 28, fontWeight: 800, marginBottom: 24 } as const;
  const h2    = { fontSize: 22, fontWeight: 700, marginBottom: 12 } as const;
  const small = { fontSize: 13, color: '#666' } as const;

  const boxBase    = { borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #eee' } as const;
  const boxWineRed = { ...boxBase, borderLeft: '6px solid #b91c1c', boxShadow: '0 1px 0 rgba(185,28,28,0.15)' } as const;
  const boxCheese  = { ...boxBase, borderLeft: '6px solid #e6b800', boxShadow: '0 1px 0 rgba(230,184,0,0.15)' } as const;

  const statsLineStyle = { fontSize: 13, color: '#555' } as const; // medium grey
  const spacer = { height: 28 } as const; // “couple rows” spacer between blocks

  // Icon-only left column + content right column.
  // Small label line sits above the item header; icon aligns with that small label.
  function rowLayout(icon: string, label: string, header: JSX.Element, statsEl: JSX.Element | null) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'start', gap: 8 }}>
        <div style={{ width: 60, textAlign: 'center', lineHeight: '24px', transform: 'translateY(2px)' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 2 }}>{label}</div>
          <div>{header}</div>
          {statsEl ? <div style={{ marginTop: 4 }}>{statsEl}</div> : null}
        </div>
      </div>
    );
  }

  function itemHeader(it: ItemsLookup | undefined, base: Row) {
    if (!it) return <strong>{base.kind === 'wine' ? `Wine #${base.number}` : `Cheese #${base.number}`}</strong>;
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

  function itemStats(it: ItemsLookup | undefined, s: Row | undefined) {
    if (!s) return null;
    const avg = s.avg_score != null ? s.avg_score.toFixed(2) : '—';
    const sd  = s.stddev_score != null ? s.stddev_score.toFixed(2) : '—';
    const cnt = s.score_count ?? 0;
    if (s.kind === 'wine') {
      const viv = s.vivino_avg != null ? s.vivino_avg.toFixed(2) : '—';
      const dif = s.diff_vivino != null ? s.diff_vivino.toFixed(2) : '—';
      const link = it?.vivino_url ? (
        <> • <a href={it.vivino_url!} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Vivino link</a></>
      ) : null;
      return <div style={statsLineStyle}>Avg: {avg} • SD: {sd} • Votes: {cnt} • Vivino: {viv} • Δ: {dif}{link}</div>;
    }
    return <div style={statsLineStyle}>Avg: {avg} • SD: {sd} • Votes: {cnt}</div>;
  }

  // Render helpers
  function renderTop3(kind: 'wine' | 'cheese', groups: RankGroup[]) {
    const labels = ['First place', 'Second place', 'Third place'];
    const icons  = ['🥇', '🥈', '🥉'];
    if (!groups.length) return <p style={small}>No data.</p>;

    return (
      <ul>
        {groups.map(g =>
          g.rows.map((row, i) => {
            const it = byId.get(row.item_id);
            const label = `${labels[g.rank - 1]}${g.rows.length > 1 ? ' (tie)' : ''}`;
            return (
              <li key={`${kind}-top-${g.rank}-${row.item_id}-${i}`} style={{ marginBottom: 10 }}>
                {rowLayout(icons[g.rank - 1], label, itemHeader(it, row), itemStats(it, row))}
              </li>
            );
          })
        )}
      </ul>
    );
  }

  function renderDivisive(kind: 'wine' | 'cheese', groups: RankGroup[]) {
    if (!groups.length) return <p style={small}>No data.</p>;
    return (
      <ul>
        {groups.map(g =>
          g.rows.map((row, i) => {
            const it = byId.get(row.item_id);
            const label = `Most Divisive${g.rows.length > 1 ? ' (tie)' : ''}`;
            return (
              <li key={`${kind}-div-${row.item_id}-${i}`} style={{ marginBottom: 10 }}>
                {rowLayout('⚡️', label, itemHeader(it, row), itemStats(it, row))}
              </li>
            );
          })
        )}
      </ul>
    );
  }

  function renderAligned(groups: RankGroup[], label: 'Most Aligned with Vivino' | 'Least Aligned with Vivino', icon: string) {
    if (!groups.length) return <p style={small}>No data.</p>;
    return (
      <ul>
        {groups.map(g =>
          g.rows.map((row, i) => {
            const it = byId.get(row.item_id);
            const lbl = `${label}${g.rows.length > 1 ? ' (tie)' : ''}`;
            return (
              <li key={`${label}-${row.item_id}-${i}`} style={{ marginBottom: 10 }}>
                {rowLayout(icon, lbl, itemHeader(it, row), itemStats(it, row))}
              </li>
            );
          })
        )}
      </ul>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: '32px auto', padding: 16 }}>
      <h1 style={h1}>Results</h1>

      {loading && <p>Loading…</p>}
      {err && !loading && <p style={{ color: 'crimson' }}>{err}</p>}

      {!loading && revealed && !err && (
        <>
          {/* WINES */}
          <section style={{ ...boxWineRed }}>
            <h2 style={h2}>Wines</h2>

            {renderTop3('wine', winesTop3)}

            <div style={spacer} />

            {renderDivisive('wine', wineDivisive)}

            <div style={spacer} />

            {renderAligned(wineAligned, 'Most Aligned with Vivino', '🎯')}

            <div style={{ height: 12 }} />

            {renderAligned(wineLeastAlign, 'Least Aligned with Vivino', '🔀')}
          </section>

          {/* CHEESES */}
          <section style={{ ...boxCheese }}>
            <h2 style={h2}>Cheeses</h2>

            {renderTop3('cheese', cheesesTop3)}

            <div style={spacer} />

            {renderDivisive('cheese', cheeseDivisive)}
          </section>

          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            <a href="/items" style={{ textDecoration: 'underline' }}>← Back to Items</a>
            <a href="/results/detail" style={{ textDecoration: 'underline' }}>View All Ratings (detail) →</a>
          </div>
        </>
      )}
    </main>
  );
}
