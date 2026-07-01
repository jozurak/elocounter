const firebaseConfig = {
    apiKey: "AIzaSyAgc6-pZKfUrsai3oP8xeDrxrZYFm_-7yY",
    authDomain: "elo-pf.firebaseapp.com",
    databaseURL: "https://elo-pf-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "elo-pf",
    storageBucket: "elo-pf.firebasestorage.app",
    messagingSenderId: "199109865834",
    appId: "1:199109865834:web:9b51b7da2dbfaa25c87513"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Globálny stav
let playersData = {};
let groupsData = {};
let matchesData = {};
let selectedResult = null; // 'win1', 'win2', 'draw'

// Nastavenia (predvolené)
let kFactor = 75;
let scaleFactor = 400;

// Inicializačné dáta
const INITIAL_GROUPS = {
    "skibidi": { name: "SKIBIDI", color: "var(--group-skibidi)" },
    "szollos": { name: "Szollosove mačičky", color: "var(--group-szollos)" },
    "pdm": { name: "PDM", color: "var(--group-pdm)" },
    "schracky": { name: "Šchračky", color: "var(--group-schracky)" }
};

const INITIAL_PLAYERS = [
    { name: "Max", groupId: "skibidi" }, { name: "Matvej", groupId: "skibidi" }, { name: "Felix", groupId: "skibidi" },
    { name: "Dori", groupId: "skibidi" }, { name: "Juraj", groupId: "skibidi" }, { name: "Paľko B.", groupId: "skibidi" }, { name: "Elis", groupId: "skibidi" },
    
    { name: "Šimon", groupId: "szollos" }, { name: "Rori", groupId: "szollos" }, { name: "Martin", groupId: "szollos" },
    { name: "Nataša", groupId: "szollos" }, { name: "Mišo", groupId: "szollos" }, { name: "Rudko", groupId: "szollos" },
    
    { name: "Laci", groupId: "pdm" }, { name: "Hanka", groupId: "pdm" }, { name: "Janko", groupId: "pdm" },
    { name: "Cyril", groupId: "pdm" }, { name: "Paľko R.", groupId: "pdm" }, { name: "Roger", groupId: "pdm" }, { name: "Ninka", groupId: "pdm" },
    
    { name: "Matúš", groupId: "schracky" }, { name: "Zara", groupId: "schracky" }, { name: "Kubo", groupId: "schracky" },
    { name: "Karolína", groupId: "schracky" }, { name: "Marek", groupId: "schracky" }, { name: "David", groupId: "schracky" }
];

// --- UI Elements ---
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Match Tab Elements
const player1Select = document.getElementById('player1');
const player2Select = document.getElementById('player2');
const player1Info = document.getElementById('player1-info');
const player2Info = document.getElementById('player2-info');
const btnWin1 = document.getElementById('btn-win-1');
const btnWin2 = document.getElementById('btn-win-2');
const btnDraw = document.getElementById('btn-draw');
const submitMatchBtn = document.getElementById('submit-match');

const matchEntryForm = document.getElementById('match-entry-form');
const matchResultSummary = document.getElementById('match-result-summary');
const summaryDetails = document.getElementById('summary-details');
const nextMatchBtn = document.getElementById('next-match-btn');

// History & Leaderboard
const historyList = document.getElementById('history-list');
const playersTable = document.querySelector('#players-table tbody');
const groupsList = document.getElementById('groups-list');

// Admin Elements
const undoMatchBtn = document.getElementById('undo-match-btn');
const adminPlayerSelect = document.getElementById('admin-player-select');
const adminEloInput = document.getElementById('admin-elo-input');
const updateEloBtn = document.getElementById('update-elo-btn');
const resetDbBtn = document.getElementById('reset-db-btn');

// Admin Settings
const adminKInput = document.getElementById('admin-k-input');
const adminScaleInput = document.getElementById('admin-scale-input');
const updateSettingsBtn = document.getElementById('update-settings-btn');

// --- Initialization ---
async function initApp() {
    // Check and seed DB if empty
    const snapshot = await db.ref('players').once('value');
    if (!snapshot.exists()) {
        await seedDatabase();
    }

    // Listeners na zmeny v DB
    db.ref('settings').on('value', (snap) => {
        const settings = snap.val();
        if(settings) {
            kFactor = settings.k_factor || 75;
            scaleFactor = settings.scale_factor || 400;
            adminKInput.value = kFactor;
            adminScaleInput.value = scaleFactor;
        }
    });

    db.ref('groups').on('value', (snap) => {
        groupsData = snap.val() || {};
        renderGroupsLeaderboard();
    });

    db.ref('players').on('value', (snap) => {
        playersData = snap.val() || {};
        updateSelects();
        renderPlayersLeaderboard();
        renderGroupsLeaderboard();
        updateSelectedPlayersInfo();
    });

    db.ref('matches').orderByChild('timestamp').on('value', (snap) => {
        matchesData = [];
        snap.forEach(child => {
            matchesData.push({ id: child.key, ...child.val() });
        });
        matchesData.reverse(); // Najnovšie hore
        renderHistory();
    });

    setupEventListeners();
}

async function seedDatabase() {
    showToast("Inicializujem novú databázu...", false);
    
    // Set groups
    await db.ref('groups').set(INITIAL_GROUPS);

    // Set settings
    await db.ref('settings').set({
        k_factor: 75,
        scale_factor: 400
    });

    // Set players
    const playersObj = {};
    INITIAL_PLAYERS.forEach((p, idx) => {
        const id = `p_${idx.toString().padStart(3, '0')}`;
        playersObj[id] = {
            name: p.name,
            groupId: p.groupId,
            elo: 1000
        };
    });
    
    await db.ref('players').set(playersObj);
    await db.ref('matches').set(null);
    
    showToast("Databáza úspešne vytvorená.");
}

// --- Event Listeners ---
function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Match Selection
    player1Select.addEventListener('change', () => { updateSelectedPlayersInfo(); validateMatchForm(); });
    player2Select.addEventListener('change', () => { updateSelectedPlayersInfo(); validateMatchForm(); });

    const selectResult = (result) => {
        btnWin1.classList.remove('selected');
        btnWin2.classList.remove('selected');
        btnDraw.classList.remove('selected');
        
        selectedResult = result;
        if(result === 'win1') btnWin1.classList.add('selected');
        if(result === 'win2') btnWin2.classList.add('selected');
        if(result === 'draw') btnDraw.classList.add('selected');
        
        validateMatchForm();
    };

    btnWin1.addEventListener('click', () => selectResult('win1'));
    btnWin2.addEventListener('click', () => selectResult('win2'));
    btnDraw.addEventListener('click', () => selectResult('draw'));

    submitMatchBtn.addEventListener('click', handleSubmitMatch);

    nextMatchBtn.addEventListener('click', () => {
        // Reset form
        player1Select.value = "";
        player2Select.value = "";
        btnWin1.classList.remove('selected');
        btnWin2.classList.remove('selected');
        btnDraw.classList.remove('selected');
        selectedResult = null;
        validateMatchForm();
        updateSelectedPlayersInfo();
        
        matchResultSummary.style.display = 'none';
        matchEntryForm.style.display = 'flex';
    });

    // Admin
    undoMatchBtn.addEventListener('click', handleUndoLastMatch);
    
    adminPlayerSelect.addEventListener('change', (e) => {
        const pId = e.target.value;
        if(pId && playersData[pId]) {
            adminEloInput.value = playersData[pId].elo;
            updateEloBtn.disabled = false;
        } else {
            adminEloInput.value = "";
            updateEloBtn.disabled = true;
        }
    });

    updateEloBtn.addEventListener('click', async () => {
        const pId = adminPlayerSelect.value;
        const newElo = parseInt(adminEloInput.value);
        if(pId && !isNaN(newElo)) {
            await db.ref(`players/${pId}`).update({ elo: newElo });
            showToast("Elo úspešne upravené.");
            adminPlayerSelect.value = "";
            adminEloInput.value = "";
            updateEloBtn.disabled = true;
        }
    });

    // Update settings
    updateSettingsBtn.addEventListener('click', async () => {
        const newK = parseInt(adminKInput.value);
        const newScale = parseInt(adminScaleInput.value);
        if(!isNaN(newK) && !isNaN(newScale) && newK > 0 && newScale > 0) {
            await db.ref('settings').set({
                k_factor: newK,
                scale_factor: newScale
            });
            showToast("Nastavenia úspešne uložené.");
        } else {
            showToast("Zadaj platné kladné čísla pre konštanty.", true);
        }
    });

    resetDbBtn.addEventListener('click', () => {
        if(confirm("Si si istý? Vymažú sa všetky zápasy a Elo sa resetne na 1000!")) {
            seedDatabase();
        }
    });
}

