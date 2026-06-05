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
  loadBoxes();     // storage boxes (long/short)
  applyFeatureRestrictions(session.features);
  renderHeaderUser(session);
  renderList();
  renderBoxSelector();
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

  const compressed = compressCanvasToDataUrl(canvas, 1600, 0.85);
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
  let failed = 0;
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
      let identified;
      try {
        identified = await identifyComic(photo.base64, override);
      } catch (firstErr) {
        // One retry for transient AI errors (timeouts, truncation, quota blips)
        showStatus('scan-status', 'info', `<span class="spin">⟳</span> Retrying comic ${i + 1} of ${batch.length}...`);
        await new Promise(r => setTimeout(r, 1000));
        identified = await identifyComic(photo.base64, override);
      }

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
        coverArtist:     identified.coverArtist      || '',
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
        marketInsight:   identified.marketInsight   || '',
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
        possibleDuplicate: checkDuplicate(newTitle, newIssue),
        // ── Stock Room fields ──
        boxId: (typeof activeBoxId !== 'undefined' ? activeBoxId : null),
        sold: false,
        soldPrice: null,
        soldDate: null,
        soldVia: null
      };

      comics.unshift(comic);
      added++;
      renderList();
      fetchEbayPrice(comic);
    } catch (e) {
      console.error(e);
      failed++;
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
    const failNote = failed > 0 ? ` · ⚠ ${failed} couldn't be read — re-upload ${failed === 1 ? 'it' : 'them'}` : '';
    const dupNote = (dupCount > 0 ? ` · ⚠ ${dupCount} possible duplicate${dupCount > 1 ? 's' : ''} flagged` : '') + failNote;
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
    showStatus('scan-status', 'error', failed > 0
      ? `✗ Couldn't read ${failed} image${failed === 1 ? '' : 's'} — try clearer, well-lit photos or upload them one at a time.`
      : '✗ No comics were added.');
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
      const compressed = compressCanvasToDataUrl(temp, 1600, 0.85);
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

// Build a smart bundle title — "Title #295–300 (6 issues)" for a run, else a list.
function makeBundleTitle(selected) {
  const titlesSet = new Set(selected.map(c => (c.title || '').trim()));
  const issuesNum = selected.map(c => parseInt(c.issue, 10)).filter(n => !isNaN(n));
  if (titlesSet.size === 1 && issuesNum.length === selected.length && issuesNum.length >= 2) {
    const sorted = [...issuesNum].sort((a, b) => a - b);
    const min = sorted[0], max = sorted[sorted.length - 1];
    const consecutive = (max - min === sorted.length - 1) &&
      new Set(sorted).size === sorted.length;
    const title = [...titlesSet][0];
    if (consecutive) return `${title} #${min}–${max} (${sorted.length} issues)`;
    return `${title} #${sorted.join(', #')}`.slice(0, 90);
  }
  const labels = selected.map(c => `${c.title}${c.issue !== 'Unknown' ? ' #' + c.issue : ''}`.trim());
  return labels.length <= 2 ? labels.join(' + ') : `${labels[0]} + ${labels.length - 1} others`;
}

// Merge each cover's key info into a readable bundle description.
function makeBundleDescription(selected) {
  // sort by issue number when possible
  const sorted = [...selected].sort((a, b) => {
    const x = parseInt(a.issue, 10), y = parseInt(b.issue, 10);
    if (!isNaN(x) && !isNaN(y)) return x - y;
    return 0;
  });
  const lines = sorted.map(c => {
    const num = c.issue && c.issue !== 'Unknown' ? `#${c.issue}` : c.title;
    const note = c.firstAppearance || c.keyInfo || c.conditionReason || c.condition || '';
    return note ? `• ${num} — ${note}` : `• ${num}`;
  });
  const keyCount = sorted.filter(c => c.isKeyIssue || c.firstAppearance).length;
  const head = `Lot of ${sorted.length} comics${keyCount ? ` (${keyCount} key issue${keyCount > 1 ? 's' : ''})` : ''}:`;
  return `${head}\n${lines.join('\n')}`;
}

function bundleSelected() {
  if (selectedIds.size < 2) return;
  const selected = comics.filter(c => selectedIds.has(c.id));

  const totalPrice = selected.reduce((s, c) => s + (getWhatnotPrice(c) || 0), 0);
  const totalCost = selected.reduce((s, c) => s + (c.costPrice || 0), 0);
  const hasCost = selected.some(c => c.costPrice != null);

  const titles = selected.map(c => `${c.title}${c.issue !== 'Unknown' ? ' #' + c.issue : ''}`.trim());
  const bundleTitle = makeBundleTitle(selected);
  const bundleDesc = makeBundleDescription(selected);

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
    keyInfo: bundleDesc, firstAppearance: '',
    isKeyIssue: selected.some(c => c.isKeyIssue || c.firstAppearance), lowPrintRun: false, printRunNote: '',
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

// ── Smart bundle suggestions (runs of the same title) ─────────────────────────
function getBundleSuggestions() {
  const groups = {};
  comics.forEach(c => {
    if (c.isBundle || c.sold) return;
    const t = (c.title || '').trim();
    if (!t || t === 'Unknown') return;
    (groups[t] = groups[t] || []).push(c);
  });
  return Object.entries(groups)
    .filter(([, arr]) => arr.length >= 2)
    .map(([title, arr]) => {
      const nums = arr.map(c => parseInt(c.issue, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      let range = '';
      if (nums.length === arr.length && nums.length >= 2) {
        const min = nums[0], max = nums[nums.length - 1];
        range = (max - min === nums.length - 1 && new Set(nums).size === nums.length)
          ? `#${min}–${max}` : `#${nums.join(', #')}`;
      }
      return { title, count: arr.length, range, value: arr.reduce((s, c) => s + (getWhatnotPrice(c) || 0), 0) };
    })
    .sort((a, b) => b.count - a.count);
}

// One-tap: select every (unsold, non-bundle) issue of a title, then bundle.
function bundleRun(title) {
  const ids = comics.filter(c => !c.isBundle && !c.sold && (c.title || '').trim() === title).map(c => c.id);
  if (ids.length < 2) return;
  selectedIds = new Set(ids);
  bundleSelected();
}

// HTML banner(s) shown atop the archive when bundleable runs exist.
function bundleBannerHtml() {
  const sugg = getBundleSuggestions();
  if (!sugg.length) return '';
  return sugg.slice(0, 3).map(s => `
    <div class="bundle-suggest">
      <span class="bundle-suggest-ic">📦</span>
      <div class="bundle-suggest-txt"><strong>${escapeHtml(s.title)}</strong>${s.range ? ` <span class="bundle-suggest-range">${escapeHtml(s.range)}</span>` : ''} · ${s.count} issues${s.value ? ` · est. £${Math.round(s.value)}` : ''}</div>
      <button class="bundle-suggest-btn" data-t="${escapeHtml(s.title)}" onclick="bundleRun(this.dataset.t)">Bundle</button>
    </div>`).join('');
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
    const compressed = compressCanvasToDataUrl(temp, 1600, 0.85);
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
    list.innerHTML = `<div class="empty-state empty-state-onboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      <div class="empty-title">Archive is empty</div>
      <div class="empty-steps">
        <div class="empty-step"><span class="empty-num">1</span> Point your camera at a comic cover</div>
        <div class="empty-step"><span class="empty-num">2</span> AI identifies title, edition &amp; condition</div>
        <div class="empty-step"><span class="empty-num">3</span> Live eBay UK price fetched automatically</div>
      </div>
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
        cls = 'comic-price notfound'; titleText = 'No UK eBay results found — click ✏ to set a price manually'; display = '—';
      } else {
        cls = 'comic-price error'; titleText = 'eBay price lookup failed — click to retry'; display = '↻';
      }
      const conf = c.ebayConfidence || 0;
      const thinData = c.ebayStatus === 'ok' && (c.ebayCount < 3 || conf < 40);
      const ebayCount = c.ebayCount ?? 0;
      const confLabel = conf >= 70 ? '' : conf >= 40 ? `⚠ ${ebayCount}` : `⚠ LOW`;
      const confTitle = conf >= 70 ? '' : `${ebayCount} sold comp${ebayCount === 1 ? '' : 's'} · confidence ${conf}% — treat as estimate`;
      const retryBtn = (c.ebayStatus === 'error')
        ? `<button class="btn-edit-price" onclick="retryEbayPrice(${c.id})" title="Retry eBay lookup" style="color:var(--amber)">↻ retry</button>`
        : `<button class="btn-edit-price" onclick="startEditPrice(${c.id})" title="Edit price">✏ edit</button>`;
      priceHtml = `<div class="price-col">
        <span class="${cls}" title="${escapeHtml(titleText)}">${display}</span>
        ${thinData ? `<span class="price-thin" title="${confTitle}">${confLabel}</span>` : ''}
        ${retryBtn}
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
          ${c.isVariant ? `<span class="cbadge cbadge-variant" title="${escapeHtml(c.variantDetails)}">✦ ${c.coverArtist ? escapeHtml(c.coverArtist) + ' ' : ''}Variant</span>` : ''}
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

  // Prepend bundle suggestions (runs of the same title) above the cards.
  if (!selectMode) list.innerHTML = bundleBannerHtml() + list.innerHTML;

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
  // Show — instead of £0 when no comics have been priced yet
  document.getElementById('stat-total').textContent = priced.length ? '£' + totalVal.toFixed(0) : '—';

  if (withCost.length > 0) {
    const totalProfit = withCost.reduce((s, c) => s + (getWhatnotPrice(c) * 0.89 - c.costPrice) * (c.qty || 1), 0);
    document.getElementById('stat-avg').textContent = (totalProfit >= 0 ? '+£' : '-£') + Math.abs(totalProfit).toFixed(0);
    document.getElementById('stat-avg-label').textContent = 'Est. Profit';
    document.getElementById('stat-avg').style.color = totalProfit >= 0 ? '#00cfbe' : 'var(--red)';
  } else {
    document.getElementById('stat-avg').textContent = priced.length ? '£' + avg.toFixed(0) : '—';
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

function retryEbayPrice(id) {
  const comic = comics.find(c => c.id === id);
  if (!comic) return;
  comic.ebayStatus = 'loading';
  comic.ebayPrice = null;
  renderList();
  fetchEbayPrice(comic, true);
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
  const compressed = compressCanvasToDataUrl(lkCanvas, 1600, 0.85);
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
  // Restore the empty/intel state
  document.getElementById('lk-result').style.display = 'none';
  const emptyEl = document.getElementById('lk-empty'); if (emptyEl) emptyEl.style.display = '';
  const ipEl = document.getElementById('lk-intel-panel'); if (ipEl) ipEl.style.display = '';
  const paneEl = document.getElementById('pane-lookup'); if (paneEl) paneEl.classList.remove('lk-has-result');
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
    const compressed = compressCanvasToDataUrl(temp, 1600, 0.85);
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

// Format an eBay endDate (ISO) → "DD/MM/YY"; '' if unparseable.
function fmtSaleDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(2)}`;
}

// Compute a price trend from dated eBay results. Returns null if not enough data.
function computeTrend(results) {
  const dated = (results || [])
    .filter(r => r.price > 0 && r.endDate && !isNaN(new Date(r.endDate)))
    .map(r => ({ price: Number(r.price), t: new Date(r.endDate).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (dated.length < 4) return null;
  const half = Math.floor(dated.length / 2);
  const older = dated.slice(0, half);
  const newer = dated.slice(dated.length - half);
  const avg = arr => arr.reduce((s, x) => s + x.price, 0) / arr.length;
  const o = avg(older), n = avg(newer);
  if (!o) return null;
  const pct = ((n - o) / o) * 100;
  const dir = pct > 3 ? 'BULLISH' : pct < -3 ? 'BEARISH' : 'STABLE';
  return { pct: Math.round(pct * 10) / 10, dir };
}

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

  // ── Clean "detail" layout (readable, amber, light/dark aware) ──
  const issueStr = c.issue && c.issue !== 'Unknown' ? ' #' + escapeHtml(c.issue) : '';
  const description = c.firstAppearance || c.keyInfo || c.conditionReason || '';
  const chips = [c.publisher, c.year, editionStr].filter(x => x && x !== 'Unknown')
    .map(x => `<span class="lkd-chip">${escapeHtml(x)}</span>`).join('');

  // Bento stats from real data
  const bento = [];
  if (ebay && ebay.found) {
    bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">${isActiveListing ? 'Est. (Active)' : 'Est. Market Value'}</span><span class="lkd-stat-val amber">£${ebay.median}</span></div>`);
    bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">Sold Range</span><span class="lkd-stat-val sm">£${ebay.min} – £${ebay.max}</span></div>`);
  } else {
    bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">Est. Market Value</span><span class="lkd-stat-val sm muted">No UK data</span></div>`);
  }
  if (c.conditionGrade) bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">Est. Grade</span><span class="lkd-stat-val">${escapeHtml(c.conditionGrade)}${cgcInfo ? ` <small>${escapeHtml(cgcInfo.label)}</small>` : ''}</span></div>`);
  else if (condVal) bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">Condition</span><span class="lkd-stat-val sm">${escapeHtml(condVal)}</span></div>`);
  if (ebay && ebay.found) bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">UK ${isActiveListing ? 'Listings' : 'Sales'}</span><span class="lkd-stat-val">${ebay.count}</span></div>`);

  // Trend index (computed from dated eBay sales)
  const trend = computeTrend(ebay && ebay.results);
  if (trend) {
    const tc = trend.dir === 'BULLISH' ? 'green' : trend.dir === 'BEARISH' ? 'red' : '';
    const arrow = trend.dir === 'BULLISH' ? '↗' : trend.dir === 'BEARISH' ? '↘' : '→';
    bento.push(`<div class="lkd-stat"><span class="lkd-stat-lbl">Trend (eBay)</span><span class="lkd-stat-val sm ${tc}">${arrow} ${trend.pct > 0 ? '+' : ''}${trend.pct}% <small>${trend.dir}</small></span></div>`);
  }
  // CGC population — no free API, so link to the official census instead of a fake number
  bento.push(`<a class="lkd-stat lkd-stat-link" href="${escapeHtml(censusUrl)}" target="_blank" rel="noopener"><span class="lkd-stat-lbl">CGC Population</span><span class="lkd-stat-val sm">View Census →</span></a>`);

  // UK market history (real dated eBay rows)
  const history = ((ebay && ebay.results) || [])
    .filter(r => r.price > 0 && r.endDate && !isNaN(new Date(r.endDate)))
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
    .slice(0, 6);
  const historyHtml = history.length ? `
      <section class="lkd-section">
        <h3 class="lkd-h3">UK Market History</h3>
        <div class="lkd-table">
          <div class="lkd-tr lkd-th"><span>Date</span><span>Platform</span><span>Type</span><span class="r">Price</span></div>
          ${history.map(r => `<a class="lkd-tr" href="${escapeHtml(r.url || soldUrl)}" target="_blank" rel="noopener"><span>${fmtSaleDate(r.endDate)}</span><span>eBay UK</span><span>${r.sold ? 'Sold' : 'Listed'}</span><span class="r">£${Math.round(r.price)}</span></a>`).join('')}
        </div>
      </section>` : '';

  // Pro collector insight (AI-generated, clearly labelled)
  const insightHtml = c.marketInsight ? `
      <section class="lkd-section">
        <h3 class="lkd-h3">Pro Collector Insights</h3>
        <div class="lkd-insight">
          <p>${escapeHtml(c.marketInsight)}</p>
          <span class="lkd-insight-tag">✦ AI insight</span>
        </div>
      </section>` : '';

  // Technical spec rows from available fields
  const specRows = [
    ['Publisher', c.publisher],
    ['Characters', c.importantCharacters],
    ['Cover Artist', c.coverArtist],
    ['Edition', editionStr],
    ['Condition', condVal],
    ['Year', c.year],
  ].filter(([, v]) => v && v !== 'Unknown')
   .map(([k, v]) => `<div class="lkd-spec"><span class="lkd-spec-k">${k}</span><span class="lkd-spec-v">${escapeHtml(v)}</span></div>`).join('');

  // Note cards (key info, variant, signature, print run)
  const notes = [
    c.firstAppearance && !description.includes(c.firstAppearance) ? ['First Appearance', c.firstAppearance] : null,
    c.keyInfo && c.keyInfo !== c.firstAppearance ? ['Key Issue Info', c.keyInfo] : null,
    c.variantDetails ? ['Variant Details', c.variantDetails] : null,
    c.printRunNote ? ['Print Run', c.printRunNote] : null,
    c.sigDetails ? ['Signature', c.sigDetails] : null,
    cgcInfo ? ['Grading Guidance', cgcInfo.note] : null,
  ].filter(Boolean)
   .map(([k, v]) => `<div class="lkd-note"><div class="lkd-note-k">${k}</div><div class="lkd-note-v">${escapeHtml(v)}</div></div>`).join('');

  document.getElementById('lk-result').innerHTML = `
    <div class="lkd">
      <button class="lkd-back" onclick="lkRetake()">← New Lookup</button>
      ${c.photoAdvice ? `<div class="lkd-tip"><span class="lkd-tip-k">Photo tip</span> ${escapeHtml(c.photoAdvice)}</div>` : ''}

      <div class="lkd-cover-wrap">
        <img class="lkd-cover" src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(c.title)}" />
        ${c.isSlabbed ? `<span class="lkd-slab-badge">${escapeHtml(c.slabCompany || 'SLAB')}${c.slabGrade ? ' ' + escapeHtml(c.slabGrade) : ''}</span>` : ''}
      </div>

      <div class="lkd-actions">
        <a class="lkd-btn primary" href="${escapeHtml(soldUrl)}" target="_blank" rel="noopener">eBay Sold</a>
        <a class="lkd-btn" href="${escapeHtml(censusUrl)}" target="_blank" rel="noopener">CGC Census</a>
      </div>

      ${chips ? `<div class="lkd-chips">${chips}</div>` : ''}
      <h1 class="lkd-title">${escapeHtml(c.title)}${issueStr}</h1>
      ${description ? `<p class="lkd-desc">${escapeHtml(description)}</p>` : ''}
      ${badges ? `<div class="comic-badges lkd-badges">${badges}</div>` : ''}

      ${bento.length ? `<div class="lkd-bento">${bento.join('')}</div>` : ''}

      ${specRows ? `<section class="lkd-section">
        <h3 class="lkd-h3">Technical Specifications</h3>
        <div class="lkd-specs">${specRows}</div>
      </section>` : ''}

      ${(ebay && ebay.found) ? `<section class="lkd-section">
        <h3 class="lkd-h3">eBay UK ${isActiveListing ? 'Active Listings' : 'Sold · Last 90 Days'}</h3>
        ${isActiveListing ? `<div class="lkd-warn">Asking prices, not confirmed sales. Add production eBay keys for true sold data.</div>` : ''}
        <div class="lkd-pricebar">
          <div><span class="lkd-pb-lbl">Low</span><span class="lkd-pb-val">£${ebay.min}</span></div>
          <div class="lkd-pb-mid"><span class="lkd-pb-lbl">Median</span><span class="lkd-pb-val amber">£${ebay.median}</span></div>
          <div><span class="lkd-pb-lbl">High</span><span class="lkd-pb-val">£${ebay.max}</span></div>
        </div>
        <a class="lkd-link" href="${escapeHtml(soldUrl)}" target="_blank" rel="noopener">View ${ebay.count} ${isActiveListing ? 'listings' : 'sold listings'} on eBay →</a>
      </section>` : ''}

      ${historyHtml}

      ${insightHtml}

      ${notes ? `<section class="lkd-section">
        <h3 class="lkd-h3">Collector Notes</h3>
        <div class="lkd-notes">${notes}</div>
      </section>` : ''}
    </div>
  `;

  document.getElementById('lk-result').style.display = 'flex';
  // Hide the heavy "Archive Intelligence" reference panel + empty state while a
  // result is shown — cleaner and lighter (reduces lookup lag on mobile).
  const ipEl = document.getElementById('lk-intel-panel'); if (ipEl) ipEl.style.display = 'none';
  const emptyEl = document.getElementById('lk-empty'); if (emptyEl) emptyEl.style.display = 'none';
  const paneEl = document.getElementById('pane-lookup'); if (paneEl) paneEl.classList.add('lk-has-result');
}

// ── Mobile navigation ─────────────────────────────────────────────────────────

function isMobile() { return window.innerWidth <= 768; }

let activeMobileTab = 'scan';

function switchMobileTab(tab) {
  if (!isMobile()) return;

  // "More" opens a bottom sheet, doesn't change the screen.
  if (tab === 'more') { openMobMore(); return; }

  activeMobileTab = tab;
  const app = document.getElementById('main-app');
  if (app) app.dataset.mobtab = tab;   // CSS uses this to show the right screen

  ['scan', 'inventory', 'stock', 'lookup'].forEach(t => {
    document.getElementById('mnav-' + t)?.classList.toggle('active', t === tab);
  });

  if (tab === 'lookup') {
    switchTab('lookup');
    // Do NOT auto-start the camera — let the user choose Activate or Upload.
    return;
  }
  if (tab === 'stock') {
    switchTab('stock');
    return;
  }
  // 'scan' and 'inventory' both live in the export pane; CSS shows the
  // camera tool for 'scan' and the archive for 'inventory'.
  // Camera is started only when the user taps Activate.
  switchTab('export');
}

function openMobMore() {
  const m = document.getElementById('mob-more-sheet');
  if (m) m.style.display = 'flex';
}
function closeMobMore() {
  const m = document.getElementById('mob-more-sheet');
  if (m) m.style.display = 'none';
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

/* ═══════════════════════════════════════════════════════════════════
   STOCK ROOM  —  storage boxes (long/short), assignment, sold tracking
═══════════════════════════════════════════════════════════════════ */
const BOX_CAP = { long: 300, short: 175 };
let boxes = [];
let activeBoxId = null;
let openBoxId = null;          // box currently opened in Stock Room detail
let soldModalComicId = null;   // comic being marked sold
let newBoxReturnTab = 'stock';

function getBoxesKey(uid)   { return 'lbl_boxes_' + uid; }
function getActiveBoxKey(uid){ return 'lbl_activebox_' + uid; }

function loadBoxes() {
  if (!currentUserId) return;
  try { boxes = JSON.parse(localStorage.getItem(getBoxesKey(currentUserId)) || '[]'); } catch { boxes = []; }
  if (!Array.isArray(boxes)) boxes = [];
  try { activeBoxId = localStorage.getItem(getActiveBoxKey(currentUserId)) || null; } catch { activeBoxId = null; }
  if (!boxes.some(b => b.id === activeBoxId)) activeBoxId = boxes[0] ? boxes[0].id : null;
}
function saveBoxes() {
  if (!currentUserId) return;
  try { localStorage.setItem(getBoxesKey(currentUserId), JSON.stringify(boxes)); } catch {}
}
function saveActiveBox() {
  if (!currentUserId) return;
  try { localStorage.setItem(getActiveBoxKey(currentUserId), activeBoxId || ''); } catch {}
}
function setActiveBox(id) { activeBoxId = id || null; saveActiveBox(); renderBoxSelector(); }

function createBox(name, type) {
  const box = {
    id: 'box_' + Date.now() + '_' + Math.floor(Math.random() * 999),
    name: (name || '').trim() || ('Box ' + (boxes.length + 1)),
    type: (type === 'short' ? 'short' : 'long'),
    createdAt: Date.now()
  };
  boxes.push(box);
  saveBoxes();
  activeBoxId = box.id; saveActiveBox();
  return box;
}
function renameBox(id, name) {
  const b = boxes.find(x => x.id === id);
  if (b) { b.name = (name || '').trim() || b.name; saveBoxes(); }
}
function deleteBox(id) {
  boxes = boxes.filter(b => b.id !== id);
  comics.forEach(c => { if (c.boxId === id) c.boxId = null; });
  saveBoxes(); saveInventory();
  if (activeBoxId === id) { activeBoxId = boxes[0] ? boxes[0].id : null; saveActiveBox(); }
  if (openBoxId === id) openBoxId = null;
}

function boxComics(id) { return comics.filter(c => c.boxId === id); }
function boxCap(box)   { return BOX_CAP[box.type] || BOX_CAP.long; }
function bnum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function comicValue(c) { return bnum(c.customPrice) || bnum(c.ebayPrice) || bnum(c.soldPrice) || 0; }
function gbp(n) { return '£' + (Math.round(bnum(n) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function boxStats(id) {
  const list = boxComics(id);
  const inStock = list.filter(c => !c.sold);
  const sold    = list.filter(c => c.sold);
  return {
    count: list.length,
    inStock: inStock.length,
    soldCount: sold.length,
    value: inStock.reduce((s, c) => s + comicValue(c) * (c.qty || 1), 0),
    cost: list.reduce((s, c) => s + bnum(c.costPrice) * (c.qty || 1), 0),
    revenue: sold.reduce((s, c) => s + bnum(c.soldPrice) * (c.qty || 1), 0),
  };
}

// ── Scanning tab: active-box selector ──────────────────────────────
function renderBoxSelector() {
  const sel = document.getElementById('active-box-select');
  if (!sel) return;
  if (!boxes.length) {
    sel.innerHTML = '<option value="">No boxes yet — create one</option><option value="__new__">＋ New box…</option>';
    sel.value = '';
    return;
  }
  sel.innerHTML = boxes.map(b => {
    const st = boxStats(b.id);
    return '<option value="' + b.id + '">' + escapeHtml(b.name) + ' · ' + (b.type === 'long' ? 'Long' : 'Short') + ' (' + st.count + '/' + boxCap(b) + ')</option>';
  }).join('') + '<option value="__new__">＋ New box…</option>';
  sel.value = activeBoxId || boxes[0].id;
}
function onActiveBoxChange() {
  const sel = document.getElementById('active-box-select');
  if (!sel) return;
  if (sel.value === '__new__') { openNewBoxModal('export'); renderBoxSelector(); return; }
  setActiveBox(sel.value);
}

// ── New Box modal ──────────────────────────────────────────────────
function openNewBoxModal(returnTab) {
  newBoxReturnTab = returnTab || 'stock';
  const m = document.getElementById('newbox-modal');
  if (!m) return;
  document.getElementById('nb-name').value = '';
  document.querySelectorAll('input[name="nb-type"]').forEach((r, i) => r.checked = i === 0);
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('nb-name').focus(), 50);
}
function closeNewBoxModal() {
  const m = document.getElementById('newbox-modal');
  if (m) m.style.display = 'none';
}
function confirmNewBox() {
  const name = document.getElementById('nb-name').value;
  const typeEl = document.querySelector('input[name="nb-type"]:checked');
  createBox(name, typeEl ? typeEl.value : 'long');
  closeNewBoxModal();
  renderBoxSelector();
  if (newBoxReturnTab === 'stock') renderStockRoom();
}

// ── Sold modal ─────────────────────────────────────────────────────
function openSoldModal(comicId) {
  soldModalComicId = comicId;
  const c = comics.find(x => x.id == comicId);
  const m = document.getElementById('sold-modal');
  if (!m || !c) return;
  document.getElementById('sm-price').value = c.soldPrice != null ? c.soldPrice : (bnum(c.customPrice) || bnum(c.ebayPrice) || '');
  document.getElementById('sm-date').value  = c.soldDate || new Date().toISOString().slice(0, 10);
  document.getElementById('sm-via').value   = c.soldVia || 'eBay';
  m.style.display = 'flex';
  setTimeout(() => document.getElementById('sm-price').focus(), 50);
}
function closeSoldModal() {
  const m = document.getElementById('sold-modal');
  if (m) m.style.display = 'none';
  soldModalComicId = null;
}
function confirmSold() {
  const c = comics.find(x => x.id == soldModalComicId);
  if (!c) { closeSoldModal(); return; }
  c.sold = true;
  c.soldPrice = bnum(document.getElementById('sm-price').value) || null;
  c.soldDate  = document.getElementById('sm-date').value || null;
  c.soldVia   = document.getElementById('sm-via').value || null;
  saveInventory();
  closeSoldModal();
  renderStockRoom();
}
function markUnsold(comicId) {
  const c = comics.find(x => x.id == comicId);
  if (!c) return;
  c.sold = false; c.soldPrice = null; c.soldDate = null; c.soldVia = null;
  saveInventory();
  renderStockRoom();
}
function moveComicToBox(comicId, boxId) {
  const c = comics.find(x => x.id == comicId);
  if (!c) return;
  c.boxId = boxId || null;
  saveInventory();
  renderStockRoom();
}

// ── Stock Room rendering ───────────────────────────────────────────
function openBox(id) { openBoxId = id; renderStockRoom(); }
function closeBox()  { openBoxId = null; renderStockRoom(); }

function renderStockRoom() {
  const root = document.getElementById('stockroom-root');
  if (!root) return;
  if (openBoxId && (openBoxId === '__unassigned__' || boxes.some(b => b.id === openBoxId))) {
    root.innerHTML = renderBoxDetail(openBoxId);
  } else {
    openBoxId = null;
    root.innerHTML = renderBoxGrid();
  }
}

function renderBoxGrid() {
  const inStockAll = comics.filter(c => !c.sold);
  const soldAll    = comics.filter(c => c.sold);
  const value = inStockAll.reduce((s, c) => s + comicValue(c) * (c.qty || 1), 0);

  const stats =
    '<div class="sr-stat-grid">' +
      '<div class="sr-stat"><div class="sr-stat-lbl">Boxes</div><div class="sr-stat-val">' + boxes.length + '</div></div>' +
      '<div class="sr-stat"><div class="sr-stat-lbl">In Stock</div><div class="sr-stat-val">' + inStockAll.length + '</div></div>' +
      '<div class="sr-stat"><div class="sr-stat-lbl">Sold</div><div class="sr-stat-val sr-green">' + soldAll.length + '</div></div>' +
      '<div class="sr-stat"><div class="sr-stat-lbl">Collection Value</div><div class="sr-stat-val sr-amber">' + gbp(value) + '</div></div>' +
    '</div>';

  const unassigned = comics.filter(c => !c.boxId);
  const unassignedCard = unassigned.length ?
    '<button class="sr-box-card sr-box-unassigned" onclick="openBox(\'__unassigned__\')">' +
      '<div class="sr-box-head"><span class="sr-box-name">Unsorted</span><span class="sr-box-chip">INBOX</span></div>' +
      '<div class="sr-box-count">' + unassigned.length + '<span> comics</span></div>' +
      '<div class="sr-box-foot"><span>Not filed into a box yet</span></div>' +
    '</button>' : '';

  const cards = boxes.map(b => {
    const st = boxStats(b.id);
    const cap = boxCap(b);
    const pct = Math.min(100, Math.round((st.count / cap) * 100));
    const over = st.count > cap;
    return '<button class="sr-box-card" onclick="openBox(\'' + b.id + '\')">' +
      '<div class="sr-box-head"><span class="sr-box-name">' + escapeHtml(b.name) + '</span>' +
      '<span class="sr-box-chip ' + b.type + '">' + (b.type === 'long' ? 'LONG' : 'SHORT') + '</span></div>' +
      '<div class="sr-box-count ' + (over ? 'over' : '') + '">' + st.count + '<span> / ' + cap + '</span></div>' +
      '<div class="sr-fill"><div class="sr-fill-bar ' + (over ? 'over' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="sr-box-foot"><span>' + st.inStock + ' in stock</span><span class="sr-green">' + st.soldCount + ' sold</span><span class="sr-amber">' + gbp(st.value) + '</span></div>' +
      (over ? '<div class="sr-box-warn">⚠ Over capacity</div>' : '') +
    '</button>';
  }).join('');

  return stats +
    '<div class="sr-section-row"><div class="sr-section-label">Your Boxes</div>' +
    '<button class="sr-newbox-btn" onclick="openNewBoxModal(\'stock\')">＋ New Box</button></div>' +
    '<div class="sr-box-grid">' + cards + unassignedCard +
      '<button class="sr-box-card sr-box-add" onclick="openNewBoxModal(\'stock\')">' +
        '<div class="sr-add-plus">＋</div><div class="sr-add-label">Create a box</div>' +
        '<div class="sr-add-hint">Long (300) or Short (175)</div></button>' +
    '</div>';
}

function renderBoxDetail(id) {
  const isInbox = id === '__unassigned__';
  const box = isInbox ? null : boxes.find(b => b.id === id);
  if (!isInbox && !box) { openBoxId = null; return renderBoxGrid(); }
  const list = isInbox ? comics.filter(c => !c.boxId) : boxComics(id);
  const name = isInbox ? 'Unsorted' : box.name;
  const cap = isInbox ? null : boxCap(box);
  const inStock = list.filter(c => !c.sold);
  const sold = list.filter(c => c.sold);
  const st = {
    count: list.length, inStock: inStock.length, soldCount: sold.length,
    value: inStock.reduce((s, c) => s + comicValue(c) * (c.qty || 1), 0),
    revenue: sold.reduce((s, c) => s + bnum(c.soldPrice) * (c.qty || 1), 0)
  };
  const over = cap && st.count > cap;
  const pct = cap ? Math.min(100, Math.round((st.count / cap) * 100)) : 0;
  const profit = st.revenue - sold.reduce((s, c) => s + bnum(c.costPrice) * (c.qty || 1), 0);

  const moveOpts = (cur) => boxes.map(b =>
    '<option value="' + b.id + '"' + (b.id === cur ? ' selected' : '') + '>' + escapeHtml(b.name) + '</option>').join('')
    + '<option value=""' + (!cur ? ' selected' : '') + '>— Unsorted —</option>';

  const rows = list.length ? list.map(c => {
    const title = escapeHtml(c.title) + (c.issue && c.issue !== 'Unknown' ? ' #' + escapeHtml(c.issue) : '');
    const meta = [c.publisher, c.year, c.condition].filter(x => x && x !== 'Unknown').map(escapeHtml).join(' · ');
    const price = c.sold ? gbp(c.soldPrice) : (comicValue(c) ? gbp(comicValue(c)) : '—');
    const soldNote = c.sold ? ' · <span class="sr-green">SOLD ' + (c.soldDate || '') + (c.soldVia ? ' · ' + escapeHtml(c.soldVia) : '') + '</span>' : '';
    return '<div class="sr-row ' + (c.sold ? 'is-sold' : '') + '">' +
      '<img class="sr-row-thumb" src="' + (c.thumb || '') + '" alt="" />' +
      '<div class="sr-row-info"><div class="sr-row-title">' + title + (c.isKeyIssue ? ' <span class="sr-key">★</span>' : '') + '</div>' +
      '<div class="sr-row-meta">' + (meta || '—') + soldNote + '</div></div>' +
      '<select class="sr-row-move" onchange="moveComicToBox(' + c.id + ', this.value)" title="Move to box">' + moveOpts(isInbox ? '' : id) + '</select>' +
      '<div class="sr-row-price ' + (c.sold ? 'sr-green' : '') + '">' + price + '</div>' +
      (c.sold
        ? '<button class="sr-sold-btn done" onclick="markUnsold(' + c.id + ')" title="Mark back in stock">✓ Sold</button>'
        : '<button class="sr-sold-btn" onclick="openSoldModal(' + c.id + ')">Mark Sold</button>') +
    '</div>';
  }).join('') : '<div class="sr-empty">This box is empty. Set it active on the Scanning tab, or move comics in from another box.</div>';

  return '<div class="sr-detail-head"><button class="sr-back" onclick="closeBox()">← All Boxes</button>' +
    (isInbox ? '' : '<button class="sr-mini-btn" onclick="promptRenameBox(\'' + id + '\')">✎ Rename</button>' +
      '<button class="sr-mini-btn danger" onclick="confirmDeleteBox(\'' + id + '\')">🗑 Delete</button>') +
    '</div>' +
    '<div class="sr-detail-title-row"><h1 class="sr-detail-title">' + escapeHtml(name) + '</h1>' +
    (isInbox ? '<span class="sr-box-chip">INBOX</span>' : '<span class="sr-box-chip ' + box.type + '">' + (box.type === 'long' ? 'LONG · 300' : 'SHORT · 175') + '</span>') + '</div>' +
    (cap ? '<div class="sr-detail-fill"><div class="sr-fill"><div class="sr-fill-bar ' + (over ? 'over' : '') + '" style="width:' + pct + '%"></div></div><span class="sr-fill-txt ' + (over ? 'over' : '') + '">' + st.count + ' / ' + cap + (over ? ' · over capacity' : '') + '</span></div>' : '') +
    '<div class="sr-detail-stats">' +
      '<div class="sr-dstat"><span>' + st.inStock + '</span>In stock</div>' +
      '<div class="sr-dstat"><span class="sr-green">' + st.soldCount + '</span>Sold</div>' +
      '<div class="sr-dstat"><span class="sr-amber">' + gbp(st.value) + '</span>Stock value</div>' +
      '<div class="sr-dstat"><span class="sr-green">' + gbp(st.revenue) + '</span>Revenue</div>' +
      '<div class="sr-dstat"><span class="' + (profit >= 0 ? 'sr-green' : 'sr-red') + '">' + gbp(profit) + '</span>Profit</div>' +
    '</div>' +
    '<div class="sr-rows">' + rows + '</div>';
}

function promptRenameBox(id) {
  const b = boxes.find(x => x.id === id);
  if (!b) return;
  const name = prompt('Rename box:', b.name);
  if (name !== null) { renameBox(id, name); renderStockRoom(); renderBoxSelector(); }
}
function confirmDeleteBox(id) {
  const b = boxes.find(x => x.id === id);
  if (!b) return;
  const n = boxComics(id).length;
  if (confirm('Delete "' + b.name + '"?' + (n ? ' Its ' + n + ' comic(s) move to Unsorted (not deleted).' : ''))) {
    deleteBox(id); renderStockRoom(); renderBoxSelector();
  }
}
