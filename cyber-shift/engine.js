/**
 * CYBER SHIFT — Game Engine
 * Core state machine, scoring engine, badge evaluator, and session management.
 * In production, scoring would be server-side only. This standalone version
 * implements the full scoring logic client-side for demo/local play.
 */

import { IT_SCENES, OT_SCENES, SCORING, BADGE_RULES, BADGES, GAME_VERSION } from './game-data.js';

// ================================================================
// GAME STATE
// ================================================================
class GameEngine {
  constructor() {
    this.state = null;
    this.sessions = JSON.parse(localStorage.getItem('cybershift_sessions') || '[]');
    this.listeners = [];
  }

  // --- State Management ---
  getState() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  notify() {
    this.listeners.forEach(fn => fn(this.state));
  }

  // --- Session Creation ---
  createSession(mission) {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const replayIndex = this.sessions.filter(s => s.mission === mission).length;

    this.state = {
      sessionId,
      mission,
      sceneId: mission === 'IT' ? 'IT-01' : 'OT-01',
      score: 0,
      risk: 0,
      decisionsMade: [],
      criticalErrors: 0,
      hintsUsed: 0,
      evidenceViewed: [],
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      completed: false,
      badges: [],
      sceneHistory: [],
      sequenceSelections: [],
      replayIndex,
      gameVersion: GAME_VERSION.gameVersion,
      analyticsEvents: []
    };

    this.logEvent('GAME_START', { mission });
    this.logEvent('MISSION_START', { mission });
    this.notify();
    return this.state;
  }

  // --- Scene Access ---
  getScenes(mission) {
    return mission === 'IT' ? IT_SCENES : OT_SCENES;
  }

  getCurrentScene() {
    if (!this.state) return null;
    const scenes = this.getScenes(this.state.mission);
    return scenes.find(s => s.id === this.state.sceneId) || null;
  }

  getSceneById(id) {
    const allScenes = [...IT_SCENES, ...OT_SCENES];
    return allScenes.find(s => s.id === id) || null;
  }

  // --- Decision Processing ---
  submitDecision(decisionId) {
    if (!this.state || this.state.completed) return null;

    const scene = this.getCurrentScene();
    if (!scene) return null;

    const decision = scene.decisions.find(d => d.id === decisionId);
    if (!decision) return null;

    // Prevent duplicate decisions for this scene
    if (this.state.decisionsMade.some(d => d.sceneId === scene.id)) return null;

    // Calculate score
    const newScore = this.state.score + decision.points;
    
    // Calculate risk (clamped 0-100)
    const newRisk = Math.max(0, Math.min(100, this.state.risk + decision.riskDelta));

    // Track critical errors
    const criticalErrors = this.state.criticalErrors + (decision.critical ? 1 : 0);

    // Investigation bonus for evidence viewed
    const evidenceBonus = this.state.evidenceViewed.filter(e => e.startsWith(scene.id)).length > 0 ? 10 : 0;

    // Check for badges
    const newBadges = [...this.state.badges];
    if (decision.badges) {
      decision.badges.forEach(badgeId => {
        if (!newBadges.includes(badgeId)) {
          newBadges.push(badgeId);
        }
      });
    }

    // Update state
    this.state = {
      ...this.state,
      score: newScore + evidenceBonus,
      risk: newRisk,
      criticalErrors,
      badges: newBadges,
      decisionsMade: [...this.state.decisionsMade, {
        sceneId: scene.id,
        decisionId: decision.id,
        points: decision.points + evidenceBonus,
        riskDelta: decision.riskDelta,
        correct: decision.correct,
        critical: decision.critical || false,
        timestamp: new Date().toISOString()
      }],
      sceneHistory: [...this.state.sceneHistory, scene.id],
      lastActivityAt: new Date().toISOString()
    };

    this.logEvent('DECISION_SELECTED', {
      sceneId: scene.id,
      decisionId: decision.id,
      resultCode: decision.correct ? 'correct' : 'incorrect'
    });

    if (newBadges.length > this.state.badges.length) {
      decision.badges.forEach(b => {
        this.logEvent('BADGE_UNLOCKED', { badgeId: b });
      });
    }

    this.notify();

    return {
      decision,
      scene,
      newScore: this.state.score,
      newRisk: newRisk,
      pointsChange: decision.points + evidenceBonus,
      riskChange: decision.riskDelta,
      newBadges: decision.badges || [],
      nextScene: decision.nextScene
    };
  }

