/**
 * CYBER SHIFT — Main Application Controller
 * Event handling, screen routing, and game flow orchestration.
 * Follows the core game loop from Section 9.
 */

import { engine } from './engine.js';
import { render, renderConsequenceOverlay } from './renderer.js';
import { Animations } from './animations.js';
import { BADGES } from './game-data.js';

// ================================================================
// APPLICATION STATE
// ================================================================
let currentScreen = 'landing';
let pendingResult = null;
let sequenceSelections = [];
let audioEnabled = false;

// ================================================================
// SCREEN NAVIGATION
// ================================================================
function navigateTo(screen, data = {}) {
  currentScreen = screen;
  render(screen, data);
  bindEvents();
}

// ================================================================
// INITIALIZATION
// ================================================================
function init() {
  navigateTo('landing');
}

// ================================================================
// EVENT BINDING
// ================================================================
function bindEvents() {
  // Use event delegation on #app
  const app = document.getElementById('app');
  if (!app) return;

  // Remove old listener to prevent stacking
  app.removeEventListener('click', handleClick);
  app.addEventListener('click', handleClick);

  // Keyboard support for mission cards and sequence items
  app.removeEventListener('keydown', handleKeydown);
  app.addEventListener('keydown', handleKeydown);

  // Focus styling for inputs
  const inputs = app.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.style.borderColor = 'rgba(6, 214, 160, 0.4)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '';
    });
  });
}

// ================================================================
// CLICK HANDLER
// ================================================================
function handleClick(e) {
  const target = e.target.closest('[id], [data-decision-id], [data-evidence-id], [data-seq-id]');
  if (!target) return;

  const id = target.id;

  // --- Landing ---
  if (id === 'btn-start-game') {
    navigateTo('player-setup');
    return;
  }
  if (id === 'btn-how-to-play') {
    navigateTo('how-to-play');
    return;
  }
  if (id === 'btn-back-landing' || id === 'btn-back-landing-ms' || id === 'btn-back-landing-lb' || id === 'btn-back-landing-err' || id === 'btn-back-menu') {
    navigateTo('landing');
    return;
  }
  if (id === 'btn-leaderboard' || id === 'btn-leaderboard-ms' || id === 'btn-leaderboard-result') {
    navigateTo('leaderboard');
    return;
  }

  // --- Player Setup ---
  if (id === 'btn-confirm-player') {
    const nameInput = document.getElementById('input-name');
    const teamInput = document.getElementById('input-team');
    const name = nameInput?.value?.trim() || 'Player';
    const team = teamInput?.value?.trim() || 'Default';
    engine.setPlayerInfo(name, team);
    navigateTo('mission-select');
    return;
  }
  if (id === 'btn-skip-setup') {
    engine.setPlayerInfo('Guest', 'Default');
    navigateTo('mission-select');
    return;
  }

  // --- Mission Select ---
  if (id === 'btn-mission-it') {
    navigateTo('mission-intro', { mission: 'IT' });
    return;
  }
  if (id === 'btn-mission-ot') {
    navigateTo('mission-intro', { mission: 'OT' });
    return;
  }

  // --- Mission Intro ---
  if (id === 'btn-start-mission') {
    const mission = target.dataset.mission;
    engine.createSession(mission);
    renderCurrentScene();
    return;
  }
  if (id === 'btn-back-select') {
    navigateTo('mission-select');
    return;
  }

  // --- Evidence ---
  if (target.dataset.evidenceId) {
    handleEvidenceClick(target.dataset.sceneId, target.dataset.evidenceId);
    return;
  }

  // --- Evidence close ---
  if (id === 'btn-close-evidence') {
    const overlay = document.querySelector('.evidence-reveal__overlay');
    const reveal = document.querySelector('.evidence-reveal');
    if (overlay) overlay.remove();
    if (reveal) reveal.remove();
    return;
  }

  // --- Decision ---
  if (target.dataset.decisionId) {
    handleDecision(target.dataset.decisionId);
    return;
  }

  // --- Sequence items ---
  if (target.closest('[data-seq-id]')) {
    const seqItem = target.closest('[data-seq-id]');
    handleSequenceClick(seqItem.dataset.seqId);
    return;
  }

  // --- Submit Sequence ---
  if (id === 'btn-submit-sequence') {
    handleSequenceSubmit();
    return;
  }

  // --- Next Scene ---
  if (id === 'btn-next-scene') {
    handleNextScene();
    return;
  }

  // --- Replay ---
  if (id === 'btn-replay') {
    const mission = target.dataset.mission;
    engine.createSession(mission);
    renderCurrentScene();
    return;
  }

  // --- Continue to OT ---
  if (id === 'btn-continue-ot') {
    navigateTo('mission-intro', { mission: 'OT' });
    return;
  }

  // --- Audio toggle ---
  if (id === 'btn-audio') {
    audioEnabled = !audioEnabled;
    target.textContent = audioEnabled ? '🔊' : '🔇';
    target.setAttribute('aria-label', `Toggle audio (currently ${audioEnabled ? 'on' : 'muted'})`);
    return;
  }

  // --- Export ---
  if (id === 'btn-export-data') {
    handleExport();
    return;
  }
}

