// =========================================================
// controls.js — Mobil sanal joystick, kamera sürükleme ve klavye desteği
// =========================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Controls {
  /**
   * @param {{zone:HTMLElement, base:HTMLElement, knob:HTMLElement, lookTarget:HTMLElement}} els
   */
  constructor({ zone, base, knob, lookTarget }) {
    this.zone = zone;
    this.base = base;
    this.knob = knob;
    this.joy = { x: 0, y: 0, id: null };
    this.keys = new Set();
    this.brakeHeld = false;
    this.lookDX = 0;
    this.look = { id: null, lastX: 0 };
    this.enabled = true;

    this._bindJoystick();
    this._bindLook(lookTarget);
    this._bindKeyboard();
  }

  _bindJoystick() {
    const update = (e) => {
      const r = this.base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width * 0.5;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      let nx = dx / max;
      let ny = -dy / max;
      const mag = Math.hypot(nx, ny);
      const dead = 0.12;
      if (mag < dead) {
        nx = 0;
        ny = 0;
      } else {
        const s = (mag - dead) / (1 - dead) / mag;
        nx *= s;
        ny *= s;
      }
      this.joy.x = nx;
      this.joy.y = ny;
    };

    this.zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null || !this.enabled) return;
      e.preventDefault();
      this.joy.id = e.pointerId;
      try { this.zone.setPointerCapture(e.pointerId); } catch { /* yok say */ }
      this.base.classList.add('active');
      update(e);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      e.preventDefault();
      update(e);
    });
    const end = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.resetJoystick();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.zone.addEventListener('lostpointercapture', end);
  }

  resetJoystick() {
    this.joy.x = 0;
    this.joy.y = 0;
    this.joy.id = null;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.remove('active');
  }

  _bindLook(el) {
    el.addEventListener('pointerdown', (e) => {
      if (this.look.id !== null) return;
      this.look.id = e.pointerId;
      this.look.lastX = e.clientX;
      try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      this.lookDX += e.clientX - this.look.lastX;
      this.look.lastX = e.clientX;
    });
    const end = (e) => {
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  _bindKeyboard() {
    const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (GAME_KEYS.includes(e.code) && document.activeElement?.tagName !== 'INPUT') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.brakeHeld = false;
      this.resetJoystick();
    });
  }

  /** Kamera sürükleme miktarını (piksel) al ve sıfırla. */
  consumeLook() {
    const v = this.lookDX;
    this.lookDX = 0;
    return v;
  }

  /** Birleşik hareket vektörü: x = sağ(+), y = ileri(+), -1..1 */
  getMove() {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let x = this.joy.x + kx;
    let y = this.joy.y + ky;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (!this.enabled) return { x: 0, y: 0 };
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  get brake() {
    return this.brakeHeld || this.keys.has('Space');
  }
}
