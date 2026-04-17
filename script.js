let state = JSON.parse(localStorage.getItem('aggm_state')) || {
    user: null,
    logs: [],
    workouts: [],
    settings: {
        overestimate: false,
        underestimatePro: true,
        underestimateBurned: true,
        underestimateMaintenance: false,
        extraBuffer: 0
    }
};

const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const foodModal = document.getElementById('food-modal');
const workoutModal = document.getElementById('workout-modal');
const calendarModal = document.getElementById('calendar-modal');

function save() {
    localStorage.setItem('aggm_state', JSON.stringify(state));
    updateUI();
}

function calculateBaseMaintenance() {
    if (!state.user) return 0;
    const { gender, weight, height, age } = state.user;
    const weightKg = weight * 0.453592;
    let bmr;
    if (gender === 'male') {
        bmr = 10 * weightKg + 6.25 * height - 5 * age + 5;
    } else {
        bmr = 10 * weightKg + 6.25 * height - 5 * age - 161;
    }
    let maintenance = Math.round(bmr * 1.25);
    if (state.settings.underestimateMaintenance) {
        maintenance = Math.round(maintenance * 0.85);
    }
    return maintenance;
}

function calculateTargetGoal() {
    if (!state.user) return 0;
    const maintenance = calculateBaseMaintenance();
    const weightDiff = state.user.targetWeight - state.user.weight;
    const dailyAdjustment = (weightDiff * 3500) / (state.user.targetWeeks * 7);
    return Math.round(maintenance + dailyAdjustment);
}

function calculateProteinTarget() {
    if (!state.user) return 0;
    return Math.round(state.user.weight);
}

