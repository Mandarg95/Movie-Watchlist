/* ─────────────────────────────────────────────────────────
   CineList — Frontend Application
   DOM manipulation, array methods, API communication
───────────────────────────────────────────────────────── */

const API = "/api";
const IMG_BASE = "https://image.tmdb.org/t/p";

// ── State ─────────────────────────────────────────────────
let state = {
  activeTab: "discover",
  trending: [],
  searchResults: [],
  watchlist: [],
  currentItem: null,   // item shown in modal
  searchMode: false,
  user: null,
};

// ── DOM Refs ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  searchInput:    $("#searchInput"),
  searchBtn:      $("#searchBtn"),
  trendingGrid:   $("#trendingGrid"),
  searchResults:  $("#searchResults"),
  discoverEmpty:  $("#discoverEmpty"),
  watchlistGrid:  $("#watchlistGrid"),
  watchlistEmpty: $("#watchlistEmpty"),
  modal:          $("#modal"),
  modalBackdrop:  $("#modalBackdrop"),
  modalClose:     $("#modalClose"),
  modalContent:   $("#modalContent"),
  toast:          $("#toast"),
  // Discover filters
  filterGenre:    $("#filterGenre"),
  filterType:     $("#filterType"),
  filterRating:   $("#filterRating"),
  // Watchlist filters
  wlStatus:       $("#wlStatus"),
  wlType:         $("#wlType"),
  wlMinRating:    $("#wlMinRating"),
  // Stats
  statTotal:      $("#statTotal"),
  statWatched:    $("#statWatched"),
  statWatching:   $("#statWatching"),
  statWantTo:     $("#statWantTo"),
  statAvg:        $("#statAvg"),
  // Auth
  authOverlay:    $("#authOverlay"),
  authTabLogin:   $("#authTabLogin"),
  authTabRegister:$("#authTabRegister"),
  loginForm:      $("#loginForm"),
  registerForm:   $("#registerForm"),
  loginUsername:  $("#loginUsername"),
  loginPassword:  $("#loginPassword"),
  loginError:     $("#loginError"),
  regUsername:    $("#regUsername"),
  regPassword:    $("#regPassword"),
  registerError:  $("#registerError"),
  userMenu:       $("#userMenu"),
  userName:       $("#userName"),
  logoutBtn:      $("#logoutBtn"),
};

// ── Auth ──────────────────────────────────────────────────
function showAuthOverlay() {
  els.authOverlay.classList.remove("hidden");
}

function hideAuthOverlay() {
  els.authOverlay.classList.add("hidden");
}

function setUser(user) {
  state.user = user;
  els.userName.textContent = user.username;
  hideAuthOverlay();
}

// Switch between Login / Register tabs
els.authTabLogin.addEventListener("click", () => {
  els.authTabLogin.classList.add("active");
  els.authTabRegister.classList.remove("active");
  els.loginForm.classList.remove("hidden");
  els.registerForm.classList.add("hidden");
  els.loginError.classList.add("hidden");
});

els.authTabRegister.addEventListener("click", () => {
  els.authTabRegister.classList.add("active");
  els.authTabLogin.classList.remove("active");
  els.registerForm.classList.remove("hidden");
  els.loginForm.classList.add("hidden");
  els.registerError.classList.add("hidden");
});

// Login form submit
els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.classList.add("hidden");
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: els.loginUsername.value, password: els.loginPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      els.loginError.textContent = data.error || "Login failed";
      els.loginError.classList.remove("hidden");
      return;
    }
    setUser(data);
    els.loginPassword.value = "";
    try { await initApp(); } catch { showToast("Failed to load content", "error"); }
  } catch {
    els.loginError.textContent = "Server error. Try again.";
    els.loginError.classList.remove("hidden");
  }
});

