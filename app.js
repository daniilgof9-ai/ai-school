// ============================================================
// ЯДРО ПРИЛОЖЕНИЯ
// ============================================================

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const STORAGE_KEY = 'ai_school_state';
let state = {
    name: "Ученик", username: "@username", 
    isPremium: false,
    isAdmin: false,
    completedLessons: [], completedTests: [], xp: 0, streak: 0,
    lastLogin: null, lastLessonDate: null, testScores: {},
    quizPassedIds: []
};

function loadState() {
    try { 
        const saved = localStorage.getItem(STORAGE_KEY); 
        if (saved) {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            if (state.isPremium === undefined) state.isPremium = false;
            if (state.isAdmin === undefined) state.isAdmin = false;
        }
    } catch (e) {}
}
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    state.name = tg.initDataUnsafe.user.first_name || "Ученик";
    state.username = tg.initDataUnsafe.user.username ? `@${tg.initDataUnsafe.user.username}` : "@username";
}

function triggerHaptic(type = 'light') {
    if (tg && tg.HapticFeedback) {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred(type);
    }
}

function showToast(message, type = 'default') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'} ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut 0.3s forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24)); }
function isSameDay(a, b) {
    if (!a || !b) return false;
    const d1 = new Date(a), d2 = new Date(b);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// СИСТЕМА 10 УРОВНЕЙ
function getRankInfo(xp) {
    const levels = [
        { name: "Новичок", min: 0, max: 100, color: "#ff8c00" },
        { name: "Ученик", min: 100, max: 250, color: "#4ade80" },
        { name: "Продвинутый", min: 250, max: 450, color: "#00B64F" },
        { name: "Хакер", min: 450, max: 700, color: "#2EC4B6" },
        { name: "Мастер", min: 700, max: 1000, color: "#3b82f6" },
        { name: "Эксперт", min: 1000, max: 1400, color: "#8b5cf6" },
        { name: "Гуру", min: 1400, max: 1900, color: "#d946ef" },
        { name: "Легенда", min: 1900, max: 2500, color: "#f43f5e" },
        { name: "Бог ИИ", min: 2500, max: 3200, color: "#eab308" },
        { name: "Творец", min: 3200, max: 9999, color: "#fff" }
    ];
    for (let i = 0; i < levels.length; i++) {
        if (xp >= levels[i].min && xp < levels[i].max) return { ...levels[i], level: i + 1 };
    }
    return { name: "Творец", min: 3200, max: 9999, color: "#fff", level: 10 };
}

function updateStreak() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!state.lastLogin) {
        // Первый заход
        state.streak = 1;
        state.lastLogin = todayStr;
    } else {
        const lastDate = new Date(state.lastLogin);
        const currentDate = new Date(todayStr);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            // Зашел на следующий день — стрик растет
            state.streak += 1;
            state.lastLogin = todayStr;
        } else if (diffDays > 1) {
            // Пропустил больше 1 дня — стрик сгорает
            state.streak = 1;
            state.lastLogin = todayStr;
        }
        // Если diffDays === 0 — зашел в тот же день, стрик не меняется
    }
    
    // Бонус за стрик (каждые 7 дней)
    if (state.streak > 0 && state.streak % 7 === 0) {
        // Проверяем, не давали ли уже бонус сегодня
        if (state.lastBonusDate !== todayStr) {
            state.xp += 10;
            state.lastBonusDate = todayStr;
            showToast('🔥 Стрик ' + state.streak + ' дней! +10 XP', 'success');
        }
    }
    
    saveState();
    renderStreak();
}

