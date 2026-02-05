'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';

interface Product {
  id: string;
  country: string;
  productName: string;
  price: string | null;
  releaseDate: string | null;
  code: string | null;
  productType: string | null;
  imageUrl: string | null;
  link: string | null;
}

interface ProductsResponse {
  data: Product[];
  pagination: {
    total: number;
    skip: number;
    take: number;
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [country, setCountry] = useState('');
  const [productType, setProductType] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const take = 50;

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (country) params.append('country', country);
      if (productType) params.append('productType', productType);
      if (search) params.append('search', search);
      params.append('skip', skip.toString());
      params.append('take', take.toString());

      const response = await apiClient.get<ProductsResponse>(
        `/products?${params.toString()}`
      );
      
      setProducts(response.data.data);
      setTotal(response.data.pagination.total);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [country, productType, search, skip]);

  const handleReset = () => {
    setCountry('');
    setProductType('');
    setSearch('');
    setSkip(0);
  };

  const totalPages = Math.ceil(total / take);
  const currentPage = Math.floor(skip / take) + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">商品瀏覽</h1>
          <p className="text-gray-600 mt-1">
            共 {total} 件商品
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">篩選條件</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Country Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">國家地區</label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setSkip(0);
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有地區</option>
              <option value="Japan">日本</option>
              <option value="Hong Kong (EN)">香港 (英文)</option>
              <option value="Hong Kong (ZH)">香港 (中文)</option>
            </select>
          </div>

          {/* Product Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">商品類型</label>
            <select
              value={productType}
              onChange={(e) => {
                setProductType(e.target.value);
                setSkip(0);
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有類型</option>
              <option value="拡張パック">拡張パック (Expansion Pack)</option>
              <option value="強化拡張パック">強化拡張パック (Enhanced Expansion)</option>
              <option value="スターターセット">スターターセット (Starter Set)</option>
              <option value="デッキ">デッキ (Deck)</option>
              <option value="周辺グッズ">周辺グッズ (Accessories)</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSkip(0);
              }}
              placeholder="搜尋商品名稱..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Reset Button */}
          <div className="flex items-end">
            <button
              onClick={handleReset}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              重置篩選
            </button>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          顯示 {products.length} / {total} 件商品
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-600">載入中...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">找不到商品</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow block overflow-hidden"
              >
                <div className="aspect-[2.5/3.5] bg-gray-100 relative">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.productName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      No Image
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {product.country}
                    </span>
                    {product.price && (
                      <span className="text-sm font-bold text-green-600">
                        {product.price}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900 mb-2 line-clamp-2" title={product.productName}>
                    {product.productName}
                  </h3>
                  {product.code && (
                    <p className="text-xs text-gray-500 mb-1">編號: {product.code}</p>
                  )}
                  {product.releaseDate && (
                    <p className="text-xs text-gray-500 mb-2">
                      發售日期: {product.releaseDate}
                    </p>
                  )}
                  {product.productType && (
                    <p className="text-xs text-gray-600 mb-3">
                      {product.productType}
                    </p>
                  )}
                  {product.link && (
                    <a
                      href={product.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      查看詳情 →
                    </a>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8 flex justify-center items-center gap-4">
            <button
              onClick={() => setSkip(Math.max(0, skip - take))}
              disabled={skip === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              上一頁
            </button>
            <span className="text-sm text-gray-700">
              第 {currentPage} 頁，共 {totalPages} 頁
            </span>
            <button
              onClick={() => setSkip(skip + take)}
              disabled={skip + take >= total}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              下一頁
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
