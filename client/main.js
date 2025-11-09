// main.js: client-side app (wires UI, canvas and socket)
// This file was adapted from original src/main.js and kept as a single entry
// for simplicity. For the assignment structure we also include canvas.js and
// websocket.js placeholders.

/* eslint-disable no-undef */

// ==========================
// Canvas & Context
// ==========================
const canvas = document.getElementById("my-canvas");
const ctx = canvas.getContext("2d");

// UI
const clearBtn    = document.getElementById("clear-btn");
const redBtn      = document.getElementById("red-btn");
const blueBtn     = document.getElementById("blue-btn");
const greenBtn    = document.getElementById("green-btn");
const blackBtn    = document.getElementById("black-btn");
const colorPicker = document.getElementById("color-picker");
const brushBtn    = document.getElementById("brush-btn");
const eraserBtn   = document.getElementById("eraser-btn");
const widthRange  = document.getElementById("width-range");
const widthValue  = document.getElementById("width-value");
const brushSelect = document.getElementById("brush-select");
const undoBtn     = document.getElementById("undo-btn");
const redoBtn     = document.getElementById("redo-btn");

// ==========================
// Realtime: Socket.IO
// ==========================
const room = new URLSearchParams(location.search).get("room") || "default";
const socket = io({ query: { room }, transports: ["websocket"], upgrade: false });

const me = {
  id:   Math.random().toString(36).slice(2, 8),
  name: "User-" + Math.floor(Math.random() * 1000),
  color: "#" + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, "0"),
};
socket.emit("presence", { id: me.id, name: me.name, color: me.color });

// ==========================
// Overlay for live cursors
// ==========================
const overlay = document.createElement("canvas");
overlay.style.position = "fixed";
overlay.style.inset = "0";
overlay.style.pointerEvents = "none";
overlay.style.zIndex = "999";
document.body.appendChild(overlay);
const octx = overlay.getContext("2d");

// ==========================
// DPI-aware sizing
// ==========================
function resizeOverlay() {
  const dpr = window.devicePixelRatio || 1;
  overlay.style.width = window.innerWidth + "px";
  overlay.style.height = window.innerHeight + "px";
  overlay.width  = Math.floor(window.innerWidth  * dpr);
  overlay.height = Math.floor(window.innerHeight * dpr);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width  = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  resizeOverlay();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==========================
// Presence list
// ==========================
const roster = document.createElement("div");
roster.style.position = "fixed";
roster.style.top = "12px";
roster.style.right = "12px";
roster.style.background = "rgba(255,255,255,0.95)";
roster.style.border = "1px solid #ddd";
roster.style.borderRadius = "10px";
roster.style.padding = "8px 10px";
roster.style.font = "13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
roster.style.boxShadow = "0 2px 8px rgba(0,0,0,.08)";
roster.style.maxWidth = "220px";
roster.style.zIndex = "1000";
document.body.appendChild(roster);
function renderUsers(list){
  roster.innerHTML =
    "<div style='font-weight:600;margin-bottom:6px'>Online</div>" +
    list.map(u => `
      <div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${u.color};outline:1px solid #0002"></span>
        <span>${u.name}</span>
      </div>`).join("");
}
socket.on("users", renderUsers);

// ==========================
// Drawing state & controls
// ==========================
let drawing = false;
let lastX = 0, lastY = 0;
let isErasing = false;
let currentBrush = "basic";
let currentStrokeId = null;

ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = "#000000";
ctx.fillStyle   = "#000000";
ctx.lineWidth   = Number(widthRange.value);
widthValue.textContent = `${ctx.lineWidth}px`;

function setMode(erase){
  isErasing = erase;
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  brushBtn.style.outlineColor  = erase ? "#333"   : "#0a84ff";
  eraserBtn.style.outlineColor = erase ? "#0a84ff": "#333";
}
setMode(false);

function applyLineSettings(){
  ctx.lineWidth = Number(widthRange.value);
  widthValue.textContent = `${ctx.lineWidth}px`;
}
widthRange.addEventListener("input", applyLineSettings);

colorPicker.addEventListener("input", (e)=>{
  ctx.strokeStyle = e.target.value;
  ctx.fillStyle   = e.target.value;
  if (isErasing) setMode(false);
});
[ 
  ["#000000", blackBtn],
  ["#FF0000", redBtn],
  ["#0000FF", blueBtn],
  ["#00FF00", greenBtn],
].forEach(([hex, btn])=>{
  btn.addEventListener("click", ()=>{
    ctx.strokeStyle = hex; ctx.fillStyle = hex;
    colorPicker.value = hex;
    if (isErasing) setMode(false);
  });
});
brushBtn.addEventListener("click", ()=> setMode(false));
eraserBtn.addEventListener("click", ()=> setMode(true));
brushSelect.addEventListener("change", (e)=> currentBrush = e.target.value);

clearBtn.addEventListener("click", ()=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);
  socket.emit("clear");
});
undoBtn?.addEventListener("click", ()=> socket.emit("undo"));
redoBtn?.addEventListener("click", ()=> socket.emit("redo"));

