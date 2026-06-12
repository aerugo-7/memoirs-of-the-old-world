/**
 * 遗言拼图 - 人类最后的话
 * 如果把960个人最后的话拼在一起
 */

(function() {
  'use strict';

  const API_BASE = '/api';

  // 关键词配置
  const KEYWORDS = [
    'LOVE', 'FAMILY', 'MOTHER', 'HOME', 'PEACE', 
    'THANK', 'FORGIVE', 'GOD', 'FRIEND', 'HOPE',
    'CHILDREN', 'WIFE', 'SON', 'DAUGHTER', 'KIDS'
  ];

  const state = {
    words: [],
    keywordStats: {},
    fragments: [],
    assembled: false
  };

  const $ = id => document.getElementById(id);

  async function init() {
    createStars();
    setupParticleCanvas();
    await loadData();
    computeKeywordStats();
    generateFragments();
    bindEvents();
    
    setTimeout(() => {
      $('loadingOverlay')?.remove();
      showSubtitle();
      startAssembly();
    }, 3000);
  }

  // 计算关键词出现次数
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
      
      KEYWORDS.forEach(kw => {
        const count = samples.filter(s => 
          (s.body_en || '').toLowerCase().includes(kw.toLowerCase())
        ).length;
        state.keywordStats[kw] = count;
      });
    }
  }

  function generateSamples() {
    const samples = [
      'I love you all.',
      'Tell my family I love them.',
      'May God forgive me.',
      'I am sorry.',
      'Thank you for being kind.',
      'Remember me kindly.',
      'Take care of the children.',
      'I hope you find peace.',
      'Don\'t be sad for me.',
      'I\'m ready to go home.',
      'Family is everything.',
      'Forgive those who hurt you.',
      'Love is stronger than death.',
      'Be good to each other.',
      'I wish I could say goodbye.',
      'The sun will rise again.',
      'Hold onto hope.',
      'Thank you for everything.',
      'I forgive everyone.',
      'Please hug my kids.',
      'Tell my sister I\'m sorry.',
      'I love you, Sarah.',
      'Be strong.',
      'Home is where the heart is.',
      'I miss the ocean.',
      'Live, laugh, love.',
      'Don\'t give up.',
      'Find your happiness.',
      'God bless you all.',
      'My mother was the best.',
      'I love my mother.'
    ];
    return samples.map((text, i) => ({ id: i + 1, body_en: text }));
  }

  function computeKeywordStats() {
    state.keywordStats = {};
    
    KEYWORDS.forEach(kw => {
      const count = state.words.filter(w => {
        const text = (w.body_en || '').toLowerCase();
        return text.includes(kw.toLowerCase());
      }).length;
      state.keywordStats[kw] = count;
    });

    // 排序
    const sorted = Object.entries(state.keywordStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    renderFooterStats(sorted);
  }

  function renderFooterStats(stats) {
    const container = $('footerStats');
    if (!container) return;

    container.innerHTML = stats.map(([word, count]) => `
      <div class="footer-stat">
        <span class="stat-word">${word}</span>
        <span class="stat-count">${count} times</span>
      </div>
    `).join('');
  }

  function showSubtitle() {
    const subtitle = $('headerSubtitle');
    if (!subtitle) return;

    const topWord = Object.entries(state.keywordStats)
      .sort((a, b) => b[1] - a[1])[0];

    subtitle.style.opacity = '0';
    subtitle.textContent = `如果把${state.words.length}个人最后的话拼在一起，他们最常说的是：${topWord ? topWord[0] : 'LOVE'}`;
    
    setTimeout(() => {
      subtitle.style.transition = 'opacity 1.5s ease';
      subtitle.style.opacity = '1';
    }, 100);
  }

  // 生成词语碎片
  function generateFragments() {
    const container = $('floatingWords');
    if (!container) return;

    container.innerHTML = '';
    state.fragments = [];

    // 按频率排序
    const sorted = Object.entries(state.keywordStats)
      .sort((a, b) => b[1] - a[1]);

    const stageW = window.innerWidth;
    const stageH = window.innerHeight;

    sorted.forEach(([word, count], index) => {
      const size = getSize(count, sorted[0][1]);
      
      // 随机起始位置（散布在屏幕四周）
      let startX, startY;
      const edge = index % 4;
      switch (edge) {
        case 0: startX = Math.random() * stageW; startY = -50; break;
        case 1: startX = stageW + 50; startY = Math.random() * stageH; break;
        case 2: startX = Math.random() * stageW; startY = stageH + 50; break;
        case 3: startX = -50; startY = Math.random() * stageH; break;
      }

      // 目标位置（灯塔形状内）
      const target = getLighthousePosition(index, sorted.length);

      const fragment = document.createElement('div');
      fragment.className = `word-fragment word-size-${size}`;
      fragment.dataset.word = word;
      fragment.dataset.count = count;
      fragment.textContent = word;
      fragment.style.left = startX + 'px';
      fragment.style.top = startY + 'px';
      fragment.style.opacity = '0';
      fragment.style.transform = 'scale(0.5)';

      // 动画延迟
      setTimeout(() => {
        fragment.style.opacity = '1';
        fragment.style.transform = 'scale(1)';
      }, 500 + index * 200);

      container.appendChild(fragment);
      state.fragments.push({ element: fragment, word, count, startX, startY, target });
    });
  }

  function getSize(count, max) {
    const ratio = count / max;
    if (ratio > 0.8) return 'xl';
    if (ratio > 0.5) return 'lg';
    if (ratio > 0.25) return 'md';
    if (ratio > 0.1) return 'sm';
    return 'xs';
  }

  function getLighthousePosition(index, total) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2 - 30;

    // 灯塔形状的分布
    const positions = [
      // 灯塔顶部（最大词）
      { x: cx, y: cy - 150, priority: 1 },
      { x: cx - 30, y: cy - 120, priority: 2 },
      { x: cx + 30, y: cy - 120, priority: 2 },
      // 中部
      { x: cx - 50, y: cy - 60, priority: 3 },
      { x: cx + 50, y: cy - 60, priority: 3 },
      { x: cx, y: cy - 30, priority: 4 },
      { x: cx - 60, y: cy + 10, priority: 5 },
      { x: cx + 60, y: cy + 10, priority: 5 },
      // 下部
      { x: cx - 40, y: cy + 60, priority: 6 },
      { x: cx + 40, y: cy + 60, priority: 6 },
      { x: cx, y: cy + 90, priority: 7 },
      { x: cx - 30, y: cy + 130, priority: 8 },
      { x: cx + 30, y: cy + 130, priority: 8 },
    ];

    const pos = positions[index % positions.length];
    return { x: pos.x, y: pos.y };
  }

  // 开始聚合动画
  function startAssembly() {
    const stage = $('mosaicStage');
    const lighthouse = $('lighthouseOutline');
    
    stage.classList.add('active');

    state.fragments.forEach((frag, index) => {
      setTimeout(() => {
        const { element, target } = frag;
        
        element.classList.add('visible');
        
        // 移动到目标位置
        setTimeout(() => {
          element.style.left = target.x + 'px';
          element.style.top = target.y + 'px';
          element.classList.add('assembled');
        }, 100);
      }, 800 + index * 300);
    });

    // 灯塔显现
    setTimeout(() => {
      lighthouse.classList.add('visible');
    }, 500 + state.fragments.length * 300);

    state.assembled = true;
  }

  // 显示词语详情
  function showWordDetail(word, count) {
    const modal = $('wordDetail');
    $('detailWord').textContent = word;
    $('detailCount').textContent = count;

    // 查找相关句子
    const related = state.words
      .filter(w => (w.body_en || '').toLowerCase().includes(word.toLowerCase()))
      .slice(0, 5);

    const container = $('detailSentences');
    if (related.length > 0) {
      container.innerHTML = related.map(w => 
        `<div class="detail-sentence">${w.body_en || ''}</div>`
      ).join('');
    } else {
      container.innerHTML = '<div class="detail-sentence" style="color:rgba(244,233,217,0.4);text-align:center">No matching records found</div>';
    }

    modal.classList.add('active');
  }

  function closeWordDetail() {
    $('wordDetail')?.classList.remove('active');
  }

  // 事件绑定
  function bindEvents() {
    // 碎片点击
    $('floatingWords')?.addEventListener('click', (e) => {
      const fragment = e.target.closest('.word-fragment');
      if (fragment) {
        const word = fragment.dataset.word;
        const count = parseInt(fragment.dataset.count);
        showWordDetail(word, count);

        // 高亮效果
        document.querySelectorAll('.word-fragment').forEach(f => f.classList.remove('glowing'));
        fragment.classList.add('glowing');
      }
    });

    // 关闭详情
    $('detailClose')?.addEventListener('click', () => {
      closeWordDetail();
      document.querySelectorAll('.word-fragment').forEach(f => f.classList.remove('glowing'));
    });

    $('wordDetail')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('detail-backdrop')) {
        closeWordDetail();
        document.querySelectorAll('.word-fragment').forEach(f => f.classList.remove('glowing'));
      }
    });

    // 鼠标移动 - 碎片轻微漂浮
    document.addEventListener('mousemove', handleMouseMove);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeWordDetail();
        document.querySelectorAll('.word-fragment').forEach(f => f.classList.remove('glowing'));
      }
    });
  }

  let mouseX = 0, mouseY = 0;
  function handleMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    state.fragments.forEach((frag, index) => {
      const { element } = frag;
      if (!element.classList.contains('assembled')) return;

      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = (mouseX - cx) * 0.02;
      const dy = (mouseY - cy) * 0.02;

      const offsetX = dx * Math.sin(Date.now() / 1000 + index);
      const offsetY = dy * Math.cos(Date.now() / 1000 + index);

      element.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
  }

  // 背景星空
  function createStars() {
    const container = $('starsContainer');
    if (!container) return;

    for (let i = 0; i < 60; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      star.style.left = Math.random() * 100 + '%';
      star.style.top = Math.random() * 80 + '%';
      star.style.width = (1 + Math.random() * 2) + 'px';
      star.style.height = star.style.width;
      star.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
      container.appendChild(star);
    }
  }

  function setupParticleCanvas() {
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
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 1 + Math.random() * 1.5,
        speedX: -0.1 + Math.random() * 0.2,
        speedY: -0.05 + Math.random() * 0.1,
        opacity: 0.06 + Math.random() * 0.1,
        pulse: Math.random() * Math.PI * 2
      });
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.pulse += 0.015;

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

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
