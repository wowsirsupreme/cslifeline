// Per-question behaviour capture.
//
// What is recorded, and why (docs/SECURITY_AND_PRIVACY.md):
//   time_ms           time spent on the question while the page was visible
//   time_to_first_ms  time before the first answer was chosen or typed
//   revisions         number of times the answer was changed
//   hint_used         whether the hint was opened (practice only)
//   interruptions     number of times the page was hidden while answering
//   away_ms           total time the page was hidden while answering
//   offline           whether the device was offline at any point
//
// Interruptions are context, not evidence of cheating or avoidance: they happen when a
// phone locks, a notification is opened, a school device switches windows, or an
// accessibility tool is used. v3 derived "avoidance" from them; that label is removed.
// Nothing about other applications, browsing, location or the device is collected.

export class BehaviourCapture {
  constructor({ captureInterruptions = true } = {}) {
    this.captureInterruptions = captureInterruptions;
    this._onVis = () => this._visibility();
    this._onOff = () => { this.offline = true; };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
    if (typeof window !== 'undefined') window.addEventListener('offline', this._onOff);
    this.reset();
  }

  reset() {
    this.start = Date.now();
    this.first = null;
    this.changes = 0;
    this.lastValue = undefined;
    this.hint = false;
    this.interruptions = 0;
    this.awayMs = 0;
    this._awayStart = null;
    this.offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  _visibility() {
    if (!this.captureInterruptions) return;
    if (document.hidden) { this._awayStart = Date.now(); this.interruptions++; }
    else if (this._awayStart) { this.awayMs += Date.now() - this._awayStart; this._awayStart = null; }
  }

  answerChanged(value) {
    const v = JSON.stringify(value);
    if (this.first === null) this.first = Date.now();
    else if (v !== this.lastValue) this.changes++;
    this.lastValue = v;
  }

  hintOpened() { this.hint = true; }

  snapshot() {
    const now = Date.now();
    const away = this.awayMs + (this._awayStart ? now - this._awayStart : 0);
    const out = {
      time_ms: Math.max(0, now - this.start - away),
      time_to_first_ms: this.first ? this.first - this.start : null,
      revisions: this.changes,
      hint_used: this.hint,
      offline: this.offline,
    };
    if (this.captureInterruptions) { out.interruptions = this.interruptions; out.away_ms = away; }
    return out;
  }

  destroy() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVis);
    if (typeof window !== 'undefined') window.removeEventListener('offline', this._onOff);
  }
}