function switchTab(tabId, btnElement = null) {
    triggerHaptic('light');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${tabId}`);
    if (target) target.classList.add('active');

    if (btnElement) {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    } else {
        document.querySelectorAll('.nav-item').forEach(b => {
            if (b.getAttribute('data-tab') === tabId) b.classList.add('active');
            else b.classList.remove('active');
        });
    }

    if (tabId === 'home') renderHome();
    if (tabId === 'lessons') renderLessonsList();
    if (tabId === 'profile') renderProfile();
}

function renderHome() {
    const rank = getRankInfo(state.xp);
    
    document.getElementById('stat-progress-text').textContent = `${state.completedLessons.length} / 50`;
    document.getElementById('stat-xp-text').textContent = `${state.xp} XP`;
    
    const xpBarWrap = document.getElementById('xp-bar-wrap');
    if (xpBarWrap) {
        const currentLevelXp = state.xp - rank.min;
        const nextLevelXp = rank.max - rank.min;
        const percentage = Math.min(100, Math.max(0, (currentLevelXp / nextLevelXp) * 100));
        
        xpBarWrap.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; font-weight: bold; color: ${rank.color};">
                <span>LVL ${rank.level} • ${rank.name}</span>
                <span>${state.xp} / ${rank.max} XP</span>
            </div>
            <div style="height: 12px; background: #222; border-radius: 6px; border: 1px solid #333; overflow: hidden; box-shadow: inset 0 0 5px #000;">
                <div style="height: 100%; width: ${percentage}%; background: ${rank.color}; box-shadow: 0 0 10px ${rank.color}; transition: width 0.5s;"></div>
            </div>
        `;
    }
    renderStreak();
}

// ==================== СПИСОК УРОКОВ ====================
function isLessonUnlocked(lesson) { 
    if (state.isAdmin) return true;
    if (lesson.free) return true;
    return state.isPremium; 
}

function renderLessonsList() {
    const container = document.getElementById('lessons-list');
    if (!container) return;
    container.innerHTML = '';

    const modules = [
        { name: "🟢 Модуль 1: База", range: [1, 12] },
        { name: "🟡 Модуль 2: Текст и Креатив", range: [13, 25] },
        { name: "🔵 Модуль 3: Визуал", range: [26, 37] },
        { name: "🔴 Модуль 4: Код и Боты", range: [38, 50] }
    ];

    modules.forEach((mod, idx) => {
        const h = document.createElement('h3');
        h.style.cssText = 'color: var(--neon); margin: 20px 0 10px; font-size: 14px; text-transform: uppercase;';
        h.textContent = mod.name;
        container.appendChild(h);

        const lessonsInModule = LESSONS.filter(l => l.id >= mod.range[0] && l.id <= mod.range[1]);
        let allLessonsCompleted = true;

        lessonsInModule.forEach(lesson => {
            const unlocked = isLessonUnlocked(lesson);
            const completed = state.completedLessons.includes(lesson.id);
            if (!completed) allLessonsCompleted = false;

            const div = document.createElement('div');
            const titleStyle = lesson.id === 50 ? 'font-weight: 900; color: #fff;' : '';
            div.className = 'lesson-item ' + (unlocked ? (completed ? 'completed' : 'unlocked') : 'locked');
            div.innerHTML = `
                <div><div class="lesson-title" style="${titleStyle}">${lesson.id}. ${lesson.title}</div><div class="lesson-meta">${completed ? '✅ Пройден' : unlocked ? '▶ Доступен' : '🔒 Премиум'}</div></div>
                <div style="font-size: 18px;">${completed ? '✅' : unlocked ? '▶' : '🔒'}</div>
            `;
            div.onclick = () => unlocked ? openLesson(lesson.id) : showPaywall();
            container.appendChild(div);
        });

        // Тест модуля
        const testId = idx + 1;
        if (TESTS[testId]) {
            const testDiv = document.createElement('div');
            testDiv.className = 'lesson-item';
            
            if (!allLessonsCompleted && !state.isAdmin && !state.isPremium) {
                testDiv.style.opacity = '0.5';
                testDiv.style.cursor = 'not-allowed';
                testDiv.innerHTML = `<div><div class="lesson-title">📝 ${TESTS[testId].title}</div><div class="lesson-meta" style="color: var(--red);">Сначала пройди все уроки модуля</div></div><div>🔒</div>`;
                testDiv.onclick = () => showToast('Сначала пройди все уроки этого модуля!', 'error');
                container.appendChild(testDiv);
                return;
            }

            const testPassed = state.completedTests.includes(testId);
            const lastTestDate = state.testScores[`date_${testId}`];
            let canRetake = true;
            let timeLeftStr = "";

            if (testPassed && lastTestDate) {
                const hoursPassed = (new Date() - new Date(lastTestDate)) / (1000 * 60 * 60);
                if (hoursPassed < 168) {
                    canRetake = false;
                    const hoursLeft = Math.ceil(168 - hoursPassed);
                    const daysLeft = Math.floor(hoursLeft / 24);
                    timeLeftStr = daysLeft > 0 ? `${daysLeft} дн.` : `${hoursLeft} ч.`;
                }
            }

            // БЕРЕМ РЕАЛЬНОЕ КОЛИЧЕСТВО ВОПРОСОВ ИЗ TESTS.JS
            const qCount = TESTS[testId].questions.length;

            if (canRetake) {
                testDiv.style.borderColor = 'var(--neon)';
                testDiv.innerHTML = `
                    <div><div class="lesson-title" style="color: var(--neon);">📝 ${TESTS[testId].title}</div><div class="lesson-meta">${testPassed ? `Результат: ${state.testScores[testId] || 0}/${qCount} (Пересдача доступна)` : `${qCount} вопросов`}</div></div>
                    <div style="font-size: 18px;">${testPassed ? '🔄' : '▶'}</div>
                `;
                testDiv.onclick = () => openTest(testId);
            } else {
                testDiv.style.opacity = '0.6';
                testDiv.style.cursor = 'not-allowed';
                testDiv.innerHTML = `
                    <div><div class="lesson-title" style="color: var(--text-muted);">📝 ${TESTS[testId].title}</div><div class="lesson-meta">Пройден: ${state.testScores[testId] || 0}/${qCount}. Пересдача через <b>${timeLeftStr}</b></div></div>
                    <div style="font-size: 18px;">⏳</div>
                `;
                testDiv.onclick = () => showToast(`Пересдача будет доступна через ${timeLeftStr}`, 'error');
            }
            container.appendChild(testDiv);
        }
    });
}
// ==================== ИНТЕРАКТИВНЫЙ УРОК ====================
let currentLessonData = null;
let currentStep = 0;
let maxAllowedStep = 0;
let quizPassed = false;
let practicePassed = false;

