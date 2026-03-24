const API = 'http://localhost:5000/api';
const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const name = localStorage.getItem('name');
let trendChart, gradeChart, radarChart;
let currentQuiz = null;
let currentQuestionIndex = 0;
let answers = {};
let timerInterval = null;
let timeLeft = 0;
let myResults = [];
let isQuizActive = false;
let violationCount = 0;


if (!token || role !== 'student') window.location.href = 'index.html';
document.getElementById('sidebar-name').textContent = name || 'Student';

const HEADERS = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

function showSection(section) {
    if (isQuizActive) {
        showToast('Finish the quiz before switching tabs!', 'error');
        return;
    }
    ['quizzes', 'results', 'analysis', 'profile'].forEach(s => {
        document.getElementById(`section-${s}`).style.display = s === section ? 'block' : 'none';
        document.getElementById(`nav-${s}`).classList.toggle('active', s === section);
    });
    if (section === 'quizzes')  loadQuizzes();
    if (section === 'results')  loadResults();
    if (section === 'analysis') loadAnalysis();
    if (section === 'profile') {
        loadProfile();
        // Show quiz count on profile page
        const qcEl = document.getElementById('profile-quiz-count');
        if (qcEl) qcEl.textContent = myResults.length || localStorage.getItem('quizCount') || '—';
    }
}

function logout() { localStorage.clear(); window.location.href = 'index.html'; }