// ==========================
// Pointer helpers
// ==========================
function pos(e){
  if (e.touches && e.touches.length){
    const r = canvas.getBoundingClientRect();
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  }
  return { x: e.offsetX, y: e.offsetY };
}
function newStrokeId(){
  return me.id + "-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
}

// Cursor broadcast (rAF)
let latestPointer = null; // {x,y,drawing}
function sendCursorLoop(){
  if (latestPointer){
    socket.emit("cursor", {
      id: me.id, x: latestPointer.x, y: latestPointer.y,
      color: me.color, name: me.name, drawing, ts: Date.now()
    });
  }
  requestAnimationFrame(sendCursorLoop);
}
requestAnimationFrame(sendCursorLoop);

// ==========================
// rAF throttled network draw
// ==========================
let pendingSeg = null;   // last segment to send this frame
let lastEmitX = null, lastEmitY = null;

function flushLoop(){
  if (pendingSeg){
    socket.emit("draw", pendingSeg);          // one per frame
    lastEmitX = pendingSeg.x1;
    lastEmitY = pendingSeg.y1;
    pendingSeg = null;
  }
  requestAnimationFrame(flushLoop);
}
requestAnimationFrame(flushLoop);

// ==========================
// Start / Move / End draw
// ==========================
function startDraw(e){
  e.preventDefault();
  drawing = true;
  const p = pos(e);
  latestPointer = { x: p.x, y: p.y, drawing: true };
  lastX = p.x; lastY = p.y;

  currentStrokeId = newStrokeId();
  socket.emit("beginStroke", {
    strokeId: currentStrokeId,
    userId: me.id,
    color: ctx.strokeStyle,
    width: ctx.lineWidth,
    brush: currentBrush,
    erase: isErasing,
  });

  // initial stamp
  stampAlong(lastX, lastY, lastX, lastY);
}

function moveDraw(e){
  const p = pos(e);
  latestPointer = { x: p.x, y: p.y, drawing };

  if(!drawing) return;
  e.preventDefault();

  // local paint (full fidelity)
  stampAlong(lastX, lastY, p.x, p.y);

  // queue one network segment for this frame
  const x0 = (lastEmitX == null ? lastX : lastEmitX);
  const y0 = (lastEmitY == null ? lastY : lastEmitY);

  pendingSeg = {
    strokeId: currentStrokeId,
    x0, y0, x1: p.x, y1: p.y,
    color: ctx.strokeStyle,
    width: ctx.lineWidth,
    brush: currentBrush,
    erase: isErasing,
    ts: Date.now(),
  };

  lastX = p.x; lastY = p.y;
}

function endDraw(){
  drawing = false;
  if (latestPointer) latestPointer.drawing = false;
  if (currentStrokeId) {
    socket.emit("endStroke", { strokeId: currentStrokeId });
    currentStrokeId = null;
  }
  lastEmitX = lastEmitY = null;               // reset anchors
}

