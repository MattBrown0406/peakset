"use strict";

// Progress photos: standard poses, ghost-overlay capture (native camera),
// gallery, and before/after comparison. Image files live outside
// localStorage: Documents/ProgressPhotos on iOS, IndexedDB in a browser.

const PHOTO_POSES = [
  ["front-relaxed", "Front relaxed"],
  ["front-double-biceps", "Front double biceps"],
  ["front-lat-spread", "Front lat spread"],
  ["side-chest", "Side chest"],
  ["side-triceps", "Side triceps"],
  ["back-double-biceps", "Back double biceps"],
  ["back-lat-spread", "Back lat spread"],
  ["abs-thigh", "Abdominals and thigh"],
  ["most-muscular", "Most muscular"],
  ["back-relaxed", "Back relaxed"]
];
const PHOTO_DB = "mass-method-photos";
const PHOTO_STORE = "photos";
const PHOTO_MAX_EDGE = 1600;
const browserPhotoUrls = new Map();
const pendingThumbnailRequests = new Map();

function photosMigrateState() {
  if (!Array.isArray(state.progressPhotos)) state.progressPhotos = [];
  const seenIds = new Set();
  state.progressPhotos = state.progressPhotos.filter((photo) => {
    if (!photo || typeof photo !== "object" || !/^[A-Za-z0-9-]+$/.test(String(photo.id || "")) || seenIds.has(photo.id)) return false;
    seenIds.add(photo.id);
    return true;
  });
  if (!PHOTO_POSES.some(([key]) => key === state.photoPose)) state.photoPose = PHOTO_POSES[0][0];
  if (!state.photoCompare || typeof state.photoCompare !== "object") state.photoCompare = { beforeId: "", afterId: "", mode: "side" };
}

photosMigrateState();

function poseLabel(key) {
  return PHOTO_POSES.find(([value]) => value === key)?.[1] || "Pose";
}

function nativePhotoBridge() {
  return window.webkit?.messageHandlers?.peaksetPhoto || null;
}

// Earlier modules re-render during reset before this module migrates state.
function progressPhotoList() {
  return Array.isArray(state.progressPhotos) ? state.progressPhotos : [];
}

function photosForPose(pose) {
  return progressPhotoList()
    .filter((photo) => photo.pose === pose)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function latestPhotoForPose(pose) {
  return photosForPose(pose).at(-1) || null;
}

function photoSrc(photo) {
  if (!photo) return "";
  if (photo.storage === "native") return `massmethod-photo://photo/${encodeURIComponent(photo.id)}.jpg`;
  return browserPhotoUrls.get(photo.id) || "";
}

function photoImg(photo, className = "", extra = "") {
  if (!photo) return "";
  const alt = `${poseLabel(photo.pose)}, ${formatShortDate(photo.date)}`;
  return `<img class="${className}" data-photo-id="${escapeHtml(photo.id)}" src="${escapeHtml(photoSrc(photo))}" alt="${escapeHtml(alt)}" loading="lazy" onerror="photoMissing(this)" ${extra} />`;
}

// A photo record whose file is not on this iPhone (restored from a backup
// file, still downloading from iCloud, or deleted) shows a labelled tile
// instead of a broken image.
function photoMissing(img, force = false) {
  if (!img || img.dataset.missing) return;
  // A browser-stored photo renders with an empty src until its file is read.
  if (!force && !img.getAttribute("src")) return;
  img.dataset.missing = "1";
  img.classList.add("photo-missing");
  img.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#16213a"/><text x="150" y="190" fill="#9fb0d0" font-family="-apple-system,sans-serif" font-size="22" text-anchor="middle">Photo not on</text><text x="150" y="222" fill="#9fb0d0" font-family="-apple-system,sans-serif" font-size="22" text-anchor="middle">this iPhone yet</text></svg>')}`;
  img.alt = `${img.alt}: photo not on this iPhone yet`;
}

function setPhotoPose(pose) {
  if (!PHOTO_POSES.some(([key]) => key === pose)) return;
  state.photoPose = pose;
  state.photoCompare = { ...state.photoCompare, beforeId: "", afterId: "" };
  saveState();
  render();
}

function addPhotoRecord(record) {
  // The native "saved" reply can be redelivered after a web process reload.
  if (state.progressPhotos.some((photo) => photo.id === record.id)) return;
  state.progressPhotos.push(record);
  state.photoPose = record.pose;
  state.photoCompare = { ...state.photoCompare, beforeId: "", afterId: "" };
  saveState();
  toast(`${poseLabel(record.pose)} photo saved.`);
  render();
}

function capturePhoto(source = "camera") {
  const pose = state.photoPose;
  const bridge = nativePhotoBridge();
  if (bridge) {
    const ghost = latestPhotoForPose(pose);
    bridge.postMessage({ action: source === "library" ? "library" : "capture", pose, poseLabel: poseLabel(pose), ghostId: ghost?.storage === "native" ? ghost.id : "" });
    return;
  }
  document.getElementById(source === "library" ? "photoLibraryInput" : "photoCameraInput")?.click();
}

function handleNativePhoto(payload) {
  if (!payload || typeof payload !== "object") return;
  if (payload.status === "saved" && /^[A-Za-z0-9-]+$/.test(String(payload.id || ""))) {
    addPhotoRecord({ id: payload.id, pose: PHOTO_POSES.some(([key]) => key === payload.pose) ? payload.pose : state.photoPose, date: payload.date || new Date().toISOString(), storage: "native" });
  } else if (payload.status === "imported") {
    const resolve = pendingThumbnailRequests.get(payload.requestId);
    pendingThumbnailRequests.delete(payload.requestId);
    resolve?.(/^[A-Za-z0-9-]+$/.test(String(payload.id || "")) ? payload.id : "");
  } else if (payload.status === "thumbnail") {
    const resolve = pendingThumbnailRequests.get(payload.requestId);
    pendingThumbnailRequests.delete(payload.requestId);
    resolve?.(typeof payload.dataUrl === "string" && payload.dataUrl.startsWith("data:image/") ? payload.dataUrl : "");
  } else if (payload.status === "error") {
    toast(payload.message || "The photo could not be saved.");
  }
}
window.handleNativePhoto = handleNativePhoto;

// ---------- Browser storage (IndexedDB) ----------

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function photoDbRequest(mode, run) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_STORE, mode);
    const request = run(transaction.objectStore(PHOTO_STORE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };
    image.src = url;
  });
}