// ================================================================
// KEYBOARD HANDLER
// ================================================================
function handleKeydown(e) {
  const target = e.target;

  // Enter/Space on mission cards
  if ((e.key === 'Enter' || e.key === ' ') && target.classList.contains('card--mission')) {
    e.preventDefault();
    target.click();
  }

  // Enter/Space on sequence items
  if ((e.key === 'Enter' || e.key === ' ') && target.closest('[data-seq-id]')) {
    e.preventDefault();
    target.click();
  }

  // Keyboard shortcuts for decisions (1-4)
  if (['1', '2', '3', '4'].includes(e.key)) {
    const decisionBtns = document.querySelectorAll('.decision-btn');
    const idx = parseInt(e.key) - 1;
    if (decisionBtns[idx] && !decisionBtns[idx].disabled) {
      decisionBtns[idx].click();
    }
  }
}

// ================================================================
// SCENE RENDERING
// ================================================================
function renderCurrentScene() {
  const state = engine.getState();
  const scene = engine.getCurrentScene();
  
  if (!scene || !state) {
    navigateTo('error', { title: 'Scene Error', desc: 'Could not load the current scene.' });
    return;
  }

  sequenceSelections = [];
  render('scene', { scene, state });
  bindEvents();

  engine.logEvent('SCENE_START', { sceneId: scene.id });
}

