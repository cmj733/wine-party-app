'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !code.trim()) {
      setErr('Both fields are required.');
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('join_event', {
        p_code: code.trim(),
        p_name: name.trim(),
      });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Join failed');

      const g = data[0].guest_id;
      const eId = data[0].event_id;
      localStorage.setItem('guestId', String(g));
      localStorage.setItem('eventId', String(eId));

      router.push('/items');
    } catch (e: any) {
      setErr(e.message ?? 'Join failed');
    } finally {
      setLoading(false);
    }
  }

  const input = {
    border: '1px solid #ccc',
    borderRadius: 8,
    padding: '10px 12px',
    width: '100%',
  } as const;

  const btn = {
    background: '#16a34a',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 600,
  } as const;

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Join an Event</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={{ fontWeight: 700 }}>
            Name <span style={{ color: 'red' }}>*</span>
          </label>
          <input
            style={input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            required
          />
        </div>

        <div>
          <label style={{ fontWeight: 700 }}>
            Event code <span style={{ color: 'red' }}>*</span>
          </label>
          <input
            style={input}
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Enter the event code"
            required
          />
        </div>

        <button style={btn} type="submit" disabled={loading}>
          {loading ? 'Joining…' : 'Join'}
        </button>
      </form>
          </main>
  );
}