function openLesson(id) {
    const lesson = LESSONS.find(l => l.id === id);
    if (!lesson) return;
    
    if (!lesson.free && state.isPremium && !state.isAdmin) {
        if (state.lastLessonDate && daysBetween(state.lastLessonDate, new Date().toISOString()) === 0) {
            showToast('Следующий урок откроется завтра!', 'error'); return;
        }
    }

    triggerHaptic('medium');
    currentLessonData = lesson;
    currentStep = 0;
    maxAllowedStep = 0;
    quizPassed = false;
    practicePassed = false;
    
    document.getElementById('lesson-header-title').textContent = `Урок ${lesson.id}`;
    renderLessonStep();
    switchTab('lesson');
}

function renderLessonStep() {
    const body = document.getElementById('lesson-body');
    body.innerHTML = '';

    const isFact = !currentLessonData.practice && currentLessonData.fact;
    const stepName = isFact ? 'Факт' : 'Практика';

    const progress = document.createElement('div');
    progress.className = 'step-progress-container';
    progress.innerHTML = `
        <div class="step-dot clickable ${currentStep === 0 ? 'active' : (currentStep > 0 ? 'done' : '')}" onclick="tryJumpToStep(0)">Интро</div>
        <div class="step-dot clickable ${currentStep === 1 ? 'active' : (currentStep > 1 ? 'done' : '')}" onclick="tryJumpToStep(1)">1. Теория</div>
        <div class="step-dot clickable ${currentStep === 2 ? 'active' : (currentStep > 2 ? 'done' : '')}" onclick="tryJumpToStep(2)">2. ${stepName}</div>
        <div class="step-dot clickable ${currentStep === 3 ? 'active' : (currentStep > 3 ? 'done' : '')}" onclick="tryJumpToStep(3)">3. Итог</div>
    `;
    body.appendChild(progress);

    const h2 = document.createElement('h2');
    h2.style.cssText = 'font-size: 20px; margin-bottom: 10px;';
    h2.textContent = currentLessonData.title;
    body.appendChild(h2);

    if (currentStep === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'color: #e6edf3; font-size: 15px; line-height: 1.6; margin-bottom: 30px; font-style: italic;';
        p.textContent = currentLessonData.intro || "Давай разберемся, как это работает.";
        body.appendChild(p);
        const btn = document.createElement('button');
        btn.className = 'btn-primary full-width';
        btn.textContent = 'ДАЛЬШЕ →';
        btn.onclick = () => { goToStep(1); };
        body.appendChild(btn);
    } 
    else if (currentStep === 1) {
        const p = document.createElement('p');
        p.style.cssText = 'color: var(--text-muted); font-size: 14px; margin-bottom: 20px;';
        p.textContent = currentLessonData.subtitle;
        body.appendChild(p);

        if (currentLessonData.type === 'tokens') renderTokensLesson(currentLessonData, body);
        else if (currentLessonData.type === 'puzzle') renderPuzzleLesson(currentLessonData, body);
        else if (currentLessonData.type === 'compare') renderCompareLesson(currentLessonData, body);
        else if (currentLessonData.type === 'reveal') renderRevealLesson(currentLessonData, body);
    } 
    else if (currentStep === 2) {
        if (isFact) {
            renderFact(body);
        } else {
            renderLessonPractice(body);
        }
    } 
    else if (currentStep === 3) {
        renderLessonSummary(body);
    }
}

