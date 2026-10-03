'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import EventNav from '../components/EventNav';

type ItemRow = {
  item_id: number;
  event_id: number;
  kind: 'wine' | 'cheese';
  number: number;
  brought_by_id: number | null;

  // wine
  wine_name: string | null;
  wine_vintage: string | null;
  wine_grapes: string | null;
  wine_country: string | null;
  wine_abv: number | null;
  vivino_avg: number | null;
  vivino_url: string | null;
  wine_store?: string | null;
  wine_pairing_suggestions?: string | null;

  // cheese
  cheese_name: string | null;
  cheese_country: string | null;
  cheese_milk: string | null;
  cheese_style: string | null;
  cheese_store?: string | null;
  cheese_pairing_suggestions?: string | null;
};

type Guest = {id: number; name: string; is_admin: boolean; };
type PromptRow = { id: number; prompt: string; short_prompt: string };
type GuestProgress = {
  guest_id: number;
  guest_name: string;
  rated_count: number;
  total_items: number;
  missing_items: string;
};

export default function AdminPage() {
  const [guestId, setGuestId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);

  const [flags, setFlags] = useState<{ locked: boolean; revealed: boolean } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminCode, setAdminCode] = useState('');

  const [newEventName, setNewEventName] = useState('');
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventAdminCode, setNewEventAdminCode] = useState('');

  const [items, setItems] = useState<ItemRow[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [guestProgress, setGuestProgress] = useState<GuestProgress[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));
    if (!g || !e) {
      setErr('Please join an event first.');
      setLoading(false);
      return;
    }
    setGuestId(g);
    setEventId(e);

    (async () => {
      try {
        setErr(null);
        // Flags
        const { data: flagsData, error: flagsErr } = await supabase.rpc('get_event_flags_for_guest', { p_guest_id: g });
        if (flagsErr) throw flagsErr;
        const f = flagsData?.[0];
        setFlags({ locked: !!f?.locked, revealed: !!f?.revealed });
setEventName(f?.event_name ?? null);

        // Me (is_admin + event_id)
        const { data: me, error: meErr } = await supabase.from('guests').select('is_admin, event_id').eq('id', g).maybeSingle();
        if (meErr) throw meErr;
        setIsAdmin(!!me?.is_admin);
        setEventId(me?.event_id ?? e);

        // Items
        const { data: itemsData, error: itemsErr } = await supabase.rpc('get_items_with_owner', { p_guest_id: g });
        if (itemsErr) throw itemsErr;
        setItems((itemsData ?? []) as ItemRow[]);

        // Guests in event
        const { data: guestList, error: gErr } = await supabase
          .from('guests')
          .select('id, name, is_admin')
          .eq('event_id', me?.event_id ?? e)
          .order('name', { ascending: true });
        if (gErr) throw gErr;
        setGuests(guestList ?? []);

        // Prompts
        const { data: promptList, error: pErr } = await supabase.from('prompts').select('id, prompt, short_prompt');
        if (pErr) throw pErr;
        setPrompts(promptList ?? []);
      } catch (e: any) {
        setErr(e.message ?? 'Failed to load admin');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function enableAdmin() {
    if (!guestId || !adminCode.trim()) { alert('Enter admin code'); return; }
    try {
      setSaving(true);
      setErr(null);
      const { error } = await supabase.rpc('admin_enable', { p_guest_id: guestId, p_admin_code: adminCode.trim() });
      if (error) throw error;
      setIsAdmin(true);
      alert('Admin mode enabled.');
    } catch (e: any) {
      setErr(e.message ?? 'Enable admin failed');
    } finally {
      setSaving(false);
    }
  }

  async function disableAdmin() {
    if (!guestId) return;
    try {
      setSaving(true);
      setErr(null);
      const { error } = await supabase.rpc('admin_disable', { p_guest_id: guestId });
      if (error) throw error;
      setIsAdmin(false);
      alert('Admin mode disabled.');
    } catch (e: any) {
      setErr(e.message ?? 'Disable admin failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveFlags(next: { locked: boolean; revealed: boolean }) {
    if (!guestId) return;
    try {
      setSaving(true);
      setErr(null);
      const { error } = await supabase.rpc('admin_set_event_flags', {
        p_guest_id: guestId,
        p_locked: next.locked,
        p_revealed: next.revealed
      });
      if (error) throw error;
      setFlags(next);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to save flags (are you in admin mode?)');
    } finally {
      setSaving(false);
    }
  }
async function createEvent() {
  if (!guestId) return;

  if (!newEventName.trim()) {
    alert('Enter an event name.');
    return;
  }

  if (!newEventCode.trim()) {
    alert('Enter an event code.');
    return;
  }

  if (!newEventAdminCode.trim()) {
    alert('Enter an admin code for the new event.');
    return;
  }

  if (!confirm(
    `Create new event "${newEventName.trim()}"?\n\n` +
    `Event code: ${newEventCode.trim().toUpperCase()}\n\n` +
    `You will be switched into the new event automatically.`
  )) {
    return;
  }

  try {
    setSaving(true);
    setErr(null);

    const { data, error } = await supabase.rpc('admin_create_event', {
      p_actor_guest_id: guestId,
      p_event_name: newEventName.trim(),
      p_event_code: newEventCode.trim(),
      p_admin_code: newEventAdminCode.trim(),
    });

    if (error) throw error;

    const created = data?.[0];

    if (!created?.event_id || !created?.guest_id) {
      throw new Error('Event was created but the new event details were not returned.');
    }

    localStorage.setItem('eventId', String(created.event_id));
    localStorage.setItem('guestId', String(created.guest_id));

    alert(
      `Event created!\n\n` +
      `Event: ${newEventName.trim()}\n` +
      `Event code: ${newEventCode.trim().toUpperCase()}`
    );

    window.location.href = '/items';
  } catch (e: any) {
    setErr(e.message ?? 'Failed to create event');
  } finally {
    setSaving(false);
  }
}

async function loadGuestProgress() {
  if (!guestId) return;

  try {
    setSaving(true);
    setErr(null);

    const { data, error } = await supabase.rpc(
      'get_guest_rating_progress_admin',
      { p_actor_guest_id: guestId }
    );

    if (error) throw error;

    setGuestProgress((data ?? []) as GuestProgress[]);
  } catch (e: any) {
    setErr(e.message ?? 'Failed to load guest progress');
  } finally {
    setSaving(false);
  }
}

async function deleteGuest(targetGuestId: number, targetGuestName: string) {
  if (!guestId || !isAdmin) return;

  const progress = guestProgress.find(
    g => g.guest_id === targetGuestId
  );

  const ratingCount = progress?.rated_count ?? 0;

  const warning =
    ratingCount > 0
      ? `Delete ${targetGuestName}?\n\nThis guest has ${ratingCount} rating${ratingCount === 1 ? '' : 's'}. Their ratings will also be permanently deleted.`
      : `Delete ${targetGuestName}?\n\nThis will permanently remove them from the event.`;

  if (!confirm(warning)) return;

  try {
    setSaving(true);
    setErr(null);

    const { error } = await supabase.rpc('admin_delete_guest', {
      p_actor_guest_id: guestId,
      p_guest_id: targetGuestId,
    });

    if (error) throw error;

    setGuests(current =>
      current.filter(g => g.id !== targetGuestId)
    );

    setGuestProgress(current =>
      current.filter(g => g.guest_id !== targetGuestId)
    );

    alert(`${targetGuestName} has been removed.`);
  } catch (e: any) {
    setErr(e.message ?? 'Failed to delete guest');
  } finally {
    setSaving(false);
  }
}

async function makeGuestAdmin(targetGuestId: number, targetGuestName: string) {
  if (!guestId || !isAdmin) return;

  if (
    !confirm(
      `Make ${targetGuestName} an admin?\n\nThey will have access to all admin controls for this event.`
    )
  ) {
    return;
  }

  try {
    setSaving(true);
    setErr(null);

    const { error } = await supabase.rpc('admin_make_guest_admin', {
      p_actor_guest_id: guestId,
      p_guest_id: targetGuestId,
    });

    if (error) throw error;

    setGuests(current =>
      current.map(g =>
        g.id === targetGuestId
          ? { ...g, is_admin: true }
          : g
      )
    );

    alert(`${targetGuestName} is now an admin.`);
  } catch (e: any) {
    setErr(e.message ?? 'Failed to make guest an admin');
  } finally {
    setSaving(false);
  }
}

async function removeGuestAdmin(targetGuestId: number, targetGuestName: string) {
  if (!guestId || !isAdmin) return;

  if (
    !confirm(
      `Remove admin access from ${targetGuestName}?\n\nThey will remain a guest, but will no longer have access to admin controls.`
    )
  ) {
    return;
  }

  try {
    setSaving(true);
    setErr(null);

    const { error } = await supabase.rpc('admin_remove_guest_admin', {
      p_actor_guest_id: guestId,
      p_guest_id: targetGuestId,
    });

    if (error) throw error;

    setGuests(current =>
      current.map(g =>
        g.id === targetGuestId
          ? { ...g, is_admin: false }
          : g
      )
    );

    alert(`${targetGuestName}'s admin access has been removed.`);
  } catch (e: any) {
    setErr(e.message ?? 'Failed to remove admin access');
  } finally {
    setSaving(false);
  }
}

  if (loading) {
    return <main style={{ maxWidth: 980, margin: '32px auto', padding: 16 }}><p>Loading…</p></main>;
  }

  const wrap = { maxWidth: 980, margin: '32px auto', padding: 16 } as const;
  const card = { border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 } as const;
  const label = { fontWeight: 700 } as const;
  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px' } as const;
  const btn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #999', cursor: 'pointer' } as const;
  const toggle = (on: boolean) => ({
    padding: '8px 10px',
    borderRadius: 10,
    border: on ? '2px solid #10b981' : '1px solid #bbb',
    background: on ? '#ECFDF5' : '#fff',
    fontWeight: on ? 700 : 600,
    cursor: 'pointer',
    minWidth: 120,
    textAlign: 'center' as const
  });

  return (
    <main style={wrap}>
<EventNav
  eventName={eventName}
  currentPage="admin"
  revealed={!!flags?.revealed}
  isAdmin={isAdmin}
/>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      {/* Admin mode */}
      <section style={card}>
        <div style={{ marginBottom: 8 }}>
          <div style={label}>Admin mode</div>
          <p style={{ color: '#555', margin: '6px 0 12px' }}>
            Enter the event’s admin code to enable admin-only controls for this event.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={input}
            type="password"
            placeholder="Admin code"
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
          />
          {!isAdmin ? (
            <button style={btn} onClick={enableAdmin} disabled={saving}>Enable</button>
          ) : (
            <button style={btn} onClick={disableAdmin} disabled={saving}>Disable</button>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: isAdmin ? '#0a7' : '#991b1b', }}>
          {isAdmin ? 'Admin mode is ON' : 'Admin mode is OFF'}
        </div>
      </section>
      {/* Create New Event */}
      <section style={card}>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Create new event</div>
          <p style={{ color: '#555', margin: '6px 0 0' }}>
            Create a new tasting event. You will automatically become the first guest and admin.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <input
            style={input}
            type="text"
            placeholder="Event name"
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            disabled={!isAdmin || saving}
          />

          <input
            style={input}
            type="text"
            placeholder="Event code"
            value={newEventCode}
            onChange={(e) => setNewEventCode(e.target.value.toUpperCase())}
            disabled={!isAdmin || saving}
          />

          <input
            style={input}
            type="password"
            placeholder="Admin code for new event"
            value={newEventAdminCode}
            onChange={(e) => setNewEventAdminCode(e.target.value)}
            disabled={!isAdmin || saving}
          />

          <div>
            <button
              style={{
                ...btn,
                opacity: isAdmin ? 1 : 0.6,
              }}
              onClick={createEvent}
              disabled={!isAdmin || saving}
            >
              Create Event
            </button>
          </div>

          {!isAdmin && (
            <div style={{ fontSize: 13, color: '#999' }}>
              Enable Admin mode above to create a new event.
            </div>
          )}
        </div>
      </section>
      {/* Flags */}
      <section style={card}>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Event controls</div>
          <p style={{ color: '#555', margin: '6px 0 0' }}>
            These toggles require admin mode.
          </p>
        </div>

        {flags ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ marginBottom: 6, color: '#333', fontWeight: 600 }}>Lock event</div>
              <button
                style={toggle(flags.locked)}
                onClick={() => saveFlags({ locked: !flags.locked, revealed: flags.revealed })}
                disabled={!isAdmin || saving}
              >
                {flags.locked ? 'Locked' : 'Open'}
              </button>
            </div>

            <div>
              <div style={{ marginBottom: 6, color: '#333', fontWeight: 600 }}>Reveal results</div>
              <button
                style={toggle(flags.revealed)}
                onClick={() => saveFlags({ locked: flags.locked, revealed: !flags.revealed })}
                disabled={!isAdmin || saving}
              >
                {flags.revealed ? 'Revealed' : 'Hidden'}
              </button>
            </div>
          </div>
        ) : <p>Loading flags…</p>}
      </section>

      {/* Guest Progress */}
      <section style={card}>
        <div style={{ marginBottom: 12 }}>
          <div style={label}>Guest progress</div>
          <p style={{ color: '#555', margin: '6px 0 0' }}>
            See who has finished rating and which items are still missing.
          </p>
        </div>

        <button
          style={{
            ...btn,
            opacity: isAdmin ? 1 : 0.6,
            marginBottom: guestProgress.length > 0 ? 14 : 0,
          }}
          onClick={loadGuestProgress}
          disabled={!isAdmin || saving}
        >
          Refresh Progress
        </button>

        {!isAdmin && (
          <div style={{ fontSize: 13, color: '#999', marginTop: 8 }}>
            Enable Admin mode above to view guest progress.
          </div>
        )}

        {guestProgress.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {guestProgress.map((g) => {
              const complete = g.rated_count === g.total_items;

              return (
                <div key={g.guest_id}>
                  <div>
                    <strong>{g.guest_name}:</strong>{' '}
                    {g.rated_count}/{g.total_items}
                    {complete && ' ✓'}
                  </div>

                  {!complete && g.missing_items && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#555',
                        marginTop: 2,
                      }}
                    >
                      Missing: {g.missing_items}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

{/* Guest Management */}
<section style={card}>
  <div style={{ marginBottom: 12 }}>
    <div style={label}>Manage guests</div>
    <p style={{ color: '#555', margin: '6px 0 0' }}>
      Remove accidental or duplicate guests from this event.
    </p>
  </div>

  <div style={{ display: 'grid', gap: 10 }}>
    {guests.map(g => {
      const isMe = g.id === guestId;
      const progress = guestProgress.find(
        p => p.guest_id === g.id
      );

      return (
        <div
          key={g.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #eee',
            paddingBottom: 10,
          }}
        >
          <div>
            <strong>{g.name}</strong>

            {isMe && (
              <span style={{ fontSize: 13, color: '#555' }}>
                {' '}— You
              </span>
            )}

            {progress && (
              <div
                style={{
                  fontSize: 13,
                  color: '#555',
                  marginTop: 2,
                }}
              >
                {progress.rated_count}/{progress.total_items} items rated
              </div>
            )}
          </div>

          {!isMe && (
  <div
    style={{
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexShrink: 0,
    }}
  >
{g.is_admin ? (
  <button
    style={{
      ...btn,
      borderColor: '#991b1b',
      color: '#991b1b',
      opacity: isAdmin ? 1 : 0.6,
      whiteSpace: 'nowrap',
    }}
    onClick={() => removeGuestAdmin(g.id, g.name)}
    disabled={!isAdmin || saving}
  >
    Remove Admin
  </button>
) : (
  <button
    style={{
      ...btn,
      opacity: isAdmin ? 1 : 0.6,
      whiteSpace: 'nowrap',
    }}
    onClick={() => makeGuestAdmin(g.id, g.name)}
    disabled={!isAdmin || saving}
  >
    Make Admin
  </button>
)}

    <button
      style={{
        ...btn,
        borderColor: '#991b1b',
        color: '#991b1b',
        opacity: isAdmin ? 1 : 0.6,
      }}
      onClick={() => deleteGuest(g.id, g.name)}
      disabled={!isAdmin || saving}
    >
      Remove
    </button>
  </div>
)}
        </div>
      );
    })}
  </div>

  {!isAdmin && (
    <div
      style={{
        fontSize: 13,
        color: '#999',
        marginTop: 10,
      }}
    >
      Enable Admin mode above to manage guests.
    </div>
  )}
</section>

      {/* Manage Items */}
      <section style={card}>
        <div style={{ marginBottom: 8 }}>
          <div style={label}>Manage items</div>
          <p style={{ color: '#555', margin: '6px 0 12px' }}>
            Edit or delete any wine/cheese. Lock/reveal is ignored for admins (server-checked).
          </p>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {items.length === 0 ? <p>No items yet.</p> : items
            .sort((a, b) => (a.kind === b.kind ? a.number - b.number : a.kind === 'wine' ? -1 : 1))
            .map(row => <ItemEditor key={row.item_id} row={row} isAdmin={isAdmin} actorId={guestId!} />)}
        </div>
      </section>

      {/* Manage Ratings */}
      <section style={card}>
        <div style={{ marginBottom: 8 }}>
          <div style={label}>Manage ratings</div>
          <p style={{ color: '#555', margin: '6px 0 12px' }}>
            Edit any guest’s rating for any item. Requires admin mode.
          </p>
        </div>
        <RatingsEditor
          isAdmin={isAdmin}
          actorId={guestId!}
          eventId={eventId!}
          items={items}
          guests={guests}
          prompts={prompts}
        />
      </section>
    </main>
  );
}

/* ---------- Item Editor (admin) ---------- */
function ItemEditor({ row, isAdmin, actorId }: { row: ItemRow; isAdmin: boolean; actorId: number }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [wine, setWine] = useState({
    name: row.wine_name ?? '',
    country: row.wine_country ?? '',
    vintage: row.wine_vintage ?? '',
    grapes: row.wine_grapes ?? '',
    abv: row.wine_abv ?? ('' as any),
    vivino_avg: row.vivino_avg ?? ('' as any),
    vivino_url: row.vivino_url ?? '',
    store: (row as any).wine_store ?? '',
    pairing: row.wine_pairing_suggestions ?? '',
  });

  const [cheese, setCheese] = useState({
    name: row.cheese_name ?? '',
    country: row.cheese_country ?? '',
    milk: row.cheese_milk ?? '',
    style: row.cheese_style ?? '',
    store: (row as any).cheese_store ?? '',
    pairing: row.cheese_pairing_suggestions ?? '',
  });

  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '6px 8px' } as const;
  const rowBox = { border: '1px solid #eee', borderRadius: 10, padding: 12, marginBottom: 10 } as const;
  const btn = { padding: '6px 10px', borderRadius: 8, border: '1px solid #999', cursor: 'pointer' } as const;

  async function saveWine() {
    try {
      setBusy(true);
      const { error } = await supabase.rpc('update_wine_with_details_admin', {
        p_actor_guest_id: actorId,
        p_item_id: row.item_id,
        p_abv: wine.abv === '' ? null : Number(wine.abv),
        p_country: wine.country || null,
        p_grape_varieties: wine.grapes || null,
        p_name: wine.name || null,
        p_store: wine.store || null,
        p_vintage: wine.vintage || null,
        p_vivino_avg: wine.vivino_avg === '' ? null : Number(wine.vivino_avg),
        p_vivino_url: wine.vivino_url || null,
      });
      if (error) throw error;
      alert('Saved.');
    } catch (e: any) {
      alert(e.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveCheese() {
    try {
      setBusy(true);
      const { error } = await supabase.rpc('update_cheese_with_details_admin', {
        p_actor_guest_id: actorId,
        p_item_id: row.item_id,
        p_country: cheese.country || null,
        p_milk_type: cheese.milk || null,
        p_name: cheese.name || null,
        p_style: cheese.style || null,
      });
      if (error) throw error;
      alert('Saved.');
    } catch (e: any) {
      alert(e.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function delItem() {
    if (!confirm(`Delete ${row.kind} #${row.number}? This will resequence the rest.`)) return;
    try {
      setBusy(true);
      const { error } = await supabase.rpc('admin_delete_item_and_resequence', {
        p_actor_guest_id: actorId,
        p_item_id: row.item_id,
      });
      if (error) throw error;
      alert('Deleted. Refreshing list…');
      // soft-remove from local list
      // (Parent will not re-fetch to keep the page snappy.)
      // You can manually refresh the page if needed.
      const ev = new CustomEvent('admin-remove-item', { detail: row.item_id });
      window.dispatchEvent(ev);
    } catch (e: any) {
      alert(e.message ?? 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  // Listen for local removal to hide the deleted row
  useEffect(() => {
    function onRemove(e: any) {
      if (e.detail === row.item_id) {
        // No-op here; parent section filters its state.
      }
    }
    window.addEventListener('admin-remove-item', onRemove as any);
    return () => window.removeEventListener('admin-remove-item', onRemove as any);
  }, [row.item_id]);

return (
  <div style={rowBox}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div>
        <strong>
          {row.kind === 'wine'
            ? `Wine #${row.number}${wine.name ? ` — ${wine.name}` : ''}`
            : `Cheese #${row.number}${cheese.name ? ` — ${cheese.name}` : ''}`}
        </strong>
      </div>

      <button
        type="button"
        style={{
          ...btn,
          padding: '4px 8px',
          fontSize: 13,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Collapse' : 'Edit'}
      </button>
    </div>

    {expanded && (
      <div style={{ marginTop: 10 }}>
        {row.kind === 'wine' ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <input style={input} placeholder="Name" value={wine.name} onChange={e => setWine({ ...wine, name: e.target.value })} />
          <input style={input} placeholder="Country" value={wine.country} onChange={e => setWine({ ...wine, country: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input style={input} placeholder="Vintage" value={wine.vintage} onChange={e => setWine({ ...wine, vintage: e.target.value })} />
            <input style={input} placeholder="ABV" value={wine.abv as any} onChange={e => setWine({ ...wine, abv: e.target.value as any })} />
          </div>
          <input style={input} placeholder="Grape varieties" value={wine.grapes} onChange={e => setWine({ ...wine, grapes: e.target.value })} />
          <input style={input} placeholder="Vivino avg score" value={wine.vivino_avg as any} onChange={e => setWine({ ...wine, vivino_avg: e.target.value as any })} />
          <input style={input} placeholder="Vivino URL" value={wine.vivino_url ?? ''} onChange={e => setWine({ ...wine, vivino_url: e.target.value })} />
          <input style={input} placeholder="Store purchased at" value={wine.store} onChange={e => setWine({ ...wine, store: e.target.value })} />
          <input style={input} placeholder="Pairing suggestions" value={wine.pairing} onChange={e => setWine({ ...wine, pairing: e.target.value })} disabled />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button style={{ ...btn, opacity: isAdmin ? 1 : 0.6 }} onClick={saveWine} disabled={!isAdmin || busy}>Save</button>
            <button style={{ ...btn, borderColor: '#c00', color: '#c00', opacity: isAdmin ? 1 : 0.6 }} onClick={delItem} disabled={!isAdmin || busy}>Delete</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <input style={input} placeholder="Name" value={cheese.name} onChange={e => setCheese({ ...cheese, name: e.target.value })} />
          <input style={input} placeholder="Country" value={cheese.country} onChange={e => setCheese({ ...cheese, country: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input style={input} placeholder="Milk type" value={cheese.milk} onChange={e => setCheese({ ...cheese, milk: e.target.value })} />
            <input style={input} placeholder="Style" value={cheese.style} onChange={e => setCheese({ ...cheese, style: e.target.value })} />
          </div>
          <input style={input} placeholder="Store purchased at" value={cheese.store} onChange={e => setCheese({ ...cheese, store: e.target.value })} />
          <input style={input} placeholder="Pairing suggestions" value={cheese.pairing} onChange={e => setCheese({ ...cheese, pairing: e.target.value })} disabled />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button style={{ ...btn, opacity: isAdmin ? 1 : 0.6 }} onClick={saveCheese} disabled={!isAdmin || busy}>Save</button>
            <button style={{ ...btn, borderColor: '#c00', color: '#c00', opacity: isAdmin ? 1 : 0.6 }} onClick={delItem} disabled={!isAdmin || busy}>Delete</button>
          </div>
        </div>
              )}
      </div>
    )}
  </div>
);
}

/* ---------- Ratings Editor (admin) ---------- */
function RatingsEditor({
  isAdmin,
  actorId,
  eventId,
  items,
  guests,
  prompts,
}: {
  isAdmin: boolean;
  actorId: number;
  eventId: number;
  items: ItemRow[];
  guests: Guest[];
  prompts: PromptRow[];
}) {
  const [selectedGuest, setSelectedGuest] = useState<number | ''>('');
  const [selectedItem, setSelectedItem] = useState<number | ''>('');
  const [score, setScore] = useState('');
  const [promptId, setPromptId] = useState<number | ''>('');
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const wineItems = useMemo(() => items.filter(i => i.kind === 'wine'), [items]);
  const cheeseItems = useMemo(() => items.filter(i => i.kind === 'cheese'), [items]);

  const input = { border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px', width: '100%', minWidth: 0, boxSizing: 'border-box' } as const;
  const btn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #999', cursor: 'pointer' } as const;

  async function loadExisting() {
    if (!eventId || !selectedGuest || !selectedItem) return;
    try {
      setBusy(true);
      const { data, error } = await supabase
        .from('ratings')
        .select('score, prompt_id, prompt_answer, note')
        .eq('event_id', eventId)
        .eq('guest_id', selectedGuest as number)
        .eq('item_id', selectedItem as number)
        .maybeSingle();
      if (error) throw error;
      setScore(data?.score != null ? String(data.score) : '');
      setPromptId((data?.prompt_id ?? '') as any);
      setAnswer(data?.prompt_answer ?? '');
      setNote(data?.note ?? '');
    } catch (e: any) {
      alert(e.message ?? 'Failed to load rating');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!eventId || !selectedGuest || !selectedItem) { alert('Pick guest and item.'); return; }
    if (!promptId || !answer.trim()) { alert('Prompt and answer are required.'); return; }
    const sNum = Number(score);
    if (!isFinite(sNum) || sNum < 0 || sNum > 5) { alert('Score must be 0–5.'); return; }

    try {
      setBusy(true);
      const { error } = await supabase.rpc('admin_upsert_rating', {
        p_actor_guest_id: actorId,
        p_event_id: eventId,
        p_guest_id: selectedGuest as number,
        p_item_id: selectedItem as number,
        p_score: sNum,
        p_prompt_id: promptId as number,
        p_prompt_answer: answer.trim(),
        p_note: note.trim() || null,
      });
      if (error) throw error;
      alert('Saved.');
    } catch (e: any) {
      alert(e.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0, width: '100%' }}>
      {/* Guest */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Guest</div>
        <select style={input} value={selectedGuest} onChange={e => setSelectedGuest(Number(e.target.value) || '')}>
          <option value="">Select a guest…</option>
          {guests.map(g => <option key={g.id} value={g.id}>{g.name} (#{g.id})</option>)}
        </select>
      </div>

      {/* Item */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Item</div>
        <select style={input} value={selectedItem} onChange={e => setSelectedItem(Number(e.target.value) || '')}>
          <option value="">Select an item…</option>
          <optgroup label="Wines">
            {wineItems.map(w => (
              <option key={w.item_id} value={w.item_id}>
                Wine #{w.number}{w.wine_name ? ` — ${w.wine_name}` : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="Cheeses">
            {cheeseItems.map(c => (
              <option key={c.item_id} value={c.item_id}>
                Cheese #{c.number}{c.cheese_name ? ` — ${c.cheese_name}` : ''}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Load existing */}
      <div>
        <button onClick={loadExisting} style={{ ...btn, opacity: isAdmin ? 1 : 0.6 }} disabled={!isAdmin || busy || !selectedGuest || !selectedItem}>
          Load existing (if any)
        </button>
      </div>

      {/* Score */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Score (0–5)</div>
        <input style={input} type="text" inputMode="decimal" value={score} onChange={e => setScore(e.target.value)} placeholder="0–5" />
      </div>

      {/* Prompt */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Prompt</div>
        <select style={input} value={promptId as any} onChange={e => setPromptId(Number(e.target.value) || '')}>
          <option value="">Select a prompt…</option>
          {prompts.map(p => <option key={p.id} value={p.id}>{p.prompt}</option>)}
        </select>
      </div>

      {/* Answer */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Prompt answer</div>
        <textarea style={{ ...input, minHeight: 90 }} value={answer} onChange={e => setAnswer(e.target.value)} />
      </div>

      {/* Note */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Additional comments (optional)</div>
        <textarea style={{ ...input, minHeight: 70 }} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {/* Save */}
      <div>
        <button onClick={save} style={{ ...btn, opacity: isAdmin ? 1 : 0.6 }} disabled={!isAdmin || busy}>
          Save rating
        </button>
      </div>
    </div>
  );
}

