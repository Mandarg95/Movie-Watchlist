/* ─────────────────────────────────────────────────────────
   CineList — app.js  (final clean version)
───────────────────────────────────────────────────────── */

const API      = "/api";
const IMG_BASE = "https://image.tmdb.org/t/p";

// ── Auth ──────────────────────────────────────────────────
function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("cl_token")}`
  };
}
function logout() {
  ["cl_token","cl_username","cl_email"].forEach(k => localStorage.removeItem(k));
  window.location.href = "/auth";
}

// ── Genre map (TMDB id → name) ────────────────────────────
const GENRE_MAP = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",
  99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",
  27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",
  878:"Sci-Fi",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western",
  10759:"Action & Adventure",10762:"Kids",10763:"News",10764:"Reality",
  10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",
};

// ── Helpers ───────────────────────────────────────────────
const posterUrl = (p, size="w342") => p ? `${IMG_BASE}/${size}${p}` : null;
const getYear   = d => d ? String(d).slice(0,4) : "N/A";
const getRating = v => v ? Number(v).toFixed(1) : "N/A";
const todayStr  = () => new Date().toISOString().slice(0,10);

function showToast(msg, type="") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.className = "toast hidden", 2800);
}

// ── In-memory cache of ALL loaded trending/search items ──
// Filters work on this cache, not by re-fetching
let allTrending = [];   // accumulates across pages
let allSearch   = [];   // accumulates across search pages
let watchlist   = [];

// ── Pagination ────────────────────────────────────────────
let trendingPage = 1, trendingDone = false, trendingLoading = false;
let upcomingPage = 1, upcomingDone = false, upcomingLoading = false;
let searchPage   = 1, searchDone   = false, searchLoading   = false;
let currentQuery = "";
let searching    = false;

// ── Filter state ──────────────────────────────────────────
function getFilters() {
  return {
    genre:  document.getElementById("filterGenre").value,
    type:   document.getElementById("filterType").value,
    rating: parseFloat(document.getElementById("filterRating").value) || 0,
  };
}

function applyFilters(items) {
  const { genre, type, rating } = getFilters();
  return items.filter(m => {
    if (type   && m.media_type !== type) return false;
    if (rating && (m.vote_average || 0) < rating) return false;
    if (genre) {
      // match against genre_ids using GENRE_MAP
      const names = (m.genre_ids || []).map(id => GENRE_MAP[id] || "");
      if (!names.some(n => n.toLowerCase().includes(genre.toLowerCase()))) return false;
    }
    return true;
  });
}

// ── Card builder ──────────────────────────────────────────
function makeCard(movie, isWatchlist=false) {
  const card  = document.createElement("div");
  card.className = "movie-card";

  const title = movie.title || movie.name || "Unknown";
  const date  = movie.release_date || movie.first_air_date || "";
  const img   = posterUrl(movie.poster_path);
  const type  = movie.media_type === "tv" ? "TV" : "Film";

  if (isWatchlist) {
    const label = { watched:"Watched", watching:"Watching", want_to_watch:"Want to Watch" }[movie.status] || "";
    card.innerHTML = `
      <div class="card-poster">
        ${img?`<img src="${img}" alt="${title}" loading="lazy"/>`:`<div class="card-poster-placeholder">🎬</div>`}
        <div class="card-type">${type}</div>
        ${movie.vote_average?`<div class="card-rating">★ ${getRating(movie.vote_average)}</div>`:""}
        <div class="card-status status-${movie.status}">${label}</div>
      </div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-year">${getYear(date)}</div>
      </div>`;
    card.addEventListener("click", () => openWatchlistModal(movie));
  } else {
    card.innerHTML = `
      <div class="card-poster">
        ${img?`<img src="${img}" alt="${title}" loading="lazy"/>`:`<div class="card-poster-placeholder">🎬</div>`}
        <div class="card-type">${type}</div>
        ${movie.vote_average?`<div class="card-rating">★ ${getRating(movie.vote_average)}</div>`:""}
        <div class="card-add-btn"><button class="btn-add">+ Add</button></div>
      </div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-year">${getYear(date)}</div>
      </div>`;
    card.addEventListener("click", e => { if (!e.target.closest(".btn-add")) openDiscoverModal(movie); });
    card.querySelector(".btn-add").addEventListener("click", e => { e.stopPropagation(); quickAdd(movie); });
  }
  return card;
}

// ── Render filtered items into a grid (clears first) ──────
function renderGrid(gridId, items, isWatchlist=false) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = "";
  items.forEach(item => grid.appendChild(makeCard(item, isWatchlist)));
}

// ── Re-render discover grid from cache with current filters
function refreshDiscoverGrid() {
  const source   = searching ? allSearch : allTrending;
  const filtered = applyFilters(source);
  const gridId   = searching ? "searchResults" : "trendingGrid";
  const empty    = document.getElementById("discoverEmpty");

  const hasFilters = getFilters().genre || getFilters().type || getFilters().rating;

  renderGrid(gridId, filtered);

  if (filtered.length === 0 && hasFilters) {
    // Filters active but no results — try loading more pages silently
    if (!searching && !trendingDone && !trendingLoading) {
      loadTrending(); // will append more data and call refreshDiscoverGrid again
      return;
    }
    if (searching && !searchDone && !searchLoading) {
      loadSearch(currentQuery);
      return;
    }
    // Truly no results after exhausting pages
    empty.classList.remove("hidden");
  } else if (filtered.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
  }
}

// ══════════════════════════════════════════════
//  TRENDING
// ══════════════════════════════════════════════
async function loadTrending() {
  if (trendingLoading || trendingDone || searching) return;
  trendingLoading = true;

  if (trendingPage === 1) {
    allTrending = [];
    document.getElementById("trendingGrid").innerHTML =
      `<div class="loader"><div class="loader-ring"></div><div>Loading…</div></div>`;
  }

  try {
    const res  = await fetch(`${API}/trending?page=${trendingPage}`);
    const data = await res.json();
    const items = data.results || [];

    allTrending = [...allTrending, ...items];
    trendingPage++;
    if (trendingPage > (data.total_pages||1) || trendingPage > 10) trendingDone = true;

    refreshDiscoverGrid();
  } catch (e) {
    document.getElementById("trendingGrid").innerHTML =
      `<div class="loader" style="color:var(--red)">Failed to load. Is the server running?</div>`;
  }
  trendingLoading = false;
}

// ══════════════════════════════════════════════
//  UPCOMING
// ══════════════════════════════════════════════
async function loadUpcoming() {
  if (upcomingLoading || upcomingDone) return;
  upcomingLoading = true;

  const grid  = document.getElementById("upcomingGrid");
  const empty = document.getElementById("upcomingEmpty");

  if (upcomingPage === 1) {
    grid.innerHTML = `<div class="loader"><div class="loader-ring"></div><div>Loading…</div></div>`;
  }

  try {
    const [mr, tr] = await Promise.all([
      fetch(`${API}/upcoming/movie?page=${upcomingPage}`),
      fetch(`${API}/upcoming/tv?page=${upcomingPage}`),
    ]);
    const [movies, tv] = await Promise.all([mr.json(), tr.json()]);
    const today = todayStr();

    const combined = [
      ...(movies.results||[]).map(m => ({...m, media_type:"movie"})),
      ...(tv.results||[]).map(t => ({...t, media_type:"tv", title:t.name, release_date:t.first_air_date})),
    ]
    .filter(m => m.release_date && m.release_date >= today)
    .sort((a,b) => a.release_date.localeCompare(b.release_date));

    if (upcomingPage === 1) grid.innerHTML = "";
    combined.forEach(item => grid.appendChild(makeCard(item)));

    if (combined.length === 0 && upcomingPage === 1) empty.classList.remove("hidden");
    else empty.classList.add("hidden");

    upcomingPage++;
    if (upcomingPage > Math.max(movies.total_pages||1, tv.total_pages||1) || upcomingPage > 8)
      upcomingDone = true;
  } catch (e) {
    grid.innerHTML = `<div class="loader" style="color:var(--red)">Failed to load upcoming.</div>`;
  }
  upcomingLoading = false;
}

// ══════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════
async function loadSearch(query, reset=false) {
  if (reset) {
    searchPage = 1; searchDone = false; currentQuery = query;
    allSearch = [];
    document.getElementById("searchResults").innerHTML =
      `<div class="loader"><div class="loader-ring"></div><div>Searching…</div></div>`;
  }
  if (searchLoading || searchDone) return;
  if (currentQuery !== query) return;

  searchLoading = true;
  try {
    const res  = await fetch(`${API}/search?query=${encodeURIComponent(query)}&page=${searchPage}`);
    const data = await res.json();

    if (data.error) {
      document.getElementById("searchResults").innerHTML =
        `<div class="loader" style="color:var(--red)">${data.error}</div>`;
      searchLoading = false;
      return;
    }

    // Filter out 'person' results and ensure media_type is always set
    const items = (data.results || [])
      .filter(m => m.media_type === "movie" || m.media_type === "tv")
      .map(m => ({
        ...m,
        title: m.title || m.name,
        release_date: m.release_date || m.first_air_date,
      }));
    allSearch = [...allSearch, ...items];
    searchPage++;
    if (searchPage > (data.total_pages||1) || searchPage > 10) searchDone = true;

    refreshDiscoverGrid();
  } catch (e) {
    console.error("Search error:", e);
    document.getElementById("searchResults").innerHTML =
      `<div class="loader" style="color:var(--red)">Search failed. Check server.</div>`;
  }
  searchLoading = false;
}

function showGrid(gridId) {
  // Hide both first, then show only the target — also clear any inline display
  const tGrid = document.getElementById("trendingGrid");
  const sGrid = document.getElementById("searchResults");
  tGrid.classList.add("hidden");    tGrid.style.display = "";
  sGrid.classList.add("hidden");    sGrid.style.display = "";
  const target = document.getElementById(gridId);
  target.classList.remove("hidden");
  target.style.display = "grid";
}

function doSearch() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) {
    searching = false;
    showGrid("trendingGrid");
    document.getElementById("discoverHeading").textContent = "Trending This Week";
    document.getElementById("discoverEmpty").classList.add("hidden");
    refreshDiscoverGrid();
    return;
  }
  searching = true;
  showGrid("searchResults");
  document.getElementById("discoverHeading").textContent = `Results for "${q}"`;
  loadSearch(q, true);
}

// ══════════════════════════════════════════════
//  INFINITE SCROLL
// ══════════════════════════════════════════════
window.addEventListener("scroll", () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
  if (!nearBottom) return;
  const activeTab = document.querySelector(".nav-tab.active")?.dataset.tab;
  if (activeTab === "discover") {
    if (searching) loadSearch(currentQuery);
    else           loadTrending();
  }
  if (activeTab === "upcoming") loadUpcoming();
});

// ══════════════════════════════════════════════
//  WATCHLIST
// ══════════════════════════════════════════════
async function loadWatchlist() {
  const grid  = document.getElementById("watchlistGrid");
  const empty = document.getElementById("watchlistEmpty");
  grid.innerHTML = `<div class="loader"><div class="loader-ring"></div><div>Loading…</div></div>`;

  const params = new URLSearchParams();
  const s = document.getElementById("wlStatus");    if(s&&s.value) params.set("status",     s.value);
  const t = document.getElementById("wlType");      if(t&&t.value) params.set("media_type", t.value);
  const r = document.getElementById("wlMinRating"); if(r&&r.value) params.set("min_rating", r.value);

  try {
    const res = await fetch(`${API}/watchlist?${params}`, { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    watchlist = await res.json();
    grid.innerHTML = "";
    if (!watchlist.length) {
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      watchlist.forEach(item => grid.appendChild(makeCard(item, true)));
    }
  } catch { showToast("Failed to load watchlist", "error"); }
}

async function quickAdd(movie) {
  const genres = (movie.genre_ids||[]).map(id => GENRE_MAP[id]).filter(Boolean);
  try {
    const res = await fetch(`${API}/watchlist`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({
        tmdb_id:      movie.id,
        title:        movie.title || movie.name,
        media_type:   movie.media_type || "movie",
        poster_path:  movie.poster_path,
        backdrop_path:movie.backdrop_path,
        overview:     movie.overview,
        vote_average: movie.vote_average,
        release_date: movie.release_date || movie.first_air_date,
        genres,
      }),
    });
    const data = await res.json();
    if (res.status === 409) return showToast("Already in your list!", "");
    if (!res.ok) return showToast(data.error || "Error", "error");
    showToast(`"${movie.title||movie.name}" added ✓`, "success");
    await loadWatchlist();
  } catch { showToast("Server error", "error"); }
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API}/watchlist/${id}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error();
    showToast("Status updated ✓", "success");
    await loadWatchlist();
  } catch { showToast("Update failed", "error"); }
}

async function removeItem(id, title) {
  try {
    const res = await fetch(`${API}/watchlist/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error();
    showToast(`"${title}" removed`, "");
    await loadWatchlist();
  } catch { showToast("Remove failed", "error"); }
}

