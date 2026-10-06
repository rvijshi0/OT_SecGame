/**
 * CYBER SHIFT — Bundled Application
 * Game engine, screens, session management and UI.
 * Scenario content lives in game-data.js (loaded first by index.html).
 */

(function() {
  'use strict';

  // ================================================================
  // GAME CONTENT (defined in game-data.js)
  // ================================================================
  const DATA = window.CYBERSHIFT_DATA;
  const { GAME_VERSION, SCENES_PER_MISSION, GRADES, SCORING, MISSIONS, TOPICS, BADGES } = DATA;
  const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const SEVERITY_LABELS = { low: 'Minor clue', medium: 'Suspicious', high: 'Red flag', critical: 'Major red flag' };

  // Expand authoring-friendly scenario data into the shape the engine uses
  const SCENES = DATA.SCENARIOS.map(s => {
    const scene = { ...s, evidence: (s.clues || []).map((c, i) => ({ id: 'c' + (i + 1), label: c.label, revealText: c.text, severity: c.severity || 'medium' })) };
    if (s.sequence) {
      scene.isSequence = true;
      scene.sequenceItems = s.sequence.steps.map((text, i) => ({ id: s.id + '-s' + (i + 1), text, correctOrder: i + 1 }));
      scene.decisions = [{ id: s.id + '-sequence', text: 'Submit your order', points: SCORING.sequencePoints, riskDelta: SCORING.sequenceRiskDelta, correct: true, critical: false, grade: 'best', explanation: s.sequence.why }];
    } else {
      scene.decisions = s.answers.map((a, i) => ({ id: s.id + '-' + 'abcdef'[i], text: a.text, explanation: a.why, grade: a.grade, ...GRADES[a.grade] }));
    }
    return scene;
  });
  const SCENE_BY_ID = Object.fromEntries(SCENES.map(s => [s.id, s]));

  // Content checks for editors of game-data.js (shown in the browser console)
  SCENES.forEach(s => {
    if (!s.isSequence && s.decisions.filter(d => d.grade === 'best').length !== 1) console.warn('[CYBER SHIFT] ' + s.id + ' should have exactly one "best" answer');
    if (!s.isSequence && s.decisions.some(d => !GRADES[d.grade])) console.warn('[CYBER SHIFT] ' + s.id + ' has an answer with an unknown grade');
    if (!TOPICS[s.topic]) console.warn('[CYBER SHIFT] ' + s.id + ' has unknown topic "' + s.topic + '"');
  });

  // ================================================================
  // SEEDED RANDOMNESS — each player gets their own, repeatable selection
  // ================================================================
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function seededRandom(seed) {
    let a = hashString(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    const rng = seededRandom(seed);
    const s = [...arr];
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    return s;
  }

  // Picks this player's scenarios: one from every badge topic first (so each badge is
  // achievable), then random fill, then a random running order.
  function pickScenes(mission, seedKey) {
    const seed = seedKey + '|' + mission + '|' + GAME_VERSION.contentVersion;
    const pool = seededShuffle(SCENES.filter(s => s.mission === mission), seed + '|pool');
    const chosen = [];
    BADGES[mission].filter(b => b.topic).forEach(b => {
      const s = pool.find(x => x.topic === b.topic && !chosen.includes(x));
      if (s) chosen.push(s);
    });
    for (const s of pool) {
      if (chosen.length >= SCENES_PER_MISSION) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
    return seededShuffle(chosen, seed + '|order').map(s => s.id);
  }

  // ================================================================
  // GAME ENGINE
  // ================================================================
  const engine = {
    state: null,
    sessions: JSON.parse(localStorage.getItem('cybershift_sessions') || '[]'),

    createSession(mission, seedKey) {
      const sceneIds = pickScenes(mission, seedKey || 'guest');
      this.state = {
        sessionId: 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        mission, seedKey: seedKey || 'guest', sceneIds, sceneId: sceneIds[0],
        contentVersion: GAME_VERSION.contentVersion,
        score: 0, risk: 0, decisionsMade: [], criticalErrors: 0,
        evidenceViewed: [], startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(), completed: false,
        badges: [], sceneHistory: [],
        replayIndex: this.sessions.filter(s => s.mission === mission).length,
        analyticsEvents: []
      };
      return this.state;
    },

    isValidRun(run) {
      return !!run && Array.isArray(run.sceneIds) && run.sceneIds.length > 0 && run.sceneIds.every(id => SCENE_BY_ID[id]) && !!SCENE_BY_ID[run.sceneId];
    },

    getScene(id) { return SCENE_BY_ID[id] || null; },

    getRunScenes(run) { return (run || this.state).sceneIds.map(id => SCENE_BY_ID[id]); },

    getCurrentScene() {
      return this.state ? this.getScene(this.state.sceneId) : null;
    },

    nextSceneId(sceneId, run) {
      const ids = (run || this.state).sceneIds;
      const idx = ids.indexOf(sceneId);
      return idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
    },

    // Answers in this player's shuffled order (stable across reloads and resume)
    getAnswers(scene) {
      return seededShuffle(scene.decisions, this.state.seedKey + '|answers|' + scene.id);
    },

    getSequenceItems(scene) {
      return seededShuffle(scene.sequenceItems, this.state.seedKey + '|steps|' + scene.id);
    },

    submitDecision(decisionId) {
      if (!this.state || this.state.completed) return null;
      const scene = this.getCurrentScene();
      if (!scene) return null;
      const decision = scene.decisions.find(d => d.id === decisionId);
      if (!decision) return null;
      if (this.state.decisionsMade.some(d => d.sceneId === scene.id)) return null;

      const badgesBefore = this.evaluateBadges();
      const evidenceBonus = this.state.evidenceViewed.some(e => e.startsWith(scene.id + ':')) ? SCORING.clueBonus : 0;
      const newScore = this.state.score + decision.points + evidenceBonus;
      const newRisk = Math.max(0, Math.min(100, this.state.risk + decision.riskDelta));

      this.state = { ...this.state,
        score: newScore, risk: newRisk,
        criticalErrors: this.state.criticalErrors + (decision.critical ? 1 : 0),
        decisionsMade: [...this.state.decisionsMade, {
          sceneId: scene.id, decisionId: decision.id, grade: decision.grade, points: decision.points + evidenceBonus,
          riskDelta: decision.riskDelta, correct: decision.correct, critical: decision.critical || false
        }],
        sceneHistory: [...this.state.sceneHistory, scene.id],
        lastActivityAt: new Date().toISOString()
      };
      const badgesAfter = this.evaluateBadges();
      this.state.badges = badgesAfter;

      return { decision, scene, newScore, newRisk, pointsChange: decision.points + evidenceBonus,
        riskChange: decision.riskDelta, newBadges: badgesAfter.filter(b => !badgesBefore.includes(b)),
        bestDecision: scene.decisions.find(d => d.grade === 'best'), nextScene: this.nextSceneId(scene.id) };
    },

    submitSequence(selectedOrder) {
      if (!this.state || this.state.completed) return null;
      const scene = this.getCurrentScene();
      if (!scene || !scene.isSequence) return null;
      if (this.state.decisionsMade.some(d => d.sceneId === scene.id)) return null;
      const badgesBefore = this.evaluateBadges();
      let correctCount = 0;
      selectedOrder.forEach((id, idx) => {
        const item = scene.sequenceItems.find(si => si.id === id);
        if (item && item.correctOrder === idx + 1) correctCount++;
      });
      const isCorrect = correctCount === scene.sequenceItems.length;
      const maxPoints = scene.decisions[0].points;
      const ratio = correctCount / scene.sequenceItems.length;
      const points = Math.round(isCorrect ? maxPoints : maxPoints * ratio * 0.7);
      const riskDelta = isCorrect ? scene.decisions[0].riskDelta : Math.round(-scene.decisions[0].riskDelta * (1 - ratio));
      const newScore = this.state.score + points;
      const newRisk = Math.max(0, Math.min(100, this.state.risk + riskDelta));

      this.state = { ...this.state, score: newScore, risk: newRisk,
        decisionsMade: [...this.state.decisionsMade, {
          sceneId: scene.id, decisionId: isCorrect ? scene.decisions[0].id : 'sequence-partial', grade: isCorrect ? 'best' : 'ok',
          points, riskDelta, correct: isCorrect, critical: false, sequenceAccuracy: ratio
        }],
        sceneHistory: [...this.state.sceneHistory, scene.id],
        lastActivityAt: new Date().toISOString()
      };
      const badgesAfter = this.evaluateBadges();
      this.state.badges = badgesAfter;
      return { isCorrect, correctCount, total: scene.sequenceItems.length, points, riskDelta,
        correctOrder: scene.sequenceItems.map(i => i.text),
        explanation: scene.decisions[0].explanation, newBadges: badgesAfter.filter(b => !badgesBefore.includes(b)),
        nextScene: this.nextSceneId(scene.id) };
    },

    advanceToScene(sceneId) {
      if (!this.state) return;
      if (sceneId === null) { this.completeMission(); return; }
      this.state = { ...this.state, sceneId };
    },

    viewEvidence(sceneId, evidenceId) {
      if (!this.state) return;
      const key = sceneId + ':' + evidenceId;
      if (!this.state.evidenceViewed.includes(key)) {
        this.state = { ...this.state, evidenceViewed: [...this.state.evidenceViewed, key] };
      }
    },

    // Best and worst achievable raw scores for this player's scenarios
    scoreRange() {
      let max = SCORING.completionBonus, min = SCORING.completionBonus;
      this.getRunScenes().forEach(s => {
        const pts = s.decisions.map(d => d.points);
        max += Math.max(...pts) + (s.evidence.length ? SCORING.clueBonus : 0);
        min += s.isSequence ? 0 : Math.min(...pts);
      });
      const clueCount = this.getRunScenes().reduce((n, s) => n + s.evidence.length, 0);
      if (clueCount >= SCORING.investigationThreshold) max += SCORING.investigationBonus;
      return { max, min };
    },

    completeMission() {
      if (!this.state || this.state.completed) return null;
      const investigationBonus = this.state.evidenceViewed.length >= SCORING.investigationThreshold ? SCORING.investigationBonus : 0;
      const finalRawScore = this.state.score + investigationBonus + SCORING.completionBonus;
      const range = this.scoreRange();
      const normalizedScore = Math.round(Math.max(0, Math.min(1000, ((finalRawScore - range.min) / (range.max - range.min)) * 1000)));
      const earnedBadges = this.evaluateBadges();
      const topics = [...new Set(this.getRunScenes().map(s => s.topic))];

      this.state = { ...this.state, score: finalRawScore, completed: true,
        normalizedScore, badges: earnedBadges, completedAt: new Date().toISOString() };
      this.saveSession();
      return { normalizedScore, rawScore: finalRawScore, risk: this.state.risk,
        criticalErrors: this.state.criticalErrors, badges: earnedBadges, topics,
        decisions: this.state.decisionsMade, mission: this.state.mission };
    },

    // Topic badges: every scenario of that topic answered safely. 'no-critical': finished without a dangerous choice.
    evaluateBadges() {
      const state = this.state;
      const answered = Object.fromEntries(state.decisionsMade.map(d => [d.sceneId, d]));
      const allDone = state.sceneIds.every(id => answered[id]);
      return BADGES[state.mission].filter(b => {
        if (b.rule === 'no-critical') return allDone && state.criticalErrors === 0;
        const ids = state.sceneIds.filter(id => SCENE_BY_ID[id].topic === b.topic);
        return ids.length > 0 && ids.every(id => answered[id] && answered[id].correct);
      }).map(b => b.id);
    },

    saveSession() {
      if (!this.state) return;
      this.sessions.push({
        sessionId: this.state.sessionId, mission: this.state.mission,
        normalizedScore: this.state.normalizedScore || 0, rawScore: this.state.score,
        risk: this.state.risk, criticalErrors: this.state.criticalErrors,
        badges: this.state.badges, completed: this.state.completed,
        startedAt: this.state.startedAt, completedAt: this.state.completedAt,
        replayIndex: this.state.replayIndex,
        displayName: localStorage.getItem('cybershift_displayName') || 'Player',
        teamName: localStorage.getItem('cybershift_teamName') || 'Default'
      });
      localStorage.setItem('cybershift_sessions', JSON.stringify(this.sessions));
    },

    getLeaderboard() {
      const all = this.sessions.filter(s => s.completed);
      const byPlayer = {};
      all.forEach(s => { const n = s.displayName || 'Player'; if (!byPlayer[n]) byPlayer[n] = []; byPlayer[n].push(s); });
      const lb = Object.entries(byPlayer).map(([name, sessions]) => {
        const sorted = sessions.sort((a, b) => b.normalizedScore - a.normalizedScore);
        const best3 = sorted.slice(0, 3);
        const avg = Math.round(best3.reduce((s, x) => s + x.normalizedScore, 0) / best3.length);
        return { name, avgScore: avg, gamesPlayed: sessions.length,
          badges: [...new Set(sessions.flatMap(s => s.badges || []))].length,
          criticalErrors: sessions.reduce((s, x) => s + (x.criticalErrors || 0), 0) };
      });
      lb.sort((a, b) => b.avgScore !== a.avgScore ? b.avgScore - a.avgScore : a.criticalErrors - b.criticalErrors);
      return lb;
    },

    getAnalytics() {
      const all = this.sessions.filter(s => s.completed);
      return {
        totalParticipants: [...new Set(all.map(s => s.displayName))].length,
        itCompletions: all.filter(s => s.mission === 'IT').length,
        otCompletions: all.filter(s => s.mission === 'OT').length,
        avgScore: all.length > 0 ? Math.round(all.reduce((s, x) => s + x.normalizedScore, 0) / all.length) : 0,
        totalBadges: all.reduce((s, x) => s + (x.badges?.length || 0), 0)
      };
    },

    getRiskLevel(risk) {
      if (risk >= 75) return { label: 'CRITICAL', cls: 'risk-critical' };
      if (risk >= 50) return { label: 'SEVERE', cls: 'risk-severe' };
      if (risk >= 25) return { label: 'ELEVATED', cls: 'risk-elevated' };
      if (risk > 0) return { label: 'CAUTION', cls: 'risk-caution' };
      return { label: 'STABLE', cls: '' };
    },

    setPlayerInfo(name, team) {
      localStorage.setItem('cybershift_displayName', name);
      localStorage.setItem('cybershift_teamName', team);
    },
    getPlayerInfo() {
      return { displayName: localStorage.getItem('cybershift_displayName') || '', teamName: localStorage.getItem('cybershift_teamName') || '' };
    },
    exportCSV() {
      const headers = ['sessionId','mission','displayName','teamName','normalizedScore','rawScore','risk','criticalErrors','badges','completed','startedAt','completedAt'];
      const rows = this.sessions.map(s => headers.map(h => { const v = s[h]; return Array.isArray(v) ? v.join(';') : (v ?? ''); }).join(','));
      return headers.join(',') + '\n' + rows.join('\n');
    }
  };

  // ================================================================
  // LOGO & SCENE ILLUSTRATIONS
  // ================================================================
  const ShieldLogo = '<svg viewBox="0 0 80 90" width="80" height="90" role="img" aria-label="Cyber Shift shield logo"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff4500"/><stop offset="100%" stop-color="#ff8c00"/></linearGradient><linearGradient id="si" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff4500" stop-opacity="0.18"/><stop offset="100%" stop-color="#ff8c00" stop-opacity="0.12"/></linearGradient></defs><path d="M40 5 L72 20 L72 50 Q72 72 40 85 Q8 72 8 50 L8 20Z" fill="url(#si)" stroke="url(#sg)" stroke-width="2.5"/><path d="M40 18 L40 35 M30 28 L50 28" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.6"/><rect x="30" y="42" width="20" height="18" rx="3" fill="url(#sg)" opacity="0.85"/><path d="M35 42 L35 36 Q35 28 40 28 Q45 28 45 36 L45 42" fill="none" stroke="url(#sg)" stroke-width="2.5" stroke-linecap="round"/><circle cx="40" cy="51" r="3" fill="#080c18"/><line x1="40" y1="54" x2="40" y2="57" stroke="#080c18" stroke-width="2" stroke-linecap="round"/><circle cx="40" cy="45" r="35" fill="none" stroke="url(#sg)" stroke-width="0.5" opacity="0.25"><animate attributeName="r" values="35;42;35" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.25;0.05;0.25" dur="3s" repeatCount="indefinite"/></circle></svg>';

  const ART_FONT = 'font-family="Inter,system-ui,sans-serif" font-weight="800" text-anchor="middle"';
  const artBadge = (x, y, color, glyph) => '<circle cx="' + x + '" cy="' + y + '" r="14" fill="' + color + '"/><text x="' + x + '" y="' + (y + 5.5) + '" font-size="16" fill="#fff" ' + ART_FONT + '>' + glyph + '</text>';
  const artPhone = (x, y) => '<rect x="' + x + '" y="' + y + '" width="60" height="112" rx="11" fill="#0f172a" stroke="#94a3b8" stroke-width="3"/><rect x="' + (x + 7) + '" y="' + (y + 12) + '" width="46" height="86" rx="4" fill="#1e293b"/>';
  const artLaptop = (screen) => '<rect x="42" y="30" width="116" height="74" rx="6" fill="#1e293b" stroke="#94a3b8" stroke-width="3"/>' + screen + '<path d="M28 106 H172 L162 118 H38 Z" fill="#334155" stroke="#94a3b8" stroke-width="2"/>';

  // Simple flat illustrations, one per scenario "art" key in game-data.js
  const ART = {
    email: '<rect x="46" y="42" width="108" height="72" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="3"/><path d="M48 48 L100 86 L152 48" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linejoin="round"/><path d="M48 112 L86 78 M152 112 L114 78" stroke="#3b82f6" stroke-width="2" opacity=".5"/>' + artBadge(152, 42, '#ef4444', '!'),
    sms: artPhone(70, 18) + '<rect x="81" y="38" width="34" height="14" rx="7" fill="#334155"/><rect x="84" y="58" width="36" height="28" rx="8" fill="#3b82f6"/><rect x="90" y="66" width="24" height="3" rx="1.5" fill="#e2e8f0"/><rect x="90" y="74" width="15" height="3" rx="1.5" fill="#fbbf24"/><rect x="81" y="92" width="26" height="12" rx="6" fill="#334155"/>' + artBadge(130, 22, '#ef4444', '1'),
    call: artPhone(70, 20) + '<circle cx="100" cy="60" r="15" fill="#334155"/><text x="100" y="66" font-size="16" fill="#e2e8f0" ' + ART_FONT + '>?</text><rect x="84" y="82" width="32" height="4" rx="2" fill="#475569"/><circle cx="100" cy="106" r="9" fill="#10b981"/><path d="M142 52 q12 23 0 46 M154 42 q18 33 0 66 M58 52 q-12 23 0 46 M46 42 q-18 33 0 66" fill="none" stroke="#06d6a0" stroke-width="3" stroke-linecap="round" opacity=".8"/>',
    video: artLaptop('<circle cx="100" cy="58" r="14" fill="#fbbf7f"/><path d="M74 100 q26 -34 52 0 Z" fill="#3b82f6"/><circle cx="100" cy="58" r="21" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 4"/><circle cx="54" cy="40" r="4" fill="#ef4444"/>'),
    mfa: artPhone(70, 18) + '<rect x="80" y="46" width="40" height="44" rx="6" fill="#334155"/><path d="M100 52 l10 4 v8 c0 7 -5 11 -10 13 c-5 -2 -10 -6 -10 -13 v-8 Z" fill="#06d6a0" opacity=".85"/><rect x="82" y="80" width="17" height="8" rx="3" fill="#10b981"/><rect x="101" y="80" width="17" height="8" rx="3" fill="#ef4444"/>' + artBadge(48, 44, '#f59e0b', '!') + artBadge(152, 60, '#f59e0b', '!') + artBadge(150, 112, '#f59e0b', '!'),
    ai: '<line x1="100" y1="40" x2="100" y2="24" stroke="#8b5cf6" stroke-width="3"/><circle cx="100" cy="21" r="6" fill="#f59e0b"/><rect x="58" y="40" width="84" height="66" rx="18" fill="#1e293b" stroke="#8b5cf6" stroke-width="3"/><circle cx="83" cy="68" r="8" fill="#06d6a0"/><circle cx="117" cy="68" r="8" fill="#06d6a0"/><rect x="84" y="88" width="32" height="6" rx="3" fill="#8b5cf6"/><rect x="48" y="62" width="10" height="20" rx="4" fill="#8b5cf6"/><rect x="142" y="62" width="10" height="20" rx="4" fill="#8b5cf6"/><path d="M60 118 h80" stroke="#8b5cf6" stroke-width="3" stroke-linecap="round" opacity=".5"/>',
    usb: '<g transform="rotate(-18 100 78)"><rect x="54" y="58" width="74" height="40" rx="7" fill="#334155" stroke="#94a3b8" stroke-width="3"/><rect x="128" y="65" width="26" height="26" rx="2" fill="#cbd5e1"/><rect x="135" y="72" width="5" height="5" fill="#475569"/><rect x="143" y="72" width="5" height="5" fill="#475569"/><rect x="64" y="68" width="34" height="20" rx="3" fill="#06d6a0" opacity=".35"/></g>' + artBadge(58, 40, '#f59e0b', '?'),
    door: '<rect x="66" y="18" width="68" height="116" rx="3" fill="#0f172a" stroke="#94a3b8" stroke-width="3"/><path d="M69 21 L112 30 V124 L69 131 Z" fill="#334155"/><circle cx="104" cy="78" r="3" fill="#cbd5e1"/><rect x="142" y="62" width="14" height="22" rx="3" fill="#0f172a" stroke="#06d6a0" stroke-width="2"/><circle cx="149" cy="70" r="3" fill="#06d6a0"/><circle cx="44" cy="70" r="10" fill="#f59e0b"/><path d="M28 124 q16 -48 32 0 Z" fill="#f59e0b"/><rect x="30" y="92" width="28" height="18" rx="2" fill="#a16207"/>',
    desk: '<rect x="48" y="26" width="104" height="68" rx="6" fill="#1e293b" stroke="#94a3b8" stroke-width="3"/><rect x="58" y="38" width="60" height="5" rx="2" fill="#475569"/><rect x="58" y="50" width="84" height="5" rx="2" fill="#475569"/><rect x="58" y="62" width="70" height="5" rx="2" fill="#475569"/><rect x="94" y="94" width="12" height="14" fill="#475569"/><rect x="74" y="108" width="52" height="7" rx="3" fill="#475569"/><rect x="26" y="98" width="18" height="22" rx="3" fill="#94a3b8"/><path d="M44 104 h5 a5 5 0 0 1 0 10 h-5" fill="none" stroke="#94a3b8" stroke-width="3"/><rect x="146" y="44" width="26" height="22" rx="4" fill="#f59e0b"/><path d="M151 44 v-8 a8 8 0 0 1 16 0" fill="none" stroke="#f59e0b" stroke-width="4" transform="translate(-6 -3) rotate(-20 159 36)"/>',
    printer: '<rect x="66" y="26" width="68" height="30" fill="#e2e8f0"/><rect x="48" y="54" width="104" height="44" rx="7" fill="#334155" stroke="#94a3b8" stroke-width="3"/><circle cx="138" cy="66" r="4" fill="#06d6a0"/><rect x="64" y="92" width="72" height="40" fill="#f8fafc"/><rect x="70" y="100" width="60" height="8" fill="#ef4444"/><rect x="72" y="113" width="50" height="3" fill="#94a3b8"/><rect x="72" y="120" width="40" height="3" fill="#94a3b8"/>',
    qr: '<rect x="54" y="24" width="92" height="92" rx="8" fill="#f1f5f9"/><rect x="64" y="34" width="24" height="24" fill="#0f172a"/><rect x="69" y="39" width="14" height="14" fill="#f1f5f9"/><rect x="73" y="43" width="6" height="6" fill="#0f172a"/><rect x="112" y="34" width="24" height="24" fill="#0f172a"/><rect x="117" y="39" width="14" height="14" fill="#f1f5f9"/><rect x="121" y="43" width="6" height="6" fill="#0f172a"/><rect x="64" y="82" width="24" height="24" fill="#0f172a"/><rect x="69" y="87" width="14" height="14" fill="#f1f5f9"/><rect x="73" y="91" width="6" height="6" fill="#0f172a"/><path d="M96 36h8v8h-8zM96 52h8v8h-8zM112 66h8v8h-8zM96 70h8v8h-8zM124 82h8v8h-8zM104 90h8v8h-8zM120 98h8v8h-8zM96 102h8v4h-8z" fill="#0f172a"/><rect x="46" y="68" width="108" height="3" fill="#ef4444"/>' + artBadge(146, 24, '#ef4444', '!'),
    password: '<g transform="rotate(-6 92 70)"><rect x="52" y="30" width="78" height="76" fill="#fbbf24"/><rect x="52" y="30" width="78" height="10" fill="#f59e0b"/><rect x="62" y="54" width="54" height="5" rx="2" fill="#92400e"/><rect x="62" y="68" width="40" height="5" rx="2" fill="#92400e"/><text x="90" y="96" font-size="14" fill="#92400e" ' + ART_FONT + '>••••••</text></g><circle cx="142" cy="96" r="13" fill="none" stroke="#06d6a0" stroke-width="5"/><path d="M151 106 L172 128 M162 117 l6 -6 M168 123 l6 -6" stroke="#06d6a0" stroke-width="5" stroke-linecap="round"/>',
    cafe: '<rect x="30" y="50" width="86" height="54" rx="5" fill="#1e293b" stroke="#94a3b8" stroke-width="3"/><path d="M20 106 H126 L118 116 H28 Z" fill="#334155"/><rect x="138" y="84" width="24" height="30" rx="4" fill="#e2e8f0"/><path d="M162 92 h5 a6 6 0 0 1 0 12 h-5" fill="none" stroke="#e2e8f0" stroke-width="3"/><path d="M146 76 q-4 -6 0 -12 M154 76 q-4 -6 0 -12" stroke="#94a3b8" stroke-width="2" fill="none"/><path d="M122 38 a36 36 0 0 1 50 0 M130 46 a24 24 0 0 1 34 0 M138 54 a12 12 0 0 1 18 0" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/><circle cx="147" cy="61" r="3.5" fill="#f59e0b"/>',
    lost: '<rect x="50" y="56" width="100" height="64" rx="9" fill="#334155" stroke="#94a3b8" stroke-width="3"/><path d="M84 56 v-12 h32 v12" fill="none" stroke="#94a3b8" stroke-width="4"/><rect x="50" y="78" width="100" height="6" fill="#475569"/><rect x="92" y="74" width="16" height="14" rx="3" fill="#cbd5e1"/>' + artBadge(152, 46, '#f59e0b', '?'),
    visitor: '<circle cx="100" cy="54" r="15" fill="#e8b89d"/><path d="M82 50 q18 -26 36 0 Z" fill="#f59e0b"/><rect x="80" y="48" width="40" height="5" rx="2" fill="#f59e0b"/><path d="M68 132 q32 -70 64 0 Z" fill="#7c3aed"/><rect x="106" y="92" width="18" height="12" rx="2" fill="#ef4444"/><rect x="56" y="92" width="22" height="30" rx="2" fill="#e2e8f0"/><rect x="61" y="88" width="12" height="6" rx="2" fill="#94a3b8"/><rect x="60" y="100" width="14" height="3" fill="#94a3b8"/><rect x="60" y="108" width="10" height="3" fill="#94a3b8"/>',
    camera: '<rect x="52" y="48" width="96" height="64" rx="10" fill="#334155" stroke="#94a3b8" stroke-width="3"/><rect x="62" y="40" width="24" height="10" rx="3" fill="#475569"/><circle cx="100" cy="80" r="21" fill="#0f172a" stroke="#06d6a0" stroke-width="4"/><circle cx="100" cy="80" r="9" fill="#1e293b"/><circle cx="94" cy="74" r="3" fill="#94a3b8"/><path d="M150 32 l6 -10 M162 42 l10 -4 M160 30 l8 -8" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>',
    network: '<rect x="26" y="52" width="44" height="32" rx="4" fill="#1e293b" stroke="#3b82f6" stroke-width="3"/><rect x="42" y="84" width="12" height="8" fill="#3b82f6"/><rect x="34" y="92" width="28" height="4" rx="2" fill="#3b82f6"/><circle cx="152" cy="74" r="20" fill="#1e293b" stroke="#ef4444" stroke-width="3"/><circle cx="152" cy="74" r="26" fill="none" stroke="#ef4444" stroke-width="6" stroke-dasharray="5 5"/><circle cx="152" cy="74" r="7" fill="#ef4444"/><path d="M74 74 H124" stroke="#f59e0b" stroke-width="3" stroke-dasharray="6 5"/><ellipse cx="99" cy="74" rx="9" ry="12" fill="#ef4444"/><path d="M90 66 l-7 -5 M108 66 l7 -5 M90 74 h-8 M108 74 h8 M90 82 l-7 5 M108 82 l7 5" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/><text x="48" y="122" font-size="10" fill="#94a3b8" ' + ART_FONT + '>OFFICE</text><text x="152" y="122" font-size="10" fill="#94a3b8" ' + ART_FONT + '>PLANT</text>',
    control: '<rect x="36" y="26" width="128" height="84" rx="6" fill="#0f172a" stroke="#94a3b8" stroke-width="3"/><path d="M52 64 a18 18 0 0 1 36 0" fill="none" stroke="#334155" stroke-width="6"/><path d="M52 64 a18 18 0 0 1 28 -15" fill="none" stroke="#06d6a0" stroke-width="6"/><rect x="98" y="40" width="8" height="24" fill="#334155"/><rect x="98" y="50" width="8" height="14" fill="#f59e0b"/><rect x="112" y="40" width="8" height="24" fill="#334155"/><rect x="112" y="44" width="8" height="20" fill="#ef4444"/><rect x="126" y="40" width="8" height="24" fill="#334155"/><rect x="126" y="56" width="8" height="8" fill="#06d6a0"/><path d="M48 98 L74 90 L96 94 L120 80 L150 72" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/><rect x="90" y="110" width="20" height="12" fill="#475569"/><rect x="70" y="122" width="60" height="6" rx="3" fill="#475569"/>',
    factory: '<path d="M26 124 V74 L52 58 V74 L78 58 V74 L104 58 V124 Z" fill="#334155" stroke="#94a3b8" stroke-width="2"/><rect x="112" y="34" width="16" height="90" fill="#475569"/><rect x="104" y="90" width="44" height="34" fill="#334155" stroke="#94a3b8" stroke-width="2"/><circle cx="120" cy="24" r="7" fill="#64748b" opacity=".6"/><circle cx="132" cy="14" r="9" fill="#64748b" opacity=".4"/><rect x="36" y="94" width="12" height="12" fill="#f59e0b" opacity=".8"/><rect x="60" y="94" width="12" height="12" fill="#f59e0b" opacity=".8"/><rect x="84" y="94" width="12" height="12" fill="#f59e0b" opacity=".8"/><circle cx="164" cy="104" r="14" fill="none" stroke="#06d6a0" stroke-width="6" stroke-dasharray="6 4"/><circle cx="164" cy="104" r="5" fill="#06d6a0"/>',
    alarm: '<path d="M70 104 a30 30 0 0 1 60 0 Z" fill="#ef4444"/><path d="M84 96 a16 16 0 0 1 16 -16" fill="none" stroke="#fecaca" stroke-width="4" stroke-linecap="round"/><rect x="60" y="104" width="80" height="14" rx="4" fill="#334155" stroke="#94a3b8" stroke-width="2"/><path d="M100 50 V34 M62 62 l-12 -10 M138 62 l12 -10 M50 88 H34 M150 88 H166" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>',
    'laptop-alert': artLaptop('<path d="M100 42 L128 92 H72 Z" fill="#ef4444"/><rect x="97" y="56" width="6" height="20" rx="3" fill="#fff"/><circle cx="100" cy="84" r="3.5" fill="#fff"/>'),
    wifi: '<path d="M40 70 a86 86 0 0 1 120 0 M56 86 a62 62 0 0 1 88 0 M72 102 a38 38 0 0 1 56 0" fill="none" stroke="#3b82f6" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="116" r="7" fill="#3b82f6"/>' + artBadge(150, 40, '#f59e0b', '?')
  };

  function renderArt(key) {
    const inner = ART[key] || ART.alarm;
    return '<svg viewBox="0 0 200 150" class="scene-art__svg" role="img" aria-hidden="true"><circle cx="100" cy="76" r="68" fill="#ff4500" opacity=".06"/><circle cx="100" cy="76" r="50" fill="#00d4ff" opacity=".04"/>' + inner + '</svg>';
  }

  // ================================================================
  // 3D CHARACTER SVGs — isometric low-poly figures
  // ================================================================
  // IT Worker: office professional at computer
  const CHAR_IT = `<svg viewBox="0 0 120 180" width="120" height="180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cit1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient>
      <linearGradient id="cit2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient>
      <linearGradient id="cit3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0f2040"/></linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="60" cy="175" rx="30" ry="5" fill="rgba(0,0,0,0.3)"/>
    <!-- Legs -->
    <rect x="45" y="130" width="12" height="38" rx="4" fill="#1e3a5f"/>
    <rect x="63" y="130" width="12" height="38" rx="4" fill="#1e3a5f"/>
    <!-- Shoes -->
    <ellipse cx="51" cy="168" rx="9" ry="4" fill="#111827"/>
    <ellipse cx="69" cy="168" rx="9" ry="4" fill="#111827"/>
    <!-- Body/Suit -->
    <rect x="38" y="82" width="44" height="52" rx="6" fill="url(#cit1)"/>
    <!-- Tie -->
    <polygon points="60,88 63,88 61,118 59,118" fill="#ff4500"/>
    <!-- Collar -->
    <polygon points="52,82 60,92 68,82" fill="#e8eef8" opacity="0.9"/>
    <!-- Arms -->
    <rect x="18" y="84" width="20" height="10" rx="4" fill="url(#cit1)"/>
    <rect x="82" y="84" width="20" height="10" rx="4" fill="url(#cit1)"/>
    <!-- Hands -->
    <ellipse cx="16" cy="90" rx="7" ry="6" fill="url(#cit2)"/>
    <ellipse cx="104" cy="90" rx="7" ry="6" fill="url(#cit2)"/>
    <!-- Neck -->
    <rect x="54" y="68" width="12" height="16" rx="4" fill="url(#cit2)"/>
    <!-- Head -->
    <ellipse cx="60" cy="56" rx="22" ry="24" fill="url(#cit2)"/>
    <!-- Hair -->
    <path d="M38 50 Q40 30 60 28 Q80 30 82 50 Q76 38 60 36 Q44 38 38 50Z" fill="#3b2006"/>
    <!-- Eyes -->
    <ellipse cx="52" cy="54" rx="4" ry="4" fill="#fff"/>
    <ellipse cx="68" cy="54" rx="4" ry="4" fill="#fff"/>
    <circle cx="53" cy="55" r="2.5" fill="#1a1a2e"/>
    <circle cx="69" cy="55" r="2.5" fill="#1a1a2e"/>
    <!-- Laptop in hands -->
    <rect x="22" y="100" width="76" height="48" rx="4" fill="url(#cit3)" stroke="#2a4070" stroke-width="1.5"/>
    <rect x="26" y="104" width="68" height="36" rx="2" fill="#0d1829"/>
    <!-- Screen glow -->
    <rect x="28" y="106" width="64" height="32" rx="2" fill="none" stroke="#00d4ff" stroke-width="0.5" opacity="0.6"/>
    <rect x="30" y="108" width="20" height="3" rx="1" fill="#ff4500" opacity="0.7"/>
    <rect x="30" y="114" width="40" height="2" rx="1" fill="#00d4ff" opacity="0.5"/>
    <rect x="30" y="119" width="32" height="2" rx="1" fill="#00d4ff" opacity="0.4"/>
    <rect x="30" y="124" width="50" height="2" rx="1" fill="#4a5878" opacity="0.5"/>
    <rect x="30" y="129" width="36" height="2" rx="1" fill="#4a5878" opacity="0.4"/>
    <!-- Headset -->
    <path d="M38 44 Q37 28 60 26 Q83 28 82 44" fill="none" stroke="#374151" stroke-width="3" stroke-linecap="round"/>
    <rect x="34" y="42" width="7" height="10" rx="3" fill="#374151"/>
    <rect x="79" y="42" width="7" height="10" rx="3" fill="#374151"/>
    <line x1="34" y1="52" x2="32" y2="60" stroke="#374151" stroke-width="2"/>
    <circle cx="31" cy="62" r="3" fill="#00d4ff" opacity="0.8"/>
  </svg>`;

  // OT Worker: industrial/factory operator in hard hat
  const CHAR_OT = `<svg viewBox="0 0 120 180" width="120" height="180" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cot1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#b45309"/></linearGradient>
      <linearGradient id="cot2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient>
      <linearGradient id="cot3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#374151"/><stop offset="100%" stop-color="#1f2937"/></linearGradient>
    </defs>
    <!-- Shadow -->
    <ellipse cx="60" cy="175" rx="30" ry="5" fill="rgba(0,0,0,0.3)"/>
    <!-- Boots -->
    <rect x="44" y="148" width="14" height="22" rx="3" fill="#1f2937"/>
    <rect x="62" y="148" width="14" height="22" rx="3" fill="#1f2937"/>
    <rect x="41" y="164" width="20" height="8" rx="2" fill="#111827"/>
    <rect x="59" y="164" width="20" height="8" rx="2" fill="#111827"/>
    <!-- Pants -->
    <rect x="43" y="118" width="14" height="34" rx="3" fill="#374151"/>
    <rect x="63" y="118" width="14" height="34" rx="3" fill="#374151"/>
    <!-- Vest/Safety jacket -->
    <rect x="34" y="78" width="52" height="44" rx="6" fill="url(#cot3)"/>
    <!-- Safety stripes -->
    <rect x="34" y="98" width="52" height="6" fill="#f59e0b" opacity="0.85"/>
    <!-- Hi-vis badge -->
    <rect x="52" y="82" width="16" height="10" rx="2" fill="#ff4500" opacity="0.8"/>
    <!-- Arms -->
    <rect x="14" y="80" width="20" height="10" rx="4" fill="url(#cot3)"/>
    <rect x="86" y="80" width="20" height="10" rx="4" fill="url(#cot3)"/>
    <!-- Hands -->
    <ellipse cx="12" cy="87" rx="7" ry="6" fill="url(#cot2)"/>
    <ellipse cx="108" cy="87" rx="7" ry="6" fill="url(#cot2)"/>
    <!-- Tablet/clipboard in hands -->
    <rect x="14" y="94" width="36" height="28" rx="3" fill="#0d1829" stroke="#2a4070" stroke-width="1.5"/>
    <rect x="17" y="97" width="30" height="20" rx="1" fill="#111f38"/>
    <rect x="19" y="99" width="14" height="2" rx="1" fill="#10b981" opacity="0.8"/>
    <rect x="19" y="103" width="22" height="1.5" rx="1" fill="#4a5878" opacity="0.6"/>
    <rect x="19" y="107" width="18" height="1.5" rx="1" fill="#4a5878" opacity="0.5"/>
    <circle cx="36" cy="107" r="4" fill="#ff4500" opacity="0.7"/>
    <!-- Neck -->
    <rect x="54" y="64" width="12" height="16" rx="4" fill="url(#cot2)"/>
    <!-- Head -->
    <ellipse cx="60" cy="52" rx="22" ry="24" fill="url(#cot2)"/>
    <!-- Hard hat -->
    <path d="M36 48 Q36 24 60 22 Q84 24 84 48Z" fill="url(#cot1)"/>
    <rect x="30" y="46" width="60" height="6" rx="3" fill="url(#cot1)"/>
    <!-- Hard hat brim accent -->
    <rect x="30" y="50" width="60" height="2" rx="1" fill="rgba(255,255,255,0.2)"/>
    <!-- Face visor hint -->
    <rect x="44" y="36" width="32" height="4" rx="2" fill="rgba(0,212,255,0.3)"/>
    <!-- Eyes -->
    <ellipse cx="52" cy="52" rx="4" ry="4" fill="#fff"/>
    <ellipse cx="68" cy="52" rx="4" ry="4" fill="#fff"/>
    <circle cx="53" cy="53" r="2.5" fill="#1a1a2e"/>
    <circle cx="69" cy="53" r="2.5" fill="#1a1a2e"/>
    <!-- Ear protection -->
    <ellipse cx="38" cy="52" rx="5" ry="7" fill="#374151"/>
    <ellipse cx="82" cy="52" rx="5" ry="7" fill="#374151"/>
  </svg>`;

  // Scenario-specific character variants by mission type
  function getCharForScene(scene) {
    if (!scene) return CHAR_IT;
    return scene.mission === 'OT' ? CHAR_OT : CHAR_IT;
  }

  // Render 3D character zone for env panel
  function renderChar3D(scene) {
    const charSvg = getCharForScene(scene);
    return '<div class="char-3d-scene">' +
      '<div class="char-glow-ring"></div>' +
      charSvg +
      '<div class="char-shadow"></div>' +
    '</div>';
  }

  // Render 3D character for mission card
  function renderMissionChar(mission) {
    const charSvg = mission === 'OT' ? CHAR_OT : CHAR_IT;
    const bgGrad = mission === 'OT'
      ? 'radial-gradient(circle at 50% 80%, rgba(255,140,0,0.12) 0%, transparent 70%)'
      : 'radial-gradient(circle at 50% 80%, rgba(0,212,255,0.10) 0%, transparent 70%)';
    return '<div class="mission-char-zone">' +
      '<div class="mission-char-zone__bg" style="background:' + bgGrad + ';"></div>' +
      '<div class="char-3d">' + charSvg + '</div>' +
    '</div>';
  }

  // ================================================================
  // NARRATION ENGINE — Web Speech API deep male voice
  // ================================================================
  const Narrator = (function() {
    let utterance = null;
    let bar = null;
    let barText = null;
    const synth = window.speechSynthesis;
    const supported = !!synth;

    function ensureBar() {
      if (bar) return;
      bar = document.createElement('div');
      bar.className = 'narration-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.innerHTML = '<span class="narration-bar__icon">🎙️</span>' +
        '<span class="narration-bar__text"></span>' +
        '<button class="narration-bar__stop" title="Stop narration" aria-label="Stop narration">&#9632;</button>';
      document.body.appendChild(bar);
      barText = bar.querySelector('.narration-bar__text');
      bar.querySelector('.narration-bar__stop').addEventListener('click', () => stop());
    }

    function getDeepVoice() {
      if (!supported) return null;
      const voices = synth.getVoices();
      // Prefer a deep US English male voice
      const preferred = [
        'Google UK English Male', 'Microsoft David', 'Alex', 'Daniel',
        'en-US', 'en-GB'
      ];
      for (const name of preferred) {
        const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
        if (v) return v;
      }
      // Fallback: first English voice
      return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
    }

    function speak(text, label) {
      if (!supported || !text) return;
      stop();
      ensureBar();
      utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.88;   // slightly slower — more authoritative
      utterance.pitch = 0.72;  // deep baritone
      utterance.volume = 0.95;
      const v = getDeepVoice();
      if (v) utterance.voice = v;

      utterance.onstart = () => {
        if (barText) barText.textContent = label || text.substring(0, 60) + '…';
        if (bar) bar.classList.add('narration-bar--visible');
      };
      utterance.onend = utterance.onerror = () => {
        if (bar) bar.classList.remove('narration-bar--visible');
        utterance = null;
      };

      // Chrome sometimes needs a small delay
      setTimeout(() => { try { synth.speak(utterance); } catch(e) {} }, 80);
    }

    function stop() {
      if (supported) { try { synth.cancel(); } catch(e) {} }
      if (bar) bar.classList.remove('narration-bar--visible');
      utterance = null;
    }

    return { speak, stop, supported };
  })();

  // ================================================================
  // PARTICLE CANVAS — network node background animation
  // ================================================================
  function initParticles() {
    const canvas = document.createElement('canvas');
    canvas.id = 'particle-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext('2d');
    const PARTICLE_COUNT = 55;
    const particles = [];
    let W, H;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        c: Math.random() > 0.5 ? '#ff4500' : '#00d4ff'
      });
    }

    const CONNECTION_DIST = 140;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Update positions
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      });
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.3;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100,130,200,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      // Draw particles
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c + '88';
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ================================================================
  // ANIMATIONS
  // ================================================================
  function showScorePopup(pts) {
    const p = document.createElement('div');
    p.className = 'score-popup ' + (pts >= 0 ? 'score-popup--positive' : 'score-popup--negative');
    p.innerHTML = '<div class="score-popup__value">' + (pts >= 0 ? '+' : '') + pts + '</div>';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2200);
  }

  function showBadgeNotif(name, icon) {
    const n = document.createElement('div');
    n.className = 'badge-notification';
    n.setAttribute('role', 'alert');
    n.innerHTML = '<div class="badge-notification__icon">' + icon + '</div><div class="badge-notification__text"><div class="badge-notification__label">Badge Unlocked!</div><div class="badge-notification__name">' + name + '</div></div>';
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3200);
  }

  function announceBadges(badgeIds) {
    const all = [...BADGES.IT, ...BADGES.OT];
    (badgeIds || []).forEach((id, i) => {
      const b = all.find(x => x.id === id);
      if (b) setTimeout(() => showBadgeNotif(b.name, b.icon), 800 + i * 500);
    });
  }

  function animateCounter(el, from, to, dur) {
    dur = dur || 600;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function animateRisk(el, from, to) {
    const dur = 500, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      el.style.width = (from + (to - from) * (1 - Math.pow(1 - p, 3))) + '%';
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ================================================================
  // SCENE VISUAL RENDERER (mock-ups of what the player is looking at)
  // ================================================================
  const textBlock = (s) => esc(s).replace(/\n/g, '<br/>');

  function renderVisual(v) {
    if (!v) return '';
    switch (v.type) {
      case 'email': {
        const row = (label, value, style) => value ? '<div class="mock-email__field"><span class="mock-email__field-label">' + label + '</span><span class="mock-email__field-value"' + (style ? ' style="' + style + '"' : '') + '>' + value + '</span></div>' : '';
        return '<div class="mock-email"><div class="mock-email__header">' +
          row('From:', esc(v.from) + (v.flag ? ' <span class="mock-email__flag">' + esc(v.flag) + '</span>' : '') + (v.address ? '<br/><span class="mock-email__address">' + esc(v.address) + '</span>' : '')) +
          row('To:', v.to ? esc(v.to) : '', 'color:var(--accent-amber)') +
          row('Subject:', esc(v.subject), 'font-weight:600') +
          '</div><div class="mock-email__body">' + textBlock(v.body) + '</div></div>';
      }
      case 'sms':
        return '<div class="mock-sms"><div class="mock-sms__from">' + esc(v.from) + '</div><div class="mock-sms__bubble">' + textBlock(v.text) + '</div><div class="mock-sms__time">now</div></div>';
      case 'chat':
        return '<div class="mock-chat"><div class="mock-chat__app">💬 ' + esc(v.app || 'Chat') + '</div><div class="mock-chat__msg"><div class="mock-chat__avatar">' + esc((v.from || '?').charAt(0)) + '</div><div><div class="mock-chat__from">' + esc(v.from) + '</div><div class="mock-chat__bubble">' + textBlock(v.text) + '</div></div></div></div>';
      case 'call':
        return '<div class="mock-call"><div class="mock-call__avatar">👤</div><div class="mock-call__name">' + esc(v.name) + '</div><div class="mock-call__role">' + esc(v.role || '') + '</div><div class="mock-call__status">' + esc(v.status || '') + '</div>' + (v.note ? '<div class="mock-note">⚠  ' + esc(v.note) + '</div>' : '') + '</div>';
      case 'approval':
        return '<div class="mock-approvals">' + [1, 2, 3].map(i => '<div class="mock-mfa" style="animation-delay:' + (i * 0.3) + 's"><div class="mock-mfa__icon">🔐”</div><div class="mock-mfa__title">' + esc(v.text) + '</div><div class="mock-mfa__counter">Request ' + i + ' of ' + (v.count || 3) + '</div></div>').join('') + '</div>';
      case 'popup':
        return '<div class="mock-alert mock-alert--' + (v.tone || 'warn') + '"><div class="mock-alert__icon">' + (v.tone === 'info' ? 'ℹ️' : v.tone === 'danger' ? '🚨' : '⚠️') + '</div><div class="mock-alert__content"><div class="mock-alert__title">' + esc(v.title) + '</div><div class="mock-alert__text">' + textBlock(v.text) + '</div></div></div>';
      case 'ai':
        return '<div class="mock-ai"><div class="mock-ai__header">' + esc(v.title) + '</div><div class="mock-ai__message">' + textBlock(v.text) + '</div>' + (v.hidden ? '<div class="mock-ai__injection">' + textBlock(v.hidden) + '</div>' : '') + (v.warning ? '<div class="mock-note">⚠  ' + esc(v.warning) + '</div>' : '') + '</div>';
      case 'flow':
        return '<div class="convergence-path"><div class="convergence-path__nodes">' + v.nodes.map((n, i) => '<div class="convergence-node convergence-node--' + (n.status || 'active') + '">' + esc(n.label) + '</div>' + (i < v.nodes.length - 1 ? (n.note ? '<div class="convergence-label">' + esc(n.note) + '</div>' : '') + '<div class="convergence-arrow convergence-arrow--animated"></div>' : '')).join('') + '</div></div>';
      case 'screen':
        return '<div class="mock-hmi-warning"><div class="mock-hmi-warning__title">' + esc(v.title) + '</div><div class="mock-readings">' + v.readings.map(r => '<div class="mock-reading mock-reading--' + (r.tone || 'ok') + '"><span>' + esc(r.label) + '</span><strong>' + esc(r.value) + '</strong></div>').join('') + '</div>' + (v.warning ? '<div class="mock-hmi-warning__text">⚠  ' + esc(v.warning) + '</div>' : '') + '</div>';
      default:
        return '';
    }
  }

  // ================================================================
  // SESSION MANAGEMENT (auth token, expiry, sign-out, cross-tab sync)
  // ================================================================
  const TOKEN_KEY = 'cybershift_auth_token';
function getBearerToken() { return authToken || localStorage.getItem(TOKEN_KEY) || ''; }
  const EXPIRY_KEY = 'cybershift_auth_expires';
  const SIGNOUT_REASON_KEY = 'cybershift_signout_reason';
  const HEARTBEAT_MS = 60000;
  const SIGNOUT_MESSAGES = {
    signed_out: ['info', 'You have been signed out successfully.'],
    session_expired: ['warn', 'Your session has expired. Please sign in again — mission progress on this device is saved.'],
    session_replaced: ['warn', 'You were signed out because your account signed in from another browser or device. Only one active session is allowed per user.'],
    domain_not_allowed: ['warn', 'Your email domain is no longer permitted to access this game.']
  };
  let currentUser = null;
  let authToken = localStorage.getItem(TOKEN_KEY) || '';
  let sessionExpiresAt = localStorage.getItem(EXPIRY_KEY) || '';
  let expiryTimer = null;
  let currentScreen = 'landing';
  let authStep = 'email';
  let authEmail = '';
  let devNoticeOtp = '';
  let authErrorMsg = '';
  let authSuccessMsg = '';
  let authInfoMsg = '';
  let authInfoTone = 'info';
  let allowedDomains = [];
  // Cybersecurity mascot image set from the admin dashboard ('' = built-in 3D character)
  let mascotUrl = '';
  let pendingConfirm = null;

  function getBearerToken() {
    return authToken || localStorage.getItem(TOKEN_KEY) || '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }


  async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const sentToken = authToken;
    if (sentToken) {
      headers['Authorization'] = 'Bearer ' + sentToken;
    }
    let result;
    try {
      const res = await fetch(endpoint, { ...options, headers });
      const data = await res.json();
      result = { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 500, data: { message: 'Network or backend connection error. ' + e.message } };
    }
    // Server rejected our token: expired, replaced by a newer login, or domain no longer allowed
    if (result.status === 401 && sentToken && sentToken === authToken) {
      endSession((result.data && result.data.code) || 'session_expired');
    }
    return result;
  }

  function setSession(token, user, expiresAt) {
    authToken = token;
    currentUser = user;
    sessionExpiresAt = expiresAt || '';
    localStorage.setItem(TOKEN_KEY, token);
    if (sessionExpiresAt) localStorage.setItem(EXPIRY_KEY, sessionExpiresAt);
    else localStorage.removeItem(EXPIRY_KEY);
    engine.setPlayerInfo(user.email.split('@')[0], 'Enterprise');
    authInfoMsg = '';
    scheduleSessionExpiry();
  }

  function scheduleSessionExpiry() {
    clearTimeout(expiryTimer);
    const ms = Date.parse(sessionExpiresAt) - Date.now();
    if (isNaN(ms)) return;
    expiryTimer = setTimeout(() => endSession('session_expired'), Math.max(0, Math.min(ms, 2147483000)));
  }

  function sessionTimeLeft() {
    const ms = Date.parse(sessionExpiresAt) - Date.now();
    if (isNaN(ms)) return '';
    if (ms <= 0) return 'expired';
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  // Clears all client-side session state and returns to the sign-in modal.
  // reason: a key of SIGNOUT_MESSAGES (server 401 codes use the same names)
  function endSession(reason) {
    clearTimeout(expiryTimer);
    if (currentUser) authEmail = currentUser.email;
    authToken = '';
    currentUser = null;
    sessionExpiresAt = '';
    engine.state = null;
    pendingResult = null;
    // Reason first, so other tabs reacting to the token removal can show the same message
    localStorage.setItem(SIGNOUT_REASON_KEY, reason);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    authStep = 'email';
    authErrorMsg = '';
    authSuccessMsg = '';
    devNoticeOtp = '';
    [authInfoTone, authInfoMsg] = SIGNOUT_MESSAGES[reason] || SIGNOUT_MESSAGES.session_expired;
    closeOverlays();
    app.innerHTML = '';
    renderTopbar();
    renderAuthModal();
  }

  async function signOut(confirmed) {
    const run = activeRun();
    if (!confirmed && run) {
      showConfirm('Sign out?', 'Your ' + run.mission + ' mission is in progress (' + runProgress(run).done + '/' + runProgress(run).total + ' scenes). It is saved on this device and will resume when you sign back in.', 'Sign out', () => signOut(true));
      return;
    }
    const token = authToken;
    endSession('signed_out');
    // Revoke the token server-side; best effort so sign-out works offline too
    fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
  }

  async function checkUserSession() {
    if (!authToken) return false;
    const res = await apiRequest('/api/user/status');
    if (res.ok && res.data.user) {
      setSession(authToken, res.data.user, res.data.expiresAt);
      return true;
    }
    return false;
  }

  async function submitMissionCompletionApi(missionId, score, grade, decisions) {
    if (!authToken || !currentUser) return;
    const res = await apiRequest('/api/mission/complete', {
      method: 'POST',
      body: JSON.stringify({ missionId: missionId.toLowerCase(), score, grade, decisions })
    });
    if (res.ok && res.data.user) {
      currentUser = res.data.user;
      renderTopbar();
    }
  }

  // Another tab signed in or out: follow it
  window.addEventListener('storage', async (e) => {
    if (e.key !== TOKEN_KEY) return;
    if (!e.newValue) {
      if (currentUser) endSession(localStorage.getItem(SIGNOUT_REASON_KEY) || 'signed_out');
    } else if (e.newValue !== authToken) {
      authToken = e.newValue;
      currentUser = null;
      if (await checkUserSession()) {
        closeOverlays();
        if (currentUser && currentUser.isAdmin) { nav('admin'); } else { nav('missionselect'); }
      }
    }
  });

  // Re-validate when the tab regains focus (catches server-side revocation and stale mission locks)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !currentUser) return;
    if (await checkUserSession()) {
      renderTopbar();
      if (currentScreen === 'missionselect') app.innerHTML = screenMissionSelect();
    }
  });

  // Heartbeat: a login elsewhere revokes this session, so notice it promptly
  setInterval(() => {
    if (currentUser && document.visibilityState === 'visible') checkUserSession();
  }, HEARTBEAT_MS);

  // Public config: allowed email domains for the sign-in hint and client-side pre-check
  fetch('/api/config').then(r => r.json()).then(cfg => {
    allowedDomains = cfg.allowedDomains || [];
    // Login modal may already be open: update its hint in place so typed input is kept
    const hint = document.getElementById('auth-domain-hint');
    const input = document.getElementById('inp-auth-email');
    if (hint && allowedDomains.length) {
      hint.innerHTML = '🏢 Access restricted to <strong>' + esc(allowedDomainsText()) + '</strong> accounts';
      hint.hidden = false;
    }
    if (input && allowedDomains.length) input.placeholder = 'you@' + allowedDomains[0];
    setMascotUrl(cfg.mascotUrl || '');
  }).catch(() => {});

  // Swap the mascot everywhere it is currently on screen
  function setMascotUrl(url) {
    if (url === mascotUrl) return;
    mascotUrl = url;
    const state = engine.state;
    if (document.getElementById('hero-3d-canvas')) cyber3D.renderCharacter('hero-3d-canvas', 'IT');
    if (document.getElementById('scene-3d-canvas')) cyber3D.renderCharacter('scene-3d-canvas', state ? state.mission : 'IT');
  }

  function emailDomainAllowed(email) {
    return !allowedDomains.length || allowedDomains.includes(email.split('@').pop().toLowerCase());
  }

  function allowedDomainsText() {
    return allowedDomains.map(d => '@' + d).join(', ');
  }

  // ================================================================
  // IN-PROGRESS MISSION PERSISTENCE (per user, survives reload & sign-out)
  // ================================================================
  function runKey(mission) {
    return 'cybershift_run_' + (currentUser ? currentUser.email : '') + '_' + mission;
  }

  function missionPlayed(mission) {
    return !!currentUser && (mission === 'IT' ? currentUser.it_played === 1 : currentUser.ot_played === 1);
  }

  function saveRun() {
    if (currentUser && engine.state && !engine.state.completed) {
      localStorage.setItem(runKey(engine.state.mission), JSON.stringify(engine.state));
    }
  }

  function clearRun(mission) {
    localStorage.removeItem(runKey(mission));
  }

  function loadRun(mission) {
    if (!currentUser) return null;
    if (missionPlayed(mission)) { clearRun(mission); return null; }
    if (engine.state && engine.state.mission === mission && !engine.state.completed) return engine.state;
    try {
      const run = JSON.parse(localStorage.getItem(runKey(mission)) || 'null');
      // Runs saved by an older content version cannot be resumed
      return run && run.mission === mission && !run.completed && engine.isValidRun(run) ? run : null;
    } catch (e) {
      return null;
    }
  }

  function activeRun() {
    if (engine.state && !engine.state.completed) return engine.state;
    return loadRun('IT') || loadRun('OT');
  }

  function runProgress(run) {
    const total = run.sceneIds.length;
    const done = run.decisionsMade.length;
    return { total, done, pct: Math.round(done / total * 100) };
  }

  function resumeRun(mission) {
    const run = loadRun(mission);
    if (!run) return false;
    engine.state = run;
    pendingResult = null;
    // Current scene already answered (left before pressing Continue): move past it
    const answered = run.decisionsMade.find(d => d.sceneId === run.sceneId);
    if (answered) {
      const next = engine.nextSceneId(run.sceneId, run);
      if (next) {
        engine.advanceToScene(next);
      } else {
        const cr = engine.completeMission();
        if (cr) { nav('result', cr); return true; }
      }
    }
    nav('scene');
    return true;
  }

  // ================================================================
  // FLOATING TOP BAR (progress + navigation + account menu)
  // ================================================================
  function renderTopbar() {
    let bar = document.getElementById('topbar');
    if (!currentUser) {
      if (bar) bar.remove();
      document.body.classList.remove('has-topbar');
      return;
    }
    if (!bar) {
      bar = document.createElement('header');
      bar.id = 'topbar';
      bar.className = 'topbar';
      bar.setAttribute('role', 'banner');
      document.body.prepend(bar);
      // Content offset follows the bar's real height (it wraps to two rows on narrow screens)
      if (window.ResizeObserver) new ResizeObserver(syncTopbarOffset).observe(bar);
    }
    document.body.classList.add('has-topbar');

    const state = engine.state;
    const inMission = currentScreen === 'scene' && state && !state.completed;
    let center = '';

    if (inMission) {
      const scenes = engine.getRunScenes(state);
      const done = state.decisionsMade.length;
      const ri = engine.getRiskLevel(state.risk);
      const segs = scenes.map((s, i) => {
        const d = state.decisionsMade[i];
        const cls = d ? (d.correct ? 'ok' : d.critical ? 'bad' : 'warn') : (i === done ? 'now' : '');
        return '<span class="topbar__seg ' + (cls ? 'topbar__seg--' + cls : '') + '" title="' + esc(s.title) + '"></span>';
      }).join('');
      center = '<div class="topbar__mission">' +
        '<div class="topbar__mission-head"><span class="topbar__tag">' + MISSIONS[state.mission].icon + ' Mission ' + MISSIONS[state.mission].number + '</span>' +
        '<span class="topbar__step">Situation <strong>' + Math.min(done + 1, scenes.length) + '</strong>/' + scenes.length + '</span></div>' +
        '<div class="topbar__segs" role="progressbar" aria-label="Mission progress" aria-valuemin="0" aria-valuemax="' + scenes.length + '" aria-valuenow="' + done + '">' + segs + '</div>' +
        '</div>' +
        '<div class="topbar__stats">' +
        '<div class="topbar__stat"><span class="topbar__stat-label">Score</span><span class="hud__stat-value hud__stat-value--score topbar__stat-value" id="hud-score">' + state.score + '</span></div>' +
        '<div class="topbar__stat"><span class="topbar__stat-label">Risk</span><span class="hud__stat-value hud__stat-value--risk topbar__stat-value ' + ri.cls + '" id="hud-risk">' + state.risk + '</span>' +
        '<div class="risk-meter topbar__risk"><div class="risk-meter__fill ' + ri.cls + '" id="risk-fill" style="width:' + state.risk + '%"></div></div></div>' +
        '</div>';
    } else {
      const chip = (mission) => {
        const played = missionPlayed(mission);
        const run = played ? null : loadRun(mission);
        const score = mission === 'IT' ? currentUser.it_score : currentUser.ot_score;
        const icon = mission === 'IT' ? '🖥️' : '🏭';
        if (played) {
          return '<span class="topbar__chip topbar__chip--done" title="' + mission + ' mission completed">' + icon + ' ' + mission + ' <b>✓ ' + (score || 0) + '</b></span>';
        }
        if (run) {
          const p = runProgress(run);
          return '<button class="topbar__chip topbar__chip--live" id="tb-resume-' + mission + '" title="Resume ' + mission + ' mission">' + icon + ' ' + mission +
            ' <b>' + p.done + '/' + p.total + '</b><span class="topbar__chip-bar"><span style="width:' + p.pct + '%"></span></span><span class="topbar__chip-cta">Resume ▶</span></button>';
        }
        return '<span class="topbar__chip" title="' + mission + ' mission not started">' + icon + ' ' + mission + ' <b>Ready</b></span>';
      };
      const completed = (currentUser.it_played === 1 ? 1 : 0) + (currentUser.ot_played === 1 ? 1 : 0);
      center = '<div class="topbar__campaign">' +
        '<div class="topbar__ring" style="--pct:' + (completed * 50) + '" title="' + completed + ' of 2 missions completed"><span>' + completed + '/2</span></div>' +
        '<div class="topbar__chips">' + chip('IT') + chip('OT') + '</div>' +
        '</div>';
    }

    const navBtn = (id, icon, label, screens) =>
      '<button class="topbar__nav-btn' + (screens.includes(currentScreen) ? ' topbar__nav-btn--active' : '') + '" id="' + id + '" title="' + label + '"><span aria-hidden="true">' + icon + '</span><span class="topbar__nav-label">' + label + '</span></button>';
    const email = currentUser.email;

    bar.innerHTML =
      '<button class="topbar__brand" id="tb-home-brand" title="Main page" aria-label="CYBER SHIFT — go to main page">' +
      '<span class="topbar__logo">' + ShieldLogo.replace(/id="(sg|si)"/g, 'id="tb-$1"').replace(/url\(#(sg|si)\)/g, 'url(#tb-$1)') + '</span>' +
      '<span class="topbar__brand-text">CYBER SHIFT</span></button>' +
      '<div class="topbar__center">' + center + '</div>' +
      '<nav class="topbar__nav" aria-label="Main navigation">' +
      navBtn('tb-home', '🏠', 'Home', ['landing']) +
      navBtn('tb-missions', '🎯', 'Missions', ['missionselect', 'intro']) +
      navBtn('tb-lb', '🏆', 'Leaderboard', ['leaderboard']) +
      navBtn('tb-narration', narration.enabled ? (narration.speaking ? '🗣️' : '🔊') : '🔇', narration.enabled ? (narration.speaking ? 'Speaking...' : 'Voice ON') : 'Voice OFF', ['landing', 'missionselect', 'scene', 'howtoplay', 'leaderboard', 'admin']) +
      (currentUser && currentUser.isAdmin ? navBtn('tb-admin', '👑', 'Admin', ['admin']) : '') +
      '<div class="topbar__user">' +
      '<button class="topbar__avatar" id="tb-user" aria-haspopup="menu" aria-expanded="false" title="' + esc(email) + '">' + esc(email.charAt(0).toUpperCase()) + '</button>' +
      '<div class="topbar__menu" id="tb-menu" role="menu" hidden>' +
      '<div class="topbar__menu-head"><div class="topbar__menu-avatar">' + esc(email.charAt(0).toUpperCase()) + '</div><div class="topbar__menu-id"><div class="topbar__menu-email">' + esc(email) + '</div>' +
      '<div class="topbar__menu-session"><span class="topbar__dot"></span>Session active · expires in <span id="tb-session-left">' + sessionTimeLeft() + '</span></div></div></div>' +
      (currentUser && currentUser.isAdmin ? '<button class="topbar__menu-item" id="tb-admin-menu" role="menuitem">👑 Admin Dashboard</button>' : '') + '<button class="topbar__menu-item" id="tb-howto" role="menuitem">📖 How to Play</button>' +
      '<button class="topbar__menu-item topbar__menu-item--danger" id="btn-logout" role="menuitem">⏻ Sign out</button>' +
      '</div></div>' +
      '</nav>';
  }

  function syncTopbarOffset() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const top = parseFloat(getComputedStyle(bar).top) || 0;
    document.documentElement.style.setProperty('--topbar-offset', Math.ceil(top + bar.offsetHeight + 16) + 'px');
  }

  function toggleUserMenu(force) {
    const menu = document.getElementById('tb-menu');
    const btn = document.getElementById('tb-user');
    if (!menu || !btn) return;
    const open = force !== undefined ? force : menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      const left = document.getElementById('tb-session-left');
      if (left) left.textContent = sessionTimeLeft();
    }
  }

  // Leaving an unfinished mission via the top bar keeps it saved for later
  function leaveMissionTo(screen) {
    if (currentScreen === 'scene' && engine.state && !engine.state.completed) {
      saveRun();
      showToast('💾 Mission progress saved — resume any time from the top bar.');
    }
    nav(screen);
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'topbar-toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function showConfirm(title, message, confirmLabel, onConfirm) {
    closeConfirm();
    pendingConfirm = onConfirm;
    const ov = document.createElement('div');
    ov.id = 'confirm-overlay';
    ov.className = 'auth-overlay';
    ov.innerHTML = '<div class="auth-modal confirm-modal" role="alertdialog" aria-labelledby="confirm-title"><div class="auth-header"><h2 class="auth-title" id="confirm-title">' + esc(title) + '</h2><p class="auth-desc">' + esc(message) + '</p></div>' +
      '<div class="confirm-modal__actions"><button class="btn btn--ghost" id="btn-confirm-no">Cancel</button><button class="btn btn--danger" id="btn-confirm-yes">' + esc(confirmLabel) + '</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#btn-confirm-no').focus();
  }

  function closeConfirm() {
    const ov = document.getElementById('confirm-overlay');
    if (ov) ov.remove();
    pendingConfirm = null;
  }

  function closeOverlays() {
    closeConfirm();
    ['auth-modal-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    document.querySelectorAll('.evidence-reveal__overlay, .evidence-reveal').forEach(el => el.remove());
  }

  function renderAuthModal() {
    narration.stop();
    let existing = document.getElementById('auth-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'auth-modal-overlay';
    overlay.className = 'auth-overlay';

    let bodyContent = '';
    if (authStep === 'email') {
      bodyContent = '<div class="auth-header"><span class="auth-badge">CYBER SHIFT SECURITY</span><h2 class="auth-title">Participant Login</h2><p class="auth-desc">Enter your corporate email address to receive a 6-digit OTP code via SMTP.</p></div>' +
        (authInfoMsg ? '<div class="auth-status ' + (authInfoTone === 'warn' ? 'auth-status--warn' : 'auth-status--success') + '">' + authInfoMsg + '</div>' : '') +
        (authErrorMsg ? '<div class="auth-status auth-status--error">' + esc(authErrorMsg) + '</div>' : '') +
        '<div class="auth-input-group"><label class="auth-label" for="inp-auth-email">Corporate Email Address</label><input type="email" id="inp-auth-email" class="auth-input" placeholder="' + esc(allowedDomains.length ? 'you@' + allowedDomains[0] : 'employee@company.com') + '" value="' + esc(authEmail) + '" autocomplete="email" autofocus />' +
          '<div class="auth-hint" id="auth-domain-hint"' + (allowedDomains.length ? '' : ' hidden') + '>🏢 Access restricted to <strong>' + esc(allowedDomainsText()) + '</strong> accounts</div></div>' +
        '<button class="btn btn--primary btn--full" id="btn-request-otp">SEND OTP CODE →</button>' +
        '<div style="margin-top:var(--space-md);text-align:center;font-size:11px;color:var(--text-muted)">🔒 Campaign Rule: Each participant is permitted <strong>ONE (1) attempt</strong> for each mission.</div>';
    } else {
      bodyContent = '<div class="auth-header"><span class="auth-badge">OTP VERIFICATION</span><h2 class="auth-title">Enter Security Code</h2><p class="auth-desc">A 6-digit OTP was sent via SMTP to <strong>' + esc(authEmail) + '</strong>.</p></div>' +
        (authErrorMsg ? '<div class="auth-status auth-status--error">' + esc(authErrorMsg) + '</div>' : '') +
        (authSuccessMsg ? '<div class="auth-status auth-status--success">' + esc(authSuccessMsg) + '</div>' : '') +
        (devNoticeOtp ? '<div class="auth-status auth-status--dev">🔐‘ DEV MODE OTP: <strong>' + esc(devNoticeOtp) + '</strong></div>' : '') +
        '<div class="auth-input-group"><label class="auth-label" for="inp-auth-otp" style="text-align:center">6-Digit OTP Code</label><input type="text" id="inp-auth-otp" class="auth-input" placeholder="123456" maxlength="6" style="text-align:center;letter-spacing:6px;font-family:var(--font-mono);font-size:22px;font-weight:700" autofocus /></div>' +
        '<button class="btn btn--primary btn--full" id="btn-verify-otp">VERIFY & ENTER GAME →</button>' +
        '<div style="margin-top:var(--space-md);display:flex;justify-content:space-between;font-size:12px"><button class="btn btn--ghost" id="btn-change-email" style="padding:4px 8px">← Change Email</button><button class="btn btn--ghost" id="btn-resend-otp" style="padding:4px 8px">Resend OTP</button></div>';
    }

    overlay.innerHTML = '<div class="auth-modal">' + bodyContent + '</div>';
    document.body.appendChild(overlay);
  }

  // ================================================================
  // NARRATION ENGINE — DEEP MALE VOICE SYNTHESIS
  // ================================================================
  const narration = {
    enabled: localStorage.getItem('cybershift_narration') !== 'false',
    speaking: false,
    synth: window.speechSynthesis,
    utterance: null,
    maleVoice: null,

    init() {
      if (!this.synth) return;
      const loadVoices = () => {
        try {
          const voices = this.synth.getVoices();
          this.maleVoice = voices.find(v => 
            /natural|online|google uk english male|google us english|microsoft david|david|george|daniel|alex|guy|male/i.test(v.name) && !/female|zira|hazel|samantha|aria|jenny/i.test(v.name)
          ) || voices.find(v => /male/i.test(v.name)) || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0] || null;
        } catch(e) {}
      };
      loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = loadVoices;
      }
    },

    speak(text) {
      if (!this.enabled || !this.synth) return;
      this.stop();
      if (!text) return;

      const cleanText = String(text).replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/g, '');
      const utt = new SpeechSynthesisUtterance(cleanText);
      if (!this.maleVoice) this.init();
      if (this.maleVoice) utt.voice = this.maleVoice;
      utt.pitch = 0.95; // Natural human pitch
      utt.rate = 0.80;  // Relaxed, clear human speed
      utt.volume = 1.0;


      utt.onstart = () => {
        this.speaking = true;
        this.updateUI();
      };
      utt.onend = utt.onerror = () => {
        this.speaking = false;
        this.updateUI();
      };

      this.utterance = utt;
      try {
        this.synth.speak(utt);
      } catch (e) {
        console.warn('[NARRATION ERROR]', e);
      }
    },

    stop() {
      if (this.synth) {
        try { this.synth.cancel(); } catch(e) {}
      }
      this.speaking = false;
      this.updateUI();
    },

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('cybershift_narration', String(this.enabled));
      if (!this.enabled) {
        this.stop();
      } else if (currentScreen === 'scene') {
        const s = engine.getCurrentScene();
        if (s) this.speakScenario(s);
      }
      this.updateUI();
    },

    speakScenario(scene) {
      if (!scene) return;
      let text = 'Situation: ' + scene.title + '. ' + scene.story;
      if (scene.dialogue && scene.dialogue.length) {
        text += '. ' + scene.dialogue.map(d => d.speaker + ' says: ' + d.text).join('. ');
      }
      this.speak(text);
    },

    updateUI() {
      const btn = document.getElementById('tb-narration');
      if (btn) {
        btn.className = 'topbar__nav-btn' + (this.enabled ? ' topbar__nav-btn--active' : '') + (this.speaking ? ' topbar__nav-btn--speaking' : '');
        btn.innerHTML = '<span aria-hidden="true">' + (this.enabled ? (this.speaking ? '🗣️' : '🔊') : '🔇') + '</span>' +
          '<span class="topbar__nav-label">' + (this.enabled ? (this.speaking ? 'Speaking...' : 'Voice ON') : 'Voice OFF') + '</span>' +
          (this.speaking ? '<span class="narration-waves"><span></span><span></span><span></span></span>' : '');
      }
    }
  };
  narration.init();
  // Speech synthesis can outlive the page in some browsers (reload, closing the tab, leaving the site)
  window.addEventListener('pagehide', () => narration.stop());

  // ================================================================
  // 3D CYBER CHARACTER RENDERER (THREE.JS)
  // ================================================================
  const cyber3D = {
    instances: {},

    renderCharacter(containerId, missionType) {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (this.instances[containerId]) {
        try { this.instances[containerId](); } catch(e) {}
        delete this.instances[containerId];
      }

      container.innerHTML = '';
      // Admin-uploaded Cybersecurity mascot replaces the built-in 3D character
      if (mascotUrl) {
        container.innerHTML = '<div class="mascot-figure mascot-figure--' + (missionType === 'OT' ? 'ot' : 'it') + '">' +
          '<div class="mascot-figure__glow"></div>' +
          '<img class="mascot-figure__img" src="' + esc(mascotUrl) + '" alt="CYBER SHIFT Cybersecurity mascot" draggable="false" />' +
          '<div class="mascot-figure__shadow"></div></div>';
        return;
      }

      if (typeof THREE === 'undefined') return;
      const width = container.clientWidth || 380;
      const height = container.clientHeight || 320;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 1.2, 4.2);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // CSS sizes the canvas to its box; the observer keeps the drawing buffer and aspect in step
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      container.appendChild(renderer.domElement);
      const resizeObs = window.ResizeObserver ? new ResizeObserver(() => {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }) : null;
      if (resizeObs) resizeObs.observe(container);

      const primaryHex = missionType === 'OT' ? 0xff4500 : 0x00d4ff;
      const secondaryHex = missionType === 'OT' ? 0xff8c00 : 0x3b82f6;

      const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambLight);

      const dirLight = new THREE.DirectionalLight(primaryHex, 1.4);
      dirLight.position.set(5, 10, 7);
      scene.add(dirLight);

      const backLight = new THREE.PointLight(secondaryHex, 2.5, 10);
      backLight.position.set(-5, 2, -3);
      scene.add(backLight);

      const charGroup = new THREE.Group();
      scene.add(charGroup);

      // Cyber Helmet
      const headGeo = new THREE.SphereGeometry(0.55, 32, 32);
      const headMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.9 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.25;
      charGroup.add(head);

      // Glowing Visor
      const visorGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.22, 32, 1, false, -Math.PI * 0.4, Math.PI * 0.8);
      const visorMat = new THREE.MeshBasicMaterial({ color: primaryHex, side: THREE.DoubleSide });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.3, 0.02);
      charGroup.add(visor);

      // Torso & Chest Armor
      const torsoGeo = new THREE.CylinderGeometry(0.65, 0.45, 1.1, 8);
      const torsoMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });
      const torso = new THREE.Mesh(torsoGeo, torsoMat);
      torso.position.y = 0.3;
      charGroup.add(torso);

      // Spinning Tech Core
      const coreGeo = new THREE.IcosahedronGeometry(0.2, 1);
      const coreMat = new THREE.MeshBasicMaterial({ color: primaryHex, wireframe: true });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(0, 0.45, 0.5);
      charGroup.add(core);

      // Shoulder Armor Pads
      [-0.8, 0.8].forEach(x => {
        const shoulderGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
        const shoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
        shoulder.position.set(x, 0.68, 0);
        shoulder.scale.set(1.2, 0.8, 1);
        charGroup.add(shoulder);
      });

      // Rotating Tech Rings
      const ringGeo = new THREE.TorusGeometry(1.5, 0.02, 16, 100);
      const ringMat = new THREE.MeshBasicMaterial({ color: secondaryHex, transparent: true, opacity: 0.6 });
      const ring1 = new THREE.Mesh(ringGeo, ringMat);
      ring1.rotation.x = Math.PI / 3;
      charGroup.add(ring1);

      const ring2 = new THREE.Mesh(ringGeo, ringMat);
      ring2.rotation.y = Math.PI / 4;
      charGroup.add(ring2);

      // Particle Cloud
      const partCount = 100;
      const partGeo = new THREE.BufferGeometry();
      const partPos = new Float32Array(partCount * 3);
      for (let i = 0; i < partCount * 3; i += 3) {
        partPos[i] = (Math.random() - 0.5) * 8;
        partPos[i + 1] = (Math.random() - 0.5) * 6;
        partPos[i + 2] = (Math.random() - 0.5) * 6;
      }
      partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
      const partMat = new THREE.PointsMaterial({ size: 0.04, color: primaryHex, transparent: true, opacity: 0.7 });
      const particles = new THREE.Points(partGeo, partMat);
      scene.add(particles);

      let animId;
      const clock = new THREE.Clock();
      const animate = () => {
        // Container left the page (screen change): release the GPU context instead of animating offscreen
        if (!container.isConnected) {
          if (this.instances[containerId] === cleanup) delete this.instances[containerId];
          cleanup();
          return;
        }
        animId = requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();
        charGroup.position.y = Math.sin(elapsed * 1.5) * 0.06;
        charGroup.rotation.y = Math.sin(elapsed * 0.5) * 0.25;
        core.rotation.x = elapsed * 1.2;
        core.rotation.y = elapsed * 1.5;
        ring1.rotation.z = elapsed * 0.4;
        ring2.rotation.z = -elapsed * 0.3;
        particles.rotation.y = elapsed * 0.05;
        renderer.render(scene, camera);
      };
      const cleanup = () => {
        cancelAnimationFrame(animId);
        if (resizeObs) resizeObs.disconnect();
        renderer.dispose();
      };
      this.instances[containerId] = cleanup;
      animate();
    }
  };

  // ================================================================
  // SCREEN RENDERERS
  // ================================================================
  const app = document.getElementById('app');
  let pendingResult = null;
  let seqSelections = [];


  function addBg() {
    if (!document.querySelector('.bg-grid')) {
      const g = document.createElement('div'); g.className = 'bg-grid'; document.body.appendChild(g);
      const g1 = document.createElement('div'); g1.className = 'bg-glow bg-glow--cyan'; document.body.appendChild(g1);
      const g2 = document.createElement('div'); g2.className = 'bg-glow bg-glow--purple'; document.body.appendChild(g2);
    }
  }

  
  // ================================================================
  // ENTERPRISE ADMIN DASHBOARD ENGINE & RENDERERS
  // ================================================================
  let adminActiveTab = 'overview';
  let adminUserSearch = '';
  let adminStatusFilter = 'all';
  let adminDataCache = { users: [], stats: {}, config: {}, questions: [], analytics: {}, audit: [] };
  let adminCatConfigState = {};

  async function fetchAdminData() {
    try {
      const token = getBearerToken();
      const headers = { 'Authorization': 'Bearer ' + token };
      
      const [uRes, cRes, qRes, aRes, lRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/config', { headers }),
        fetch('/api/admin/questions', { headers }),
        fetch('/api/admin/analytics', { headers }),
        fetch('/api/admin/audit-logs', { headers })
      ]);
      
      if (uRes.status === 403 || cRes.status === 403) {
        showToast('⚠️ Admin access denied: Administrator email authorization required.');
        nav('landing');
        return false;
      }

      const uData = await uRes.json();
      const cData = await cRes.json();
      const qData = await qRes.json();
      const aData = await aRes.json();
      const lData = await lRes.json();

      if (uData.status === 'success') {
        adminDataCache.users = uData.users || [];
        adminDataCache.stats = uData.stats || {};
      }
      if (cData.status === 'success') {
    adminDataCache.adminEmails = cData.adminEmails || ['admin@company.com'];
        adminDataCache.config = cData.config || {};
        adminDataCache.mascotUrl = cData.mascotUrl || '';
        adminDataCache.summary = cData.availableQuestionsSummary || {};
        adminCatConfigState = JSON.parse(JSON.stringify(cData.config.category_config || {}));
      }
      if (qData.status === 'success') adminDataCache.questions = qData.questions || [];
      if (aData.status === 'success') adminDataCache.analytics = aData || {};
      if (lData.status === 'success') adminDataCache.audit = lData.auditLogs || [];

      return true;
    } catch (e) {
      console.error('[ADMIN FETCH ERROR]', e);
      showToast('❌ Failed to connect to Admin backend APIs.');
      return false;
    }
  }

  async function renderAdminDashboardHtml() {
    await fetchAdminData();

    const email = currentUser ? currentUser.email : 'admin@company.com';
    const stats = adminDataCache.stats || {};
    const cfg = adminDataCache.config || {};

    const tabBtn = (id, icon, label) =>
      '<button class="admin-tab ' + (adminActiveTab === id ? 'admin-tab--active' : '') + '" data-admintab="' + id + '">' +
      '<span>' + icon + '</span><span>' + label + '</span></button>';

    return '<div class="admin-dashboard scene-enter">' +
      '<div class="admin-header">' +
        '<div>' +
          '<div class="admin-header__title"><span>👑</span> Enterprise Admin Dashboard</div>' +
          '<div class="admin-header__subtitle">CYBER SHIFT — User Tracking, Question Configuration & Campaign Controls</div>' +
        '</div>' +
        '<div class="admin-header__actions">' +
          '<span class="admin-badge admin-badge--admin">Logged in as ' + esc(email) + '</span>' +
          '<button class="btn btn--secondary" id="btn-admin-refresh">🔄 Refresh</button>' +
          '<button class="btn btn--ghost" id="btn-admin-to-player">🎮 Switch to Player View</button>' +
        '</div>' +
      '</div>' +

      '<div class="admin-tabs">' +
        tabBtn('overview', '📊', 'Overview') +
        tabBtn('users', '👥', 'Users') +
        tabBtn('attempts', '🔢', 'Attempt Limits') +
        tabBtn('questions', '📚', 'Question Pool') +
        tabBtn('config', '⚙️', 'Question Config') +
        tabBtn('analytics', '📈', 'Analytics & Reports') +
        tabBtn('audit', '📜', 'Audit Logs') +
        tabBtn('settings', '🔧', 'Settings') +
      '</div>' +

      // Tab 1: Overview
      '<div class="admin-section ' + (adminActiveTab === 'overview' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-kpi-grid">' +
          '<div class="admin-kpi-card"><div class="admin-kpi-card__label">Total Registered Users</div><div class="admin-kpi-card__value">' + (stats.totalUsers || 0) + '</div><div class="admin-kpi-card__sub">Signed up via OTP</div></div>' +
          '<div class="admin-kpi-card"><div class="admin-kpi-card__label">Users Started</div><div class="admin-kpi-card__value" style="color:var(--accent-blue)">' + (stats.usersStarted || 0) + '</div><div class="admin-kpi-card__sub">Attempted at least 1 mission</div></div>' +
          '<div class="admin-kpi-card"><div class="admin-kpi-card__label">Fully Completed</div><div class="admin-kpi-card__value" style="color:var(--accent-green)">' + (stats.usersCompleted || 0) + '</div><div class="admin-kpi-card__sub">Finished IT & OT missions</div></div>' +
          '<div class="admin-kpi-card"><div class="admin-kpi-card__label">Avg Score (IT / OT)</div><div class="admin-kpi-card__value" style="color:var(--accent-amber)">' + (stats.avgItScore || 0) + ' / ' + (stats.avgOtScore || 0) + '</div><div class="admin-kpi-card__sub">Normalized score out of 1000</div></div>' +
        '</div>' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>System Status & Campaign Configuration</span><span class="status-pill status-pill--completed">ACTIVE</span></div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-md)">' +
            '<div style="background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md)">' +
              '<div style="color:var(--text-muted);font-size:12px">CONFIGURED ADMIN EMAILS</div>' +
              '<div style="font-family:var(--font-mono);font-weight:700;margin-top:4px;color:var(--accent-cyan)">' + esc((adminDataCache.adminEmails || ['admin@company.com']).join('; ')) + '</div>' +
            '</div>' +
            '<div style="background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md)">' +
              '<div style="color:var(--text-muted);font-size:12px">CURRENT MAX ATTEMPTS ALLOWANCE</div>' +
              '<div style="font-family:var(--font-mono);font-weight:700;margin-top:4px;color:var(--accent-amber)">' + (cfg.max_attempts_per_user || 3) + ' Attempt(s) per User</div>' +
            '</div>' +
            '<div style="background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md)">' +
              '<div style="color:var(--text-muted);font-size:12px">QUESTIONS PER GAME</div>' +
              '<div style="font-family:var(--font-mono);font-weight:700;margin-top:4px;color:var(--accent-blue)">IT: ' + (cfg.it_questions_per_game || 10) + ' Qs | OT: ' + (cfg.ot_questions_per_game || 10) + ' Qs</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Tab 2: Users
      '<div class="admin-section ' + (adminActiveTab === 'users' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>User Tracking & Gameplay Progress</span><span class="admin-badge admin-badge--role">' + adminDataCache.users.length + ' Registered Users</span></div>' +
          '<div class="admin-table-controls">' +
            '<input type="text" class="admin-search-input" id="admin-user-search" placeholder="🔍 Search email address..." value="' + esc(adminUserSearch) + '" />' +
            '<div style="display:flex;gap:var(--space-sm)">' +
              '<select class="admin-select" id="admin-user-filter">' +
                '<option value="all"' + (adminStatusFilter === 'all' ? ' selected' : '') + '>All Statuses</option>' +
                '<option value="Completed"' + (adminStatusFilter === 'Completed' ? ' selected' : '') + '>Completed Only</option>' +
                '<option value="In Progress"' + (adminStatusFilter === 'In Progress' ? ' selected' : '') + '>In Progress</option>' +
                '<option value="Not Started"' + (adminStatusFilter === 'Not Started' ? ' selected' : '') + '>Not Started</option>' +
              '</select>' +
              '<button class="btn btn--secondary" id="btn-export-csv-users">📥 Export CSV Report</button>' +
            '</div>' +
          '</div>' +
          '<div class="admin-table-wrapper">' +
            renderAdminUserTableHtml() +
          '</div>' +
        '</div>' +
      '</div>' +

      // Tab 3: Attempt Limits
      '<div class="admin-section ' + (adminActiveTab === 'attempts' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>Dynamic Attempt Configuration</span></div>' +
          '<p style="color:var(--text-secondary);font-size:14px;margin-bottom:var(--space-md)">Set the maximum allowed game attempts per employee across the campaign. You can also grant additional attempts or reset attempt counters for specific users below.</p>' +
          '<div style="display:flex;gap:var(--space-md);align-items:center;background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md);max-width:500px;margin-bottom:var(--space-lg)">' +
            '<label style="font-weight:600;font-size:14px">Global Max Attempts Per User:</label>' +
            '<input type="number" id="inp-global-max-attempts" class="config-input-number" min="1" max="10" value="' + (cfg.max_attempts_per_user || 3) + '" style="width:70px;font-size:16px" />' +
            '<button class="btn btn--primary" id="btn-save-global-attempts">Save Attempt Limit</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Tab 4: Question Pool
      '<div class="admin-section ' + (adminActiveTab === 'questions' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>Question Pool & Categorization</span><span class="admin-badge admin-badge--role">' + adminDataCache.questions.length + ' Total Questions</span></div>' +
          '<div class="admin-table-wrapper">' +
            renderAdminQuestionsTableHtml() +
          '</div>' +
        '</div>' +
      '</div>' +

      // Tab 5: Question Config
      '<div class="admin-section ' + (adminActiveTab === 'config' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>Dynamic Question Configuration</span></div>' +
          '<p style="color:var(--text-secondary);font-size:14px;margin-bottom:var(--space-lg)">Configure how many questions appear per game, and allocate the exact number of questions selected from each category independently for IT and OT missions.</p>' +
          renderAdminQuestionConfigHtml() +
        '</div>' +
      '</div>' +

      // Tab 6: Analytics & Reports
      '<div class="admin-section ' + (adminActiveTab === 'analytics' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>Campaign Analytics & Frequently Missed Questions</span><button class="btn btn--primary" id="btn-export-csv-analytics">📥 Export Full CSV Report</button></div>' +
          renderAdminAnalyticsHtml() +
        '</div>' +
      '</div>' +

      // Tab 7: Audit Logs
      '<div class="admin-section ' + (adminActiveTab === 'audit' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>Administrative Audit Logs</span></div>' +
          '<div class="admin-table-wrapper">' +
            renderAdminAuditLogsHtml() +
          '</div>' +
        '</div>' +
      '</div>' +

      // Tab 8: Settings
      '<div class="admin-section ' + (adminActiveTab === 'settings' ? 'admin-section--active' : '') + '">' +
        '<div class="admin-card">' +
          '<div class="admin-card__title"><span>System Configuration & Security Settings</span></div>' +
          '<div style="line-height:2">' +
            '<div><strong>Primary Administrator Emails:</strong> <code style="color:var(--accent-cyan)">' + esc((adminDataCache.adminEmails || ['admin@company.com']).join('; ')) + '</code></div>' +
            '<div><strong>Email Domain Whitelist:</strong> <code style="color:var(--accent-blue)">' + esc(allowedDomains.length ? allowedDomains.join(', ') : 'All Domains Allowed') + '</code></div>' +
            '<div><strong>SMTP Host:</strong> <code style="color:var(--text-muted)">' + esc(cfg.smtpHost || '10.0.0.1') + '</code></div>' +
            '<div><strong>Session Lifetime:</strong> <code>24 Hours</code></div>' +
          '</div>' +
        '</div>' +
        renderAdminMascotHtml() +
      '</div>' +

    '</div>';
  }

  function renderAdminMascotHtml() {
    const url = adminDataCache.mascotUrl || '';
    return '<div class="admin-card">' +
      '<div class="admin-card__title"><span>🦸 Cybersecurity Mascot</span>' +
        '<span class="status-pill ' + (url ? 'status-pill--completed' : '') + '">' + (url ? 'CUSTOM IMAGE' : 'DEFAULT 3D CHARACTER') + '</span></div>' +
      '<div class="mascot-admin">' +
        '<div class="mascot-admin__preview" id="mascot-admin-preview">' +
          (url ? '<img src="' + esc(url) + '" alt="Current Cybersecurity mascot" />' : '<span>No image uploaded.<br/>The built-in 3D character is shown.</span>') +
        '</div>' +
        '<div class="mascot-admin__body">' +
          '<p>Shown on the landing page hero and beside every mission scene. Use a PNG or WEBP with a transparent background for the best look (max 5 MB; PNG, JPG, GIF or WEBP).</p>' +
          '<input type="file" id="inp-mascot-file" accept="image/png,image/jpeg,image/gif,image/webp" />' +
          '<div class="mascot-admin__actions">' +
            '<button class="btn btn--primary" id="btn-mascot-upload" disabled>⬆ Upload mascot</button>' +
            (url ? '<button class="btn btn--ghost" id="btn-mascot-reset">↺ Revert to default</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderAdminUserTableHtml() {
    let users = adminDataCache.users || [];
    if (adminUserSearch) {
      const q = adminUserSearch.toLowerCase();
      users = users.filter(u => u.email.toLowerCase().includes(q));
    }
    if (adminStatusFilter !== 'all') {
      users = users.filter(u => u.status === adminStatusFilter);
    }

    if (!users.length) {
      return '<div style="padding:var(--space-lg);text-align:center;color:var(--text-muted)">No registered users found matching the selected filter criteria.</div>';
    }

    const rows = users.map(u => {
      const sCls = u.status === 'Completed' ? 'status-pill--completed' : (u.status === 'In Progress' ? 'status-pill--inprogress' : 'status-pill--notstarted');
      return '<tr>' +
        '<td><strong>' + esc(u.email) + '</strong></td>' +
        '<td><span class="status-pill ' + sCls + '">' + esc(u.status) + '</span></td>' +
        '<td>' + esc(u.stage) + '</td>' +
        '<td>' + u.attemptsUsed + ' / ' + u.maxAttempts + ' (' + u.attemptsRemaining + ' left)</td>' +
        '<td><strong style="color:var(--accent-cyan)">' + (u.itScore || 0) + '</strong> (' + (u.itGrade || 'N/A') + ')</td>' +
        '<td><strong style="color:var(--accent-blue)">' + (u.otScore || 0) + '</strong> (' + (u.otGrade || 'N/A') + ')</td>' +
        '<td><strong style="color:var(--accent-amber)">' + u.totalScore + '</strong></td>' +
        '<td>' + u.questionsCorrect + ' / ' + u.questionsAttempted + '</td>' +
        '<td>' + (u.lastActiveAt ? u.lastActiveAt.replace('T', ' ').replace('Z', '') : 'N/A') + '</td>' +
        '<td><button class="btn btn--ghost btn-user-detail" data-email="' + esc(u.email) + '" style="padding:4px 8px;font-size:12px">🔍 View Detail / Reset</button></td>' +
      '</tr>';
    }).join('');

    return '<table class="admin-table">' +
      '<thead><tr>' +
        '<th>Email Address</th><th>Status</th><th>Current Stage</th><th>Attempts Used</th><th>IT Score</th><th>OT Score</th><th>Total Score</th><th>Correct / Attempted</th><th>Last Active</th><th>Action</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }

  function renderAdminQuestionsTableHtml() {
    const questions = adminDataCache.questions || [];
    if (!questions.length) return '<div style="padding:var(--space-md);color:var(--text-muted)">Loading questions pool...</div>';

    const rows = questions.map(q => {
      const mBadge = q.mission === 'IT' ? '<span class="status-pill status-pill--inprogress">IT</span>' : '<span class="status-pill status-pill--completed">OT</span>';
      return '<tr>' +
        '<td><code>' + esc(q.id) + '</code></td>' +
        '<td>' + mBadge + '</td>' +
        '<td><strong style="color:var(--accent-cyan)">' + esc(q.category) + '</strong></td>' +
        '<td>' + esc(q.title) + '</td>' +
        '<td>' + esc(q.subtitle || '') + '</td>' +
        '<td><button class="btn btn--ghost btn-toggle-q" data-qid="' + esc(q.id) + '" data-active="' + q.is_active + '" style="padding:2px 6px;font-size:11px">' + (q.is_active ? '✅ Active' : '❌ Disabled') + '</button></td>' +
      '</tr>';
    }).join('');

    return '<table class="admin-table">' +
      '<thead><tr><th>ID</th><th>Mission</th><th>Category</th><th>Title</th><th>Subtitle</th><th>Status</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }


  function renderAdminQuestionConfigHtml() {
    const summary = adminDataCache.summary || { IT: {}, OT: {} };
    const cfg = adminDataCache.config || {};
    const itTarget = parseInt(cfg.it_questions_per_game || 10);
    const otTarget = parseInt(cfg.ot_questions_per_game || 10);

    const renderMissionConfig = (mission, targetCount) => {
      const avail = summary[mission] || {};
      const catState = adminCatConfigState[mission] || {};
      
      let catSum = 0;
      let invalidMsg = '';

      const rows = Object.keys(TOPICS).map(catKey => {
        const isItTopic = ['messages', 'accounts', 'ai', 'impersonation', 'reporting', 'devices', 'office'].includes(catKey);
        const isOtTopic = ['vendor', 'usb', 'boundary', 'safety', 'incident', 'site', 'gadgets'].includes(catKey);
        if (mission === 'IT' && !isItTopic) return '';
        if (mission === 'OT' && !isOtTopic) return '';

        const catName = TOPICS[catKey].label;
        const availableCount = avail[catKey] || 0;
        const currentConfigured = parseInt(catState[catKey] || 0);
        catSum += currentConfigured;

        if (currentConfigured > availableCount) {
          invalidMsg = "Category '" + catName + "' configured with " + currentConfigured + " Qs, but only " + availableCount + " available!";
        }

        return '<div class="config-row">' +
          '<div><strong>' + esc(catName) + '</strong><div style="font-size:11px;color:var(--text-muted)">Available: ' + availableCount + ' Qs</div></div>' +
          '<div class="config-counter">' +
            '<button type="button" class="config-btn-counter btn-cat-dec" data-mission="' + mission + '" data-cat="' + catKey + '">-</button>' +
            '<input type="number" class="config-input-number inp-cat-val" data-mission="' + mission + '" data-cat="' + catKey + '" min="0" max="' + availableCount + '" value="' + currentConfigured + '" />' +
            '<button type="button" class="config-btn-counter btn-cat-inc" data-mission="' + mission + '" data-cat="' + catKey + '">+</button>' +
          '</div>' +
        '</div>';
      }).join('');

      const isValid = !invalidMsg && catSum === targetCount;
      const valBoxClass = isValid ? 'admin-validation-box--valid' : 'admin-validation-box--invalid';

      return '<div class="config-box" data-mission="' + mission + '">' +
        '<div class="config-box__header">' +
          '<h3 style="color:var(--text-primary)">' + (mission === 'IT' ? '🖥️ Mission 1: IT Security' : '🏭 Mission 2: OT Security') + '</h3>' +
          '<div>Target Qs per Game: <input type="number" class="config-input-number inp-game-target" data-mission="' + mission + '" min="1" max="25" value="' + targetCount + '" /></div>' +
        '</div>' +
        rows +
        '<div class="admin-validation-box ' + valBoxClass + '">' +
          '<div>' + (isValid ? '✅ Valid configuration: Sum of categories (' + catSum + ') matches game target (' + targetCount + ').' : ('❌ ' + (invalidMsg || ('Category sum (' + catSum + ') must equal game target (' + targetCount + ').')))) + '</div>' +
        '</div>' +
      '</div>';
    };

    const itConfigHtml = renderMissionConfig('IT', itTarget);
    const otConfigHtml = renderMissionConfig('OT', otTarget);

    return '<div class="config-grid">' + itConfigHtml + otConfigHtml + '</div>' +
      '<div style="margin-top:var(--space-lg);text-align:right">' +
        '<button type="button" class="btn btn--primary btn--lg" id="btn-save-q-config">💾 Save Question Configuration</button>' +
      '</div>';
  }

  function updateAdminConfigValidationUI() {
    ['IT', 'OT'].forEach(mission => {
      const summary = adminDataCache.summary || { IT: {}, OT: {} };
      const cfg = adminDataCache.config || {};
      const targetCount = parseInt(mission === 'IT' ? (cfg.it_questions_per_game || 10) : (cfg.ot_questions_per_game || 10));
      const avail = summary[mission] || {};
      const catState = adminCatConfigState[mission] || {};

      let catSum = 0;
      let invalidMsg = '';

      Object.keys(TOPICS).forEach(catKey => {
        const isItTopic = ['messages', 'accounts', 'ai', 'impersonation', 'reporting', 'devices', 'office'].includes(catKey);
        const isOtTopic = ['vendor', 'usb', 'boundary', 'safety', 'incident', 'site', 'gadgets'].includes(catKey);
        if ((mission === 'IT' && !isItTopic) || (mission === 'OT' && !isOtTopic)) return;

        const count = parseInt(catState[catKey] || 0);
        const availCount = avail[catKey] || 0;
        catSum += count;

        if (count > availCount) {
          const catName = TOPICS[catKey] ? TOPICS[catKey].label : catKey;
          invalidMsg = "Category '" + catName + "' configured with " + count + " Qs, but only " + availCount + " available!";
        }
      });

      const isValid = !invalidMsg && catSum === targetCount;
      const box = document.querySelector('.config-box[data-mission="' + mission + '"] .admin-validation-box');
      if (box) {
        box.className = 'admin-validation-box ' + (isValid ? 'admin-validation-box--valid' : 'admin-validation-box--invalid');
        box.innerHTML = '<div>' + (isValid ? '✅ Valid configuration: Sum of categories (' + catSum + ') matches game target (' + targetCount + ').' : ('❌ ' + (invalidMsg || ('Category sum (' + catSum + ') must equal game target (' + targetCount + ').')))) + '</div>';
      }
    });
  }

  function renderAdminAnalyticsHtml() {
    const analytics = adminDataCache.analytics || {};
    const missed = analytics.mostMissedQuestions || [];

    const missedRows = missed.map(m => {
      return '<tr>' +
        '<td><code>' + esc(m.questionId) + '</code></td>' +
        '<td>' + m.attempts + '</td>' +
        '<td><strong style="color:var(--accent-red)">' + m.incorrect + '</strong></td>' +
        '<td><strong style="color:var(--accent-amber)">' + m.errorRatePct + '%</strong></td>' +
      '</tr>';
    }).join('');

    return '<div>' +
      '<h4 style="margin-bottom:var(--space-md)">Most Frequently Missed Questions</h4>' +
      '<div class="admin-table-wrapper">' +
        '<table class="admin-table">' +
          '<thead><tr><th>Question ID</th><th>Total Attempts</th><th>Incorrect Answers</th><th>Error Rate %</th></tr></thead>' +
          '<tbody>' + (missedRows || '<tr><td colspan="4" style="text-align:center">No missed question data recorded yet.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function renderAdminAuditLogsHtml() {
    const logs = adminDataCache.audit || [];
    if (!logs.length) return '<div style="padding:var(--space-md);color:var(--text-muted)">No administrative audit actions logged yet.</div>';

    const rows = logs.map(l => {
      return '<tr>' +
        '<td>' + (l.created_at ? l.created_at.replace('T', ' ').replace('Z', '') : '') + '</td>' +
        '<td><span class="admin-badge admin-badge--admin">' + esc(l.admin_email) + '</span></td>' +
        '<td><strong style="color:var(--accent-cyan)">' + esc(l.action) + '</strong></td>' +
        '<td>' + esc(l.details) + '</td>' +
      '</tr>';
    }).join('');

    return '<table class="admin-table">' +
      '<thead><tr><th>Timestamp</th><th>Admin Email</th><th>Action</th><th>Details</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
  }


  function initAdminDashboardEvents() {
    // The tab strip scrolls sideways on small screens; keep the selected tab visible after re-render
    const activeTab = document.querySelector('.admin-tab--active');
    const tabStrip = activeTab && activeTab.parentElement;
    if (tabStrip && tabStrip.scrollWidth > tabStrip.clientWidth) {
      const a = activeTab.getBoundingClientRect(), t = tabStrip.getBoundingClientRect();
      tabStrip.scrollLeft += (a.left + a.width / 2) - (t.left + t.width / 2);
    }

    document.querySelectorAll('[data-admintab]').forEach(btn => {
      btn.onclick = (e) => {
        adminActiveTab = e.currentTarget.dataset.admintab;
        nav('admin');
      };
    });

    const btnRef = document.getElementById('btn-admin-refresh');
    if (btnRef) btnRef.onclick = () => nav('admin');

    const btnPlay = document.getElementById('btn-admin-to-player');
    if (btnPlay) btnPlay.onclick = () => nav('landing');

    const inpSearch = document.getElementById('admin-user-search');
    if (inpSearch) {
      inpSearch.oninput = (e) => {
        adminUserSearch = e.target.value;
        const w = document.querySelector('.admin-table-wrapper');
        if (w) w.innerHTML = renderAdminUserTableHtml();
        attachUserDetailEvents();
      };
    }

    const selFilter = document.getElementById('admin-user-filter');
    if (selFilter) {
      selFilter.onchange = (e) => {
        adminStatusFilter = e.target.value;
        const w = document.querySelector('.admin-table-wrapper');
        if (w) w.innerHTML = renderAdminUserTableHtml();
        attachUserDetailEvents();
      };
    }

    const btnExp1 = document.getElementById('btn-export-csv-users');
    const btnExp2 = document.getElementById('btn-export-csv-analytics');
    [btnExp1, btnExp2].forEach(btn => {
      if (btn) {
        btn.onclick = async (e) => {
          if (e) e.preventDefault();
          try {
            showToast('📥 Exporting campaign CSV report...');
            const token = getBearerToken();
            const res = await fetch('/api/admin/analytics/export', {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            if (res.status === 401 || res.status === 403) {
              showToast('⚠️ Session expired or administrator access required.');
              return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Cyber_Shift_Campaign_Report_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('✅ Campaign CSV report downloaded successfully!');
          } catch(err) {
            console.error('[CSV EXPORT ERROR]', err);
            showToast('❌ Failed to download CSV report.');
          }
        };
      }
    });


    const btnSaveAtt = document.getElementById('btn-save-global-attempts');
    if (btnSaveAtt) {
      btnSaveAtt.onclick = async (e) => {
        e.preventDefault();
        const val = parseInt(document.getElementById('inp-global-max-attempts').value);
        if (isNaN(val) || val < 1) {
          showToast('⚠️ Max attempts must be at least 1.');
          return;
        }
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getBearerToken() },
          body: JSON.stringify({ max_attempts_per_user: val })
        });
        const data = await res.json();
        if (data.status === 'success') {
          showToast('✅ Max attempt limit updated to ' + val + ' per user.');
          nav('admin');
        } else {
          showToast('❌ ' + data.message);
        }
      };
    }

    document.querySelectorAll('.btn-cat-dec, .btn-cat-inc').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const m = e.currentTarget.dataset.mission;
        const cat = e.currentTarget.dataset.cat;
        const isInc = e.currentTarget.classList.contains('btn-cat-inc');
        
        if (!adminCatConfigState[m]) adminCatConfigState[m] = {};
        let curr = parseInt(adminCatConfigState[m][cat] || 0);
        curr = isInc ? curr + 1 : Math.max(0, curr - 1);
        adminCatConfigState[m][cat] = curr;
        
        const inp = document.querySelector('.inp-cat-val[data-mission="' + m + '"][data-cat="' + cat + '"]');
        if (inp) inp.value = curr;
        updateAdminConfigValidationUI();
      };
    });

    document.querySelectorAll('.inp-cat-val').forEach(inp => {
      inp.oninput = inp.onchange = (e) => {
        const m = e.currentTarget.dataset.mission;
        const cat = e.currentTarget.dataset.cat;
        const val = Math.max(0, parseInt(e.currentTarget.value) || 0);
        if (!adminCatConfigState[m]) adminCatConfigState[m] = {};
        adminCatConfigState[m][cat] = val;
        updateAdminConfigValidationUI();
      };
    });

    document.querySelectorAll('.inp-game-target').forEach(inp => {
      inp.oninput = inp.onchange = (e) => {
        const m = e.currentTarget.dataset.mission;
        const val = Math.max(1, parseInt(e.currentTarget.value) || 1);
        if (!adminDataCache.config) adminDataCache.config = {};
        if (m === 'IT') {
          adminDataCache.config.it_questions_per_game = val;
        } else {
          adminDataCache.config.ot_questions_per_game = val;
        }
        updateAdminConfigValidationUI();
      };
    });

    const btnSaveQ = document.getElementById('btn-save-q-config');
    if (btnSaveQ) {
      btnSaveQ.onclick = async (e) => {
        e.preventDefault();
        const itT = parseInt(adminDataCache.config.it_questions_per_game || 10);
        const otT = parseInt(adminDataCache.config.ot_questions_per_game || 10);

        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getBearerToken() },
          body: JSON.stringify({
            it_questions_per_game: itT,
            ot_questions_per_game: otT,
            category_config: adminCatConfigState
          })
        });
        const data = await res.json();
        if (data.status === 'success') {
          showToast('✅ Question configuration validated and saved persistently!');
          adminDataCache.config = data.config || adminDataCache.config;
          nav('admin');
        } else {
          showToast('❌ ' + data.message);
        }
      };
    }

    const inpMascot = document.getElementById('inp-mascot-file');
    const btnMascotUp = document.getElementById('btn-mascot-upload');
    if (inpMascot && btnMascotUp) {
      inpMascot.onchange = () => {
        const file = inpMascot.files[0];
        btnMascotUp.disabled = !file;
        const preview = document.getElementById('mascot-admin-preview');
        if (file && preview) {
          const img = document.createElement('img');
          img.alt = 'New mascot preview';
          img.src = URL.createObjectURL(file);
          preview.replaceChildren(img);
        }
      };
      btnMascotUp.onclick = async (e) => {
        e.preventDefault();
        const file = inpMascot.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          showToast('⚠️ Image is too large. Maximum size is 5 MB.');
          return;
        }
        btnMascotUp.disabled = true;
        const form = new FormData();
        form.append('image', file);
        try {
          const res = await fetch('/api/admin/mascot', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getBearerToken() },
            body: form
          });
          const data = await res.json();
          if (data.status === 'success') {
            setMascotUrl(data.mascotUrl || '');
            showToast('✅ Cybersecurity mascot updated across the game.');
            nav('admin');
          } else {
            showToast('❌ ' + data.message);
            btnMascotUp.disabled = false;
          }
        } catch (err) {
          console.error('[MASCOT UPLOAD ERROR]', err);
          showToast('❌ Failed to upload mascot image.');
          btnMascotUp.disabled = false;
        }
      };
    }

    const btnMascotReset = document.getElementById('btn-mascot-reset');
    if (btnMascotReset) {
      btnMascotReset.onclick = async (e) => {
        e.preventDefault();
        if (!confirm('Remove the uploaded mascot and show the default 3D character?')) return;
        const res = await fetch('/api/admin/mascot', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + getBearerToken() }
        });
        const data = await res.json();
        if (data.status === 'success') {
          setMascotUrl('');
          showToast('✅ Mascot reverted to the default character.');
          nav('admin');
        } else {
          showToast('❌ ' + data.message);
        }
      };
    }

    attachUserDetailEvents();
  }

  function refreshAdminConfigSection() {
    const configGrid = document.querySelector('.admin-section--active .config-grid');
    if (!configGrid) return;

    const newHtml = renderAdminQuestionConfigHtml();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;

    const newGrid = tempDiv.querySelector('.config-grid');
    if (newGrid) configGrid.replaceWith(newGrid);

    const saveContainer = document.querySelector('.admin-section--active [style*="text-align:right"]');
    const newSaveContainer = tempDiv.querySelector('[style*="text-align:right"]');
    if (saveContainer && newSaveContainer) saveContainer.replaceWith(newSaveContainer);

    initAdminDashboardEvents();
  }


  function attachUserDetailEvents() {
    document.querySelectorAll('.btn-user-detail').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const targetEmail = e.currentTarget.dataset.email;
        showUserDetailModal(targetEmail);
      });
    });
  }

  async function showUserDetailModal(targetEmail) {
    try {
      const res = await fetch('/api/admin/user/' + encodeURIComponent(targetEmail), {
        headers: { 'Authorization': 'Bearer ' + getBearerToken() }
      });
      const data = await res.json();
      if (data.status !== 'success') {
        showToast('❌ Failed to fetch user detail.');
        return;
      }
      const u = data.user;
      const logs = data.logs || [];
      
      const modal = document.createElement('div');
      modal.className = 'admin-modal-overlay';
      modal.innerHTML = '<div class="admin-modal-content">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-md)">' +
          '<h3>User Gameplay Detail: ' + esc(u.email) + '</h3>' +
          '<button class="btn btn--ghost" id="btn-close-user-modal">✕ Close</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);margin-bottom:var(--space-lg);font-size:13px;background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md)">' +
          '<div><strong>First Registered:</strong> ' + (u.created_at || 'N/A') + '</div>' +
          '<div><strong>Last Active:</strong> ' + (u.last_active_at || 'N/A') + '</div>' +
          '<div><strong>IT Mission:</strong> ' + (u.it_played ? ('Played (' + u.it_score + ' pts)') : 'Not Played') + '</div>' +
          '<div><strong>OT Mission:</strong> ' + (u.ot_played ? ('Played (' + u.ot_score + ' pts)') : 'Not Played') + '</div>' +
        '</div>' +
        '<div style="margin-bottom:var(--space-lg);background:var(--bg-secondary);padding:var(--space-md);border-radius:var(--border-radius-md)">' +
          '<h4 style="margin-bottom:var(--space-sm)">Attempt Management Controls</h4>' +
          '<div style="display:flex;gap:var(--space-sm);align-items:center">' +
            '<button class="btn btn--primary" id="btn-reset-user-att">🔄 Reset Attempts Counter (Allow Replay)</button>' +
          '</div>' +
        '</div>' +
        '<h4>Attempt History Logs (' + logs.length + ')</h4>' +
        '<div class="admin-table-wrapper">' +
          '<table class="admin-table">' +
            '<thead><tr><th>Date</th><th>Mission</th><th>Score</th><th>Grade</th></tr></thead>' +
            '<tbody>' + logs.map(l => '<tr><td>' + (l.completed_at || '') + '</td><td>' + l.mission_id + '</td><td>' + l.score + '</td><td>' + l.grade + '</td></tr>').join('') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
      
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-user-modal').addEventListener('click', () => modal.remove());
      modal.querySelector('#btn-reset-user-att').addEventListener('click', async () => {
        const rRes = await fetch('/api/admin/user/reset-attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getBearerToken() },
          body: JSON.stringify({ email: targetEmail })
        });
        const rData = await rRes.json();
        if (rData.status === 'success') {
          showToast('✅ Attempts reset for ' + targetEmail);
          modal.remove();
          nav('admin');
        } else {
          showToast('❌ ' + rData.message);
        }
      });

    } catch(err) {
      console.error(err);
    }
  }

  async function nav(screen, data) {
    // Scenario narration belongs to the scene being left; a new scene starts its own
    narration.stop();
    addBg();
    
    // Check auth on landing or mission select
    if (!currentUser && screen !== 'howtoplay' && screen !== 'leaderboard') {
      const valid = await checkUserSession();
      if (!valid) {
        renderAuthModal();
        return;
      }
    }

    currentScreen = screen;
    renderTopbar();

    switch(screen) {
      case 'landing':
        app.innerHTML = screenLanding();
        setTimeout(() => cyber3D.renderCharacter('hero-3d-canvas', 'IT'), 60);
        break;
      case 'howtoplay': app.innerHTML = screenHowToPlay(); break;
      case 'setup': app.innerHTML = screenSetup(); break;
      case 'missionselect': app.innerHTML = screenMissionSelect(); break;
      case 'intro': app.innerHTML = screenIntro(data.mission); break;
      case 'scene': renderGameScene(); return;
      case 'result':
        if (data && currentUser) {
          clearRun(data.mission);
          submitMissionCompletionApi(data.mission, data.normalizedScore, data.normalizedScore >= 850 ? 'A' : data.normalizedScore >= 700 ? 'B' : 'C', data.decisions);
        }
        app.innerHTML = screenResult(data);
        break;
      case 'leaderboard': app.innerHTML = screenLeaderboard(); break;
      case 'admin': app.innerHTML = await renderAdminDashboardHtml(); initAdminDashboardEvents(); break;
      default: app.innerHTML = screenLanding();
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function screenLanding() {
    const run = activeRun();
    const resumeBtn = run ? '<button class="btn btn--primary btn--lg" id="tb-resume-' + run.mission + '">⏳ RESUME ' + run.mission + ' MISSION (' + runProgress(run).done + '/' + runProgress(run).total + ')</button>' : '';
    return '<div class="landing scene-enter"><div class="landing__logo">' + ShieldLogo + '</div><h1 class="landing__title">CYBER SHIFT</h1><p class="landing__tagline">Your workday looks normal.<br/>Then <strong>one message</strong> changes the situation.<br/><br/>Make the right calls.<br/>Protect the business. Protect the plant.</p>' +
      '<div class="hero-3d-container"><div id="hero-3d-canvas" class="cyber-3d-wrapper"></div></div>' +
      '<div class="landing__cta-group">' + resumeBtn + '<button class="btn ' + (run ? 'btn--secondary' : 'btn--primary btn--lg') + '" id="btn-start">▶ ENTER MISSION SELECT</button><button class="btn btn--secondary" id="btn-howto">How to Play</button><button class="btn btn--ghost" id="btn-lb">🏆 Leaderboard</button></div><div class="landing__version">v' + GAME_VERSION.gameVersion + ' · Build ' + GAME_VERSION.buildVersion + '</div><div class="privacy-notice">🔒 Single-Play Policy Active: 1 attempt allowed per user per mission. Authenticated via SMTP OTP.</div></div>';
  }


  function screenHowToPlay() {
    const steps = [
      ['1', 'Read the Situation', 'Each mission gives you ' + SCENES_PER_MISSION + ' real-life workplace situations, picked just for you.'],
      ['2', 'Look for Clues', 'Tap the clues to spot the warning signs before you decide.'],
      ['3', 'Make Your Choice', 'Pick the safest thing to do. Your score and risk level change with every choice.'],
      ['4', 'Learn & Earn Badges', 'Every answer explains what was right or wrong. Safe choices earn badges.'],
      ['5', 'Complete Both Missions', 'Office & online safety, then factory & plant safety.'],
      ['6', 'One Attempt Only', 'Make your choices count — you get one attempt at each mission.']
    ];
    return '<div class="how-to-play scene-enter"><h1 class="how-to-play__title">How to Play</h1><div class="how-to-play__steps">' + steps.map(s => '<div class="how-to-play__step"><div class="how-to-play__step-num">' + s[0] + '</div><h2 class="how-to-play__step-title">' + s[1] + '</h2><p class="how-to-play__step-desc">' + s[2] + '</p></div>').join('') + '</div><button class="btn btn--primary" id="btn-back">← Back to Menu</button></div>';
  }

  function screenSetup() {
    return screenMissionSelect();
  }

  function screenMissionSelect() {
    const card = (mission) => {
      const m = MISSIONS[mission];
      const done = missionPlayed(mission);
      const score = currentUser ? ((mission === 'IT' ? currentUser.it_score : currentUser.ot_score) || 0) : 0;
      let status;
      if (done) {
        status = '<div class="completed-badge-box"><span>✓ ATTEMPT COMPLETED</span><span>Score: ' + score + '/1000</span></div><div class="policy-notice">🔒 You have used your 1 attempt for this mission.</div>';
      } else {
        const run = loadRun(mission);
        if (run) {
          const p = runProgress(run);
          status = '<div class="inprogress-box"><div class="inprogress-box__row"><span>⏳ IN PROGRESS — ' + p.done + '/' + p.total + ' situations</span><span>Resume ▶</span></div><div class="inprogress-box__bar"><span style="width:' + p.pct + '%"></span></div></div>';
        } else {
          status = '<div style="margin-top:var(--space-md);font-family:var(--font-mono);font-size:var(--font-size-xs);color:var(--accent-cyan)">▶ READY TO PLAY · ' + SCENES_PER_MISSION + ' situations · 1 attempt</div>';
        }
      }
      return '<div class="card card--mission ' + (done ? 'card--disabled' : '') + '" id="btn-' + mission.toLowerCase() + '" tabindex="0" role="button"><div class="card__icon">' + m.icon + '</div><div class="card__label">Mission ' + m.number + '</div><h2 class="card__title">' + esc(m.name) + '</h2><p class="card__subtitle">' + esc(m.area) + '</p><p class="card__desc">' + esc(m.summary) + '</p>' + status + '</div>';
    };
    return '<div class="mission-select scene-enter"><h1 class="mission-select__title">Choose Your Mission</h1><p class="mission-select__sub">You get one attempt at each mission — make your choices count.</p><div class="mission-select__grid">' + card('IT') + card('OT') + '</div><div style="margin-top:var(--space-2xl);display:flex;gap:var(--space-md);flex-wrap:wrap;justify-content:center"><button class="btn btn--ghost" id="btn-back">← Back</button><button class="btn btn--ghost" id="btn-lb">🏆 Leaderboard</button></div></div>';
  }

  function screenIntro(mission) {
    const m = MISSIONS[mission];
    return '<div class="intro scene-enter"><div class="intro__mission-label">' + m.icon + ' Mission ' + m.number + ' · ' + esc(m.area) + '</div><h1 class="intro__title">' + esc(m.name) + '</h1><p class="intro__subtitle">' + esc(m.intro) + '</p><div class="intro__objectives"><div class="intro__objectives-title">What you will practise</div>' + m.objectives.map(o => '<div class="intro__objective">' + esc(o) + '</div>').join('') + '</div><p class="intro__note">' + SCENES_PER_MISSION + ' situations, picked just for you. One attempt — take your time.</p><button class="btn btn--primary btn--lg" id="btn-begin" data-mission="' + mission + '">▶ BEGIN MISSION ' + m.number + '</button><button class="btn btn--ghost" id="btn-backsel" style="margin-top:var(--space-md)">← Back to Mission Select</button></div>';
  }

  // Brief title card introducing each new situation with its illustration
  function showSceneSplash(scene, index, total) {
    document.querySelectorAll('.scene-splash').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'scene-splash';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="scene-splash__card"><div class="scene-splash__art">' + renderArt(scene.art) + '</div><div class="scene-splash__count">Situation ' + index + ' of ' + total + '</div><div class="scene-splash__title">' + esc(scene.title) + '</div><div class="scene-splash__location">' + esc(scene.location) + '</div></div>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  function renderGameScene() {
    const state = engine.state;
    const scene = engine.getCurrentScene();
    if (!scene || !state) return;
    seqSelections = [];
    const answered = state.decisionsMade.some(d => d.sceneId === scene.id);
    const position = state.sceneIds.indexOf(scene.id) + 1;

    let evidenceHtml = '';
    if (scene.evidence.length > 0) {
      evidenceHtml = '<div class="evidence-panel"><div class="evidence-panel__title">Look for clues</div><div class="evidence-items">' + scene.evidence.map(ev => {
        const viewed = state.evidenceViewed.includes(scene.id + ':' + ev.id);
        return '<button class="evidence-item ' + (viewed ? 'evidence-item--viewed' : '') + '" data-eid="' + ev.id + '" data-sid="' + scene.id + '">' + esc(ev.label) + '</button>';
      }).join('') + '</div></div>';
    }

    let decisionHtml = '';
    if (scene.isSequence) {
      decisionHtml = '<div class="sequence-panel"><div class="sequence-panel__title">' + esc(scene.sequence.prompt || 'Tap the steps in the right order.') + '</div><div class="sequence-items" id="seq-items">' + engine.getSequenceItems(scene).map(item => '<button class="sequence-item" data-seqid="' + item.id + '"><div class="sequence-item__number">—</div><div>' + esc(item.text) + '</div></button>').join('') + '</div><button class="btn btn--primary btn--full" id="btn-submitseq" disabled style="margin-top:var(--space-lg)">Check my order</button></div>';
    } else {
      decisionHtml = '<div class="decisions"><div class="decisions__title">' + esc(scene.question || 'What should you do?') + '</div><div class="decision-grid">' + engine.getAnswers(scene).map((d, i) => '<button class="decision-btn" data-did="' + d.id + '"><div class="decision-btn__label">Option ' + OPTION_LETTERS[i] + '</div><div class="decision-btn__text">' + esc(d.text) + '</div></button>').join('') + '</div></div>';
    }

    const story = '<div class="dialogue__text">' + esc(scene.story) + '</div>' +
      (scene.dialogue || []).map(d => '<div class="dialogue__line"><div class="dialogue__speaker">' + esc(d.speaker) + '</div><div class="dialogue__text">“' + esc(d.text) + '”</div></div>').join('');
    const visual = renderVisual(scene.visual);
    const envClass = scene.mission === 'OT' ? 'env-plant' : 'env-office';
    const envDecor = scene.mission === 'OT' ? '<div class="env-plant__conveyor"></div><div class="env-plant__hmi"></div>' : '<div class="env-office__desk"></div><div class="env-office__monitor"></div>';

    saveRun();
    app.innerHTML = '<main class="scene scene-enter" id="scene-main"><div class="scene__header"><div class="scene__location">' + esc(scene.location) + '</div><h1 class="scene__title">' + esc(scene.title) + '</h1><p class="scene__subtitle">' + esc(scene.subtitle || '') + '</p></div>' +
      '<div class="scene__layout"><section class="scene__story">' +
      '<div class="env-panel"><div class="' + envClass + '">' + envDecor + '</div><div id="scene-3d-canvas" class="cyber-3d-wrapper" style="height:200px;max-width:340px;margin:0 auto var(--space-md)"></div><div class="env-panel__scene' + (visual ? '' : ' env-panel__scene--art-only') + '"><figure class="scene-art">' + renderArt(scene.art) + '</figure>' + (visual ? '<div class="scene-visual">' + visual + '</div>' : '') + '</div></div>' +
      '<div class="dialogue-panel">' + story + '</div></section>' +
      '<section class="scene__actions" id="scene-actions">' + evidenceHtml + decisionHtml + '</section></div></main>';
    if (!answered) showSceneSplash(scene, position, state.sceneIds.length);
    setTimeout(() => {
      cyber3D.renderCharacter('scene-3d-canvas', scene.mission);
      // Skip if the player already navigated away during the delay
      if (!answered && currentScreen === 'scene' && document.getElementById('scene-main')) narration.speakScenario(scene);
    }, 80);
    window.scrollTo({top:0,behavior:'smooth'});
  }


  function screenResult(data) {
    const { normalizedScore, rawScore, risk, criticalErrors, badges, decisions, mission, topics } = data;
    const m = MISSIONS[mission];
    const mBadges = BADGES[mission];
    const total = decisions ? decisions.length : 0;
    const correct = decisions ? decisions.filter(d => d.correct).length : 0;
    const takeaways = (topics || []).map(t => TOPICS[t]).filter(Boolean);

    return '<div class="result scene-enter"><div class="result__header"><div class="result__status">Mission Complete</div><h1 class="result__title">' + esc(m.name) + '</h1></div><div class="result__score-display"><div class="result__score-big">' + normalizedScore + '</div><div class="result__score-max">/ 1000</div></div><div class="result__stats-grid"><div class="result__stat-card"><div class="result__stat-card-label">Risk Level</div><div class="result__stat-card-value" style="color:' + (risk<=25?'var(--accent-green)':risk<=50?'var(--accent-amber)':'var(--accent-red)') + '">' + risk + '/100</div></div><div class="result__stat-card"><div class="result__stat-card-label">Safest Choices</div><div class="result__stat-card-value" style="color:var(--accent-cyan)">' + correct + '/' + total + '</div></div><div class="result__stat-card"><div class="result__stat-card-label">Dangerous Choices</div><div class="result__stat-card-value" style="color:' + (criticalErrors===0?'var(--accent-green)':'var(--accent-red)') + '">' + criticalErrors + '</div></div><div class="result__stat-card"><div class="result__stat-card-label">Points</div><div class="result__stat-card-value">' + rawScore + '</div></div></div><div class="result__details"><div class="badges-section"><h2 class="badges-section__title">Badges</h2><div class="badges-grid">' + mBadges.map(b => { const e = badges && badges.includes(b.id); return '<div class="badge-item ' + (e?'badge-item--earned':'badge-item--locked') + '" title="' + esc(b.description) + '"><span class="badge-item__icon">' + b.icon + '</span><span class="badge-item__name">' + esc(b.name) + '</span>' + (e?'<span class="badge-item__check">✓</span>':'<span style="color:var(--text-muted)">🔒</span>') + '</div>'; }).join('') + '</div></div><div class="debrief"><h2 class="debrief__title">Remember</h2><div class="debrief__items">' + takeaways.map((t,i) => '<div class="debrief__item"><div class="debrief__item-num">' + String(i+1).padStart(2,'0') + '</div><div><strong>' + esc(t.label) + '</strong> — ' + esc(t.takeaway) + '</div></div>').join('') + '</div></div></div><div class="result__actions"><button class="btn btn--primary" id="btn-replay" data-mission="' + mission + '">🔄 Play Again</button>' + (mission==='IT'?'<button class="btn btn--secondary" id="btn-contot">Continue to Mission 2 →</button>':'<button class="btn btn--secondary" id="btn-back">← Back to Menu</button>') + '<button class="btn btn--ghost" id="btn-lb">🏆 Leaderboard</button></div></div>';
  }

  function screenLeaderboard() {
    const entries = engine.getLeaderboard();
    const stats = engine.getAnalytics();
    let tableHtml = '';
    if (entries.length > 0) {
      tableHtml = '<div class="table-scroll"><table class="leaderboard__table"><thead><tr><th>Rank</th><th>Player</th><th>Avg Score</th><th>Games</th><th>Badges</th></tr></thead><tbody>' + entries.map((e,i) => '<tr><td><span class="leaderboard__rank ' + (i===0?'leaderboard__rank--gold':i===1?'leaderboard__rank--silver':i===2?'leaderboard__rank--bronze':'') + '">#' + (i+1) + '</span></td><td>' + e.name + '</td><td><span class="leaderboard__score">' + e.avgScore + '</span></td><td>' + e.gamesPlayed + '</td><td>' + e.badges + '</td></tr>').join('') + '</tbody></table></div>';
    } else {
      tableHtml = '<div style="text-align:center;color:var(--text-muted);padding:var(--space-2xl)"><div style="font-size:48px;margin-bottom:var(--space-md)">🏆</div><p>No completed games yet. Be the first to play!</p></div>';
    }
    return '<div class="leaderboard scene-enter"><h1 class="leaderboard__title">🏆 Leaderboard</h1><div style="display:flex;flex-wrap:wrap;gap:var(--space-md);justify-content:center;margin-bottom:var(--space-2xl);max-width:1000px;width:100%"><div class="result__stat-card" style="flex:1;min-width:120px"><div class="result__stat-card-label">Players</div><div class="result__stat-card-value" style="color:var(--accent-cyan)">' + stats.totalParticipants + '</div></div><div class="result__stat-card" style="flex:1;min-width:120px"><div class="result__stat-card-label">Avg Score</div><div class="result__stat-card-value">' + stats.avgScore + '</div></div><div class="result__stat-card" style="flex:1;min-width:120px"><div class="result__stat-card-label">IT Plays</div><div class="result__stat-card-value">' + stats.itCompletions + '</div></div><div class="result__stat-card" style="flex:1;min-width:120px"><div class="result__stat-card-label">OT Plays</div><div class="result__stat-card-value">' + stats.otCompletions + '</div></div></div>' + tableHtml + '<div style="margin-top:var(--space-2xl);display:flex;gap:var(--space-md)"><button class="btn btn--primary" id="btn-back">← Back to Menu</button><button class="btn btn--ghost" id="btn-export">📊 Export Data</button></div></div>';
  }

  // ================================================================
  // EVENT HANDLER
  // ================================================================
  document.addEventListener('click', async function(e) {
    const t = e.target;
    const id = t.id || (t.closest('[id]') || {}).id || '';
    const did = t.dataset?.did || (t.closest('[data-did]') || {}).dataset?.did;
    const eid = t.dataset?.eid || (t.closest('[data-eid]') || {}).dataset?.eid;
    const seqid = t.dataset?.seqid || (t.closest('[data-seqid]') || {}).dataset?.seqid;

    // Close the account menu on any click outside it
    if (!t.closest('.topbar__user')) toggleUserMenu(false);

    // CONFIRM DIALOG
    if (id === 'btn-confirm-yes') { const fn = pendingConfirm; closeConfirm(); if (fn) fn(); return; }
    if (id === 'btn-confirm-no' || t.id === 'confirm-overlay') { closeConfirm(); return; }
    if (t.closest('#confirm-overlay')) return;

    // TOP BAR NAVIGATION
    if (id === 'tb-user') { toggleUserMenu(); return; }
    if (id === 'tb-narration') { narration.toggle(); return; }
    if (id === 'tb-home' || id === 'tb-home-brand') { leaveMissionTo('landing'); return; }
    if (id === 'tb-missions') { leaveMissionTo('missionselect'); return; }
    if (id === 'tb-lb') { leaveMissionTo('leaderboard'); return; }
  if (id === 'tb-admin' || id === 'tb-admin-menu') { toggleUserMenu(false); leaveMissionTo('admin'); return; }
  if (id === 'btn-admin-to-player') { leaveMissionTo('landing'); return; }
  if (id === 'btn-admin-refresh') { nav('admin'); return; }
    if (id === 'tb-howto') { toggleUserMenu(false); leaveMissionTo('howtoplay'); return; }
    if (id === 'tb-resume-IT' || id === 'tb-resume-OT') { resumeRun(id.slice(-2)); return; }

    // AUTHENTICATION EVENT HANDLERS
    if (id === 'btn-request-otp') {
      authInfoMsg = '';
      const emailInp = document.getElementById('inp-auth-email');
      const email = (emailInp ? emailInp.value : '').trim();
      if (!email) {
        authErrorMsg = 'Please enter your corporate email address.';
        renderAuthModal(); return;
      }
      if (!emailDomainAllowed(email)) {
        authEmail = email;
        authErrorMsg = 'Access restricted: only ' + allowedDomainsText() + ' email addresses can sign in.';
        renderAuthModal(); return;
      }
      authEmail = email;
      authErrorMsg = '';
      const btn = document.getElementById('btn-request-otp');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending OTP via SMTP...'; }
      
      const res = await apiRequest('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      
      if (res.ok && res.data.status === 'success') {
        authStep = 'otp';
        authEmail = email;
        devNoticeOtp = res.data.devOtp || '';
        authErrorMsg = '';
        authSuccessMsg = res.data.message || 'OTP sent successfully.';
        renderAuthModal();
      } else if (res.data.status === 'completed_all') {
        authErrorMsg = res.data.message;
        renderAuthModal();
      } else {
        authErrorMsg = res.data.message || 'Failed to send OTP code.';
        renderAuthModal();
      }
      return;
    }

    if (id === 'btn-verify-otp') {
      const otpInp = document.getElementById('inp-auth-otp');
      const otp = (otpInp ? otpInp.value : '').trim();
      if (!otp || otp.length < 6) {
        authErrorMsg = 'Please enter the 6-digit OTP code sent to your email.';
        renderAuthModal(); return;
      }
      authErrorMsg = '';
      const btn = document.getElementById('btn-verify-otp');
      if (btn) { btn.disabled = true; btn.textContent = 'Verifying Code...'; }
      
      const res = await apiRequest('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, otp })
      });
      
      if (res.ok && res.data.status === 'success') {
        setSession(res.data.token, res.data.user, res.data.expiresAt);
        devNoticeOtp = '';
        authSuccessMsg = '';

        const ov = document.getElementById('auth-modal-overlay');
        if (ov) ov.remove();
        if (currentUser && currentUser.isAdmin) { nav('admin'); } else { nav('missionselect'); }
      } else {
        authErrorMsg = res.data.message || 'Invalid OTP code.';
        renderAuthModal();
      }
      return;
    }

    if (id === 'btn-change-email') {
      authStep = 'email';
      authErrorMsg = '';
      authSuccessMsg = '';
      renderAuthModal(); return;
    }

    if (id === 'btn-resend-otp') {
      const res = await apiRequest('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail })
      });
      if (res.ok) {
        devNoticeOtp = res.data.devOtp || '';
        authSuccessMsg = 'A new OTP has been sent via SMTP.';
        authErrorMsg = '';
      } else {
        authErrorMsg = res.data.message || 'Failed to resend OTP.';
      }
      renderAuthModal(); return;
    }

    if (id === 'btn-logout') {
      toggleUserMenu(false);
      signOut(false); return;
    }

    // Navigation
    if (id === 'btn-start') { if (currentUser && currentUser.isAdmin) { nav('admin'); } else { nav('missionselect'); } return; }
    if (id === 'btn-howto') { nav('howtoplay'); return; }
    if (id === 'btn-back' || id === 'btn-backsel') { nav(id==='btn-backsel'?'missionselect':'landing'); return; }
    if (id === 'btn-lb') { nav('leaderboard'); return; }
    
    if (id === 'btn-it') { 
      if (currentUser && currentUser.it_played === 1) {
        alert('🔒 Campaign Policy Enforcement: You have already completed your 1 allowed attempt for the IT Mission (Score: ' + currentUser.it_score + '/1000).');
        return;
      }
      if (resumeRun('IT')) return;
      nav('intro',{mission:'IT'}); return;
    }
    
    if (id === 'btn-ot') { 
      if (currentUser && currentUser.ot_played === 1) {
        alert('🔒 Campaign Policy Enforcement: You have already completed your 1 allowed attempt for the OT Mission (Score: ' + currentUser.ot_score + '/1000).');
        return;
      }
      if (resumeRun('OT')) return;
      nav('intro',{mission:'OT'}); return;
    }
    
    if (id === 'btn-begin') {
      const m = (t.closest('[data-mission]') || t).dataset.mission;
      if (m === 'IT' && currentUser && currentUser.it_played === 1) {
        alert('🔒 Policy Enforcement: IT Mission already completed.'); return;
      }
      if (m === 'OT' && currentUser && currentUser.ot_played === 1) {
        alert('🔒 Policy Enforcement: OT Mission already completed.'); return;
      }
      // An unfinished attempt resumes instead of restarting
      if (resumeRun(m)) return;
      engine.createSession(m, currentUser ? currentUser.email : 'guest');
      nav('scene'); return;
    }
    if (id === 'btn-replay') {
      const m = (t.closest('[data-mission]') || t).dataset.mission;
      if (m === 'IT' && currentUser && currentUser.it_played === 1) {
        alert('🔒 Single-Play Policy: You cannot replay the IT Mission. Your 1 attempt has been completed and recorded.'); return;
      }
      if (m === 'OT' && currentUser && currentUser.ot_played === 1) {
        alert('🔒 Single-Play Policy: You cannot replay the OT Mission. Your 1 attempt has been completed and recorded.'); return;
      }
      engine.createSession(m, currentUser ? currentUser.email : 'guest');
      nav('scene'); return;
    }
    if (id === 'btn-contot') {
      if (resumeRun('OT')) return;
      nav('intro',{mission:'OT'}); return;
    }
    if (id === 'btn-export') {
      const csv = engine.exportCSV();
      const blob = new Blob([csv],{type:'text/csv'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cyber-shift-export-' + new Date().toISOString().slice(0,10) + '.csv';
      a.click(); return;
    }
    if (id === 'btn-close-ev') {
      const ov = document.querySelector('.evidence-reveal__overlay');
      const rv = document.querySelector('.evidence-reveal');
      if (ov) ov.remove(); if (rv) rv.remove(); return;
    }

    // Evidence
    if (eid) {
      const sid = (t.closest('[data-sid]') || t).dataset?.sid || engine.state?.sceneId;
      if (!sid) return;
      const scene = engine.getCurrentScene();
      if (!scene) return;
      const ev = scene.evidence.find(e => e.id === eid);
      if (!ev) return;
      engine.viewEvidence(sid, eid);
      saveRun();
      const btn = t.closest('[data-eid]') || t;
      btn.classList.add('evidence-item--viewed');
      const ov = document.createElement('div'); ov.className = 'evidence-reveal__overlay';
      ov.addEventListener('click', () => { ov.remove(); rv.remove(); });
      const rv = document.createElement('div'); rv.className = 'evidence-reveal';
      rv.innerHTML = '<div class="evidence-reveal__severity evidence-reveal__severity--' + ev.severity + '">' + (SEVERITY_LABELS[ev.severity] || ev.severity) + '</div><div class="evidence-reveal__label">' + esc(ev.label) + '</div><div class="evidence-reveal__text">' + esc(ev.revealText) + '</div><button class="btn btn--secondary btn--full" id="btn-close-ev">Close</button>';
      document.body.appendChild(ov); document.body.appendChild(rv);
      rv.querySelector('#btn-close-ev').focus();
      return;
    }

    // Decision
    if (did) {
      const result = engine.submitDecision(did);
      if (!result) return;
      saveRun();
      renderTopbar();
      document.querySelectorAll('.decision-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
      const chosen = document.querySelector('[data-did="' + did + '"]');
      if (chosen) { chosen.style.opacity = '1'; chosen.style.borderColor = result.decision.correct ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'; }
      showScorePopup(result.pointsChange);
      const hs = document.getElementById('hud-score');
      const hr = document.getElementById('hud-risk');
      const rf = document.getElementById('risk-fill');
      if (hs) animateCounter(hs, result.newScore - result.pointsChange, result.newScore);
      if (hr) { animateCounter(hr, result.newRisk - result.riskChange, result.newRisk); const ri = engine.getRiskLevel(result.newRisk); hr.className = 'hud__stat-value hud__stat-value--risk ' + ri.cls; }
      if (rf) { animateRisk(rf, result.newRisk - result.riskChange, result.newRisk); rf.className = 'risk-meter__fill ' + engine.getRiskLevel(result.newRisk).cls; }
      announceBadges(result.newBadges);
      pendingResult = result;
      const isCorr = result.decision.correct;
      const pts = result.pointsChange;
      const rk = result.riskChange;
      const feedback = {
        best: ['✓ SAFEST CHOICE', 'Well done!', 'correct'],
        ok: ['~ PARTLY RIGHT', 'Not quite the safest choice.', 'partial'],
        risky: ['✕ RISKY CHOICE', 'That was risky.', 'wrong'],
        critical: ['✕ DANGEROUS CHOICE', 'That could cause real harm.', 'wrong']
      }[result.decision.grade] || ['✕ RISKY CHOICE', 'That was risky.', 'wrong'];
      const label = feedback[0];
      const cls = feedback[2];
      const bestHint = !isCorr && result.bestDecision ? '<div class="consequence__best"><span>✅ The safest choice:</span> ' + esc(result.bestDecision.text) + '</div>' : '';
      const sm = document.getElementById('scene-actions');
      if (sm) {
        const cd = document.createElement('div');
        cd.innerHTML = '<div class="consequence consequence--' + cls + '"><div class="consequence__badge">' + label + '</div><h2 class="consequence__title">' + feedback[1] + '</h2><p class="consequence__explanation">' + esc(result.decision.explanation) + '</p>' + bestHint + '<div class="consequence__stats"><div class="consequence__stat"><div class="consequence__stat-label">Points</div><div class="consequence__stat-value ' + (pts>=0?'consequence__stat-value--positive':'consequence__stat-value--negative') + '">' + (pts>=0?'+':'') + pts + '</div></div><div class="consequence__stat"><div class="consequence__stat-label">Risk</div><div class="consequence__stat-value ' + (rk<=0?'consequence__stat-value--positive':'consequence__stat-value--negative') + '">' + (rk>0?'+':'') + rk + '</div></div></div><button class="btn btn--primary btn--full" id="btn-next">' + (result.nextScene ? 'Continue →' : 'See Results →') + '</button></div>';
        sm.appendChild(cd.firstElementChild);
        sm.querySelector('.consequence').scrollIntoView({behavior:'smooth',block:'center'});
      }
      return;
    }

    // Sequence
    if (seqid) {
      const idx = seqSelections.indexOf(seqid);
      if (idx >= 0) { seqSelections = seqSelections.slice(0, idx); }
      else { seqSelections.push(seqid); }
      document.querySelectorAll('.sequence-item').forEach(item => {
        const sid2 = item.dataset.seqid;
        const si = seqSelections.indexOf(sid2);
        if (si >= 0) { item.classList.add('sequence-item--selected'); item.querySelector('.sequence-item__number').textContent = si + 1; }
        else { item.classList.remove('sequence-item--selected'); item.querySelector('.sequence-item__number').textContent = '—'; }
      });
      const sb = document.getElementById('btn-submitseq');
      const sc2 = engine.getCurrentScene();
      if (sb && sc2) sb.disabled = seqSelections.length !== sc2.sequenceItems.length;
      return;
    }

    // Submit sequence
    if (id === 'btn-submitseq') {
      const res = engine.submitSequence(seqSelections);
      if (!res) return;
      saveRun();
      renderTopbar();
      showScorePopup(res.points);
      const hs2 = document.getElementById('hud-score');
      const hr2 = document.getElementById('hud-risk');
      const rf2 = document.getElementById('risk-fill');
      if (hs2) animateCounter(hs2, engine.state.score - res.points, engine.state.score);
      if (hr2) { animateCounter(hr2, engine.state.risk - res.riskDelta, engine.state.risk); hr2.className = 'hud__stat-value hud__stat-value--risk ' + engine.getRiskLevel(engine.state.risk).cls; }
      if (rf2) { animateRisk(rf2, engine.state.risk - res.riskDelta, engine.state.risk); rf2.className = 'risk-meter__fill ' + engine.getRiskLevel(engine.state.risk).cls; }
      document.querySelectorAll('.sequence-item').forEach(i => { i.style.pointerEvents = 'none'; i.style.opacity = '0.7'; });
      document.getElementById('btn-submitseq').style.display = 'none';
      announceBadges(res.newBadges);
      pendingResult = res;
      const isC = res.isCorrect;
      const orderHint = isC ? '' : '<div class="consequence__best"><span>✅ The right order:</span><ol>' + res.correctOrder.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol></div>';
      const sm2 = document.getElementById('scene-actions');
      if (sm2) {
        const cd2 = document.createElement('div');
        cd2.innerHTML = '<div class="consequence consequence--' + (isC?'correct':'partial') + '"><div class="consequence__badge">' + (isC?'✓ RIGHT ORDER':'~ PARTLY RIGHT') + '</div><h2 class="consequence__title">' + (isC?'Perfect order!':'Close, but not quite right.') + '</h2><p class="consequence__explanation">' + esc(res.explanation) + '</p>' + orderHint + '<div class="consequence__stats"><div class="consequence__stat"><div class="consequence__stat-label">In the right place</div><div class="consequence__stat-value">' + res.correctCount + '/' + res.total + '</div></div><div class="consequence__stat"><div class="consequence__stat-label">Points</div><div class="consequence__stat-value ' + (res.points>=0?'consequence__stat-value--positive':'consequence__stat-value--negative') + '">' + (res.points>=0?'+':'') + res.points + '</div></div></div><button class="btn btn--primary btn--full" id="btn-next">' + (res.nextScene ? 'Continue →' : 'See Results →') + '</button></div>';
        sm2.appendChild(cd2.firstElementChild);
        sm2.querySelector('.consequence').scrollIntoView({behavior:'smooth',block:'center'});
      }
      return;
    }

    // Next scene
    if (id === 'btn-next') {
      if (!pendingResult) return;
      const ns = pendingResult.nextScene;
      if (ns === null || ns === undefined) {
        const cr = engine.completeMission();
        if (cr) nav('result', cr);
      } else {
        engine.advanceToScene(ns);
        nav('scene');
      }
      pendingResult = null;
      return;
    }
  });

  // Keyboard: Enter/Space on cards, number keys for decisions
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { toggleUserMenu(false); closeConfirm(); return; }
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Enter') {
        const btn = document.getElementById(e.target.id === 'inp-auth-otp' ? 'btn-verify-otp' : 'btn-request-otp');
        if (btn && !btn.disabled) btn.click();
      }
      return;
    }
    if (document.getElementById('auth-modal-overlay') || document.getElementById('confirm-overlay')) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card--mission')) {
      e.preventDefault(); e.target.click();
    }
    if (['1','2','3','4'].includes(e.key)) {
      const btns = document.querySelectorAll('.decision-btn');
      const idx = parseInt(e.key) - 1;
      if (btns[idx] && !btns[idx].disabled) btns[idx].click();
    }
  });

  // Init
  nav('landing');

})();


