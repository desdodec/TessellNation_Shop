import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { getStore } from '@netlify/blobs';

const siteID = process.env.NETLIFY_SITE_ID || '488a325a-2bf6-4078-ba4b-59f7e637ef2d';
const token = process.env.NETLIFY_AUTH_TOKEN;
const sourceDirectory = resolve(process.env.PDF_SOURCE_DIR || 'E:\\street_faces\\pdfs');

if (!token) {
  console.error('NETLIFY_AUTH_TOKEN is required. Set it for this terminal session before running the uploader.');
  process.exit(1);
}

function titleFromFilename(filename) {
  const stem = basename(filename, extname(filename));
  const marked = stem.includes('_roads_gallery_street_') ? stem.split('_roads_gallery_street_')[1] : stem;
  const street = marked.includes('_road_types_') ? marked.split('_road_types_')[0] : marked;
  return street.split('_').filter(Boolean).map((word) => {
    if (word === 's') return "'s";
    if (word === 'st') return 'St';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ').replace(/ 's\b/g, "'s");
}

async function findPdfs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findPdfs(path));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') found.push(path);
  }
  return found;
}

const files = (await findPdfs(sourceDirectory)).sort((a, b) => a.localeCompare(b));
if (!files.length) {
  console.error(`No PDFs found in ${sourceDirectory}`);
  process.exit(1);
}

const store = getStore({ name: 'street-faces', siteID, token });
const items = [];
let totalBytes = 0;

for (const [index, path] of files.entries()) {
  const data = await readFile(path);
  const filename = basename(path);
  const key = `documents/${createHash('sha256').update(filename).digest('hex').slice(0, 16)}.pdf`;
  const title = titleFromFilename(filename);
  const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  await store.set(key, body, { metadata: { filename, title, contentType: 'application/pdf' } });
  items.push({ key, title, filename, size: data.byteLength });
  totalBytes += data.byteLength;
  console.log(`[${index + 1}/${files.length}] ${title}`);
}

items.sort((a, b) => a.title.localeCompare(b.title));
await store.setJSON('catalogue.json', { generatedAt: new Date().toISOString(), totalBytes, items });
console.log(`Uploaded ${items.length} PDFs (${(totalBytes / 1048576).toFixed(2)} MB).`);