// ================================================================
// EVIDENCE HANDLER
// ================================================================
function handleEvidenceClick(sceneId, evidenceId) {
  const scene = engine.getCurrentScene();
  if (!scene) return;

  const evidence = scene.evidence.find(e => e.id === evidenceId);
  if (!evidence) return;

  // Mark as viewed
  engine.viewEvidence(sceneId, evidenceId);

  // Update the evidence item style
  const evidenceBtn = document.querySelector(`[data-evidence-id="${evidenceId}"]`);
  if (evidenceBtn) {
    evidenceBtn.classList.add('evidence-item--viewed');
  }

  // Show evidence reveal modal
  const overlay = document.createElement('div');
  overlay.className = 'evidence-reveal__overlay';
  overlay.id = 'evidence-overlay';
  overlay.addEventListener('click', () => {
    overlay.remove();
    reveal.remove();
  });

  const reveal = document.createElement('div');
  reveal.className = 'evidence-reveal';
  reveal.setAttribute('role', 'dialog');
  reveal.setAttribute('aria-label', `Evidence: ${evidence.label}`);
  reveal.innerHTML = `
    <div class="evidence-reveal__severity evidence-reveal__severity--${evidence.severity}">${evidence.severity}</div>
    <div class="evidence-reveal__label">${evidence.label}</div>
    <div class="evidence-reveal__text">${evidence.revealText}</div>
    <button class="btn btn--secondary btn--full" id="btn-close-evidence" aria-label="Close evidence">
      Close
    </button>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(reveal);

  // Focus the close button for keyboard users
  const closeBtn = reveal.querySelector('#btn-close-evidence');
  if (closeBtn) closeBtn.focus();

  engine.logEvent('EVIDENCE_OPENED', { sceneId, evidenceId });
}

// ================================================================
// DECISION HANDLER
// ================================================================
function handleDecision(decisionId) {
  const result = engine.submitDecision(decisionId);
  if (!result) return;

  // Disable all decision buttons
  document.querySelectorAll('.decision-btn').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'default';
  });

  // Highlight the chosen decision
  const chosenBtn = document.querySelector(`[data-decision-id="${decisionId}"]`);
  if (chosenBtn) {
    chosenBtn.style.opacity = '1';
    chosenBtn.style.borderColor = result.decision.correct 
      ? 'rgba(16, 185, 129, 0.5)' 
      : 'rgba(239, 68, 68, 0.5)';
  }

  // Show score popup animation
  Animations.showScorePopup(result.pointsChange);

  // Update HUD score and risk
  const hudScore = document.getElementById('hud-score');
  const hudRisk = document.getElementById('hud-risk');
  const riskFill = document.getElementById('risk-fill');

  if (hudScore) {
    const oldScore = parseInt(hudScore.textContent) || 0;
    Animations.animateCounter(hudScore, oldScore, result.newScore);
  }
  if (hudRisk) {
    const oldRisk = parseInt(hudRisk.textContent) || 0;
    Animations.animateCounter(hudRisk, oldRisk, result.newRisk);
    const riskInfo = engine.getRiskLevel(result.newRisk);
    hudRisk.className = `hud__stat-value hud__stat-value--risk ${riskInfo.class}`;
  }
  if (riskFill) {
    Animations.animateRiskMeter(riskFill, parseFloat(riskFill.style.width) || 0, result.newRisk);
    const riskInfo = engine.getRiskLevel(result.newRisk);
    riskFill.className = `risk-meter__fill ${riskInfo.class}`;
  }

  // Show badge notifications
  if (result.newBadges && result.newBadges.length > 0) {
    result.newBadges.forEach((badgeId, i) => {
      const allBadges = [...BADGES.IT, ...BADGES.OT];
      const badge = allBadges.find(b => b.id === badgeId);
      if (badge) {
        setTimeout(() => {
          Animations.showBadgeUnlock(badge.name, badge.icon);
        }, 800 + i * 500);
      }
    });
  }

  // Store result for next-scene navigation
  pendingResult = result;

  // Show consequence panel
  const sceneContainer = document.getElementById('scene-container');
  if (sceneContainer) {
    const consequenceHTML = renderConsequenceOverlay(result);
    const consequenceDiv = document.createElement('div');
    consequenceDiv.innerHTML = consequenceHTML;
    sceneContainer.appendChild(consequenceDiv.firstElementChild);
    
    // Scroll to consequence
    const consequence = sceneContainer.querySelector('.consequence');
    if (consequence) {
      consequence.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Rebind events for the new button
    bindEvents();
  }

  engine.logEvent('CONSEQUENCE_SHOWN', { sceneId: result.scene.id, decisionId: result.decision.id });
}

// ================================================================
// SEQUENCE HANDLER
// ================================================================
function handleSequenceClick(seqId) {
  // Toggle selection
  const idx = sequenceSelections.indexOf(seqId);
  if (idx >= 0) {
    // Remove this and all after it
    sequenceSelections = sequenceSelections.slice(0, idx);
  } else {
    sequenceSelections.push(seqId);
  }

  // Update visual
  document.querySelectorAll('.sequence-item').forEach(item => {
    const itemId = item.dataset.seqId;
    const selIdx = sequenceSelections.indexOf(itemId);
    if (selIdx >= 0) {
      item.classList.add('sequence-item--selected');
      item.querySelector('.sequence-item__number').textContent = selIdx + 1;
    } else {
      item.classList.remove('sequence-item--selected');
      item.querySelector('.sequence-item__number').textContent = '—';
    }
  });

  // Enable submit when all items selected
  const submitBtn = document.getElementById('btn-submit-sequence');
  const scene = engine.getCurrentScene();
  if (submitBtn && scene) {
    const allSelected = sequenceSelections.length === scene.sequenceItems.length;
    submitBtn.disabled = !allSelected;
  }
}

function handleSequenceSubmit() {
  const result = engine.submitSequence(sequenceSelections);
  if (!result) return;

  // Show score popup
  Animations.showScorePopup(result.points);

  // Update HUD
  const state = engine.getState();
  const hudScore = document.getElementById('hud-score');
  const hudRisk = document.getElementById('hud-risk');
  const riskFill = document.getElementById('risk-fill');

  if (hudScore && state) {
    Animations.animateCounter(hudScore, state.score - result.points, state.score);
  }
  if (hudRisk && state) {
    const riskInfo = engine.getRiskLevel(state.risk);
    hudRisk.className = `hud__stat-value hud__stat-value--risk ${riskInfo.class}`;
    Animations.animateCounter(hudRisk, state.risk - result.riskDelta, state.risk);
  }
  if (riskFill && state) {
    const riskInfo = engine.getRiskLevel(state.risk);
    riskFill.className = `risk-meter__fill ${riskInfo.class}`;
    Animations.animateRiskMeter(riskFill, state.risk - result.riskDelta, state.risk);
  }

  // Disable sequence
  document.querySelectorAll('.sequence-item').forEach(item => {
    item.style.pointerEvents = 'none';
    item.style.opacity = '0.7';
  });
  const submitBtn = document.getElementById('btn-submit-sequence');
  if (submitBtn) submitBtn.style.display = 'none';

  // Store result
  pendingResult = result;

  // Show consequence
  const sceneContainer = document.getElementById('scene-container');
  if (sceneContainer) {
    const consequenceHTML = renderConsequenceOverlay(result);
    const consequenceDiv = document.createElement('div');
    consequenceDiv.innerHTML = consequenceHTML;
    sceneContainer.appendChild(consequenceDiv.firstElementChild);

    const consequence = sceneContainer.querySelector('.consequence');
    if (consequence) {
      consequence.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    bindEvents();
  }
}

// ================================================================
// NEXT SCENE HANDLER
// ================================================================
function handleNextScene() {
  if (!pendingResult) return;

  const nextScene = pendingResult.nextScene || pendingResult.decision?.nextScene;

  if (nextScene === null || nextScene === undefined) {
    // Mission complete
    const completionResult = engine.completeMission();
    if (completionResult) {
      navigateTo('result', completionResult);
    } else {
      navigateTo('error', { title: 'Completion Error', desc: 'Could not calculate final results.' });
    }
  } else {
    engine.advanceToScene(nextScene);
    renderCurrentScene();
  }

  pendingResult = null;
}

// ================================================================
// EXPORT HANDLER
// ================================================================
function handleExport() {
  const csvData = engine.exportData('csv');
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cyber-shift-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  Animations.showNotification('Data exported successfully!');
}

// ================================================================
// START
// ================================================================
document.addEventListener('DOMContentLoaded', init);
