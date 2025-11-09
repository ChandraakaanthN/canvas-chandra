# ARCHITECTURE

## Data flow

- Client captures pointer input and locally paints the canvas for immediate feedback.
- Network: clients emit `beginStroke`, then stream `draw` segments (throttled to one segment per animation frame) and `endStroke` to the server via Socket.io.
- Server assigns a monotonic `seq` per segment and broadcasts `draw` messages to all clients. The server stores strokes and segments in memory for replay.

## WebSocket protocol (events)

- Client -> Server:
  - `presence` { id, name, color }
  - `beginStroke` { strokeId, userId, color, width, brush, erase }
  - `draw` { strokeId, x0, y0, x1, y1, color, width, brush, erase, ts }
  - `endStroke` { strokeId }
  - `undo` / `redo` / `clear`
  - `cursor` { id, x, y, color, name, drawing, ts }

- Server -> Client:
  - `init` { strokes, users }
  - `draw` { ...seg, seq }
  - `state` [active strokes] (for resync / undo/redo)
  - `users` [presence list]
  - `clear`, `cursor`

## Undo/Redo strategy

- The server maintains an ordered list of strokes. Each stroke contains a list of segments.
- `undo` hides the last active stroke (regardless of author) by setting `active=false` and pushes it onto a `redo` stack.
- `redo` pops the most recent undone stroke and restores it (`active=true`).
- Clients receive `state` messages and replay active strokes in order. This ensures all clients converge to the same canvas.

Pros: simple, deterministic global undo/redo. Cons: no per-user undo, and undo removes entire strokes rather than partial edits.

## Conflict resolution

- On the network, server-assigned `seq` numbers give a total ordering for segments. Clients buffer out-of-order segments until gaps are filled, then apply segments in order.
- For overlapping drawing areas, the last applied segment (by seq) wins visually. Erase operations use canvas composite operations and are applied as recorded.

## Performance decisions

- Clients throttle outbound `draw` events to at most one per animation frame and batch local drawing for visual smoothness.
- Server stores strokes & segments in memory (bounded by a MAX_STEPS cap). For production you'd persist to a DB and shard rooms.