function tryJumpToStep(step) {
    if (step > maxAllowedStep) {
        showToast('Сначала пройди предыдущие этапы!', 'error');
        return;
    }
    goToStep(step);
}

window.goToStep = function(step) {
    currentStep = step;
    if (step > maxAllowedStep) maxAllowedStep = step;
    renderLessonStep();
}

// --- ИНТЕРАКТИВЫ В ТЕОРИИ ---
function renderTokensLesson(lesson, body) {
    const wrap = document.createElement('div'); wrap.style.textAlign = 'center'; wrap.style.marginBottom = '20px';
    const clicked = new Set();
    lesson.phrase.forEach(word => {
        const btn = document.createElement('span'); btn.className = 'word-btn'; btn.textContent = word;
        btn.onclick = () => {
            if (clicked.has(word)) return;
            triggerHaptic('medium'); btn.classList.add('active'); clicked.add(word);
            const card = document.createElement('div'); card.className = 'advice-inline';
            card.innerHTML = `<span class="advice-icon">🤖</span><span class="advice-text">${lesson.tokens[word]}</span>`;
            body.insertBefore(card, body.querySelector('.lesson-actions') || null);
            if (clicked.size === lesson.phrase.length) setTimeout(() => showStep1Next(body), 400);
        };
        wrap.appendChild(btn);
    });
    body.appendChild(wrap);
}

function renderPuzzleLesson(lesson, body) {
    const clicked = new Set();
    lesson.blocks.forEach((block, idx) => {
        const div = document.createElement('div'); div.className = 'puzzle-block';
        div.innerHTML = `<h4>${block.title}</h4><p>${block.desc}</p>`;
        div.onclick = () => {
            if (clicked.has(idx)) return;
            triggerHaptic('medium'); div.classList.add('active'); clicked.add(idx);
            if (clicked.size === lesson.blocks.length) setTimeout(() => showStep1Next(body), 400);
        };
        body.appendChild(div);
    });
}

function renderCompareLesson(lesson, body) {
    const row = document.createElement('div'); row.className = 'compare-row';
    const resultWrap = document.createElement('div');
    lesson.options.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'compare-btn'; btn.textContent = opt.label;
        btn.onclick = () => {
            triggerHaptic('medium'); row.querySelectorAll('.compare-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
            resultWrap.innerHTML = `<div class="result-dashboard" style="margin-top: 15px;"><h4 style="color: var(--neon);">${opt.title}</h4><p style="font-size: 13px; margin-top: 5px;">${opt.desc}</p></div>`;
            if (!body.querySelector('.lesson-actions')) showStep1Next(body);
        };
        row.appendChild(btn);
    });
    body.appendChild(row); body.appendChild(resultWrap);
}

function renderRevealLesson(lesson, body) {
    const resultWrap = document.createElement('div');
    lesson.buttons.forEach(btnData => {
        const btn = document.createElement('button'); btn.className = 'compare-btn'; btn.style.cssText = 'width: 100%; margin-bottom: 10px; text-align: left;'; btn.textContent = btnData.label;
        let opened = false;
        btn.onclick = () => {
            triggerHaptic('medium'); if (opened) return; opened = true; btn.classList.add('active');
            const card = document.createElement('div'); card.className = 'advice-inline';
            card.innerHTML = `<span class="advice-icon">💡</span><span class="advice-text">${btnData.text}</span>`;
            resultWrap.appendChild(card);
            if (resultWrap.querySelectorAll('.advice-inline').length === lesson.buttons.length) setTimeout(() => showStep1Next(body), 400);
        };
        resultWrap.appendChild(btn);
    });
    body.appendChild(resultWrap);
}

