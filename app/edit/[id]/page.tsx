'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Kind = 'wine' | 'cheese';

type EditItem = {
  item_id: number;
  event_id: number;
  kind: Kind;
  number: number;
  brought_by_id: number | null;

  // wine details
  wine_name: string | null;
  wine_vintage: string | null;
  wine_grapes: string | null;
  wine_country: string | null;
  wine_abv: number | null;
  vivino_avg: number | null;
  vivino_url: string | null;
  store?: string | null;
  pairing_suggestions?: string | null;

  // cheese details
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null; // TEXT
  cheese_style: string | null;
  cheese_store?: string | null;
  cheese_pairing_suggestions?: string | null;
};

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const itemId = Number(params.id);

  const [guestId, setGuestId] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [item, setItem] = useState<EditItem | null>(null);
  const kind: Kind | null = item?.kind ?? null;

  // form fields
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');

  // wine
  const [vintage, setVintage] = useState('');
  const [grapes, setGrapes] = useState('');
  const [abv, setAbv] = useState<string>('');
  const [vivinoAvg, setVivinoAvg] = useState<string>('');
  const [vivinoUrl, setVivinoUrl] = useState('');
  const [wineStore, setWineStore] = useState('');
  const [winePairing, setWinePairing] = useState(''); // NEW

  // cheese
  const [milkType, setMilkType] = useState(''); // TEXT
  const [style, setStyle] = useState('');
  const [cheeseStore, setCheeseStore] = useState('');
  const [cheesePairing, setCheesePairing] = useState(''); // NEW

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

        // lock → push away
        const { data: flags, error: flagsErr } = await supabase.rpc('get_event_flags_for_guest', { p_guest_id: g });
        if (flagsErr) throw flagsErr;
        const f = flags?.[0];
        if (f?.locked) { router.push('/items'); return; }
        setIsLocked(!!f?.locked);

        // load items you can see/own; find the one
        const { data: list, error: listErr } = await supabase.rpc('get_items_with_owner', { p_guest_id: g });
        if (listErr) throw listErr;
        const found = (list ?? []).find((r: any) => r.item_id === itemId) as EditItem | undefined;
        if (!found) { setErr('Item not found or you cannot edit it.'); return; }

        setItem(found);

        // hydrate form (if pairing not in RPC, fetch directly)
        if (found.kind === 'wine') {
          setName(found.wine_name ?? '');
          setCountry(found.wine_country ?? '');
          setVintage(found.wine_vintage ?? '');
          setGrapes(found.wine_grapes ?? '');
          setAbv(found.wine_abv != null ? String(found.wine_abv) : '');
          setVivinoAvg(found.vivino_avg != null ? String(found.vivino_avg) : '');
          setVivinoUrl(found.vivino_url ?? '');
          setWineStore((found as any).store ?? (found as any).wine_store ?? '');

          const maybePair = (found as any).pairing_suggestions ?? (found as any).wine_pairing_suggestions;
          if (maybePair !== undefined) setWinePairing(maybePair ?? '');
          else {
            const { data: wd } = await supabase.from('wine_details')
              .select('pairing_suggestions').eq('item_id', itemId).maybeSingle();
            setWinePairing(wd?.pairing_suggestions ?? '');
          }
        } else {
          setName(found.cheese_name ?? '');
          setCountry(found.cheese_country ?? '');
          setMilkType(found.cheese_milk ?? '');
          setStyle(found.cheese_style ?? '');
          setCheeseStore((found as any).store ?? (found as any).cheese_store ?? '');

          const maybePair = (found as any).pairing_suggestions ?? (found as any).cheese_pairing_suggestions;
          if (maybePair !== undefined) setCheesePairing(maybePair ?? '');
          else {
            const { data: cd } = await supabase.from('cheese_details')
              .select('pairing_suggestions').eq('item_id', itemId).maybeSingle();
            setCheesePairing(cd?.pairing_suggestions ?? '');
          }
        }
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load item');
      } finally {
        setLoading(false);
      }
    })();
  }, [router, itemId]);

  const canSubmit = useMemo(() => {
    if (!item) return false;
    if (item.kind === 'wine') {
      return !!(name.trim() && country.trim() && vintage.trim() && grapes.trim() && vivinoAvg.trim() && vivinoUrl.trim());
    } else {
      return !!(name.trim() && country.trim() && milkType.trim());
    }
  }, [item, name, country, vintage, grapes, vivinoAvg, vivinoUrl, milkType]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !guestId) return;
    if (!canSubmit) { setErr('Please fill all required fields.'); return; }

    try {
      setBusy(true);
      setErr(null);

      if (item.kind === 'wine') {
        const oneDec = vivinoAvg ? Number(Number(vivinoAvg).toFixed(1)) : null;
        const { error } = await supabase.rpc('update_wine_with_details', {
          p_item_id: item.item_id,
          p_abv: abv ? Number(abv) : null,
          p_country: country.trim(),
          p_grape_varieties: grapes.trim(),
          p_name: name.trim(),
          p_store: wineStore.trim() || null,
          p_vintage: vintage.trim(),
          p_vivino_avg: oneDec,
          p_vivino_url: vivinoUrl.trim(),
          p_pairing: winePairing.trim() || null, // NEW
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('update_cheese_with_details', {
          p_item_id: item.item_id,
          p_country: country.trim(),
          p_milk_type: milkType, // TEXT
          p_name: name.trim(),
          p_store: cheeseStore.trim() || null,
          p_style: style.trim() || null,
          p_pairing: cheesePairing.trim() || null, // NEW
        });
        if (error) throw error;
      }

      router.push('/items');
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  // ---------- styles (match Add page) ----------
  const wrap = { maxWidth: 720, margin: '32px auto', padding: 16 } as const;
  const field = { display: 'grid', gap: 6, marginBottom: 14 } as const;
  const label = { fontWeight: 700 } as const;
  const requiredStar = { color: 'crimson', marginLeft: 4 } as const;
  const optionalHint = { fontStyle: 'italic', color: '#555', marginLeft: 6, fontWeight: 400 } as const;
  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '10px 12px' } as const;
  const textarea = { ...input, minHeight: 60 } as const;
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;

  const saveBtn = {
    background: '#10b981',
    color: 'white',
    border: '1px solid #10b981',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    minWidth: 160
  } as const;

  if (loading) return <main style={wrap}><p>Loading…</p></main>;
  if (!item)    return <main style={wrap}><p style={{ color: 'crimson' }}>{err ?? 'Item not available.'}</p></main>;

  return (
    <main style={wrap}>
      {err && <p style={{ color: 'crimson', marginBottom: 12 }}>Error: {err}</p>}

      <form onSubmit={onSubmit}>
        {/* Name */}
        <div style={field}>
          <label style={label}>
            Name <span style={requiredStar}>*</span>
          </label>
          <input
            style={input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
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
            onChange={e => setCountry(e.target.value)}
            placeholder="e.g., Italy"
            required
          />
        </div>

        {kind === 'wine' ? (
          <>
            <div style={row}>
              <div style={field}>
                <label style={label}>
                  Vintage <span style={requiredStar}>*</span>
                </label>
                <input
                  style={input}
                  type="text"
                  value={vintage}
                  onChange={e => setVintage(e.target.value)}
                  placeholder="e.g., 2019, blend"
                  required
                />
              </div>

              <div style={field}>
                <label style={label}>
                  ABV <span style={optionalHint}>(optional)</span>
                </label>
                <input
                  style={input}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={abv}
                  onChange={e => setAbv(e.target.value)}
                  placeholder="e.g., 13.5"
                />
              </div>
            </div>

            <div style={field}>
              <label style={label}>
                Grape varieties <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="text"
                value={grapes}
                onChange={e => setGrapes(e.target.value)}
                placeholder="e.g., Sangiovese, Merlot"
                required
              />
            </div>

            <div style={field}>
              <label style={label}>
                Vivino avg score <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={vivinoAvg}
                onChange={e => setVivinoAvg(e.target.value)}
                placeholder="e.g., 3.9"
                required
              />
            </div>

            <div style={field}>
              <label style={label}>
                Vivino URL <span style={requiredStar}>*</span>
              </label>
              <input
                style={input}
                type="url"
                value={vivinoUrl}
                onChange={e => setVivinoUrl(e.target.value)}
                placeholder="https://www.vivino.com/…"
                required
              />
            </div>

            <div style={field}>
              <label style={label}>
                Store purchased at <span style={optionalHint}>(optional)</span>
              </label>
              <input
                style={input}
                type="text"
                value={wineStore}
                onChange={e => setWineStore(e.target.value)}
                placeholder="if other than Systembolaget"
              />
            </div>

            <div style={field}>
              <label style={label}>
                Pairing suggestions <span style={optionalHint}>(optional)</span>
              </label>
              <textarea
                style={textarea}
                value={winePairing}
                onChange={e => setWinePairing(e.target.value)}
                placeholder="e.g., pair with mild cheese, pair with cheese #3 and fig jam"
              />
            </div>
          </>
        ) : (
          <>
            <div style={field}>
              <label style={label}>
                Milk type <span style={requiredStar}>*</span>
              </label>
              <select
                style={input}
                value={milkType}
                onChange={e => setMilkType(e.target.value)}
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

            <div style={field}>
              <label style={label}>
                Style <span style={optionalHint}>(optional)</span>
              </label>
              <input
                style={input}
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="e.g., Semi-hard, aged, blue"
              />
            </div>

            <div style={field}>
              <label style={label}>
                Store purchased at <span style={optionalHint}>(optional)</span>
              </label>
              <input
                style={input}
                type="text"
                value={cheeseStore}
                onChange={e => setCheeseStore(e.target.value)}
                placeholder="e.g., Möllans Ost"
              />
            </div>

            <div style={field}>
              <label style={label}>
                Pairing suggestions <span style={optionalHint}>(optional)</span>
              </label>
              <textarea
                style={textarea}
                value={cheesePairing}
                onChange={e => setCheesePairing(e.target.value)}
                placeholder="e.g., pair with a light red, pair with wine #3"
              />
            </div>
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="submit" style={saveBtn} disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <p style={{ marginTop: 12 }}>
        <a href="/items" style={{ textDecoration: 'underline' }}>← Back to Items</a>
      </p>
    </main>
  );
}
