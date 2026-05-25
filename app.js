// ── Auth System ────────────────────────────────────────────────────────────────

function getUsers() {
  try { return JSON.parse(localStorage.getItem('lbl_users') || '[]'); } catch { return []; }
}
function saveUsers(u) { localStorage.setItem('lbl_users', JSON.stringify(u)); }
function getSession() {
  try { return JSON.parse(localStorage.getItem('lbl_session') || 'null'); } catch { return null; }
}
function saveSession(s) { localStorage.setItem('lbl_session', JSON.stringify(s)); }

function hashPw(pw) {
  return btoa(unescape(encodeURIComponent(pw + '_lbl_2026')));
}

function authLogin(email, password) {
  const user = getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { ok: false, error: 'No account found with that email.' };
  if (user.passwordHash !== hashPw(password)) return { ok: false, error: 'Incorrect password.' };
  const session = { userId: user.id, email: user.email, name: user.name, features: user.features };
  saveSession(session);
  return { ok: true, session };
}

function authRegister(name, email, password) {
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return { ok: false, error: 'An account with that email already exists.' };
  const user = {
    id: Date.now().toString(), name: name.trim(),
    email: email.toLowerCase().trim(), passwordHash: hashPw(password),
    features: [], plan: 'free', createdAt: new Date().toISOString()
  };
  users.push(user); saveUsers(users);
  return { ok: true, user };
}

function updateUserFeatures(userId, features) {
  const users = getUsers();
  const u = users.find(u => u.id === userId);
  if (u) { u.features = features; saveUsers(users); }
}

function logout() { localStorage.removeItem('lbl_session'); location.reload(); }

// ── Inventory Persistence ──────────────────────────────────────────────────────

const FREE_COMIC_LIMIT = 10;
let currentUserId = null;

function getInventoryKey(uid) { return 'lbl_inv_' + uid; }

function saveInventory() {
  if (!currentUserId) return;
  try { localStorage.setItem(getInventoryKey(currentUserId), JSON.stringify(comics)); } catch(e) {}
  // Debounced server sync (3s after last change)
  const session = getSession();
  if (session?.token) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncInventoryToServer(session.token), 3000);
  }
}

function loadInventory() {
  if (!currentUserId) return;
  try {
    const raw = localStorage.getItem(getInventoryKey(currentUserId));
    if (raw) comics = JSON.parse(raw);
  } catch(e) { comics = []; }
}

// ── Price Cache ────────────────────────────────────────────────────────────────

const PRICE_CACHE_TTL = 24 * 60 * 60 * 1000;

function getPriceCacheKey(uid) { return 'lbl_pcache_' + uid; }

function getPriceCache() {
  if (!currentUserId) return {};
  try { return JSON.parse(localStorage.getItem(getPriceCacheKey(currentUserId)) || '{}'); } catch { return {}; }
}

function savePriceCache(cache) {
  if (!currentUserId) return;
  try { localStorage.setItem(getPriceCacheKey(currentUserId), JSON.stringify(cache)); } catch {}
}

function getCachedPrice(query) {
  const cache = getPriceCache();
  const entry = cache[query];
  if (!entry) return null;
  if (Date.now() - entry.ts > PRICE_CACHE_TTL) return null;
  return entry.data;
}

function setCachedPrice(query, data) {
  const cache = getPriceCache();
  cache[query] = { ts: Date.now(), data };
  const keys = Object.keys(cache);
  if (keys.length > 500) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, 100).forEach(k => delete cache[k]);
  }
  savePriceCache(cache);
}

function clearPriceCacheForComics(comicList) {
  const cache = getPriceCache();
  comicList.forEach(c => { if (c.searchQuery) delete cache[c.searchQuery]; });
  savePriceCache(cache);
}

// ── Auth UI state ──────────────────────────────────────────────────────────────

let authMode = 'login';
let pendingUser = null;
let selectedFeatures = new Set(['export', 'lookup']);

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-form-login').style.display = mode === 'login' ? 'flex' : 'none';
  document.getElementById('auth-form-register').style.display = mode === 'register' ? 'flex' : 'none';
  document.getElementById('auth-form-features').style.display = mode === 'features' ? 'flex' : 'none';
  document.getElementById('auth-tabs').style.display = mode === 'features' ? 'none' : 'flex';
  document.querySelectorAll('.auth-error').forEach(el => el.classList.remove('show'));
}

function showAuthErr(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-password').value;
  if (!email || !pw) { showAuthErr('login-error', 'Please fill in all fields.'); return; }
  const btn = document.querySelector('#auth-form-login .auth-submit');
  btn.disabled = true; btn.textContent = '⟳ Signing in...';
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password: pw })
    });
    const data = await res.json();
    if (!res.ok) {
      // Server doesn't know this account yet — try local and auto-migrate
      const local = authLogin(email, pw);
      if (local.ok) {
        const regRes = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'register', name: local.session.name, email, password: pw })
        });
        if (regRes.ok) {
          const reg = await regRes.json();
          const session = { userId: reg.userId, email: reg.email, name: reg.name, features: local.session.features, plan: reg.plan, token: reg.token };
          saveSession(session);
          // Migrate local inventory under old userId to server under new userId
          const oldInv = JSON.parse(localStorage.getItem(getInventoryKey(local.session.userId)) || '[]');
          if (oldInv.length) { currentUserId = reg.userId; comics = oldInv; saveInventory(); syncInventoryToServer(reg.token); }
          activateApp(session);
          return;
        }
      }
      showAuthErr('login-error', data.error || 'Login failed'); return;
    }
    const session = { userId: data.userId, email: data.email, name: data.name, features: data.features, plan: data.plan, token: data.token };
    saveSession(session);
    activateApp(session);
  } catch (e) {
    // Offline fallback — use local auth
    const local = authLogin(email, pw);
    if (local.ok) { activateApp(local.session); }
    else { showAuthErr('login-error', 'Connection error. Check your internet and try again.'); }
  } finally {
    btn.disabled = false; btn.textContent = '→ Authenticate';
  }
}

async function doRegister() {
  const name    = document.getElementById('reg-name').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const pw      = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  if (!name || !email || !pw) { showAuthErr('reg-error', 'Please fill in all fields.'); return; }
  if (pw !== confirm) { showAuthErr('reg-error', 'Passwords do not match.'); return; }
  if (pw.length < 6) { showAuthErr('reg-error', 'Password must be at least 6 characters.'); return; }
  const btn = document.querySelector('#auth-form-register .auth-submit');
  btn.disabled = true; btn.textContent = '⟳ Creating account...';
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, email, password: pw })
    });
    const data = await res.json();
    if (!res.ok) { showAuthErr('reg-error', data.error || 'Registration failed'); return; }
    pendingUser = { id: data.userId, name: data.name, email: data.email, token: data.token, plan: data.plan };
    selectedFeatures = new Set(['export', 'lookup']);
    renderFeatureCards();
    switchAuthMode('features');
  } catch (e) {
    // Offline fallback — create local-only account
    const r = authRegister(name, email, pw);
    if (!r.ok) { showAuthErr('reg-error', r.error); return; }
    pendingUser = r.user;
    selectedFeatures = new Set(['export', 'lookup']);
    renderFeatureCards();
    switchAuthMode('features');
  } finally {
    btn.disabled = false; btn.textContent = '→ Continue';
  }
}

function toggleFeature(f) {
  if (selectedFeatures.has(f)) selectedFeatures.delete(f);
  else selectedFeatures.add(f);
  renderFeatureCards();
}

function renderFeatureCards() {
  document.getElementById('feat-export').classList.toggle('selected', selectedFeatures.has('export'));
  document.getElementById('feat-lookup').classList.toggle('selected', selectedFeatures.has('lookup'));
}

function doSelectFeatures() {
  if (!selectedFeatures.size) { showAuthErr('feat-error', 'Please select at least one option.'); return; }
  const features = Array.from(selectedFeatures);
  updateUserFeatures(pendingUser.id, features);
  const session = { userId: pendingUser.id, email: pendingUser.email, name: pendingUser.name, features, plan: pendingUser.plan || 'free', token: pendingUser.token || null };
  saveSession(session);
  activateApp(session);
}

function goToAuth(mode) {
  document.getElementById('landing-screen').style.display = 'none';
  const authEl = document.getElementById('auth-screen');
  authEl.style.display = 'flex';
  if (mode === 'register') switchAuthMode('register');
  else switchAuthMode('login');
}

function goToLanding() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('landing-screen').style.display = 'flex';
}

async function activateApp(session) {
  currentUserId = session.userId;
  document.getElementById('landing-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'none';
  const app = document.getElementById('main-app');
  app.style.display = 'flex';
  app.style.flexDirection = 'column';
  app.style.flex = '1';
  app.style.minHeight = '0';
  loadInventory(); // local cache first (instant)
  applyFeatureRestrictions(session.features);
  renderHeaderUser(session);
  renderList();
  updateStats();
  if (isMobile()) { switchMobileTab('scan'); initMobileSwipe(); initHaptic(); }

  // If we have a server token, pull the authoritative inventory in the background
  if (session.token) {
    try {
      const res = await fetch('/api/sync', { headers: { 'Authorization': `Bearer ${session.token}` } });
      if (res.ok) {
        const { inventory: serverInv } = await res.json();
        if (serverInv.length > 0) {
          // Restore local thumbnails where we have them
          const localMap = new Map(comics.map(c => [c.id, c]));
          comics = serverInv.map(sc => {
            const lc = localMap.get(sc.id);
            return lc?.thumb ? { ...sc, thumb: lc.thumb } : sc;
          });
          saveInventory();
          renderList(); updateStats();
        }
      }
    } catch (_) { /* offline — use local cache */ }
  }
}

let syncTimer = null;
async function syncInventoryToServer(token) {
  try {
    const toStore = comics.map(({ thumb, ...rest }) => rest);
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ inventory: toStore })
    });
  } catch (_) { /* silently ignore — localStorage is the fallback */ }
}

function applyFeatureRestrictions(features) {
  const hasExport = features.includes('export');
  const hasLookup = features.includes('lookup');
  if (hasExport && hasLookup) return;

  if (hasExport && !hasLookup) {
    const lb = document.getElementById('tab-btn-lookup');
    if (lb) lb.style.display = 'none';
    const ml = document.getElementById('mnav-lookup');
    if (ml) ml.style.display = 'none';
    switchTab('export');
  }

  if (hasLookup && !hasExport) {
    const eb = document.getElementById('tab-btn-export');
    if (eb) eb.style.display = 'none';
    const ms = document.getElementById('mnav-scan');
    const mi = document.getElementById('mnav-inventory');
    if (ms) ms.style.display = 'none';
    if (mi) mi.style.display = 'none';
    switchTab('lookup');
  }
}