  // --- Sequence Decision (for IT-08 and OT-07) ---
  submitSequence(selectedOrder) {
    if (!this.state || this.state.completed) return null;

    const scene = this.getCurrentScene();
    if (!scene || !scene.isSequence) return null;

    // Check if order is correct
    const correctOrder = scene.sequenceItems.map(item => item.id);
    const isCorrect = selectedOrder.every((id, idx) => {
      const item = scene.sequenceItems.find(si => si.id === id);
      return item && item.correctOrder === idx + 1;
    });

    // Partial credit: count how many are in correct position
    let correctCount = 0;
    selectedOrder.forEach((id, idx) => {
      const item = scene.sequenceItems.find(si => si.id === id);
      if (item && item.correctOrder === idx + 1) correctCount++;
    });

    const maxPoints = scene.decisions[0].points;
    const ratio = correctCount / scene.sequenceItems.length;
    const points = Math.round(isCorrect ? maxPoints : maxPoints * ratio * 0.7);
    const riskDelta = isCorrect ? scene.decisions[0].riskDelta : Math.round(-scene.decisions[0].riskDelta * (1 - ratio));

    const newScore = this.state.score + points;
    const newRisk = Math.max(0, Math.min(100, this.state.risk + riskDelta));

    this.state = {
      ...this.state,
      score: newScore,
      risk: newRisk,
      decisionsMade: [...this.state.decisionsMade, {
        sceneId: scene.id,
        decisionId: isCorrect ? scene.decisions[0].id : 'sequence-partial',
        points,
        riskDelta,
        correct: isCorrect,
        critical: false,
        sequenceAccuracy: ratio,
        timestamp: new Date().toISOString()
      }],
      sceneHistory: [...this.state.sceneHistory, scene.id],
      lastActivityAt: new Date().toISOString()
    };

    this.logEvent('DECISION_SELECTED', {
      sceneId: scene.id,
      decisionId: 'sequence',
      resultCode: isCorrect ? 'correct' : 'partial',
      accuracy: ratio
    });

    this.notify();

    return {
      isCorrect,
      correctCount,
      total: scene.sequenceItems.length,
      points,
      riskDelta,
      explanation: scene.decisions[0].explanation,
      nextScene: scene.decisions[0].nextScene
    };
  }

  // --- Scene Progression ---
  advanceToScene(sceneId) {
    if (!this.state) return;

    if (sceneId === null) {
      // Mission complete
      this.completeMission();
      return;
    }

    this.state = {
      ...this.state,
      sceneId,
      lastActivityAt: new Date().toISOString()
    };

    this.logEvent('SCENE_START', { sceneId });
    this.notify();
  }

  // --- Evidence Tracking ---
  viewEvidence(sceneId, evidenceId) {
    if (!this.state) return;
    const key = `${sceneId}:${evidenceId}`;
    if (!this.state.evidenceViewed.includes(key)) {
      this.state = {
        ...this.state,
        evidenceViewed: [...this.state.evidenceViewed, key]
      };
      this.logEvent('EVIDENCE_OPENED', { sceneId, evidenceId });
      this.notify();
    }
  }

