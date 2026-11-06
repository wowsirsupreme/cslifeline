// js/behavioral.js
// Captures avoidance / uncertainty / false-mastery signals per question attempt

export class BehavioralCapture {
  constructor() { this.reset(); this._bind(); }

  reset() {
    this.startMs          = Date.now();
    this.firstAnswerMs    = null;
    this.tabSwitches      = 0;
    this.awayMs           = 0;
    this._awayStart       = null;
    this.answerHistory    = [];   // [{value, correct, ts}]
    this.hintUsed         = false;
    this.returnedAfter    = false;
    this._wasCorrect      = false;
  }

  _bind() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this._awayStart = Date.now();
        this.tabSwitches++;
      } else {
        if (this._awayStart) {
          this.awayMs += Date.now() - this._awayStart;
          this._awayStart = null;
          this.returnedAfter = true;
        }
      }
    });
  }

  recordAnswer(value, isCorrect) {
    if (!this.firstAnswerMs) this.firstAnswerMs = Date.now();
    if (isCorrect) this._wasCorrect = true;
    this.answerHistory.push({ value, isCorrect, ts: Date.now() });
  }

  recordHint() { this.hintUsed = true; }

  signals(finalCorrect) {
    const totalMs      = Date.now() - this.startMs;
    const netThinkMs   = Math.max(0, totalMs - this.awayMs);
    const hesitationMs = this.firstAnswerMs ? this.firstAnswerMs - this.startMs : totalMs;
    const revisions    = Math.max(0, this.answerHistory.length - 1);
    const changedAfter = this.returnedAfter && revisions > 0;
    const falseMastery = this._wasCorrect && !finalCorrect;
    const avoidance    = this.tabSwitches > 0 && !finalCorrect;
    const uncertainty  = revisions > 1 || hesitationMs > 15000;

    return {
      total_time_ms:              totalMs,
      net_think_time_ms:          netThinkMs,
      away_time_ms:               this.awayMs,
      hesitation_ms:              hesitationMs,
      tab_switch_count:           this.tabSwitches,
      returned_after_switch:      this.returnedAfter,
      changed_answer_after_switch:changedAfter,
      revision_count:             revisions,
      hint_used:                  this.hintUsed,
      was_correct_at_any_point:   this._wasCorrect,
      signal_avoidance:           avoidance,
      signal_uncertainty:         uncertainty,
      signal_false_mastery:       falseMastery,
    };
  }
}