async function downscaleImageFile(file) {
  const { image, url } = await loadImageFile(file);
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function savePhotoFromInput(input) {
  const file = input?.files?.[0];
  if (input) input.value = "";
  if (!file) return;
  try {
    const blob = await downscaleImageFile(file);
    if (!blob) throw new Error("Encoding failed");
    const id = crypto.randomUUID();
    await photoDbRequest("readwrite", (store) => store.put(blob, id));
    browserPhotoUrls.set(id, URL.createObjectURL(blob));
    addPhotoRecord({ id, pose: state.photoPose, date: new Date().toISOString(), storage: "browser" });
  } catch {
    toast("That photo could not be saved in this browser.");
  }
}

async function hydrateBrowserPhotos() {
  const missing = [...document.querySelectorAll("img[data-photo-id]")]
    .filter((img) => !img.getAttribute("src"))
    .map((img) => img.dataset.photoId);
  for (const id of new Set(missing)) {
    try {
      if (!browserPhotoUrls.has(id)) {
        const blob = await photoDbRequest("readonly", (store) => store.get(id));
        if (!blob) {
          document.querySelectorAll(`img[data-photo-id="${CSS.escape(id)}"]`).forEach((img) => photoMissing(img, true));
          continue;
        }
        browserPhotoUrls.set(id, URL.createObjectURL(blob));
      }
      document.querySelectorAll(`img[data-photo-id="${CSS.escape(id)}"]`).forEach((img) => { img.src = browserPhotoUrls.get(id); });
    } catch {}
  }
}

function deletePhoto(id) {
  const photo = state.progressPhotos.find((item) => item.id === id);
  if (!photo || !window.confirm(`Delete this ${poseLabel(photo.pose)} photo from ${formatShortDate(photo.date)}?`)) return;
  state.progressPhotos = state.progressPhotos.filter((item) => item.id !== id);
  if (photo.storage === "native") nativePhotoBridge()?.postMessage({ action: "delete", id });
  else photoDbRequest("readwrite", (store) => store.delete(id)).catch(() => {});
  if (browserPhotoUrls.has(id)) URL.revokeObjectURL(browserPhotoUrls.get(id));
  browserPhotoUrls.delete(id);
  saveState();
  render();
}

// Small JPEG data URLs for coach packages.
async function photoThumbnail(photo, size = 640) {
  if (!photo) return "";
  if (photo.storage === "native") {
    const bridge = nativePhotoBridge();
    if (!bridge) return "";
    const requestId = crypto.randomUUID();
    const result = new Promise((resolve) => {
      pendingThumbnailRequests.set(requestId, resolve);
      setTimeout(() => {
        if (pendingThumbnailRequests.delete(requestId)) resolve("");
      }, 8000);
    });
    bridge.postMessage({ action: "thumbnail", id: photo.id, size, requestId });
    return result;
  }
  try {
    const blob = await photoDbRequest("readonly", (store) => store.get(photo.id));
    if (!blob) return "";
    const small = await downscaleImageFile(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(small);
    });
  } catch {
    return "";
  }
}

