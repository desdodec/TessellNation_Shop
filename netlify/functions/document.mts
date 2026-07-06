import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

type CatalogueItem = { key: string; title: string; filename: string; size: number };
type Catalogue = { items: CatalogueItem[] };

export default async (request: Request) => {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing document key', { status: 400 });

  const store = getStore('street-faces');
  const catalogue = await store.get('catalogue.json', { type: 'json' }) as Catalogue | null;
  const item = catalogue?.items.find((candidate) => candidate.key === key);
  if (!item) return new Response('Document not found', { status: 404 });

  const document = await store.get(key, { type: 'blob' });
  if (!document) return new Response('Document not found', { status: 404 });

  const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const safeFilename = item.filename.replace(/["\r\n]/g, '');
  return new Response(document, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(item.size),
      'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
