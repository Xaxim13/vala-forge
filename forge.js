// ============================================================
// VALA FORGE — forge.js
// Solana RPC · Card Logic · 3D · Supabase · Rate Limiting
// ============================================================

// ── CONFIG ──
var SUPABASE_URL = 'https://jwinjoriiarrnstxrqxy.supabase.co';
var SUPABASE_KEY = 'sb_publishable_90xdRcz_Vr_xokPamuWmeA_uzyhgney';
var VCM_MINT = 'GMcThHFBnN6zjB2Mvbgdi19A2m35g81y7B1AKhgGbonk';
var RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=04d06540-520b-4f4d-b31e-fbebd33c672e';

// ── ENTITIES ──
var ENTITIES = [
  { name: 'The Architect', key: 'architect', prefix: '00' },
  { name: 'The Signal',    key: 'signal',    prefix: '01' },
  { name: 'The Core',      key: 'core',      prefix: '02' },
  { name: 'The Observer',  key: 'observer',  prefix: '03' },
  { name: 'The Entity',    key: 'entity',    prefix: '04' },
  { name: 'The Shaper',    key: 'shaper',    prefix: '05' },
  { name: 'The Link',      key: 'link',      prefix: '06' },
  { name: 'The Node',      key: 'node',      prefix: '07' },
  { name: 'The Void',      key: 'void',      prefix: '08' },
  { name: 'The Pulse',     key: 'pulse',     prefix: '09' }
];

// ── STATES (Option B thresholds) ──
var STATES = [
  { name: 'Genesis',     rarity: 'Common',    min: 1,          index: 0,  color: '#a0a0a0' },
  { name: 'Echo',        rarity: 'Uncommon',  min: 5000,       index: 1,  color: '#64c87a' },
  { name: 'Origin',      rarity: 'Uncommon',  min: 25000,      index: 2,  color: '#64c87a' },
  { name: 'Shift',       rarity: 'Rare',      min: 100000,     index: 3,  color: '#6496ff' },
  { name: 'Prime',       rarity: 'Rare',      min: 250000,     index: 4,  color: '#6496ff' },
  { name: 'Fracture',    rarity: 'Epic',      min: 500000,     index: 5,  color: '#b464ff' },
  { name: 'Ascent',      rarity: 'Epic',      min: 2000000,    index: 6,  color: '#b464ff' },
  { name: 'Awakened',    rarity: 'Legendary', min: 5000000,    index: 7,  color: '#ffb428' },
  { name: 'Overdrive',   rarity: 'Mythic',    min: 20000000,   index: 8,  color: '#ff6464' },
  { name: 'Singularity', rarity: 'Divine',    min: 50000000,   index: 9,  color: '#E8C97A' }
];

// Card number lookup: entity 0-9, state 0-9
var CARD_NUMBERS = [
  ['001','002','003','004','005','006','007','008','009','010'],
  ['011','012','013','014','015','016','017','018','019','020'],
  ['021','022','023','024','025','026','027','028','029','030'],
  ['031','032','033','034','035','036','037','038','039','040'],
  ['041','042','043','044','045','046','047','048','049','050'],
  ['051','052','053','054','055','056','057','058','059','060'],
  ['061','062','063','064','065','066','067','068','069','070'],
  ['071','072','073','074','075','076','077','078','079','080'],
  ['081','082','083','084','085','086','087','088','089','090'],
  ['091','092','093','094','095','096','097','098','099','100']
];

// ── STATE ──
var currentCard = null;
var autoRotateId = null;
var autoAngle = 0;
var isFlipped = false;
var isDragging = false;
var dragMoved = false;
var rotX = -5, rotY = 0, velX = 0, velY = 0, lastX, lastY;

// ── RATE LIMITING ──
var RATE_LIMIT_KEY = 'vf_forge_times';
var RATE_LIMIT_MAX = 10;
var RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

