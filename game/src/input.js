// v16 clean re-record (01a1f6c1-0eeb-7191-b67c-e5c3196775d3).
// v16: no functional change — R/Q still cycle the radio station the
// HUD's ticker names, and every other key binding is untouched.
// Solmar Bay 3D — keyboard + mouse input. Tracks held keys,
// edge-triggered presses (so E / P / C / G / R fire once per tap), and
// the mouse position in normalized device coordinates (main.js turns it
// into a ground-plane aim point through the camera each frame).

export function createInput() {
  return {
    forward: false, back: false, left: false, right: false,
    run: false, handbrake: false,
    interact: false,        // E held (for hold-to-crack)
    interactPressed: false, // E edge
    punch: false,           // F edge
    pausePressed: false,    // P / Escape edge
    confirmPressed: false,  // Enter / Space edge (dialogue, menus)
    radioNext: false,       // R edge
    radioPrev: false,       // Q edge
    phonePressed: false,    // C edge
    garagePressed: false,   // G edge
    taxiPressed: false,     // T edge (start taxi fare / street race)
    mutePressed: false,     // M edge
    digit: -1,              // digit key pressed this frame (0-6), -1 none
    weaponKey: -1,          // 1-4 weapon select
    mouseDown: false,
    mouseX: 0, mouseY: 0,   // NDC (-1..1)
    mouseMoved: false,
    keys: new Set(),
  };
}

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'handbrake',
};

export function attachInput(input, canvas) {
  const down = (e) => {
    if (e.repeat) return;
    const held = KEYMAP[e.code];
    if (held) input[held] = true;
    input.keys.add(e.code);
    if (e.code === 'KeyE') { input.interact = true; input.interactPressed = true; }
    if (e.code === 'KeyF') input.punch = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pausePressed = true;
    if (e.code === 'Enter') input.confirmPressed = true;
    if (e.code === 'KeyR') input.radioNext = true;
    if (e.code === 'KeyQ') input.radioPrev = true;
    if (e.code === 'KeyC') input.phonePressed = true;
    if (e.code === 'KeyG') input.garagePressed = true;
    if (e.code === 'KeyT') input.taxiPressed = true;
    if (e.code === 'KeyM') input.mutePressed = true;
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      input.digit = n;
      if (n >= 1 && n <= 4) input.weaponKey = n;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  const up = (e) => {
    const held = KEYMAP[e.code];
    if (held) input[held] = false;
    input.keys.delete(e.code);
    if (e.code === 'KeyE') input.interact = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.mouseDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
    input.mouseY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    input.mouseMoved = true;
  });
  // Prevent the context menu from eating right-clicks.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Clear the edge-triggered flags at the end of each frame. */
export function clearEdges(input) {
  input.interactPressed = false;
  input.punch = false;
  input.pausePressed = false;
  input.confirmPressed = false;
  input.radioNext = false;
  input.radioPrev = false;
  input.phonePressed = false;
  input.garagePressed = false;
  input.taxiPressed = false;
  input.mutePressed = false;
  input.digit = -1;
  input.weaponKey = -1;
  input.mouseMoved = false;
}