function renderHeaderUser(session) {
  const el = document.getElementById('header-user-area');
  if (!el) return;
  const labels = session.features.map(f => f === 'export' ? 'Export' : 'Lookup').join(' + ');
  const userIsPro = session.plan === 'pro';
  el.innerHTML = `
    <button class="user-chip-btn" onclick="showSettings()">
      <span style="color:var(--amber)">◆</span>
      ${escapeHtml(session.name)}
      ${userIsPro ? '<span class="pro-chip">Pro</span>' : ''}
      <span style="color:var(--dim)">·</span>
      <span style="color:var(--dim)">${escapeHtml(labels)}</span>
    </button>
    <button class="btn-logout" onclick="logout()">Logout</button>
  `;
}

// ── Main App Init ─────────────────────────────────────────────────────────────
// (DOMContentLoaded is at the bottom of this script; auth check runs there)

// ─────────────────────────────────────────────────────────────────────────────
const MAX_PHOTOS = 150;

let stream = null;
let capturedBase64 = null;
let capturedThumb = null;
let pendingPhotos = [];
let comics = [];
let editingPriceId = null;

// Sort / filter
let sortMode = 'newest';
let filterMode = 'all';
let publisherFilter = '';

// Select / bundle
let selectMode = false;
let selectedIds = new Set();

// Re-scan
let rescanTargetId = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const previewImg = document.getElementById('preview-img');

// ── Camera ───────────────────────────────────────────────────────────────────

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    video.srcObject = stream;
    video.style.display = 'block';
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('capture-btn').disabled = false;
    document.getElementById('start-cam-btn').disabled = true;
    document.getElementById('start-cam-btn').textContent = '✓ Active';
  } catch (e) {
    showStatus('scan-status', 'error', '✗ Camera error: ' + escapeHtml(e.message));
  }
}

function capturePhoto() {
  if (pendingPhotos.length >= MAX_PHOTOS) {
    showStatus('scan-status', 'warn', `✗ Maximum ${MAX_PHOTOS} photos reached. Scan the current batch first.`);
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const compressed = compressCanvasToDataUrl(canvas, 1200, 0.75);
  const thumb = document.createElement('canvas');
  thumb.width = 88; thumb.height = 120;
  thumb.getContext('2d').drawImage(canvas, 0, 0, 88, 120);

  addPendingPhoto({
    base64: compressed.split(',')[1],
    thumb: thumb.toDataURL('image/jpeg', 0.7),
    preview: compressed,
    source: 'camera'
  });

  previewImg.src = compressed;
  previewImg.style.display = 'block';
  video.style.display = 'none';
  document.getElementById('capture-btn').style.display = 'none';
  document.getElementById('retake-btn').style.display = 'inline-flex';
  document.getElementById('scan-btn').disabled = pendingPhotos.length === 0;
  showStatus('scan-status', 'success', `📷 Photo added (${pendingPhotos.length} queued). Capture another or Identify & Add All.`);
}

function retakePhoto() {
  capturedBase64 = null; capturedThumb = null;
  previewImg.style.display = 'none';
  video.style.display = 'block';
  document.getElementById('capture-btn').style.display = 'inline-flex';
  document.getElementById('retake-btn').style.display = 'none';
  document.getElementById('scan-btn').disabled = pendingPhotos.length === 0;
  document.getElementById('scan-status').className = 'status';
}

function compressCanvasToDataUrl(sourceCanvas, maxWidth = 1200, quality = 0.75) {
  const scale = sourceCanvas.width > maxWidth ? maxWidth / sourceCanvas.width : 1;
  const out = document.createElement('canvas');
  out.width = Math.round(sourceCanvas.width * scale);
  out.height = Math.round(sourceCanvas.height * scale);
  out.getContext('2d').drawImage(sourceCanvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', quality);
}

function dataURLToBlob(dataURL) {
  const [meta, base64] = dataURL.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function addPendingPhoto(photo) {
  pendingPhotos.push(photo);
  capturedBase64 = photo.base64;
  capturedThumb = photo.thumb;
  renderPendingPhotos();
}

function removePendingPhoto(index) {
  pendingPhotos.splice(index, 1);
  renderPendingPhotos();
  document.getElementById('scan-btn').disabled = pendingPhotos.length === 0;
}

function clearPendingPhotos() {
  pendingPhotos = []; capturedBase64 = null; capturedThumb = null;
  previewImg.style.display = 'none';
  renderPendingPhotos();
  document.getElementById('scan-btn').disabled = true;
}

function renderPendingPhotos() {
  const grid = document.getElementById('pending-grid');
  const caption = document.getElementById('pending-caption');
  if (!pendingPhotos.length) {
    grid.innerHTML = '';
    caption.textContent = 'No photos queued yet.';
    return;
  }
  caption.textContent = `${pendingPhotos.length} photo${pendingPhotos.length === 1 ? '' : 's'} queued for scanning.`;
  grid.innerHTML = pendingPhotos.map((photo, index) => `
    <div class="pending-item">
      <img src="${photo.preview || photo.thumb}" alt="Queued comic ${index + 1}" />
      <button class="pending-remove" onclick="removePendingPhoto(${index})" title="Remove">×</button>
    </div>
  `).join('');
}

async function readApiJson(response, label) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (error) {
    throw new Error(`${label} did not return JSON. Status ${response.status}. Response: ${text.slice(0, 180)}`);
  }
  if (!response.ok) throw new Error(data.error || `${label} failed with status ${response.status}`);
  return data;
}

async function uploadImageToBlob(base64) {
  const blob = dataURLToBlob('data:image/jpeg;base64,' + base64);
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg', 'x-filename': `comic-${Date.now()}.jpg` },
    body: blob
  });
  const data = await readApiJson(res, 'Image upload');
  return data.url || '';
}

// ── Scan & Add ───────────────────────────────────────────────────────────────

async function scanAndAdd() {
  if (!pendingPhotos.length) {
    showStatus('scan-status', 'error', '✗ No photos queued. Capture or upload photos first.');
    return;
  }

  const override = document.getElementById('override-title').value.trim();
  const conditionChoice = document.getElementById('condition').value;
  const qty = parseInt(document.getElementById('qty').value) || 1;
  const customPrice = parseFloat(document.getElementById('start-price').value) || null;
  const costPrice = parseFloat(document.getElementById('cost-price').value) || null;

  document.getElementById('scan-btn').disabled = true;

  const batch = [...pendingPhotos];
  let added = 0;
  showProgress(0, batch.length);
  let uploadErrorMsg = '';

  for (let i = 0; i < batch.length; i++) {
    const photo = batch[i];

    // Free tier limit check
    const users = getUsers();
    const activeUser = users.find(u => u.id === currentUserId);
    const activePlan = activeUser?.plan ?? getSession()?.plan ?? 'free';
    if (activePlan !== 'pro' && comics.length >= FREE_COMIC_LIMIT) {
      showStatus('scan-status', 'warn', `⚠ Free plan limit (${FREE_COMIC_LIMIT} comics). Upgrade to Pro for unlimited archive.`);
      showUpgradePrompt();
      break;
    }

    try {
      showStatus('scan-status', 'info', `<span class="spin">⟳</span> Uploading image ${i + 1} of ${batch.length}...`);
      let imageUrl = '';
      try {
        imageUrl = await uploadImageToBlob(photo.base64);
      } catch (uploadErr) {
        uploadErrorMsg = uploadErr.message;
      }

      showStatus('scan-status', 'info', `<span class="spin">⟳</span> Identifying comic ${i + 1} of ${batch.length}...`);
      const identified = await identifyComic(photo.base64, override);

      const finalCondition = conditionChoice === 'Auto'
        ? (identified.condition || 'Unknown')
        : conditionChoice;

      const newTitle = identified.title || 'Unknown';
      const newIssue = identified.issue || 'Unknown';

      const comic = {
        id: Date.now() + i,
        title: newTitle,
        issue: newIssue,
        publisher:       identified.publisher       || 'Unknown',
        year:            identified.year            || 'Unknown',
        edition:         identified.edition         || 'Unknown',
        isVariant:       !!identified.isVariant,
        variantDetails:  identified.variantDetails  || '',
        isSlabbed:       !!identified.isSlabbed,
        slabCompany:     identified.slabCompany     || '',
        slabGrade:       identified.slabGrade       || '',
        hasSig:          !!identified.hasSig,
        sigDetails:      identified.sigDetails      || '',
        keyInfo:         identified.keyInfo         || '',
        firstAppearance: identified.firstAppearance || '',
        isKeyIssue:      !!identified.isKeyIssue,
        lowPrintRun:     !!identified.lowPrintRun,
        printRunNote:    identified.printRunNote    || '',
        importantCharacters: identified.importantCharacters || '',
        condition:       finalCondition,
        conditionGrade:  identified.conditionGrade  || '',
        conditionReason: identified.conditionReason || '',
        photoAdvice:     identified.photoAdvice     || '',
        confidence:      identified.confidence      || 'Low',
        qty,
        customPrice,
        costPrice,
        startingBid:     null,
        listingType: document.getElementById('listing-type').value || 'Buy it Now',
        ebayPrice: null,
        ebayStatus: 'loading',
        thumb: photo.thumb,
        imageUrl,
        searchQuery: identified.searchQuery || `${newTitle} ${newIssue} ${identified.publisher || ''} ${identified.year || ''}`.trim(),
        possibleDuplicate: checkDuplicate(newTitle, newIssue)
      };

      comics.unshift(comic);
      added++;
      renderList();
      fetchEbayPrice(comic);
    } catch (e) {
      console.error(e);
      showStatus('scan-status', 'warn', `Comic ${i + 1} failed: ${escapeHtml(e.message)}`);
    }
    showProgress(i + 1, batch.length);
  }

  clearPendingPhotos();
  hideProgress();
  document.getElementById('scan-btn').disabled = true;

  if (added > 0) {
    saveInventory();
    const dupCount = comics.slice(0, added).filter(c => c.possibleDuplicate).length;
    const dupNote = dupCount > 0 ? ` · ⚠ ${dupCount} possible duplicate${dupCount > 1 ? 's' : ''} flagged` : '';
    if (uploadErrorMsg) {
      showStatus('scan-status', 'warn', `⚠ ${added} comic${added === 1 ? '' : 's'} added but photo upload failed: ${uploadErrorMsg}. Use the 📷 button on each card to retry.`);
    } else {
      const adviceSet = [...new Set(comics.slice(0, added).map(c => c.photoAdvice).filter(Boolean))];
      if (adviceSet.length) {
        showStatus('scan-status', 'warn', `⚠ ${adviceSet[0]}${adviceSet.length > 1 ? ` (+${adviceSet.length - 1} more tips)` : ''}${dupNote}`);
      } else {
        showStatus('scan-status', dupCount ? 'warn' : 'success', `✓ Added ${added} comic${added === 1 ? '' : 's'} — fetching eBay UK prices...${dupNote}`);
      }
    }
    if (isMobile()) { showMobToast(`✓ ${added} Comic${added === 1 ? '' : 's'} Saved${dupNote}`); setTimeout(() => switchMobileTab('inventory'), 1200); }
  } else {
    showStatus('scan-status', 'error', '✗ No comics were added.');
  }
}

