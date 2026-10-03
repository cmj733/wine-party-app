'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EventNav from '../components/EventNav';

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
  brought_by_id: number | null;
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

type Guest = {
  id: number;
  name: string;
};

export default function ResultsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [eventName, setEventName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ItemsLookup[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));
    if (!g || !e) { router.push('/join'); return; }

    (async () => {
      try {
        setLoading(true);
const { data: flags, error: flagsErr } = await supabase.rpc(
  'get_event_flags_for_guest',
  { p_guest_id: g }
);
if (flagsErr) throw flagsErr;

const f = flags?.[0];
setRevealed(!!f?.revealed);
setEventName(f?.event_name ?? null);

const { data: me, error: meErr } = await supabase
  .from('guests')
  .select('is_admin')
  .eq('id', g)
  .maybeSingle();

if (meErr) throw meErr;

const admin = !!me?.is_admin;
setIsAdmin(admin);

if (!f?.revealed && !admin) {
  setErr('Results are not revealed yet.');
  setLoading(false);
  return;
}

        const { data, error } = await supabase.rpc('get_event_results_for_guest', { p_guest_id: g });
        if (error) throw error;
        setRows((data ?? []) as Row[]);

        const { data: itemsData, error: itemsErr } = await supabase.rpc('get_items_for_guest', { p_guest_id: g });
        if (itemsErr) throw itemsErr;
        const map = (itemsData ?? []).map((it: any) => ({
          item_id: it.item_id,
          kind: it.kind,
          number: it.number,
          brought_by_id: it.brought_by_id,
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
const { data: guestData, error: guestErr } = await supabase
  .from('guests')
  .select('id, name')
  .eq('event_id', e);

if (guestErr) throw guestErr;

setGuests((guestData ?? []) as Guest[]);
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
  const guestNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of guests) m.set(g.id, g.name);
    return m;
  }, [guests]);

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
function lowestRatedGroups(list: Row[]): RankGroup[] {
  const rated = list.filter(
    r => r.avg_score != null && (r.score_count ?? 0) > 0
  );

  if (!rated.length) return [];

  const lowestAvg = Math.min(...rated.map(r => r.avg_score!));

  return [{
    rank: 1,
    rows: rated.filter(r => r.avg_score === lowestAvg),
  }];
}

  const winesTop3      = useMemo(() => top3Groups(wines), [wines]);
  const cheesesTop3    = useMemo(() => top3Groups(cheeses), [cheeses]);
  const wineAligned    = useMemo(() => minDiffGroups(wines), [wines]);      // 🎯
  const wineLeastAlign = useMemo(() => maxDiffGroups(wines), [wines]);      // 🔀
  const wineDivisive   = useMemo(() => mostDivisiveGroups(wines), [wines]); // ⚡️
  const cheeseDivisive = useMemo(() => mostDivisiveGroups(cheeses), [cheeses]);
  const wineToughCrowd = useMemo(() => lowestRatedGroups(wines), [wines]);
  const cheeseToughCrowd = useMemo(() => lowestRatedGroups(cheeses), [cheeses]);

  // ---------- UI helpers & styles ----------
  const small = { fontSize: 13, color: '#666' } as const;

  const boxBase    = { borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #eee' } as const;
  const boxWineRed = { ...boxBase, borderLeft: '6px solid #b91c1c', boxShadow: '0 1px 0 rgba(185,28,28,0.15)' } as const;
  const boxCheese  = { ...boxBase, borderLeft: '6px solid #e6b800', boxShadow: '0 1px 0 rgba(230,184,0,0.15)' } as const;

  const statsLineStyle = { fontSize: 13, color: '#555' } as const; // medium grey
  const spacer = { height: 28 } as const; // “couple rows” spacer between blocks

  // Icon-only left column + content right column.
  // Small label line sits above the item header; icon aligns with that small label.
  function rowLayout(icon: string, label: string, header: React.ReactNode, statsEl: React.ReactNode) {
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
      return (
  <>
    <div style={statsLineStyle}>
      Avg: {avg} • SD: {sd} • Votes: {cnt} • Vivino: {viv} • Δ: {dif}{link}
    </div>

    {it?.brought_by_id && (
      <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
        Brought by: {guestNameById.get(it.brought_by_id) ?? 'Unknown'}
      </div>
    )}
  </>
);
    }
    return (
  <>
    <div style={statsLineStyle}>
      Avg: {avg} • SD: {sd} • Votes: {cnt}
    </div>

    {it?.brought_by_id && (
      <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
        Brought by: {guestNameById.get(it.brought_by_id) ?? 'Unknown'}
      </div>
    )}
  </>
);
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

function renderToughCrowd(kind: 'wine' | 'cheese', groups: RankGroup[]) {
  if (!groups.length) return <p style={small}>No data.</p>;

  return (
    <ul>
      {groups.map(g =>
        g.rows.map((row, i) => {
          const it = byId.get(row.item_id);
          const label = `Tough Crowd Award${g.rows.length > 1 ? ' (tie)' : ''}`;

          return (
            <li
              key={`${kind}-tough-${row.item_id}-${i}`}
              style={{ marginBottom: 10 }}
            >
              {rowLayout(
                '👎',
                label,
                itemHeader(it, row),
                itemStats(it, row)
              )}
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
<EventNav
  eventName={eventName}
  currentPage="results"
  revealed={revealed}
  isAdmin={isAdmin}
/>
      {!loading && isAdmin && !revealed && (
  <p
    style={{
      color: '#555',
      fontSize: 13,
      marginTop: -14,
      marginBottom: 20,
    }}
  >
    Admin preview — results are still hidden from guests.
  </p>
)}

      {loading && <p>Loading…</p>}
      {err && !loading && <p style={{ color: 'crimson' }}>{err}</p>}

      {!loading && (revealed || isAdmin) && !err && (
        <>
          {/* WINES */}
          <section style={{ ...boxWineRed }}>
            <h2
style={{
  fontFamily: "var(--font-limelight), serif",
  fontSize: 26,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}}
>
Wines
</h2>
            {renderTop3('wine', winesTop3)}

            <div style={spacer} />

            {renderDivisive('wine', wineDivisive)}

            <div style={spacer} />

            {renderAligned(wineAligned, 'Most Aligned with Vivino', '🎯')}

            <div style={{ height: 12 }} />

            {renderAligned(wineLeastAlign, 'Least Aligned with Vivino', '🔀')}

            <div style={spacer} />

            {renderToughCrowd('wine', wineToughCrowd)}

          </section>

          {/* CHEESES */}
          <section style={{ ...boxCheese }}>
            <h2 style={{
  fontFamily: "var(--font-limelight), serif",
  fontSize: 26,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}}
>
Cheeses
</h2>
            {renderTop3('cheese', cheesesTop3)}

            <div style={spacer} />

            {renderDivisive('cheese', cheeseDivisive)}

            <div style={spacer} />

            {renderToughCrowd('cheese', cheeseToughCrowd)}

          </section>
        </>
      )}
    </main>
  );
}