// ══════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════
function buildModalInner(item, inList) {
  const title    = item.title || item.name;
  const date     = item.release_date || item.first_air_date;
  const type     = item.media_type === "tv" ? "TV Show" : "Movie";
  const backdrop = item.backdrop_path ? posterUrl(item.backdrop_path, "w780") : null;
  const poster   = item.poster_path   ? posterUrl(item.poster_path,  "w342") : null;
  const genres   = Array.isArray(item.genres)
    ? item.genres
    : (item.genre_ids||[]).map(id => GENRE_MAP[id]).filter(Boolean);

  return `
    ${backdrop?`<img class="modal-backdrop-img" src="${backdrop}" alt="${title}"/>`:""}
    <div class="modal-body">
      <div class="modal-header">
        ${poster?`<img class="modal-poster" src="${poster}" alt="${title}"/>`:`<div class="modal-poster-placeholder">🎬</div>`}
        <div class="modal-meta">
          <div class="modal-title">${title}</div>
          <div class="modal-info">
            ${item.vote_average?`<span class="modal-badge gold">★ ${getRating(item.vote_average)}</span>`:""}
            <span class="modal-badge">${type}</span>
            ${date?`<span class="modal-badge">${date}</span>`:""}
          </div>
          ${genres.length?`<div class="modal-genres">${genres.map(g=>`<span class="genre-tag">${g}</span>`).join("")}</div>`:""}
          ${item.overview?`<p class="modal-overview">${item.overview}</p>`:""}
          <div class="modal-actions">
            ${inList
              ? `<select class="status-select" id="modalStatusSel">
                   <option value="want_to_watch" ${inList.status==="want_to_watch"?"selected":""}>Want to Watch</option>
                   <option value="watching"      ${inList.status==="watching"?"selected":""}>Watching</option>
                   <option value="watched"       ${inList.status==="watched"?"selected":""}>Watched</option>
                 </select>
                 <button class="btn-modal btn-modal-status" id="modalUpdateBtn">Update Status</button>
                 <button class="btn-modal btn-modal-remove"  id="modalRemoveBtn">Remove</button>`
              : `<button class="btn-modal btn-modal-add" id="modalAddBtn">+ Add to Watchlist</button>`}
          </div>
        </div>
      </div>
    </div>`;
}

