'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SUPERADMIN_LINKS } from './navigation';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function SuperadminQuickSearch() {
  const [query, setQuery] = useState('');
  const normalized = normalize(query.trim());

  const results = useMemo(
    () =>
      normalized === ''
        ? []
        : SUPERADMIN_LINKS.filter((item) =>
            normalize(`${item.group} ${item.label} ${item.href}`).includes(normalized),
          ).slice(0, 8),
    [normalized],
  );

  return (
    <div className="relative">
      <label htmlFor="superadmin-quick-search" className="sr-only">
        Ir a una sección
      </label>
      <input
        id="superadmin-quick-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ir a…"
        autoComplete="off"
        className="min-h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
      {normalized !== '' && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--color-ink-soft)]">No hay coincidencias.</p>
          ) : (
            <ul>
              {results.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setQuery('')}
                    className="block px-3 py-2 text-sm hover:bg-[var(--color-indigo-50)]"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-2 text-xs text-[var(--color-ink-soft)]">{item.group}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
