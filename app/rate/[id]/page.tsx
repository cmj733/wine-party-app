'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Kind = 'wine' | 'cheese';

type ItemRow = {
  item_id: number;
  kind: Kind;
  number: number;
  // wine
  wine_name: string | null;
  wine_vintage: string | null;
  wine_country: string | null;
  wine_abv: number | null;
  // cheese
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null;
  cheese_style: string | null;
};

type PromptRow = { id: number; prompt: string; short_prompt: string };

export default function RatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const itemId = Number(params.id);

  const [guestId, setGuestId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [item, setItem] = useState<ItemRow | null>(null);

  // form fields
  const [score, setScore] = useState<string>(''); // text input for 0–5
  const [promptId, setPromptId] = useState<number | null>(null);
  const [promptText, setPromptText] = useState<string>(''); // "Describe it as a …"
  const [promptShort, setPromptShort] = useState<string>(''); // e.g., "feeling"
  const [answer, setAnswer] = useState<string>(''); // required
  const [note, setNote] = useState<string>('');     // optional

  // if you already have a rating for this item, we treat submit as "update"
  const [existingRatingId, setExistingRatingId] = useState<number | null>(null);

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));
    if (!g || !e || !itemId) {
      router.push('/join');
      return;
    }
    setGuestId(g);
    setEventId(e);

    (async () => {
      try {
        setLoading(true);

        // Gate on reveal (no editing if revealed; you can still view)
        const { data: flags, error: flagsErr } = await supabase.rpc('get_event_flags_for_guest', { p_guest_id: g });
        if (flagsErr) throw flagsErr;
        const f = flags?.[0];
        setIsRevealed(!!f?.revealed);

        // load item header from your RPC
        const { data: itemsData, error: itemsErr } = await supabase.rpc('get_items_for_guest', { p_guest_id: g });
        if (itemsErr) throw itemsErr;
        const found = (itemsData ?? []).find((r: any) => r.item_id === itemId);
        if (!found) throw new Error('Item not found for this event.');
        setItem({
          item_id: found.item_id,
          kind: found.kind,
          number: found.number,
          wine_name: found.wine_name,
          wine_vintage: found.wine_vintage,
          wine_country: found.wine_country,
          wine_abv: found.wine_abv,
          cheese_name: found.cheese_name,
          cheese_country: found.cheese_country,
          cheese_milk: found.cheese_milk,
          cheese_style: found.cheese_style,
        });

        // see if you already have a rating
        const { data: existing, error: rErr } = await supabase
          .from('ratings')
          .select('id, score, prompt_id, prompt_answer:prompt_answer, note, created_at')
          .eq('event_id', e)
          .eq('guest_id', g)
          .eq('item_id', itemId)
          .maybeSingle();

        if (rErr) throw rErr;

        if (existing) {
          // Preload existing rating + fetch its prompt text
          setExistingRatingId(existing.id);
          setScore(existing.score != null ? String(existing.score) : '');
          setAnswer(existing.prompt_answer ?? '');
          setNote(existing.note ?? '');
          if (existing.prompt_id) {
            setPromptId(existing.prompt_id);
            const { data: p, error: pErr } = await supabase
              .from('prompts')
              .select('id, prompt, short_prompt')
              .eq('id', existing.prompt_id)
              .maybeSingle();
            if (pErr) throw pErr;
            setPromptText(p?.prompt ?? '');
            setPromptShort(p?.short_prompt ?? '');
          }
        } else {
          // No rating yet → pick a random prompt client-side
          const { data: prompts, error: pErr } = await supabase
            .from('prompts')
            .select('id, prompt, short_prompt');
          if (pErr) throw pErr;
          const list = prompts ?? [];
          if (!list.length) throw new Error('No prompts found.');
          const random = list[Math.floor(Math.random() * list.length)] as PromptRow;
          setPromptId(random.id);
          setPromptText(random.prompt);
          setPromptShort(random.short_prompt);
        }
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load rating form');
      } finally {
        setLoading(false);
      }
    })();
  }, [router, itemId]);

  const header = useMemo(() => {
    if (!item) return '';
    if (item.kind === 'wine') {
      return `Wine #${item.number}${item.wine_name ? ` — ${item.wine_name}${item.wine_vintage ? ` (${item.wine_vintage})` : ''}` : ''}`;
    }
    return `Cheese #${item.number}${item.cheese_name ? ` — ${item.cheese_name}` : ''}`;
  }, [item]);

