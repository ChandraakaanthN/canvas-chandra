// rooms.js (simple wrapper for room state)
const rooms = new Map();
const MAX_STEPS = 12000;

function getRoom(roomId){
  if (!rooms.has(roomId)){
    rooms.set(roomId, { lastSeq: 0, users: new Map(), strokes: [], redo: [] });
  }
  return rooms.get(roomId);
}

module.exports = { getRoom };