// Register form submit
els.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.registerError.classList.add("hidden");
  try {
    const res  = await fetch(`${API}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: els.regUsername.value, password: els.regPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) {
      els.registerError.textContent = data.error || "Registration failed";
      els.registerError.classList.remove("hidden");
      return;
    }
    setUser(data);
    els.regUsername.value  = "";
    els.regPassword.value  = "";
    try { await initApp(); } catch { showToast("Failed to load content", "error"); }
  } catch {
    els.registerError.textContent = "Server error. Try again.";
    els.registerError.classList.remove("hidden");
  }
});

// Logout
els.logoutBtn.addEventListener("click", async () => {
  await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  state.user = null;
  state.watchlist = [];
  state.trending  = [];
  els.trendingGrid.innerHTML   = "";
  els.watchlistGrid.innerHTML  = "";
  switchTab("discover");
  showAuthOverlay();
});

// ── Utilities ─────────────────────────────────────────────
function posterUrl(path, size = "w342") {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

function year(dateStr) {
  return dateStr ? dateStr.slice(0, 4) : "N/A";
}

function rating(val) {
  return val ? val.toFixed(1) : "—";
}

function showToast(msg, type = "") {
  const t = els.toast;
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.className = "toast hidden"; }, 2800);
}

function showLoader(container) {
  container.innerHTML = `
    <div class="loader">
      <div class="loader-ring"></div>
      <div>Loading…</div>
    </div>`;
}

// ── Logo click
document.querySelector(".logo").style.cursor = "pointer";
document.querySelector(".logo").addEventListener("click", () => switchTab("discover"));

// ── Tab Switching ─────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  $$(".nav-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  $$(".tab-content").forEach((sec) => sec.classList.toggle("hidden", sec.id !== `tab-${tab}`));

  if (tab === "watchlist") loadWatchlist();
  if (tab === "stats") loadStats();
}

$$(".nav-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Logo click → Discover
document.querySelector(".logo").style.cursor = "pointer";
document.querySelector(".logo").addEventListener("click", () => switchTab("discover"));

// ── Render Movie Card (Discover) ──────────────────────────
function renderCard(movie, staggerIdx = 0) {
  const card = document.createElement("div");
  card.className = "movie-card";
  card.style.animationDelay = `${staggerIdx * 0.04}s`;

  const imgUrl = posterUrl(movie.poster_path);

  card.innerHTML = `
    <div class="card-poster">
      ${imgUrl
        ? `<img src="${imgUrl}" alt="${movie.title}" loading="lazy" />`
        : `<div class="card-poster-placeholder">🎬</div>`}
      <div class="card-type">${movie.media_type === "tv" ? "TV" : "Film"}</div>
      ${movie.vote_average ? `<div class="card-rating">★ ${rating(movie.vote_average)}</div>` : ""}
      <div class="card-add-btn">
        <button class="btn-add" data-id="${movie.id}" data-type="${movie.media_type}">+ Add to List</button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${movie.title || movie.name}</div>
      <div class="card-year">${year(movie.release_date || movie.first_air_date)}</div>
    </div>`;

  // Open detail modal on card click
  card.addEventListener("click", (e) => {
    if (e.target.closest(".btn-add")) return;
    openModal(movie.id, movie.media_type);
  });

  // Quick add without opening modal
  card.querySelector(".btn-add")?.addEventListener("click", (e) => {
    e.stopPropagation();
    quickAdd(movie);
  });

  return card;
}

// ── Render Watchlist Card ─────────────────────────────────
function renderWatchlistCard(item, staggerIdx = 0) {
  const card = document.createElement("div");
  card.className = "movie-card";
  card.style.animationDelay = `${staggerIdx * 0.04}s`;

  const imgUrl = posterUrl(item.poster_path);
  const statusLabel = { watched: "Watched", watching: "Watching", want_to_watch: "Want to Watch" }[item.status] || "";

  card.innerHTML = `
    <div class="card-poster">
      ${imgUrl
        ? `<img src="${imgUrl}" alt="${item.title}" loading="lazy" />`
        : `<div class="card-poster-placeholder">🎬</div>`}
      <div class="card-type">${item.media_type === "tv" ? "TV" : "Film"}</div>
      ${item.vote_average ? `<div class="card-rating">★ ${rating(item.vote_average)}</div>` : ""}
      <div class="card-status status-${item.status}">${statusLabel}</div>
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-year">${year(item.release_date)}</div>
    </div>`;

  card.addEventListener("click", () => openWatchlistModal(item));
  return card;
}

// ── Load Trending ─────────────────────────────────────────
async function loadTrending() {
  showLoader(els.trendingGrid);
  try {
    const res = await fetch(`${API}/trending`);
    const data = await res.json();
    state.trending = data.results || [];
    renderDiscover(state.trending);
  } catch {
    els.trendingGrid.innerHTML = `<div class="loader" style="color:var(--red)">Failed to load trending. Is the server running?</div>`;
  }
}

// ── Render Discover with Array Filters ───────────────────
function renderDiscover(movies) {
  const genre  = els.filterGenre.value;
  const type   = els.filterType.value;
  const minRat = parseFloat(els.filterRating.value) || 0;

  // Array methods: filter + sort
  let filtered = movies
    .filter((m) => !type   || m.media_type === type)
    .filter((m) => !minRat || (m.vote_average >= minRat))
    .filter((m) => !genre  || (m.genre_names || []).some((g) => g.toLowerCase().includes(genre.toLowerCase())));

  const grid = state.searchMode ? els.searchResults : els.trendingGrid;
  state.searchMode ? (els.trendingGrid.classList.add("hidden"), els.searchResults.classList.remove("hidden"))
                   : (els.searchResults.classList.add("hidden"), els.trendingGrid.classList.remove("hidden"));

  grid.innerHTML = "";

  if (!filtered.length) {
    els.discoverEmpty.classList.remove("hidden");
  } else {
    els.discoverEmpty.classList.add("hidden");
    filtered.forEach((m, i) => grid.appendChild(renderCard(m, i)));
  }
}

// Genre IDs → names map (TMDB)
const GENRE_MAP = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",
  99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",
  27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",
  878:"Sci-Fi",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western",
  10759:"Action & Adventure",10762:"Kids",10763:"News",10764:"Reality",
  10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",
};

function attachGenreNames(movies) {
  return movies.map((m) => ({
    ...m,
    genre_names: (m.genre_ids || []).map((id) => GENRE_MAP[id]).filter(Boolean),
  }));
}

// ── Search ────────────────────────────────────────────────
async function doSearch() {
  const q = els.searchInput.value.trim();
  if (!q) {
    state.searchMode = false;
    renderDiscover(state.trending);
    return;
  }

  state.searchMode = true;
  showLoader(els.searchResults);
  els.trendingGrid.classList.add("hidden");
  els.searchResults.classList.remove("hidden");

  try {
    const res = await fetch(`${API}/search?query=${encodeURIComponent(q)}`);
    const data = await res.json();
    state.searchResults = attachGenreNames(data.results || []);
    renderDiscover(state.searchResults);
  } catch {
    showToast("Search failed", "error");
  }
}

els.searchBtn.addEventListener("click", doSearch);
els.searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
els.searchInput.addEventListener("input", (e) => {
  if (!e.target.value.trim()) {
    state.searchMode = false;
    els.searchResults.classList.add("hidden");
    els.trendingGrid.classList.remove("hidden");
    renderDiscover(state.trending);
  }
});

// Discover filters
[els.filterGenre, els.filterType, els.filterRating].forEach((el) => {
  el.addEventListener("change", () => {
    const source = state.searchMode ? state.searchResults : state.trending;
    renderDiscover(source);
  });
});

// ── Load Watchlist with Filters ───────────────────────────
async function loadWatchlist() {
  showLoader(els.watchlistGrid);
  const params = new URLSearchParams();
  if (els.wlStatus.value)    params.set("status",     els.wlStatus.value);
  if (els.wlType.value)      params.set("media_type",  els.wlType.value);
  if (els.wlMinRating.value) params.set("min_rating",  els.wlMinRating.value);

  try {
    const res = await fetch(`${API}/watchlist?${params}`);
    state.watchlist = await res.json();
    renderWatchlist();
  } catch {
    showToast("Failed to load watchlist", "error");
  }
}

function renderWatchlist() {
  els.watchlistGrid.innerHTML = "";
  if (!state.watchlist.length) {
    els.watchlistEmpty.classList.remove("hidden");
  } else {
    els.watchlistEmpty.classList.add("hidden");
    state.watchlist.forEach((item, i) => els.watchlistGrid.appendChild(renderWatchlistCard(item, i)));
  }
}

[els.wlStatus, els.wlType, els.wlMinRating].forEach((el) => {
  el.addEventListener("change", loadWatchlist);
});

// ── Quick Add (from card button) ──────────────────────────
async function quickAdd(movie) {
  const genres = (movie.genre_ids || []).map((id) => GENRE_MAP[id]).filter(Boolean);
  try {
    const res = await fetch(`${API}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdb_id:    movie.id,
        title:      movie.title || movie.name,
        media_type: movie.media_type || "movie",
        poster_path:    movie.poster_path,
        backdrop_path:  movie.backdrop_path,
        overview:       movie.overview,
        vote_average:   movie.vote_average,
        release_date:   movie.release_date || movie.first_air_date,
        genres,
      }),
    });
    const data = await res.json();
    if (res.status === 409) return showToast("Already in your list!", "");
    if (!res.ok) return showToast(data.error || "Error", "error");
    showToast(`"${movie.title || movie.name}" added! ✓`, "success");
  } catch {
    showToast("Server error", "error");
  }
}