async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!guestId || !eventId || !itemId) return;

  const trimmedScore = score.trim();
  const sNum = Number(trimmedScore.replace(',', '.'));
  if (!(trimmedScore.length > 0) || !isFinite(sNum) || sNum < 0 || sNum > 5) {
    setErr('Please enter a valid score between 0 and 5.');
    return;
  }
  if (!promptId) {
    setErr('A prompt could not be selected.');
    return;
  }
  if (!answer.trim()) {
    setErr('Please answer the prompt.');
    return;
  }

  try {
    setErr(null);
    const { error } = await supabase.rpc('upsert_my_rating', {
      p_guest_id:      guestId,
      p_event_id:      eventId,
      p_item_id:       itemId,
      p_score:         sNum,
      p_prompt_id:     promptId,
      p_prompt_answer: answer.trim(),
      p_note:          note.trim() || null,
    });
    if (error) throw error;

    router.push('/items');
  } catch (e: any) {
    setErr(e.message ?? 'Save failed');
  }
}

  // ---------- styles (match your other pages) ----------
  const wrap = { maxWidth: 720, margin: '32px auto', padding: 16 } as const;
  const label = { fontWeight: 700 } as const;
  const requiredStar = { color: 'crimson', marginLeft: 4 } as const;
  const optionalHint = { fontStyle: 'italic', color: '#555', marginLeft: 6, fontWeight: 400 } as const;
  const field = { display: 'grid', gap: 6, marginBottom: 14 } as const;
  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '10px 12px' } as const;
  const textarea = { ...input, minHeight: 90 } as const;
  const saveBtn = {
    background: '#10b981',
    color: 'white',
    border: '1px solid #10b981',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 160,
  } as const;

  if (loading) {
    return <main style={wrap}><p>Loading…</p></main>;
  }

  if (err) {
    return (
      <main style={wrap}>
        <p style={{ color: 'crimson' }}>{err}</p>
        <p style={{ marginTop: 8 }}><Link href="/items" style={{ textDecoration: 'underline' }}>← Back to Items</Link></p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{header}</h1>

      {/* If results are revealed, show read-only (no changes) */}
      {isRevealed && (
        <p style={{ color: '#555', marginBottom: 12 }}>
          Results are revealed. You can view your rating below but cannot change it.
        </p>
      )}

      <form onSubmit={onSubmit}>
        {/* Score (0–5) — required */}
        <div style={field}>
          <label style={label}>
            Score (0–5) <span style={requiredStar}>*</span>
          </label>
          <input
            style={input}
            type="text"
            inputMode="decimal"
            placeholder="0–5"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            disabled={isRevealed}
            required
          />
        </div>

        {/* Prompt line — bold (not italic), with required asterisk */}
        <div style={field}>
          <div style={{ ...label }}>
            {promptText || 'Prompt'} <span style={requiredStar}>*</span>
          </div>
          {/* Prompt answer (required) */}
          <textarea
            style={textarea}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={promptShort ? `e.g., describe it as a ${promptShort}` : 'Your answer…'}
            disabled={isRevealed}
            required
          />
        </div>

        {/* Additional comments (optional, grey italic) */}
        <div style={field}>
          <label style={label}>
            Additional comments <span style={optionalHint}>(optional)</span>
          </label>
          <textarea
            style={textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything else you noticed…"
            disabled={isRevealed}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          {!isRevealed && (
            <button type="submit" style={saveBtn}>
              {existingRatingId ? 'Save changes' : 'Save rating'}
            </button>
          )}
        </div>
      </form>

      <p style={{ marginTop: 12 }}>
        <Link href="/items" style={{ textDecoration: 'underline' }}>← Back to Items</Link>
      </p>
    </main>
  );
}