// Stores a photo that arrived in a coach file (data URL) without adding it to
// this athlete's own gallery. Resolves to { id, storage } or null.
// prefix "coach" keeps athletes' photos out of this user's iCloud mirror.
async function storeImportedPhoto(dataUrl, prefix = "") {
  if (typeof dataUrl !== "string" || !/^data:image\/(jpeg|png);base64,/.test(dataUrl) || dataUrl.length > 4_000_000) return null;
  const bridge = nativePhotoBridge();
  if (bridge) {
    const requestId = crypto.randomUUID();
    const result = new Promise((resolve) => {
      pendingThumbnailRequests.set(requestId, (id) => resolve(id ? { id, storage: "native" } : null));
      setTimeout(() => {
        if (pendingThumbnailRequests.delete(requestId)) resolve(null);
      }, 8000);
    });
    bridge.postMessage({ action: "import", dataUrl, requestId, prefix: prefix === "coach" ? "coach" : "" });
    return result;
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const id = `${prefix === "coach" ? "coach-" : ""}${crypto.randomUUID()}`;
    await photoDbRequest("readwrite", (store) => store.put(blob, id));
    return { id, storage: "browser" };
  } catch {
    return null;
  }
}

function deletePhotoFile(photo) {
  if (!photo?.id) return;
  if (photo.storage === "native") nativePhotoBridge()?.postMessage({ action: "delete", id: photo.id });
  else photoDbRequest("readwrite", (store) => store.delete(photo.id)).catch(() => {});
  if (browserPhotoUrls.has(photo.id)) URL.revokeObjectURL(browserPhotoUrls.get(photo.id));
  browserPhotoUrls.delete(photo.id);
}

// ---------- Compare ----------

function comparePair(pose) {
  const photos = photosForPose(pose);
  if (photos.length < 2) return null;
  const before = photos.find((photo) => photo.id === state.photoCompare?.beforeId) || photos[0];
  const after = photos.find((photo) => photo.id === state.photoCompare?.afterId) || photos.at(-1);
  return { photos, before, after };
}

function setComparePhoto(which, id) {
  state.photoCompare = { ...state.photoCompare, [which === "before" ? "beforeId" : "afterId"]: id };
  saveState();
  render();
}

function setCompareMode(mode) {
  state.photoCompare = { ...state.photoCompare, mode: mode === "overlay" ? "overlay" : "side" };
  saveState();
  render();
}

function setOverlayMix(value) {
  const top = document.getElementById("photoOverlayTop");
  if (top) top.style.opacity = String(Math.max(0, Math.min(100, Number(value))) / 100);
}

function daysBetween(a, b) {
  return Math.round(Math.abs(new Date(b) - new Date(a)) / 86400000);
}

function renderPhotoCompare(pose) {
  const pair = comparePair(pose);
  if (!pair) return `<p class="muted compact-note">Take this pose on two different days to compare.</p>`;
  const { photos, before, after } = pair;
  const options = (selectedId) => photos.map((photo) => `<option value="${escapeHtml(photo.id)}" ${photo.id === selectedId ? "selected" : ""}>${formatShortDate(photo.date)}</option>`).join("");
  const overlay = state.photoCompare?.mode === "overlay";
  return `
    <div class="photo-compare">
      <div class="card-head"><h3>Compare · ${plural(daysBetween(before.date, after.date), "day")} apart</h3>
        <div class="segmented"><button class="${overlay ? "" : "active"}" onclick="setCompareMode('side')">Side by side</button><button class="${overlay ? "active" : ""}" onclick="setCompareMode('overlay')">Fade</button></div>
      </div>
      <div class="grid two">
        <div class="field"><label for="compareBefore">Before</label><select id="compareBefore" onchange="setComparePhoto('before', this.value)">${options(before.id)}</select></div>
        <div class="field"><label for="compareAfter">After</label><select id="compareAfter" onchange="setComparePhoto('after', this.value)">${options(after.id)}</select></div>
      </div>
      ${overlay ? `
        <div class="photo-overlay">${photoImg(before, "photo-full")}${photoImg(after, "photo-full photo-overlay-top", 'id="photoOverlayTop" style="opacity:0.5"')}</div>
        <label class="sr-only" for="overlayMix">Blend before and after</label>
        <input id="overlayMix" class="photo-slider" type="range" min="0" max="100" value="50" oninput="setOverlayMix(this.value)" />
        <div class="history-trend-labels"><span>${formatShortDate(before.date)}</span><span>${formatShortDate(after.date)}</span></div>
      ` : `
        <div class="photo-side">
          <figure>${photoImg(before, "photo-full")}<figcaption>${formatShortDate(before.date)}</figcaption></figure>
          <figure>${photoImg(after, "photo-full")}<figcaption>${formatShortDate(after.date)}</figcaption></figure>
        </div>
      `}
    </div>
  `;
}

