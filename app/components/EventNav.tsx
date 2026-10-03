'use client';

import Link from 'next/link';

type Props = {
  eventName: string | null;
  currentPage: 'items' | 'results' | 'ratings' | 'admin' | 'help';
  revealed: boolean;
  isAdmin: boolean;
};

export default function EventNav({
  eventName,
  currentPage,
  revealed,
  isAdmin,
}: Props) {
  const resultsAvailable = revealed || isAdmin;

  const linkStyle = (active: boolean): React.CSSProperties => ({
    color: '#000',
    fontWeight: active ? 700 : 400,
    textDecoration: active ? 'underline' : 'none',
    textUnderlineOffset: 3,
  });

  const disabledStyle: React.CSSProperties = {
    color: '#aaa',
    textDecoration: 'none',
    cursor: 'default',
  };

  return (
    <div
      style={{
        marginBottom: 26,
        textAlign: 'center',
      }}
    >
      {eventName && (
        <div
          style={{
            fontFamily: "var(--font-limelight), serif",
            fontSize: 28,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          {eventName}
        </div>
      )}

      <nav
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 18,
          fontSize: 14,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/items" style={linkStyle(currentPage === 'items')}>
          Items
        </Link>

        {resultsAvailable ? (
          <Link
            href="/results"
            style={linkStyle(currentPage === 'results')}
          >
            Results
          </Link>
        ) : (
          <span style={disabledStyle}>Results</span>
        )}

        {resultsAvailable ? (
          <Link
            href="/results/detail"
            style={linkStyle(currentPage === 'ratings')}
          >
            All Ratings
          </Link>
        ) : (
          <span style={disabledStyle}>All Ratings</span>
        )}

        {isAdmin && (
          <Link href="/admin" style={linkStyle(currentPage === 'admin')}>
            Admin
          </Link>
        )}
          <Link href="/help" style={linkStyle(currentPage === 'help')}>
            Help
          </Link>
      </nav>
    </div>
  );
}