function showToast(msg, type = 'success') {
    const icons = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = icons[type] + msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ========== QUIZ LIST ==========
async function loadQuizzes() {
    const grid = document.getElementById('quizzes-grid');
    grid.innerHTML = '<div class="page-loader"><div class="loader-ring"></div></div>';
    try {
        const res = await fetch(`${API}/student/quizzes`, { headers: HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (!data.length) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 14l9-5-9-5-9 5 9 5z"/></svg>
                <h3>No quizzes available</h3>
                <p>Check back later — your faculty hasn't uploaded any quizzes yet</p>
            </div>`;
            return;
        }

        grid.innerHTML = data.map(q => {
            const attempted = q.already_attempted;
            return `<div class="quiz-card ${attempted ? 'attempted' : ''}" id="quiz-card-${q._id}">
                <div class="quiz-card-badge">
                    <span class="badge badge-primary">${q.subject}</span>
                    ${attempted ? '<span class="badge badge-success">✓ Completed</span>' : '<span class="badge badge-secondary">New</span>'}
                </div>
                <div class="quiz-card-title">${q.title}</div>
                <div class="quiz-card-subject">Uploaded by Faculty</div>
                <div class="quiz-card-meta">
                    <div class="quiz-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg>
                        ${q.total_questions} Questions
                    </div>
                    <div class="quiz-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${q.time_limit} min
                    </div>
                </div>
                ${attempted
                    ? `<button class="btn btn-outline quiz-card-btn" onclick="viewQuizResult('${q._id}')">View My Result</button>`
                    : `<button class="btn btn-primary quiz-card-btn" onclick="startQuiz('${q._id}')">Start Quiz →</button>`
                }
            </div>`;
        }).join('');
    } catch (err) {
        showToast(err.message, 'error');
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Error loading quizzes</h3></div>';
    }
}

// ========== START QUIZ ==========
async function startQuiz(quizId) {
    try {
        const res = await fetch(`${API}/student/quizzes/${quizId}/start`, { headers: HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        currentQuiz = data;
        currentQuestionIndex = 0;
        answers = {};
        timeLeft = data.time_limit * 60;
        isQuizActive = true;
        openQuizModal();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openQuizModal() {
    const overlay = document.getElementById('quiz-overlay');
    overlay.classList.add('active');
    document.querySelector('.sidebar').classList.add('sidebar-locked');
    renderQuestion();
    startTimer();
    enterFullscreen();
}

function closeQuizModal() {
    clearInterval(timerInterval);
    document.getElementById('quiz-overlay').classList.remove('active');
    document.querySelector('.sidebar').classList.remove('sidebar-locked');
    currentQuiz = null;
    isQuizActive = false;
    violationCount = 0;
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) { clearInterval(timerInterval); submitQuiz(true); }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const secs = (timeLeft % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('quiz-timer');
    if (timerEl) { timerEl.textContent = `${mins}:${secs}`; }
    if (timeLeft <= 60) { timerEl && timerEl.parentElement.style.setProperty('color', 'var(--danger)'); }
}

function renderQuestion() {
    const q = currentQuiz.questions[currentQuestionIndex];
    const total = currentQuiz.total_questions;
    const progress = Math.round(((currentQuestionIndex + 1) / total) * 100);
    const answeredCount = Object.keys(answers).length;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `
    <div class="quiz-header">
        <div>
            <h3 style="font-size:18px; font-weight:800; color:var(--text);">${currentQuiz.title}</h3>
            <p style="font-size:13px; color:var(--text-muted);">${currentQuiz.subject}</p>
        </div>
        <div style="display:flex; align-items:center; gap:8px; padding:10px 16px; border-radius:30px; background:rgba(255,69,58,0.1); border:1px solid rgba(255,69,58,0.2);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="color:#FF6B6B;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span id="quiz-timer" style="font-size:18px; font-weight:800; color:var(--accent); font-variant-numeric:tabular-nums;"></span>
        </div>
    </div>

    <div class="quiz-progress">
        <div class="progress-label">Question ${currentQuestionIndex + 1} of ${total} &nbsp;·&nbsp; ${answeredCount} answered</div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
    </div>

    <div class="question-block">
        <div class="question-number">Question ${currentQuestionIndex + 1}</div>
        <div class="question-text">${q.question}</div>
        <div class="option-list">
            ${Object.entries(q.options).map(([letter, text]) => `
            <div class="option-item ${answers[String(q.id)] === letter ? 'selected' : ''}"
                 onclick="selectOption(${q.id}, '${letter}')">
                <div class="option-letter">${letter}</div>
                <div class="option-text">${text}</div>
            </div>`).join('')}
        </div>
    </div>

    <div class="quiz-nav">
        <button class="btn btn-outline" onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''}>← Previous</button>

        <div class="question-dots">
            ${currentQuiz.questions.map((_, i) => `
            <div class="q-dot ${answers[String(currentQuiz.questions[i].id)] ? 'answered' : ''} ${i === currentQuestionIndex ? 'current' : ''}"
                 onclick="goToQuestion(${i})">${i + 1}</div>`).join('')}
        </div>

        ${currentQuestionIndex < total - 1
            ? `<button class="btn btn-primary" onclick="nextQuestion()">Next →</button>`
            : `<button class="btn btn-success" onclick="submitQuiz(false)">Submit Quiz ✓</button>`
        }
    </div>`;

    updateTimerDisplay();
}

function selectOption(qId, letter) {
    answers[String(qId)] = letter;
    renderQuestion();
}
function nextQuestion() { if (currentQuestionIndex < currentQuiz.total_questions - 1) { currentQuestionIndex++; renderQuestion(); } }
function prevQuestion() { if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); } }
function goToQuestion(i) { currentQuestionIndex = i; renderQuestion(); }

async function submitQuiz(auto = false) {
    const unanswered = currentQuiz.total_questions - Object.keys(answers).length;
    if (!auto && unanswered > 0) {
        if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    }
    clearInterval(timerInterval);
    isQuizActive = false;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `<div class="page-loader" style="min-height:300px;"><div class="loader-ring"></div></div>`;

    try {
        const res = await fetch(`${API}/student/quizzes/${currentQuiz.quiz_id}/submit`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ answers })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showResultModal(data);
    } catch (err) {
        showToast(err.message, 'error');
        closeQuizModal();
    }
}

function showResultModal(result) {
    const pct = result.percentage;
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (pct / 100) * circumference;
    const color = pct >= 70 ? '#32D74B' : pct >= 50 ? '#FFD60A' : '#FF453A';
    const correct = result.result_details.filter(r => r.is_correct).length;
    const wrong = result.result_details.filter(r => !r.is_correct && r.selected).length;
    const unattempted = result.result_details.filter(r => !r.selected).length;

    const modal = document.getElementById('quiz-modal');
    modal.innerHTML = `
    <div class="result-header">
        <div class="result-score-ring">
            <svg class="ring-svg" viewBox="0 0 120 120">
                <circle class="ring-bg" cx="60" cy="60" r="54"/>
                <circle class="ring-fill" cx="60" cy="60" r="54"
                    stroke="${color}"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}"/>
            </svg>
            <div class="score-center">
                <div class="score-pct">${pct}%</div>
                <div class="score-grade" style="color:${color}">${result.grade}</div>
            </div>
        </div>
        <h2 style="font-size:22px; font-weight:800; color:var(--text); margin-bottom:6px;">${pct >= 50 ? '🎉 Quiz Completed!' : '📚 Keep Practicing!'}</h2>
        <p style="color:var(--text-muted); font-size:14px;">You scored ${result.score} out of ${result.total}</p>
        <div class="result-stats" style="margin-top:20px;">
            <div class="result-stat-item"><div class="result-stat-num" style="color:var(--success)">${correct}</div><div class="result-stat-label">Correct</div></div>
            <div class="result-stat-item"><div class="result-stat-num" style="color:var(--danger)">${wrong}</div><div class="result-stat-label">Wrong</div></div>
            <div class="result-stat-item"><div class="result-stat-num" style="color:var(--text-muted)">${unattempted}</div><div class="result-stat-label">Skipped</div></div>
        </div>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:20px;">
        <button class="btn btn-outline" onclick="toggleAnswerReview()" style="flex:1; justify-content:center;" id="review-btn">
            📋 Review Answers
        </button>
        <button class="btn btn-primary" onclick="closeQuizModal(); showSection('results');" style="flex:1; justify-content:center;">
            View My Results →
        </button>
    </div>

    <div id="answer-review" style="display:none;">
        <h3 style="font-size:15px; font-weight:700; color:var(--text); margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border);">Answer Review</h3>
        ${result.result_details.map((r, i) => `
        <div style="margin-bottom:16px; padding:16px; border-radius:12px; border:1px solid ${r.is_correct ? 'rgba(50,215,75,0.2)' : r.selected ? 'rgba(255,69,58,0.2)' : 'var(--border)'}; background:${r.is_correct ? 'rgba(50,215,75,0.05)' : r.selected ? 'rgba(255,69,58,0.05)' : 'transparent'};">
            <div style="font-size:12px; font-weight:700; color:${r.is_correct ? 'var(--success)' : r.selected ? 'var(--danger)' : 'var(--text-muted)'}; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
                ${r.is_correct ? '✓ Correct' : r.selected ? '✗ Incorrect' : '— Skipped'} · Q${i + 1}
            </div>
            <div style="font-size:14.5px; font-weight:600; color:var(--text); margin-bottom:10px;">${r.question}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                ${Object.entries(r.options).map(([l, t]) => `
                <span style="padding:5px 12px; border-radius:6px; font-size:13px; font-weight:600;
                    background:${l === r.correct_answer ? 'rgba(50,215,75,0.2)' : l === r.selected && !r.is_correct ? 'rgba(255,69,58,0.2)' : 'rgba(255,255,255,0.04)'};
                    color:${l === r.correct_answer ? 'var(--success)' : l === r.selected && !r.is_correct ? 'var(--danger)' : 'var(--text-muted)'};
                    border:1px solid ${l === r.correct_answer ? 'rgba(50,215,75,0.3)' : l === r.selected && !r.is_correct ? 'rgba(255,69,58,0.3)' : 'var(--border)'};">
                    ${l}: ${t}
                </span>`).join('')}
            </div>
            ${r.explanation ? `<div style="font-size:13px; color:var(--secondary); padding:8px 12px; background:rgba(78,205,196,0.06); border-radius:8px; border-left:3px solid var(--secondary);">💡 ${r.explanation}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function toggleAnswerReview() {
    const review = document.getElementById('answer-review');
    const btn = document.getElementById('review-btn');
    const showing = review.style.display !== 'none';
    review.style.display = showing ? 'none' : 'block';
    btn.textContent = showing ? '📋 Review Answers' : '🔼 Hide Review';
}

// ========== VIEW RESULT (already attempted) ==========
async function viewQuizResult(quizId) {
    try {
        const res = await fetch(`${API}/student/results/${quizId}`, { headers: HEADERS });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('quiz-overlay').classList.add('active');
        showResultModal({ ...data, result_details: data.result_details || [] });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ========== MY RESULTS ==========
async function loadResults() {
    const wrap = document.getElementById('results-table-wrap');
    wrap.innerHTML = '<div class="page-loader"><div class="loader-ring"></div></div>';
    try {
        const res = await fetch(`${API}/student/results`, { headers: HEADERS });
        myResults = await res.json();
        if (!res.ok) throw new Error(myResults.error);

        const total = myResults.length;
        const avg = total ? Math.round(myResults.reduce((s, r) => s + r.percentage, 0) / total) : 0;
        const best = total ? Math.max(...myResults.map(r => r.percentage)) : 0;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-avg').textContent = total ? avg + '%' : '—%';
        document.getElementById('stat-best').textContent = total ? best + '%' : '—%';

        if (!total) {
            wrap.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h3>No results yet</h3><p>Take your first quiz to see your results here!</p></div>`;
            return;
        }

        wrap.innerHTML = `<table>
            <thead><tr><th>#</th><th>Quiz</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Date</th></tr></thead>
            <tbody>
            ${myResults.map((r, i) => {
                const badgeClass = r.percentage >= 70 ? 'badge-success' : r.percentage >= 50 ? 'badge-warning' : 'badge-danger';
                return `<tr>
                    <td style="color:var(--text-muted)">${i + 1}</td>
                    <td style="font-weight:600">${r.quiz_title}</td>
                    <td>${r.score} / ${r.total}</td>
                    <td><span class="badge ${badgeClass}">${r.percentage}%</span></td>
                    <td><span class="badge ${badgeClass}">${r.grade}</span></td>
                    <td style="color:var(--text-muted); font-size:13px;">${r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
    } catch (err) {
        showToast(err.message, 'error');
        wrap.innerHTML = '<div class="empty-state"><h3>Failed to load results</h3></div>';
    }
}

// ========== ANALYSIS ==========
async function loadAnalysis() {
    if (!myResults.length) {
        const res = await fetch(`${API}/student/results`, { headers: HEADERS });
        myResults = await res.json();
    }
    if (!myResults.length) return;

    const labels = myResults.map(r => r.quiz_title.length > 15 ? r.quiz_title.substring(0, 15) + '…' : r.quiz_title);
    const scores = myResults.map(r => r.percentage);

    // Trend chart
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById('trend-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Score (%)', data: scores,
                borderColor: '#6C63FF', backgroundColor: 'rgba(108,99,255,0.1)',
                tension: 0.4, fill: true, pointBackgroundColor: '#6C63FF', pointRadius: 6, pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8888aa' } } },
            scales: {
                x: { ticks: { color: '#8888aa', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
            }
        }
    });

    // Grade distribution
    const gradeCounts = { 'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C': 0, 'F': 0 };
    myResults.forEach(r => { gradeCounts[r.grade] = (gradeCounts[r.grade] || 0) + 1; });
    const gradeColors = { 'A+': '#32D74B', 'A': '#4ECDC4', 'B+': '#6C63FF', 'B': '#8B83FF', 'C': '#FFD60A', 'F': '#FF453A' };

    if (gradeChart) gradeChart.destroy();
    gradeChart = new Chart(document.getElementById('grade-chart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(gradeCounts).filter(g => gradeCounts[g] > 0),
            datasets: [{
                data: Object.entries(gradeCounts).filter(([,v]) => v > 0).map(([,v]) => v),
                backgroundColor: Object.entries(gradeCounts).filter(([,v]) => v > 0).map(([g]) => gradeColors[g]),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '60%',
            plugins: { legend: { position: 'bottom', labels: { color: '#8888aa', padding: 14, font: { size: 12 } } } }
        }
    });

    // Per-quiz bar chart (as "radar comparison")
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(document.getElementById('radar-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Your Score (%)',
                data: scores,
                backgroundColor: scores.map(s => s >= 70 ? 'rgba(50,215,75,0.7)' : s >= 50 ? 'rgba(255,214,10,0.7)' : 'rgba(255,69,58,0.7)'),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8888aa' } } },
            scales: {
                x: { ticks: { color: '#8888aa', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#8888aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100,
                    afterDataLimits: scale => { scale.max = 100; }
                }
            }
        }
    });
}

// Prevent accidental navigation during quiz
window.addEventListener('beforeunload', (e) => {
    if (isQuizActive) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ========== AI MONITORING SYSTEM ==========

function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        });
    }
}

let isAlerting = false;

function handleViolation(msg) {
    if (!isQuizActive || isAlerting) return;
    
    isAlerting = true;
    violationCount++;
    alert(`⚠️ ${msg}\nViolations: ${violationCount}/2`);

    if (violationCount >= 2) {
        alert("❌ Exam submitted automatically due to multiple violations.");
        submitQuiz(true);
    }
    isAlerting = false;
}

// Detect tab switch
document.addEventListener("visibilitychange", () => {
    if (isQuizActive && document.hidden) {
        handleViolation("Tab switching is not allowed!");
    }
});

// Detect window blur (user leaving screen)
window.addEventListener("blur", () => {
    if (isQuizActive) {
        handleViolation("You left the exam screen!");
    }
});

// Disable right click, copy, and paste during exam
document.addEventListener("contextmenu", e => {
    if (isQuizActive) e.preventDefault();
});

document.addEventListener("copy", e => {
    if (isQuizActive) e.preventDefault();
});

document.addEventListener("paste", e => {
    if (isQuizActive) e.preventDefault();
});

// Load quizzes on start
loadQuizzes();