function wireModalButtons(movie, inList) {
  const addBtn    = document.getElementById("modalAddBtn");
  const updateBtn = document.getElementById("modalUpdateBtn");
  const removeBtn = document.getElementById("modalRemoveBtn");
  const statusSel = document.getElementById("modalStatusSel");

  if (addBtn) addBtn.addEventListener("click", async () => {
    await quickAdd(movie); closeModal();
  });
  if (updateBtn && statusSel) updateBtn.addEventListener("click", async () => {
    await updateStatus(inList.id, statusSel.value); closeModal();
  });
  if (removeBtn) removeBtn.addEventListener("click", async () => {
    await removeItem(inList.id, movie.title||movie.name); closeModal();
  });
}

function openDiscoverModal(movie) {
  const inList = watchlist.find(w => w.tmdb_id === movie.id) || null;
  document.getElementById("modalContent").innerHTML = buildModalInner(movie, inList);
  document.getElementById("modal").classList.remove("hidden");
  wireModalButtons(movie, inList);
}

function openWatchlistModal(item) {
  // inList IS the item itself — always show status selector
  document.getElementById("modalContent").innerHTML = buildModalInner(item, item);
  document.getElementById("modal").classList.remove("hidden");
  wireModalButtons(item, item);
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modalContent").innerHTML = "";
}

