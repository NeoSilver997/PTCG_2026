'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();
  const isCardsRoute = pathname.startsWith('/cards');
  const isProductsRoute = pathname.startsWith('/products');
  const isDeckBuilderRoute = pathname.startsWith('/deck-builder');
  const isDeckStudioRoute = pathname.startsWith('/deck-studio');
  const breadcrumbLabel = isCardsRoute
    ? pathname.endsWith('/new')
      ? '新增卡片'
      : pathname.endsWith('/edit')
        ? '編輯卡片'
        : pathname === '/cards'
          ? ''
          : '卡片詳情'
    : isProductsRoute
    ? pathname.endsWith('/edit')
      ? '編輯商品'
      : pathname === '/products'
        ? ''
        : '商品詳情'
    : '';

  return (
    <nav className="bg-gradient-to-r from-purple-700 to-indigo-800 shadow-lg sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-white">⚙️ PTCG</span>
              <span className="ml-2 text-purple-200">管理後台</span>
            </div>
            <div className="text-purple-200 text-sm flex items-center gap-4">
              <Link
                href="/cards"
                className={isCardsRoute ? 'text-white font-semibold' : 'hover:text-white'}
              >
                卡片管理
              </Link>
              <Link
                href="/products"
                className={isProductsRoute ? 'text-white font-semibold' : 'hover:text-white'}
              >
                商品管理
              </Link>
              <Link
                href="/deck-builder/tournaments"
                className={isDeckBuilderRoute ? 'text-white font-semibold' : 'hover:text-white'}
              >
                賽事牌組
              </Link>
              <Link
                href="/deck-studio"
                className={isDeckStudioRoute ? 'text-white font-semibold' : 'hover:text-white'}
              >
                Deck Studio
              </Link>
              {breadcrumbLabel && (
                <span className="text-white">
                  / {breadcrumbLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {(isCardsRoute && pathname !== '/cards') || (isProductsRoute && pathname !== '/products') ? (
              <Link
                href={isCardsRoute ? "/cards" : "/products"}
                className="text-purple-200 hover:text-white px-3 py-2"
              >
                返回列表
              </Link>
            ) : null}
            <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg">
              <span className="text-white font-medium">Admin</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
