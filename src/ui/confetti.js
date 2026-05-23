function fireDayCompleteConfetti() {
  if (typeof window === "undefined") return;
  let confetti;
  try { confetti = require("canvas-confetti"); } catch (e) {
    console.error("streak-tracker: confetti unavailable", e);
    return;
  }
  const end = Date.now() + 800;
  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      zIndex: 10000
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      zIndex: 10000
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, zIndex: 10000 });
}

module.exports = { fireDayCompleteConfetti };
