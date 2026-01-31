'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-gradient-to-r from-purple-700 to-indigo-800 shadow-lg sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-white">⚙️ PTCG</span>
              <span className="ml-2 text-purple-200">管理後台</span>
            </div>
            <div className="text-purple-200 text-sm">
              <Link href="/cards" className="hover:text-white">
                卡片管理
              </Link>
              {pathname !== '/cards' && (
                <>
                  <span className="mx-2">/</span>
                  <span className="text-white">
                    {pathname.includes('/new') ? '新增卡片' : '編輯卡片'}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/cards"
              className="text-purple-200 hover:text-white px-3 py-2"
            >
              返回列表
            </Link>
            <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg">
              <span className="text-white font-medium">Admin</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