// --- Logika ---
function updateSelects() {
    const players = Object.entries(playersData).sort((a, b) => a[1].name.localeCompare(b[1].name));
    
    const fillSelect = (selectElem, withEmpty = true) => {
        const currentVal = selectElem.value;
        selectElem.innerHTML = withEmpty ? '<option value="">Vyber hráča...</option>' : '';
        players.forEach(([id, p]) => {
            const groupName = groupsData[p.groupId]?.name || '';
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${p.name} (${groupName})`;
            selectElem.appendChild(option);
        });
        if(currentVal && playersData[currentVal]) selectElem.value = currentVal;
    };

    fillSelect(player1Select);
    fillSelect(player2Select);
    fillSelect(adminPlayerSelect);
}

function updateSelectedPlayersInfo() {
    const p1Id = player1Select.value;
    const p2Id = player2Select.value;
    
    if(p1Id && playersData[p1Id]) {
        player1Info.textContent = `Aktuálne Elo: ${playersData[p1Id].elo}`;
    } else {
        player1Info.textContent = "Elo: -";
    }

    if(p2Id && playersData[p2Id]) {
        player2Info.textContent = `Aktuálne Elo: ${playersData[p2Id].elo}`;
    } else {
        player2Info.textContent = "Elo: -";
    }
}

function validateMatchForm() {
    const p1Id = player1Select.value;
    const p2Id = player2Select.value;
    
    if (p1Id && p2Id && p1Id !== p2Id && selectedResult) {
        submitMatchBtn.disabled = false;
    } else {
        submitMatchBtn.disabled = true;
    }
}

async function handleSubmitMatch() {
    const p1Id = player1Select.value;
    const p2Id = player2Select.value;
    
    if(!p1Id || !p2Id || p1Id === p2Id || !selectedResult) return;
    
    const p1 = playersData[p1Id];
    const p2 = playersData[p2Id];
    
    let eloChange1 = 0;
    let eloChange2 = 0;
    
    if (selectedResult === 'win1') {
        const expected = 1 / (1 + Math.pow(10, (p2.elo - p1.elo) / scaleFactor));
        const change = Math.round(kFactor * (1 - expected));
        eloChange1 = change;
        eloChange2 = -change;
    } else if (selectedResult === 'win2') {
        const expected = 1 / (1 + Math.pow(10, (p1.elo - p2.elo) / scaleFactor));
        const change = Math.round(kFactor * (1 - expected));
        eloChange1 = -change;
        eloChange2 = change;
    } else if (selectedResult === 'draw') {
        eloChange1 = 0;
        eloChange2 = 0;
    }

    const matchData = {
        timestamp: Date.now(),
        p1Id: p1Id,
        p1Name: p1.name,
        p1EloBefore: p1.elo,
        p1EloChange: eloChange1,
        p2Id: p2Id,
        p2Name: p2.name,
        p2EloBefore: p2.elo,
        p2EloChange: eloChange2,
        result: selectedResult
    };

    const updates = {};
    const newMatchRef = db.ref('matches').push();
    updates[`matches/${newMatchRef.key}`] = matchData;
    updates[`players/${p1Id}/elo`] = p1.elo + eloChange1;
    updates[`players/${p2Id}/elo`] = p2.elo + eloChange2;

    await db.ref().update(updates);
    
    const formatChange = (change) => {
        if(change > 0) return `<span class="elo-plus" style="color: var(--success-color); font-weight: bold;">+${change}</span>`;
        if(change < 0) return `<span class="elo-minus" style="color: var(--danger-color); font-weight: bold;">${change}</span>`;
        return `<span class="elo-zero" style="color: var(--draw-color); font-weight: bold;">0</span>`;
    };

    summaryDetails.innerHTML = `
        <div style="display: flex; justify-content: space-around; align-items: center; background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 1rem;">
            <div>
                <div style="font-weight: bold; font-size: 1.4rem;">${p1.name}</div>
                <div style="font-size: 1.8rem; margin: 0.5rem 0;">${formatChange(eloChange1)}</div>
                <div style="color: var(--text-secondary);">Nové Elo: ${p1.elo + eloChange1}</div>
            </div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-secondary);">VS</div>
            <div>
                <div style="font-weight: bold; font-size: 1.4rem;">${p2.name}</div>
                <div style="font-size: 1.8rem; margin: 0.5rem 0;">${formatChange(eloChange2)}</div>
                <div style="color: var(--text-secondary);">Nové Elo: ${p2.elo + eloChange2}</div>
            </div>
        </div>
    `;

    matchEntryForm.style.display = 'none';
    matchResultSummary.style.display = 'block';
    
    showToast("Zápas úspešne zaznamenaný!");
}

async function handleUndoLastMatch() {
    if (matchesData.length === 0) {
        showToast("História je prázdna, nie je čo zmazať.", true);
        return;
    }

    const lastMatch = matchesData[0]; // matchesData is sorted newest first
    
    if (!confirm(`Naozaj chceš zmazať posledný zápas (${lastMatch.p1Name} vs ${lastMatch.p2Name})?`)) return;

    const updates = {};
    updates[`matches/${lastMatch.id}`] = null;
    
    // Revert elo only if players still exist
    if(playersData[lastMatch.p1Id]) {
        updates[`players/${lastMatch.p1Id}/elo`] = playersData[lastMatch.p1Id].elo - lastMatch.p1EloChange;
    }
    if(playersData[lastMatch.p2Id]) {
        updates[`players/${lastMatch.p2Id}/elo`] = playersData[lastMatch.p2Id].elo - lastMatch.p2EloChange;
    }

    await db.ref().update(updates);
    showToast("Zápas bol zmazaný a Elo vrátené.");
}

// --- Renderers ---
function renderHistory() {
    historyList.innerHTML = '';
    
    if(matchesData.length === 0) {
        historyList.innerHTML = '<li class="history-item"><p>Žiadne zápasy v histórii.</p></li>';
        return;
    }

    matchesData.forEach(match => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        const date = new Date(match.timestamp).toLocaleString('sk-SK');
        
        let p1Class = match.result === 'win1' ? 'winner' : (match.result === 'draw' ? 'draw' : 'loser');
        let p2Class = match.result === 'win2' ? 'winner' : (match.result === 'draw' ? 'draw' : 'loser');

        const formatChange = (change) => {
            if(change > 0) return `<span class="elo-plus">+${change}</span>`;
            if(change < 0) return `<span class="elo-minus">${change}</span>`;
            return `<span class="elo-zero">0</span>`;
        };

        li.innerHTML = `
            <div class="match-details">
                <div class="match-player ${p1Class}">
                    ${match.p1Name}
                    <div>${formatChange(match.p1EloChange)}</div>
                </div>
                <div class="match-vs">VS</div>
                <div class="match-player ${p2Class}">
                    ${match.p2Name}
                    <div>${formatChange(match.p2EloChange)}</div>
                </div>
            </div>
            <div class="match-date">${date}</div>
        `;
        historyList.appendChild(li);
    });
}

function renderPlayersLeaderboard() {
    playersTable.innerHTML = '';
    
    const sorted = Object.values(playersData).sort((a, b) => b.elo - a.elo);
    
    sorted.forEach((p, index) => {
        const group = groupsData[p.groupId];
        const tr = document.createElement('tr');
        
        let rankContent = index + 1;
        if(index < 3) {
            tr.innerHTML = `
                <td><span class="rank-badge">${index + 1}</span></td>
                <td><strong>${p.name}</strong></td>
                <td><span class="group-badge" style="background: ${group?.color || '#555'}">${group?.name || 'Neznáma'}</span></td>
                <td class="elo-value">${p.elo}</td>
            `;
        } else {
            tr.innerHTML = `
                <td>${index + 1}.</td>
                <td>${p.name}</td>
                <td><span class="group-badge" style="background: ${group?.color || '#555'}">${group?.name || 'Neznáma'}</span></td>
                <td class="elo-value">${p.elo}</td>
            `;
        }
        playersTable.appendChild(tr);
    });
}

function renderGroupsLeaderboard() {
    groupsList.innerHTML = '';
    
    const groupStats = {};
    // Init group stats
    Object.keys(groupsData).forEach(gid => {
        groupStats[gid] = { sum: 0, count: 0, name: groupsData[gid].name, color: groupsData[gid].color };
    });
    
    // Accumulate
    Object.values(playersData).forEach(p => {
        if(groupStats[p.groupId]) {
            groupStats[p.groupId].sum += p.elo;
            groupStats[p.groupId].count += 1;
        }
    });

    const groupsArr = Object.values(groupStats)
        .filter(g => g.count > 0)
        .map(g => ({
            name: g.name,
            color: g.color,
            avg: Math.round(g.sum / g.count)
        }))
        .sort((a, b) => b.avg - a.avg); // Sort by avg desc

    groupsArr.forEach(g => {
        const div = document.createElement('div');
        div.className = 'group-item';
        div.style.borderLeftColor = g.color;
        div.innerHTML = `
            <span class="group-name">${g.name}</span>
            <span class="group-avg">${g.avg}</span>
        `;
        groupsList.appendChild(div);
    });
}

// --- Utils ---
let toastTimeout;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    if(isError) {
        toast.classList.add('error');
    } else {
        toast.classList.remove('error');
    }
    
    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Start aplikácie
document.addEventListener('DOMContentLoaded', initApp);
