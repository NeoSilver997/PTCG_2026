'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/cards', label: 'Cards' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/deck-builder', label: 'Deck Builder' },
  { href: '/deck-studio', label: 'Deck Studio' },
  { href: '/battles', label: 'Battles' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/market', label: 'Market' },
  { href: '/admin/scraper-jobs', label: 'Scraper Jobs' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 font-bold text-blue-700 text-lg hover:text-blue-800">
            <span>⚡</span>
            <span>PTCG CardDB</span>
          </Link>
          <div className="flex items-center gap-1 overflow-x-auto">
            {navLinks.map(({ href, label }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
