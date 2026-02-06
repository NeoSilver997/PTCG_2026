import { CardDetailClient } from '@/components/card-detail-client';

export default async function CardDetailPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const { webCardId } = await params;
  return <CardDetailClient webCardId={webCardId} />;
}
