const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── TMDB Config ─────────────────────────────────────────────────────────────
const TMDB_BASE = "https://api.themoviedb.org/3";
// NOTE: Replace with your actual TMDB API key
const TMDB_KEY = process.env.TMDB_API_KEY || "YOUR_TMDB_API_KEY_HERE";

// ─── Logging Setup ────────────────────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, "watchlist.log");

function log(action, movieTitle) {
  const entry = `[${new Date().toISOString()}] ${action}: "${movieTitle}"\n`;
  fs.appendFile(LOG_FILE, entry, (err) => {
    if (err) console.error("Log write error:", err);
  });
  console.log(entry.trim());
}

// ─── Database Setup ───────────────────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, "watchlist.db"), (err) => {
  if (err) return console.error("DB connection error:", err);
  console.log("Connected to SQLite database.");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id     INTEGER UNIQUE NOT NULL,
      title       TEXT    NOT NULL,
      media_type  TEXT    NOT NULL DEFAULT 'movie',
      poster_path TEXT,
      backdrop_path TEXT,
      overview    TEXT,
      vote_average REAL,
      release_date TEXT,
      genres      TEXT,
      status      TEXT    NOT NULL DEFAULT 'want_to_watch',
      added_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

// ─── TMDB Proxy Routes ────────────────────────────────────────────────────────

// Search movies & TV
app.get("/api/search", async (req, res) => {
  const { query, page = 1 } = req.query;
  if (!query) return res.status(400).json({ error: "Query required" });

  try {
    const [moviesRes, tvRes] = await Promise.all([
      fetch(`${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=${page}`),
      fetch(`${TMDB_BASE}/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=${page}`),
    ]);

    const [movies, tv] = await Promise.all([moviesRes.json(), tvRes.json()]);

    const combined = [
      ...(movies.results || []).map((m) => ({ ...m, media_type: "movie" })),
      ...(tv.results || []).map((t) => ({ ...t, media_type: "tv", title: t.name, release_date: t.first_air_date })),
    ].sort((a, b) => b.popularity - a.popularity);

    res.json({ results: combined, total_results: (movies.total_results || 0) + (tv.total_results || 0) });
  } catch (err) {
    res.status(500).json({ error: "TMDB fetch failed", details: err.message });
  }
});

// Trending
app.get("/api/trending", async (req, res) => {
  try {
    const r = await fetch(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "TMDB trending failed" });
  }
});

// Movie/TV details
app.get("/api/details/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  try {
    const r = await fetch(`${TMDB_BASE}/${type}/${id}?api_key=${TMDB_KEY}&append_to_response=credits,videos`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "TMDB details failed" });
  }
});

// ─── Watchlist Routes ─────────────────────────────────────────────────────────

// GET all watchlist items (with optional filters)
app.get("/api/watchlist", (req, res) => {
  const { genre, min_rating, status, media_type } = req.query;
  let sql = "SELECT * FROM watchlist WHERE 1=1";
  const params = [];

  if (genre) { sql += " AND genres LIKE ?"; params.push(`%${genre}%`); }
  if (min_rating) { sql += " AND vote_average >= ?"; params.push(parseFloat(min_rating)); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (media_type) { sql += " AND media_type = ?"; params.push(media_type); }
  sql += " ORDER BY added_at DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = rows.map((r) => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] }));
    res.json(items);
  });
});

// POST add to watchlist
app.post("/api/watchlist", (req, res) => {
  const { tmdb_id, title, media_type, poster_path, backdrop_path, overview, vote_average, release_date, genres, status } = req.body;

  if (!tmdb_id || !title) return res.status(400).json({ error: "tmdb_id and title required" });

  const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : "[]";
  const watchStatus = status || "want_to_watch";

  db.run(
    `INSERT OR IGNORE INTO watchlist (tmdb_id, title, media_type, poster_path, backdrop_path, overview, vote_average, release_date, genres, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tmdb_id, title, media_type || "movie", poster_path, backdrop_path, overview, vote_average, release_date, genresStr, watchStatus],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(409).json({ error: "Already in watchlist" });
      log("ADDED", title);
      res.status(201).json({ id: this.lastID, message: "Added to watchlist" });
    }
  );
});

// PATCH update status
app.patch("/api/watchlist/:id", (req, res) => {
  const { status } = req.body;
  const validStatuses = ["want_to_watch", "watching", "watched"];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

  db.get("SELECT title FROM watchlist WHERE id = ?", [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });

    db.run("UPDATE watchlist SET status = ? WHERE id = ?", [status, req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      log(`STATUS UPDATED to "${status}"`, row.title);
      res.json({ message: "Status updated" });
    });
  });
});

// DELETE remove from watchlist
app.delete("/api/watchlist/:id", (req, res) => {
  db.get("SELECT title FROM watchlist WHERE id = ?", [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });

    db.run("DELETE FROM watchlist WHERE id = ?", [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      log("REMOVED", row.title);
      res.json({ message: "Removed from watchlist" });
    });
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  db.all(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'watched' THEN 1 ELSE 0 END) as watched,
      SUM(CASE WHEN status = 'watching' THEN 1 ELSE 0 END) as watching,
      SUM(CASE WHEN status = 'want_to_watch' THEN 1 ELSE 0 END) as want_to_watch,
      AVG(vote_average) as avg_rating
     FROM watchlist`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows[0]);
    }
  );
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🎬 Server running at http://localhost:${PORT}`));
