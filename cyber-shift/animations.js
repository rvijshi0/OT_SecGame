/**
 * CYBER SHIFT — Animation & SVG System
 * Character SVGs, environment renderers, and animation utilities.
 * Uses SVG/CSS/Web Animations API — no external images required.
 */

// ================================================================
// SVG CHARACTERS
// ================================================================
export const Characters = {
  // Generic employee/protagonist
  employee: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Employee character">
      <defs>
        <linearGradient id="shirt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="100%" stop-color="#2563eb"/>
        </linearGradient>
        <linearGradient id="skin-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fbbf7f"/>
          <stop offset="100%" stop-color="#f0a060"/>
        </linearGradient>
      </defs>
      <!-- Body -->
      <rect x="35" y="85" width="50" height="55" rx="8" fill="url(#shirt-grad)" class="char-body"/>
      <!-- Neck -->
      <rect x="52" y="75" width="16" height="15" rx="4" fill="url(#skin-grad)"/>
      <!-- Head -->
      <circle cx="60" cy="55" r="28" fill="url(#skin-grad)" class="char-head ${state === 'talking' ? 'char-talking' : ''}"/>
      <!-- Hair -->
      <path d="M32 48 Q35 25 60 22 Q85 25 88 48 Q88 40 80 35 Q70 28 60 28 Q50 28 40 35 Q32 40 32 48Z" fill="#3a2e28"/>
      <!-- Eyes -->
      <circle cx="50" cy="50" r="3" fill="#1e293b" class="char-eye ${state === 'surprised' ? 'char-eye-wide' : ''}"/>
      <circle cx="70" cy="50" r="3" fill="#1e293b" class="char-eye ${state === 'surprised' ? 'char-eye-wide' : ''}"/>
      <circle cx="51" cy="49" r="1" fill="white"/>
      <circle cx="71" cy="49" r="1" fill="white"/>
      <!-- Mouth -->
      ${state === 'talking' ? '<ellipse cx="60" cy="65" rx="5" ry="3" fill="#c0392b" class="char-mouth-open"/>' :
        state === 'success' ? '<path d="M52 63 Q60 70 68 63" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>' :
        state === 'concerned' ? '<path d="M52 66 Q60 62 68 66" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>' :
        state === 'surprised' ? '<circle cx="60" cy="66" r="4" fill="#c0392b"/>' :
        '<path d="M52 64 Q60 67 68 64" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <!-- Eyebrows -->
      ${state === 'concerned' ? '<line x1="45" y1="42" x2="54" y2="44" stroke="#3a2e28" stroke-width="2" stroke-linecap="round"/><line x1="66" y1="44" x2="75" y2="42" stroke="#3a2e28" stroke-width="2" stroke-linecap="round"/>' :
        state === 'surprised' ? '<line x1="46" y1="40" x2="54" y2="42" stroke="#3a2e28" stroke-width="2.5" stroke-linecap="round"/><line x1="66" y1="42" x2="74" y2="40" stroke="#3a2e28" stroke-width="2.5" stroke-linecap="round"/>' :
        '<line x1="46" y1="43" x2="54" y2="43" stroke="#3a2e28" stroke-width="2" stroke-linecap="round"/><line x1="66" y1="43" x2="74" y2="43" stroke="#3a2e28" stroke-width="2" stroke-linecap="round"/>'}
      <!-- Arms -->
      ${state === 'pointing' ? '<line x1="85" y1="95" x2="110" y2="80" stroke="url(#skin-grad)" stroke-width="8" stroke-linecap="round"/>' :
        state === 'typing' ? '<line x1="35" y1="105" x2="15" y2="115" stroke="url(#skin-grad)" stroke-width="8" stroke-linecap="round" class="char-typing-arm"/><line x1="85" y1="105" x2="105" y2="115" stroke="url(#skin-grad)" stroke-width="8" stroke-linecap="round" class="char-typing-arm2"/>' :
        '<line x1="35" y1="95" x2="20" y2="115" stroke="url(#skin-grad)" stroke-width="8" stroke-linecap="round"/><line x1="85" y1="95" x2="100" y2="115" stroke="url(#skin-grad)" stroke-width="8" stroke-linecap="round"/>'}
      <!-- Badge/ID -->
      <rect x="40" y="90" width="12" height="16" rx="2" fill="#f1f5f9" opacity="0.6"/>
      <rect x="42" y="93" width="8" height="3" rx="1" fill="#3b82f6" opacity="0.5"/>
    </svg>`,

  // Manager
  manager: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Manager character">
      <defs>
        <linearGradient id="suit-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#374151"/>
          <stop offset="100%" stop-color="#1f2937"/>
        </linearGradient>
      </defs>
      <rect x="32" y="85" width="56" height="58" rx="8" fill="url(#suit-grad)"/>
      <!-- Tie -->
      <polygon points="58,88 62,88 62,120 60,125 58,120" fill="#ef4444"/>
      <rect x="52" y="75" width="16" height="15" rx="4" fill="#fbbf7f"/>
      <circle cx="60" cy="55" r="28" fill="#fbbf7f"/>
      <path d="M32 50 Q35 22 60 18 Q85 22 88 50 Q88 42 80 35 Q68 25 60 25 Q52 25 40 35 Q32 42 32 50Z" fill="#4a3728"/>
      <!-- Glasses -->
      <circle cx="48" cy="50" r="8" fill="none" stroke="#374151" stroke-width="2"/>
      <circle cx="72" cy="50" r="8" fill="none" stroke="#374151" stroke-width="2"/>
      <line x1="56" y1="50" x2="64" y2="50" stroke="#374151" stroke-width="2"/>
      <circle cx="48" cy="50" r="2.5" fill="#1e293b"/>
      <circle cx="72" cy="50" r="2.5" fill="#1e293b"/>
      ${state === 'talking' ? '<ellipse cx="60" cy="66" rx="4" ry="3" fill="#c0392b"/>' :
        '<path d="M53 65 Q60 68 67 65" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <line x1="32" y1="95" x2="15" y2="118" stroke="#fbbf7f" stroke-width="8" stroke-linecap="round"/>
      <line x1="88" y1="95" x2="105" y2="118" stroke="#fbbf7f" stroke-width="8" stroke-linecap="round"/>
    </svg>`,

  // Security analyst
  securityAnalyst: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Security analyst character">
      <defs>
        <linearGradient id="sec-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#059669"/>
          <stop offset="100%" stop-color="#047857"/>
        </linearGradient>
      </defs>
      <rect x="35" y="85" width="50" height="55" rx="8" fill="url(#sec-shirt)"/>
      <!-- Shield badge -->
      <path d="M55,92 L60,88 L65,92 L65,100 L60,104 L55,100Z" fill="#06d6a0" opacity="0.8"/>
      <rect x="52" y="75" width="16" height="15" rx="4" fill="#c68642"/>
      <circle cx="60" cy="55" r="28" fill="#c68642"/>
      <path d="M32 48 Q38 25 60 22 Q82 25 88 48 L86 45 Q80 30 60 28 Q40 30 34 45Z" fill="#1a1a2e"/>
      <circle cx="50" cy="50" r="3" fill="#1e293b"/>
      <circle cx="70" cy="50" r="3" fill="#1e293b"/>
      <circle cx="51" cy="49" r="1" fill="white"/>
      <circle cx="71" cy="49" r="1" fill="white"/>
      ${state === 'talking' ? '<ellipse cx="60" cy="65" rx="5" ry="3" fill="#c0392b" class="char-mouth-open"/>' :
        '<path d="M52 64 Q60 67 68 64" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <line x1="46" y1="43" x2="54" y2="43" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
      <line x1="66" y1="43" x2="74" y2="43" stroke="#1a1a2e" stroke-width="2" stroke-linecap="round"/>
      <line x1="35" y1="95" x2="18" y2="115" stroke="#c68642" stroke-width="8" stroke-linecap="round"/>
      <line x1="85" y1="95" x2="102" y2="115" stroke="#c68642" stroke-width="8" stroke-linecap="round"/>
    </svg>`,

  // Plant operator
  operator: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Plant operator character">
      <defs>
        <linearGradient id="coverall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
      </defs>
      <rect x="33" y="85" width="54" height="58" rx="8" fill="url(#coverall)"/>
      <!-- Safety stripes -->
      <rect x="33" y="115" width="54" height="4" fill="#1e293b" opacity="0.3"/>
      <rect x="33" y="123" width="54" height="4" fill="#1e293b" opacity="0.3"/>
      <rect x="52" y="75" width="16" height="15" rx="4" fill="#e8b89d"/>
      <circle cx="60" cy="55" r="28" fill="#e8b89d"/>
      <!-- Hard hat -->
      <path d="M28 50 Q30 25 60 20 Q90 25 92 50 L88 48 Q85 30 60 26 Q35 30 32 48Z" fill="#f59e0b"/>
      <rect x="28" y="45" width="64" height="6" rx="3" fill="#d97706"/>
      <circle cx="50" cy="52" r="3" fill="#1e293b"/>
      <circle cx="70" cy="52" r="3" fill="#1e293b"/>
      <circle cx="51" cy="51" r="1" fill="white"/>
      <circle cx="71" cy="51" r="1" fill="white"/>
      ${state === 'talking' ? '<ellipse cx="60" cy="67" rx="5" ry="3" fill="#c0392b"/>' :
        state === 'concerned' ? '<path d="M52 68 Q60 64 68 68" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>' :
        '<path d="M52 66 Q60 69 68 66" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <line x1="33" y1="95" x2="15" y2="118" stroke="#e8b89d" stroke-width="8" stroke-linecap="round"/>
      <line x1="87" y1="95" x2="105" y2="118" stroke="#e8b89d" stroke-width="8" stroke-linecap="round"/>
    </svg>`,

  // Vendor/contractor
  vendor: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Vendor character">
      <defs>
        <linearGradient id="vendor-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7c3aed"/>
          <stop offset="100%" stop-color="#6d28d9"/>
        </linearGradient>
      </defs>
      <rect x="35" y="85" width="50" height="55" rx="8" fill="url(#vendor-shirt)"/>
      <!-- Visitor badge -->
      <rect x="60" y="90" width="20" height="14" rx="2" fill="#ef4444"/>
      <text x="70" y="100" text-anchor="middle" fill="white" font-size="6" font-family="monospace">VISIT</text>
      <rect x="52" y="75" width="16" height="15" rx="4" fill="#d4a76a"/>
      <circle cx="60" cy="55" r="28" fill="#d4a76a"/>
      <path d="M32 48 Q38 28 60 24 Q82 28 88 48 Q85 38 75 32 Q65 26 60 26 Q55 26 45 32 Q35 38 32 48Z" fill="#2d1f10"/>
      <circle cx="50" cy="50" r="3" fill="#1e293b"/>
      <circle cx="70" cy="50" r="3" fill="#1e293b"/>
      ${state === 'talking' ? '<ellipse cx="60" cy="65" rx="5" ry="3" fill="#c0392b"/>' :
        '<path d="M52 64 Q60 67 68 64" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <line x1="35" y1="95" x2="18" y2="115" stroke="#d4a76a" stroke-width="8" stroke-linecap="round"/>
      <line x1="85" y1="95" x2="102" y2="115" stroke="#d4a76a" stroke-width="8" stroke-linecap="round"/>
    </svg>`,

  // Executive (for deepfake scene)
  executive: (state = 'idle') => `
    <svg viewBox="0 0 120 160" class="character-svg" role="img" aria-label="Executive character">
      <defs>
        <linearGradient id="exec-suit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect x="30" y="85" width="60" height="58" rx="8" fill="url(#exec-suit)"/>
      <!-- Lapels -->
      <polygon points="50,85 60,110 55,85" fill="#334155"/>
      <polygon points="70,85 60,110 65,85" fill="#334155"/>
      <polygon points="58,88 62,88 61,98 59,98" fill="#8b5cf6"/>
      <rect x="52" y="75" width="16" height="15" rx="4" fill="#f0c8a0"/>
      <circle cx="60" cy="55" r="28" fill="#f0c8a0"/>
      <path d="M30 50 Q34 22 60 18 Q86 22 90 50 Q88 38 78 30 Q68 22 60 22 Q52 22 42 30 Q32 38 30 50Z" fill="#6b4423"/>
      <circle cx="50" cy="50" r="3" fill="#1e293b"/>
      <circle cx="70" cy="50" r="3" fill="#1e293b"/>
      <circle cx="51" cy="49" r="1" fill="white"/>
      <circle cx="71" cy="49" r="1" fill="white"/>
      ${state === 'talking' ? '<ellipse cx="60" cy="65" rx="5" ry="3" fill="#c0392b"/>' :
        '<path d="M53 64 Q60 67 67 64" stroke="#c0392b" fill="none" stroke-width="2" stroke-linecap="round"/>'}
      <line x1="30" y1="95" x2="12" y2="118" stroke="#f0c8a0" stroke-width="8" stroke-linecap="round"/>
      <line x1="90" y1="95" x2="108" y2="118" stroke="#f0c8a0" stroke-width="8" stroke-linecap="round"/>
    </svg>`
};

// ================================================================
// CHARACTER STATE MAP — which character appears in which scene
// ================================================================
export const SceneCharacters = {
  'IT-01': { char: 'employee', state: 'idle' },
  'IT-02': { char: 'employee', state: 'concerned' },
  'IT-03': { char: 'employee', state: 'surprised' },
  'IT-04': { char: 'employee', state: 'typing' },
  'IT-05': { char: 'employee', state: 'concerned' },
  'IT-06': { char: 'executive', state: 'talking' },
  'IT-07': { char: 'securityAnalyst', state: 'talking' },
  'IT-08': { char: 'securityAnalyst', state: 'pointing' },
  'OT-01': { char: 'operator', state: 'idle' },
  'OT-02': { char: 'vendor', state: 'talking' },
  'OT-03': { char: 'operator', state: 'concerned' },
  'OT-04': { char: 'securityAnalyst', state: 'concerned' },
  'OT-05': { char: 'operator', state: 'concerned' },
  'OT-06': { char: 'operator', state: 'surprised' },
  'OT-07': { char: 'securityAnalyst', state: 'talking' },
  'OT-08': { char: 'manager', state: 'talking' },
};

// ================================================================
// ANIMATION UTILITIES
// ================================================================
export const Animations = {
  // Score popup animation
  showScorePopup(points) {
    const popup = document.createElement('div');
    popup.className = `score-popup ${points >= 0 ? 'score-popup--positive' : 'score-popup--negative'}`;
    popup.innerHTML = `<div class="score-popup__value">${points >= 0 ? '+' : ''}${points}</div>`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 2100);
  },

  // Badge unlock notification
  showBadgeUnlock(badgeName, icon) {
    const notification = document.createElement('div');
    notification.className = 'badge-notification';
    notification.setAttribute('role', 'alert');
    notification.innerHTML = `
      <div class="badge-notification__icon">${icon}</div>
      <div class="badge-notification__text">
        <div class="badge-notification__label">Badge Unlocked!</div>
        <div class="badge-notification__name">${badgeName}</div>
      </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3200);
  },

  // Typewriter effect for dialogue
  typewriterEffect(element, text, speed = 30) {
    return new Promise((resolve) => {
      element.textContent = '';
      let i = 0;
      const timer = setInterval(() => {
        element.textContent += text[i];
        i++;
        if (i >= text.length) {
          clearInterval(timer);
          resolve();
        }
      }, speed);
    });
  },

  // Risk meter animation
  animateRiskMeter(element, fromValue, toValue) {
    const duration = 500;
    const start = performance.now();
    
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const currentValue = fromValue + (toValue - fromValue) * eased;
      element.style.width = `${currentValue}%`;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  },

  // Counter animation for score
  animateCounter(element, from, to, duration = 600) {
    const start = performance.now();
    
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  },

  // Notification slide-in effect
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 300;
      background: var(--bg-card);
      border: var(--border-${type === 'danger' ? 'danger' : 'accent'});
      border-radius: var(--border-radius-md);
      padding: 12px 20px;
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      animation: notificationSlide 3s ease forwards;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3200);
  }
};