// Mouse
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
canvas.addEventListener("mouseup",   endDraw);
canvas.addEventListener("mouseleave",endDraw);
// Touch
canvas.addEventListener("touchstart", startDraw, {passive:false});
canvas.addEventListener("touchmove",  moveDraw,  {passive:false});
canvas.addEventListener("touchend",   endDraw);

// ==========================
// Brush engine
// ==========================
function stampAlong(x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const spacing = Math.max(1, ctx.lineWidth * 0.4);

  if (currentBrush === "basic" && !isErasing){
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    return;
  }

  const steps = Math.max(1, Math.floor(dist / spacing));
  for (let i = 0; i <= steps; i++){
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    stamp(x, y, x0, y0, x1, y1);
  }
}
function stamp(x, y, x0, y0, x1, y1){
  const w = ctx.lineWidth;
  switch(currentBrush){
    case "basic": {
      ctx.beginPath();
      ctx.arc(x, y, w * 0.5, 0, Math.PI*2);
      ctx.fill();
      break;
    }
    case "calligraphy": {
      const angle = -Math.PI/6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.7, w * 0.25, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "airbrush": {
      const radius = w * 0.8;
      const dots = Math.max(6, Math.floor(w * 2));
      const old = ctx.globalAlpha;
      ctx.globalAlpha = 0.2;
      for (let i=0;i<dots;i++){
        const r = Math.random() * radius;
        const a = Math.random() * Math.PI*2;
        const px = x + Math.cos(a)*r;
        const py = y + Math.sin(a)*r;
        ctx.beginPath();
        ctx.arc(px, py, 0.6 + Math.random()*1.2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = old;
      break;
    }
    case "marker": {
      const old = ctx.globalAlpha;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(x, y, w * 0.65, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = old;
      break;
    }
    case "pencil": {
      const oldA = ctx.globalAlpha, oldW = ctx.lineWidth;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = Math.max(1, w * 0.35);
      const jitter = w * 0.25;
      const jx = (Math.random()-0.5) * jitter;
      const jy = (Math.random()-0.5) * jitter;
      ctx.beginPath();
      ctx.moveTo(x + jx, y + jy);
      ctx.lineTo(x - jx, y - jy);
      ctx.stroke();
      ctx.globalAlpha = oldA; ctx.lineWidth = oldW;
      break;
    }
    case "watercolor": {
      const oldA = ctx.globalAlpha;
      ctx.globalAlpha = 0.08;
      const r = w * 1.1;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, ctx.fillStyle);
      g.addColorStop(1, "rgba(0,0,0,0)");
      const oldFill = ctx.fillStyle;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = oldFill;
      ctx.globalAlpha = oldA;
      break;
    }
  }
}

// ==========================
// Shortcuts
// ==========================
window.addEventListener("keydown", (e)=>{
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key.toLowerCase() === "b") setMode(false);
  if (e.key.toLowerCase() === "e") setMode(true);
  if (e.key === "["){ widthRange.value = Math.max(1, Number(widthRange.value)-1); applyLineSettings(); }
  if (e.key === "]"){ widthRange.value = Math.min(50, Number(widthRange.value)+1); applyLineSettings(); }
  if (ctrl && e.key.toLowerCase() === "z"){ e.preventDefault(); socket.emit("undo"); }
  if (ctrl && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))){ e.preventDefault(); socket.emit("redo"); }
});

// ==========================
// Conflict resolution (strict in-order by seq)
// ==========================
const segBuffer = new Map(); // seq -> seg
let nextSeq = 1;
let lastAppliedAt = Date.now();

function drawRemoteSegment(seg){
  ctx.save();
  ctx.lineWidth = seg.width;
  ctx.strokeStyle = seg.color;
  ctx.fillStyle   = seg.color;
  ctx.globalCompositeOperation = seg.erase ? "destination-out" : "source-over";

  const prevBrush = currentBrush, prevErase = isErasing;
  currentBrush = seg.brush;
  isErasing = !!seg.erase;

  stampAlong(seg.x0, seg.y0, seg.x1, seg.y1);

  currentBrush = prevBrush; isErasing = prevErase;
  ctx.restore();
}
function applySeg(seg){ drawRemoteSegment(seg); lastAppliedAt = Date.now(); }

