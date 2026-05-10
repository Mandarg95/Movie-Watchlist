const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "cinelist_super_secret_key_2024";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.TMDB_API_KEY || "YOUR_TMDB_API_KEY_HERE";

const LOG_FILE = path.join(__dirname, "watchlist.log");
function log(action, detail, user = "") {
  const entry = `[${new Date().toISOString()}] ${action}${user ? ` (${user})` : ""}: "${detail}"\n`;
  fs.appendFile(LOG_FILE, entry, (err) => { if (err) console.error("Log error:", err); });
  console.log(entry.trim());
}

const db = new sqlite3.Database(path.join(__dirname, "watchlist.db"), (err) => {
  if (err) return console.error("DB error:", err);
  console.log("Connected to SQLite.");
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    email      TEXT    UNIQUE NOT NULL,
    password   TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS watchlist (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    tmdb_id       INTEGER NOT NULL,
    title         TEXT    NOT NULL,
    media_type    TEXT    NOT NULL DEFAULT 'movie',
    poster_path   TEXT,
    backdrop_path TEXT,
    overview      TEXT,
    vote_average  REAL,
    release_date  TEXT,
    genres        TEXT,
    status        TEXT    NOT NULL DEFAULT 'want_to_watch',
    added_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, tmdb_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Register
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields required" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username.trim(), email.trim().toLowerCase(), hashed],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE"))
            return res.status(409).json({ error: "Username or email already taken" });
          return res.status(500).json({ error: err.message });
        }
        const token = jwt.sign({ id: this.lastID, username, email }, JWT_SECRET, { expiresIn: "7d" });
        log("REGISTER", username);
        res.status(201).json({ token, username, email });
      }
    );
  } catch { res.status(500).json({ error: "Server error" }); }
});

// ── Login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  db.get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    log("LOGIN", user.username);
    res.json({ token, username: user.username, email: user.email });
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  db.get("SELECT id, username, email, created_at FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });
});

// ── TMDB
app.get("/api/search", async (req, res) => {

  const { query, page = 1 } = req.query;

  if (!query) {

    return res.status(400).json({
      error: "Query required"
    });
  }

  try {

    const r = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    );

    const data = await r.json();

    const filtered = data.results.filter(
      item =>
        item.media_type === "movie" ||
        item.media_type === "tv"
    );

    res.json({
      ...data,
      results: filtered
    });

  } catch {

    res.status(500).json({
      error: "TMDB search failed"
    });
  }
});

app.get("/api/trending", async (req, res) => {

  try {

    const page = req.query.page || 1;

    const r = await fetch(
      `${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY}&page=${page}`
    );

    res.json(await r.json());

  } catch {

    res.status(500).json({
      error: "TMDB trending failed"
    });
  }
});
app.get("/api/upcoming/movie", async (req, res) => {

  try {

    const page = req.query.page || 1;

    const today =
      new Date().toISOString().slice(0,10);

    const future =
      new Date(
        Date.now() + 90*24*60*60*1000
      ).toISOString().slice(0,10);

    const r = await fetch(
      `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=release_date.asc&release_date.gte=${today}&release_date.lte=${future}&page=${page}`
    );

    res.json(await r.json());

  } catch {

    res.status(500).json({
      error: "TMDB upcoming movies failed"
    });
  }
});

app.get("/api/upcoming/tv", async (req, res) => {

  try {

    const page = req.query.page || 1;

    const today =
      new Date().toISOString().slice(0,10);

    const future =
      new Date(
        Date.now() + 90*24*60*60*1000
      ).toISOString().slice(0,10);

    const r = await fetch(
      `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=first_air_date.asc&first_air_date.gte=${today}&first_air_date.lte=${future}&page=${page}`
    );

    res.json(await r.json());

  } catch {

    res.status(500).json({
      error: "TMDB upcoming tv failed"
    });
  }
});

app.get("/api/details/:type/:id", async (req, res) => {
  try {
    const r = await fetch(`${TMDB_BASE}/${req.params.type}/${req.params.id}?api_key=${TMDB_KEY}&append_to_response=credits,videos`);
    res.json(await r.json());
  } catch { res.status(500).json({ error: "TMDB details failed" }); }
});

// ── Watchlist (auth required)
app.get("/api/watchlist", requireAuth, (req, res) => {
  const { genre, min_rating, status, media_type } = req.query;
  let sql = "SELECT * FROM watchlist WHERE user_id = ?";
  const params = [req.user.id];
  if (genre)      { sql += " AND genres LIKE ?";     params.push(`%${genre}%`); }
  if (min_rating) { sql += " AND vote_average >= ?"; params.push(parseFloat(min_rating)); }
  if (status)     { sql += " AND status = ?";        params.push(status); }
  if (media_type) { sql += " AND media_type = ?";    params.push(media_type); }
  sql += " ORDER BY added_at DESC";
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] })));
  });
});

app.post("/api/watchlist", requireAuth, (req, res) => {
  const { tmdb_id, title, media_type, poster_path, backdrop_path, overview, vote_average, release_date, genres, status } = req.body;
  if (!tmdb_id || !title) return res.status(400).json({ error: "tmdb_id and title required" });
  const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : "[]";
  db.run(
    `INSERT OR IGNORE INTO watchlist (user_id,tmdb_id,title,media_type,poster_path,backdrop_path,overview,vote_average,release_date,genres,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.id, tmdb_id, title, media_type||"movie", poster_path, backdrop_path, overview, vote_average, release_date, genresStr, status||"want_to_watch"],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(409).json({ error: "Already in watchlist" });
      log("ADDED", title, req.user.username);
      res.status(201).json({ id: this.lastID, message: "Added" });
    }
  );
});

app.patch("/api/watchlist/:id", requireAuth, (req, res) => {
  const { status } = req.body;
  if (!["want_to_watch","watching","watched"].includes(status))
    return res.status(400).json({ error: "Invalid status" });
  db.get("SELECT title FROM watchlist WHERE id=? AND user_id=?", [req.params.id, req.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });
    db.run("UPDATE watchlist SET status=? WHERE id=? AND user_id=?", [status, req.params.id, req.user.id], err2 => {
      if (err2) return res.status(500).json({ error: err2.message });
      log(`STATUS → "${status}"`, row.title, req.user.username);
      res.json({ message: "Updated" });
    });
  });
});

app.delete("/api/watchlist/:id", requireAuth, (req, res) => {
  db.get("SELECT title FROM watchlist WHERE id=? AND user_id=?", [req.params.id, req.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });
    db.run("DELETE FROM watchlist WHERE id=? AND user_id=?", [req.params.id, req.user.id], err2 => {
      if (err2) return res.status(500).json({ error: err2.message });
      log("REMOVED", row.title, req.user.username);
      res.json({ message: "Removed" });
    });
  });
});

app.get("/api/stats", requireAuth, (req, res) => {
  db.all(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN status='watched'       THEN 1 ELSE 0 END) as watched,
      SUM(CASE WHEN status='watching'      THEN 1 ELSE 0 END) as watching,
      SUM(CASE WHEN status='want_to_watch' THEN 1 ELSE 0 END) as want_to_watch,
      AVG(vote_average) as avg_rating
     FROM watchlist WHERE user_id=?`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows[0]);
    }
  );
});

// Serve auth page
app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

app.listen(PORT, () => console.log(`🎬 Server running at http://localhost:${PORT}`));