async function identifyComic(base64, override) {
  const res = await fetch('/api/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, override: override || '' })
  });
  return await readApiJson(res, 'AI identify API');
}

async function handleFileUpload(event) {
  const all = Array.from(event.target.files || []);
  if (!all.length) return;

  const remaining = MAX_PHOTOS - pendingPhotos.length;
  if (remaining <= 0) {
    showStatus('scan-status', 'warn', `✗ Maximum ${MAX_PHOTOS} photos reached.`);
    event.target.value = '';
    return;
  }

  const files = all.slice(0, remaining);
  if (files.length < all.length) {
    showStatus('scan-status', 'warn', `⚠ Only ${files.length} of ${all.length} photos added — limit reached.`);
  }

  showStatus('scan-status', 'info', `<span class="spin">⟳</span> Loading ${files.length} photo${files.length === 1 ? '' : 's'}...`);

  for (const file of files) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImage(dataUrl);
      const temp = document.createElement('canvas');
      temp.width = img.width; temp.height = img.height;
      temp.getContext('2d').drawImage(img, 0, 0);
      const compressed = compressCanvasToDataUrl(temp, 1200, 0.75);
      const thumb = document.createElement('canvas');
      thumb.width = 88; thumb.height = 120;
      thumb.getContext('2d').drawImage(img, 0, 0, 88, 120);
      addPendingPhoto({
        base64: compressed.split(',')[1],
        thumb: thumb.toDataURL('image/jpeg', 0.7),
        preview: compressed,
        source: 'upload'
      });
      previewImg.src = compressed;
      previewImg.style.display = 'block';
      document.getElementById('video').style.display = 'none';
      document.getElementById('cam-placeholder').style.display = 'none';
      document.getElementById('capture-btn').style.display = 'none';
      document.getElementById('retake-btn').style.display = 'inline-flex';
    } catch (e) {
      console.error(e);
      showStatus('scan-status', 'warn', 'One image could not be loaded: ' + escapeHtml(e.message));
    }
  }

  document.getElementById('scan-btn').disabled = pendingPhotos.length === 0;
  showStatus('scan-status', 'success', `${pendingPhotos.length} photo${pendingPhotos.length === 1 ? '' : 's'} queued — click Identify & Add All.`);
  event.target.value = '';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

async function fetchEbayPrice(comic, forceRefresh = false) {
  const cacheKey = [
    comic.searchQuery || `${comic.title} ${comic.issue} comic`,
    comic.edition && comic.edition !== 'Unknown' ? comic.edition : '',
    comic.isSlabbed ? (comic.slabCompany || 'slab') : '',
    comic.slabGrade || ''
  ].filter(Boolean).join('|');

  if (!forceRefresh) {
    const cached = getCachedPrice(cacheKey);
    if (cached) {
      if (!cached.found) {
        comic.ebayStatus = 'notfound'; comic.ebayPrice = null;
      } else {
        comic.ebayStatus = 'ok';
        comic.ebayPrice = cached.marketPrice || cached.median;
        comic.ebayMin = cached.min;
        comic.ebayMax = cached.max;
        comic.ebayCount = cached.count;
        comic.ebayConfidence = cached.confidence || 0;
        comic.ebayGradeBucket = cached.gradeBucket || 'RAW';
        comic.ebayResults = cached.results || [];
        comic.ebayLastSold = cached.lastSold || null;
        comic.ebaySource = cached.source || '';
      }
      renderList(); updateStats();
      return;
    }
  }

  try {
    const params = new URLSearchParams({
      q: cacheKey,
      title: comic.title || '',
      issue: comic.issue || '',
      year: comic.year || '',
      edition: comic.edition || '',
      isSlabbed: comic.isSlabbed ? '1' : '0',
      slabCompany: comic.slabCompany || '',
      slabGrade: comic.slabGrade || '',
    });
    const res = await fetch(`/api/ebay-search?${params}`);
    const data = await readApiJson(res, 'eBay pricing API');
    if (!data.found) {
      comic.ebayStatus = 'notfound'; comic.ebayPrice = null;
      setCachedPrice(cacheKey, { found: false });
    } else {
      comic.ebayStatus = 'ok';
      comic.ebayPrice = data.marketPrice || data.median;
      comic.ebayMin = data.min;
      comic.ebayMax = data.max;
      comic.ebayCount = data.count;
      comic.ebayConfidence = data.confidence || 0;
      comic.ebayGradeBucket = data.gradeBucket || 'RAW';
      comic.ebayResults = data.results || [];
      comic.ebayLastSold = data.lastSold || null;
      comic.ebaySource = data.source || '';
      setCachedPrice(cacheKey, data);
    }
  } catch (e) {
    comic.ebayStatus = 'error';
    comic.ebayError = e.message;
    showStatus('scan-status', 'warn', 'Comic added, but pricing failed: ' + escapeHtml(e.message));
  }
  renderList();
  updateStats();
  saveInventory();
}

// ── Re-fetch all prices ───────────────────────────────────────────────────────

async function refetchAllPrices() {
  if (!comics.length) return;
  const btn = document.getElementById('btn-refetch');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin">⟳</span> Refreshing'; }

  const toRefetch = comics.filter(c => !c.isBundle);
  clearPriceCacheForComics(toRefetch);
  toRefetch.forEach(c => { c.ebayStatus = 'loading'; c.ebayPrice = null; });
  renderList();

  for (const comic of toRefetch) {
    await fetchEbayPrice(comic, true);
    await new Promise(r => setTimeout(r, 120));
  }

  if (btn) { btn.disabled = false; btn.textContent = '↻ Prices'; }
}

// ── Sort / Filter ─────────────────────────────────────────────────────────────

function getDisplayedComics() {
  let result = [...comics];

  // Type filter (chips)
  if (filterMode === 'key')     result = result.filter(c => c.isKeyIssue || !!c.firstAppearance);
  else if (filterMode === 'news')    result = result.filter(c => c.edition === 'Newsstand');
  else if (filterMode === 'slab')    result = result.filter(c => c.isSlabbed);
  else if (filterMode === 'noprice') result = result.filter(c => !getWhatnotPrice(c));

  // Publisher filter
  if (publisherFilter) {
    result = result.filter(c => (c.publisher || '').toLowerCase() === publisherFilter.toLowerCase());
  }

  // Sort
  if (sortMode === 'price-desc') result.sort((a, b) => (getWhatnotPrice(b) || 0) - (getWhatnotPrice(a) || 0));
  else if (sortMode === 'price-asc')  result.sort((a, b) => (getWhatnotPrice(a) || 0) - (getWhatnotPrice(b) || 0));
  else if (sortMode === 'title')      result.sort((a, b) => a.title.localeCompare(b.title));
  else if (sortMode === 'year-desc')  result.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  else if (sortMode === 'year-asc')   result.sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0));

  return result;
}

function applySort() {
  sortMode = document.getElementById('sort-mode').value;
  renderList();
}

function applyPublisherFilter() {
  publisherFilter = document.getElementById('publisher-filter').value;
  renderList();
}

