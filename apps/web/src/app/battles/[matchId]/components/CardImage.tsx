'use client';

import { useState } from 'react';
import Image from 'next/image';

interface CardImageProps {
  webCardId?: string;
  cardName: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showFallback?: boolean;
}

const sizeMap = {
  small: { width: 96, height: 128 },
  medium: { width: 160, height: 224 },
  large: { width: 240, height: 336 },
};

export function CardImage({ 
  webCardId, 
  cardName, 
  size = 'medium',
  className = '',
  showFallback = true 
}: CardImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  const { width, height } = sizeMap[size];
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  if (!webCardId || imageError) {
    if (!showFallback) return null;
    
    return (
      <div 
        className={`bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <span className="text-white text-center font-bold p-2 drop-shadow-lg text-sm">
          {cardName}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {imageLoading && (
        <div 
          className="absolute inset-0 bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center"
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      )}
      <Image
        src={`${apiUrl}/storage/cards/${webCardId}/image`}
        alt={cardName}
        width={width}
        height={height}
        className="rounded-lg object-cover"
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
        priority={size === 'large'}
      />
    </div>
  );
}
