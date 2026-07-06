import { acceptInvite, getUser, handleAuthCallback, login, logout } from '@netlify/identity';
import JSZip from 'jszip';

const $ = (selector) => document.querySelector(selector);
const state = { items: [], filtered: [], selected: new Set(), previewItem: null, previewUrl: null, inviteToken: null };
const authPanel = $('#auth-panel');
const library = $('#library');
const account = $('#account');
const grid = $('#artwork-grid');
const message = $('#library-message');

const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

async function authenticatedFetch(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (response.status === 401) {
    await showLoggedOut('Your session has expired. Please sign in again.');
    throw new Error('Session expired');
  }
  return response;
}

async function loadCatalogue() {
  setNotice('Loading your private library…');
  const response = await authenticatedFetch('/.netlify/functions/catalogue');
  if (!response.ok) throw new Error('The document catalogue could not be loaded.');
  state.items = (await response.json()).items || [];
  $('#total-count').textContent = state.items.length.toLocaleString('en-GB');
  const letters = [...new Set(state.items.map((item) => item.title[0]?.toUpperCase()).filter(Boolean))].sort();
  $('#letter-filter').insertAdjacentHTML('beforeend', letters.map((letter) => `<option value="${letter}">${letter}</option>`).join(''));
  filterItems();
  clearNotice();
}

function filterItems() {
  const query = normaliseSearch($('#search').value);
  const letter = $('#letter-filter').value;
  const direction = $('#sort-order').value;
  state.filtered = state.items
    .filter((item) => !query || normaliseSearch(item.title).includes(query))
    .filter((item) => !letter || item.title.toUpperCase().startsWith(letter))
    .sort((a, b) => direction === 'az' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
  renderItems();
}

function normaliseSearch(value) {
  return String(value || '').trim().toLocaleLowerCase('en-GB').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function renderItems() {
  $('#result-count').textContent = `${state.filtered.length.toLocaleString('en-GB')} ${state.filtered.length === 1 ? 'artwork' : 'artworks'} shown`;
  if (!state.filtered.length) {
    grid.innerHTML = '<div class="notice">No streets match that search. Try a shorter name or choose a different letter.</div>';
    return;
  }
  grid.innerHTML = state.filtered.map((item) => {
    const selected = state.selected.has(item.key);
    return `<article class="artwork-card${selected ? ' selected' : ''}" data-key="${escapeHtml(item.key)}">
      <div class="card-top"><input class="card-check" type="checkbox" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.title)}"><div><h2>${escapeHtml(item.title)}</h2><span class="artwork-meta">PDF · ${formatBytes(item.size)}</span></div></div>
      <div class="card-actions"><button data-action="preview" type="button">Preview</button><button data-action="download" type="button">Download PDF</button></div>
    </article>`;
  }).join('');
}

function toggleSelection(item, force) {
  const shouldSelect = force ?? !state.selected.has(item.key);
  if (shouldSelect && state.selected.size >= 25) {
    setNotice('You can add up to 25 files to one ZIP. Download this selection, then begin another.');
    return;
  }
  shouldSelect ? state.selected.add(item.key) : state.selected.delete(item.key);
  renderItems(); updateTray();
}

function updateTray() {
  const items = state.items.filter((item) => state.selected.has(item.key));
  $('#selection-count').textContent = items.length;
  $('#selection-size').textContent = formatBytes(items.reduce((sum, item) => sum + item.size, 0));
  $('#selection-tray').hidden = !items.length;
}

function itemForElement(element) {
  const card = element.closest('[data-key]');
  return state.items.find((item) => item.key === card?.dataset.key);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadItem(item) {
  const response = await authenticatedFetch(`/.netlify/functions/document?key=${encodeURIComponent(item.key)}&download=1`);
  if (!response.ok) throw new Error(`Could not download ${item.title}.`);
  saveBlob(await response.blob(), item.filename);
}

async function openPreview(item) {
  state.previewItem = item;
  $('#preview-title').textContent = item.title;
  $('#preview-stage').innerHTML = '<div class="preview-loading">Loading secure preview…</div>';
  $('#preview-select').textContent = state.selected.has(item.key) ? 'Remove from selection' : 'Add to selection';
  $('#preview-dialog').showModal();
  try {
    const response = await authenticatedFetch(`/.netlify/functions/document?key=${encodeURIComponent(item.key)}`);
    if (!response.ok) throw new Error(`Could not preview ${item.title}.`);
    state.previewUrl = URL.createObjectURL(await response.blob());
    $('#preview-stage').innerHTML = `<iframe title="Preview of ${escapeHtml(item.title)}" src="${state.previewUrl}"></iframe>`;
  } catch (error) {
    $('#preview-dialog').close();
    setNotice(error.message);
  }
}

async function downloadZip() {
  const items = state.items.filter((item) => state.selected.has(item.key));
  if (!items.length) return;
  const button = $('#download-zip'); button.disabled = true;
  try {
    const zip = new JSZip(); let completed = 0;
    for (const item of items) {
      button.textContent = `Preparing ${++completed}/${items.length}`;
      const response = await authenticatedFetch(`/.netlify/functions/document?key=${encodeURIComponent(item.key)}&download=1`);
      if (!response.ok) throw new Error(`Could not add ${item.title} to the ZIP.`);
      zip.file(item.filename, await response.blob());
    }
    button.textContent = 'Creating ZIP…';
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } }), 'tessellnation-street-faces.zip');
  } catch (error) { setNotice(error.message); }
  finally { button.disabled = false; button.textContent = 'Download ZIP'; }
}