function showStep1Next(body) {
    triggerHaptic('success');
    if (body.querySelector('.lesson-actions')) return;
    const actions = document.createElement('div'); actions.className = 'lesson-actions';
    actions.innerHTML = `
        <button class="btn-primary full-width" style="margin-top: 20px;" onclick="goToStep(2)">Перейти к следующему этапу →</button>
    `;
    body.appendChild(actions);
    actions.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// --- ПРАКТИКА ---
function renderLessonPractice(body) {
    const wrap = document.createElement('div'); wrap.className = 'practice-container';
    const practiceType = currentLessonData.practice.type || 'text';
    const taskText = currentLessonData.practice.task || "Выполни задание:";
    const placeholder = currentLessonData.practice.placeholder || "Напиши ответ...";

    if (practiceType === 'text') {
        wrap.innerHTML = `
            <div class="quiz-question" style="font-size: 15px;">✍️ ${taskText}</div>
            <textarea class="practice-input" id="user-prompt" rows="2" placeholder="${placeholder}"></textarea>
            <button class="btn-primary full-width" id="send-prompt-btn" onclick="processTextPrompt()">Отправить ИИ</button>
            <div class="ai-response" id="ai-resp"></div>
        `;
    } 
    else if (practiceType === 'quiz') {
        wrap.innerHTML = `<div class="quiz-question" style="font-size: 15px;">🧩 ${taskText}</div><div id="practice-quiz-options"></div>`;
        const optionsWrap = wrap.querySelector('#practice-quiz-options');
        currentLessonData.practice.options.forEach(opt => {
            const btn = document.createElement('button'); btn.className = 'quiz-option'; btn.textContent = opt;
            btn.onclick = () => {
                if (practicePassed) return;
                practicePassed = true;
                optionsWrap.querySelectorAll('.quiz-option').forEach(b => b.disabled = true);
                if (opt === currentLessonData.practice.correct) {
                    btn.classList.add('correct'); triggerHaptic('success');
                    showToast('Правильно!', 'success');
                } else {
                    btn.classList.add('wrong'); triggerHaptic('error');
                    optionsWrap.querySelectorAll('.quiz-option').forEach(b => {
                        if (b.textContent === currentLessonData.practice.correct) b.classList.add('correct');
                    });
                }
                setTimeout(() => {
                    if (!body.querySelector('.lesson-actions')) {
                        const actions = document.createElement('div');
                        actions.className = 'lesson-actions';
                        actions.innerHTML = `<button class="btn-primary full-width" style="margin-top: 20px;" onclick="goToStep(3)">Перейти к итогу →</button>`;
                        body.appendChild(actions);
                        actions.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }, 800);
            };
            optionsWrap.appendChild(btn);
        });
    }
    else if (practiceType === 'puzzle') {
        wrap.innerHTML = `<div class="quiz-question" style="font-size: 15px;">🧩 ${taskText}</div><div id="practice-puzzle-blocks"></div>`;
        const blocksWrap = wrap.querySelector('#practice-puzzle-blocks');
        let clickedCount = 0;
        currentLessonData.practice.blocks.forEach(block => {
            const div = document.createElement('div'); div.className = 'puzzle-block';
            div.innerHTML = `<h4>${block.title}</h4><p>${block.desc}</p>`;
            div.onclick = () => {
                if (div.classList.contains('active')) return;
                triggerHaptic('medium'); div.classList.add('active'); clickedCount++;
                if (clickedCount === currentLessonData.practice.blocks.length) {
                    practicePassed = true;
                    showToast('Промпт собран!', 'success');
                    setTimeout(() => {
                        if (!body.querySelector('.lesson-actions')) {
                            const actions = document.createElement('div');
                            actions.className = 'lesson-actions';
                            actions.innerHTML = `<button class="btn-primary full-width" style="margin-top: 20px;" onclick="goToStep(3)">Перейти к итогу →</button>`;
                            body.appendChild(actions);
                            actions.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    }, 500);
                }
            };
            blocksWrap.appendChild(div);
        });
    }
    else if (practiceType === 'dragdrop') {
        renderDragDropLesson(currentLessonData.practice, body, wrap);
        return;
    }

    body.appendChild(wrap);
}

function renderDragDropLesson(lesson, body, wrap) {
    const items = lesson.items;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    let selected = [];
    
    wrap.innerHTML = `<div class="quiz-question" style="font-size: 15px;">🧩 ${lesson.task || 'Расставь по порядку'}</div><div id="dd-container"></div>`;
    const container = wrap.querySelector('#dd-container');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;';

    const renderItems = () => {
        container.innerHTML = '';
        const pool = document.createElement('div');
        pool.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; border: 1px dashed #333; border-radius: 12px; min-height: 60px;';

        shuffled.forEach(item => {
            if (!selected.includes(item)) {
                const div = document.createElement('div');
                div.textContent = item;
                div.style.cssText = 'padding: 10px 15px; background: #121212; border: 1px solid #333; border-radius: 8px; cursor: pointer;';
                div.onclick = () => { selected.push(item); triggerHaptic('light'); renderItems(); };
                pool.appendChild(div);
            }
        });

        const target = document.createElement('div');
        target.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding: 15px; border: 1px solid var(--neon); border-radius: 12px; min-height: 100px; background: rgba(0,182,79,0.05);';
        
        selected.forEach((item, idx) => {
            const div = document.createElement('div');
            div.textContent = `${idx + 1}. ${item}`;
            div.style.cssText = 'padding: 10px; background: rgba(0,182,79,0.2); border-radius: 8px; color: #fff;';
            target.appendChild(div);
        });

        if (selected.length === items.length) {
            const isCorrect = selected.every((val, index) => val === items[index]);
            if (isCorrect) {
                triggerHaptic('success'); showToast('Правильно!', 'success');
                practicePassed = true;
                if (!body.querySelector('.lesson-actions')) {
                    const actions = document.createElement('div');
                    actions.className = 'lesson-actions';
                    actions.innerHTML = `<button class="btn-primary full-width" style="margin-top: 20px;" onclick="goToStep(3)">Перейти к итогу →</button>`;
                    body.appendChild(actions);
                    actions.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            } else {
                triggerHaptic('error'); showToast('Порядок неверный. Попробуй ещё раз!', 'error');
                selected = []; renderItems();
            }
        }
        container.appendChild(pool); container.appendChild(target);
    };
    renderItems(); body.appendChild(wrap);
}

// --- ФАКТ (вместо практики) ---
function renderFact(body) {
    const fact = currentLessonData.fact;
    if (!fact) {
        showToast('Материал в разработке', 'default');
        goToStep(3);
        return;
    }

    const wrap = document.createElement('div'); wrap.className = 'quiz-container';
    wrap.innerHTML = `<div class="quiz-question">💡 ${fact.text}</div>`;
    
    fact.options.forEach((opt, idx) => {
        const btn = document.createElement('button'); btn.className = 'quiz-option'; btn.textContent = opt;
        btn.onclick = () => {
            if (practicePassed) return;
            practicePassed = true;
            wrap.querySelectorAll('.quiz-option').forEach(b => b.disabled = true);
            
            if (idx === fact.correct) {
                btn.classList.add('correct'); triggerHaptic('success');
            } else {
                btn.classList.add('wrong'); triggerHaptic('error');
                wrap.querySelectorAll('.quiz-option')[fact.correct].classList.add('correct');
            }

            setTimeout(() => {
                const bulb = document.createElement('div');
                bulb.className = 'advice-inline';
                bulb.style.marginTop = '15px';
                bulb.innerHTML = `<span class="advice-icon">💡</span><span class="advice-text">${fact.explain}</span>`;
                wrap.appendChild(bulb);

                const nextBtn = document.createElement('button');
                nextBtn.className = 'btn-primary full-width'; nextBtn.style.marginTop = '20px';
                nextBtn.textContent = 'Перейти к итогу →';
                nextBtn.onclick = () => goToStep(3);
                wrap.appendChild(nextBtn);
            }, 600);
        };
        wrap.appendChild(btn);
    });
    body.appendChild(wrap);
}

function processTextPrompt() {
    const input = document.getElementById('user-prompt');
    const text = input.value.trim();
    if (text.length < 5) { showToast('Слишком коротко', 'error'); return; }
    
    triggerHaptic('medium');
    document.getElementById('send-prompt-btn').disabled = true;
    input.disabled = true;
    
    const respBox = document.getElementById('ai-resp');
    respBox.classList.add('typing');
    respBox.innerHTML = `<span class="typing-cursor"></span> ИИ анализирует...`;

    setTimeout(() => {
        const tokens = text.split(/\s+/).filter(w => w.length > 0);
        let replyText = currentLessonData.practice?.customReply ? currentLessonData.practice.customReply(text, tokens) : "Отличная работа!";
        
        respBox.innerHTML = `<b>Я понял: "${text}".</b><br><br>${replyText}`;
        practicePassed = true;
        triggerHaptic('success');
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-primary full-width'; nextBtn.style.marginTop = '15px';
        nextBtn.textContent = 'Перейти к итогу →';
        nextBtn.onclick = () => goToStep(3);
        respBox.appendChild(nextBtn);
    }, 1500);
}

// --- ИТОГ УРОКА ---
function renderLessonSummary(body) {
    const wrap = document.createElement('div'); wrap.className = 'remember-box';
    wrap.innerHTML = `
        <h3>📌 Запомни</h3>
        <p>${currentLessonData.remember}</p>
        <button class="btn-primary full-width" style="margin-top: 20px;" onclick="completeLesson(${currentLessonData.id})">✅ Завершить урок (+10 XP)</button>
    `;
    body.appendChild(wrap);
}

function completeLesson(id) {
    triggerHaptic('success');
    const lesson = LESSONS.find(l => l.id === id);
    const isNew = !state.completedLessons.includes(id);

    if (isNew) {
        state.completedLessons.push(id);
        state.xp += 10;
        if (!lesson.free) state.lastLessonDate = new Date().toISOString();
        showToast('Урок пройден! +10 XP', 'success');
    } else {
        showToast('Урок уже пройден.', 'default');
    }

    saveState();
    setTimeout(() => {
        switchTab('lessons');
        const moduleIndex = Math.floor((id - 1) / 12);
        const moduleHeaders = document.querySelectorAll('#lessons-list h3');
        if (moduleHeaders[moduleIndex]) {
            moduleHeaders[moduleIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 600);
}

// ==================== ТЕСТЫ ====================
let currentTest = { id: null, index: 0, score: 0, answered: false };

function openTest(testId) {
    triggerHaptic('medium');
    const test = TESTS[testId];
    if (!test) return;

    currentTest = { id: testId, index: 0, score: 0, answered: false };
    document.getElementById('test-header').textContent = test.title;
    renderTestQuestion();
    switchTab('test');
}

function renderTestQuestion() {
    const test = TESTS[currentTest.id];
    const body = document.getElementById('test-body');
    const progress = document.getElementById('test-progress');
    if (!body) return;

    if (currentTest.index >= test.questions.length) return renderTestResult();

    const q = test.questions[currentTest.index];
    progress.style.width = `${(currentTest.index / test.questions.length) * 100}%`;

    body.innerHTML = `
        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 5px;">Вопрос ${currentTest.index + 1} из ${test.questions.length}</p>
        <h3 style="font-size: 16px; margin-bottom: 20px; line-height: 1.4;">${q.q}</h3>
        <div id="answers-wrap"></div>
    `;

    const answersWrap = document.getElementById('answers-wrap');
    currentTest.answered = false;

    q.answers.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn'; btn.textContent = ans;
        btn.onclick = () => answerTest(idx, q.correct, answersWrap);
        answersWrap.appendChild(btn);
    });
}

function answerTest(idx, correct, answersWrap) {
    if (currentTest.answered) return;
    currentTest.answered = true;

    const btns = answersWrap.querySelectorAll('.answer-btn');
    btns.forEach(b => b.disabled = true);

    if (idx === correct) {
        btns[idx].classList.add('correct'); currentTest.score++; triggerHaptic('success');
    } else {
        btns[idx].classList.add('wrong'); btns[correct].classList.add('correct'); triggerHaptic('error');
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary full-width';
    nextBtn.textContent = currentTest.index + 1 >= TESTS[currentTest.id].questions.length ? 'Завершить тест' : 'Дальше →';
    nextBtn.onclick = () => { currentTest.index++; renderTestQuestion(); };
    answersWrap.appendChild(nextBtn);
}

function renderTestResult() {
    const test = TESTS[currentTest.id];
    const body = document.getElementById('test-body');
    const progress = document.getElementById('test-progress');
    progress.style.width = '100%';

    const score = currentTest.score;
    const total = test.questions.length;

    if (!state.completedTests.includes(currentTest.id) || (state.testScores[currentTest.id] || 0) < score) {
        state.testScores[currentTest.id] = score;
        state.testScores[`date_${currentTest.id}`] = new Date().toISOString();
        if (!state.completedTests.includes(currentTest.id)) {
            state.completedTests.push(currentTest.id); state.xp += 20;
        }
        saveState();
    }

    body.innerHTML = `
        <div style="text-align: center; padding: 20px 0;">
            <div style="font-size: 60px; margin-bottom: 10px;">${score >= total * 0.7 ? '🏆' : '📊'}</div>
            <h2 style="font-size: 28px; color: var(--neon); margin-bottom: 10px;">${score} / ${total}</h2>
            <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">${score >= total * 0.7 ? 'Отличный результат!' : 'Есть куда расти!'}</p>
            <div class="remember-box"><h3>📌 Запомни</h3><p>${test.remember}</p></div>
            <button class="btn-primary full-width" style="margin-top: 20px;" onclick="switchTab('lessons')">Вернуться к урокам</button>
        </div>
    `;
    triggerHaptic('success');
}

// ==================== ПРОФИЛЬ / PAYWALL / ОПЛАТА ====================
function renderProfile() {
    document.getElementById('profile-name').textContent = state.name;
    document.getElementById('profile-username').textContent = state.username;
    
    let tariffText = 'Базовый';
    let tariffColor = '#fff';
    if (state.isAdmin) { tariffText = 'Админ'; tariffColor = '#ff00ff'; }
    else if (state.isPremium) { tariffText = 'Premium'; tariffColor = 'var(--neon)'; }
    
    document.getElementById('profile-tariff').textContent = tariffText;
    document.getElementById('profile-tariff').style.color = tariffColor;
}

function showPaywall() { triggerHaptic('error'); switchTab('paywall'); }

function buyPremium() {
    triggerHaptic('medium');
    if (tg) { tg.sendData(JSON.stringify({ action: "buy_premium" })); tg.close(); }
    else {
        state.isPremium = true; saveState(); showToast('Тест: Премиум активирован!', 'success'); renderLessonsList(); renderProfile();
    }
}

function secretAdminLogin() {
    const pwd = prompt("Введите пароль:");
    if (pwd === "da_yaRusski1") {
        const choice = prompt("Выберите режим:\n1 - Премиум (1 урок в день)\n2 - Админ (всё открыто)");
        if (choice === "1") {
            state.isPremium = true; state.isAdmin = false;
            showToast("👑 Премиум-режим активирован", "success");
        } else if (choice === "2") {
            state.isAdmin = true; state.isPremium = false;
            showToast("👑 Админ-режим активирован", "success");
        } else { return; }
        saveState();
        renderProfile(); renderLessonsList();
    } else if (pwd !== null) {
        showToast("Неверный пароль", "error");
    }
}

// ==================== ЧАСТИЦЫ / INIT ====================
const canvas = document.getElementById('particleCanvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    window.addEventListener('resize', () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; });
    const particles = [];
    class Particle {
        constructor() { this.x = Math.random() * width; this.y = Math.random() * height; this.vx = (Math.random() - 0.5) * 0.5; this.vy = (Math.random() - 0.5) * 0.5; this.radius = Math.random() * 1.5 + 0.5; this.alpha = Math.random() * 0.5 + 0.1; }
        update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > width) this.vx *= -1; if (this.y < 0 || this.y > height) this.vy *= -1; this.alpha += (Math.random() - 0.5) * 0.02; this.alpha = Math.max(0.05, Math.min(0.6, this.alpha)); }
        draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(0, 182, 79, ${this.alpha})`; ctx.shadowBlur = 10; ctx.shadowColor = '#00B64F'; ctx.fill(); ctx.shadowBlur = 0; }
    }
    for (let i = 0; i < 50; i++) particles.push(new Particle());
    function animateParticles() { ctx.clearRect(0, 0, width, height); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animateParticles); }
    animateParticles();
}

window.completeLesson = completeLesson;
window.processTextPrompt = processTextPrompt;
window.secretAdminLogin = secretAdminLogin;

function init() { 
    loadState(); 
    
    // Сбрасываем Premium, если он не был куплен через реальную оплату (проверка по флагу)
    // В нашем случае, если в localStorage isPremium был true, но isAdmin и isPremium по умолчанию false,
    // мы оставляем только если это было реально сохранено. 
    // Но чтобы сбросить у всех, кто просто зашел впервые:
    if (!localStorage.getItem('ai_school_state')) {
        state.isPremium = false;
        state.isAdmin = false;
    }

    updateStreak(); 
    renderHome(); 
    renderProfile(); 
    renderLessonsList(); 
    switchTab('home'); 
}