function updateUI() {
    if (!state.user) {
        document.getElementById('setup-screen').classList.add('active');
        document.getElementById('main-screen').classList.remove('active');
        return;
    }

    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');

    const maintenance = calculateBaseMaintenance();
    const goalCal = calculateTargetGoal();
    const targetPro = calculateProteinTarget();
    
    let consumedCal = state.settings.extraBuffer || 0;
    let consumedPro = 0;
    let waterGlasses = 0;
    let burnedKcal = 0;

    const today = new Date().toDateString();
    const todayLogs = state.logs.filter(l => new Date(l.date).toDateString() === today);
    const todayWorkouts = (state.workouts || []).filter(w => new Date(w.date).toDateString() === today);

    todayLogs.forEach(log => {
        if (log.type === 'food') {
            consumedCal += log.cal;
            consumedPro += log.pro;
        } else if (log.type === 'water') {
            waterGlasses++;
        }
    });

    todayWorkouts.forEach(w => {
        burnedKcal += w.kcal || 0;
    });

    const targetWithExercise = goalCal + burnedKcal;
    const remaining = targetWithExercise - consumedCal;
    document.getElementById('cal-remaining').innerText = Math.round(remaining);
    document.getElementById('cal-progress').style.strokeDashoffset = 283 - (Math.min(consumedCal / targetWithExercise, 1) * 283);
    
    document.getElementById('protein-text').innerText = `${Math.round(consumedPro)} / ${targetPro}g`;
    document.getElementById('protein-bar').style.width = `${Math.min((consumedPro / targetPro) * 100, 100)}%`;
    
    const waterML = waterGlasses * 250;
    const waterL = (waterML / 1000).toFixed(1);
    document.getElementById('water-text').innerText = `${waterGlasses} / 10 glasses (${waterML}ml / ${waterL}L)`;
    document.getElementById('water-bar').style.width = `${Math.min((waterGlasses / 10) * 100, 100)}%`;

    const netBalance = consumedCal - (maintenance + burnedKcal);
    const lbsShift = (netBalance / 3500).toFixed(3);
    const predictionEl = document.getElementById('weight-prediction');
    if (netBalance > 0) {
        predictionEl.innerText = `Expecting to gain ${lbsShift} lbs today`;
        predictionEl.style.color = 'var(--danger)';
    } else {
        predictionEl.innerText = `Expecting to lose ${Math.abs(lbsShift)} lbs today`;
        predictionEl.style.color = 'var(--success)';
    }

    const totalBurned = maintenance + burnedKcal;
    const realBalance = consumedCal - totalBurned;
    document.getElementById('fit-balance').innerText = Math.round(Math.abs(realBalance));
    document.getElementById('deficit-status').innerText = realBalance <= 0 
        ? `You are in a ${Math.round(Math.abs(realBalance))} kcal deficit` 
        : `You are in a ${Math.round(realBalance)} kcal surplus`;

    const breakdownEl = document.getElementById('fitness-breakdown');
    breakdownEl.innerHTML = `
        <div class="breakdown-item"><span>Natural Energy Burn</span> <span>${maintenance}</span></div>
        <div class="breakdown-item"><span>Active Energy Burn</span> <span>+${Math.round(burnedKcal)}</span></div>
        <div class="breakdown-item" style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px; font-weight: 700;">
            <span>Total Energy Out</span> <span>${Math.round(totalBurned)}</span>
        </div>
        <div class="breakdown-item"><span>Total Energy In</span> <span style="color: #FF453A">-${Math.round(consumedCal)}</span></div>
    `;
    
    const fitProg = (burnedKcal / 500);
    document.getElementById('fit-progress').style.strokeDashoffset = 283 - (Math.min(fitProg, 1) * 283);

    // Muscle Repair Efficiency Logic
    const pGramsPerLb = consumedPro / state.user.weight;
    const repairEff = pGramsPerLb / (0.8 + pGramsPerLb);
    const repairPercent = Math.round(repairEff * 100);
    
    document.getElementById('repair-efficiency').innerText = `${repairPercent}%`;
    document.getElementById('repair-bar').style.width = `${repairPercent}%`;
    
    let repairMsg = "Protein is just one limiter. Hitting 8+ hours of sleep is key.";
    if (pGramsPerLb < 0.4) repairMsg = "Underfed: Recovery limited. Aim for 8+ hours of sleep.";
    else if (pGramsPerLb < 0.8) repairMsg = "Developing: Solid rest (8h+) will maximize these gains.";
    else if (pGramsPerLb < 1.2) repairMsg = "Solid: Optimal protein. 8+ hours of sleep is the final key.";
    else repairMsg = "Diminishing Returns: You're capped on protein; prioritize 8h+ sleep.";
    
    document.getElementById('repair-status').innerText = repairMsg;

    const logItems = document.getElementById('log-items');
    logItems.innerHTML = todayLogs.map((log) => `
        <div class="log-item">
            <div class="log-info">
                <h4>${log.name}</h4>
                <span>${new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="log-actions">
                <div class="log-macros">
                    ${log.type === 'food' ? `${Math.round(log.cal)} kcal` : '1 Glass (250ml)'}
                </div>
                <button class="delete-log" data-id="${log.date}">&times;</button>
            </div>
        </div>
    `).join('');

    const workoutItems = document.getElementById('workout-items');
    workoutItems.innerHTML = todayWorkouts.map(w => `
        <div class="log-item">
            <div class="log-info">
                <h4>${w.type}</h4>
                <span>${new Date(w.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="log-actions">
                <div class="log-macros" style="color: var(--success)">
                    +${Math.round(w.kcal)} kcal
                </div>
                <button class="delete-workout" data-id="${w.date}">&times;</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.delete-log').forEach(btn => {
        btn.onclick = () => deleteLog(btn.getAttribute('data-id'));
    });
    document.querySelectorAll('.delete-workout').forEach(btn => {
        btn.onclick = () => deleteWorkout(btn.getAttribute('data-id'));
    });

    document.getElementById('display-name').innerText = state.user.name;
    document.getElementById('edit-weight').value = state.user.weight;
    document.getElementById('edit-height').value = state.user.height;
    document.getElementById('edit-target-weight').value = state.user.targetWeight;
    document.getElementById('toggle-overestimate').checked = state.settings.overestimate;
    document.getElementById('toggle-underestimate').checked = state.settings.underestimatePro;
    document.getElementById('toggle-underestimate-burned').checked = state.settings.underestimateBurned;
    document.getElementById('toggle-underestimate-maintenance').checked = state.settings.underestimateMaintenance;
    document.getElementById('extra-buffer-slider').value = state.settings.extraBuffer || 0;
    document.getElementById('extra-buffer-value').innerText = state.settings.extraBuffer || 0;
    document.getElementById('edit-target-weeks').value = state.user.targetWeeks || 12;
    validateTimeline();
    syncSliderColor();

    if (state.user.pfp) {
        document.getElementById('profile-pic-large').src = state.user.pfp;
        document.getElementById('profile-trigger').style.backgroundImage = `url(${state.user.pfp})`;
    }
}

window.deleteLog = (dateId) => {
    state.logs = state.logs.filter(l => String(l.date) !== String(dateId));
    save();
};

window.deleteWorkout = (dateId) => {
    state.workouts = state.workouts.filter(w => String(w.date) !== String(dateId));
    save();
};

document.getElementById('profile-trigger').addEventListener('click', () => {
    document.querySelector('.nav-item[data-view="profile-view"]').click();
});

document.getElementById('calendar-btn').addEventListener('click', () => {
    renderCalendar();
    calendarModal.classList.add('active');
});

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const header = document.getElementById('calendar-month-year');
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    header.innerText = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    grid.innerHTML = '';
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += '<div class="calendar-day empty"></div>';
    }
    const maintenance = calculateBaseMaintenance();
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = new Date(year, month, day).toDateString();
        const isToday = dateStr === new Date().toDateString();
        const dayLogs = state.logs.filter(l => new Date(l.date).toDateString() === dateStr);
        const dayWorkouts = state.workouts.filter(w => new Date(w.date).toDateString() === dateStr);
        let consumed = state.settings.extraBuffer || 0;
        let protein = 0;
        let waterCount = 0;
        dayLogs.forEach(l => { 
            if(l.type === 'food') {
                consumed += l.cal; 
                protein += l.pro;
            } else if (l.type === 'water') {
                waterCount++;
            }
        });
        let burned = 0;
        dayWorkouts.forEach(w => burned += w.kcal);
        const net = consumed - (maintenance + burned);
        const lbs = (net / 3500).toFixed(2);
        const lbsClass = net > 0 ? 'lbs-gain' : 'lbs-loss';
        const lbsDisplay = consumed > 0 || burned > 0 ? `<div class="lbs-change ${lbsClass}">${net > 0 ? '+' : ''}${lbs}</div>` : '';
        const statsDisplay = consumed > 0 || waterCount > 0 ? `
            <div class="extra-stats">
                <span>${Math.round(protein)}g P</span>
                <div class="water-row">
                    <span>${waterCount}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
                </div>
            </div>` : '';
        grid.innerHTML += `<div class="calendar-day ${isToday ? 'today' : ''}"><span>${day}</span>${lbsDisplay}${statsDisplay}</div>`;
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('setup-name').value;
    const gender = document.getElementById('setup-gender').value;
    const age = parseInt(document.getElementById('setup-age').value);
    const height = parseInt(document.getElementById('setup-height').value);
    const weight = parseInt(document.getElementById('setup-weight').value);
    const targetWeight = parseInt(document.getElementById('setup-target-weight').value);
    const targetWeeks = parseInt(document.getElementById('setup-target-weeks').value);

    if (name && gender && age && height && weight && targetWeight && targetWeeks) {
        state.user = { name, gender, age, height, weight, targetWeight, targetWeeks };
        save();
    }
});

function autoFillWeeks() {
    const w = parseFloat(document.getElementById('setup-weight').value);
    const tw = parseFloat(document.getElementById('setup-target-weight').value);
    if (w && tw) {
        const diff = Math.abs(w - tw);
        if (diff > 0) {
            // Default to ~1.5 lbs per week for a solid but achievable pace
            const weeks = Math.ceil(diff / 1.5);
            document.getElementById('setup-target-weeks').value = weeks;
        }
    }
}

document.getElementById('setup-weight').addEventListener('input', autoFillWeeks);
document.getElementById('setup-target-weight').addEventListener('input', autoFillWeeks);

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewId = item.getAttribute('data-view');
        views.forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const titles = { 'log-view': 'Summary', 'fitness-view': 'Fitness', 'profile-view': 'Profile' };
        document.getElementById('page-title').innerText = titles[viewId];
    });
});

document.getElementById('add-workout-btn').addEventListener('click', () => {
    workoutModal.classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        foodModal.classList.remove('active');
        workoutModal.classList.remove('active');
        calendarModal.classList.remove('active');
    });
});

document.getElementById('save-workout').addEventListener('click', () => {
    const type = document.getElementById('workout-type').value;
    let kcal = parseFloat(document.getElementById('workout-kcal').value) || 0;
    if (state.settings.underestimateBurned) kcal *= 0.85;
    if (!state.workouts) state.workouts = [];
    state.workouts.unshift({ type, kcal, date: new Date().toISOString() });
    workoutModal.classList.remove('active');
    document.getElementById('workout-kcal').value = '';
    save();
});

document.getElementById('add-food-btn').addEventListener('click', () => {
    foodModal.classList.add('active');
    renderFoodList('');
});

document.getElementById('food-input').addEventListener('input', (e) => {
    renderFoodList(e.target.value);
});

function renderFoodList(query) {
    const list = document.getElementById('food-suggestions');
    const filtered = foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
    list.innerHTML = filtered.map(f => `
        <div class="suggestion-item" onclick="addFood('${f.name}')">
            <span>${f.name} <small>(${f.unit})</small></span>
            <b>+</b>
        </div>
    `).join('');
}

window.addFood = (foodName) => {
    const food = foods.find(f => f.name === foodName);
    let cal = food.cal;
    let pro = food.pro;
    if (state.settings.overestimate) cal *= 1.15;
    if (state.settings.underestimatePro) pro *= 0.85;
    state.logs.unshift({ type: 'food', name: food.name, cal, pro, date: new Date().toISOString() });
    foodModal.classList.remove('active');
    save();
};

document.getElementById('add-water-btn').addEventListener('click', () => {
    state.logs.unshift({ type: 'water', name: 'Water', date: new Date().toISOString() });
    save();
});

document.getElementById('pfp-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            state.user.pfp = event.target.result;
            save();
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('save-settings').addEventListener('click', () => {
    state.user.weight = parseInt(document.getElementById('edit-weight').value);
    state.user.height = parseInt(document.getElementById('edit-height').value);
    state.user.targetWeight = parseInt(document.getElementById('edit-target-weight').value);
    state.user.targetWeeks = parseInt(document.getElementById('edit-target-weeks').value);
    state.settings.overestimate = document.getElementById('toggle-overestimate').checked;
    state.settings.underestimatePro = document.getElementById('toggle-underestimate').checked;
    state.settings.underestimateBurned = document.getElementById('toggle-underestimate-burned').checked;
    state.settings.underestimateMaintenance = document.getElementById('toggle-underestimate-maintenance').checked;
    state.settings.extraBuffer = parseInt(document.getElementById('extra-buffer-slider').value);
    save();
    alert('Settings saved!');
});

function validateTimeline() {
    const weeks = parseInt(document.getElementById('edit-target-weeks').value);
    const weightDiff = Math.abs(state.user.targetWeight - state.user.weight);
    const lbsPerWeek = weightDiff / weeks;
    const tipEl = document.getElementById('timeline-tip');
    
    if (lbsPerWeek > 2) {
        tipEl.innerText = `Tip: Losing >2 lbs/week is very aggressive. Consider ${Math.ceil(weightDiff / 1.5)}-20 weeks for sustainability.`;
        tipEl.style.display = 'block';
    } else if (lbsPerWeek < 0.2 && weightDiff > 0) {
        tipEl.innerText = `Tip: This is a very slow pace. You might find it hard to see progress.`;
        tipEl.style.display = 'block';
    } else {
        tipEl.style.display = 'none';
    }
}

document.getElementById('edit-target-weeks')?.addEventListener('input', validateTimeline);

document.getElementById('extra-buffer-slider').oninput = (e) => {
    document.getElementById('extra-buffer-value').innerText = e.target.value;
    syncSliderColor();
};

function syncSliderColor() {
    const slider = document.getElementById('extra-buffer-slider');
    const val = slider.value;
    const min = slider.min || 0;
    const max = slider.max || 100;
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--range-progress', percent + '%');
}

document.getElementById('reset-app').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset everything?')) {
        localStorage.removeItem('aggm_state');
        location.reload();
    }
});

updateUI();
