import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

export default async () => {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const store = getStore('street-faces');
  const catalogue = await store.get('catalogue.json', { type: 'json' });
  if (!catalogue) {
    return Response.json({ message: 'The document library has not been uploaded yet.', items: [] }, { status: 503 });
  }
  return Response.json(catalogue, { headers: { 'Cache-Control': 'private, no-store' } });
};
