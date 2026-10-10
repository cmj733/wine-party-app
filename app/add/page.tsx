'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Kind = 'wine' | 'cheese';

export default function AddItemPage() {
  const router = useRouter();
  const [guestId, setGuestId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState<Kind>('wine');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [registeredItem, setRegisteredItem] = useState<{
    kind: Kind;
    number: number;
  } | null>(null);

  // Shared
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [store, setStore] = useState('');       // optional
  const [pairing, setPairing] = useState('');   // optional (pairing_suggestions)

  // Wine
  const [vintage, setVintage] = useState('');   // required (TEXT)
  const [abv, setAbv] = useState<string>('');   // optional
  const [grapes, setGrapes] = useState('');     // required
  const [vivinoAvg, setVivinoAvg] = useState(''); // required (one decimal)
  const [vivinoUrl, setVivinoUrl] = useState(''); // required

  // Cheese
  const [milkType, setMilkType] = useState(''); // required: cow/goat/sheep/buffalo/unknown
  const [style, setStyle] = useState('');       // optional

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
        const { data: flags, error } = await supabase.rpc('get_event_flags_for_guest', { p_guest_id: g });
        if (error) throw error;
        const f = flags?.[0];
        if (f?.locked) {
  router.push('/items');
  return;
        }
      } catch (e: any) {
        setErr(e.message ?? 'Failed to check event status');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestId) return;

    try {
      setBusy(true);
      setErr(null);

      if (kind === 'wine') {
        // Required validations for wine
        if (!name.trim() || !country.trim() || !vintage.trim() || !grapes.trim() || !vivinoAvg.trim() || !vivinoUrl.trim()) {
          setErr('Please fill all required wine fields.');
          return;
        }

const vivinoNum = Number(vivinoAvg.replace(',', '.'));
if (!isFinite(vivinoNum) || vivinoNum < 0 || vivinoNum > 5) {
  setErr('Please enter a valid Vivino score between 0 and 5.');
  return;
}

const abvNum = abv.trim()
  ? Number(abv.replace(',', '.'))
  : null;

if (abvNum !== null && (!isFinite(abvNum) || abvNum < 0 || abvNum > 25)) {
  setErr('Please enter a valid ABV between 0 and 25.');
  return;
}
        const viv = Number(Number(vivinoAvg.replace(',', '.')).toFixed(1));
        const { error } = await supabase.rpc('add_wine_with_details', {
          p_abv: abv ? Number(abv.replace(',', '.')) : null,
          p_country: country.trim(),
          p_grape_varieties: grapes.trim(),
          p_guest_id: guestId,
          p_name: name.trim(),
          p_store: store.trim() || null,
          p_vintage: vintage.trim(), // TEXT (e.g., "2019, blend")
          p_vivino_avg: Number.isFinite(viv) ? viv : null,
          p_vivino_url: vivinoUrl.trim(),
          p_pairing: pairing.trim() || null, // pairing_suggestions
        });
        if (error) throw error;
      } else {
        // Required validations for cheese
        if (!name.trim() || !country.trim() || !milkType.trim()) {
          setErr('Please fill all required cheese fields.');
          return;
        }
        const { error } = await supabase.rpc('add_cheese_with_details', {
          p_country: country.trim(),
          p_guest_id: guestId,
          p_milk_type: milkType, // TEXT
          p_name: name.trim(),
          p_store: store.trim() || null,
          p_style: style.trim() || null,
          p_pairing: pairing.trim() || null, // pairing_suggestions
        });
                if (error) throw error;
      }

      const { data: itemsData, error: itemsErr } = await supabase.rpc(
        'get_items_for_guest',
        { p_guest_id: guestId }
      );

      if (itemsErr) throw itemsErr;

      const myItems = (itemsData ?? [])
        .filter(
          (item: { brought_by_id: number | null; kind: Kind }) =>
            item.brought_by_id === guestId && item.kind === kind
        )
        .sort(
          (a: { item_id: number }, b: { item_id: number }) =>
            b.item_id - a.item_id
        );

      if (!myItems.length) {
        throw new Error('Item saved, but its assigned number could not be found.');
      }

      setRegisteredItem({
        kind,
        number: myItems[0].number,
      });
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  // ---------- styles ----------
  const wrap = { maxWidth: 720, margin: '32px auto', padding: 16 } as const;
  const field = { display: 'grid', gap: 6, marginBottom: 14 } as const;
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const; // vintage & abv side-by-side
  const label = { fontWeight: 700 } as const;
  const requiredStar = { color: 'crimson', marginLeft: 4 } as const;
  const optionalHint = { fontStyle: 'italic', color: '#555', marginLeft: 6, fontWeight: 400 } as const;
  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '10px 12px' } as const;
  const textarea = { ...input, minHeight: 60 } as const;
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
  const toggleWrap = { display: 'flex', gap: 8, marginBottom: 16 } as const;
  const toggleBtn = (active: boolean) => ({
    padding: '8px 12px',
    borderRadius: 10,
    border: active ? '2px solid #10b981' : '1px solid #ccc',
    background: active ? '#ECFDF5' : '#fff',
    fontWeight: active ? 700 : 600,
    cursor: 'pointer'
  }) as const;

  if (loading) return <main style={wrap}><p>Loading…</p></main>;

  return (
    <main style={wrap}>
      {/* Simple toggle */}
      <div style={toggleWrap}>
        <button type="button" onClick={() => setKind('wine')}   style={toggleBtn(kind === 'wine')}>Wine</button>
        <button type="button" onClick={() => setKind('cheese')} style={toggleBtn(kind === 'cheese')}>Cheese</button>
      </div>

      {err && <p style={{ color: 'crimson', marginBottom: 8 }}>Error: {err}</p>}

      <form onSubmit={onSubmit}>
        {/* --- Shared fields (top) --- */}
        {/* Name */}
        <div style={field}>
          <label style={label}>
            Name <span style={requiredStar}>*</span>
          </label>
          <input
            style={input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'wine' ? 'e.g., Astrale Rosso' : 'e.g., Comté'}
            required
          />
        </div>

        {/* Country */}
        <div style={field}>
          <label style={label}>
            Country <span style={requiredStar}>*</span>
          </label>
          <input
            style={input}
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g., Italy"
            required
          />
        </div>

        {/* --- Kind-specific blocks in your exact order --- */}
        {kind === 'wine' ? (
          <>
            {/* Vintage & ABV (same row) */}
            <div style={row2}>
              <div style={field}>
                <label style={label}>
                  Vintage <span style={requiredStar}>*</span>
                </label>
                <input
                  style={input}
                  type="text"
                  value={vintage}
                  onChange={(e) => setVintage(e.target.value)}
                  placeholder="e.g., 2019, blend"
                  required
                />
              </div>
              <div style={field}>
                <label style={label}>
                  ABV (%) <span style={optionalHint}>(optional)</span>
                </label>
                <input
                  style={input}
                  type="text"
		  inputMode="decimal"
                  value={abv}
                  onChange={(e) => setAbv(e.target.value)}
                  placeholder="e.g., 13.5"
                />
              </div>
            </div>

            {/* Grape varieties */}
            <div style={field}>
              <label style={label}>
                Grape varieties <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="text"
                value={grapes}
                onChange={(e) => setGrapes(e.target.value)}
                placeholder="e.g., Sangiovese, Merlot"
                required
              />
            </div>

            {/* Vivino avg score */}
            <div style={field}>
              <label style={label}>
                Vivino avg score <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="text"
		inputMode="decimal"
                value={vivinoAvg}
                onChange={(e) => setVivinoAvg(e.target.value)}
                placeholder="e.g., 3.9"
                required
              />
            </div>

            {/* Vivino URL */}
            <div style={field}>
              <label style={label}>
                Vivino URL <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="url"
                value={vivinoUrl}
                onChange={(e) => setVivinoUrl(e.target.value)}
                placeholder="https://www.vivino.com/…"
                required
              />
            </div>
          </>
        ) : (
          <>
            {/* Milk type */}
            <div style={field}>
              <label style={label}>
                Milk type <span style={requiredStar}>*</span>
              </label>
              <select
                style={input}
                value={milkType}
                onChange={(e) => setMilkType(e.target.value)}
                required
              >
                <option value="">Select milk type</option>
                <option value="cow">Cow</option>
                <option value="goat">Goat</option>
                <option value="sheep">Sheep</option>
                <option value="buffalo">Buffalo</option>
                <option value="unknown">Good question, I don&apos;t know</option>
              </select>
            </div>

            {/* Style */}
            <div style={field}>
              <label style={label}>
                Style <span style={optionalHint}>(optional)</span>
              </label>
              <input
                style={input}
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="e.g., Semi-hard, aged, blue"
              />
            </div>
          </>
        )}

        {/* Store purchased at */}
        <div style={field}>
          <label style={label}>
            Store purchased at <span style={optionalHint}>(optional)</span>
          </label>
          <input
            style={input}
            type="text"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder={kind === 'wine' ? 'if other than Systembolaget' : 'e.g., Möllans Ost'}
          />
        </div>

        {/* Pairing suggestions (bottom) */}
        <div style={field}>
          <label style={label}>
            Pairing suggestions <span style={optionalHint}>(optional)</span>
          </label>
          <textarea
            style={textarea}
            value={pairing}
            onChange={(e) => setPairing(e.target.value)}
            placeholder={
              kind === 'wine'
                ? 'e.g., pair with mild cheese, pair with cheese #3 and fig jam'
                : 'e.g., pair with a light red, pair with wine #3'
            }
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="submit" style={saveBtn} disabled={busy}>
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </form>
      {registeredItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Registration confirmation"
            style={{
              background: '#fff',
              color: '#222',
              borderRadius: 16,
              padding: '32px 24px',
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              ✅
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 24,
              }}
            >
              {registeredItem.kind === 'wine'
                ? 'Wine registered successfully!'
                : 'Cheese registered successfully!'}
            </div>

            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#666',
              }}
            >
              YOUR {registeredItem.kind.toUpperCase()} NUMBER
            </div>

            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                margin: '8px 0 20px',
              }}
            >
              #{registeredItem.number}
            </div>

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                marginBottom: 28,
              }}
            >
              {registeredItem.kind === 'wine'
                ? 'Please find the matching numbered label and attach it to your wine bottle.'
                : 'Please find the matching numbered label and place it next to your cheese.'}
            </p>

            <button
              type="button"
              onClick={() => router.push('/items')}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '12px 32px',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
      <p style={{ marginTop: 12 }}>
        <a href="/items" style={{ textDecoration: 'underline' }}>← Back to Items</a>
      </p>
    </main>
  );
}