function checkRateLimit() {
  var now = Date.now();
  var raw = localStorage.getItem(RATE_LIMIT_KEY);
  var times = raw ? JSON.parse(raw) : [];
  times = times.filter(function(t) { return now - t < RATE_LIMIT_WINDOW; });
  if (times.length >= RATE_LIMIT_MAX) {
    var oldest = Math.min.apply(null, times);
    var wait = Math.ceil((RATE_LIMIT_WINDOW - (now - oldest)) / 1000 / 60);
    return { ok: false, wait: wait };
  }
  return { ok: true, times: times };
}

function recordForge() {
  var check = checkRateLimit();
  if (!check.ok) return;
  var times = check.times;
  times.push(Date.now());
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(times));
}

// ── HELPERS ──
function $(id) { return document.getElementById(id); }
function show(id) { var el = $(id); if(el) el.classList.remove('hidden'); }
function hide(id) { var el = $(id); if(el) el.classList.add('hidden'); }

function walletToEntityIndex(wallet) {
  var hash = 0;
  for (var i = 0; i < wallet.length; i++) {
    hash = ((hash << 5) - hash) + wallet.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % 10;
}

function vcmToStateIndex(vcm) {
  for (var i = STATES.length - 1; i >= 0; i--) {
    if (vcm >= STATES[i].min) return i;
  }
  return 0;
}

function formatVCM(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'K';
  return n.toString();
}

function getCardFilename(entityIndex, stateIndex) {
  var num = CARD_NUMBERS[entityIndex][stateIndex];
  return 'assets/cards/' + num + '-' + ENTITIES[entityIndex].key + '-' + STATES[stateIndex].name.toLowerCase() + '.png';
}

// ── PARTICLES ──
(function initParticles() {
  var canvas = $('particles');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (var i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a: Math.random() * 0.5 + 0.1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201,168,76,' + p.a + ')';
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── SMOOTH SCROLL ──
document.addEventListener('DOMContentLoaded', function() {
  var heroBtn = document.querySelector('.btn-hero');
  if (heroBtn) {
    heroBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var target = document.querySelector('#forge');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }
});

// ── RPC: GET VCM BALANCE ──
async function getVCMBalance(wallet) {
  try {
    var response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallet,
          { mint: VCM_MINT },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    var data = await response.json();
    if (data.error) return 0;
    var accounts = data.result && data.result.value;
    if (!accounts || accounts.length === 0) return 0;
    var total = 0;
    for (var i = 0; i < accounts.length; i++) {
      var info = accounts[i].account.data.parsed.info.tokenAmount;
      total += parseFloat(info.uiAmount || 0);
    }
    return Math.floor(total);
  } catch(e) {
    return -1; // network error
  }
}

// ── ANIMATED VCM COUNTER ──
function animateCounter(el, target, duration) {
  var start = 0;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.floor(eased * target);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(step);
}

// ── STEP 1: CHECK WALLET ──
var checkWalletBtn = $('checkWalletBtn');
if (checkWalletBtn) {
  checkWalletBtn.addEventListener('click', async function() {
    var wallet = $('walletInput').value.trim();
    $('walletError').textContent = '';

    // Basic Solana address validation
    if (!wallet || wallet.length < 32 || wallet.length > 44) {
      $('walletError').textContent = 'Please enter a valid Solana wallet address.';
      return;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(wallet)) {
      $('walletError').textContent = 'Invalid wallet address format.';
      return;
    }

    // Rate limit check
    var rateCheck = checkRateLimit();
    if (!rateCheck.ok) {
      $('walletError').textContent = 'Too many attempts. Please wait ' + rateCheck.wait + ' minutes.';
      return;
    }

    // Show loading
    checkWalletBtn.disabled = true;
    checkWalletBtn.textContent = 'Reading...';
    show('loadingWallet');

    var balance = await getVCMBalance(wallet);

    hide('loadingWallet');
    checkWalletBtn.disabled = false;
    checkWalletBtn.textContent = 'Read My Signal';

    if (balance === -1) {
      $('walletError').textContent = 'Network error. Please try again.';
      return;
    }

    // Store wallet
    window._wallet = wallet;
    window._vcmBalance = balance;

    // Show step 2
    hide('step1');
    show('step2');

    // Animate VCM counter
    animateCounter($('vcmDisplay'), balance, 1500);

    // State badge
    var stateIndex = vcmToStateIndex(balance);
    var state = STATES[stateIndex];
    var badge = $('vcmStateBadge');
    badge.textContent = state.name + ' · ' + state.rarity;
    badge.style.background = 'rgba(' + hexToRgb(state.color) + ',0.1)';
    badge.style.color = state.color;
    badge.style.border = '1px solid rgba(' + hexToRgb(state.color) + ',0.3)';

    // Message
    var msg = $('forgeMessage');
    if (balance === 0) {
      msg.textContent = 'Your signal is too weak. Acquire $VCM to reveal your entity.';
      msg.className = 'forge-message error';
    } else {
      msg.textContent = 'You are in possession of ' + balance.toLocaleString() + ' $VCM. Enter your name and forge to discover your true nature.';
      msg.className = 'forge-message';
      show('pseudoSection');
    }
  });
}

// ── PSEUDO INPUT ──
var pseudoInput = $('pseudoInput');
if (pseudoInput) {
  pseudoInput.addEventListener('input', function() {
    var val = this.value.replace(/[^a-zA-Z0-9]/g, '');
    if (val.length > 14) val = val.substring(0, 14);
    this.value = val;
    $('pseudoError').textContent = '';

    if (val.length >= 2) {
      show('confirmSection');
    } else {
      hide('confirmSection');
      hide('forgeBtn');
    }
  });
}

var confirmCheck = $('confirmCheck');
if (confirmCheck) {
  confirmCheck.addEventListener('change', function() {
    if (this.checked && pseudoInput && pseudoInput.value.length >= 2) {
      show('forgeBtn');
    } else {
      hide('forgeBtn');
    }
  });
}

// ── FORGE ──
var forgeBtn = $('forgeBtn');
if (forgeBtn) {
  forgeBtn.addEventListener('click', async function() {
    var pseudo = $('pseudoInput').value.trim();
    $('pseudoError').textContent = '';

    if (!pseudo || pseudo.length < 2) {
      $('pseudoError').textContent = 'Name must be at least 2 characters.';
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(pseudo)) {
      $('pseudoError').textContent = 'Letters and numbers only.';
      return;
    }

    var rateCheck = checkRateLimit();
    if (!rateCheck.ok) {
      $('pseudoError').textContent = 'Too many forges. Wait ' + rateCheck.wait + ' min.';
      return;
    }

    recordForge();

    hide('step2');
    show('step3');

    // Scroll to forge section
    var forgeSection = $('forge');
    if (forgeSection) forgeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Spark animation
    launchSparks();

    await new Promise(function(r) { setTimeout(r, 2200); });

    var wallet = window._wallet;
    var vcm = window._vcmBalance;
    var entityIndex = walletToEntityIndex(wallet);
    var stateIndex = vcmToStateIndex(vcm);
    var entity = ENTITIES[entityIndex];
    var state = STATES[stateIndex];
    var cardNum = CARD_NUMBERS[entityIndex][stateIndex];
    var filename = getCardFilename(entityIndex, stateIndex);

    currentCard = {
      wallet: wallet,
      pseudo: pseudo,
      entity: entity,
      state: state,
      entityIndex: entityIndex,
      stateIndex: stateIndex,
      cardNum: cardNum,
      filename: filename,
      vcm: vcm
    };

    // Save to Supabase (fire & forget)
    saveToSupabase(currentCard);

    // Show card
    hide('step3');
    show('step4');
    populateCard(currentCard);
    initCard3D();
  });
}

// ── POPULATE CARD ──
function populateCard(card) {
  var artImg = $('cardArtImg');
  if (artImg) {
    artImg.src = card.filename;
    artImg.onerror = function() {
      this.src = 'assets/cards/placeholder.png';
    };
  }

  var cn = $('cnDisplay');
  if (cn) cn.textContent = '#' + card.cardNum + ' / 100';

  var ce = $('ceDisplay');
  if (ce) ce.textContent = card.entity.name.toUpperCase();

  var cp = $('cpDisplay');
  if (cp) cp.textContent = card.pseudo.toUpperCase();

  var cr = $('crDisplay');
  if (cr) {
    cr.textContent = '✦  ' + card.state.name.toUpperCase() + '  ·  ' + card.state.rarity.toUpperCase() + '  ✦';
    cr.style.color = card.state.color;
  }

  var resultTitle = $('resultTitle');
  if (resultTitle) resultTitle.textContent = 'It has chosen you.';

  // Reveal animation
  var scene = $('cardScene');
  if (scene) scene.classList.add('card-reveal-anim');
}

// ── SAVE TO SUPABASE ──
async function saveToSupabase(card) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/forges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        wallet: card.wallet,
        pseudo: card.pseudo,
        entity: card.entity.name,
        entity_index: card.entityIndex,
        state: card.state.name,
        state_index: card.stateIndex,
        rarity: card.state.rarity,
        vcm_balance: card.vcm,
        card_number: parseInt(card.cardNum)
      })
    });
  } catch(e) {
    console.log('Supabase save failed (non-critical):', e);
  }
}