// ── Detail Modal (Discover) ───────────────────────────────
async function openModal(tmdbId, mediaType) {
  els.modal.classList.remove("hidden");
  els.modalContent.innerHTML = `<div class="loader" style="padding:60px"><div class="loader-ring"></div><div>Loading details…</div></div>`;

  try {
    const res  = await fetch(`${API}/details/${mediaType}/${tmdbId}`);
    const data = await res.json();
    state.currentItem = { ...data, media_type: mediaType };
    renderDetailModal(data, mediaType);
  } catch {
    els.modalContent.innerHTML = `<div class="loader" style="color:var(--red)">Failed to load details.</div>`;
  }
}

function renderDetailModal(data, mediaType) {
  const title    = data.title || data.name;
  const date     = data.release_date || data.first_air_date;
  const genres   = (data.genres || []).map((g) => g.name);
  const backdrop = data.backdrop_path ? posterUrl(data.backdrop_path, "w780") : null;
  const poster   = data.poster_path   ? posterUrl(data.poster_path,  "w342") : null;

  // Check if already in watchlist
  const inList = state.watchlist.find((w) => w.tmdb_id === data.id);

  els.modalContent.innerHTML = `
    ${backdrop ? `<img class="modal-backdrop-img" src="${backdrop}" alt="${title}" />` : ""}
    <div class="modal-body">
      <div class="modal-header">
        ${poster
          ? `<img class="modal-poster" src="${poster}" alt="${title}" />`
          : `<div class="modal-poster-placeholder">🎬</div>`}
        <div class="modal-meta">
          <div class="modal-title">${title}</div>
          <div class="modal-info">
            ${date ? `<span class="modal-badge">${year(date)}</span>` : ""}
            <span class="modal-badge">${mediaType === "tv" ? "TV Show" : "Movie"}</span>
            ${data.vote_average ? `<span class="modal-badge gold">★ ${rating(data.vote_average)}</span>` : ""}
            ${data.runtime ? `<span class="modal-badge">${data.runtime} min</span>` : ""}
            ${data.number_of_seasons ? `<span class="modal-badge">${data.number_of_seasons} Season${data.number_of_seasons>1?"s":""}</span>` : ""}
          </div>
          ${genres.length ? `<div class="modal-genres">${genres.map((g) => `<span class="genre-tag">${g}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      ${data.overview ? `<p class="modal-overview">${data.overview}</p>` : ""}
      <div class="modal-actions" id="modalActions">
        ${inList
          ? `<select class="status-select" id="modalStatusSel">
               <option value="want_to_watch" ${inList.status==="want_to_watch"?"selected":""}>Want to Watch</option>
               <option value="watching"      ${inList.status==="watching"?"selected":""}>Watching</option>
               <option value="watched"       ${inList.status==="watched"?"selected":""}>Watched</option>
             </select>
             <button class="btn-modal btn-modal-status" id="modalUpdateBtn">Update Status</button>
             <button class="btn-modal btn-modal-remove" id="modalRemoveBtn">Remove</button>`
          : `<button class="btn-modal btn-modal-add" id="modalAddBtn">+ Add to Watchlist</button>`
        }
      </div>
    </div>`;

  // Wire actions
  const addBtn    = $("#modalAddBtn");
  const updateBtn = $("#modalUpdateBtn");
  const removeBtn = $("#modalRemoveBtn");
  const statusSel = $("#modalStatusSel");

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      await quickAdd({ ...data, media_type: mediaType, genre_ids: (data.genres||[]).map(g=>g.id) });
      await loadWatchlist();
      closeModal();
    });
  }

  if (updateBtn && statusSel) {
    updateBtn.addEventListener("click", async () => {
      await updateStatus(inList.id, statusSel.value);
      closeModal();
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      await removeFromWatchlist(inList.id, title);
      closeModal();
    });
  }
}

