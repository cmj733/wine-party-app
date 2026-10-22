'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EventNav from '../components/EventNav';

type ItemRow = {
  item_id: number;
  event_id: number;
  kind: 'wine' | 'cheese';
  number: number;
  brought_by_id: number | null;

  // wine_details
  wine_name: string | null;
  wine_vintage: string | null; // TEXT
  wine_grapes: string | null;
  wine_country: string | null;
  wine_abv: number | null;
  vivino_avg: number | null;
  vivino_url: string | null;
  wine_pairing_suggestions?: string | null;

  // cheese_details
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null;
  cheese_style: string | null;
  cheese_pairing_suggestions?: string | null;
};

type MyRating = {
  item_id: number;
  score: number | null;
  prompt_id: number | null;
  created_at: string;
};

type RatingProgress = {
  item_id: number;
  rating_count: number;
  guest_count: number;
};

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [myRatings, setMyRatings] = useState<MyRating[]>([]);
  const [ratingProgress, setRatingProgress] = useState<RatingProgress[]>([]);
  const [averageScores, setAverageScores] = useState<
    { item_id: number; avg_score: number | null }[]
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [guestId, setGuestId] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [eventName, setEventName] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);

  const ratedSet = useMemo(() => new Set(myRatings.map(r => r.item_id)), [myRatings]);
  const progressByItem = useMemo(
  () => new Map(ratingProgress.map(r => [r.item_id, r])),
  [ratingProgress]
);

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));
    if (!g || !e) {
      router.push('/join');
      return;
    }
    setGuestId(g);

    (async () => {
      try {
        setLoading(true);
const [
  { data: flags, error: flagsErr },
  { data: itemsData, error: itemsErr },
  { data: ratingsData, error: ratingsErr },
  { data: progressData, error: progressErr },
  { data: me, error: meErr },
] = await Promise.all([
  supabase.rpc('get_event_flags_for_guest', { p_guest_id: g }),
  supabase.rpc('get_items_for_guest', { p_guest_id: g }),
  supabase.rpc('get_my_ratings', { p_guest_id: g }),
  supabase.rpc('get_rating_progress_for_guest', { p_guest_id: g }),
  supabase
    .from('guests')
    .select('is_admin')
    .eq('id', g)
    .maybeSingle(),
]);
        if (flagsErr) throw flagsErr;
        if (itemsErr) throw itemsErr;
        if (ratingsErr) throw ratingsErr;
        if (progressErr) throw progressErr;
        if (meErr) throw meErr;

        const f = flags?.[0];
        setIsLocked(!!f?.locked);
        setIsRevealed(!!f?.revealed);
        setIsAdmin(!!me?.is_admin);
        setEventName(f?.event_name ?? null);

        setItems((itemsData ?? []) as ItemRow[]);
        setMyRatings(ratingsData ?? []);
        setRatingProgress((progressData ?? []) as RatingProgress[]);
if (f?.revealed) {
  const { data: resultsData, error: resultsErr } = await supabase.rpc(
    'get_event_results_for_guest',
    { p_guest_id: g }
  );

  if (resultsErr) throw resultsErr;

  setAverageScores(
    (resultsData ?? []).map((r: any) => ({
      item_id: r.item_id,
      avg_score: r.avg_score,
    }))
  );
}
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load items');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const wines = items.filter(i => i.kind === 'wine').sort((a, b) => a.number - b.number);
  const cheeses = items.filter(i => i.kind === 'cheese').sort((a, b) => a.number - b.number);

  async function handleDelete(itemId: number) {
  if (!guestId) return;

  if (!confirm('Delete this item? Its number may be reused by the next guest.')) return;

  try {
    setBusyId(itemId);

    const { error } = await supabase.rpc('delete_item_and_renumber', {
      p_item_id: itemId,
      p_guest_id: guestId,
    });

    if (error) throw error;

    const [{ data: itemsData }, { data: ratingsData }] = await Promise.all([
      supabase.rpc('get_items_for_guest', { p_guest_id: guestId }),
      supabase.rpc('get_my_ratings', { p_guest_id: guestId }),
    ]);

    setItems((itemsData ?? []) as ItemRow[]);
    setMyRatings(ratingsData ?? []);

  } catch (e: any) {
    alert(e.message ?? 'Delete failed');
  } finally {
    setBusyId(null);
  }
}

  function actionLabelFor(itemId: number) {
    const rated = ratedSet.has(itemId);
    if (isRevealed) return 'View Rating';
    return rated ? 'Change Rating' : 'Rate';
  }

  // ---------- Styles ----------

  const pageWrap   = { maxWidth: 920, margin: '32px auto', padding: 16 } as const;
  const smallGrey = {
    fontSize: 13,
    color: 'var(--foreground)',
    opacity: 0.75,
  } as const;

  const boxBase    = { borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #eee' } as const;
  const boxWineRed = { ...boxBase, borderLeft: '6px solid #b91c1c', boxShadow: '0 1px 0 rgba(185,28,28,0.15)' } as const;
  const boxCheese  = { ...boxBase, borderLeft: '6px solid #e6b800', boxShadow: '0 1px 0 rgba(230,184,0,0.15)' } as const;

const btnLink = {
  display: 'inline-block',
  padding: '8px 10px',
  border: '2px solid',
  borderRadius: 8,
  textDecoration: 'none',
  cursor: 'pointer',
  background: 'transparent',
  color: 'inherit',
} as const;

function ratingButtonStyle(kind: 'wine' | 'cheese', rated: boolean) {
  return {
    ...btnLink,
    borderColor: isRevealed || rated
      ? '#888888'
      : kind === 'wine'
  	? '#b91c1c'
  	: '#e6b800',
  };
}

return (
  <main style={pageWrap}>
<EventNav
  eventName={eventName}
  currentPage="items"
  revealed={isRevealed}
  isAdmin={isAdmin}
/>
    {err && <p style={{ color: 'crimson' }}>Error: {err}</p>}
    {loading && <p>Loading…</p>}

    {!loading && (
      <>
        {/* Add button — only when event is not locked or revealed */}
        {!isLocked && !isRevealed && (
          <div style={{ marginBottom: 16 }}>
            <Link
              href="/add"
              style={{
                display: 'inline-block',
                border: '1px solid #888',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 600,
                textDecoration: 'none',
                color: 'var(--foreground)',
              }}
            >
              + Add a wine or cheese
            </Link>
          </div>
        )}

        {/* WINES (boxed like Results) */}
        <section style={boxWineRed}>
          <h2 style={{
  fontFamily: "var(--font-limelight), serif",
  fontSize: 26,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}}
>
Wines
</h2>
          {wines.length === 0 ? (
            <p>No wines yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {wines.map(w => {
                const rated = ratedSet.has(w.item_id);
                const canEdit = !isLocked && guestId && w.brought_by_id === guestId;
                const progress = progressByItem.get(w.item_id);
                return (
                  <li key={w.item_id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    {/* Header line */}
                    <div>
                      <strong>Wine #{w.number}</strong>
                      {w.wine_name ? ` — ${w.wine_name}${w.wine_vintage ? ` (${w.wine_vintage})` : ''}` : ''}
                      {w.wine_country ? ` • ${w.wine_country}` : ''}
                      {w.wine_abv != null ? ` • ${w.wine_abv}% ABV` : ''}
                      {' '}
                      {rated ? '✅' : ''}
                    </div>

                    {/* Vivino info — only visible after results are revealed */}
{isRevealed && (
  <div style={smallGrey}>
{(() => {
  const avg = averageScores.find(r => r.item_id === w.item_id)?.avg_score;
  return `Avg score: ${avg != null ? Number(avg).toFixed(1) : '—'}`;
})()}
{' '}•{' '}
    {w.vivino_avg != null
      ? `Vivino score: ${w.vivino_avg.toFixed(1)}`
      : 'Vivino score: —'}

    {w.vivino_url && (
      <>
        {' '}•{' '}
        <a
          href={w.vivino_url}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: 'underline' }}
        >
          Vivino link
        </a>
      </>
    )}
  </div>
)}

                    {/* Pairing suggestions (🧀), same small grey size */}
                    {w.wine_pairing_suggestions ? (
                      <div style={{ ...smallGrey, marginTop: 4 }}>
                        <span role="img" aria-label="cheese">🧀</span>{' '}
                        <span style={{ fontWeight: 600 }}>Pairing suggestions:</span>{' '}
                        “{w.wine_pairing_suggestions}”
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
{isRevealed && !rated ? (
  <span
    style={{
      ...ratingButtonStyle('wine', rated),
      opacity: 0.4,
      cursor: 'default',
    }}
    aria-disabled="true"
  >
    View Rating
  </span>
) : (
  <Link
    href={`/rate/${w.item_id}`}
    style={ratingButtonStyle('wine', rated)}
  >
    {actionLabelFor(w.item_id)}
  </Link>
)}
{!isRevealed && progress && (
  <span style={smallGrey}>
    Rated by {progress.rating_count} of {progress.guest_count} guests
  </span>
)}
                      {canEdit ? (
                        <>
                          <span aria-hidden>•</span>
                          <Link href={`/edit/${w.item_id}`} style={{ textDecoration: 'underline' }}>Edit</Link>
                          <span aria-hidden>•</span>
                          <button
                            onClick={() => handleDelete(w.item_id)}
                            disabled={busyId === w.item_id}
                            style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* CHEESES (boxed like Results) */}
        <section style={boxCheese}>
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
          {cheeses.length === 0 ? (
            <p>No cheeses yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {cheeses.map(c => {
                const rated = ratedSet.has(c.item_id);
                const canEdit = !isLocked && guestId && c.brought_by_id === guestId;
                const progress = progressByItem.get(c.item_id);
                return (
                  <li key={c.item_id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    {/* Header line */}
                    <div>
                      <strong>Cheese #{c.number}</strong>
                      {c.cheese_name ? ` — ${c.cheese_name}` : ''}
                      {c.cheese_country ? ` • ${c.cheese_country}` : ''}
                      {c.cheese_milk ? ` • ${c.cheese_milk}` : ''}
                      {c.cheese_style ? ` • ${c.cheese_style}` : ''}
                      {' '}
                      {rated ? '✅' : ''}
                    </div>

{/* Average score — only visible after results are revealed */}
{isRevealed && (
  <div style={smallGrey}>
    Avg score: {
      (() => {
        const avg = averageScores.find(r => r.item_id === c.item_id)?.avg_score;
        return avg != null ? Number(avg).toFixed(1) : '—';
      })()
    }
  </div>
)}
                    {/* Pairing suggestions (🍷), same small grey size */}
                    {c.cheese_pairing_suggestions ? (
                      <div style={{ ...smallGrey, marginTop: 4 }}>
                        <span role="img" aria-label="wine glass">🍷</span>{' '}
                        <span style={{ fontWeight: 600 }}>Pairing suggestions:</span>{' '}
                        “{c.cheese_pairing_suggestions}”
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
{isRevealed && !rated ? (
  <span
    style={{
      ...ratingButtonStyle('cheese', rated),
      opacity: 0.4,
      cursor: 'default',
    }}
    aria-disabled="true"
  >
    View Rating
  </span>
) : (
  <Link
    href={`/rate/${c.item_id}`}
    style={ratingButtonStyle('cheese', rated)}
  >
    {actionLabelFor(c.item_id)}
  </Link>
)}{!isRevealed && progress && (
  <span style={smallGrey}>
    Rated by {progress.rating_count} of {progress.guest_count} guests
  </span>
)}

                      {canEdit ? (
                        <>
                          <span aria-hidden>•</span>
                          <Link href={`/edit/${c.item_id}`} style={{ textDecoration: 'underline' }}>Edit</Link>
                          <span aria-hidden>•</span>
                          <button
                            onClick={() => handleDelete(c.item_id)}
                            disabled={busyId === c.item_id}
                            style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </>
    )}
  </main>
);
  
}