// ── FORGE ANIMATION ──
function launchSparks() {
  var container = $('sparkContainer');
  if (!container) return;
  container.innerHTML = '';
  for (var i = 0; i < 20; i++) {
    var spark = document.createElement('div');
    spark.style.cssText = [
      'position:absolute',
      'width:' + (Math.random()*4+2) + 'px',
      'height:' + (Math.random()*4+2) + 'px',
      'border-radius:50%',
      'background:' + (Math.random() > 0.5 ? '#C9A84C' : '#FF6B2B'),
      'left:50%', 'top:50%',
      '--tx:' + (Math.random()*120-60) + 'px',
      '--ty:' + (Math.random()*-80-20) + 'px',
      'animation:sparkFly ' + (Math.random()*0.6+0.4) + 's ease forwards',
      'animation-delay:' + (Math.random()*0.3) + 's'
    ].join(';');
    container.appendChild(spark);
  }
  var texts = ['Forging your card...', 'VALA recognizes you...', 'Your entity emerges...'];
  var i2 = 0;
  var textEl = $('forgeAnimText');
  var textInterval = setInterval(function() {
    if (textEl) textEl.textContent = texts[i2 % texts.length];
    i2++;
  }, 700);
  setTimeout(function() { clearInterval(textInterval); }, 2000);
}