// ── Watchlist Modal ───────────────────────────────────────
function openWatchlistModal(item) {
  els.modal.classList.remove("hidden");
  const poster   = item.poster_path   ? posterUrl(item.poster_path,  "w342") : null;
  const backdrop = item.backdrop_path ? posterUrl(item.backdrop_path, "w780") : null;
  const genres   = Array.isArray(item.genres) ? item.genres : [];

  els.modalContent.innerHTML = `
    ${backdrop ? `<img class="modal-backdrop-img" src="${backdrop}" alt="${item.title}" />` : ""}
    <div class="modal-body">
      <div class="modal-header">
        ${poster
          ? `<img class="modal-poster" src="${poster}" alt="${item.title}" />`
          : `<div class="modal-poster-placeholder">🎬</div>`}
        <div class="modal-meta">
          <div class="modal-title">${item.title}</div>
          <div class="modal-info">
            ${item.release_date ? `<span class="modal-badge">${year(item.release_date)}</span>` : ""}
            <span class="modal-badge">${item.media_type === "tv" ? "TV Show" : "Movie"}</span>
            ${item.vote_average ? `<span class="modal-badge gold">★ ${rating(item.vote_average)}</span>` : ""}
          </div>
          ${genres.length ? `<div class="modal-genres">${genres.map((g)=>`<span class="genre-tag">${g}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      ${item.overview ? `<p class="modal-overview">${item.overview}</p>` : ""}
      <div class="modal-actions">
        <select class="status-select" id="wlStatusSel">
          <option value="want_to_watch" ${item.status==="want_to_watch"?"selected":""}>Want to Watch</option>
          <option value="watching"      ${item.status==="watching"?"selected":""}>Watching</option>
          <option value="watched"       ${item.status==="watched"?"selected":""}>Watched</option>
        </select>
        <button class="btn-modal btn-modal-status" id="wlUpdateBtn">Update Status</button>
        <button class="btn-modal btn-modal-remove" id="wlRemoveBtn">Remove</button>
      </div>
    </div>`;

  $("#wlUpdateBtn").addEventListener("click", async () => {
    await updateStatus(item.id, $("#wlStatusSel").value);
    closeModal();
  });

  $("#wlRemoveBtn").addEventListener("click", async () => {
    await removeFromWatchlist(item.id, item.title);
    closeModal();
  });
}

// ── Status Update ─────────────────────────────────────────
async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API}/watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    showToast("Status updated ✓", "success");
    await loadWatchlist();
  } catch {
    showToast("Update failed", "error");
  }
}