function drainBuffer(){
  while (segBuffer.has(nextSeq)){
    const seg = segBuffer.get(nextSeq);
    segBuffer.delete(nextSeq);
    applySeg(seg);
    nextSeq++;
  }
}

// ==========================
// Socket listeners
// ==========================
socket.on("init", (payload) => {
  const history = payload?.strokes ?? [];
  const users   = payload?.users   ?? [];
  renderUsers(users);

  ctx.clearRect(0,0,canvas.width,canvas.height);
  segBuffer.clear();
  nextSeq = 1;

  for (const stroke of history){
    for (const seg of stroke.segments){
      applySeg(seg);
      if (typeof seg.seq === "number") nextSeq = Math.max(nextSeq, seg.seq + 1);
    }
  }
});

socket.on("state", (activeStrokes) => {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  segBuffer.clear();
  nextSeq = 1;

  for (const s of activeStrokes){
    for (const seg of s.segments){
      applySeg(seg);
      if (typeof seg.seq === "number") nextSeq = Math.max(nextSeq, seg.seq + 1);
    }
  }
});

socket.on("draw", (seg) => {
  if (typeof seg.seq !== "number"){ applySeg(seg); return; }
  if (seg.seq < nextSeq) return; // ignore duplicates/ancient

  if (seg.seq === nextSeq){
    applySeg(seg);
    nextSeq++;
    drainBuffer();
  } else {
    segBuffer.set(seg.seq, seg);
    drainBuffer(); // always try to advance
  }
});

socket.on("clear", () => {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  segBuffer.clear();
  nextSeq = 1;
});

// Live cursors
const peers = new Map(); // id -> { x,y,color,name,drawing,last }
socket.on("cursor", (p) => {
  peers.set(p.id, { ...p, last: Date.now() });
});
function prunePeers(){
  const now = Date.now();
  for (const [id,u] of peers){
    if (now - u.last > 3000) peers.delete(id);
  }
}
function renderCursors(){
  octx.clearRect(0,0,overlay.width,overlay.height);
  prunePeers();
  peers.forEach((u) => {
    const age = (Date.now() - u.last) / 1000;
    const alpha = Math.max(0, 1 - age/3);
    octx.save(); octx.globalAlpha = alpha;

    octx.beginPath();
    octx.lineWidth = 2;
    octx.strokeStyle = u.color;
    octx.arc(u.x, u.y, u.drawing ? 9 : 6, 0, Math.PI*2);
    octx.stroke();

    octx.beginPath();
    octx.fillStyle = u.color;
    octx.arc(u.x, u.y, 2.5, 0, Math.PI*2);
    octx.fill();

    const label = `${u.name}${u.drawing ? " ✏️" : ""}`;
    const pad = 6;
    octx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const w = octx.measureText(label).width;
    const bx = u.x + 12, by = u.y - 18;

    octx.fillStyle = "rgba(255,255,255,0.9)";
    octx.strokeStyle = u.color;
    octx.lineWidth = 1.5;
    if (octx.roundRect){ octx.beginPath(); octx.roundRect(bx, by, w + pad*2, 20, 6); octx.fill(); octx.stroke(); }
    else { octx.fillRect(bx, by, w + pad*2, 20); octx.strokeRect(bx, by, w + pad*2, 20); }

    octx.fillStyle = "#111";
    octx.fillText(label, bx + pad, by + 14);

    octx.restore();
  });
  requestAnimationFrame(renderCursors);
}
requestAnimationFrame(renderCursors);

// ==========================
// Optional: auto-resync if stalled
// ==========================
setInterval(() => {
  if (segBuffer.size > 300 || Date.now() - lastAppliedAt > 1000) {
    socket.emit("resync");
  }
}, 600);