// ================================================================
// SHIELD LOGO SVG
// ================================================================
export const ShieldLogo = `
<svg viewBox="0 0 80 90" width="80" height="90" role="img" aria-label="Cyber Shift shield logo">
  <defs>
    <linearGradient id="shield-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="shield-inner" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06d6a0" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <!-- Outer shield -->
  <path d="M40 5 L72 20 L72 50 Q72 72 40 85 Q8 72 8 50 L8 20Z" 
        fill="url(#shield-inner)" stroke="url(#shield-grad)" stroke-width="2.5"/>
  <!-- Inner circuit pattern -->
  <path d="M40 18 L40 35 M30 28 L50 28" stroke="url(#shield-grad)" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  <!-- Lock icon -->
  <rect x="30" y="42" width="20" height="18" rx="3" fill="url(#shield-grad)" opacity="0.8"/>
  <path d="M35 42 L35 36 Q35 28 40 28 Q45 28 45 36 L45 42" fill="none" stroke="url(#shield-grad)" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="40" cy="51" r="3" fill="#0a0e1a"/>
  <line x1="40" y1="54" x2="40" y2="57" stroke="#0a0e1a" stroke-width="2" stroke-linecap="round"/>
  <!-- Glow effect -->
  <circle cx="40" cy="45" r="35" fill="none" stroke="url(#shield-grad)" stroke-width="0.5" opacity="0.2">
    <animate attributeName="r" values="35;40;35" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.2;0.05;0.2" dur="3s" repeatCount="indefinite"/>
  </circle>
</svg>`;

// ================================================================
// CSS FOR CHARACTER ANIMATIONS
// ================================================================
export function injectCharacterStyles() {
  if (document.getElementById('char-anim-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'char-anim-styles';
  style.textContent = `
    .char-talking .char-head {
      animation: charTalk 0.3s ease-in-out infinite alternate;
    }
    .char-mouth-open {
      animation: mouthOpen 0.4s ease-in-out infinite alternate;
    }
    .char-eye-wide {
      r: 4.5 !important;
    }
    .char-typing-arm {
      animation: typing1 0.3s ease-in-out infinite alternate;
    }
    .char-typing-arm2 {
      animation: typing2 0.3s ease-in-out infinite alternate-reverse;
    }
    
    @keyframes charTalk {
      from { transform: translateY(0); }
      to { transform: translateY(-1px); }
    }
    @keyframes mouthOpen {
      from { ry: 2; }
      to { ry: 4; }
    }
    @keyframes typing1 {
      from { transform: translateY(0); }
      to { transform: translateY(-3px); }
    }
    @keyframes typing2 {
      from { transform: translateY(0); }
      to { transform: translateY(-2px); }
    }
  `;
  document.head.appendChild(style);
}