function updatePublisherDropdown() {
  const sel = document.getElementById('publisher-filter');
  if (!sel) return;
  const publishers = [...new Set(
    comics.map(c => c.publisher).filter(p => p && p !== 'Unknown')
  )].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">All Publishers</option>' +
    publishers.map(p => `<option value="${escapeHtml(p)}"${p === current ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('');
}

function applyFilter(mode) {
  filterMode = mode;
  ['all', 'key', 'news', 'slab', 'noprice'].forEach(m => {
    document.getElementById('chip-' + m)?.classList.toggle('active', m === mode);
  });
  renderList();
}

// ── Select mode / bundle ──────────────────────────────────────────────────────

function toggleSelectMode() {
  selectMode = !selectMode;
  selectedIds.clear();
  const btn = document.getElementById('btn-select');
  if (btn) btn.textContent = selectMode ? '✕ Cancel' : '☐ Select';
  document.getElementById('bundle-bar').classList.remove('show');
  renderList();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const count = selectedIds.size;
  const bar = document.getElementById('bundle-bar');
  document.getElementById('bundle-count').textContent = count;
  bar.classList.toggle('show', count >= 2);
  renderList();
}

function bundleSelected() {
  if (selectedIds.size < 2) return;
  const selected = comics.filter(c => selectedIds.has(c.id));

  const totalPrice = selected.reduce((s, c) => s + (getWhatnotPrice(c) || 0), 0);
  const totalCost = selected.reduce((s, c) => s + (c.costPrice || 0), 0);
  const hasCost = selected.some(c => c.costPrice != null);

  const titles = selected.map(c => `${c.title}${c.issue !== 'Unknown' ? ' #' + c.issue : ''}`.trim());
  const bundleTitle = titles.length <= 2
    ? titles.join(' + ')
    : `${titles[0]} + ${titles.length - 1} others`;

  const bundleComic = {
    id: Date.now(),
    title: bundleTitle,
    issue: 'Bundle',
    publisher: selected[0].publisher,
    year: selected[0].year,
    edition: 'Various',
    isVariant: false, variantDetails: '',
    isSlabbed: false, slabCompany: '', slabGrade: '',
    hasSig: false, sigDetails: '',
    keyInfo: `Bundle of ${selected.length} comics`, firstAppearance: '',
    isKeyIssue: false, lowPrintRun: false, printRunNote: '',
    importantCharacters: '',
    condition: 'Various', conditionGrade: '', conditionReason: '',
    confidence: 'High',
    qty: 1,
    customPrice: null,
    costPrice: hasCost ? totalCost : null,
    startingBid: null,
    listingType: selected[0].listingType,
    ebayPrice: null, ebayStatus: 'notfound',
    thumb: selected[0].thumb,
    imageUrl: selected[0].imageUrl || '',
    searchQuery: '',
    possibleDuplicate: false,
    priceOverride: totalPrice > 0 ? totalPrice : null,
    isBundle: true,
    bundleItems: titles
  };

  comics = comics.filter(c => !selectedIds.has(c.id));
  comics.unshift(bundleComic);
  selectedIds.clear();
  selectMode = false;
  const btn = document.getElementById('btn-select');
  if (btn) btn.textContent = '☐ Select';
  document.getElementById('bundle-bar').classList.remove('show');
  saveInventory();
  renderList();
  updateStats();
}

// ── Re-scan ───────────────────────────────────────────────────────────────────

function rescanComic(id) {
  rescanTargetId = id;
  document.getElementById('rescan-input').click();
}

async function handleRescan(event) {
  const file = event.target.files?.[0];
  if (!file || rescanTargetId == null) { event.target.value = ''; return; }

  const id = rescanTargetId;
  rescanTargetId = null;
  const comic = comics.find(c => c.id === id);
  if (!comic) { event.target.value = ''; return; }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const temp = document.createElement('canvas');
    temp.width = img.width; temp.height = img.height;
    temp.getContext('2d').drawImage(img, 0, 0);
    const compressed = compressCanvasToDataUrl(temp, 1200, 0.75);
    const base64 = compressed.split(',')[1];

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 88; thumbCanvas.height = 120;
    thumbCanvas.getContext('2d').drawImage(img, 0, 0, 88, 120);
    comic.thumb = thumbCanvas.toDataURL('image/jpeg', 0.7);

    comic.ebayStatus = 'loading';
    renderList();

    const identified = await identifyComic(base64, '');

    comic.title = identified.title || comic.title;
    comic.issue = identified.issue || comic.issue;
    comic.publisher = identified.publisher || comic.publisher;
    comic.year = identified.year || comic.year;
    comic.edition = identified.edition || comic.edition;
    comic.isVariant = !!identified.isVariant;
    comic.variantDetails = identified.variantDetails || '';
    comic.isSlabbed = !!identified.isSlabbed;
    comic.slabCompany = identified.slabCompany || '';
    comic.slabGrade = identified.slabGrade || '';
    comic.hasSig = !!identified.hasSig;
    comic.sigDetails = identified.sigDetails || '';
    comic.keyInfo = identified.keyInfo || '';
    comic.firstAppearance = identified.firstAppearance || '';
    comic.isKeyIssue = !!identified.isKeyIssue;
    comic.lowPrintRun = !!identified.lowPrintRun;
    comic.printRunNote = identified.printRunNote || '';
    comic.condition = identified.condition || comic.condition;
    comic.conditionGrade = identified.conditionGrade || '';
    comic.conditionReason = identified.conditionReason || '';
    comic.photoAdvice     = identified.photoAdvice     || '';
    comic.confidence = identified.confidence || 'Low';
    comic.searchQuery = identified.searchQuery || comic.searchQuery;

    try {
      const imageUrl = await uploadImageToBlob(base64);
      if (imageUrl) comic.imageUrl = imageUrl;
    } catch (uploadErr) {
      showStatus('scan-status', 'warn', `⚠ Re-scan saved but photo upload failed: ${uploadErr.message}`);
    }

    renderList();
    await fetchEbayPrice(comic);
    saveInventory();
  } catch (e) {
    console.error(e);
    showStatus('scan-status', 'warn', 'Re-scan failed: ' + escapeHtml(e.message));
  }

  event.target.value = '';
}

// ── Condition guide modal ─────────────────────────────────────────────────────

function showGradeModal() { document.getElementById('grade-modal').style.display = 'flex'; }
function hideGradeModal() { document.getElementById('grade-modal').style.display = 'none'; }

// ── Starting bid ──────────────────────────────────────────────────────────────

function setStartingBid(id, val) {
  const comic = comics.find(c => c.id === id);
  if (!comic) return;
  const n = parseFloat(val);
  comic.startingBid = !isNaN(n) && n >= 0 ? Math.round(n) : null;
  saveInventory();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEbaySoldUrl(query) {
  return 'https://www.ebay.co.uk/sch/i.html?_nkw=' + encodeURIComponent(query) + '&_sacat=0&LH_Sold=1&LH_Complete=1';
}

function buildCGCCensusUrl(title, issue) {
  return 'https://www.cgccomics.com/census/search-result/#q=' + encodeURIComponent((title + ' ' + issue).trim()) + '&ctype=3';
}

function formatLastSoldBox(ls) {
  if (!ls || !ls.price) return '';
  const price = `£${Number(ls.price).toFixed(2)}`;
  let dateStr = '';
  if (ls.endDate) {
    const d = new Date(ls.endDate);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) dateStr = 'Today';
    else if (days === 1) dateStr = 'Yesterday';
    else if (days < 7) dateStr = `${days}d ago`;
    else dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const countryMap = { US: 'USA', GB: 'UK', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', JP: 'Japan' };
  const countryName = ls.country ? (countryMap[ls.country] || ls.country) : '';
  const shipStr = ls.shippingCost === 0 ? 'Free shipping'
    : ls.shippingCost > 0 ? `+£${Number(ls.shippingCost).toFixed(2)} shipping`
    : '';
  const origin = [countryName ? `Sold in ${countryName}` : '', shipStr].filter(Boolean).join(' · ');
  const link = ls.url ? ` href="${escapeHtml(ls.url)}" target="_blank" rel="noopener"` : '';
  return `<a class="last-sold-box"${link} style="text-decoration:none;display:flex;flex-direction:column;gap:2px;">
    <span class="ls-label">Last Sold</span>
    <span class="ls-row1">
      <span class="ls-price">${escapeHtml(price)}</span>
      ${dateStr ? `<span class="ls-date">${escapeHtml(dateStr)}</span>` : ''}
    </span>
    ${origin ? `<span class="ls-origin">${escapeHtml(origin)}</span>` : ''}
  </a>`;
}

function getWhatnotPrice(c) {
  if (c.priceOverride != null) return c.priceOverride;
  const base = c.customPrice != null ? c.customPrice : c.ebayPrice;
  if (!base || base <= 0) return null;
  return Math.ceil(base * 1.15);
}

function getSubcategory(year) {
  const y = Number(year);
  if (!y || Number.isNaN(y)) return 'Modern Comics';
  return y < 1985 ? 'Vintage Comics' : 'Modern Comics';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderList() {
  const list = document.getElementById('comic-list');
  const displayed = getDisplayedComics();
  updatePublisherDropdown();

  if (!comics.length) {
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      Archive Empty<br/>Feed First Document →
    </div>`;
    updateStats();
    return;
  }

  if (!displayed.length) {
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      No comics match this filter
    </div>`;
    return;
  }

  list.innerHTML = displayed.map(c => {
    const whatnot = getWhatnotPrice(c);
    let priceHtml;

    if (editingPriceId === c.id) {
      const netDefault = whatnot ? Math.round(whatnot / 1.15) : (c.ebayPrice || '');
      const listPreview = whatnot ? `→ list at £${whatnot}` : '';
      priceHtml = `<div class="price-col">
        <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted);text-align:right;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px">want to net</div>
        <div class="price-edit-wrap">
          <span style="font-size:12px;color:var(--muted)">£</span>
          <input class="price-edit-input" id="price-input-${c.id}" type="number" value="${netDefault}" min="0" step="0.5"
            oninput="updatePricePreview(${c.id})"
            onkeydown="if(event.key==='Enter')savePrice(${c.id});if(event.key==='Escape')cancelEditPrice()" />
          <button class="btn-price-save" onclick="savePrice(${c.id})">✓</button>
          <button class="btn-price-cancel" onclick="cancelEditPrice()">✕</button>
        </div>
        <div id="price-preview-${c.id}" style="font-family:'Space Mono',monospace;font-size:8px;color:var(--amber);text-align:right;margin-top:3px;letter-spacing:0.05em">${listPreview}</div>
      </div>`;
    } else if (c.ebayStatus === 'loading') {
      priceHtml = `<div class="price-col"><span class="comic-price loading"><span class="spin">⟳</span></span></div>`;
    } else {
      const isOverridden = c.priceOverride != null;
      let display, cls, titleText;
      if (whatnot) {
        cls = isOverridden ? 'comic-price overridden' : 'comic-price';
        titleText = isOverridden
          ? 'Custom price (manually set)'
          : `Whatnot price after fees · eBay base £${c.ebayPrice ? c.ebayPrice.toFixed(2) : '?'}`;
        display = `£${whatnot}`;
      } else if (c.ebayStatus === 'notfound') {
        cls = 'comic-price notfound'; titleText = 'No UK eBay results — click ✏ to set manually'; display = 'N/A';
      } else {
        cls = 'comic-price error'; titleText = c.ebayError || 'eBay error'; display = 'Err';
      }
      const conf = c.ebayConfidence || 0;
      const thinData = c.ebayStatus === 'ok' && (c.ebayCount < 3 || conf < 40);
      const ebayCount = c.ebayCount ?? 0;
      const confLabel = conf >= 70 ? '' : conf >= 40 ? `⚠ ${ebayCount}` : `⚠ LOW`;
      const confTitle = conf >= 70 ? '' : `${ebayCount} sold comp${ebayCount === 1 ? '' : 's'} · confidence ${conf}% — treat as estimate`;
      priceHtml = `<div class="price-col">
        <span class="${cls}" title="${escapeHtml(titleText)}">${display}</span>
        ${thinData ? `<span class="price-thin" title="${confTitle}">${confLabel}</span>` : ''}
        <button class="btn-edit-price" onclick="startEditPrice(${c.id})" title="Edit price">✏ edit</button>
      </div>`;
    }

    const sub = [c.publisher, c.year, c.condition, c.qty > 1 ? 'Qty: ' + c.qty : '']
      .filter(x => x && x !== 'Unknown').join(' · ');
    const isActiveEbay = c.ebaySource && c.ebaySource.includes('active');
    const range = c.ebayStatus === 'ok' && c.ebayMin != null && c.ebayMax != null
      ? `${isActiveEbay ? '⚠ ASKING: ' : ''}eBay UK: £${c.ebayMin.toFixed(2)} – £${c.ebayMax.toFixed(2)} (${c.ebayCount ?? '?'} ${isActiveEbay ? 'listed' : 'sold'} · ${c.ebayConfidence || 0}% conf)${!isActiveEbay ? ` · Whatnot: £${whatnot}` : ' — not sold prices'}`
      : '';

    // Profit calc (Whatnot takes ~11% all-in fees)
    const net = c.costPrice != null && whatnot ? Math.round(whatnot * 0.89 - c.costPrice) : null;
    const profitHtml = net != null
      ? `<div class="profit-line ${net >= 0 ? 'profit-pos' : 'profit-neg'}">Net ≈ ${net >= 0 ? '+' : ''}£${Math.abs(net)} after fees</div>`
      : '';

    // Starting bid for auctions
    const startBidVal = c.startingBid != null ? c.startingBid : (whatnot || '');
    const startingBidHtml = c.listingType === 'Auction'
      ? `<div class="starting-bid-wrap">Starting bid: £<input type="number" class="starting-bid-input"
          id="bid-input-${c.id}" aria-label="Starting auction bid"
          value="${startBidVal}" onchange="setStartingBid(${c.id}, this.value)"
          min="0" step="1" title="Starting auction bid" /></div>`
      : '';

    return `<div class="comic-card${selectMode && selectedIds.has(c.id) ? ' card-selected' : ''}">
      ${selectMode ? `<div class="select-col" onclick="toggleSelect(${c.id})">${selectedIds.has(c.id) ? '☑' : '☐'}</div>` : ''}
      <img class="comic-thumb" src="${c.thumb}" alt="" />
      <div class="comic-info">
        <div class="comic-title">${escapeHtml(c.title)}${c.issue && c.issue !== 'Unknown' ? ' #' + escapeHtml(c.issue) : ''}</div>
        <div class="comic-sub">${escapeHtml(sub)}</div>
        ${c.keyInfo && c.keyInfo !== 'Unknown' && c.keyInfo ? `<div class="comic-range">${escapeHtml(c.keyInfo)}</div>` : ''}
        ${c.conditionReason ? `<div class="comic-range">Condition${c.conditionGrade ? ' ~' + escapeHtml(c.conditionGrade) : ''}: ${escapeHtml(c.conditionReason)}</div>` : ''}
        ${range ? `<div class="comic-range">${escapeHtml(range)}</div>` : ''}
        ${c.ebayLastSold ? formatLastSoldBox(c.ebayLastSold) : ''}
        ${c.searchQuery ? `<div class="comic-range"><a href="${escapeHtml(buildEbaySoldUrl(c.searchQuery))}" target="_blank" rel="noopener" class="ebay-link">🔗 eBay sold</a>${c.isSlabbed ? `&ensp;<a href="${escapeHtml(buildCGCCensusUrl(c.title, c.issue))}" target="_blank" rel="noopener" class="cgc-link">📊 CGC Census</a>` : ''}</div>` : (c.isSlabbed ? `<div class="comic-range"><a href="${escapeHtml(buildCGCCensusUrl(c.title, c.issue))}" target="_blank" rel="noopener" class="cgc-link">📊 CGC Census</a></div>` : '')}
        <div class="comic-badges">
          ${c.isKeyIssue || c.firstAppearance ? `<span class="cbadge cbadge-key" title="${escapeHtml(c.keyInfo)}">⭐ Key Issue</span>` : ''}
          ${c.firstAppearance ? `<span class="cbadge cbadge-first" title="${escapeHtml(c.firstAppearance)}">1st ${escapeHtml(c.firstAppearance.replace(/^First (full )?appearance of /i,''))}</span>` : ''}
          ${c.isSlabbed ? `<span class="cbadge cbadge-slab" title="${escapeHtml(c.slabCompany + ' ' + c.slabGrade)}">${escapeHtml(c.slabCompany || 'Slabbed')}${c.slabGrade ? ' ' + escapeHtml(c.slabGrade) : ''}</span>` : ''}
          ${c.hasSig ? `<span class="cbadge cbadge-sig" title="${escapeHtml(c.sigDetails)}">✍ Signed</span>` : ''}
          ${c.edition === 'Newsstand' ? `<span class="cbadge cbadge-news" title="Newsstand edition">📰 Newsstand</span>` : ''}
          ${c.edition === 'Canadian Price Variant' ? `<span class="cbadge cbadge-news" title="Canadian Price Variant">🍁 CPV</span>` : ''}
          ${c.isVariant ? `<span class="cbadge cbadge-variant" title="${escapeHtml(c.variantDetails)}">✦ Variant</span>` : ''}
          ${c.lowPrintRun ? `<span class="cbadge cbadge-low" title="${escapeHtml(c.printRunNote)}">🔥 Low Print</span>` : ''}
          ${c.possibleDuplicate ? `<span class="cbadge cbadge-dup">⚠ Duplicate?</span>` : ''}
          ${c.isBundle ? `<span class="cbadge cbadge-bundle">📦 Bundle</span>` : ''}
        </div>
        <div class="listing-toggle">
          <button class="${c.listingType === 'Buy it Now' ? 'active' : ''}" onclick="setListingType(${c.id}, 'Buy it Now')">Buy it Now</button>
          <button class="${c.listingType === 'Auction' ? 'active' : ''}" onclick="setListingType(${c.id}, 'Auction')">Auction</button>
        </div>
        ${startingBidHtml}
        ${profitHtml}
      </div>
      ${priceHtml}
      <div class="card-actions">
        <button class="btn-rescan" onclick="rescanComic(${c.id})" title="Re-scan with new photo">📷</button>
        <button class="del-btn" onclick="deleteComic(${c.id})" title="Remove">×</button>
      </div>
    </div>`;
  }).join('');

  updateStats();
  updateMobBadge();
}

function deleteComic(id) {
  comics = comics.filter(c => c.id !== id);
  if (selectedIds.has(id)) { selectedIds.delete(id); updateBundleBar(); }
  saveInventory();
  renderList();
}

function clearAll() {
  if (!comics.length) return;
  if (confirm(`Remove all ${comics.length} comics from inventory?`)) {
    comics = []; selectedIds.clear(); selectMode = false;
    document.getElementById('btn-select').textContent = '☐ Select';
    document.getElementById('bundle-bar').classList.remove('show');
    saveInventory();
    renderList();
  }
}

function updateBundleBar() {
  const count = selectedIds.size;
  document.getElementById('bundle-count').textContent = count;
  document.getElementById('bundle-bar').classList.toggle('show', count >= 2 && selectMode);
}

function updateStats() {
  const priced = comics.filter(c => getWhatnotPrice(c));
  const totalItems = comics.reduce((s, c) => s + (c.qty || 1), 0);
  const totalVal = priced.reduce((s, c) => s + getWhatnotPrice(c) * (c.qty || 1), 0);
  const totalQty = priced.reduce((s, c) => s + (c.qty || 1), 0);
  const avg = totalQty ? totalVal / totalQty : 0;

  const withCost = comics.filter(c => c.costPrice != null && getWhatnotPrice(c));
  document.getElementById('stat-count').textContent = totalItems;
  document.getElementById('stat-total').textContent = '£' + totalVal.toFixed(0);

  if (withCost.length > 0) {
    const totalProfit = withCost.reduce((s, c) => s + (getWhatnotPrice(c) * 0.89 - c.costPrice) * (c.qty || 1), 0);
    document.getElementById('stat-avg').textContent = (totalProfit >= 0 ? '+£' : '-£') + Math.abs(totalProfit).toFixed(0);
    document.getElementById('stat-avg-label').textContent = 'Est. Profit';
    document.getElementById('stat-avg').style.color = totalProfit >= 0 ? '#00cfbe' : 'var(--red)';
  } else {
    document.getElementById('stat-avg').textContent = '£' + avg.toFixed(0);
    document.getElementById('stat-avg-label').textContent = 'Avg Price';
    document.getElementById('stat-avg').style.color = '';
  }

  // Key issues count
  const keyCount = comics.filter(c => c.isKeyIssue || !!c.firstAppearance).length;
  document.getElementById('stat-keys').textContent = keyCount;

  // Top comic by price
  const topComic = comics.filter(c => getWhatnotPrice(c)).sort((a, b) => (getWhatnotPrice(b) || 0) - (getWhatnotPrice(a) || 0))[0];
  const topEl = document.getElementById('stat-top');
  if (topComic) {
    const shortTitle = (topComic.title || '?').replace(/^(The |Amazing |Uncanny |Incredible |Invincible )/i, '');
    topEl.textContent = shortTitle.length > 12 ? shortTitle.slice(0, 11) + '…' : shortTitle;
    topEl.title = `${topComic.title} #${topComic.issue} — £${getWhatnotPrice(topComic)}`;
  } else {
    topEl.textContent = '—';
    topEl.title = '';
  }
}

