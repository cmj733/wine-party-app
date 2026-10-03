'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import EventNav from '../components/EventNav';

export default function HelpPage() {
  const router = useRouter();

  const [eventName, setEventName] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const g = Number(localStorage.getItem('guestId'));
    const e = Number(localStorage.getItem('eventId'));

    if (!g || !e) {
      router.push('/join');
      return;
    }

    (async () => {
      try {
        setLoading(true);

        const [
          { data: flags, error: flagsErr },
          { data: me, error: meErr },
        ] = await Promise.all([
          supabase.rpc('get_event_flags_for_guest', {
            p_guest_id: g,
          }),
          supabase
            .from('guests')
            .select('name, is_admin')
            .eq('id', g)
            .maybeSingle(),
        ]);

        if (flagsErr) throw flagsErr;
        if (meErr) throw meErr;

        const f = flags?.[0];

        setEventName(f?.event_name ?? null);
        setIsRevealed(!!f?.revealed);
        setIsAdmin(!!me?.is_admin);
        setGuestName(me?.name ?? null);
      } catch (e: any) {
        alert(e.message ?? 'Failed to load Help page');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function handleSignOutToNewUser(e: React.MouseEvent) {
    e.preventDefault();

    if (
      !confirm(
        'Sign in as a different user?\n\nThis will clear your current sign-in from this browser.'
      )
    ) {
      return;
    }

    localStorage.removeItem('guestId');
    localStorage.removeItem('eventId');
    localStorage.setItem('forceJoin', '1');

    router.push('/join');
  }

  const pageWrap = {
    maxWidth: 940,
    margin: '32px auto',
    padding: 16,
  } as const;

  const helpLink = {
    display: 'block',
    width: 'fit-content',
    fontSize: 14,
    color: '#555',
    textDecoration: 'underline',
    cursor: 'pointer',
  } as const;

  return (
    <main style={pageWrap}>
      <EventNav
        eventName={eventName}
        currentPage="help"
        revealed={isRevealed}
        isAdmin={isAdmin}
      />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: '#555',
              }}
            >
              Signed in as:{' '}
              <strong style={{ color: '#222' }}>
                {guestName ?? 'Unknown'}
              </strong>
            </div>

<div
  style={{
    fontSize: 14,
    color: '#555',
  }}
>
  Admin access:{' '}
  <strong style={{ color: '#222' }}>
    {isAdmin ? 'Yes' : 'No'}
  </strong>
</div>

            <a
              href="#"
              onClick={handleSignOutToNewUser}
              style={helpLink}
            >
              Sign in as a new user
            </a>
          </div>
        </>
      )}
    </main>
  );
}