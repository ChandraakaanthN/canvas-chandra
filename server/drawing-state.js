// drawing-state.js (helpers)
function validSeg(seg) {
  if (!seg || typeof seg !== "object") return false;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!num(seg.x0) || !num(seg.y0) || !num(seg.x1) || !num(seg.y1)) return false;
  if (!num(seg.width) || seg.width <= 0 || seg.width > 200) return false;
  if (typeof seg.color !== "string" || seg.color.length > 32) return false;
  if (typeof seg.brush !== "string" || seg.brush.length > 32) return false;
  if (typeof seg.erase !== "boolean") return false;
  if (typeof seg.strokeId !== "string" || !seg.strokeId) return false;
  return true;
}

module.exports = { validSeg };