function updatePricePreview(id) {
  const input   = document.getElementById(`price-input-${id}`);
  const preview = document.getElementById(`price-preview-${id}`);
  if (!input || !preview) return;
  const net = parseFloat(input.value);
  preview.textContent = (!isNaN(net) && net > 0) ? `→ list at £${Math.ceil(net * 1.15)}` : '';
}

function startEditPrice(id) {
  editingPriceId = id;
  renderList();
  setTimeout(() => {
    const input = document.getElementById(`price-input-${id}`);
    if (input) { input.focus(); input.select(); updatePricePreview(id); }
  }, 0);
}

function savePrice(id) {
  const input = document.getElementById(`price-input-${id}`);
  const net = input ? parseFloat(input.value) : NaN;
  const comic = comics.find(c => c.id === id);
  if (comic) {
    // User typed the net they want to receive; back-calculate the Whatnot listing price
    comic.priceOverride = (!isNaN(net) && net > 0) ? Math.ceil(net * 1.15) : null;
  }
  editingPriceId = null;
  saveInventory();
  renderList(); updateStats();
}

function cancelEditPrice() { editingPriceId = null; renderList(); }

function normKey(title, issue) {
  return (String(title) + '||' + String(issue).replace(/^#/, '')).toLowerCase().trim();
}

function checkDuplicate(title, issue, excludeId = null) {
  const key = normKey(title, issue);
  return comics.some(c => c.id !== excludeId && normKey(c.title, c.issue) === key);
}

function setListingType(id, type) {
  const comic = comics.find(c => c.id === id);
  if (comic) comic.listingType = type;
  saveInventory();
  renderList();
}

function showStatus(id, type, html) {
  const el = document.getElementById(id);
  el.className = 'status show ' + type;
  el.innerHTML = html;
}

function showProgress(done, total) {
  const wrap = document.getElementById('progress-wrap');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const pct  = document.getElementById('progress-pct');
  const percent = total ? Math.round((done / total) * 100) : 0;
  wrap.classList.add('show');
  fill.style.width = percent + '%';
  text.textContent = `${done} / ${total} scanned`;
  pct.textContent = percent + '%';
}

function hideProgress() { document.getElementById('progress-wrap').classList.remove('show'); }

// ── CSV Export ────────────────────────────────────────────────────────────────

function csvCell(value) {
  const clean = String(value == null ? '' : value)
    .replace(/"/g, '""').replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
  return `"${clean}"`;
}

function toWhatnotCondition(condition, isSlabbed) {
  if (isSlabbed) return 'Like New';
  const c = (condition || '').toLowerCase();
  if (c.includes('near mint') || c.includes('mint'))    return 'Like New';
  if (c.includes('very fine'))                          return 'Like New';
  if (c.includes('fine'))                               return 'Good';
  if (c.includes('very good'))                          return 'Good';
  if (c.includes('good'))                               return 'Good';
  if (c.includes('fair') || c.includes('poor'))         return 'Acceptable';
  return 'Good';
}

function buildCSV() {
  const headers = [
    'Category','Subcategory','Title','Description','Quantity','Type','Price',
    'Shipping Profile','Offerable','Hazmat','Condition','Cost Per Item','Sku',
    'Image URL 1','Image URL 2','Image URL 3','Image URL 4','Image URL 5','Image URL 6','Image URL 7','Image URL 8'
  ];
  const rows = [headers];

  for (const c of comics) {
    const title = `${c.title || 'Unknown'}${c.issue && c.issue !== 'Unknown' ? ' #' + c.issue : ''}`.trim();
    const descParts = [
      c.keyInfo && c.keyInfo !== 'Unknown' ? c.keyInfo : '',
      c.publisher && c.publisher !== 'Unknown' ? c.publisher : '',
      c.year && c.year !== 'Unknown' ? c.year : '',
      c.conditionReason ? `Condition note: ${c.conditionReason}` : '',
      c.ebayPrice ? `eBay UK market ref: £${c.ebayPrice.toFixed(2)}` : ''
    ].filter(Boolean).join(' · ') || 'Comic book listing';

    const price = c.listingType === 'Auction' && c.startingBid != null
      ? c.startingBid
      : (getWhatnotPrice(c) || '');

    const shippingProfile = c.isSlabbed ? 'Graded slab' : c.isBundle ? 'Bulk comics lot' : 'Bagged and boarded raw comic';
    rows.push([
      'Comics & Manga', getSubcategory(c.year), title, descParts,
      c.qty || 1, c.listingType || 'Buy it Now', price,
      shippingProfile, 'Yes', 'Not Hazmat',
      toWhatnotCondition(c.condition, c.isSlabbed), '', '',
      c.imageUrl || '', '', '', '', '', '', '', ''
    ]);
  }

  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

function exportCSV() {
  if (!comics.length) { alert('No comics to export'); return; }
  const csv = buildCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whatnot_comics_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function togglePreview() {
  const pre = document.getElementById('csv-preview');
  if (pre.style.display === 'none') {
    if (!comics.length) { alert('No comics to preview'); return; }
    pre.textContent = buildCSV();
    pre.style.display = 'block';
  } else {
    pre.style.display = 'none';
  }
}

function exportInventoryCSV() {
  if (!comics.length) { alert('No comics to export'); return; }

  const headers = [
    'Title', 'Issue', 'Publisher', 'Year', 'Edition', 'Variant',
    'Condition', 'CGC Grade', 'Is Slabbed', 'Slab Company', 'Slab Grade',
    'Key Issue', 'First Appearance', 'Key Info',
    'eBay Market Price (£)', 'Whatnot Price (£)', 'Cost Price (£)',
    'Important Characters', 'Confidence', 'Image URL', 'Date Added'
  ];

  const esc = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const rows = comics.map(c => [
    esc(c.title),
    esc(c.issue),
    esc(c.publisher),
    esc(c.year),
    esc(c.edition),
    esc(c.variantDetails || (c.isVariant ? 'Yes' : '')),
    esc(c.condition),
    esc(c.conditionGrade),
    esc(c.isSlabbed ? 'Yes' : 'No'),
    esc(c.slabCompany),
    esc(c.slabGrade),
    esc(c.isKeyIssue ? 'Yes' : 'No'),
    esc(c.firstAppearance),
    esc(c.keyInfo),
    esc(c.ebayPrice != null ? c.ebayPrice.toFixed(2) : ''),
    esc(getWhatnotPrice(c) != null ? getWhatnotPrice(c).toFixed(2) : ''),
    esc(c.costPrice != null ? c.costPrice.toFixed(2) : ''),
    esc(c.importantCharacters),
    esc(c.confidence),
    esc(c.imageUrl || ''),
    esc(c.id ? new Date(parseInt(c.id, 16) || Date.now()).toISOString().slice(0, 10) : '')
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `longboxlens_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById('pane-export').style.display = tab === 'export' ? 'flex' : 'none';
  document.getElementById('pane-lookup').style.display = tab === 'lookup'  ? 'flex' : 'none';
  document.getElementById('pane-fees').style.display   = tab === 'fees'    ? 'flex' : 'none';
  document.getElementById('tab-btn-export').classList.toggle('active', tab === 'export');
  document.getElementById('tab-btn-lookup').classList.toggle('active', tab === 'lookup');
  document.getElementById('tab-btn-fees').classList.toggle('active', tab === 'fees');
  if (tab === 'fees') calcFees();

  if (tab === 'export' && lkStream) {
    lkStream.getTracks().forEach(t => t.stop()); lkStream = null;
  }
  if (tab === 'lookup' && stream) {
    stream.getTracks().forEach(t => t.stop()); stream = null;
    document.getElementById('video').style.display = 'none';
    document.getElementById('cam-placeholder').style.display = 'flex';
    document.getElementById('start-cam-btn').disabled = false;
    document.getElementById('start-cam-btn').textContent = '▶ Start Camera';
    document.getElementById('capture-btn').disabled = true;
  }
}

// ── Lookup camera ─────────────────────────────────────────────────────────────

let lkStream = null;
let lkBase64 = null;

const lkVideo   = document.getElementById('lk-video');
const lkCanvas  = document.getElementById('lk-canvas');
const lkPreview = document.getElementById('lk-preview-img');

async function lkStartCamera() {
  try {
    lkStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    lkVideo.srcObject = lkStream;
    lkVideo.style.display = 'block';
    document.getElementById('lk-cam-placeholder').style.display = 'none';
    document.getElementById('lk-capture-btn').disabled = false;
    document.getElementById('lk-start-btn').disabled = true;
    document.getElementById('lk-start-btn').textContent = '✓ Camera on';
  } catch (e) {
    showStatus('lk-status', 'error', '✗ Camera error: ' + e.message);
  }
}

function lkCapture() {
  lkCanvas.width  = lkVideo.videoWidth;
  lkCanvas.height = lkVideo.videoHeight;
  lkCanvas.getContext('2d').drawImage(lkVideo, 0, 0);
  const compressed = compressCanvasToDataUrl(lkCanvas, 1200, 0.75);
  lkBase64 = compressed.split(',')[1];
  lkPreview.src = compressed;
  lkPreview.style.display = 'block';
  lkVideo.style.display = 'none';
  document.getElementById('lk-capture-btn').style.display = 'none';
  document.getElementById('lk-retake-btn').style.display = 'inline-flex';
  document.getElementById('lk-scan-btn').disabled = false;
}

function lkRetake() {
  lkBase64 = null;
  lkPreview.style.display = 'none';
  lkVideo.style.display = 'block';
  document.getElementById('lk-capture-btn').style.display = 'inline-flex';
  document.getElementById('lk-retake-btn').style.display = 'none';
  document.getElementById('lk-scan-btn').disabled = true;
  document.getElementById('lk-status').className = 'status';
}

async function lkHandleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img     = await loadImage(dataUrl);
    const temp    = document.createElement('canvas');
    temp.width = img.width; temp.height = img.height;
    temp.getContext('2d').drawImage(img, 0, 0);
    const compressed = compressCanvasToDataUrl(temp, 1200, 0.75);
    lkBase64 = compressed.split(',')[1];
    lkPreview.src = compressed;
    lkPreview.style.display = 'block';
    lkVideo.style.display = 'none';
    document.getElementById('lk-cam-placeholder').style.display = 'none';
    document.getElementById('lk-capture-btn').style.display = 'none';
    document.getElementById('lk-retake-btn').style.display = 'inline-flex';
    document.getElementById('lk-scan-btn').disabled = false;
  } catch (e) {
    showStatus('lk-status', 'error', 'Could not load image: ' + escapeHtml(e.message));
  }
  event.target.value = '';
}

// ── Lookup scan ───────────────────────────────────────────────────────────────

async function lookupScan() {
  if (!lkBase64) return;
  document.getElementById('lk-scan-btn').disabled = true;
  document.getElementById('lk-empty').style.display  = 'none';
  document.getElementById('lk-result').style.display = 'none';

  showStatus('lk-status', 'info', '<span class="spin">⟳</span> Identifying comic...');

  let identified;
  try {
    identified = await identifyComic(lkBase64, '');
  } catch (e) {
    showStatus('lk-status', 'error', '✗ ' + escapeHtml(e.message));
    document.getElementById('lk-scan-btn').disabled = false;
    return;
  }

  showStatus('lk-status', 'info', '<span class="spin">⟳</span> Fetching UK sold prices...');

  let ebayData = null;
  try {
    const lkParams = new URLSearchParams({
      q: identified.searchQuery || `${identified.title} ${identified.issue} comic`,
      title: identified.title || '',
      issue: identified.issue || '',
      year: identified.year || '',
      edition: identified.edition || '',
      isSlabbed: identified.isSlabbed ? '1' : '0',
      slabCompany: identified.slabCompany || '',
      slabGrade: identified.slabGrade || '',
    });
    const res = await fetch(`/api/ebay-search?${lkParams}`);
    ebayData = await readApiJson(res, 'eBay pricing');
  } catch (e) {
    ebayData = { found: false };
  }

  renderLookupResult(identified, ebayData, lkPreview.src);
  if (identified.photoAdvice) {
    showStatus('lk-status', 'warn', `⚠ ${identified.photoAdvice}`);
  } else {
    showStatus('lk-status', 'success', '✓ Done');
  }
  document.getElementById('lk-scan-btn').disabled = false;
}

// ── CGC grade estimate ─────────────────────────────────────────────────────────

function cgcGradeNote(grade) {
  const g = parseFloat(grade);
  if (isNaN(g)) return null;
  if (g >= 9.8) return { label: 'NM/M', note: 'Near-perfect copy. Slabbed premium 3–8× raw for key issues.', color: 'var(--cyan)' };
  if (g >= 9.4) return { label: 'NM', note: 'Strong slab candidate. CGC 9.6+ often 2–4× raw on keys.', color: 'var(--cyan)' };
  if (g >= 9.0) return { label: 'VF/NM', note: 'Moderate slab interest. Worth grading high-demand issues.', color: 'var(--amber)' };
  if (g >= 8.0) return { label: 'VF', note: 'Lower slab premium. Grade only very high-demand keys.', color: 'var(--amber)' };
  if (g >= 6.0) return { label: 'FN', note: 'Raw sale typically beats grading cost at this grade.', color: 'var(--muted)' };
  return { label: 'Poor/Fair', note: 'Sell as reader copy — grading not recommended.', color: 'var(--red)' };
}

// ── Lookup result render ──────────────────────────────────────────────────────

function renderLookupResult(c, ebay, thumbSrc) {
  const badges = [
    c.isKeyIssue || c.firstAppearance ? `<span class="cbadge cbadge-key">⭐ Key Issue</span>` : '',
    c.firstAppearance ? `<span class="cbadge cbadge-first" title="${escapeHtml(c.firstAppearance)}">1st ${escapeHtml(c.firstAppearance.replace(/^First (full )?appearance of /i,''))}</span>` : '',
    c.isSlabbed ? `<span class="cbadge cbadge-slab">${escapeHtml(c.slabCompany||'Slabbed')}${c.slabGrade?' '+c.slabGrade:''}</span>` : '',
    c.hasSig ? `<span class="cbadge cbadge-sig" title="${escapeHtml(c.sigDetails)}">✍ Signed</span>` : '',
    c.edition === 'Newsstand' ? `<span class="cbadge cbadge-news">📰 Newsstand</span>` : '',
    c.edition === 'Canadian Price Variant' ? `<span class="cbadge cbadge-news">🍁 CPV</span>` : '',
    c.isVariant ? `<span class="cbadge cbadge-variant" title="${escapeHtml(c.variantDetails)}">✦ Variant</span>` : '',
    c.lowPrintRun ? `<span class="cbadge cbadge-low">🔥 Low Print</span>` : ''
  ].filter(Boolean).join('');

  const condVal = [c.condition, c.conditionGrade ? '~'+c.conditionGrade : ''].filter(Boolean).join(' · ');
  const editionStr = c.edition && c.edition !== 'Unknown' ? c.edition : '';
  const soldUrl = buildEbaySoldUrl(c.searchQuery || `${c.title} ${c.issue} comic`);
  const censusUrl = buildCGCCensusUrl(c.title, c.issue);

  const isActiveListing = ebay?.source && ebay.source.includes('active');
  const ebayHtml = ebay?.found
    ? `${isActiveListing ? `<div style="font-family:'Space Mono',monospace;font-size:8px;color:var(--amber);background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);padding:4px 7px;margin-bottom:6px;letter-spacing:0.06em">⚠ ASKING PRICE — not a real sold price. Get production eBay keys for accuracy.</div>` : ''}
       <div class="lk-card-val">£${ebay.median}</div>
       <div class="lk-card-sub">£${ebay.min} – £${ebay.max} · ${ebay.count} ${isActiveListing ? 'active' : 'sold'}<br>${isActiveListing ? 'Estimate (active listings)' : `Whatnot est. £${Math.ceil(ebay.median * 1.15)}`}</div>
       <div style="margin-top:8px"><a href="${escapeHtml(soldUrl)}" target="_blank" rel="noopener" class="ebay-link">🔗 View sold listings on eBay</a></div>`
    : `<div class="lk-card-val" style="color:var(--muted);font-size:14px">No data</div>
       <div class="lk-card-sub">No UK sold results found</div>
       <div style="margin-top:8px"><a href="${escapeHtml(soldUrl)}" target="_blank" rel="noopener" class="ebay-link">🔗 Search eBay</a></div>`;

  const cgcInfo = c.conditionGrade ? cgcGradeNote(c.conditionGrade) : null;

  document.getElementById('lk-result').innerHTML = `
    ${c.photoAdvice ? `
    <div style="padding:10px 14px;background:rgba(229,130,26,0.07);border:1px solid rgba(229,130,26,0.2);margin-bottom:2px">
      <div style="font-family:'Space Mono',monospace;font-size:8px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--amber-dim);margin-bottom:4px">// Photo Tip</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;color:var(--cream2);line-height:1.4">${escapeHtml(c.photoAdvice)}</div>
    </div>` : ''}
    <div class="lk-hero">
      <img class="lk-thumb" src="${escapeHtml(thumbSrc)}" alt="" />
      <div class="lk-identity">
        <div class="lk-title">${escapeHtml(c.title)}</div>
        <div class="lk-issue">${c.issue && c.issue !== 'Unknown' ? '#' + escapeHtml(c.issue) : ''}</div>
        <div class="lk-meta">${[c.publisher, c.year, editionStr].filter(x=>x&&x!=='Unknown').join(' · ')}</div>
        ${badges ? `<div class="comic-badges" style="margin-top:8px">${badges}</div>` : ''}
      </div>
    </div>

    <div class="lk-grid">
      <div class="lk-card">
        <div class="lk-card-label">Condition</div>
        <div class="lk-card-val" style="font-size:16px">${escapeHtml(condVal || 'Unknown')}</div>
        <div class="lk-card-sub">${escapeHtml(c.conditionReason || '')}</div>
      </div>
      <div class="lk-card">
        <div class="lk-card-label">${isActiveListing ? 'eBay UK · Active Listings' : 'eBay UK · Last 90 days'}</div>
        ${ebayHtml}
      </div>
    </div>

    ${cgcInfo ? `
    <div class="lk-section" style="border-color: ${cgcInfo.color}40">
      <div class="lk-section-label">CGC Grade Estimate</div>
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">
        <span style="font-family:'Bebas Neue',Impact,sans-serif;font-size:36px;letter-spacing:0.05em;color:${cgcInfo.color};line-height:1">${escapeHtml(c.conditionGrade)}</span>
        <span style="font-family:'Space Mono',monospace;font-size:10px;font-weight:700;color:${cgcInfo.color}">${escapeHtml(cgcInfo.label)}</span>
      </div>
      <div class="lk-section-text">${escapeHtml(cgcInfo.note)}</div>
    </div>` : ''}

    ${c.isSlabbed ? `
    <div class="lk-section">
      <div class="lk-section-label">🔵 Slab Details</div>
      <div class="lk-section-text">${escapeHtml(c.slabCompany || 'Slabbed')}${c.slabGrade ? ' — Grade ' + escapeHtml(c.slabGrade) : ''}<br>
      <a href="${censusUrl}" target="_blank" rel="noopener" class="cgc-link" style="font-size:12px">📊 View CGC Census population report</a></div>
    </div>` : ''}

    ${c.keyInfo ? `
    <div class="lk-section">
      <div class="lk-section-label">⭐ Key Issue Info</div>
      <div class="lk-section-text">${escapeHtml(c.keyInfo)}</div>
    </div>` : ''}

    ${c.firstAppearance ? `
    <div class="lk-section">
      <div class="lk-section-label">First Appearance</div>
      <div class="lk-section-text">${escapeHtml(c.firstAppearance)}</div>
    </div>` : ''}

    ${c.importantCharacters && c.importantCharacters !== 'Unknown' ? `
    <div class="lk-section">
      <div class="lk-section-label">Characters</div>
      <div class="lk-section-text">${escapeHtml(c.importantCharacters)}</div>
    </div>` : ''}

    ${c.printRunNote ? `
    <div class="lk-section">
      <div class="lk-section-label">🔥 Print Run Note</div>
      <div class="lk-section-text">${escapeHtml(c.printRunNote)}</div>
    </div>` : ''}

    ${c.variantDetails ? `
    <div class="lk-section">
      <div class="lk-section-label">✦ Variant Details</div>
      <div class="lk-section-text">${escapeHtml(c.variantDetails)}</div>
    </div>` : ''}

    ${c.sigDetails ? `
    <div class="lk-section">
      <div class="lk-section-label">✍ Signature</div>
      <div class="lk-section-text">${escapeHtml(c.sigDetails)}</div>
    </div>` : ''}
  `;

  document.getElementById('lk-result').style.display = 'flex';
}

// ── Mobile navigation ─────────────────────────────────────────────────────────

function isMobile() { return window.innerWidth <= 768; }

let activeMobileTab = 'scan';

function switchMobileTab(tab) {
  if (!isMobile()) return;
  activeMobileTab = tab;
  ['scan', 'inventory', 'lookup'].forEach(t => {
    document.getElementById('mnav-' + t)?.classList.toggle('active', t === tab);
  });
  if (tab === 'lookup') {
    switchTab('lookup');
    if (!lkStream) lkStartCamera();
  } else {
    switchTab('export');
    document.querySelector('.sidebar')?.classList.toggle('mob-active', tab === 'scan');
    document.querySelector('.main')?.classList.toggle('mob-active', tab === 'inventory');
    if (tab === 'scan' && !stream) startCamera();
  }
}

function updateMobBadge() {
  const badge = document.getElementById('mob-count');
  if (!badge) return;
  const n = comics.length;
  badge.style.display = n > 0 ? 'block' : 'none';
  badge.textContent = n > 99 ? '99+' : n;
}

// ── Mobile: toast notification ────────────────────────────────────────────────
let _toastTimer = null;
function showMobToast(msg, duration = 2200) {
  if (!isMobile()) return;
  const t = document.getElementById('mob-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('visible');
  void t.offsetWidth; // force reflow so animation restarts
  t.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('visible'), duration);
}

// ── Mobile: swipe between tabs ───────────────────────────────────────────────
function initMobileSwipe() {
  const el = document.getElementById('main-app');
  if (!el) return;
  const tabOrder = ['scan', 'inventory', 'lookup'];
  let tx = 0, ty = 0;
  el.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    const idx = tabOrder.indexOf(activeMobileTab);
    if (dx < 0 && idx < tabOrder.length - 1) switchMobileTab(tabOrder[idx + 1]);
    else if (dx > 0 && idx > 0) switchMobileTab(tabOrder[idx - 1]);
  }, { passive: true });
}

// ── Mobile: haptic feedback ───────────────────────────────────────────────────
function initHaptic() {
  if (!('vibrate' in navigator)) return;
  ['capture-btn', 'lk-capture-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => navigator.vibrate(6), { passive: true });
  });
  document.getElementById('scan-btn')?.addEventListener('click', () => navigator.vibrate([5, 40, 12]), { passive: true });
}

// ── Mobile: archive search ────────────────────────────────────────────────────
function applyMobileSearch() {
  const q = (document.getElementById('mob-search')?.value || '').toLowerCase().trim();
  document.querySelectorAll('#comic-list .comic-card').forEach(card => {
    const title = (card.querySelector('.comic-title')?.textContent || '').toLowerCase();
    card.style.display = (!q || title.includes(q)) ? '' : 'none';
  });
}
function clearMobileSearch() {
  const el = document.getElementById('mob-search');
  if (el) { el.value = ''; applyMobileSearch(); }
}

window.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (session) {
    activateApp(session);
  } else {
    document.getElementById('landing-screen').style.display = 'flex';
  }
});

window.addEventListener('resize', () => {
  if (isMobile()) switchMobileTab(activeMobileTab);
  else {
    document.querySelector('.sidebar')?.classList.remove('mob-active');
    document.querySelector('.main')?.classList.remove('mob-active');
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

let stSelectedFeatures = new Set();

function showSettings() {
  const session = getSession();
  if (!session) return;
  const users = getUsers();
  const user = users.find(u => u.id === session.userId) || { plan: session.plan || 'free' };

  document.getElementById('st-name').value = session.name;
  document.getElementById('st-email').value = session.email;
  document.getElementById('st-pw-old').value = '';
  document.getElementById('st-pw-new').value = '';
  document.getElementById('st-pw-confirm').value = '';

  ['st-name-error','st-name-ok','st-pw-error','st-pw-ok','st-feat-error','st-feat-ok'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('show'); el.textContent = ''; }
  });

  stSelectedFeatures = new Set(session.features);
  renderStFeatureCards();
  renderStPlan(user, session);
  document.getElementById('settings-modal').style.display = 'flex';
}

function hideSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

function renderStFeatureCards() {
  document.getElementById('st-feat-export')?.classList.toggle('selected', stSelectedFeatures.has('export'));
  document.getElementById('st-feat-lookup')?.classList.toggle('selected', stSelectedFeatures.has('lookup'));
}

function stToggleFeat(f) {
  if (stSelectedFeatures.has(f)) stSelectedFeatures.delete(f);
  else stSelectedFeatures.add(f);
  renderStFeatureCards();
}

function renderStPlan(user, session) {
  const userIsPro = user?.plan === 'pro';
  const count = comics.length;
  const limit = FREE_COMIC_LIMIT;
  const pct = Math.min(100, Math.round((count / limit) * 100));
  const el = document.getElementById('st-plan-content');
  if (!el) return;

  if (userIsPro) {
    el.innerHTML = `
      <div class="plan-row">
        <span class="plan-badge-pro">◆ Pro</span>
        <span style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)">${count} comics · Unlimited</span>
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;color:var(--muted);line-height:1.5">
        Full access enabled. Subscription billing activates when payments launch.
      </div>`;
  } else {
    el.innerHTML = `
      <div class="plan-row">
        <span class="plan-badge-free">Free</span>
        <span style="font-family:'Space Mono',monospace;font-size:9px;color:var(--muted)">${count} / ${limit} comics used</span>
      </div>
      <div class="plan-limit-bar">
        <div class="plan-limit-fill${pct >= 80 ? ' danger' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="plan-limit-label">${limit - count > 0 ? (limit - count) + ' slots remaining' : 'Archive full — upgrade to continue'}</div>
      <button class="btn-primary btn-upgrade" onclick="doUpgrade()">↑ Upgrade to Pro — Unlimited Archive</button>`;
  }
}

function showStMsg(id, msg) {
  ['st-name-error','st-name-ok','st-pw-error','st-pw-ok','st-feat-error','st-feat-ok'].forEach(i => {
    const el = document.getElementById(i);
    if (el && i !== id) el.classList.remove('show');
  });
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function doSaveName() {
  const name = document.getElementById('st-name').value.trim();
  if (!name) { showStMsg('st-name-error', 'Name cannot be empty.'); return; }
  const session = getSession();
  const users = getUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return;
  user.name = name;
  saveUsers(users);
  const newSession = { ...session, name };
  saveSession(newSession);
  renderHeaderUser(newSession);
  showStMsg('st-name-ok', '✓ Name updated.');
}

async function doChangePassword() {
  const oldPw    = document.getElementById('st-pw-old').value;
  const newPw    = document.getElementById('st-pw-new').value;
  const confirm  = document.getElementById('st-pw-confirm').value;
  const session  = getSession();
  const users    = getUsers();
  const user     = users.find(u => u.id === session.userId);
  if (!oldPw || !newPw) { showStMsg('st-pw-error', 'Fill in all password fields.'); return; }
  if (newPw.length < 6) { showStMsg('st-pw-error', 'New password must be at least 6 characters.'); return; }
  if (newPw !== confirm) { showStMsg('st-pw-error', 'New passwords do not match.'); return; }
  if (user && user.passwordHash !== hashPw(oldPw)) { showStMsg('st-pw-error', 'Current password is incorrect.'); return; }

  // Update server first (authoritative)
  if (session?.token) {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
        body: JSON.stringify({ action: 'change-password', password: oldPw, newPassword: newPw })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showStMsg('st-pw-error', err.error || 'Server rejected password change.');
        return;
      }
    } catch (e) {
      showStMsg('st-pw-error', 'Network error — password not changed.');
      return;
    }
  }

  // Mirror to localStorage cache if the user exists there
  if (user) {
    user.passwordHash = hashPw(newPw);
    saveUsers(users);
  }
  document.getElementById('st-pw-old').value = '';
  document.getElementById('st-pw-new').value = '';
  document.getElementById('st-pw-confirm').value = '';
  showStMsg('st-pw-ok', '✓ Password changed successfully.');
}

function doSaveFeatures() {
  if (!stSelectedFeatures.size) { showStMsg('st-feat-error', 'Select at least one tool.'); return; }
  const session  = getSession();
  const features = Array.from(stSelectedFeatures);
  updateUserFeatures(session.userId, features);
  const newSession = { ...session, features };
  saveSession(newSession);
  showStMsg('st-feat-ok', '✓ Tools updated. Reloading in 1 second...');
  setTimeout(() => location.reload(), 1200);
}

function doUpgrade() {
  const session = getSession();
  const users   = getUsers();
  const user    = users.find(u => u.id === session.userId);
  if (!user) return;
  user.plan = 'pro';
  saveUsers(users);
  const proSession = { ...session, plan: 'pro' };
  saveSession(proSession);
  renderHeaderUser(proSession);
  renderStPlan(user, proSession);
  showStMsg('st-name-ok', '✓ Upgraded to Pro! Billing activates when subscriptions launch.');
}

async function doDeleteAccount() {
  if (!confirm('Permanently delete your account and all data? This cannot be undone.')) return;
  const session = getSession();
  // Delete from server
  if (session?.token) {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
        body: JSON.stringify({ action: 'delete-account', email: session.email, password: '' })
      });
    } catch (_) {}
  }
  // Clear local data
  let users = getUsers();
  users = users.filter(u => u.id !== session.userId);
  saveUsers(users);
  localStorage.removeItem(getInventoryKey(session.userId));
  localStorage.removeItem(getPriceCacheKey(session.userId));
  localStorage.removeItem('lbl_session');
  location.reload();
}

function showUpgradePrompt() {
  showSettings();
  setTimeout(() => {
    document.getElementById('st-plan-section')?.scrollIntoView({ behavior: 'smooth' });
  }, 150);
}

// ── Whatnot Fee Calculator ────────────────────────────────────────────────────

const FC_CATEGORIES = [
  { label: '6.67%', rate: 0.0667 },
  { label: '4%',    rate: 0.04   },
  { label: '6.67%', rate: 0.0667 },
];

function calcFees() {
  const salePrice  = parseFloat(document.getElementById('fc-price')?.value)    || 0;
  const shipping   = parseFloat(document.getElementById('fc-shipping')?.value) || 0;
  const vatRate    = (parseFloat(document.getElementById('fc-vat')?.value)      || 20) / 100;
  const catIndex   = parseInt(document.getElementById('fc-category')?.value)   || 0;
  const { rate, label } = FC_CATEGORIES[catIndex] || FC_CATEGORIES[0];

  // Commission applies only up to £1,500 (0% on portion above)
  const commissionableAmount = Math.min(salePrice, 1500);
  const commission    = commissionableAmount * rate;
  const vatOnComm     = commission * vatRate;

  // Processing: 2.42% of total order value (sale + shipping) + £0.25 transaction fee
  const totalOrderValue = salePrice + shipping;
  const processingFee   = 0.0242 * totalOrderValue + 0.25;
  const vatOnProc       = processingFee * vatRate;

  const totalFees = commission + vatOnComm + processingFee + vatOnProc;
  const youReceive = Math.max(0, salePrice - totalFees);
  const feePct = salePrice > 0 ? (totalFees / salePrice * 100).toFixed(1) : '0.0';

  const f = n => '£' + n.toFixed(2);
  const d = n => '−£' + n.toFixed(2);

  document.getElementById('fc-r-sale').textContent          = f(salePrice);
  document.getElementById('fc-r-shipping').textContent      = f(shipping);
  document.getElementById('fc-r-rate').textContent          = label;
  document.getElementById('fc-r-commission').textContent    = d(commission);
  document.getElementById('fc-r-vat-pct').textContent       = Math.round(vatRate * 100) + '%';
  document.getElementById('fc-r-vat-pct2').textContent      = Math.round(vatRate * 100) + '%';
  document.getElementById('fc-r-vat-commission').textContent = d(vatOnComm);
  document.getElementById('fc-r-processing').textContent    = d(processingFee);
  document.getElementById('fc-r-vat-processing').textContent = d(vatOnProc);
  document.getElementById('fc-r-total-fees').textContent    = d(totalFees);
  document.getElementById('fc-r-receive').textContent       = f(youReceive);
  document.getElementById('fc-r-pct').textContent           = feePct + '% of sale price taken in fees';
}
