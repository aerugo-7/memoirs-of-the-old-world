/**
 * Memory Table - 记忆餐桌
 * 沉浸式叙事体验
 * 记忆整理员 · 档案重建 · 人物画像
 */

(function() {
  'use strict';

  // 配置
  const API_BASE = '/api';
  
  // 本地图片路径
  const LOCAL_IMAGES = {
    recipe: '../../临终笔记/临终/墓地食谱/',
    story: '../../临终笔记/临终/墓地故事/'
  };

  // 状态
  const state = {
    profile: {
      recorded: []
    },
    clues: {
      coffee: false,
      letter: false,
      photo: false,
      recipe: false,
      words: false
    },
    progress: 0,
    started: false,
    currentCard: null
  };

  // 档案分析模板
  const ANALYSIS_TEMPLATES = {
    coffee: [
      '这份菜单中出现了大量甜食。在数据库中，类似菜单经常与：家庭、陪伴、怀念 相关联。',
      '菜单显示主人偏好家常菜式。这往往意味着：重视生活质感、珍惜日常温暖。',
      '主菜的搭配显示出对仪式感的重视。这类饮食习惯通常与：热爱生活、注重品质 相关。',
      '这份菜单中有明显的地域特色。说明主人：重视根源、珍惜传统。'
    ],
    letter: [
      '这封信中频繁出现：感谢、母亲、回家 等词语。人物画像增加：重视家庭。',
      '信中多次表达对亲友的牵挂。这说明主人：善于表达情感、重视人际关系。',
      '信的语气温和而真挚。这通常意味着：内心细腻、懂得感恩。',
      '信中提到的生活细节很多。说明主人：热爱生活、珍惜当下。'
    ],
    photo: [
      '照片中出现了家庭聚会的场景。在数据库中，这类照片经常与：温暖、陪伴 相关。',
      '照片摄于一个特别的地点。背后的故事显示出：对特定时光的珍视。',
      '照片中的人物表情都很自然。这通常意味着：重视人际关系、珍惜相聚。',
      '照片被精心保存。说明主人：怀念过去、珍视回忆。'
    ],
    recipe: [
      '这份食谱被保留了几十年。说明主人非常珍视这段记忆。',
      '食谱中有很多手写批注。这显示：热爱烹饪、乐于分享。',
      '食谱包含了多种菜系。说明主人：开放包容、热爱探索。',
      '食谱首页被翻得最旧。显示主人对这道菜有特殊情感。'
    ],
    words: [
      '这些话语中充满了对生活的热爱。',
      '话语中多次提到：感恩、珍惜、陪伴。',
      '零散的话语碎片，显示出主人细腻的内心世界。'
    ]
  };

  // DOM工具
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const $one = sel => document.querySelector(sel);

  // 初始化
  function init() {
    createDustParticles();
    setupIntro();
    
    // 等待DOM加载完成后绑定事件
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
    
    fadeOutLoading();
  }

  function onReady() {
    bindEvents();
  }

  // 加载动画
  function fadeOutLoading() {
    setTimeout(() => {
      const loading = $('loadingScreen');
      if (loading) loading.classList.add('fade-out');
      
      setTimeout(() => {
        const intro = $('archiveIntro');
        if (intro) intro.classList.add('active');
        setArchiveDate();
      }, 1500);
    }, 2000);
  }

  function setArchiveDate() {
    const el = $('archiveDate');
    if (el) {
      const now = new Date();
      el.textContent = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    }
  }

  // 开场设置
  function setupIntro() {
    const el = $('archiveId');
    if (el) {
      const archiveNum = Math.floor(Math.random() * 900) + 100;
      el.textContent = `MT-${archiveNum}`;
    }
  }

  // 开始探索
  function startExploration() {
    const intro = $('archiveIntro');
    if (intro) intro.classList.add('fade-out');
    
    setTimeout(() => {
      if (intro) intro.style.display = 'none';
      
      const container = $('sceneContainer');
      if (container) container.classList.add('active');
      
      state.started = true;
      showHotspots();
      showHUDs();
      showExplorationGuide();
    }, 1000);
  }

  function showHotspots() {
    $$('.hotspot').forEach((h, i) => {
      setTimeout(() => h.classList.add('visible'), i * 200);
    });
  }

  function showHUDs() {
    setTimeout(() => {
      const hud = $('archiveHud');
      const profile = $('profileHud');
      if (hud) hud.classList.add('visible');
      if (profile) profile.classList.add('visible');
    }, 500);
  }

  // 探索引导提示
  function showExplorationGuide() {
    const guide = document.createElement('div');
    guide.id = 'explorationGuide';
    guide.innerHTML = `
      <div class="guide-content">
        <p>探索餐桌上的物品</p>
        <div class="guide-icons">
          <span title="咖啡杯">☕</span>
          <span title="信封">💌</span>
          <span title="照片">📷</span>
          <span title="菜谱">📖</span>
          <span title="遗言">🍇</span>
        </div>
        <p class="guide-hint">点击闪烁的物品开始探索</p>
      </div>
    `;
    document.body.appendChild(guide);
    
    // 3秒后淡出
    setTimeout(() => {
      guide.classList.add('fade-out');
      setTimeout(() => guide.remove(), 1000);
    }, 5000);
  }

  // 灰尘粒子
  function createDustParticles() {
    const container = $('dustContainer');
    if (!container) return;
    
    for (let i = 0; i < 25; i++) {
      const dust = document.createElement('div');
      dust.className = 'dust';
      dust.style.left = Math.random() * 100 + '%';
      dust.style.top = Math.random() * 100 + '%';
      dust.style.animationDuration = (15 + Math.random() * 20) + 's';
      dust.style.animationDelay = Math.random() * 10 + 's';
      dust.style.opacity = 0.15 + Math.random() * 0.25;
      container.appendChild(dust);
    }
  }

  // 事件绑定
  function bindEvents() {
    // 开始按钮
    const startBtn = $('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', startExploration);
    }
    
    // 热点点击 - 使用事件委托
    document.addEventListener('click', function(e) {
      const hotspot = e.target.closest('.hotspot');
      if (hotspot) {
        const scene = hotspot.dataset.scene;
        if (scene) openCard(scene);
      }
      
      // 叙事按钮
      const revealBtn = e.target.closest('.narrative-btn');
      if (revealBtn) {
        const id = revealBtn.id;
        if (id === 'revealCoffee') revealCoffee();
        else if (id === 'revealLetter') revealLetter();
        else if (id === 'revealPhoto') revealPhoto();
        else if (id === 'revealRecipe') revealRecipe();
        else if (id === 'revealWords') revealWords();
      }
      
      // 关闭按钮
      const closeBtn = e.target.closest('.card-close');
      if (closeBtn) {
        const closeId = closeBtn.dataset.close;
        if (closeId) closeCard(closeId);
      }
      
      // 记录按钮
      const recordBtn = e.target.closest('.record-btn');
      if (recordBtn && !recordBtn.classList.contains('recorded')) {
        const tags = recordBtn.dataset.tag?.split(',') || [];
        const type = recordBtn.dataset.type;
        if (type) recordTags(type, tags);
        recordBtn.classList.add('recorded');
        recordBtn.textContent = '已记录 ✓';
      }
      
      // 照片翻转
      const photoFrame = e.target.closest('.photo-flip-container');
      if (photoFrame && state.currentCard === 'photo') {
        flipPhoto();
      }
      
      // 食谱列表项
      const recipeItem = e.target.closest('.recipe-list-item[data-id]');
      if (recipeItem) {
        const id = recipeItem.dataset.id;
        const name = recipeItem.textContent;
        loadRecipeDetail(id, name);
        $$('.recipe-list-item').forEach(i => i.classList.remove('active'));
        recipeItem.classList.add('active');
      }
    });
    
    // 键盘ESC
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.currentCard) {
        closeCard(state.currentCard);
      }
    });
  }

  // 纸卡操作
  function openCard(scene) {
    if (state.currentCard && state.currentCard !== scene) {
      closeCard(state.currentCard, false);
    }
    
    const cardId = 'card' + scene.charAt(0).toUpperCase() + scene.slice(1);
    const card = $(cardId);
    
    if (!card) {
      console.warn('Card not found:', cardId);
      return;
    }
    
    state.currentCard = scene;
    card.classList.add('active');
    
    // 标记线索发现
    if (state.clues[scene] === false) {
      state.clues[scene] = true;
      discoverClue(scene);
    }
    
    // 背景变暗
    const bg = $('sceneBg');
    if (bg) bg.style.filter = 'brightness(0.5)';
  }

  function closeCard(scene, animate = true) {
    const cardId = 'card' + scene.charAt(0).toUpperCase() + scene.slice(1);
    const card = $(cardId);
    
    if (!card) return;
    
    card.classList.remove('active');
    state.currentCard = null;
    
    // 重置内容
    resetCardContent(scene);
    
    // 恢复背景
    const bg = $('sceneBg');
    if (bg) bg.style.filter = '';
  }

  function resetCardContent(scene) {
    const narrative = $(scene + 'Narrative');
    const revealed = $(scene + 'Revealed');
    
    if (narrative) narrative.style.display = '';
    if (revealed) revealed.style.display = 'none';
    
    if (scene === 'letter') {
      const envelope = $('letterEnvelope');
      if (envelope) envelope.classList.remove('opened');
    }
    
    if (scene === 'photo') {
      const photoFlip = $('photoFlipContainer');
      const frame = $one('.photo-flip-container .photo-frame');
      if (photoFlip) photoFlip.style.display = 'none';
      if (frame) frame.classList.remove('flipped');
    }
    
    if (scene === 'recipe') {
      const book = $('recipeBook');
      if (book) book.style.display = 'none';
    }
    
    const analysis = $(scene + 'Analysis');
    if (analysis) analysis.style.display = 'none';
    
    const recordBtn = $one(`.record-btn[data-type="${scene}"]`);
    if (recordBtn) {
      recordBtn.classList.remove('recorded');
      recordBtn.textContent = '记录到人物画像';
    }
  }

  // 线索发现
  function discoverClue(type) {
    const clueMap = {
      coffee: 'clueCoffee',
      letter: 'clueLetter',
      photo: 'cluePhoto',
      recipe: 'clueRecipe',
      words: 'clueCoffee'
    };
    
    const clueEl = $(clueMap[type]);
    if (clueEl) clueEl.classList.add('discovered');
    
    updateProgress();
  }

  function updateProgress() {
    const discovered = Object.values(state.clues).filter(Boolean).length;
    const total = Object.keys(state.clues).length;
    const percent = Math.round((discovered / total) * 100);
    
    state.progress = percent;
    
    const fill = $('progressFill');
    const percentEl = $('progressPercent');
    if (fill) fill.style.width = percent + '%';
    if (percentEl) percentEl.textContent = percent;
    
    if (percent >= 100) {
      setTimeout(showFinale, 1500);
    }
  }

  // 人物画像
  function recordTags(type, tags) {
    tags.forEach(tag => {
      if (!state.profile.recorded.includes(tag)) {
        state.profile.recorded.push(tag);
        addProfileTag(tag);
      }
    });
    updateProfileName();
  }

  function addProfileTag(tag) {
    const container = $('profileTags');
    if (!container) return;
    
    const initTag = container.querySelector('.init');
    if (initTag) initTag.remove();
    
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = tag;
    container.appendChild(tagEl);
  }

  function updateProfileName() {
    const count = state.profile.recorded.length;
    let name = '未知';
    
    if (count >= 1 && count < 3) name = '模糊的身影';
    else if (count >= 3 && count < 5) name = '逐渐清晰';
    else if (count >= 5 && count < 7) name = '记忆中的他';
    else if (count >= 7) name = '我们认识的他';
    
    const nameEl = $('profileName');
    if (nameEl) nameEl.textContent = name;
  }

  // ========== 咖啡/菜单 ==========
  async function revealCoffee() {
    const narrative = $('coffeeNarrative');
    const revealed = $('coffeeRevealed');
    
    if (narrative) narrative.style.display = 'none';
    if (revealed) {
      revealed.style.display = '';
      loadCoffeeMenu();
    }
  }

  async function loadCoffeeMenu() {
    const container = $('menuList');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">正在读取档案...</div>';
    
    try {
      const res = await fetch(`${API_BASE}/meals/random?count=6`);
      const meals = await res.json();
      
      if (!meals.length) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">暂无档案</div>';
        return;
      }
      
      container.innerHTML = meals.map(m => `
        <div class="menu-item" data-id="${m.id}">
          <div class="food">${m.food_zh || m.food_en || '未知菜品'}</div>
          ${m.food_en ? `<div class="food-en">${m.food_en}</div>` : ''}
          <div class="meta">${m.region_zh || m.country_zh || ''} ${m.execution_year ? '· ' + m.execution_year : ''}</div>
        </div>
      `).join('');
      
      setTimeout(() => showCoffeeAnalysis(meals), 500);
      
    } catch (e) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">读取失败</div>';
    }
  }

  function showCoffeeAnalysis(meals) {
    const analysisEl = $('coffeeAnalysis');
    const contentEl = $('coffeeAnalysisContent');
    if (!analysisEl || !contentEl) return;
    
    const template = ANALYSIS_TEMPLATES.coffee[Math.floor(Math.random() * ANALYSIS_TEMPLATES.coffee.length)];
    const foods = meals.map(m => (m.food_zh || m.food_en || '')).join(',').toLowerCase();
    
    let foodNote = '';
    if (/蛋糕|派|甜|冰淇|sweet|cake|pie/i.test(foods)) {
      foodNote = '注意到多道甜食，这通常与：温暖、童年记忆、家庭氛围 相关。';
    } else if (/牛排|烤肉|bbq|steak|bbq/i.test(foods)) {
      foodNote = '偏好肉食类料理，这类饮食习惯通常代表：豪爽、重视聚会。';
    } else if (/面|米|饭|noodle|rice|pasta/i.test(foods)) {
      foodNote = '以主食为主，显示：重视日常、珍惜家常味道。';
    }
    
    contentEl.innerHTML = `<p>${template}</p>${foodNote ? `<p style="margin-top: 12px;">${foodNote}</p>` : ''}`;
    analysisEl.style.display = '';
  }

  // ========== 信件 ==========
  async function revealLetter() {
    const narrative = $('letterNarrative');
    const envelope = $('letterEnvelope');
    
    if (narrative) narrative.style.display = 'none';
    if (envelope) {
      envelope.style.display = '';
      loadLetter();
    }
  }

  async function loadLetter() {
    const contentEl = $('letterContent');
    if (!contentEl) return;
    
    try {
      const res = await fetch(`${API_BASE}/letters`);
      const letters = await res.json();
      
      if (!letters.length) {
        contentEl.innerHTML = '<p>暂无档案</p>';
        return;
      }
      
      const letter = letters[Math.floor(Math.random() * letters.length)];
      
      contentEl.innerHTML = `
        <p>"${letter.body_zh}"</p>
        ${letter.location_zh ? `<p class="fragment-source" style="margin-top: 16px;">—— ${letter.location_zh}</p>` : ''}
      `;
      
      analyzeLetter(letter);
      
      setTimeout(() => {
        const envelope = $('letterEnvelope');
        if (envelope) envelope.classList.add('opened');
      }, 600);
      
    } catch (e) {
      contentEl.innerHTML = '<p>读取失败</p>';
    }
  }

  function analyzeLetter(letter) {
    const analysisEl = $('letterAnalysis');
    const contentEl = $('letterAnalysisContent');
    if (!analysisEl || !contentEl) return;
    
    const body = (letter.body_zh || '').toLowerCase();
    const keywords = [];
    
    const keywordMap = {
      '感谢': '懂得感恩',
      '谢谢': '善于表达',
      '母亲': '重视家庭',
      '妈妈': '重视家庭',
      '回家': '珍视归属',
      '爱': '内心温暖',
      '家人': '重视亲情',
      '朋友': '珍视友情'
    };
    
    Object.entries(keywordMap).forEach(([kw, tag]) => {
      if (body.includes(kw)) keywords.push(tag);
    });
    
    const template = ANALYSIS_TEMPLATES.letter[Math.floor(Math.random() * ANALYSIS_TEMPLATES.letter.length)];
    const uniqueKeywords = [...new Set(keywords)];
    
    let keywordNote = '';
    if (uniqueKeywords.length > 0) {
      keywordNote = `<p style="margin-top: 12px;">信中检测到关键词：${uniqueKeywords.slice(0, 3).join('、')}。</p>`;
    }
    
    contentEl.innerHTML = `<p>${template}</p>${keywordNote}`;
    
    setTimeout(() => {
      analysisEl.style.display = '';
    }, 800);
  }

  // ========== 照片 ==========
  async function revealPhoto() {
    const narrative = $('photoNarrative');
    const photoFlip = $('photoFlipContainer');
    
    if (narrative) narrative.style.display = 'none';
    if (photoFlip) {
      photoFlip.style.display = '';
      loadStory();
    }
  }

  async function loadStory() {
    const backContent = $('photoBackContent');
    if (!backContent) return;
    
    try {
      const res = await fetch(`${API_BASE}/stories`);
      const stories = await res.json();
      
      if (!stories.length) {
        backContent.innerHTML = '<p>暂无档案</p>';
        return;
      }
      
      const story = stories[Math.floor(Math.random() * stories.length)];
      
      // 生成图片URL
      let imageHtml = '<div class="photo-placeholder">📷</div>';
      
      // 优先使用数据库图片
      if (story.images && story.images.length > 0) {
        const imgData = arrayBufferToBase64(story.images[0]);
        const mimeType = story.image_mime_types?.[0] || 'image/jpeg';
        imageHtml = `<img src="data:${mimeType};base64,${imgData}" alt="照片" style="width:100%;height:100%;object-fit:cover;">`;
      } else {
        // 使用本地图片 - 使用故事ID作为文件名
        const imgUrl = `${LOCAL_IMAGES.story}story_${story.id}.jpg`;
        imageHtml = `<img src="${imgUrl}" alt="照片" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<div class=photo-placeholder>📷</div>'">`;
      }
      
      // 更新正面
      const front = $one('.photo-flip-container .photo-front');
      if (front) front.innerHTML = imageHtml;
      
      backContent.innerHTML = `
        <div class="title">${story.title_zh || '照片故事'}</div>
        <div class="location">${story.geographic_background_zh || ''}</div>
        <p style="margin-top: 12px; font-size: 0.9rem; line-height: 1.6;">${(story.story_body_zh || '').substring(0, 150)}...</p>
      `;
      
      analyzePhoto(story);
      
    } catch (e) {
      backContent.innerHTML = '<p>读取失败</p>';
    }
  }

  function analyzePhoto(story) {
    const analysisEl = $('photoAnalysis');
    const contentEl = $('photoAnalysisContent');
    if (!analysisEl || !contentEl) return;
    
    const template = ANALYSIS_TEMPLATES.photo[Math.floor(Math.random() * ANALYSIS_TEMPLATES.photo.length)];
    const text = ((story.title_zh || '') + (story.story_body_zh || '')).toLowerCase();
    
    let themeNote = '';
    if (/家庭|家人|团聚|聚会|family/i.test(text)) {
      themeNote = '照片主题涉及家庭场景，这在数据库中通常与：温暖、归属、陪伴 相关。';
    } else if (/节日|圣诞|holiday|christmas/i.test(text)) {
      themeNote = '照片摄于特殊节日。这类记忆通常被特别珍视。';
    } else if (/童年|孩子|child/i.test(text)) {
      themeNote = '照片记录了成长时刻。这类记忆往往承载着：对过去的怀念。';
    } else if (/墓|碑|纪念|grave/i.test(text)) {
      themeNote = '照片与纪念相关。说明主人重视：回忆、感恩、铭记。';
    }
    
    contentEl.innerHTML = `<p>${template}</p>${themeNote ? `<p style="margin-top: 12px;">${themeNote}</p>` : ''}`;
    
    setTimeout(() => {
      analysisEl.style.display = '';
    }, 500);
  }

  function flipPhoto() {
    const frame = $one('.photo-flip-container .photo-frame');
    if (frame) frame.classList.add('flipped');
  }

  // ========== 食谱 ==========
  async function revealRecipe() {
    const narrative = $('recipeNarrative');
    const book = $('recipeBook');
    
    if (narrative) narrative.style.display = 'none';
    if (book) {
      book.style.display = '';
      loadRecipes();
    }
  }

  async function loadRecipes() {
    const listContainer = $('recipeList');
    const detailContainer = $('recipeDetail');
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div class="recipe-list-item">正在翻阅...</div>';
    
    try {
      const res = await fetch(`${API_BASE}/recipes`);
      const recipes = await res.json();
      
      if (!recipes.length) {
        listContainer.innerHTML = '<div class="recipe-list-item">暂无档案</div>';
        return;
      }
      
      listContainer.innerHTML = recipes.map(r => `
        <div class="recipe-list-item" data-id="${r.id}">${r.title_zh || r.recipe_name_zh || '食谱'}</div>
      `).join('');
      
      if (recipes[0]) {
        const firstItem = listContainer.querySelector('.recipe-list-item');
        if (firstItem) firstItem.classList.add('active');
        loadRecipeDetail(recipes[0].id, recipes[0].title_zh || recipes[0].recipe_name_zh);
      }
      
      setTimeout(() => showRecipeAnalysis(recipes), 800);
      
    } catch (e) {
      listContainer.innerHTML = '<div class="recipe-list-item">读取失败</div>';
    }
  }

  async function loadRecipeDetail(id, name) {
    const detailContainer = $('recipeDetail');
    if (!detailContainer) return;
    
    try {
      const res = await fetch(`${API_BASE}/recipes/${id}`);
      const recipe = await res.json();
      
      // 生成图片HTML
      let imageHtml = '';
      
      // 优先使用数据库图片
      if (recipe.images && recipe.images.length > 0) {
        const imgData = arrayBufferToBase64(recipe.images[0]);
        const mimeType = recipe.image_mime_types?.[0] || 'image/jpeg';
        imageHtml = `<div style="margin-bottom: 16px; border-radius: 4px; overflow: hidden; max-height: 200px;"><img src="data:${mimeType};base64,${imgData}" alt="${recipe.title_zh || '食谱图片'}" style="width:100%;object-fit:cover;"></div>`;
      } else {
        // 使用本地图片
        const imgUrl = `${LOCAL_IMAGES.recipe}recipe_${recipe.id}.jpg`;
        imageHtml = `<div style="margin-bottom: 16px; border-radius: 4px; overflow: hidden; max-height: 200px;"><img src="${imgUrl}" alt="${recipe.title_zh || '食谱图片'}" style="width:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"></div>`;
      }
      
      detailContainer.innerHTML = `
        ${imageHtml}
        <h3>${recipe.title_zh || recipe.recipe_name_zh || ''}</h3>
        ${recipe.title_en ? `<p style="font-style: italic; opacity: 0.6; margin-bottom: 12px;">${recipe.title_en}</p>` : ''}
        ${recipe.story_background_zh ? `<p class="story">${recipe.story_background_zh}</p>` : ''}
        ${recipe.recipe_steps_zh ? `<div style="margin-top: 16px; white-space: pre-wrap; line-height: 1.8;">${recipe.recipe_steps_zh}</div>` : ''}
        ${recipe.kitchen_notes_zh ? `<p class="notes">厨房笔记：${recipe.kitchen_notes_zh}</p>` : ''}
      `;
      
    } catch (e) {
      detailContainer.innerHTML = '<p class="recipe-hint">无法加载详情</p>';
    }
  }

  function showRecipeAnalysis(recipes) {
    const analysisEl = $('recipeAnalysis');
    const contentEl = $('recipeAnalysisContent');
    if (!analysisEl || !contentEl) return;
    
    const template = ANALYSIS_TEMPLATES.recipe[Math.floor(Math.random() * ANALYSIS_TEMPLATES.recipe.length)];
    
    const hasNotes = recipes.some(r => r.kitchen_notes_zh);
    const hasStories = recipes.some(r => r.story_background_zh);
    
    let traitNote = '';
    if (hasNotes) {
      traitNote = '食谱中有详细的厨房笔记，说明：细致认真、乐于分享。';
    } else if (hasStories) {
      traitNote = '食谱背后有丰富的故事，说明：重视回忆、珍视传承。';
    }
    
    contentEl.innerHTML = `<p>${template}</p>${traitNote ? `<p style="margin-top: 12px;">${traitNote}</p>` : ''}`;
    analysisEl.style.display = '';
  }

  // ========== 遗言/回忆碎片 ==========
  async function revealWords() {
    const narrative = $('wordsNarrative');
    const revealed = $('wordsRevealed');
    
    if (narrative) narrative.style.display = 'none';
    if (revealed) {
      revealed.style.display = '';
      loadWords();
    }
  }

  async function loadWords() {
    const container = $('fragmentsContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">正在读取档案...</div>';
    
    try {
      const [wordsRes, lettersRes] = await Promise.all([
        fetch(`${API_BASE}/words/random?count=4`),
        fetch(`${API_BASE}/letters`)
      ]);
      
      const words = await wordsRes.json();
      const letters = await lettersRes.json();
      
      const all = [
        ...(words || []).map(w => ({ type: 'word', text: w.body_zh || w.body_en })),
        ...(letters || []).map(l => ({ type: 'letter', text: l.body_zh }))
      ].filter(item => item.text).sort(() => Math.random() - 0.5).slice(0, 6);
      
      if (!all.length) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">暂无档案</div>';
        return;
      }
      
      container.innerHTML = all.map((item, i) => `
        <div class="fragment" style="animation-delay: ${i * 0.1}s">
          <div class="fragment-text">
            "${item.text.substring(0, 100)}${item.text.length > 100 ? '...' : ''}"
            <span class="fragment-source">—— ${item.type === 'word' ? '最后的遗言' : '留下的一封信'}</span>
          </div>
        </div>
      `).join('');
      
      setTimeout(() => showWordsAnalysis(all), 800);
      
    } catch (e) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(42,28,20,0.5);">读取失败</div>';
    }
  }

  function showWordsAnalysis(words) {
    const analysisEl = $('wordsAnalysis');
    const contentEl = $('wordsAnalysisContent');
    if (!analysisEl || !contentEl) return;
    
    const template = ANALYSIS_TEMPLATES.words[Math.floor(Math.random() * ANALYSIS_TEMPLATES.words.length)];
    contentEl.innerHTML = `<p>${template}</p>`;
    analysisEl.style.display = '';
  }

  // ========== 最终档案 ==========
  async function showFinale() {
    const overlay = $('finaleOverlay');
    const content = $('finaleContent');
    if (!overlay || !content) return;
    
    const allTags = [...new Set(state.profile.recorded)];
    
    const preferences = allTags.filter(t => /喜欢|熟悉|味道|饮食/.test(t));
    const values = allTags.filter(t => /重视|珍惜|怀念|家庭|陪伴|感谢/.test(t));
    const traits = allTags.filter(t => /热爱|分享|生活|表达|温暖|感恩/.test(t));
    
    let quote = '';
    try {
      const res = await fetch(`${API_BASE}/words/random?count=1`);
      const words = await res.json();
      if (words[0]) {
        quote = words[0].body_zh || words[0].body_en || '';
      }
    } catch (e) {
      quote = '请记住我，记得我曾经爱过。';
    }
    
    content.innerHTML = `
      <h2 class="finale-title">档案整理完成</h2>
      <p class="finale-intro">
        经过整理，我们逐渐认识了这张餐桌的主人。<br>
        现在，让我们来看看这位陌生人。
      </p>
      
      <div class="finale-profile">
        <div class="finale-section">
          <div class="finale-label">喜欢</div>
          <div class="finale-tags">
            ${preferences.length ? preferences.map(t => `<span class="finale-tag">${t}</span>`).join('') : '<span class="finale-tag">日常的温暖</span>'}
          </div>
        </div>
        <div class="finale-section">
          <div class="finale-label">重视</div>
          <div class="finale-tags">
            ${values.length ? values.map(t => `<span class="finale-tag">${t}</span>`).join('') : '<span class="finale-tag">家庭</span><span class="finale-tag">陪伴</span>'}
          </div>
        </div>
        <div class="finale-section">
          <div class="finale-label">留下</div>
          <div class="finale-tags">
            ${traits.length ? traits.map(t => `<span class="finale-tag">${t}</span>`).join('') : '<span class="finale-tag">善意</span><span class="finale-tag">思念</span>'}
          </div>
        </div>
      </div>
      
      ${quote ? `<div class="finale-quote">"${quote}"</div>` : ''}
      
      <p class="finale-question">
        如果有一天，<br>
        别人也只能通过一张餐桌认识你。<br>
        你会留下什么？
      </p>
    `;
    
    overlay.classList.add('active');
  }

  // 工具函数：将ArrayBuffer转换为Base64
  function arrayBufferToBase64(buffer) {
    if (!buffer) return '';
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // 启动
  init();

})();