  // --- Mission Completion ---
  completeMission() {
    if (!this.state || this.state.completed) return null;

    const scoringConfig = SCORING[this.state.mission];
    
    // Investigation bonus
    const investigationBonus = this.state.evidenceViewed.length >= 5 ? scoringConfig.investigationBonus : 0;
    
    // Completion bonus
    const completionBonus = scoringConfig.completionBonus;

    const finalRawScore = this.state.score + investigationBonus + completionBonus;

    // Normalize to 0-1000
    const range = scoringConfig.maxPossibleScore + scoringConfig.completionBonus + scoringConfig.investigationBonus
                  - scoringConfig.minPossibleScore;
    const normalizedScore = Math.round(
      Math.max(0, Math.min(1000,
        ((finalRawScore - scoringConfig.minPossibleScore) / range) * 1000
      ))
    );

    // Evaluate all badges
    const earnedBadges = this.evaluateBadges();

    this.state = {
      ...this.state,
      score: finalRawScore,
      completed: true,
      normalizedScore,
      badges: earnedBadges,
      completedAt: new Date().toISOString()
    };

    this.logEvent('MISSION_COMPLETE', {
      mission: this.state.mission,
      normalizedScore,
      rawScore: finalRawScore,
      criticalErrors: this.state.criticalErrors,
      badges: earnedBadges
    });

    // Save session
    this.saveSession();
    this.notify();

    return {
      normalizedScore,
      rawScore: finalRawScore,
      risk: this.state.risk,
      criticalErrors: this.state.criticalErrors,
      badges: earnedBadges,
      decisions: this.state.decisionsMade,
      evidenceViewed: this.state.evidenceViewed.length,
      mission: this.state.mission
    };
  }

  // --- Badge Evaluation ---
  evaluateBadges() {
    const decisionIds = this.state.decisionsMade.map(d => d.decisionId);
    const missionBadges = this.state.mission === 'IT' ? BADGES.IT : BADGES.OT;
    const earned = [];

    missionBadges.forEach(badge => {
      const rule = BADGE_RULES[badge.id];
      if (!rule) return;

      // Check required events
      const hasRequired = rule.requiredEvents.every(evt => decisionIds.includes(evt));
      
      // Check forbidden events
      const hasForbidden = rule.forbiddenEvents
        ? rule.forbiddenEvents.some(evt => decisionIds.includes(evt))
        : false;

      if (hasRequired && !hasForbidden) {
        earned.push(badge.id);
      }
    });

    return earned;
  }

  // --- Session Persistence ---
  saveSession() {
    if (!this.state) return;
    
    const sessionData = {
      sessionId: this.state.sessionId,
      mission: this.state.mission,
      normalizedScore: this.state.normalizedScore || 0,
      rawScore: this.state.score,
      risk: this.state.risk,
      criticalErrors: this.state.criticalErrors,
      badges: this.state.badges,
      completed: this.state.completed,
      startedAt: this.state.startedAt,
      completedAt: this.state.completedAt || null,
      replayIndex: this.state.replayIndex,
      displayName: localStorage.getItem('cybershift_displayName') || 'Player',
      teamName: localStorage.getItem('cybershift_teamName') || 'Default'
    };

    this.sessions.push(sessionData);
    localStorage.setItem('cybershift_sessions', JSON.stringify(this.sessions));
  }

  // --- Leaderboard ---
  getLeaderboard(period = 'campaign', scope = 'individual') {
    const allSessions = this.sessions.filter(s => s.completed);
    
    if (scope === 'individual') {
      // Group by displayName, take best 3, average
      const byPlayer = {};
      allSessions.forEach(s => {
        const name = s.displayName || 'Player';
        if (!byPlayer[name]) byPlayer[name] = [];
        byPlayer[name].push(s);
      });

      const leaderboard = Object.entries(byPlayer).map(([name, sessions]) => {
        const sorted = sessions.sort((a, b) => b.normalizedScore - a.normalizedScore);
        const best3 = sorted.slice(0, 3);
        const avgScore = Math.round(best3.reduce((sum, s) => sum + s.normalizedScore, 0) / best3.length);
        const totalCritical = sessions.reduce((sum, s) => sum + (s.criticalErrors || 0), 0);
        const totalBadges = [...new Set(sessions.flatMap(s => s.badges || []))].length;
        
        return {
          name,
          avgScore,
          gamesPlayed: sessions.length,
          criticalErrors: totalCritical,
          badges: totalBadges,
          bestScore: sorted[0]?.normalizedScore || 0
        };
      });

      // Sort: higher score → fewer critical errors → earlier completion
      leaderboard.sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        if (a.criticalErrors !== b.criticalErrors) return a.criticalErrors - b.criticalErrors;
        return b.badges - a.badges;
      });

