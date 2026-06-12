/**
 * 留在旧世界的烦恼 - 共鸣之海
 * 表达 → 倾听 → 共鸣 → 理解
 * 四个垂直叙事空间
 */

(function() {
  'use strict';

  // ========================================
  // 配置
  // ========================================
  const API_BASE = '/api';

  // 情绪关键词
  const EMOTION_KEYWORDS = {
    love: ['love', 'loving', 'loved', 'dear'],
    family: ['family', 'mother', 'father', 'mom', 'dad', 'son', 'daughter', 'child', 'kids'],
    gratitude: ['thank', 'grateful', 'appreciate'],
    hope: ['hope', 'peace', 'future', 'better'],
    forgive: ['forgive', 'sorry', 'apologize'],
    home: ['home', 'remember', 'miss'],
    mother: ['mother', 'mom', 'mama']
  };

  // 海的回应
  const SEA_RESPONSES = {
    love: [
      '很多瓶子都在说爱。也许分别的时候，人们最想留下的就是这句话。',
      '爱是不会消失的。它只是换了一种方式继续存在。',
      '这句话已经在这片海里漂流了很久。现在，它被你听见了。'
    ],
    family: [
      '今天你已经听见了许多关于家人的话。每个人心里都有一条回家的路。',
      '有些人用一生告别，有些人来不及说再见。',
      '家是所有人最后的牵挂。'
    ],
    gratitude: [
      '谢谢。这两个字很简单，却承载了很多重量。',
      '有人愿意说谢谢，说明这个世界上还有值得感激的事。',
      '感恩是活着的人最美的话语。'
    ],
    hope: [
      '希望是黑暗里的一点光。',
      '即使在最绝望的时候，也有人在写下希望。',
      '希望不会消失。它只是在等待被看见。'
    ],
    forgive: [
      '原谅自己，也许比被原谅更难。',
      '有些遗憾会沉入海底，有些会浮在海面。',
      '宽恕是留给自己的礼物。'
    ],
    home: [
      '回家。这两个字承载了太多。',
      '无论走多远，总有一条路通向记忆中的地方。',
      '家不是一个地方，是心里的一道光。'
    ],
    mother: [
      '几乎每个瓶子里都提到了母亲。',
      '母亲是所有人最后也最柔软的牵挂。',
      '有些话来不及对母亲说，就装进了瓶子里。'
    ],
    default: [
      '这句话已经在这片海里漂流了很久。',
      '不知道说这句话的人最后怎么样了。但话还在。',
      '能被陌生人听见，也是一种存在的方式。',
      '大海记得每一句话。',
      '这里漂浮着很多人没说出口的话。'
    ]
  };

  // 高频词（拼图用）
  const MOSAIC_KEYWORDS = [
    'LOVE', 'FAMILY', 'MOTHER', 'HOME', 'PEACE',
    'THANK', 'FORGIVE', 'GOD', 'FRIEND', 'HOPE',
    'CHILDREN', 'KIDS', 'SON', 'DAUGHTER', 'WIFE'
  ];

  // ========================================
  // 状态
  // ========================================
  const state = {
    words: [],
    keywordStats: {},
    currentWord: null,
    soundEnabled: true,
    audioContext: null,
    readHistory: [],
    randomEncounterTimer: null,
    fragmentsAssembled: false
  };

  // ========================================
  // DOM
  // ========================================
  const $ = id => document.getElementById(id);

  // ========================================
  // 初始化
  // ========================================
  async function init() {
    setupCanvases();
    createOceanStars();
    createOceanClouds();
    createLighthouseStars();
    await loadData();
    initTodayQuote();
    generateBottles();
    generatePapers();
    initMosaic();
    bindEvents();
    startRandomEncounter();
    startAmbientSounds();

    setTimeout(() => {
      $('mainLoading')?.remove();
      $('scrollGuide1')?.classList.add('visible');
    }, 3200);
  }

  // ========================================
  // 数据
  // ========================================
  async function loadData() {
    try {
      const [statsRes, wordsRes] = await Promise.all([
        fetch(`${API_BASE}/word-stats`),
        fetch(`${API_BASE}/words`)
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        state.keywordStats = {};
        data.keywords.forEach(item => {
          state.keywordStats[item.word.toUpperCase()] = item.count;
        });
      }

      if (wordsRes.ok) {
        state.words = await wordsRes.json();
      }
    } catch (e) {}

    if (Object.keys(state.keywordStats).length === 0) {
      const samples = generateSamples();
      samples.forEach(w => state.words.push(w));
      MOSAIC_KEYWORDS.forEach(kw => {
        const count = samples.filter(s =>
          (s.body_en || '').toLowerCase().includes(kw.toLowerCase())
        ).length;
        state.keywordStats[kw] = count;
      });
    }

    // 更新总数
    const total = $('lhTotalCount');
    if (total) total.textContent = state.words.length || '960';
  }

  function generateSamples() {
    return [
      'I love you all.', 'Tell my family I love them.', 'May God forgive me.',
      'I am sorry.', 'Thank you for being kind.', 'Remember me kindly.',
      'Take care of the children.', 'I hope you find peace.',
      'Don\'t be sad for me.', 'I\'m ready to go home.',
      'Family is everything.', 'Forgive those who hurt you.',
      'Love is stronger than death.', 'Be good to each other.',
      'I wish I could say goodbye.', 'The sun will rise again.',
      'Hold onto hope.', 'Thank you for everything.',
      'I forgive everyone.', 'Please hug my kids.',
      'Tell my sister I\'m sorry.', 'I love you, Sarah.',
      'Be strong.', 'Home is where the heart is.',
      'I miss the ocean.', 'Live, laugh, love.',
      'Don\'t give up.', 'Find your happiness.',
      'God bless you all.', 'My mother was the best.',
      'I love my mother.', 'Take care of everyone.'
    ].map((text, i) => ({ id: i + 1, body_en: text, emotion: classifyEmotion(text) }));
  }

  function classifyEmotion(text) {
    const lower = text.toLowerCase();
    for (const [emotion, kws] of Object.entries(EMOTION_KEYWORDS)) {
      for (const kw of kws) {
        if (lower.includes(kw)) return emotion;
      }
    }
    return 'default';
  }

  // ========================================
  // 今日海浪
  // ========================================
  function initTodayQuote() {
    if (state.words.length === 0) return;
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const index = seed % state.words.length;
    const quote = state.words[index];
    const el = $('todayQuoteText');
    if (el && quote) el.textContent = `"${quote.body_en}"`;
  }

  // ========================================
  // 海面漂浮物
  // ========================================
  function generateBottles() {
    const container = $('bottlesContainer');
    if (!container || state.words.length === 0) return;
    container.innerHTML = '';
    const count = Math.min(25, state.words.length);
    const selected = state.words.slice(0, count);

    selected.forEach((word, i) => {
      const el = document.createElement('div');
      el.className = 'ocean-bottle-item';
      el.style.setProperty('--rot', (-12 + Math.random() * 24) + 'deg');
      el.style.setProperty('--dur', (4 + Math.random() * 4) + 's');
      el.style.setProperty('--amp', (4 + Math.random() * 8) + 'px');
      el.style.left = (8 + Math.random() * 80) + '%';
      el.style.top = (15 + Math.random() * 65) + '%';

      el.innerHTML = `
        <svg class="bottle-svg" viewBox="0 0 40 60" width="${30 + Math.random() * 20}" height="${45 + Math.random() * 30}">
          <rect x="14" y="2" width="12" height="12" rx="2" fill="#c9a66b"/>
          <path d="M10 14 L10 48 Q10 56 20 56 Q30 56 30 48 L30 14 Z" fill="rgba(200,220,255,0.2)" stroke="rgba(255,255,255,0.3)"/>
          <rect x="16" y="22" width="8" height="18" rx="1" fill="#f4e9d9" opacity="0.5"/>
        </svg>
        <div class="bottle-preview-hint">click</div>
      `;
      el.addEventListener('click', () => openBottle(word));
      container.appendChild(el);
    });
  }

  function generatePapers() {
    const container = $('papersContainer');
    if (!container || state.words.length === 0) return;
    container.innerHTML = '';
    const count = Math.min(12, state.words.length / 2);

    for (let i = 0; i < count; i++) {
      const word = state.words[Math.floor(Math.random() * state.words.length)];
      const el = document.createElement('div');
      el.className = 'ocean-paper-item';
      el.style.setProperty('--dur', (12 + Math.random() * 12) + 's');
      el.style.setProperty('--drift', (15 + Math.random() * 35) + 'px');
      el.style.setProperty('--drop', (-10 + Math.random() * 20) + 'px');
      el.style.setProperty('--rot', (-12 + Math.random() * 24) + 'deg');
      el.style.left = (10 + Math.random() * 75) + '%';
      el.style.top = (25 + Math.random() * 55) + '%';
      el.innerHTML = `<span class="paper-text">${(word.body_en || '').substring(0, 12)}</span>`;
      el.addEventListener('click', () => openBottle(word));
      container.appendChild(el);
    }
  }

  // ========================================
  // 打开漂流瓶
  // ========================================
  function openBottle(word) {
    if (!word) return;
    state.currentWord = word;
    state.readHistory.push(word.id);

    const text = word.body_en || '';
    $('modalText').textContent = text;

    // 木塞动画
    $('modalCork').style.animation = 'none';
    setTimeout(() => $('modalCork').style.animation = '', 50);

    // 海的回应
    const emotion = classifyEmotion(text);
    const responses = SEA_RESPONSES[emotion] || SEA_RESPONSES.default;
    $('seaResponseText').textContent = responses[Math.floor(Math.random() * responses.length)];

    // 回声墙
    showEchoWall(word);

    $('bottleModal')?.classList.add('active');
    $('modalEcho')?.classList.add('visible');
    playSound('cork');
  }

  function showEchoWall(word) {
    const ripple = $('echoRings');
    const papers = $('echoPapers');
    const center = $('echoCenter');

    if (!ripple || !papers) return;

    // 中心文字
    if (center) {
      center.innerHTML = (word.body_en || '').substring(0, 12) + '...';
    }

    // 涟漪
    ripple.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const ring = document.createElement('div');
      ring.className = 'echo-ring';
      ripple.appendChild(ring);
    }

    // 回声纸片
    const echoes = findEchoes(word, 5);
    papers.innerHTML = '';

    echoes.forEach((echo, i) => {
      const paper = document.createElement('div');
      paper.className = 'echo-paper-item';
      paper.innerHTML = (echo.body_en || '').substring(0, 18);
      const angle = (i / echoes.length) * Math.PI * 2 - Math.PI / 2;
      const dist = 72 + i * 6;
      paper.style.left = (100 + Math.cos(angle) * dist - 45) + 'px';
      paper.style.top = (100 + Math.sin(angle) * dist - 12) + 'px';
      paper.addEventListener('click', () => openBottle(echo));
      papers.appendChild(paper);
    });
  }

  function findEchoes(word, count) {
    const text = (word.body_en || '').toLowerCase();
    const kws = extractKeywords(text);

    if (kws.length === 0) {
      return state.words.filter(w => w.id !== word.id).sort(() => Math.random() - 0.5).slice(0, count);
    }

    return state.words.filter(w => w.id !== word.id).map(w => {
      const wt = (w.body_en || '').toLowerCase();
      let score = kws.filter(k => wt.includes(k)).length;
      return { ...w, score };
    }).filter(w => w.score > 0).sort((a, b) => b.score - a.score).slice(0, count);
  }

  function extractKeywords(text) {
    return ['love', 'family', 'mother', 'home', 'peace', 'forgive', 'thank', 'god', 'friend', 'hope', 'children', 'kids'].filter(k => text.includes(k));
  }

  function closeModal() {
    $('bottleModal')?.classList.remove('active');
    $('modalEcho')?.classList.remove('visible');
  }

  // ========================================
  // 投递烦恼
  // ========================================
  function submitLetter() {
    const text = $('letterText')?.value?.trim();
    if (!text) return;

    $('bottleAnimPaper').textContent = text.substring(0, 30);

    const anim = $('bottleAnimation');
    anim?.classList.add('active');

    setTimeout(() => {
      anim?.classList.remove('active');
      showExchangeResult();
    }, 3200);
  }

  function showExchangeResult() {
    const quote = state.words[Math.floor(Math.random() * state.words.length)];
    if (!quote) return;

    $('exchangeQuote').textContent = quote.body_en || '';
    $('exchangeResult')?.classList.add('active');

    // 更新记录
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

    $('recordDate').textContent = dateStr;
    $('recordContent').textContent = `我把一件烦恼交给了大海。海浪送回一句：${quote.body_en}`;
    $('myRecord')?.classList.add('visible');

    playSound('splash');
  }

  function closeExchange() {
    $('exchangeResult')?.classList.remove('active');
    $('letterText').value = '';
  }

  // ========================================
  // 随机相遇
  // ========================================
  function startRandomEncounter() {
    if (state.randomEncounterTimer) clearTimeout(state.randomEncounterTimer);

    state.randomEncounterTimer = setTimeout(() => {
      const encounter = $('randomEncounter');
      if (!encounter) return;

      encounter.classList.add('active');
      playSound('wave');

      setTimeout(() => {
        encounter.classList.remove('active');
        startRandomEncounter();
      }, 8000);
    }, 120000 + Math.random() * 60000);
  }

  // ========================================
  // 拼图
  // ========================================
  function initMosaic() {
    const container = $('lhFragments');
    if (!container) return;

    container.innerHTML = '';
    const sorted = Object.entries(state.keywordStats).sort((a, b) => b[1] - a[1]);
    const total = sorted[0] ? sorted[0][1] : 1;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    const positions = [
      { x: cx, y: cy - 160 }, { x: cx - 45, y: cy - 115 },
      { x: cx + 45, y: cy - 115 }, { x: cx - 70, y: cy - 55 },
      { x: cx + 70, y: cy - 55 }, { x: cx, y: cy - 20 },
      { x: cx - 55, y: cy + 25 }, { x: cx + 55, y: cy + 25 },
      { x: cx - 30, y: cy + 70 }, { x: cx + 30, y: cy + 70 },
      { x: cx, y: cy + 115 }, { x: cx - 50, y: cy + 160 },
      { x: cx + 50, y: cy + 160 }, { x: cx - 80, y: cy + 200 },
      { x: cx + 80, y: cy + 200 }
    ];

    sorted.slice(0, 15).forEach(([word, count], i) => {
      const size = getSize(count, total);
      const startX = (i % 2 === 0 ? -100 : window.innerWidth + 100);
      const startY = Math.random() * window.innerHeight;
      const target = positions[i % positions.length];

      const frag = document.createElement('div');
      frag.className = `lh-fragment frag-size-${size}`;
      frag.dataset.word = word;
      frag.dataset.count = count;
      frag.innerHTML = `<span class="lh-frag-text">${word}</span>`;
      frag.style.left = startX + 'px';
      frag.style.top = startY + 'px';

      frag.addEventListener('click', () => showWordDetail(word, count));
      container.appendChild(frag);

      // 延迟聚合
      setTimeout(() => {
        frag.classList.add('visible');
        setTimeout(() => {
          frag.style.left = target.x + 'px';
          frag.style.top = target.y + 'px';
          frag.classList.add('assembled');
        }, 100);
      }, 800 + i * 250);
    });

    // 底部统计
    const footer = $('lhFooterStats');
    if (footer) {
      footer.innerHTML = sorted.slice(0, 8).map(([word, count]) => `
        <div class="lh-stat">
          <span class="lh-stat-word">${word}</span>
          <span class="lh-stat-count">${count} times</span>
        </div>
      `).join('');
    }

    setTimeout(() => container.classList.add('active'), 500);
    state.fragmentsAssembled = true;
  }

  function getSize(count, max) {
    const r = count / max;
    if (r > 0.75) return 'xl';
    if (r > 0.5) return 'lg';
    if (r > 0.25) return 'md';
    if (r > 0.1) return 'sm';
    return 'xs';
  }

  function showWordDetail(word, count) {
    $('wordMain').textContent = word;
    $('wordCountDisplay').innerHTML = `<span class="count-num">${count}</span><span class="count-label">times</span>`;

    const related = state.words
      .filter(w => (w.body_en || '').toLowerCase().includes(word.toLowerCase()))
      .slice(0, 5);

    const sent = $('wordSentences');
    if (sent) {
      sent.innerHTML = related.length > 0
        ? related.map(w => `<div class="word-sentence">${w.body_en || ''}</div>`).join('')
        : '<div class="word-sentence" style="color:rgba(244,233,217,0.35);text-align:center">No matching records</div>';
    }

    $('wordModal')?.classList.add('active');

    document.querySelectorAll('.lh-fragment').forEach(f => f.classList.remove('glowing'));
    document.querySelectorAll('.lh-fragment').forEach(f => {
      if (f.dataset.word === word) f.classList.add('glowing');
    });
  }

  function closeWordDetail() {
    $('wordModal')?.classList.remove('active');
    document.querySelectorAll('.lh-fragment').forEach(f => f.classList.remove('glowing'));
  }

  // ========================================
  // 背景画布
  // ========================================
  function setupCanvases() {
    const canvas = $('particleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = [];
    for (let i = 0; i < 45; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 1 + Math.random() * 1.5,
        speedX: -0.08 + Math.random() * 0.16,
        speedY: -0.04 + Math.random() * 0.08,
        opacity: 0.06 + Math.random() * 0.1,
        pulse: Math.random() * Math.PI * 2
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.012;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        const op = p.opacity * (0.7 + Math.sin(p.pulse) * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 220, ${op})`;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }
    animate();
  }

  function createOceanStars() {
    const container = $('oceanStars');
    if (!container) return;
    for (let i = 0; i < 50; i++) {
      const star = document.createElement('div');
      star.className = 'ocean-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 100 + '%';
      star.style.width = (1 + Math.random() * 2) + 'px';
      star.style.height = star.style.width;
      star.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
      container.appendChild(star);
    }
  }

  function createOceanClouds() {
    const container = $('oceanClouds');
    if (!container) return;
    for (let i = 0; i < 4; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'ocean-cloud';
      cloud.style.width = (150 + Math.random() * 150) + 'px';
      cloud.style.height = (35 + Math.random() * 30) + 'px';
      cloud.style.top = (5 + Math.random() * 20) + '%';
      cloud.style.setProperty('--dur', (80 + Math.random() * 50) + 's');
      cloud.style.animationDelay = -(Math.random() * 80) + 's';
      container.appendChild(cloud);
    }
  }

  function createLighthouseStars() {
    const container = $('lhStars');
    if (!container) return;
    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div');
      star.className = 'ocean-star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 80 + '%';
      star.style.width = (1 + Math.random() * 2) + 'px';
      star.style.height = star.style.width;
      star.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
      container.appendChild(star);
    }
  }

  // ========================================
  // 导航
  // ========================================
  function updateNav() {
    const scrollY = window.scrollY;
    const wh = window.innerHeight;
    const spaces = [1, 2, 3, 4];
    let active = 1;

    if (scrollY < wh * 0.5) active = 1;
    else if (scrollY < wh * 1.5) active = 2;
    else if (scrollY < wh * 2.5) active = 3;
    else active = 4;

    document.querySelectorAll('.nav-dot').forEach(dot => {
      const s = parseInt(dot.dataset.space);
      dot.classList.toggle('active', s === active);
    });
  }

  // ========================================
  // 音效
  // ========================================
  function initAudio() {
    if (state.audioContext) return;
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    initAudio();
    const ctx = state.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (type) {
      case 'cork': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(500, now);
        o.frequency.exponentialRampToValueAtTime(250, now + 0.12);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        o.start(now); o.stop(now + 0.2);
        break;
      }
      case 'splash': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(700, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.25);
        g.gain.setValueAtTime(0.06, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        o.start(now); o.stop(now + 0.3);
        break;
      }
      case 'wave': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          const t = i / ctx.sampleRate;
          d[i] = (Math.random() * 2 - 1) * 0.08 * Math.exp(-t * 0.4);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 350;
        const g = ctx.createGain();
        g.gain.value = 0.12;
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(now);
        break;
      }
      case 'paper': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.4;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.06;
        src.connect(g); g.connect(ctx.destination);
        src.start(now);
        break;
      }
    }
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    const btn = $('soundBtn');
    if (btn) {
      btn.textContent = state.soundEnabled ? '🔊' : '🔇';
      btn.classList.toggle('muted', !state.soundEnabled);
    }
  }

  function startAmbientSounds() {
    setInterval(() => {
      if (state.soundEnabled && Math.random() > 0.4) playSound('wave');
    }, 15000);
  }

  // ========================================
  // 事件
  // ========================================
  function bindEvents() {
    // 导航
    document.querySelectorAll('.nav-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const space = parseInt(dot.dataset.space);
        const wh = window.innerHeight;
        window.scrollTo({ top: (space - 1) * wh, behavior: 'smooth' });
      });
    });

    // 滚动
    window.addEventListener('scroll', updateNav);

    // 漂流瓶
    $('modalClose')?.addEventListener('click', closeModal);
    $('choiceKeep')?.addEventListener('click', () => {
      closeModal();
      showToast('留在了心里 💫');
    });
    $('choiceReturn')?.addEventListener('click', () => {
      closeModal();
      playSound('splash');
      showToast('瓶子漂回了海里 🌊');
    });

    // 投递
    $('letterSubmit')?.addEventListener('click', submitLetter);
    $('exchangeClose')?.addEventListener('click', closeExchange);

    // 声音
    $('soundBtn')?.addEventListener('click', toggleSound);

    // 拼图详情
    $('wordClose')?.addEventListener('click', closeWordDetail);
    $('wordModal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('word-backdrop')) closeWordDetail();
    });

    // 漂流瓶模态框背景
    $('bottleModal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) closeModal();
    });

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeWordDetail();
        closeExchange();
      }
    });

    // 鼠标移动 - 碎片浮动
    document.addEventListener('mousemove', handleFragmentsFloat);
  }

  let mouseX = 0, mouseY = 0;
  function handleFragmentsFloat(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    document.querySelectorAll('.lh-fragment.assembled').forEach((frag, i) => {
      const rect = frag.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (mouseX - cx) * 0.015;
      const dy = (mouseY - cy) * 0.015;
      const ox = dx * Math.sin(Date.now() / 1200 + i);
      const oy = dy * Math.cos(Date.now() / 1200 + i);
      frag.style.transform = `translate(${ox}px, ${oy}px)`;
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      padding: 14px 30px;
      background: rgba(10,10,20,0.9);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 25px;
      color: #f4e9d9;
      font-family: 'Noto Serif SC', serif;
      font-size: 0.95rem;
      z-index: 600;
      animation: toastAnim 2.5s ease forwards;
    `;
    if (!document.getElementById('tStyle')) {
      const s = document.createElement('style');
      s.id = 'tStyle';
      s.textContent = `@keyframes toastAnim{0%{transform:translate(-50%,-50%) scale(0.8);opacity:0}15%{transform:translate(-50%,-50%) scale(1.05);opacity:1}85%{opacity:1}100%{transform:translate(-50%,-50%) scale(0.8);opacity:0}}`;
      document.head.appendChild(s);
    }
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // ========================================
  // 启动
  // ========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