// ── 3D CARD ──
function initCard3D() {
  var scene = $('cardScene');
  var flipper = $('cardFlipper');
  if (!scene || !flipper) return;

  isFlipped = false; isDragging = false; dragMoved = false;
  rotX = -5; rotY = 0; velX = 0; velY = 0;
  autoAngle = 0;

  function applyT(smooth) {
    var by = isFlipped ? 180 : 0;
    var t = 'rotateX(' + rotX + 'deg) rotateY(' + (rotY + by) + 'deg)';
    var tr = smooth ? 'transform 0.85s cubic-bezier(0.4,0,0.2,1)' : 'none';
    flipper.style.transition = tr;
    flipper.style.webkitTransition = tr;
    flipper.style.transform = t;
    flipper.style.webkitTransform = t;
  }

  function autoStep() {
    autoAngle += 0.32; rotY = autoAngle;
    applyT(false);
    autoRotateId = requestAnimationFrame(autoStep);
  }
  if (autoRotateId) cancelAnimationFrame(autoRotateId);
  autoStep();

  function stopAuto() { cancelAnimationFrame(autoRotateId); }
  function startAuto() { autoAngle = rotY; autoStep(); }

  function dn(cx, cy) { stopAuto(); isDragging = true; dragMoved = false; lastX = cx; lastY = cy; velX = 0; velY = 0; }
  function mv(cx, cy) {
    if (!isDragging) return;
    var dx = cx - lastX, dy = cy - lastY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    velX = dx * 0.55; velY = dy * 0.55;
    rotY += dx * 0.5; rotX = Math.max(-36, Math.min(36, rotX - dy * 0.38));
    lastX = cx; lastY = cy; applyT(false);
  }
  function up() {
    if (!isDragging) return; isDragging = false; inertia();
    clearTimeout(window._at); window._at = setTimeout(function() { autoAngle = rotY; startAuto(); }, 4500);
  }
  function inertia() {
    if (Math.abs(velX) < 0.04 && Math.abs(velY) < 0.04) return;
    velX *= 0.88; velY *= 0.88;
    rotY += velX; rotX = Math.max(-36, Math.min(36, rotX - velY * 0.45));
    applyT(false); autoRotateId = requestAnimationFrame(inertia);
  }

  scene.addEventListener('mousedown', function(e) { e.preventDefault(); dn(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function(e) { if (isDragging) mv(e.clientX, e.clientY); });
  window.addEventListener('mouseup', function() { if (!isDragging) return; var m = dragMoved; up(); if (!m) { isFlipped = !isFlipped; applyT(true); } });
  scene.addEventListener('touchstart', function(e) { e.stopPropagation(); dn(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  scene.addEventListener('touchmove', function(e) { e.preventDefault(); mv(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  scene.addEventListener('touchend', function(e) { e.stopPropagation(); var m = dragMoved; up(); if (!m) { isFlipped = !isFlipped; applyT(true); } }, { passive: true });
}

// ── DRAW CARD CANVAS ──
function drawCardCanvas(scale) {
  if (!currentCard) return null;
  var W = 300, H = 460, R = 13, sc = scale || 3;
  var cv = document.createElement('canvas');
  cv.width = W * sc; cv.height = H * sc;
  var ctx = cv.getContext('2d'); ctx.scale(sc, sc);

  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  }

  ctx.fillStyle = '#020202'; rr(0,0,W,H,R+2); ctx.fill();

  var artImg = $('cardArtImg');
  ctx.save(); rr(0,0,W,H,R); ctx.clip(); ctx.drawImage(artImg,0,0,W,H);
  var fg = ctx.createLinearGradient(0,H*0.44,0,H);
  fg.addColorStop(0,'rgba(2,2,2,0)'); fg.addColorStop(0.38,'rgba(2,2,2,0.65)');
  fg.addColorStop(0.72,'rgba(2,2,2,0.96)'); fg.addColorStop(1,'rgba(2,2,2,1)');
  ctx.fillStyle = fg; ctx.fillRect(0,0,W,H); ctx.restore();

  var hg = ctx.createLinearGradient(0,0,0,H*0.18);
  hg.addColorStop(0,'rgba(0,0,0,0.82)'); hg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = hg; ctx.fillRect(0,0,W,H*0.18);

  var gl = ctx.createLinearGradient(W*0.1,0,W*0.9,0);
  gl.addColorStop(0,'rgba(201,168,76,0)'); gl.addColorStop(0.35,'rgba(201,168,76,0.5)');
  gl.addColorStop(0.5,'rgba(232,201,122,0.85)'); gl.addColorStop(0.65,'rgba(201,168,76,0.5)');
  gl.addColorStop(1,'rgba(201,168,76,0)');
  ctx.fillStyle = gl; ctx.fillRect(W*0.1,0,W*0.8,1);

  ctx.textAlign = 'center';
  ctx.font = '700 8.5px Rajdhani,sans-serif'; ctx.fillStyle = 'rgba(201,168,76,0.52)';
  ctx.fillText('#' + currentCard.cardNum + ' / 100', W/2, 24);
  ctx.font = '900 17px "Cinzel Decorative",serif'; ctx.fillStyle = '#F4EFE4';
  ctx.shadowColor = 'rgba(201,168,76,0.35)'; ctx.shadowBlur = 20;
  ctx.fillText(currentCard.entity.name.toUpperCase(), W/2, 48); ctx.shadowBlur = 0;

  var fl = ctx.createLinearGradient(W*0.15,0,W*0.85,0);
  fl.addColorStop(0,'rgba(201,168,76,0)'); fl.addColorStop(0.5,'rgba(201,168,76,0.35)');
  fl.addColorStop(1,'rgba(201,168,76,0)');
  ctx.fillStyle = fl; ctx.fillRect(W*0.15,H-90,W*0.7,1);
  ctx.save(); ctx.translate(W/2,H-83); ctx.rotate(Math.PI/4);
  ctx.fillStyle = 'rgba(201,168,76,0.5)'; ctx.fillRect(-2.5,-2.5,5,5); ctx.restore();

  ctx.font = '700 15px Cinzel,serif'; ctx.fillStyle = '#EBE3D2';
  ctx.shadowColor = 'rgba(201,168,76,0.2)'; ctx.shadowBlur = 12;
  ctx.fillText(currentCard.pseudo.toUpperCase(), W/2, H-54); ctx.shadowBlur = 0;

  ctx.font = '700 9px Rajdhani,sans-serif'; ctx.fillStyle = currentCard.state.color;
  ctx.shadowColor = currentCard.state.color; ctx.shadowBlur = 7;
  ctx.fillText('\u2736  ' + currentCard.state.name.toUpperCase() + '  \u00b7  ' + currentCard.state.rarity.toUpperCase() + '  \u2736', W/2, H-33);
  ctx.shadowBlur = 0;

  ctx.font = '400 4.5px "Cinzel Decorative",serif'; ctx.fillStyle = 'rgba(201,168,76,0.12)';
  ctx.textAlign = 'right'; ctx.fillText('VALA FORGE', W-10, H-6);

  rr(0.5,0.5,W-1,H-1,R+1); ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.5; ctx.stroke();
  var mh = ctx.createLinearGradient(0,0,W,0);
  ['#484848','#c0c0c0','#828282','#e6e6e6','#989898','#eeeeee','#888','#d4d4d4','#686868'].forEach(function(c,i,a){mh.addColorStop(i/(a.length-1),c);});
  rr(2,2,W-4,H-4,R); ctx.strokeStyle = mh; ctx.lineWidth = 5; ctx.stroke();
  var mv = ctx.createLinearGradient(0,0,0,H);
  ['#505050','#cccccc','#eaeaea','#cccccc','#585858'].forEach(function(c,i,a){mv.addColorStop(i/(a.length-1),c);});
  ctx.strokeStyle = mv; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
  rr(5.5,5.5,W-11,H-11,R-2); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  rr(7,7,W-14,H-14,R-3); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();

  return cv;
}

// ── SAVE CARD ──
var saveBtn = $('saveBtn');
if (saveBtn) {
  saveBtn.addEventListener('click', function() {
    var btn = this; btn.textContent = 'Building...'; btn.disabled = true;
    requestAnimationFrame(function() { requestAnimationFrame(function() {
      var cv = drawCardCanvas(3);
      if (!cv) { btn.textContent = 'Save Card'; btn.disabled = false; return; }
      var dataUrl = cv.toDataURL('image/png', 1.0);
      var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        $('viewerImg').src = dataUrl;
        $('imgViewer').classList.add('open');
      } else {
        var a = document.createElement('a');
        a.href = dataUrl; a.download = 'VALA-FORGE-' + (currentCard ? currentCard.entity.key : 'card') + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      btn.textContent = 'Save Card'; btn.disabled = false;
    }); });
  });
}

var viewerClose = $('viewerClose');
if (viewerClose) {
  viewerClose.addEventListener('click', function() {
    $('imgViewer').classList.remove('open');
    $('viewerImg').src = '';
  });
}

// ── SHARE ──
var shareBtn = $('shareBtn');
if (shareBtn) {
  shareBtn.addEventListener('click', function() {
    requestAnimationFrame(function() { requestAnimationFrame(function() {
      var cv = drawCardCanvas(2);
      if (!cv) return;
      $('sharePreviewImg').src = cv.toDataURL('image/png');
      var msg = currentCard
        ? '⚡ I just forged my VALA card — ' + currentCard.entity.name.toUpperCase() + ' · ' + currentCard.state.name.toUpperCase() + ' · ' + currentCard.state.rarity.toUpperCase() + '\n\nDiscover what entity lives within your soul. Forge yours now.\n\n#VALA #VCM #SolanaNFT'
        : '⚡ Forge your VALA card now!\n\n#VALA #VCM #SolanaNFT';
      $('shareMsgText').textContent = msg;
      $('shareOverlay').classList.add('open');
    }); });
  });
}

var closeShareBtn = $('closeShareBtn');
if (closeShareBtn) closeShareBtn.addEventListener('click', function() { $('shareOverlay').classList.remove('open'); });
var shareOverlay = $('shareOverlay');
if (shareOverlay) shareOverlay.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });

var btnX = $('btnX');
if (btnX) btnX.addEventListener('click', function() {
  var txt = encodeURIComponent(currentCard
    ? '⚡ I just forged my VALA card — ' + currentCard.entity.name.toUpperCase() + ' · ' + currentCard.state.name.toUpperCase() + ' · ' + currentCard.state.rarity.toUpperCase() + '\n\nDiscover what entity lives within your soul. Forge yours now.\n\nvalaforge.vercel.app\n\n#VALA #VCM #SolanaNFT'
    : 'Forge your VALA card!\n\nvalaforge.vercel.app\n\n#VALA #VCM');
  window.open('https://twitter.com/intent/tweet?text=' + txt, '_blank');
});

var btnWA = $('btnWA');
if (btnWA) btnWA.addEventListener('click', function() {
  var txt = encodeURIComponent(currentCard
    ? '⚡ I just forged my VALA card — ' + currentCard.entity.name.toUpperCase() + ' · ' + currentCard.state.name.toUpperCase() + '\n\nForge yours: valaforge.vercel.app'
    : 'Forge your VALA card!\n\nvalaforge.vercel.app');
  window.open('https://wa.me/?text=' + txt, '_blank');
});

var copyBtn = $('copyBtn');
if (copyBtn) copyBtn.addEventListener('click', function() {
  var btn = this; var o = btn.textContent;
  navigator.clipboard.writeText(window.location.href).then(function() {
    btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = o; }, 2000);
  }).catch(function() { btn.textContent = 'Error'; setTimeout(function() { btn.textContent = o; }, 2000); });
});

// ── FORGE AGAIN ──
var forgeAgainBtn = $('forgeAgainBtn');
if (forgeAgainBtn) {
  forgeAgainBtn.addEventListener('click', function() {
    cancelAnimationFrame(autoRotateId);
    currentCard = null;
    hide('step4');
    show('step1');
    $('walletInput').value = '';
    $('walletError').textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── UTIL ──
function hexToRgb(hex) {
  var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return '201,168,76';
  return parseInt(r[1],16)+','+parseInt(r[2],16)+','+parseInt(r[3],16);
}

// ── NAV SCROLL EFFECT ──
window.addEventListener('scroll', function() {
  var nav = $('navbar');
  if (nav) {
    if (window.scrollY > 50) {
      nav.style.borderBottomColor = 'rgba(201,168,76,0.15)';
    } else {
      nav.style.borderBottomColor = 'rgba(201,168,76,0.1)';
    }
  }
});
