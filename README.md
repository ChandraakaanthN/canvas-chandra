# Collaborative Canvas — lightweight starter

This repository contains a vanilla JS + Node.js collaborative drawing canvas (Socket.io).

Quick start

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open multiple browser tabs to http://localhost:3000 (optionally add `?room=room1` to join a room).

4. Deployed on Render: https://canvas-chandra.onrender.com/

What is included

- `client/` — static client assets (index.html, style.css, main.js)
- `server/` — Node.js + Socket.io server
- `README.md`, `ARCHITECTURE.md`

Notes & limitations

- The original `src/main.js` logic was preserved and placed into `client/main.js` to avoid a large refactor.
- `client/canvas.js` and `client/websocket.js` are placeholders where you can split responsibilities further.
- Undo/redo is global by stroke (server hides/shows entire strokes).
- Persistence and authentication are not implemented.

Time spent: ~30–60 minutes to reorganize structure and wire server to serve `client/`.
