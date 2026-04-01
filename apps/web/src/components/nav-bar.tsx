'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/cards',       label: 'Cards' },
  { href: '/pokemon',     label: 'Pokédex' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/deck-builder', label: 'Deck Builder' },
  { href: '/deck-studio', label: 'Deck Studio' },
  { href: '/battles',     label: 'Battles' },
  { href: '/browse',      label: 'Browse' },
  { href: '/inventory',   label: 'Inventory' },
  { href: '/market',      label: 'Market' },
  { href: '/products',    label: 'Products' },
  { href: '/admin/scraper-jobs', label: 'Scraper' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 shadow-sm">
      <div className="max-w-[1920px] mx-auto px-4">
        <div className="flex items-center gap-4 h-10">
          <Link href="/" className="flex items-center gap-1.5 font-bold text-blue-400 text-sm whitespace-nowrap hover:text-blue-300 flex-shrink-0">
            <span>⚡</span>
            <span>PTCG</span>
          </Link>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1">
            {navLinks.map(({ href, label }) => {
              const active = pathname === href || (href !== '/' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
