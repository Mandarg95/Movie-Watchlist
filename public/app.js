const trendingGrid = document.getElementById("trendingGrid");
const upcomingGrid = document.getElementById("upcomingGrid");
const searchResults = document.getElementById("searchResults");

const discoverHeading = document.getElementById("discoverHeading");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

let trendingPage = 1;
let upcomingPage = 1;

let loadingTrending = false;
let loadingUpcoming = false;

let searching = false;

// =========================
// RENDER MOVIES
// =========================

function renderMovies(movies, gridId, append = false) {

    const grid = document.getElementById(gridId);

    if (!append) {
        grid.innerHTML = "";
    }

    movies.forEach(movie => {

        const title =
            movie.title ||
            movie.name ||
            "Unknown";

        const year =
            (movie.release_date || movie.first_air_date || "")
            .split("-")[0];

        const poster = movie.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : "";

        const type =
            movie.media_type === "tv" ||
            movie.first_air_date
                ? "TV"
                : "FILM";

        const rating =
            movie.vote_average
                ? movie.vote_average.toFixed(1)
                : "N/A";

        const card = document.createElement("div");

        card.className = "movie-card";

        card.innerHTML = `
            <div class="card-poster">

                ${
                    poster
                    ? `<img src="${poster}" alt="${title}">`
                    : `<div class="card-poster-placeholder">🎬</div>`
                }

                <div class="card-rating">
                    ⭐ ${rating}
                </div>

                <div class="card-type">
                    ${type}
                </div>

            </div>

            <div class="card-body">
                <div class="card-title">
                    ${title}
                </div>

                <div class="card-year">
                    ${year}
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

// =========================
// LOAD TRENDING
// =========================

async function loadTrending() {

    if (loadingTrending || searching) return;

    loadingTrending = true;

    try {

        const res = await fetch(
            `/api/trending?page=${trendingPage}`
        );

        const data = await res.json();

        renderMovies(
            data.results,
            "trendingGrid",
            true
        );

        trendingPage++;

    } catch (err) {
        console.error(err);
    }

    loadingTrending = false;
}

// =========================
// LOAD UPCOMING
// =========================

async function loadUpcoming() {

    if (loadingUpcoming) return;

    loadingUpcoming = true;

    try {

        const [movieRes, tvRes] = await Promise.all([

            fetch(`/api/upcoming/movie?page=${upcomingPage}`),

            fetch(`/api/upcoming/tv?page=${upcomingPage}`)
        ]);

        const movieData = await movieRes.json();

        const tvData = await tvRes.json();

        const combined = [

            ...(movieData.results || []).map(
                m => ({
                    ...m,
                    media_type: "movie"
                })
            ),

            ...(tvData.results || []).map(
                t => ({
                    ...t,
                    media_type: "tv",
                    title: t.name,
                    release_date: t.first_air_date
                })
            )
        ];

        renderMovies(
            combined,
            "upcomingGrid",
            true
        );

        upcomingPage++;

    } catch (err) {

        console.error(err);
    }

    loadingUpcoming = false;
}

// =========================
// SEARCH
// =========================

async function searchMovies() {

    const query = searchInput.value.trim();

    // RESET
    if (!query.trim()) {

        searching = false;

        discoverHeading.textContent =
            "Trending This Week";

        searchResults.classList.add("hidden");

        trendingGrid.classList.remove("hidden");

        trendingGrid.style.display = "grid";

        searchResults.innerHTML = "";

        return;
    }

    searching = true;

    discoverHeading.textContent ="Search Results";

    trendingGrid.classList.add("hidden");
    
    trendingGrid.style.display = "none";

    searchResults.classList.remove("hidden");

    try {

        const res = await fetch(
            `/api/search?query=${encodeURIComponent(query)}`
        );

        const data = await res.json();

        searchResults.innerHTML = "";

        renderMovies(
            data.results,
            "searchResults"
        );

    } catch (err) {
        console.error(err);
    }
}

// =========================
// SEARCH EVENTS
// =========================

searchBtn.addEventListener(
    "click",
    searchMovies
);

searchInput.addEventListener(
    "keydown",
    e => {

        if (e.key === "Enter") {
            searchMovies();
        }
    }
);

// =========================
// INFINITE SCROLL
// =========================

window.addEventListener("scroll", () => {

    const nearBottom =
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 1000;

    if (!nearBottom) return;

    const activeTab =
        document.querySelector(".nav-tab.active")
        .dataset.tab;

    if (activeTab === "discover") {
        loadTrending();
    }

    if (activeTab === "upcoming") {
        loadUpcoming();
    }
});

// =========================
// TAB SWITCHING
// =========================

document.querySelectorAll(".nav-tab")
.forEach(tab => {

    tab.addEventListener("click", () => {

        document
            .querySelectorAll(".nav-tab")
            .forEach(t => t.classList.remove("active"));

        tab.classList.add("active");

        const tabName = tab.dataset.tab;

        document
            .querySelectorAll(".tab-content")
            .forEach(section => {
                section.classList.add("hidden");
            });

        document
            .getElementById(`tab-${tabName}`)
            .classList.remove("hidden");
    });
});

// =========================
// INITIAL LOAD
// =========================

loadTrending();
loadUpcoming();