// ── Remove ────────────────────────────────────────────────
async function removeFromWatchlist(id, title) {
  try {
    const res = await fetch(`${API}/watchlist/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error();
    showToast(`"${title}" removed`, "");
    await loadWatchlist();
  } catch {
    showToast("Remove failed", "error");
  }
}

// ── Modal Close ───────────────────────────────────────────
function closeModal() {
  els.modal.classList.add("hidden");
  els.modalContent.innerHTML = "";
}

els.modalClose.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ── Stats ─────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch(`${API}/stats`);
    const data = await res.json();
    els.statTotal.textContent   = data.total    || 0;
    els.statWatched.textContent = data.watched   || 0;
    els.statWatching.textContent= data.watching  || 0;
    els.statWantTo.textContent  = data.want_to_watch || 0;
    els.statAvg.textContent     = data.avg_rating ? data.avg_rating.toFixed(1) : "—";
  } catch {
    showToast("Failed to load stats", "error");
  }
}

// ── Init ──────────────────────────────────────────────────
async function initApp() {
  const raw = await fetch(`${API}/trending`).then((r) => r.json()).catch(() => ({ results: [] }));
  state.trending = attachGenreNames(raw.results || []);
  renderDiscover(state.trending);
  await loadWatchlist();   // preload for "already in list" checks in modal
}

(async () => {
  try {
    const res  = await fetch(`${API}/auth/me`, { credentials: "include" });
    if (res.ok) {
      const user = await res.json();
      setUser(user);
      await initApp();
    } else {
      showAuthOverlay();
    }
  } catch {
    showAuthOverlay();
  }
})();