function renderPhotoSection() {
  const pose = state.photoPose;
  const photos = photosForPose(pose);
  const native = Boolean(nativePhotoBridge());
  const counts = Object.fromEntries(PHOTO_POSES.map(([key]) => [key, photosForPose(key).length]));
  return `
    <section class="card pad progress-photos" style="margin-bottom:12px">
      <div class="card-head">
        <div><p class="eyebrow">Progress photos</p><h2>${escapeHtml(poseLabel(pose))}</h2></div>
        <span class="badge blue">${progressPhotoList().length} total</span>
      </div>
      <div class="pose-strip" role="group" aria-label="Pose">
        ${PHOTO_POSES.map(([key, label]) => `<button class="chip ${key === pose ? "active" : ""}" aria-pressed="${key === pose}" onclick="setPhotoPose('${key}')">${escapeHtml(label)}${counts[key] ? ` · ${counts[key]}` : ""}</button>`).join("")}
      </div>
      <p class="muted compact-note">${native ? "Your last photo of this pose appears as a faded guide in the camera so lighting, distance, and angle match." : "Same spot, same light, same distance each week makes the comparison honest."}</p>
      <div class="actions">
        <button class="primary-btn" onclick="capturePhoto('camera')">Take ${escapeHtml(poseLabel(pose))}</button>
        <button class="secondary-btn" onclick="capturePhoto('library')">Choose From Photos</button>
      </div>
      <input id="photoCameraInput" type="file" accept="image/*" capture="environment" hidden onchange="savePhotoFromInput(this)" />
      <input id="photoLibraryInput" type="file" accept="image/*" hidden onchange="savePhotoFromInput(this)" />
      ${photos.length ? `
        <div class="photo-strip">${[...photos].reverse().map((photo) => `
          <figure class="photo-thumb">${photoImg(photo)}<figcaption>${formatShortDate(photo.date)}<button class="photo-delete" aria-label="Delete photo from ${formatShortDate(photo.date)}" onclick="deletePhoto('${escapeHtml(photo.id)}')">×</button></figcaption></figure>
        `).join("")}</div>
        ${renderPhotoCompare(pose)}
      ` : `<div class="empty"><p class="muted">No ${escapeHtml(poseLabel(pose).toLowerCase())} photos yet.</p></div>`}
    </section>
  `;
}

const baseRenderProgressForPhotos = renderProgress;
renderProgress = function renderProgressWithPhotos() {
  const html = baseRenderProgressForPhotos();
  const headerStart = html.indexOf("compact-page-header");
  const insertAt = headerStart === -1 ? 0 : html.indexOf("</div>", headerStart) + "</div>".length;
  return `${html.slice(0, insertAt)}${renderPhotoSection()}${html.slice(insertAt)}`;
};

const baseStageChecklistForPhotos = stageChecklist;
stageChecklist = function stageChecklistWithPhotos(timeline) {
  const items = baseStageChecklistForPhotos(timeline);
  const recent = progressPhotoList().some((photo) => isWithinDays(photo.date, 7));
  return [...items, { done: recent, label: "Progress photos taken this week", detail: recent ? "" : "Same poses, same lighting, once a week." }];
};

const baseRenderForPhotos = render;
render = function renderWithPhotos() {
  baseRenderForPhotos();
  if (!nativePhotoBridge()) hydrateBrowserPhotos();
};

const baseResetForPhotos = resetDemoData;
resetDemoData = function resetWithPhotos() {
  baseResetForPhotos();
  photosMigrateState();
  saveState();
  render();
};

saveState();
render();
