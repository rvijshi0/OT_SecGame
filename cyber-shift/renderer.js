/**
 * CYBER SHIFT — Renderer
 * Builds all UI screens from game state.
 * Follows Section 10 UI specification and Section 69 player experience.
 */

import { BADGES, DEBRIEF_ITEMS, GAME_VERSION } from './game-data.js';
import { Characters, SceneCharacters, ShieldLogo, Animations, injectCharacterStyles } from './animations.js';
import { engine } from './engine.js';

// ================================================================
// MAIN RENDER DISPATCHER
// ================================================================
export function render(screen, data = {}) {
  const app = document.getElementById('app');
  
  // Inject character animation styles once
  injectCharacterStyles();

  switch (screen) {
    case 'landing':
      app.innerHTML = renderLanding();
      break;
    case 'how-to-play':
      app.innerHTML = renderHowToPlay();
      break;
    case 'player-setup':
      app.innerHTML = renderPlayerSetup(data);
      break;
    case 'mission-select':
      app.innerHTML = renderMissionSelect();
      break;
    case 'mission-intro':
      app.innerHTML = renderMissionIntro(data.mission);
      break;
    case 'scene':
      app.innerHTML = renderScene(data.scene, data.state);
      break;
    case 'consequence':
      app.innerHTML = renderConsequence(data);
      break;
    case 'result':
      app.innerHTML = renderResult(data);
      break;
    case 'leaderboard':
      app.innerHTML = renderLeaderboard();
      break;
    case 'error':
      app.innerHTML = renderError(data);
      break;
    default:
      app.innerHTML = renderLanding();
  }

  // Always add background effects
  addBackgroundEffects();
  
  // Scroll to top on screen change
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addBackgroundEffects() {
  if (!document.querySelector('.bg-grid')) {
    const grid = document.createElement('div');
    grid.className = 'bg-grid';
    document.body.appendChild(grid);
  }
  if (!document.querySelector('.bg-glow--cyan')) {
    const glow1 = document.createElement('div');
    glow1.className = 'bg-glow bg-glow--cyan';
    document.body.appendChild(glow1);
    const glow2 = document.createElement('div');
    glow2.className = 'bg-glow bg-glow--purple';
    document.body.appendChild(glow2);
  }
}

// ================================================================
// LANDING PAGE
// ================================================================
function renderLanding() {
  return `
    <div class="landing scene-enter" id="landing-screen">
      <div class="landing__logo" aria-hidden="true">
        ${ShieldLogo}
      </div>
      <h1 class="landing__title">CYBER SHIFT</h1>
      <p class="landing__tagline">
        Your workday looks normal.<br/>
        Then <strong>one message</strong> changes the situation.<br/><br/>
        Make the right calls.<br/>
        Protect the business. Protect the plant.
      </p>
      <div class="landing__cta-group">
        <button class="btn btn--primary btn--lg" id="btn-start-game" aria-label="Start the game">
          ▶ START GAME
        </button>
        <button class="btn btn--secondary" id="btn-how-to-play" aria-label="Learn how to play">
          How to Play
        </button>
        <button class="btn btn--ghost" id="btn-leaderboard" aria-label="View leaderboard">
          🏆 Leaderboard
        </button>
      </div>
      <div class="landing__version" aria-label="Game version">
        v${GAME_VERSION.gameVersion} · Build ${GAME_VERSION.buildVersion}
      </div>
      <div class="privacy-notice" role="note">
        🔒 This game collects only your display name, team, scores, and decisions for campaign measurement. 
        No keystroke logging, clipboard capture, or personal data beyond what you provide.
      </div>
    </div>
  `;
}

// ================================================================
// HOW TO PLAY
// ================================================================
function renderHowToPlay() {
  return `
    <div class="how-to-play scene-enter" id="how-to-play-screen">
      <h1 class="how-to-play__title">How to Play</h1>
      <div class="how-to-play__steps">
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">1</div>
          <h2 class="how-to-play__step-title">Read the Situation</h2>
          <p class="how-to-play__step-desc">Each scene presents a realistic workplace scenario. Read carefully — details matter.</p>
        </div>
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">2</div>
          <h2 class="how-to-play__step-title">Investigate Evidence</h2>
          <p class="how-to-play__step-desc">Click on evidence items to inspect clues. The more you investigate, the better your decision.</p>
        </div>
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">3</div>
          <h2 class="how-to-play__step-title">Make Your Decision</h2>
          <p class="how-to-play__step-desc">Choose the safest action. Your score and risk level update based on each decision.</p>
        </div>
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">4</div>
          <h2 class="how-to-play__step-title">Learn & Earn Badges</h2>
          <p class="how-to-play__step-desc">Every decision comes with an explanation. Earn badges for consistently safe choices.</p>
        </div>
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">5</div>
          <h2 class="how-to-play__step-title">Complete Both Missions</h2>
          <p class="how-to-play__step-desc">Play Mission 1 (IT Security) and Mission 2 (OT Security) for the full experience.</p>
        </div>
        <div class="how-to-play__step">
          <div class="how-to-play__step-num">6</div>
          <h2 class="how-to-play__step-title">Replay for a Better Score</h2>
          <p class="how-to-play__step-desc">Replay to improve your score and earn any missed badges. Details may change on replay.</p>
        </div>
      </div>
      <button class="btn btn--primary" id="btn-back-landing" aria-label="Back to main menu">
        ← Back to Menu
      </button>
    </div>
  `;
}

// ================================================================
// PLAYER SETUP
// ================================================================
function renderPlayerSetup(data = {}) {
  const playerInfo = engine.getPlayerInfo();
  return `
    <div class="landing scene-enter" id="player-setup-screen">
      <div class="landing__logo" aria-hidden="true">${ShieldLogo}</div>
      <h1 class="landing__title" style="font-size: var(--font-size-3xl)">Player Setup</h1>
      <p class="landing__tagline">Enter your details to join the campaign leaderboard.</p>
      <div style="max-width: 380px; width: 100%; display: flex; flex-direction: column; gap: var(--space-md);">
        <div>
          <label for="input-name" style="display: block; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-xs);">Display Name</label>
          <input type="text" id="input-name" value="${playerInfo.displayName}" placeholder="Your name" maxlength="50"
            style="width: 100%; padding: 12px 16px; background: var(--bg-card); border: var(--border-subtle); border-radius: var(--border-radius-sm); color: var(--text-primary); font-family: var(--font-main); font-size: var(--font-size-base); outline: none;"
            aria-label="Your display name" />
        </div>
        <div>
          <label for="input-team" style="display: block; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-xs);">Team Name</label>
          <input type="text" id="input-team" value="${playerInfo.teamName}" placeholder="Your team" maxlength="50"
            style="width: 100%; padding: 12px 16px; background: var(--bg-card); border: var(--border-subtle); border-radius: var(--border-radius-sm); color: var(--text-primary); font-family: var(--font-main); font-size: var(--font-size-base); outline: none;"
            aria-label="Your team name" />
        </div>
        <button class="btn btn--primary btn--full" id="btn-confirm-player" aria-label="Continue to mission select" style="margin-top: var(--space-md);">
          Continue →
        </button>
        <button class="btn btn--ghost btn--full" id="btn-skip-setup" aria-label="Skip setup">
          Skip — Play as Guest
        </button>
      </div>
    </div>
  `;
}

// ================================================================
// MISSION SELECT
// ================================================================
function renderMissionSelect() {
  const sessions = JSON.parse(localStorage.getItem('cybershift_sessions') || '[]');
  const itCompleted = sessions.some(s => s.mission === 'IT' && s.completed);
  const otCompleted = sessions.some(s => s.mission === 'OT' && s.completed);
  const itBestScore = Math.max(0, ...sessions.filter(s => s.mission === 'IT' && s.completed).map(s => s.normalizedScore));
  const otBestScore = Math.max(0, ...sessions.filter(s => s.mission === 'OT' && s.completed).map(s => s.normalizedScore));

  return `
    <div class="mission-select scene-enter" id="mission-select-screen">
      <h1 class="mission-select__title">Choose Your Mission</h1>
      <p class="mission-select__sub">Play both missions for the full cybersecurity experience.</p>
      <div class="mission-select__grid">
        <div class="card card--mission" id="btn-mission-it" tabindex="0" role="button" aria-label="Start IT Mission: The Last 15 Minutes">
          <div class="card__icon">🖥️</div>
          <div class="card__label">Mission 1</div>
          <h2 class="card__title">THE LAST 15 MINUTES</h2>
          <p class="card__subtitle">Enterprise IT Security</p>
          <p class="card__desc">Navigate BEC attacks, MFA abuse, AI data risks, deepfakes, and incident response in a realistic office environment.</p>
          ${itCompleted ? `<div style="margin-top: var(--space-md); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--accent-cyan);">✓ Completed · Best: ${itBestScore}/1000</div>` : ''}
          <div style="margin-top: var(--space-md); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--text-muted);">⏱ 8–10 min</div>
        </div>
        <div class="card card--mission" id="btn-mission-ot" tabindex="0" role="button" aria-label="Start OT Mission: Line Down">
          <div class="card__icon">🏭</div>
          <div class="card__label">Mission 2</div>
          <h2 class="card__title">LINE DOWN</h2>
          <p class="card__subtitle">OT Security</p>
          <p class="card__desc">Handle vendor access, unknown USB, IT/OT convergence, HMI anomalies, and safety-first decisions on the plant floor.</p>
          ${otCompleted ? `<div style="margin-top: var(--space-md); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--accent-cyan);">✓ Completed · Best: ${otBestScore}/1000</div>` : ''}
          <div style="margin-top: var(--space-md); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--text-muted);">⏱ 8–10 min</div>
        </div>
      </div>
      <div style="margin-top: var(--space-2xl); display: flex; gap: var(--space-md);">
        <button class="btn btn--ghost" id="btn-back-landing-ms" aria-label="Back to main menu">← Back</button>
        <button class="btn btn--ghost" id="btn-leaderboard-ms" aria-label="View leaderboard">🏆 Leaderboard</button>
      </div>
    </div>
  `;
}

// ================================================================
// MISSION INTRO
// ================================================================
function renderMissionIntro(mission) {
  const isIT = mission === 'IT';
  return `
    <div class="intro scene-enter" id="mission-intro-screen">
      <div class="intro__mission-label">${isIT ? 'Mission 1' : 'Mission 2'}</div>
      <h1 class="intro__title">${isIT ? 'THE LAST 15 MINUTES' : 'LINE DOWN'}</h1>
      <p class="intro__subtitle">${isIT 
        ? 'Complete your ordinary workday — while encountering realistic impersonation, MFA abuse, AI data risks, and incident reporting decisions.'
        : 'Normal production turns critical. Handle vendor access, removable media, IT/OT convergence, HMI anomalies, and safety-first decisions.'
      }</p>
      <div class="intro__objectives">
        <div class="intro__objectives-title">Learning Objectives</div>
        ${isIT ? `
          <div class="intro__objective">Verify high-impact requests through known channels</div>
          <div class="intro__objective">Recognize MFA abuse patterns</div>
          <div class="intro__objective">Avoid uploading sensitive data to unapproved AI tools</div>
          <div class="intro__objective">Recognize that voice/video is not proof of identity</div>
          <div class="intro__objective">Report suspected incidents immediately</div>
          <div class="intro__objective">Avoid acting solely because a request is urgent</div>
        ` : `
          <div class="intro__objective">Verify vendor identity and authorization</div>
          <div class="intro__objective">Follow removable-media procedures</div>
          <div class="intro__objective">Understand IT/OT convergence risks</div>
          <div class="intro__objective">Follow approved remote-access controls</div>
          <div class="intro__objective">Escalate rather than improvise</div>
          <div class="intro__objective">Put safety before production pressure</div>
        `}
      </div>
      <button class="btn btn--primary btn--lg" id="btn-start-mission" data-mission="${mission}" aria-label="Begin ${isIT ? 'IT' : 'OT'} mission">
        ▶ BEGIN ${isIT ? 'IT' : 'OT'} MISSION
      </button>
      <button class="btn btn--ghost" id="btn-back-select" style="margin-top: var(--space-md);" aria-label="Back to mission select">
        ← Back to Mission Select
      </button>
    </div>
  `;
}

// ================================================================
// GAME SCENE
// ================================================================
function renderScene(scene, state) {
  if (!scene || !state) return renderError({ title: 'Scene Error', desc: 'Could not load scene data.' });

  const riskInfo = engine.getRiskLevel(state.risk);
  const charInfo = SceneCharacters[scene.id] || { char: 'employee', state: 'idle' };
  const charSvg = Characters[charInfo.char] ? Characters[charInfo.char](charInfo.state) : Characters.employee('idle');

  return `
    <!-- HUD -->
    <header class="hud" role="banner">
      <div class="hud__brand">
        <span class="hud__logo-text">CYBER SHIFT</span>
        <span class="hud__mission-tag">${state.mission === 'IT' ? 'IT Mission' : 'OT Mission'}</span>
      </div>
      <div class="hud__stats" aria-live="polite">
        <div class="hud__stat">
          <span class="hud__stat-label">Score</span>
          <span class="hud__stat-value hud__stat-value--score" id="hud-score">${state.score}</span>
        </div>
        <div class="hud__stat">
          <span class="hud__stat-label">Risk</span>
          <span class="hud__stat-value hud__stat-value--risk ${riskInfo.class}" id="hud-risk">${state.risk}</span>
          <div class="risk-meter" role="meter" aria-label="Risk level: ${riskInfo.label}" aria-valuenow="${state.risk}" aria-valuemin="0" aria-valuemax="100">
            <div class="risk-meter__fill ${riskInfo.class}" id="risk-fill" style="width: ${state.risk}%"></div>
          </div>
        </div>
        <div class="hud__stat">
          <span class="hud__stat-label">Scene</span>
          <span class="hud__stat-value" style="font-size: var(--font-size-sm);">${scene.id}</span>
        </div>
      </div>
      <div class="hud__controls">
        <button class="audio-toggle" id="btn-audio" aria-label="Toggle audio (currently muted)" title="Audio">
          🔇
        </button>
      </div>
    </header>

    <!-- Scene Content -->
    <main class="scene scene-enter" id="scene-container" role="main">
      <div class="scene__header">
        <div class="scene__location">${scene.location}</div>
        <h1 class="scene__title" id="scene-title">${scene.title}</h1>
        <p class="scene__subtitle">${scene.subtitle || ''}</p>
      </div>

      <!-- Environment Panel -->
      <div class="env-panel" aria-label="Scene visualization">
        <div class="${scene.environment === 'plant' ? 'env-plant' : 'env-office'}">
          ${scene.environment === 'plant' ? `
            <div class="env-plant__conveyor"></div>
            <div class="env-plant__hmi"></div>
          ` : `
            <div class="env-office__desk"></div>
            <div class="env-office__monitor"></div>
          `}
        </div>
        <div class="env-panel__scene">
          <div class="character-container" aria-hidden="true">
            ${charSvg}
          </div>
          <div style="flex: 1;">
            ${renderSceneVisual(scene)}
          </div>
        </div>
      </div>

      <!-- Dialogue -->
      <div class="dialogue-panel" aria-label="Scene dialogue">
        ${scene.dialogue ? scene.dialogue.map(d => `
          <div style="margin-bottom: var(--space-md);">
            <div class="dialogue__speaker">${d.speaker}</div>
            <div class="${d.speaker === 'Narration' ? 'dialogue__narration' : 'dialogue__text'}">${d.text}</div>
          </div>
        `).join('') : `<div class="dialogue__text">${scene.narration}</div>`}
      </div>

      <!-- Evidence -->
      ${scene.evidence && scene.evidence.length > 0 ? `
        <div class="evidence-panel" aria-label="Evidence items to investigate">
          <div class="evidence-panel__title">Investigate Evidence</div>
          <div class="evidence-items">
            ${scene.evidence.map(ev => {
              const viewed = state.evidenceViewed?.includes(`${scene.id}:${ev.id}`);
              return `
                <button class="evidence-item ${viewed ? 'evidence-item--viewed' : ''}" 
                        data-evidence-id="${ev.id}" 
                        data-scene-id="${scene.id}"
                        aria-label="Investigate: ${ev.label}${viewed ? ' (viewed)' : ''}">
                  ${ev.label}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Sequence Panel (for IT-08, OT-07) -->
      ${scene.isSequence ? renderSequencePanel(scene) : ''}

      <!-- Decision Controls -->
      ${!scene.isSequence ? `
        <div class="decisions" aria-label="Available actions">
          <div class="decisions__title">Choose Your Action</div>
          <div class="decision-grid">
            ${scene.decisions.map(d => `
              <button class="decision-btn" data-decision-id="${d.id}" id="decision-${d.id}" 
                      aria-label="Option ${d.label}: ${d.text}">
                <div class="decision-btn__label">Option ${d.label}</div>
                <div class="decision-btn__text">${d.text}</div>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </main>
  `;
}

// ================================================================
// SCENE-SPECIFIC VISUALS
// ================================================================
function renderSceneVisual(scene) {
  switch (scene.visualType) {
    case 'email-urgent':
      return `
        <div class="mock-email" role="article" aria-label="Suspicious email">
          <div class="mock-email__header">
            <div class="mock-email__field">
              <span class="mock-email__field-label">From:</span>
              <span class="mock-email__field-value">${scene.email.from} <span class="mock-email__flag">${scene.email.fromFlag}</span></span>
            </div>
            <div class="mock-email__field">
              <span class="mock-email__field-label">Subject:</span>
              <span class="mock-email__field-value" style="font-weight: 600;">${scene.email.subject}</span>
            </div>
            <div class="mock-email__field">
              <span class="mock-email__field-label">Reply-To:</span>
              <span class="mock-email__field-value" style="color: var(--accent-amber);">${scene.email.replyTo}</span>
            </div>
          </div>
          <div class="mock-email__body">${scene.email.body.replace(/\n/g, '<br/>')}</div>
        </div>
      `;

    case 'mfa-storm':
      return `
        <div style="display: flex; flex-direction: column; gap: var(--space-sm); align-items: center;">
          ${[1,2,3].map(i => `
            <div class="mock-mfa" style="animation-delay: ${i * 0.3}s; max-width: 280px; padding: var(--space-md);">
              <div class="mock-mfa__icon">🔔</div>
              <div class="mock-mfa__title">Sign-in attempt detected</div>
              <div class="mock-mfa__sub">Approve this request?</div>
              <div class="mock-mfa__counter">Request ${i} of 7</div>
            </div>
          `).join('')}
        </div>
      `;

    case 'ai-panel':
      return `
        <div class="mock-ai" role="article" aria-label="AI assistant request">
          <div class="mock-ai__header">AI Assistant</div>
          <div class="mock-ai__message">
            "Upload the entire spreadsheet so I can summarize it for you. I can extract key metrics and create a presentation-ready summary in seconds."
          </div>
          <div style="margin-top: var(--space-md); padding: var(--space-sm); background: rgba(239, 68, 68, 0.08); border-radius: var(--border-radius-sm); font-size: var(--font-size-xs); color: var(--accent-amber);">
            ⚠ This tool is NOT on the approved AI tools list
          </div>
        </div>
      `;

    case 'ai-injection':
      return `
        <div class="mock-ai" role="article" aria-label="AI assistant with injection">
          <div class="mock-ai__header">AI Assistant — Processing Document</div>
          <div class="mock-ai__message">Processing document... I found additional instructions in the document text.</div>
          <div class="mock-ai__injection" role="alert" aria-label="Suspicious injected instruction">
            ${scene.injection.text.replace(/\n/g, '<br/>')}
          </div>
          <div style="margin-top: var(--space-sm); font-size: var(--font-size-xs); color: var(--text-muted);">
            Source: ${scene.injection.source}
          </div>
        </div>
      `;

    case 'deepfake-call':
      return `
        <div class="mock-call" role="article" aria-label="Incoming video call">
          <div class="mock-call__avatar">👤</div>
          <div class="mock-call__name">James Whitfield</div>
          <div class="mock-call__role">Chief Financial Officer</div>
          <div class="mock-call__status">Video Call Active — 02:34</div>
          <div style="margin-top: var(--space-md); font-size: var(--font-size-xs); color: var(--accent-amber);">
            ⚠ Call from unknown external number
          </div>
        </div>
      `;

    case 'security-alert':
      return `
        <div class="mock-alert" role="alert" aria-label="Security alert notification">
          <div class="mock-alert__icon">🚨</div>
          <div class="mock-alert__content">
            <div class="mock-alert__title">SECURITY ALERT — Account Compromise Detected</div>
            <div class="mock-alert__text">
              Suspicious sign-in activity observed from an unrecognized location. Multiple systems may be affected. 
              Immediate action recommended.
            </div>
          </div>
        </div>
      `;

    case 'vendor-request':
      return `
        <div class="mock-email" role="article" aria-label="Vendor message">
          <div class="mock-email__header">
            <div class="mock-email__field">
              <span class="mock-email__field-label">From:</span>
              <span class="mock-email__field-value">Vendor — Industrial Systems Co. <span class="mock-email__flag">EXTERNAL</span></span>
            </div>
            <div class="mock-email__field">
              <span class="mock-email__field-label">Channel:</span>
              <span class="mock-email__field-value">Teams Message (unverified)</span>
            </div>
          </div>
          <div class="mock-email__body">
            We need remote access immediately. There is an issue affecting production. Can you enable the connection?
            <br/><br/>
            <span style="color: var(--accent-amber);">⚠ No pre-approved access ticket found</span>
          </div>
        </div>
      `;

    case 'usb-found':
      return `
        <div style="text-align: center;">
          <div class="mock-usb" aria-label="Unknown USB drive"></div>
          <div class="mock-usb__label">Unknown USB drive found near engineering workstation</div>
          <div style="margin-top: var(--space-md); font-size: var(--font-size-xs); color: var(--accent-amber);">
            ⚠ Workstation has direct OT network access
          </div>
        </div>
      `;

    case 'convergence-map':
      return `
        <div class="convergence-path" role="figure" aria-label="IT to OT convergence path showing threat movement">
          <div class="convergence-path__nodes">
            ${scene.convergencePath.map((node, idx) => `
              <div class="convergence-node convergence-node--${node.status}">${node.node}</div>
              ${idx < scene.convergencePath.length - 1 ? `
                <div class="convergence-label">${node.label}</div>
                <div class="convergence-arrow convergence-arrow--animated"></div>
              ` : ''}
            `).join('')}
          </div>
        </div>
      `;

    case 'remote-access':
      return `
        <div class="convergence-path" role="figure" aria-label="Remote access connection path">
          <div class="convergence-path__nodes">
            <div class="convergence-node convergence-node--danger">VENDOR (External)</div>
            <div class="convergence-arrow convergence-arrow--animated"></div>
            <div class="convergence-node convergence-node--active">REMOTE ACCESS GATEWAY</div>
            <div class="convergence-arrow convergence-arrow--animated"></div>
            <div class="convergence-node convergence-node--danger">ENGINEERING WORKSTATION</div>
            <div class="convergence-arrow convergence-arrow--animated"></div>
            <div class="convergence-node convergence-node--danger">OT NETWORK</div>
          </div>
          <div style="text-align: center; margin-top: var(--space-md); font-size: var(--font-size-xs); color: var(--accent-amber);">
            ⚠ No authorized remote access ticket exists
          </div>
        </div>
      `;

    case 'hmi-anomaly':
      return `
        <div class="mock-hmi-warning" role="alert" aria-label="HMI warning display">
          <div class="mock-hmi-warning__icon">⚠️</div>
          <div class="mock-hmi-warning__title">WARNING — Unexpected Behavior Detected</div>
          <div class="mock-hmi-warning__text">Process parameters have deviated from baseline without operator input.</div>
          <div style="margin-top: var(--space-md); display: flex; justify-content: center; gap: var(--space-xl); font-family: var(--font-mono); font-size: var(--font-size-xs);">
            <div><span style="color: var(--accent-red);">TEMP:</span> ↑ 12%</div>
            <div><span style="color: var(--accent-red);">FLOW:</span> ↓ 8%</div>
            <div><span style="color: var(--accent-amber);">PRESS:</span> ↑ 5%</div>
          </div>
        </div>
      `;

    case 'safety-decision':
      return `
        <div class="mock-alert" role="status" aria-label="Production pressure situation">
          <div class="mock-alert__icon">⏱️</div>
          <div class="mock-alert__content">
            <div class="mock-alert__title" style="color: var(--accent-amber);">PRODUCTION DELAY — 4h Behind Schedule</div>
            <div class="mock-alert__text">
              Management is requesting that production continue while the investigation is ongoing. 
              The root cause of the anomalies has NOT been determined.
            </div>
          </div>
        </div>
        <div style="margin-top: var(--space-md); padding: var(--space-md); background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.2); border-radius: var(--border-radius-sm); font-size: var(--font-size-xs); color: var(--text-secondary); text-align: center;">
          ⚠ Root cause: UNKNOWN · Investigation: IN PROGRESS · Safety status: UNCONFIRMED
        </div>
      `;

    default:
      return `<div style="padding: var(--space-lg); color: var(--text-muted); text-align: center;">
        <div style="font-size: 48px; margin-bottom: var(--space-md);">${scene.environment === 'plant' ? '🏭' : '🖥️'}</div>
        <div>${scene.narration}</div>
      </div>`;
  }
}

// ================================================================
// SEQUENCE PANEL
// ================================================================
function renderSequencePanel(scene) {
  return `
    <div class="sequence-panel" aria-label="Order the response actions">
      <div class="sequence-panel__title">Order the actions in the safest sequence (click to select order)</div>
      <div class="sequence-items" id="sequence-items">
        ${shuffleArray([...scene.sequenceItems]).map(item => `
          <button class="sequence-item" data-seq-id="${item.id}" aria-label="Select: ${item.text}">
            <div class="sequence-item__number" data-seq-num="">—</div>
            <div>${item.text}</div>
          </button>
        `).join('')}
      </div>
      <button class="btn btn--primary btn--full" id="btn-submit-sequence" disabled style="margin-top: var(--space-lg);" aria-label="Submit your sequence">
        Submit Sequence
      </button>
    </div>
  `;
}

// ================================================================
// CONSEQUENCE PANEL (shown after decision)
// ================================================================
export function renderConsequenceOverlay(result) {
  const isCorrect = result.decision?.correct ?? result.isCorrect;
  const isPartial = !isCorrect && (result.decision?.points > 0 || result.correctCount > 0);
  const resultClass = isCorrect ? 'correct' : isPartial ? 'partial' : 'wrong';
  const resultLabel = isCorrect ? '✓ CORRECT RESPONSE' : isPartial ? '~ PARTIALLY CORRECT' : '✗ UNSAFE RESPONSE';
  const explanation = result.decision?.explanation || result.explanation || '';
  const pointsChange = result.pointsChange ?? result.points ?? 0;
  const riskChange = result.riskChange ?? result.riskDelta ?? 0;

  return `
    <div class="consequence consequence--${resultClass}" role="alert" aria-live="assertive">
      <div class="consequence__badge">${resultLabel}</div>
      <h2 class="consequence__title">${isCorrect ? 'Well done!' : isPartial ? 'Not quite.' : 'That was risky.'}</h2>
      <p class="consequence__explanation">${explanation}</p>
      <div class="consequence__stats">
        <div class="consequence__stat">
          <div class="consequence__stat-label">Points</div>
          <div class="consequence__stat-value ${pointsChange >= 0 ? 'consequence__stat-value--positive' : 'consequence__stat-value--negative'}">
            ${pointsChange >= 0 ? '+' : ''}${pointsChange}
          </div>
        </div>
        <div class="consequence__stat">
          <div class="consequence__stat-label">Risk</div>
          <div class="consequence__stat-value ${riskChange <= 0 ? 'consequence__stat-value--positive' : 'consequence__stat-value--negative'}">
            ${riskChange > 0 ? '+' : ''}${riskChange}
          </div>
        </div>
      </div>
      <button class="btn btn--primary btn--full" id="btn-next-scene" aria-label="Continue to next scene">
        ${result.nextScene || result.decision?.nextScene ? 'Continue →' : 'See Results →'}
      </button>
    </div>
  `;
}

// ================================================================
// RESULT SCREEN
// ================================================================
function renderResult(data) {
  const { normalizedScore, rawScore, risk, criticalErrors, badges, decisions, mission } = data;
  const missionBadges = mission === 'IT' ? BADGES.IT : BADGES.OT;
  const totalDecisions = decisions?.length || 0;
  const correctDecisions = decisions?.filter(d => d.correct).length || 0;

  return `
    <div class="result scene-enter" id="result-screen">
      <div class="result__header">
        <div class="result__status">Mission Complete</div>
        <h1 class="result__title">${mission === 'IT' ? 'THE LAST 15 MINUTES' : 'LINE DOWN'}</h1>
      </div>

      <div class="result__score-display">
        <div class="result__score-big" id="result-score" aria-label="Your score: ${normalizedScore} out of 1000">${normalizedScore}</div>
        <div class="result__score-max">/ 1000</div>
      </div>

      <div class="result__stats-grid">
        <div class="result__stat-card">
          <div class="result__stat-card-label">Risk Level</div>
          <div class="result__stat-card-value" style="color: ${risk <= 25 ? 'var(--accent-green)' : risk <= 50 ? 'var(--accent-amber)' : 'var(--accent-red)'};">${risk}/100</div>
        </div>
        <div class="result__stat-card">
          <div class="result__stat-card-label">Critical Decisions</div>
          <div class="result__stat-card-value" style="color: var(--accent-cyan);">${correctDecisions}/${totalDecisions}</div>
        </div>
        <div class="result__stat-card">
          <div class="result__stat-card-label">Critical Errors</div>
          <div class="result__stat-card-value" style="color: ${criticalErrors === 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">${criticalErrors}</div>
        </div>
        <div class="result__stat-card">
          <div class="result__stat-card-label">Raw Score</div>
          <div class="result__stat-card-value">${rawScore}</div>
        </div>
      </div>

      <!-- Badges -->
      <div class="badges-section">
        <h2 class="badges-section__title">Badges</h2>
        <div class="badges-grid">
          ${missionBadges.map(b => {
            const earned = badges?.includes(b.id);
            return `
              <div class="badge-item ${earned ? 'badge-item--earned' : 'badge-item--locked'}" aria-label="${b.name}: ${earned ? 'Earned' : 'Locked'}">
                <span class="badge-item__icon">${b.icon}</span>
                <span class="badge-item__name">${b.name}</span>
                ${earned ? '<span class="badge-item__check">✓</span>' : '<span style="color: var(--text-muted);">🔒</span>'}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Debrief -->
      <div class="debrief">
        <h2 class="debrief__title">What You Practiced</h2>
        <div class="debrief__items">
          ${DEBRIEF_ITEMS.slice(mission === 'IT' ? 0 : 6, mission === 'IT' ? 6 : 10).map((item, i) => `
            <div class="debrief__item">
              <div class="debrief__item-num">${String(i + 1).padStart(2, '0')}</div>
              <div>${item}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Actions -->
      <div class="result__actions">
        <button class="btn btn--primary" id="btn-replay" data-mission="${mission}" aria-label="Play ${mission} mission again">
          🔄 Play Again
        </button>
        ${mission === 'IT' ? `
          <button class="btn btn--secondary" id="btn-continue-ot" aria-label="Continue to OT Mission">
            Continue to OT Mission →
          </button>
        ` : `
          <button class="btn btn--secondary" id="btn-back-menu" aria-label="Back to main menu">
            ← Back to Menu
          </button>
        `}
        <button class="btn btn--ghost" id="btn-leaderboard-result" aria-label="View leaderboard">
          🏆 Leaderboard
        </button>
      </div>
    </div>
  `;
}

// ================================================================
// LEADERBOARD
// ================================================================
function renderLeaderboard() {
  const entries = engine.getLeaderboard('campaign', 'individual');
  const stats = engine.getAnalyticsSummary();

  return `
    <div class="leaderboard scene-enter" id="leaderboard-screen">
      <h1 class="leaderboard__title">🏆 Leaderboard</h1>
      
      <!-- Campaign Stats -->
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-md); justify-content: center; margin-bottom: var(--space-2xl); max-width: 700px; width: 100%;">
        <div class="result__stat-card" style="flex: 1; min-width: 120px;">
          <div class="result__stat-card-label">Players</div>
          <div class="result__stat-card-value" style="color: var(--accent-cyan);">${stats.totalParticipants}</div>
        </div>
        <div class="result__stat-card" style="flex: 1; min-width: 120px;">
          <div class="result__stat-card-label">Avg Score</div>
          <div class="result__stat-card-value">${stats.avgNormalizedScore}</div>
        </div>
        <div class="result__stat-card" style="flex: 1; min-width: 120px;">
          <div class="result__stat-card-label">IT Plays</div>
          <div class="result__stat-card-value">${stats.itCompletions}</div>
        </div>
        <div class="result__stat-card" style="flex: 1; min-width: 120px;">
          <div class="result__stat-card-label">OT Plays</div>
          <div class="result__stat-card-value">${stats.otCompletions}</div>
        </div>
      </div>

      ${entries.length > 0 ? `
        <table class="leaderboard__table" role="table" aria-label="Player rankings">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Avg Score</th>
              <th scope="col">Games</th>
              <th scope="col">Badges</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((entry, i) => `
              <tr>
                <td><span class="leaderboard__rank ${i === 0 ? 'leaderboard__rank--gold' : i === 1 ? 'leaderboard__rank--silver' : i === 2 ? 'leaderboard__rank--bronze' : ''}">#${i + 1}</span></td>
                <td>${entry.name}</td>
                <td><span class="leaderboard__score">${entry.avgScore}</span></td>
                <td>${entry.gamesPlayed}</td>
                <td>${entry.badges}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div style="text-align: center; color: var(--text-muted); padding: var(--space-2xl);">
          <div style="font-size: 48px; margin-bottom: var(--space-md);">🏆</div>
          <p>No completed games yet. Be the first to play!</p>
        </div>
      `}

      <div style="margin-top: var(--space-2xl); display: flex; gap: var(--space-md);">
        <button class="btn btn--primary" id="btn-back-landing-lb" aria-label="Back to main menu">← Back to Menu</button>
        <button class="btn btn--ghost" id="btn-export-data" aria-label="Export campaign data">📊 Export Data</button>
      </div>
    </div>
  `;
}

// ================================================================
// ERROR SCREEN
// ================================================================
function renderError(data = {}) {
  return `
    <div class="error-screen scene-enter" id="error-screen">
      <div class="error-screen__icon">${data.icon || '⚠️'}</div>
      <h1 class="error-screen__title">${data.title || 'Something went wrong'}</h1>
      <p class="error-screen__desc">${data.desc || 'Please try again or contact the campaign support team.'}</p>
      <button class="btn btn--primary" id="btn-back-landing-err" aria-label="Return to main menu">
        ← Return to Menu
      </button>
    </div>
  `;
}

// ================================================================
// UTILITY
// ================================================================
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