      return leaderboard;
    }

    // Team scope
    const byTeam = {};
    allSessions.forEach(s => {
      const team = s.teamName || 'Default';
      if (!byTeam[team]) byTeam[team] = [];
      byTeam[team].push(s);
    });

    const teamLeaderboard = Object.entries(byTeam).map(([team, sessions]) => {
      const avgScore = Math.round(sessions.reduce((sum, s) => sum + s.normalizedScore, 0) / sessions.length);
      return {
        name: team,
        avgScore,
        participants: [...new Set(sessions.map(s => s.displayName))].length,
        gamesPlayed: sessions.length
      };
    });

    teamLeaderboard.sort((a, b) => b.avgScore - a.avgScore);
    return teamLeaderboard;
  }

  // --- Analytics ---
  logEvent(eventType, metadata = {}) {
    if (!this.state) return;
    
    const event = {
      sessionId: this.state.sessionId,
      eventType,
      mission: this.state.mission,
      sceneId: this.state.sceneId,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.state.analyticsEvents.push(event);
  }

  getAnalyticsSummary() {
    const allSessions = this.sessions.filter(s => s.completed);
    
    return {
      totalParticipants: [...new Set(allSessions.map(s => s.displayName))].length,
      itCompletions: allSessions.filter(s => s.mission === 'IT').length,
      otCompletions: allSessions.filter(s => s.mission === 'OT').length,
      avgNormalizedScore: allSessions.length > 0
        ? Math.round(allSessions.reduce((sum, s) => sum + s.normalizedScore, 0) / allSessions.length)
        : 0,
      criticalAccuracy: allSessions.length > 0
        ? Math.round((1 - allSessions.reduce((sum, s) => sum + s.criticalErrors, 0) / (allSessions.length * 6)) * 100)
        : 0,
      totalBadgesEarned: allSessions.reduce((sum, s) => sum + (s.badges?.length || 0), 0),
      replayRate: allSessions.length > 0
        ? Math.round(allSessions.filter(s => s.replayIndex > 0).length / allSessions.length * 100)
        : 0,
    };
  }

  // --- Risk Level ---
  getRiskLevel(risk) {
    if (risk === undefined) risk = this.state?.risk || 0;
    if (risk >= 75) return { level: 'critical', label: 'CRITICAL', class: 'risk-critical' };
    if (risk >= 50) return { level: 'severe', label: 'SEVERE', class: 'risk-severe' };
    if (risk >= 25) return { level: 'elevated', label: 'ELEVATED', class: 'risk-elevated' };
    if (risk > 0) return { level: 'caution', label: 'CAUTION', class: 'risk-caution' };
    return { level: 'stable', label: 'STABLE', class: '' };
  }

  // --- Player Profile ---
  setPlayerInfo(displayName, teamName) {
    localStorage.setItem('cybershift_displayName', displayName);
    localStorage.setItem('cybershift_teamName', teamName);
  }

  getPlayerInfo() {
    return {
      displayName: localStorage.getItem('cybershift_displayName') || '',
      teamName: localStorage.getItem('cybershift_teamName') || ''
    };
  }

  // --- Export (admin) ---
  exportData(format = 'json') {
    const data = {
      sessions: this.sessions,
      exportedAt: new Date().toISOString(),
      gameVersion: GAME_VERSION
    };

    if (format === 'csv') {
      const headers = ['sessionId', 'mission', 'displayName', 'teamName', 'normalizedScore', 'rawScore', 'risk', 'criticalErrors', 'badges', 'completed', 'startedAt', 'completedAt'];
      const rows = this.sessions.map(s =>
        headers.map(h => {
          const val = s[h];
          if (Array.isArray(val)) return val.join(';');
          return val ?? '';
        }).join(',')
      );
      return headers.join(',') + '\n' + rows.join('\n');
    }

    return JSON.stringify(data, null, 2);
  }
}

// Singleton instance
export const engine = new GameEngine();
