// js/sync.js — all Firestore operations
// Real-time listeners use onSnapshot (no orderBy to avoid composite index requirement)
// Sorting is done in JS after fetch

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
  writeBatch, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Sessions ──────────────────────────────────────────────────────
export async function startSession(uid, classCode, paper) {
  const ref = await addDoc(collection(db, "sessions"), {
    student_uid: uid, class_code: classCode, paper,
    started_at: serverTimestamp(), ended_at: null,
    question_count: 0, correct_count: 0
  });
  return ref.id;
}
export async function endSession(sid, stats) {
  if (!sid || sid.startsWith('local-')) return;
  await setDoc(doc(db, "sessions", sid),
    { ended_at: serverTimestamp(), ...stats }, { merge: true });
}

// ── Live behavioral signal ─────────────────────────────────────────
export async function pushBehavioralSignal(uid, sessionId, classCode, chapterId, signal) {
  return setDoc(doc(db, "live_signals", uid), {
    student_uid: uid, session_id: sessionId,
    class_code: classCode, chapter_id: chapterId,
    tab_switch_count:     signal.tab_switch_count,
    away_time_ms:         signal.away_time_ms,
    hesitation_ms:        signal.hesitation_ms,
    signal_avoidance:     signal.signal_avoidance,
    signal_uncertainty:   signal.signal_uncertainty,
    signal_false_mastery: signal.signal_false_mastery,
    revision_count:       signal.revision_count,
    hint_used:            signal.hint_used,
    updated_at:           serverTimestamp(),
    is_active:            true
  }, { merge: false });
}
export async function clearLiveSignal(uid) {
  try {
    await setDoc(doc(db, "live_signals", uid),
      { is_active: false, updated_at: serverTimestamp() }, { merge: true });
  } catch(e) {}
}

// ── Responses ─────────────────────────────────────────────────────
export async function saveResponse(sid, uid, qid, tag, chapter, paper, correct, signals) {
  return addDoc(collection(db, "responses"), {
    session_id: sid, student_uid: uid, question_id: qid,
    misconception_tag: tag, chapter_id: chapter, paper,
    correct, recorded_at: serverTimestamp(), ...signals
  });
}

// ── REAL-TIME listeners — no orderBy to avoid composite index requirement ──
// All sorting done client-side in JS

export function listenLiveSignals(classCode, cb) {
  // live_signals: where class_code + is_active — needs index
  // Fallback: query all live signals, filter in JS
  try {
    return onSnapshot(
      query(collection(db, "live_signals"),
        where("class_code", "==", classCode)),
      snap => cb(snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(d => d.is_active === true)),
      err => console.warn('listenLiveSignals:', err.message)
    );
  } catch(e) {
    console.warn('listenLiveSignals setup:', e.message);
    return () => {};
  }
}

export function listenClassResponses(classCode, cb) {
  // IMPORTANT: no orderBy — avoids composite index requirement
  // Sort by recorded_at in JS callback instead
  try {
    return onSnapshot(
      query(collection(db, "responses"),
        where("class_code", "==", classCode)),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort newest first in JS
        docs.sort((a, b) => {
          const ta = a.recorded_at?.seconds || 0;
          const tb = b.recorded_at?.seconds || 0;
          return tb - ta;
        });
        cb(docs);
      },
      err => console.warn('listenClassResponses:', err.message)
    );
  } catch(e) {
    console.warn('listenClassResponses setup:', e.message);
    return () => {};
  }
}

export function listenClassStudents(classCode, cb) {
  try {
    return onSnapshot(
      query(collection(db, "users"),
        where("classCode", "==", classCode),
        where("role", "==", "student")),
      snap => cb(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
      err => console.warn('listenClassStudents:', err.message)
    );
  } catch(e) {
    console.warn('listenClassStudents setup:', e.message);
    return () => {};
  }
}

export function listenRecentActivity(classCode, cb) {
  // No orderBy + limit — use where only, slice in JS
  try {
    return onSnapshot(
      query(collection(db, "responses"),
        where("class_code", "==", classCode)),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.recorded_at?.seconds||0) - (a.recorded_at?.seconds||0));
        cb(docs.slice(0, 50));
      },
      err => console.warn('listenRecentActivity:', err.message)
    );
  } catch(e) {
    console.warn('listenRecentActivity setup:', e.message);
    return () => {};
  }
}

export function listenPredictions(classCode, cb) {
  try {
    return onSnapshot(
      query(collection(db, "predictions"),
        where("class_code", "==", classCode)),
      snap => {
        const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        docs.sort((a, b) => (b.predicted_at?.seconds||0) - (a.predicted_at?.seconds||0));
        cb(docs);
      },
      err => console.warn('listenPredictions:', err.message)
    );
  } catch(e) {
    console.warn('listenPredictions setup:', e.message);
    return () => {};
  }
}

export function listenResponses(uid, cb) {
  try {
    return onSnapshot(
      query(collection(db, "responses"),
        where("student_uid", "==", uid)),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (b.recorded_at?.seconds||0) - (a.recorded_at?.seconds||0));
        cb(docs);
      },
      err => console.warn('listenResponses:', err.message)
    );
  } catch(e) {
    console.warn('listenResponses setup:', e.message);
    return () => {};
  }
}

export function listenPrediction(uid, cb) {
  try {
    return onSnapshot(doc(db, "predictions", uid),
      snap => cb(snap.exists() ? snap.data() : null),
      err => console.warn('listenPrediction:', err.message)
    );
  } catch(e) {
    console.warn('listenPrediction setup:', e.message);
    return () => {};
  }
}

export async function getPrediction(uid) {
  const snap = await getDoc(doc(db, "predictions", uid));
  return snap.exists() ? snap.data() : null;
}

// ── Questions ─────────────────────────────────────────────────────
export async function getQuestions(chapter, paper, limitN = 10) {
  const constraints = [where("active", "==", true)];
  if (chapter) constraints.push(where("chapter_id", "==", chapter));
  if (paper)   constraints.push(where("paper", "==", paper));
  const snap = await getDocs(query(collection(db, "questions"), ...constraints));
  const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return all.sort(() => Math.random() - 0.5).slice(0, limitN);
}

// ── One-time fetches ──────────────────────────────────────────────
export async function getClassStudents(classCode) {
  const snap = await getDocs(query(collection(db, "users"),
    where("classCode", "==", classCode), where("role", "==", "student")));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function getClassResponses(classCode) {
  const students = await getClassStudents(classCode);
  const uids = students.map(s => s.uid);
  if (!uids.length) return [];
  const responses = [];
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const snap  = await getDocs(query(collection(db, "responses"),
      where("student_uid", "in", chunk)));
    responses.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }
  return responses;
}

export async function getAllQuestions() {
  const snap = await getDocs(query(collection(db, "questions"), where("active", "==", true)));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

export async function deleteQuestion(docId) {
  await updateDoc(doc(db, "questions", docId), { active: false });
}

export async function upsertQuestion(q) {
  // If q has _id it already exists — update. Otherwise add new.
  if (q._id) {
    const { _id, ...data } = q;
    await setDoc(doc(db, "questions", _id), { ...data, active: true, updated_at: serverTimestamp() }, { merge: true });
    return _id;
  } else {
    const ref = await addDoc(collection(db, "questions"), { ...q, active: true, created_at: serverTimestamp() });
    return ref.id;
  }
}

export async function bulkUploadQuestions(questions) {
  const batch = writeBatch(db);
  questions.forEach(q => {
    batch.set(doc(collection(db, "questions")), {
      ...q, active: true, created_at: serverTimestamp()
    });
  });
  await batch.commit();
  return questions.length;
}