// ══════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════
async function loadStats() {
  try {
    const res  = await fetch(`${API}/stats`, { headers: authHeaders() });
    const data = await res.json();
    document.getElementById("statTotal").textContent    = data.total         || 0;
    document.getElementById("statWatched").textContent  = data.watched       || 0;
    document.getElementById("statWatching").textContent = data.watching      || 0;
    document.getElementById("statWantTo").textContent   = data.want_to_watch || 0;
    document.getElementById("statAvg").textContent      = data.avg_rating ? Number(data.avg_rating).toFixed(1) : "—";
  } catch { showToast("Failed to load stats", "error"); }
}

// ══════════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll(".nav-tab")
    .forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-content")
    .forEach(s => s.classList.toggle("hidden", s.id !== `tab-${tab}`));
  if (tab === "watchlist") loadWatchlist();
  if (tab === "stats")     loadStats();
  if (tab === "upcoming" && upcomingPage === 1 && !upcomingLoading) loadUpcoming();
}

// ══════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {

  if (!localStorage.getItem("cl_token")) {
    window.location.href = "/auth";
    return;
  }

  // User menu
  const name = localStorage.getItem("cl_username") || "User";
  const av = document.getElementById("userAvatar");
  const nm = document.getElementById("userName");
  if (av) av.textContent = name.charAt(0).toUpperCase();
  if (nm) nm.textContent = name;

  // Logo → discover
  const logo = document.querySelector(".logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => switchTab("discover"));
  }

  // Nav tabs
  document.querySelectorAll(".nav-tab")
    .forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Modal close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // ── Search ────────────────────────────────
  document.getElementById("searchBtn").addEventListener("click", doSearch);

  document.getElementById("searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") doSearch();
  });

  document.getElementById("searchInput").addEventListener("input", e => {
    if (!e.target.value.trim()) doSearch(); // triggers reset branch (clears search, shows trending)
  });

  // ── Discover filters ──────────────────────
  // Filters work on cached data — no re-fetch needed
  ["filterGenre", "filterType", "filterRating"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      refreshDiscoverGrid();
    });
  });

  // ── Watchlist filters ─────────────────────
  ["wlStatus", "wlType", "wlMinRating"].forEach(id => {
    document.getElementById(id).addEventListener("change", loadWatchlist);
  });

  // Initial loads
  loadTrending();
  loadWatchlist();
});