function setNotice(text) { message.textContent = text; message.hidden = false; }
function clearNotice() { message.hidden = true; message.textContent = ''; }

async function showLoggedIn(user) {
  authPanel.hidden = true; library.hidden = false; account.hidden = false; account.style.display = 'flex';
  $('#user-email').textContent = user.email; await loadCatalogue();
}
async function showLoggedOut(text = '') {
  authPanel.hidden = false; library.hidden = true; account.hidden = true; account.style.display = '';
  state.inviteToken = null;
  $('#email-label').hidden = false;
  $('#email').required = true;
  $('#password').autocomplete = 'current-password';
  $('#login-button').textContent = 'Sign in';
  $('#login-message').textContent = text;
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-message').textContent = 'Signing in…';
  try {
    let user;
    if (state.inviteToken) {
      const password = $('#password').value;
      const invitedUser = await acceptInvite(state.inviteToken, password);
      // acceptInvite persists the GoTrue session, but login also synchronises
      // Netlify's nf_jwt cookie used by protected serverless functions.
      user = invitedUser.email ? await login(invitedUser.email, password) : invitedUser;
    } else {
      user = await login($('#email').value.trim(), $('#password').value);
    }
    state.inviteToken = null;
    await showLoggedIn(user);
  }
  catch (error) { $('#login-message').textContent = error?.message || 'Sign-in failed. Check your email and password.'; }
  finally { button.disabled = false; }
});
$('#logout-button').addEventListener('click', async () => { await logout(); await showLoggedOut('You have signed out.'); });
$('#search').addEventListener('input', () => {
  // Free-text search is global and should not be silently constrained by a previous letter choice.
  $('#letter-filter').value = '';
  filterItems();
});
$('#letter-filter').addEventListener('change', filterItems); $('#sort-order').addEventListener('change', filterItems);
grid.addEventListener('change', (event) => { if (event.target.matches('.card-check')) toggleSelection(itemForElement(event.target), event.target.checked); });
grid.addEventListener('click', async (event) => {
  const item = itemForElement(event.target); if (!item) return;
  if (event.target.dataset.action === 'preview') await openPreview(item);
  if (event.target.dataset.action === 'download') try { await downloadItem(item); } catch (error) { setNotice(error.message); }
});
$('#select-visible').addEventListener('click', () => {
  for (const item of state.filtered) { if (state.selected.size >= 25) break; state.selected.add(item.key); }
  renderItems(); updateTray(); if (state.filtered.length > 25) setNotice('The first 25 visible files were selected, which is the maximum for one ZIP.');
});
$('#clear-selection').addEventListener('click', () => { state.selected.clear(); renderItems(); updateTray(); clearNotice(); });
$('#download-zip').addEventListener('click', downloadZip); $('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('close', () => {
  $('#preview-stage').innerHTML = '';
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  state.previewItem = null;
});
$('#preview-select').addEventListener('click', () => { if (state.previewItem) { toggleSelection(state.previewItem); $('#preview-select').textContent = state.selected.has(state.previewItem.key) ? 'Remove from selection' : 'Add to selection'; } });
$('#preview-download').addEventListener('click', async () => { if (state.previewItem) await downloadItem(state.previewItem); });

async function initialise() {
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite' && callback.token) {
      state.inviteToken = callback.token;
      $('#email-label').hidden = true;
      $('#email').required = false;
      $('#password').autocomplete = 'new-password';
      $('#login-button').textContent = 'Create account';
      $('#login-message').textContent = 'Choose a password of at least 10 characters to accept your invitation.';
      return;
    }
  } catch (error) { $('#login-message').textContent = error.message; }
  const user = await getUser();
  if (user) try { await showLoggedIn(user); } catch (error) { setNotice(error.message); }
  else await showLoggedOut();
}
initialise();
