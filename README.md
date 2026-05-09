# 🎬 CineList — Online Movie Watchlist

A full-stack movie & TV watchlist app powered by the **TMDB API**, **Node.js + Express**, **SQLite**, and vanilla JS frontend.

---

## Features

- 🔍 **Search** movies and TV shows via TMDB API
- 📈 **Trending** content loaded automatically on start
- ➕ **Add** items to your personal watchlist
- 🔄 **Update status** — Want to Watch / Watching / Watched
- 🗑️ **Remove** items from your list
- 🎛️ **Filter** by genre, rating, type, and status (array methods)
- 📊 **Stats** dashboard — total, watched, watching, avg rating
- 📝 **File logging** — every add/remove logged to `watchlist.log`
- 💾 **SQLite database** — persists your watchlist between sessions

---

## Setup

### 1. Get a free TMDB API Key
1. Go to [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Create a free account and request an API key (v3 auth)

### 2. Install dependencies
```bash
cd movie-watchlist
npm install
```

### 3. Set your API key

**Option A — Environment variable (recommended):**
```bash
TMDB_API_KEY=your_key_here node server.js
```

**Option B — Edit server.js directly:**
```js
// Line 13 in server.js — replace the placeholder:
const TMDB_KEY = "your_actual_key_here";
```

### 4. Start the server
```bash
npm start
# or for hot-reload during development:
npm run dev
```

### 5. Open in browser
```
http://localhost:3000
```

---

## Project Structure

```
movie-watchlist/
├── server.js          # Express backend — routes, DB, logging
├── package.json
├── watchlist.db       # SQLite database (auto-created)
├── watchlist.log      # fs module activity log (auto-created)
└── public/
    ├── index.html     # App shell & layout
    ├── style.css      # Cinematic dark theme
    └── app.js         # DOM manipulation, API calls, array filters
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trending` | Trending movies & TV this week |
| GET | `/api/search?query=` | Search TMDB |
| GET | `/api/details/:type/:id` | Full details for a title |
| GET | `/api/watchlist` | Get watchlist (supports filters) |
| POST | `/api/watchlist` | Add item to watchlist |
| PATCH | `/api/watchlist/:id` | Update watch status |
| DELETE | `/api/watchlist/:id` | Remove from watchlist |
| GET | `/api/stats` | Watchlist statistics |

### Watchlist filter params
- `?status=watched|watching|want_to_watch`
- `?media_type=movie|tv`
- `?min_rating=7`
- `?genre=Action`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express.js |
| Database | SQLite (sqlite3) |
| Logging | Node.js `fs` module |
| Movie Data | TMDB API |
| Frontend | Vanilla JS, HTML5, CSS3 |
| Fonts | Playfair Display, DM Sans |
