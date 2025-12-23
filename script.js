// --- FIREBASE IMPORTS (MANDATORY BOILERPLATE) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global Firebase variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db, auth, userId;
// --------------------------------------------------

const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const lootLog = document.getElementById('lootLog');
const chatInput = document.getElementById('chatInput'); // New chat element
const sendChatBtn = document.getElementById('sendChatBtn'); // New chat element
const screenContainer = document.getElementById('screenContainer');
const mainAppContent = document.getElementById('mainAppContent'); // Main content wrapper
const characterSelectScreen = document.getElementById('characterSelectScreen');

// Configuration
const RENDER_SCALE = 2;	
const MINIMAL_MOVEMENT_THRESHOLD = 5; // Pixels for drag vs click determination
let config = { width: 1920, height: 1080, cols: 0, rows: 0, gridSize: 24, mapType: 'vault', wallColor: '#16ff60', bgColor: '#050505', showLabels: true, fogEnabled: true };

// Runtime State
let tumbleweeds = [];
let dustMotes = [];	
let mousePos = { x: 0, y: 0 };	
let cloudCanvas = null; // High-res procedural fog texture
let userName = "Traveler"; // Global name for chat
let playerToken = null; // Stores the selected character's name/color/src for chat/map identity

// --- NEW PANNING STATE ---
let mapOffsetX = 0; // Current global map offset X (in logical pixels)
let mapOffsetY = 0; // Current global map offset Y (in logical pixels)
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let zoomLevel = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4.0;
// -------------------------

// --- Track last loot click for GM override ---
let lastLootClick = { x: -1, y: -1, time: 0 };
const DOUBLE_CLICK_TIME = 500; // ms
// --------------------------------------------------

// NETWORK & TOKEN GLOBALS
let peer = null;
let conn = null;           // Last connection (still used on clients)
let connections = [];      // NEW: all client connections on the host
let isHost = false;
let tokens = [];           // { id, x, y, label, color, src, img }
let tokenLabelsVisible = {}; // Track label visibility
let draggedToken = null;
let isClient = false;      // If true, disable generation controls


// --- TOKEN LOGIC & PRESETS (Used for Selection and GM Deploy) ---
const OVERSEER_TOKEN_ID = "OVERSEER";




const TOKEN_PRESETS = [
    // SPECIAL: OVERSEER Token (Uses user provided image)
    { name: OVERSEER_TOKEN_ID, color: "#16ff60", src: "https://i.redd.it/oaoxjcgfbnwc1.jpeg", isHostTrigger: true },
    // Players:
    { name: "Scabigail", color: "#eab308", src: "https://i.postimg.cc/Hx0nX4vK/Scabigail_Vault_Boy.png" },
    { name: "Sally", color: "#16ff60", src: "https://i.postimg.cc/hjRhX3s6/Sally_Vault_Boy.png" },
    { name: "K2-1B", color: "#ef4444", src: "https://i.postimg.cc/LXk5LBQG/K2_Vault_Boy.png" },
    { name: "Bulk McHuge-Large", color: "#3b82f6", src: "https://i.postimg.cc/C1C5kH6T/Bulk_Vault_Boy.png" },
    { name: "Sylvie", color: "#a855f7", src: "https://i.postimg.cc/tTdJWtvm/Sylvie_Vault_Boy.png" },
    { name: "Melody Jones", color: "#ffffff", src: "https://i.postimg.cc/3RjNmCb7/Melody_Vault_Boy.png" }
];

// --- NEW: Character Selection/Login Flow ---

function showLoginScreen() {
    const grid = document.getElementById('initialTokenGrid');
    const joinInterface = document.getElementById('joinInterface');
    grid.innerHTML = ''; 

    // Show ALL options initially, including the Overseer option
    const presets = TOKEN_PRESETS;
    
    document.getElementById('selectionTitle').innerText = "SELECT UNIT DESIGNATION";
    document.getElementById('selectionSubtitle').innerText = "CHOOSE YOUR ROLE: OVERSEER (HOST) OR A FIELD AGENT (CLIENT).";
    
    joinInterface.classList.add('hidden-ui');
    grid.classList.remove('hidden-ui');

    presets.forEach(p => {
        const displayName = p.isHostTrigger ? "OVERSEER (HOST)" : p.name;
        const div = document.createElement('div');
        div.className = `border-2 border-[var(--dim-color)] p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--dim-color)] transition-all transform hover:scale-105 rounded-lg text-center`;
        div.id = `token-${p.name.replace(/\s/g, '-')}`;

        div.innerHTML = `
            <img src="${p.src}" onerror="this.onerror=null; this.src='https://placehold.co/64x64/1e293b/a8a29e?text=?'" class="w-16 h-16 rounded-full border-4 border-[${p.color}] mb-4 bg-black/50 object-cover shadow-xl">
            <span class="text-lg tracking-widest" style="color: ${p.color}; text-shadow: 0 0 5px ${p.color}80;">${displayName}</span>
        `;
        
        div.onclick = () => selectCharacter(p); 
        grid.appendChild(div);
    });
    
    characterSelectScreen.classList.remove('hidden');
}

function selectCharacter(p) {
    // Un-highlight previous selection and highlight current
    document.querySelectorAll('#initialTokenGrid div').forEach(el => el.classList.remove('selected-token'));
    document.getElementById(`token-${p.name.replace(/\s/g, '-')}`).classList.add('selected-token');

    if (p.isHostTrigger) {
        // Case 1: GM selects the Host/Overseer Token -> Auto-Host
        playerToken = p;
        hostSession();
        // hostSession() calls activateAppUI() and hides the modal
        return;
    }

    // Case 2: Client selects a Player Token -> Set name/token and show join interface
    playerToken = p;
    userName = p.name;
    log(`DESIGNATION ACQUIRED: ${userName}`, p.color);

    // Hide token grid, show join interface
    document.getElementById('initialTokenGrid').classList.add('hidden-ui');
    document.getElementById('joinInterface').classList.remove('hidden-ui');
    document.getElementById('selectionTitle').innerText = "CONNECTION ESTABLISHMENT";
    document.getElementById('selectionSubtitle').innerText = `READY ${userName}. INPUT OVERSEER ID.`;

    // Give focus to the ID input (using the actual input ID)
    document.getElementById('autoJoinInput').focus();
}

function activateAppUI() {
    mainAppContent.classList.remove('hidden-ui');
    characterSelectScreen.classList.add('hidden');
    toggleClientControls(isClient); // Set controls based on role
    toggleChatControls(true); 
    // New logic: If client, ensure labels are off locally
    if (isClient) {
        config.showLabels = false;
        // Visually update the button to reflect the new state (if possible, though client can't click it)
    }
    drawCurrentLevel();
}

// --- END: Character Selection/Login Flow ---


const ENEMY_PRESETS = {
    "Ghouls": [
        { name: "Feral Ghoul", color: "#9ca3af", src: "https://upload.wikimedia.org/wikipedia/en/8/86/FeralGhoul.png" },
        { name: "Feral Ghoul Roamer", color: "#6b7280", src: "https://images.fallout.wiki/6/6c/Ghoul_Roamer.png" },
        { name: "Glowing One", color: "#84cc16", src: "https://images.fallout.wiki/d/d8/Glowing_One_Render.png" },
        { name: "Ghoul Reaver", color: "#ef4444", src: "https://static.wikia.nocookie.net/fallout/images/d/d9/Feral_ghoul_reaver.png" },
        { name: "Chinese Remnant Ghoul", color: "#dc2626", src: "https://static.wikia.nocookie.net/fallout/images/d/d5/Mama_Dolce%27s_Chinese_remnants_captain.png" },
        { name: "Trog", color: "#78716c", src: "https://static.wikia.nocookie.net/fallout/images/5/5e/Trog.png" },
        { name: "Alien", color: "#a3e635", src: "https://static.wikia.nocookie.net/aliens/images/e/ee/Alien-Fallout.png" }
    ],
    "Super Mutants": [
        { name: "Super Mutant", color: "#a3e635", src: "https://static.wikia.nocookie.net/fallout/images/4/48/FNV_super_mutant.png" },
        { name: "Super Mutant Brute", color: "#65a30d", src: "https://static.wikia.nocookie.net/fallout/images/8/8f/FO3_super_mutant_brute.png" },
        { name: "Super Mutant Master", color: "#4d7c0f", src: "https://static.wikia.nocookie.net/fallout/images/9/92/FNV_Jacobstown_Master.png" },
        { name: "Super Mutant Behemoth", color: "#365314", src: "https://images.fallout.wiki/8/86/FO3_super_mutant_behemoth.png" },
        { name: "Nightkin", color: "#7c3aed", src: "https://images.fallout.wiki/b/ba/FNV_Nightkin_Render.png" }
    ],
    "Raiders": [
        { name: "Raider", color: "#dc2626", src: "https://static.wikia.nocookie.net/fallout/images/b/bd/Raider_Throwdown_Armor.png" },
        { name: "Cannibal", color: "#991b1b", src: "https://i.postimg.cc/V5yp54Bb/unnamed-removebg-preview-(4).png" },
        { name: "Slaver", color: "#7f1d1d", src: "https://i.postimg.cc/1z12yW5h/Untitled-design-2-removebg-preview.png" },
        { name: "Heretic", color: "#b91c1c", src: "https://i.postimg.cc/524ffNPn/image-2025-12-03-220137473-removebg-preview.png" },
        { name: "Blightfire Fuse", color: "#ea580c", src: "https://i.postimg.cc/HL0nBPP6/image-2025-12-03-215705349-removebg-preview.png" },
        { name: "Blightfire Decanus", color: "#c2410c", src: "https://i.postimg.cc/1zsYNfkL/unnamed-removebg-preview-(3).png" },
        { name: "Blightfire Pyro", color: "#f97316", src: "https://i.postimg.cc/rFbkWCgz/unnamed-removebg-preview-(2).png" }
    ],
    "Military": [
        { name: "NCR Remnant", color: "#eab308", src: "https://vignette.wikia.nocookie.net/fallout/images/7/75/NCR_trooper.png" },
        { name: "NCR Ranger Exile", color: "#ca8a04", src: "https://static.wikia.nocookie.net/fallout_gamepedia/images/2/2d/NCRRiotControl.png" },
        { name: "Headhunter Merc", color: "#737373", src: "https://static.wikia.nocookie.net/fallout/images/e/e9/Merc_cruiser_outfit.png" },
        { name: "Wolfe Company Merc", color: "#525252", src: "https://static.wikia.nocookie.net/fallout/images/4/46/Fo3_Talon_Merc.png" },
        { name: "Williamsport Scout", color: "#b91c1c", src: "https://vignette2.wikia.nocookie.net/fallout/images/d/dd/LegionaryScout.png" },
        { name: "Big Apple Ranger", color: "#dc2626", src: "https://static.wikia.nocookie.net/fallout/images/c/c1/Ranger_red_scarf_outfit.png" },
        { name: "Hitman", color: "#0f766e", src: "https://static.wikia.nocookie.net/fallout/images/2/2d/General_Olivers_uniform.png" },
        { name: "Slag", color: "#57534e", src: "https://static.wikia.nocookie.net/fallout/images/8/8c/Scrapper.png" }
    ],
    "Power Armor": [
        { name: "BoS Squad", color: "#0ea5e9", src: "https://www.nicepng.com/png/full/319-3191402_draw-a-brotherhood-of-steel-paladin-in-power.png" },
        { name: "Enclave Remnant", color: "#1e293b", src: "https://5efallout.wdfiles.com/local--files/5efallout:bestiary:enclave/Enclave.png" }
    ],
    "Robots: Security": [
        { name: "Protectron", color: "#64748b", src: "https://static.wikia.nocookie.net/fallout/images/5/5b/Protectron.png" },
        { name: "Protect-O-Bot", color: "#475569", src: "https://i.postimg.cc/DfJgYv57/Protect0Bot-removebg-preview.png" },
        { name: "Securitron Mk I", color: "#94a3b8", src: "https://static.wikia.nocookie.net/fallout/images/7/7e/Securitron.png" },
        { name: "Oculobot", color: "#cbd5e1", src: "https://images.fallout.wiki/3/3e/Fo3_Enclave_eyebot.png" }
    ],
    "Robots: Military": [
        { name: "Mr. Handy", color: "#71717a", src: "https://static.wikia.nocookie.net/fallout/images/8/8c/Mister_Handy.png" },
        { name: "Mr. Gutsy", color: "#52525b", src: "https://static.wikia.nocookie.net/fallout/images/6/69/Mister_Gutsy.png" },
        { name: "Sentry Bot", color: "#3f3f46", src: "https://static.wikia.nocookie.net/fallout/images/8/8d/Military_sentry_bot.png" },
        { name: "Roboscorpion", color: "#78716c", src: "https://static.wikia.nocookie.net/fallout/images/e/e5/Robo-scorpion.png" },
        { name: "Automated Turret", color: "#57534e", src: "https://static.wikia.nocookie.net/fallout/images/0/0b/Fo3_automated_turret.png" },
        { name: "Securitron Mk II", color: "#a8a29e", src: "https://images.fallout.wiki/5/5e/FNV_M235_Missile_Launchers.png" }
    ],
    "Insects": [
        { name: "Radroach", color: "#78716c", src: "https://static.wikia.nocookie.net/fallout/images/8/86/Radroach.png" },
        { name: "Bloatfly", color: "#84cc16", src: "https://static.wikia.nocookie.net/fallout/images/9/9d/Bloatfly.png" },
        { name: "Giant Ant", color: "#dc2626", src: "https://static.wikia.nocookie.net/fallout/images/d/d7/Giant_soldier_ant.png" },
        { name: "Fire Ant", color: "#f97316", src: "https://static.wikia.nocookie.net/fallout/images/0/05/Fire_ant.png" },
        { name: "Giant Mantid", color: "#22c55e", src: "https://static.wikia.nocookie.net/fallout/images/e/eb/Giant_mantis.png" },
        { name: "Cazador", color: "#ea580c", src: "https://static.wikia.nocookie.net/fallout/images/e/e4/Cazador.png" },
        { name: "Scythewing", color: "#f59e0b", src: "https://i.postimg.cc/43j7S9X0/unnamed-removebg-preview-(1).png" }
    ],
    "Deathclaws": [
        { name: "Deathclaw", color: "#57534e", src: "https://static.wikia.nocookie.net/fallout/images/9/9c/Deathclaw.png" }
    ],
    "Wildlife": [
        { name: "Mole Rat", color: "#a8a29e", src: "https://static.wikia.nocookie.net/fallout/images/3/3c/Mole_rat_FO3.png" },
        { name: "Pig Rat", color: "#f472b6", src: "https://images.fallout.wiki/c/cc/PigRat.webp" },
        { name: "Vicious Dog", color: "#78716c", src: "https://images.fallout.wiki/6/6b/Vicious_dog.png" },
        { name: "Radscorpion", color: "#b45309", src: "https://static.wikia.nocookie.net/fallout/images/6/66/Radscorpion.png" },
        { name: "Mirelurk", color: "#0891b2", src: "https://static.wikia.nocookie.net/fallout/images/0/06/Mirelurk.png" },
        { name: "Moray Eel", color: "#a855f7", src: "https://static.wikia.nocookie.net/fallout/images/7/7e/Fish_purple_radpole.webp" },
        { name: "Centaur", color: "#dc2626", src: "https://static.wikia.nocookie.net/fallout/images/9/92/CentaurEvolved.png" },
        { name: "Yao Guai", color: "#57534e", src: "https://static.wikia.nocookie.net/fallout/images/2/2e/Yao_guai.png" },
        { name: "Guai Wu", color: "#78716c", src: "https://i.postimg.cc/6pSggjnX/unnamed-removebg-preview.png" },
        { name: "Nightstalker", color: "#7c3aed", src: "https://static.wikia.nocookie.net/fallout/images/9/91/Nightstalker.png" },
        { name: "Spore Carrier", color: "#84cc16", src: "https://static.wikia.nocookie.net/fallout/images/a/af/Spore_carrier.png" },
        { name: "Spore Plant", color: "#22c55e", src: "https://static.wikia.nocookie.net/fallout/images/c/c7/Spore_plant.png" },
        { name: "Tunneler", color: "#a8a29e", src: "https://static.wikia.nocookie.net/fallout/images/4/4c/Tunneler.png" },
        { name: "Gecko", color: "#84cc16", src: "https://static.wikia.nocookie.net/fallout/images/c/ce/FNV_LGecko.png" },
        { name: "Golden Gecko", color: "#eab308", src: "https://static.wikia.nocookie.net/fallout/images/7/74/FNV_GGecko.png" },
        { name: "Fire Gecko", color: "#22c55e", src: "https://static.wikia.nocookie.net/fallout/images/1/15/GreenGeckoFNV.png" },
        { name: "Brahmin", color: "#a8a29e", src: "https://static.wikia.nocookie.net/fallout/images/2/2f/Brahmin_FO3.png" }
    ]
};

// Track spawn counts for automatic numbering
let enemySpawnCounts = {};

// === PART 1: UPDATE openGMTokenDeploy() ===
function openGMTokenDeploy() {
    if (isClient) return;

    const modal = document.getElementById('gmTokenDeployModal');
    const grid = document.getElementById('tokenGrid');
    grid.innerHTML = '';
	
	 // === ADD SYNC BUTTON HERE ===
    const syncBtn = document.createElement('button');
    syncBtn.innerHTML = '[SYNC ENEMIES]';
    syncBtn.className = 'pip-btn w-full mb-4 bg-green-600 hover:bg-green-700';
    syncBtn.onclick = syncCombatToMap;
    grid.appendChild(syncBtn);
    // === END BUTTON ===

    // Category dropdown with ALL categories
    const select = document.createElement('select');
    select.className = "pip-input w-full mb-4";
    select.innerHTML = `
        <option value="players">PLAYERS</option>
        <option value="ghouls">GHOULS</option>
        <option value="supermutants">SUPER MUTANTS</option>
        <option value="raiders">RAIDERS</option>
        <option value="military">MILITARY</option>
        <option value="powerarmor">POWER ARMOR</option>
        <option value="robotssecurity">ROBOTS: SECURITY</option>
        <option value="robotsmilitary">ROBOTS: MILITARY</option>
        <option value="insects">INSECTS</option>
        <option value="deathclaws">DEATHCLAWS</option>
        <option value="wildlife">WILDLIFE</option>
        <option value="custom">CUSTOM</option>
    `;
    select.onchange = () => showTokenCategory(select.value, grid);
    grid.appendChild(select);

    showTokenCategory('players', grid);
    modal.style.display = 'flex';
}

// === PART 2: UPDATE showTokenCategory() ===
function showTokenCategory(category, grid) {
    grid.innerHTML = '';

    // Re-add category selector
    const select = document.createElement('select');
    select.className = "pip-input w-full mb-4";
    select.innerHTML = `
        <option value="players">PLAYERS</option>
        <option value="ghouls">GHOULS</option>
        <option value="supermutants">SUPER MUTANTS</option>
        <option value="raiders">RAIDERS</option>
        <option value="military">MILITARY</option>
        <option value="powerarmor">POWER ARMOR</option>
        <option value="robotssecurity">ROBOTS: SECURITY</option>
        <option value="robotsmilitary">ROBOTS: MILITARY</option>
        <option value="insects">INSECTS</option>
        <option value="deathclaws">DEATHCLAWS</option>
        <option value="wildlife">WILDLIFE</option>
        <option value="custom">CUSTOM</option>
    `;
    select.value = category;
    select.onchange = () => showTokenCategory(select.value, grid);
    grid.appendChild(select);

    if (category === 'players') {
        TOKEN_PRESETS.filter(p => !p.isHostTrigger).forEach(p => {
            const div = document.createElement('div');
            div.className = "border border-[var(--dim-color)] p-2 flex flex-col items-center cursor-pointer hover:bg-[var(--dim-color)] transition-colors";
            div.innerHTML = `<img src="${p.src}" onerror="this.onerror=null; this.src='https://placehold.co/48x48/1e293b/a8a29e?text=?'" class="w-12 h-12 mb-2"><span class="text-xs">${p.name}</span>`;
            div.onclick = () => spawnToken(p.name, p.color, p.src);
            grid.appendChild(div);
        });
    } else if (category === 'custom') {
        const div = document.createElement('div');
        div.className = "col-span-full p-4 border border-[var(--dim-color)]";
        div.innerHTML = `
            <label class="block mb-2 text-sm">NAME:</label>
            <input type="text" id="customName" class="pip-input mb-3" placeholder="Enemy Name">
            <label class="block mb-2 text-sm">IMAGE URL:</label>
            <input type="text" id="customUrl" class="pip-input mb-3" placeholder="https://...">
            <button onclick="spawnCustomToken()" class="pip-btn w-full">[DEPLOY]</button>
        `;
        grid.appendChild(div);
    } else {
        // Map category value to ENEMY_PRESETS key
        const categoryMap = {
            'ghouls': 'Ghouls',
            'supermutants': 'Super Mutants',
            'raiders': 'Raiders',
            'military': 'Military',
            'powerarmor': 'Power Armor',
            'robotssecurity': 'Robots: Security',
            'robotsmilitary': 'Robots: Military',
            'insects': 'Insects',
            'deathclaws': 'Deathclaws',
            'wildlife': 'Wildlife'
        };

        const categoryKey = categoryMap[category];
        if (ENEMY_PRESETS[categoryKey]) {
            ENEMY_PRESETS[categoryKey].forEach(enemy => {
                const div = document.createElement('div');
                div.className = "border border-[var(--dim-color)] p-3 flex flex-col items-center";
                div.innerHTML = `
                    <img src="${enemy.src}" onerror="this.onerror=null; this.src='https://placehold.co/48x48/1e293b/a8a29e?text=?'" class="w-12 h-12 mb-2" style="image-rendering: auto;">
                    <span class="text-xs text-center mb-2">${enemy.name}</span>
                    <div class="flex items-center gap-2 w-full">
                        <input type="number" id="count-${enemy.name.replace(/\s+/g, '-')}" class="pip-input text-center w-16" value="1" min="1" max="20">
                        <button class="pip-btn flex-1 text-xs">[SPAWN]</button>
                    </div>
                `;

                const spawnBtn = div.querySelector('button');
                spawnBtn.onclick = () => spawnMultipleEnemies(enemy.name, enemy.color, enemy.src);

                grid.appendChild(div);
            });
        }
    }
}






function spawnMultipleEnemies(baseName, color, src) {
    const inputId = `count-${baseName.replace(/\s+/g, '-')}`;
    const count = parseInt(document.getElementById(inputId)?.value || 1);
    
    if (!enemySpawnCounts[baseName]) {
        enemySpawnCounts[baseName] = 0;
    }
    
    for (let i = 0; i < count; i++) {
        enemySpawnCounts[baseName]++;
        const numberedName = `${baseName} ${enemySpawnCounts[baseName]}`;
        
        const offsetX = (i % 5) * 30 - 60;
        const offsetY = Math.floor(i / 5) * 30 - 30;
        
        spawnTokenAtPosition(numberedName, color, src, 
            config.width / 2 + offsetX, 
            config.height / 2 + offsetY
        );
    }
    
    closeGMTokenDeploy();
    log(`SPAWNED ${count}x ${baseName}`, color);
}


function spawnTokenAtPosition(name, color, src, x, y, multiplier = 1.0) {
    const t = {
        id: Date.now() + Math.random(),
        x: x,
        y: y,
        label: name,
        color: color,
        src: src || "",
        img: null,
        multiplier: multiplier // <--- THE DNA: 0.75, 1.0, 1.5, or 2.0
    };

    if (src) {
        const img = new Image();
        img.onload = () => {
            t.img = img;
            drawCurrentLevel();
            if (typeof syncData === "function") syncData();
        };
        img.onerror = () => {
            t.img = null;
            t.color = "#ef4444";
            log(`Image failed for ${name}`, "#ef4444");
        };
        img.src = src;
        t.img = img;
    }

    tokens.push(t);
    if (typeof syncData === "function") syncData();
    log(`Spawned: ${name} [Size x${multiplier}]`, color);
}

// Modified original spawnToken to use the new function
function spawnToken(name, color, src) {
    spawnTokenAtPosition(name, color, src, config.width / 2, config.height / 2);
    closeGMTokenDeploy();
}

function spawnCustomToken() {
    const name = document.getElementById('customName').value || "CUSTOM UNIT";
    const url = document.getElementById('customUrl').value || "";
    spawnToken(name, "#ffffff", url);
    closeGMTokenDeploy();
}

function closeGMTokenDeploy() {
    document.getElementById('gmTokenDeployModal').style.display = 'none';
    // Clear inputs when closing
    const customName = document.getElementById('customName');
    const customUrl = document.getElementById('customUrl');
    if (customName) customName.value = "";
    if (customUrl) customUrl.value = "";
}

// === ADD THIS NEW FUNCTION HERE ===
// === FIX: Use sharedEnemies, which comes from the Tracker ===
function syncCombatToMap() {
    // 1. Check for the shared list from the parent/tracker
    const incomingEnemies = window.sharedEnemies || window.currentEnemies;

    // Remove existing combat enemy tokens (preserve player tokens)
    tokens = tokens.filter(t => {
        const label = t.label.toLowerCase();
        // Keep players (checked via presets usually, or style)
        const isPlayer = TOKEN_PRESETS.some(p => p.name === t.label) || t.label === "OVERSEER";
        if (isPlayer) return true;

        // Clean sweep of standard enemies to prevent duplicates
        return false; 
    });
    
    if (incomingEnemies) {
        incomingEnemies.forEach(enemy => {
            if (enemy.style && enemy.style.includes('player')) return;
            
            // NOTE: We use enemy.token_src (with underscore) to match the tracker
            if (!enemy.token_src) return;
            
            // Random scatter around center if not already positioned (simple logic)
            // Ideally we'd persist their X/Y, but for now we scatter them
            const mapX = config.width / 2 + (Math.random() - 0.5) * 300;
            const mapY = config.height / 2 + (Math.random() - 0.5) * 300;
            
            // ADDED THE 6th ARGUMENT HERE (multiplier)
            spawnTokenAtPosition(
                enemy.name,                     
                enemy.token_color || '#ef4444', 
                enemy.token_src,                
                mapX, 
                mapY,
                enemy.multiplier || 1.0 // <--- CRITICAL: Pass the size DNA
            );
        });
    }
    
    drawCurrentLevel();
    if (typeof syncData === 'function') syncData();
    log('SYNCED COMBAT ENEMIES TO MAP', '#16ff60');
}

// 1. Open the radio channel on the Map side
const mapChannel = new BroadcastChannel('wasteland_sync');

// 2. The "Translation Guide" to fix those annoying name mismatches
const TRACKER_TO_MAP_TRANSLATION = {
    "Wolfe Merc": "Wolfe Company Merc",
    "Scout Trooper": "Williamsport Scout",
    "Turret": "Automated Turret",
    "Reaver": "Ghoul Reaver",
    "Behemoth": "Super Mutant Behemoth",
    "Mr Handy": "Mr. Handy",
    "Mr Gutsy": "Mr. Gutsy",
    "Chinese Remnant": "Chinese Remnant Ghoul"
};

// 3. The Listener - This catches the signal from the tracker
mapChannel.onmessage = (event) => {
    let { type, label } = event.data;

    // --- CASE 1: ENEMY DIED (Tag them as dead) ---
    if (type === 'ENEMY_DIED') {
        const token = tokens.find(t => t.label === label);
        if (token) {
            token.color = '#4b5563'; // Slate Grey
            token.dead = true;       // The "Death Flag"
            console.log(`V has confirmed ${label} is pushing up rad-daisies.`);
            if (typeof drawCurrentLevel === 'function') drawCurrentLevel();
        }
        return; 
    }

    // --- CASE 2: REMOVE TOKEN (Hitting 'X') ---
    if (type === 'REMOVE_TOKEN') {
        tokens = tokens.filter(t => t.label !== label);
        if (typeof drawCurrentLevel === 'function') drawCurrentLevel();
        return;
    }

    // --- CASE 3: DEFAULT SPAWN LOGIC ---
    console.log(`V caught a broadcast! Spawning ${label} (${type})`);

    // Check the cheat sheet for name mismatches
    if (TRACKER_TO_MAP_TRANSLATION[type]) {
        type = TRACKER_TO_MAP_TRANSLATION[type];
    }

    // Find the icon and color from your presets
    let foundPreset = null;
    for (const category in ENEMY_PRESETS) {
        const match = ENEMY_PRESETS[category].find(p => p.name === type);
        if (match) {
            foundPreset = match;
            break;
        }
    }

    if (foundPreset) {
        // Add a little random "jitter" so they don't stack perfectly
        const offsetX = (Math.random() - 0.5) * 150;
        const offsetY = (Math.random() - 0.5) * 150;

        spawnTokenAtPosition(
            label,               
            foundPreset.color,   
            foundPreset.src,     
            config.width / 2 + offsetX, 
            config.height / 2 + offsetY,
			event.data.multiplier || 1.0
        );

        console.log(`Successfully manifested ${label} on the grid. Give 'em hell, Emanuel.`);
    } else {
        console.warn(`Fuck! I heard you wanted a "${type}", but I don't have a map preset for it.`);
    }
};
// === END NEW FUNCTION ===


// --- END TOKEN LOGIC ---


// 🧠 PART 1: BUILDING ARCHETYPES (Logic kept same)
const BUILDING_ARCHETYPES = {
    MEDICAL: {
        keywords: ["CLINIC", "DOCTOR", "ER ", "HOSPITAL", "LAB", "MEDICAL"],
        mandatory: ["ER Waiting Room", "Lobby"],
        allowed: [
            "Bio-Hazard Containment", "Burn Ward", "Cafeteria", "Doctor's Office", "Gene Therapy", "Gift Shop",
            "Medical Storage", "Morgue", "Nurse Station", "Operating Theater", "Patient Ward", "Pharmacy",
            "Prosthetics Lab", "Psych Ward", "Quarantine Cell", "Scrub Room", "Triage Center", "X-Ray Room"
        ],
        unique: ["AI Diagnosis Core", "Auto-Doc Chamber", "Chief's Office", "Cryo-Storage", "Experimental Lab"]
    },
    POLICE: {
        keywords: ["JAIL", "OUTPOST", "POLICE", "PRECINCT", "PRISON", "SECURITY", "STATION"],
        mandatory: ["Desk Sergeant", "Precinct Lobby"],
        allowed: [
            "Armory", "Briefing Room", "Bullpen", "Detective's Office", "Drone Bay", "Drunk Tank",
            "Evidence Locker", "Holding Cells", "Interrogation Room", "Kennel", "Locker Room", "Riot Gear Storage",
            "Shooting Range", "Surveillance Hub"
        ],
        unique: ["Chief's Office", "Execution Chamber", "SWAT Gear Storage", "Secure Evidence Vault"]
    },
    INDUSTRIAL: {
        keywords: ["ASSEMBLY", "FACTORY", "INDUSTRIAL", "PLANT", "POWER", "REFINERY", "WORKS"],
        mandatory: ["Assembly Floor", "Loading Dock"],
        allowed: [
            "Boiler Room", "Break Room", "Catwalks", "Conveyor Maze", "Cooling Tunnel", "Foreman's Office",
            "Fusion Core Assembly", "Generator Room", "Hazmat Disposal", "Locker Room", "Machine Shop", "Parts Storage",
            "Robotics Bay", "Smelting Pit", "Vat Room", "Waste Compactor"
        ],
        unique: ["Main Control Room", "Prototype Assembly", "QA Testing Lab", "Reactor Core"]
    },
    VAULT: {
        keywords: ["SHELTER", "VAULT"],
        mandatory: ["Entrance Airlock", "Overseer's Office"],
        allowed: [
            "Atrium (Hub)", "Barber Shop", "Cafeteria", "Classroom", "Clinic", "Cryo-Stasis Array",
            "G.O.A.T. Exam Room", "Gear Storage", "Gym", "Hydroponics Bay", "Hydroponics Jungle", "Kitchen",
            "Maintenance Tunnel", "Quarters", "Reactor Core", "Security Station", "Social Lounge", "Storage Closet",
            "VR Pods", "Water Purification"
        ],
        unique: ["Entrance Airlock", "Mainframe/ZAX Room", "Overseer's Office", "Overseer's Tunnel", "Reactor Core", "Secret Experiment Lab", "ZAX Mainframe"]
    },
    ENTERTAINMENT: {
        keywords: ["CASINO", "CLUB", "HOTEL", "LOUNGE", "RESORT", "SPA", "THEATER"],
        mandatory: ["Grand Lobby", "Reception"],
        allowed: [
            "Backstage", "Ballroom", "Bar", "Casino Floor", "Dressing Room", "Guest Room",
            "Kitchen", "Manager's Office", "Pool Area", "Security Room", "Stage", "Suite",
            "VIP Lounge", "Vault"
        ],
        unique: ["Broadcast Booth", "Director's Office", "High Roller Room", "Penthouse Suite"]
    },
    COMMERCIAL: {
        keywords: ["AGENCY", "BANK", "CORP", "OFFICE", "SKYSCRAPER", "TOWER"],
        mandatory: ["Lobby", "Security Desk"],
        allowed: [
            "Break Room", "Conference Room", "Copy Room", "Cubicle Farm", "Executive Suite", "File Storage",
            "Janitor Closet", "Mail Room", "Restroom", "Server Farm", "Server Room"
        ],
        unique: ["CEO's Penthouse", "Mainframe Core", "Secret Wall Safe"]
    },
    RETAIL: {
        keywords: ["BAR", "BODEGA", "DINER", "GROCERY", "MALL", "MARKET", "MART", "SALOON", "SHOP", "STORE"],
        mandatory: ["Sales Floor"],
        allowed: [
            "Alley Access", "Cashier Counter", "Changing Rooms", "Cold Storage", "Kitchenette", "Loading Bay",
            "Manager's Office", "Restroom", "Stockroom"
        ],
        unique: ["Hidden Basement", "Pharmacy Counter", "Safe Room"]
    },
    NATURAL: {
        keywords: ["BURROW", "CAVE", "CLIFF", "DEN", "GROTTO", "HOLE", "NEST", "PASS"],
        mandatory: ["Cave Entrance"],
        allowed: [
            "Bat Roost", "Bear Den", "Crystal Formation", "Damp Cavern", "Fissure", "Glowing Mushroom Grove",
            "Narrow Tunnel", "Pre-War Skeleton", "Rockfall", "Subterranean River", "Supply Cache", "Underground Lake"
        ],
        unique: ["Crash Site", "Hidden Pre-War Bunker", "Legendary Creature Den", "Queen's Nest"]
    },
    BUNKER: {
        keywords: ["BASE", "BUNKER", "MILITARY", "OUTPOST", "SHELTER", "SILO"],
        mandatory: ["Blast Door", "Decontamination"],
        allowed: [
            "Armory", "Barracks", "Comms Room", "Firing Range", "Generator", "Med Bay",
            "Mess Hall", "Officer Quarters", "Storage", "War Room"
        ],
        unique: ["Command Center", "Missile Silo", "Power Armor Station"]
    },
    SEWER: {
        keywords: ["DRAIN", "METRO", "SEWER", "SUBWAY", "TUNNEL"],
        mandatory: ["Drainage Pipe", "Maintenance Access"],
        allowed: ["Catwalk", "Collapsed Section", "Pump Room", "Raider Camp", "Rat Nest", "Sludge Pit", "Sluice Gate", "Worker Tunnel"],
        unique: ["Ghoulish Shrine", "Lost Engineering Deck", "Mutant Lair"]
    },
    CULT: {
        keywords: ["ALTAR", "CATHEDRAL", "CHURCH", "SHRINE", "TEMPLE"],
        mandatory: ["Altar", "Nave"],
        allowed: ["Bell Tower", "Confessional", "Crypt", "Dormitory", "Graveyard", "Pews", "Ritual Chamber", "Sacristy"],
        unique: ["High Priest's Chamber", "Reliquary", "Sacrificial Pit"]
    },
    INSTITUTIONAL: {
        keywords: ["ACADEMY", "ADMIN", "COLLEGE", "COURT", "HALL", "LIBRARY", "POST", "SCHOOL", "UNIVERSITY"],
        mandatory: ["Admin Office", "Main Hall"],
        allowed: [
            "Auditorium", "Boiler Room", "Cafeteria", "Classroom", "Faculty Lounge", "Gymnasium",
            "Janitor Closet", "Library Archives", "Locker Room", "Restroom", "Storage"
        ],
        unique: ["Broadcast PA Room", "Dean's Study", "Evidence Vault", "Principal's Office", "Rare Book Wing"]
    },
    GENERIC: {
        keywords: [],
        mandatory: ["Entrance"],
        allowed: ["Hallway", "Restroom", "Room", "Storage", "Utility"],
        unique: []
    }
};

// REFACTORED: Added Hallway to prevent logic chains breaking
const ROOM_RELATIONS = {

    // --- CAVE & NATURAL ---
    "Cave Entrance": { tags: ["Nature", "Transition"], link: ["Damp Cavern", "Narrow Tunnel", "Bear Den"], avoid: ["Office", "Clean"] },
    "Damp Cavern": { tags: ["Nature"], link: ["Underground Lake", "Glowing Mushroom Grove", "Narrow Tunnel", "Bat Roost"], avoid: ["Clean", "Tech"] },
    "Narrow Tunnel": { tags: ["Nature"], link: ["Damp Cavern", "Bear Den", "Crystal Formation"], avoid: ["Grand"] },
    "Underground Lake": { tags: ["Water", "Nature"], link: ["Damp Cavern", "Subterranean River"], avoid: ["Fire", "Tech"] },
    "Glowing Mushroom Grove": { tags: ["Nature", "Light"], link: ["Damp Cavern", "Toxic Pit"], avoid: [] },
    "Bear Den": { tags: ["Nature", "Danger"], link: ["Narrow Tunnel", "Bone Pile"], avoid: ["Civilized"] },
    "Queen's Nest": { tags: ["Nature", "Boss"], link: ["Narrow Tunnel"], avoid: ["Safe"] },
    "Underground River": { tags: ["Water", "Nature"], link: ["Flooded Cavern", "Damp Cavern"], avoid: ["Fire", "Dry"] },
    "Cazador Nest": { tags: ["Nature", "Danger"], link: ["Cliff Edge", "Bone Pile"], avoid: ["Civilized", "Water"] },
    "Sulfur Vent": { tags: ["Hazard", "Nature"], link: ["Geyser", "Magma Rift"], avoid: ["Ice", "Living"] },
    "Tribal Burial Ground": { tags: ["Spiritual", "Quiet"], link: ["Painted Cavern", "Narrow Tunnel"], avoid: ["Tech", "Loud"] },
    "Gecko Hatchery": { tags: ["Nature", "Danger"], link: ["Radioactive Pool", "Damp Cavern"], avoid: ["Clean"] },
    "Radscorpion Burrow": { tags: ["Nature", "Hazard"], link: [], avoid: ["Civilized", "Tech"] },
    "Gecko Hunting Grounds": { tags: ["Nature", "Exterior"], link: [], avoid: ["Interior"] },
    "Coyote Den": { tags: ["Nature", "Small"], link: [], avoid: ["Tech"] },
    "Sulfur Pits": { tags: ["Nature", "Hazard"], link: [], avoid: ["Living"] },

    // --- VAULT ---
    "Overseer's Office": { tags: ["Command", "Clean"], link: [], avoid: ["Dirty"] },
    "Atrium": { tags: ["Hub", "Clean"], link: [], avoid: [] },
    "Hydroponics Bay": { tags: ["Life", "Humid"], link: ["Cafeteria", "Water Purification"], avoid: ["Reactor Core", "Armory"] },
    "Overseer's Tunnel": { tags: ["Secret", "Transition"], link: ["Overseer's Office", "Escape Hatch"], avoid: ["Public", "Atrium"] },
    "Cryo-Stasis Array": { tags: ["Cold", "Tech"], link: ["Med Bay", "Reactor Core"], avoid: ["Kitchen", "Gym"] },
    "G.O.A.T. Classroom": { tags: ["Social", "Clean"], link: ["Atrium", "Cafeteria"], avoid: ["Reactor", "Maintenance"] },
    "ZAX Mainframe": { tags: ["Tech", "Boss"], link: ["Server Room", "Reactor Core"], avoid: ["Living", "Water"] },
    "Gear Storage": { tags: ["Storage", "Dirty"], link: ["Entrance Airlock", "Maintenance"], avoid: ["Luxury", "Overseer"] },

    // --- BUNKER & MILITARY ---
    "Blast Door": { tags: ["Military", "Secure"], link: ["Decontamination", "Security Station"], avoid: ["Nature"] },
    "Barracks": { tags: ["Military", "Living"], link: ["Mess Hall", "Locker Room", "Showers"], avoid: ["Public"] },
    "War Room": { tags: ["Military", "Command"], link: ["Comms Room", "Officer Quarters"], avoid: ["Barracks"] },
    "Missile Silo": { tags: ["Military", "Tech", "High"], link: ["Command Center"], avoid: ["Nature"] },

    // --- CITY & COMMERCIAL ---
    "Grand Lobby": { tags: ["Grand"], link: ["Casino Floor", "Ballroom", "Bar", "Reception"], avoid: ["Dirty", "Industrial"] },
    "Casino Floor": { tags: ["Loud", "Grand"], link: ["Bar", "High Roller Room", "Vault", "Cashier Cage"], avoid: ["Kitchen", "Bedroom"] },
    "Kitchen": { tags: ["Service", "Loud"], link: ["Cafeteria", "Dining Hall", "Cold Storage", "Pantry"], avoid: ["Bedroom", "Toilet", "Morgue", "Office"] },
    "Morgue": { tags: ["Cold", "Dirty", "Creepy"], link: ["Clinic", "Crematorium", "Autopsy Room"], avoid: ["Kitchen", "Cafeteria", "Nursery"] },
    "High Roller Suite": { tags: ["Luxury", "Grand"], link: ["Private Bar", "Elevator"], avoid: ["Kitchen", "Maintenance"] },

    // --- CITY RUINS ---
    "Collapsed Subway Station": { tags: ["Transport", "Ruined"], link: ["Maintenance Tunnel", "Sewer Access"], avoid: ["Penthouse", "Skybridge"] },
    "Rooftop Sniper Nest": { tags: ["Combat", "High"], link: ["Stairwell", "Fire Escape"], avoid: ["Basement", "Sewer"] },
    "Chem Lab": { tags: ["Crime", "Tech"], link: ["Gang Hideout", "Storage"], avoid: ["Police", "Public"] },
    "Makeshift Barricade": { tags: ["Combat", "Transition"], link: ["Street", "Alley"], avoid: ["Clean"] },
    "Radio Station": { tags: ["Tech", "High"], link: ["Broadcast Tower", "Office"], avoid: ["Sewer", "Cave"] },
    "Sniper Nest": { tags: ["Combat", "High"], link: [], avoid: ["Basement"] },
    "Bombed-Out Apartment": { tags: ["Residential", "Ruined"], link: [], avoid: ["Clean"] },
    "Makeshift Clinic": { tags: ["Medical", "Scrappy"], link: [], avoid: ["Grand"] },
    "Raider Fighting Pit": { tags: ["Violent", "Social"], link: [], avoid: ["Quiet"] },
    "Collapsed Subway": { tags: ["Transport", "Ruined"], link: [], avoid: ["High"] },
    "Nuka-Cola Billboard": { tags: ["Exterior", "High"], link: [], avoid: ["Interior"] },
    "Super Mutant Stronghold": { tags: ["Hostile", "Gore"], link: [], avoid: ["Clean"] },
    "Slave Pen": { tags: ["Hostile", "Prison"], link: [], avoid: ["Luxury"] },

    // --- OFFICES & INTERIORS ---
    "Cubicle Farm": { tags: ["Office", "Boring"], link: ["Conference Room", "Break Room", "Manager's Office"], avoid: ["Industrial", "Nature"] },
    "Executive Suite": { tags: ["Office", "Luxury"], link: ["Conference Room", "Private Bath"], avoid: ["Cubicle Farm", "Janitor Closet"] },
    "Server Room": { tags: ["Tech", "Cold"], link: ["IT Office", "Cooling System"], avoid: ["Water"] },
    "Prosthetics Lab": { tags: ["Medical", "Tech"], link: ["Operating Theater", "Storage"], avoid: ["Kitchen"] },
    "Interrogation Cell": { tags: ["Police", "Secure"], link: ["Holding Cells", "Observation Room"], avoid: ["Lobby", "Public"] },
    "Fusion Core Assembly": { tags: ["Industrial", "Tech"], link: ["Generator Room", "Conveyor Maze"], avoid: ["Living"] },

    // --- SEWER ---
    "Drainage Pipe": { tags: ["Sewer", "Dirty"], link: ["Sluice Gate", "Rat Nest"], avoid: ["Clean"] },
    "Rat Nest": { tags: ["Nature", "Dirty"], link: ["Drainage Pipe"], avoid: ["Tech"] },
    "Mutant Lair": { tags: ["Danger", "Dirty"], link: ["Sludge Pit", "Collapsed Section"], avoid: ["Clean"] },

    // --- WASTELAND ---
    "Hermit's Shack": { tags: ["Civilized", "Small"], link: [], avoid: ["Grand"] },
    "Crashed Vertibird": { tags: ["Wreckage", "Tech"], link: [], avoid: ["Clean"] },
    "Tribal Altar": { tags: ["Tribal", "Decorated"], link: [], avoid: ["High Tech"] },
    "Prospector Camp": { tags: ["Civilized", "Temporary"], link: [], avoid: [] },

    // --- GENERIC CONNECTORS ---
    "Hallway": { tags: ["Connector"], link: [], avoid: [] },
    "Corridor": { tags: ["Connector"], link: [], avoid: [] },
    "Stairs": { tags: ["Connector", "Vertical"], link: [], avoid: [] },
    "Maintenance Tunnel": { tags: ["Connector", "Dirty"], link: [], avoid: ["Luxury"] }
};

const ROOM_LOGIC = {
    // CAVE / MOJAVE
    "Radscorpion Burrow": { tags: ["Nature", "Hazard"], avoid: ["Civilized", "Tech"] },
    "Gecko Hunting Grounds": { tags: ["Nature", "Exterior"], avoid: ["Interior"] },
    "Coyote Den": { tags: ["Nature", "Small"], avoid: ["Tech"] },
    "Sulfur Pits": { tags: ["Nature", "Hazard"], avoid: ["Living"] },
    "Hermit's Shack": { tags: ["Civilized", "Small"], avoid: ["Grand"] },
    "Crashed Vertibird": { tags: ["Wreckage", "Tech"], avoid: ["Clean"] },
    "Tribal Altar": { tags: ["Tribal", "Decorated"], avoid: ["High Tech"] },
    "Prospector Camp": { tags: ["Civilized", "Temporary"], avoid: [] },

    // RUINS / CITY
    "Sniper Nest": { tags: ["Combat", "High"], avoid: ["Basement"] },
    "Bombed-Out Apartment": { tags: ["Residential", "Ruined"], avoid: ["Clean"] },
    "Makeshift Clinic": { tags: ["Medical", "Scrappy"], avoid: ["Grand"] },
    "Raider Fighting Pit": { tags: ["Violent", "Social"], avoid: ["Quiet"] },
    "Collapsed Subway": { tags: ["Transport", "Ruined"], avoid: ["High"] },
    "Nuka-Cola Billboard": { tags: ["Exterior", "High"], avoid: ["Interior"] },
    "Super Mutant Stronghold": { tags: ["Hostile", "Gore"], avoid: ["Clean"] },
    "Slave Pen": { tags: ["Hostile", "Prison"], avoid: ["Luxury"] },

    // VAULT
    "Overseer's Office": { tags: ["Command", "Clean"], avoid: ["Dirty"] },
    "Atrium": { tags: ["Hub", "Clean"], avoid: [] }
};

const NON_ENTERABLE = [ "Street", "Crater", "Park", "Alley", "Overpass", "Catwalk", "Ramp", "Pass", "Riverbed", "Tar Pit", "Shore", "Drive-In", "Scrapyard", "Bridge", "Wind Farm", "Solar Array", "Picnic", "Golf", "Ski", "Crash", "Wreck" ];

const PALETTES = {
    vault: {	
        bg: '#050505',	
        // NEW FLOOR COLORS: Brighter base, higher contrast noise, cleaner lines
        floor: { base: '#2b3330', dark: '#1e2522', light: '#4d5953', noise: '#6f8179' }, 
        wall: { top: '#546e7a', front: '#37474f', outline: '#263238', highlight: '#78909c' },
        accent: '#fbbf24',	
        shadow: 'rgba(0,0,0,0.6)'
    },
      ruins: {	
        bg: '#0a0908',	
        floor: { base: '#3c3836', dark: '#282828', light: '#504945', noise: '#665c54' }, // Concrete/asphalt
        wall: { top: '#8b4513', front: '#5c3317', outline: '#3e2723', highlight: '#a0522d' }, // Rust/brick
        accent: '#ef4444',	
        shadow: 'rgba(0,0,0,0.7)'
    },
    cave: {	
        bg: '#1a0f0a', // Deep warm darkness with red undertones
        floor: { 
            base: '#e8b888',    // Warm golden sand base
            dark: '#b8895c',    // Rich terracotta shadows
            light: '#f5e6d3',   // Bright sun-bleached stone highlights
            noise: '#c9a876',   // Natural sediment variation
            accent: '#9c7a54',  // Rocky desert outcrop accents
            dust: '#d4a574'     // Ambient dust particles
        }, 
        wall: { 
            top: '#d4a76b',     // Sunlit weathered sandstone
            front: '#9c7d5c',   // Deep stratified rock layers
            outline: '#6b5442', // Dark natural crevices and fissures
            highlight: '#e8c89a', // Glinting quartz veins and mineral deposits
            shadow: '#503a2a'   // Deep shadow recesses
        },
        accent: '#ff9933',      // Warm desert sunset glow	
        shadow: 'rgba(40, 25, 15, 0.80)' // Rich warm deep shadows
    },
    interior_ruins: {	
        bg: '#080a10',	
        floor: { base: '#1e293b', dark: '#0f172a', light: '#334155', noise: '#475569' },	
        wall: { top: '#475569', front: '#1e293b', outline: '#0f172a', highlight: '#64748b' },
        accent: '#38bdf8',	
        shadow: 'rgba(0,0,0,0.6)'
    },
    interior_cave: {	
        bg: '#100d0c',	
        floor: { base: '#362823', dark: '#241a17', light: '#4a3731', noise: '#5d453e' },
        wall: { top: '#4e342e', front: '#3e2723', outline: '#211512', highlight: '#6d4c41' },
        accent: '#fbbf24',	
        shadow: 'rgba(0,0,0,0.8)'
    }
};

const KEY_COLORS = ["#ef4444", "#3b82f6", "#eab308", "#a855f7"];	

const DECO_POOLS = {
    wasteland_surface: [
        "joshua_tree", "saguaro_cactus", "barrel_cactus", "yucca_plant", "prickly_pear",
        "brahmin_skull", "gecko_skeleton", "radscorpion_shell", "bighorner_remains",
        "boulder", "red_rock_formation", "sandstone_arch", "desert_scrub", "tumbleweed_cluster",
        "skeleton", "bleached_bones", "dried_corpse", "sun_bleached_skull",
        "rad_puddle", "fire_barrel", "rusted_barrel", "oil_drum",
        "tumbleweed", "desert_flower", "agave_plant", "ocotillo", 
        "scorched_earth", "crater_small", "sand_dune", "wind_carved_rock",
        "prospector_camp", "abandoned_bedroll", "broken_shovel"
    ],
    wasteland_cave: [
        "glowing_fungus", "crystal_cluster", "biolum_moss", "phosphorescent_lichen",
        "rock_pile", "stalactite", "stalagmite", "flowstone_formation",
        "skeleton", "gore_bag", "nest_eggs", "mutant_cocoon",
        "campfire", "bedroll", "supply_cache", "hidden_stash",
        "mattress", "rad_puddle", "cave_painting", "tribal_marking",
        "mineral_deposit", "underground_spring", "bat_colony", "cave_cricket_swarm",
        "webbing", "bone_pile", "ancient_artifact", "pre_war_crate",
        "glowstick_trail", "miner_equipment", "rusty_pickaxe", "lantern_remnant"
    ],
    city_street: ["car", "rubble", "tire_pile", "traffic_cone", "broken_pole", "street_sign", "vending_machine", "fire_barrel"],
    city_interior: ["bed", "table", "chair", "file_cabinet", "rubble", "radio", "ammo_crate", "vending_machine"],
    vault: ["server_rack", "vr_pod", "wall_terminal", "vent_grate", "filing_cabinet", "stacked_crates", "water_pipe", "bulletin_board", "diner_booth", "food_dispenser", "jumpsuit_locker", "auto_doc", "skeleton_blue", "blood_stain", "barricade"]
};

// --- NEW: Detailed Container Mapping with Loot Focus ---
const CONTAINER_DETAILS = {
    // Ruin/Vault High Security
    "Safe": { types: ["Ruins", "Vault"], lootFocus: "HIGH_VALUE", lock: true, skill: "LOCKPICK" },
    "Locker": { types: ["Vault", "Ruins"], lootFocus: "JUMPSUIT_GUNS", lock: true, skill: "LOCKPICK" },
    "Footlocker": { types: ["Vault", "Ruins"], lootFocus: "JUMPSUIT_GUNS", lock: true, skill: "LOCKPICK" },

    // Industrial / Utility
    "Toolbox": { types: ["Ruins", "Vault"], lootFocus: "REPAIR_JUNK", lock: true, skill: "LOCKPICK" },
    "Desk": { types: ["Vault", "Ruins", "Interior"], lootFocus: "PAPER_JUNK", lock: false, skill: null },
    "File Cabinet": { types: ["Vault", "Ruins", "Interior"], lootFocus: "PAPER_JUNK", lock: true, skill: "SCIENCE" },

    // Medical
    "Medkit": { types: ["Ruins", "Interior", "Vault"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },
    "First Aid": { types: ["Vault", "Interior"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },
    "Doctor's Bag": { types: ["Vault", "Cave"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },

    // Retail / Food
    "Register": { types: ["Ruins", "Interior"], lootFocus: "LOW_CAPS", lock: true, skill: "LOCKPICK" },
    "Cashier": { types: ["Ruins"], lootFocus: "LOW_CAPS", lock: true, skill: "LOCKPICK" },
    "Vending Machine": { types: ["Ruins", "Vault"], lootFocus: "NUKA_COLA", lock: true, skill: "LOCKPICK" },
    "Cooler": { types: ["Vault", "Cave"], lootFocus: "FOOD_WATER", lock: false, skill: null },
    
    // Wasteland / Low Tech
    "Ammo Box": { types: ["Ruins", "Cave"], lootFocus: "AMMO_EXP", lock: true, skill: "LOCKPICK" },
    "Duffel Bag": { types: ["Cave", "Ruins"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Corpse": { types: ["Cave", "Ruins"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Hollow Rock": { types: ["Cave"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Sack": { types: ["Cave"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Crate": { types: ["Cave", "Ruins", "Vault"], lootFocus: "JUNK", lock: false, skill: null },
    "Dumpster": { types: ["Ruins"], lootFocus: "JUNK", lock: false, skill: null },
};
// -------------------------------------------------------------------

const SUB_THEMES = {
    residential: ["Apartment Lobby", "Laundry Room", "Boiler Room", "Storage Unit", "Rooftop Garden", "Collapsed Suite"],
    sewer: ["Drainage Pipe", "Maintenance Walkway", "Sluice Gate", "Control Room", "Rat Nest"],
    industrial: ["Assembly Line", "Loading Bay", "Foreman Office", "Generator Room", "Smelting Vat"],
    creepier: ["Morgue", "Crypt", "Surgical Theater", "Evidence Room", "Ritual Site"]
};

let currentLevelIndex = 0;	
const LEVEL_NAMES = { '-2': "LEVEL B2 (DEEP STORAGE)", '-1': "LEVEL B1 (BASEMENT)", '0': "LEVEL 1 (GROUND)", '1': "LEVEL 2 (UPPER)", '2': "LEVEL 3 (ROOF)" };
let floorData = {}; let viewMode = 'sector'; let currentInteriorKey = null; let interiorData = {}; let patternCache = {};	

function getArchetype(name) {
    const n = name.toUpperCase();
    for (const key in BUILDING_ARCHETYPES) {
        const arch = BUILDING_ARCHETYPES[key];
        for (const kw of arch.keywords) {
            if (n.includes(kw)) return key;
        }
    }
    return 'GENERIC';
}

// --- UPDATED ROOM DECISION LOGIC (V.29.0) ---
function getRoomDecision(archetypeKey, currentRooms, sourceRoomName) {
    const arch = BUILDING_ARCHETYPES[archetypeKey] || BUILDING_ARCHETYPES.GENERIC;
    
    // 1. Calculate Room Counts to prevent "Snake" Repetition
    const roomCounts = {};
    currentRooms.forEach(r => {
        roomCounts[r.name] = (roomCounts[r.name] || 0) + 1;
    });

    // Filter out Entrance Airlock on non-ground levels
    let effectiveMandatory = arch.mandatory;
    if (archetypeKey === 'VAULT' && currentLevelIndex !== 0) {
        effectiveMandatory = effectiveMandatory.filter(m => m !== "Entrance Airlock");
    }

    const unbuiltMandatory = effectiveMandatory.filter(m => !currentRooms.some(r => r.name === m));
    // FIX: Corrected typo from unbuiltMandory to unbuiltMandatory
    if (unbuiltMandatory.length > 0) return unbuiltMandatory[0];
    
    let candidates = [...arch.allowed];

    // 2. Filter out globally unique and over-used rooms
    candidates = candidates.filter(c => (roomCounts[c] || 0) < 3);
    candidates = candidates.filter(c => {
        // Extended uniqueness filter for vault-wide unique rooms
        if (arch.unique.includes(c)) {
            // For vaults: search ALL rooms in all levels
            if (archetypeKey === 'VAULT') {
                // Get all rooms in all vault levels (check for multi-level generation!)
                const allRooms = Object.values(floorData).reduce((arr, lvl) => lvl && lvl.rooms ? arr.concat(lvl.rooms) : arr, []);
                // Also check rooms currently being built on this level
                if (currentRooms.some(r => r.name === c)) {
                    return false;
                }
                return !allRooms.some(r => r.name === c);
            } else {
                // Otherwise just in current level
                return !currentRooms.some(r => r.name === c);
            }
        }
        return true;
    });

    // 3. APPLY IMMEDIATE DUPLICATION PREVENTION
    if (sourceRoomName) {
        // Hard remove the immediate source room name from candidates
        candidates = candidates.filter(c => c !== sourceRoomName);
    }

    // Fix "Chaos" Override: Push flavor rooms to candidates instead of early return
    if (Math.random() < 0.05) {
        const flavorRooms = ["Gore Room", "Speakeasy", "Boiler Room"];
        candidates.push(...flavorRooms);
    }

    // 4. Apply relational links/avoids
    if (sourceRoomName && ROOM_RELATIONS[sourceRoomName]) {
        const logic = ROOM_RELATIONS[sourceRoomName];
        
        // Prioritize linked rooms if they exist (60% chance to follow link)
        if (logic.link && Math.random() < 0.6) {
            const linkedCandidates = candidates.filter(c => logic.link.includes(c));
            if (linkedCandidates.length > 0) {
                candidates = linkedCandidates;
            }
        }
        
        if (logic.avoid) candidates = candidates.filter(c => !logic.avoid.includes(c));
    }

    // Fallback: If filtering stripped all candidates, return a generic connector
    if (candidates.length === 0) return (Math.random() < 0.5) ? "Hallway" : "Corridor";
    
    return candidates[Math.floor(Math.random() * candidates.length)];
}
// --- END UPDATED ROOM DECISION LOGIC ---

function setTheme(theme) {
    document.getElementById('app-body').className = `theme-${theme}`;
    patternCache = {};
    drawCurrentLevel();
}

function updateHelperText() {
    config.mapType = document.getElementById('mapType').value;
    const type = config.mapType;
    const helper = document.getElementById('densityHelper');
    let subject = "ROOM COUNT";
    if (type === 'ruins') subject = "BUILDING COUNT";
    if (type === 'cave') subject = "TUNNEL FILL";
    helper.innerText = `ADJUSTS: ${subject}`;
    if (type !== 'vault' && currentLevelIndex > 0) {
        currentLevelIndex = 0; changeLevel(0);	
        log("WARN: UPPER LEVELS RESTRICTED FOR THIS SECTOR.", "var(--pip-amber)");
    } else {
        updateLevelControls();
    }
}

function toggleFog() {	
    if (isClient) return; // Prevent client interaction (Fix 2)
    config.fogEnabled = !config.fogEnabled;
    const btn = document.getElementById('fogBtn');
    btn.style.borderColor = config.fogEnabled ? '#eab308' : '#444';
    btn.style.color = config.fogEnabled ? '#eab308' : '#888';
}

function downloadMap() {
    const link = document.createElement('a');
    link.download = `pipboy_map_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

function recordClip() {
    const btn = document.getElementById('recBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerText = "[ RECORDING... ]";
    
    const stream = canvas.captureStream(30); // 30 FPS
    const chunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 8000000 };
    let recorder;
    try {
         recorder = new MediaRecorder(stream, options);
    } catch (e) {
         recorder = new MediaRecorder(stream); // Fallback
    }
    
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = e => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `pipboy_scan_${Date.now()}.webm`;
        link.click();
        btn.disabled = false;
        btn.innerText = "[ REC CLIP ]";
        log("VIDEO CLIP SAVED", "var(--pip-green)");
    };
    
    recorder.start();
    setTimeout(() => recorder.stop(), 3000); // 3 Second Clip
}

function saveMapState() {
  if (isClient) return;
  
  const mapName = prompt("Enter a name for this save:", `${config.mapType}_level${currentLevelIndex}`);
  if (!mapName) return;
  
  const saveData = {
    timestamp: Date.now(),
    mapType: config.mapType,
    floorData: floorData,
    interiorData: interiorData,
    tokens: tokens.map(t => ({
      id: t.id,
      x: t.x,
      y: t.y,
      label: t.label,
      color: t.color,
      src: t.src
    })),
    currentLevel: currentLevelIndex,
    viewMode: viewMode,
    currentInteriorKey: currentInteriorKey,
    version: "1.0"
  };
  
  // Save to localStorage (keeps working as before)
  localStorage.setItem(`pipboy_map_${mapName}`, JSON.stringify(saveData));
  
  // ALSO download as a file
  const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pipboy_${mapName}_${Date.now()}.json`;
  link.click();
  
  log(`MAP SAVED: ${mapName} (localStorage + file)`, "#16ff60");
}

function loadMapState() {
  if (isClient) return; // Only GM can load
  
  const mapName = prompt("Enter the name of the save to load:");
  if (!mapName) return;
  
  const saved = localStorage.getItem(`pipboy_map_${mapName}`);
  if (!saved) {
    log(`ERROR: No saved map found: ${mapName}`, "#ef4444");
    return false;
  }
  
  const data = JSON.parse(saved);
  config.mapType = data.mapType;
  floorData = data.floorData;
  interiorData = data.interiorData;
  currentLevelIndex = data.currentLevel;
  viewMode = data.viewMode || "sector";
  currentInteriorKey = data.currentInteriorKey || null;
  
  // Rebuild tokens with images
  tokens = data.tokens;
  tokens.forEach(t => {
    if (t.src) {
      const img = new Image();
      img.onload = () => {
        t.img = img;
        drawCurrentLevel();
      };
      img.onerror = () => {
        t.img = null;
        log(`Image failed for ${t.label}`, "#ef4444");
      };
      img.src = t.src;
    }
  });
  
  document.getElementById("mapType").value = config.mapType;
  updateLevelControls();
  drawCurrentLevel();
  log(`MAP LOADED: ${mapName}`, "#3b82f6");
  
  if (typeof syncData === "function") syncData();
  return true;
}

function loadMapFromFile(event) {
  if (isClient) return;
  
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.floorData || !data.version) {
        log("ERROR: Invalid save file format", "#ef4444");
        return;
      }
      
      config.mapType = data.mapType;
      floorData = data.floorData;
      interiorData = data.interiorData;
      currentLevelIndex = data.currentLevel;
      viewMode = data.viewMode || "sector";
      currentInteriorKey = data.currentInteriorKey || null;
      
      tokens = data.tokens;
      tokens.forEach(t => {
        if (t.src) {
          const img = new Image();
          img.onload = () => {
            t.img = img;
            drawCurrentLevel();
          };
          img.onerror = () => {
            t.img = null;
            log(`Image failed for ${t.label}`, "#ef4444");
          };
          img.src = t.src;
        }
      });
      
      document.getElementById("mapType").value = config.mapType;
      updateLevelControls();
      drawCurrentLevel();
      log(`MAP LOADED FROM FILE: ${file.name}`, "#3b82f6");
      
      if (typeof syncData === "function") syncData();
    } catch (error) {
      log(`ERROR: Failed to parse save file - ${error.message}`, "#ef4444");
    }
  };
  
  reader.readAsText(file);
  event.target.value = '';
}


function listSavedMaps() {
  const saves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("pipboy_map_")) {
      saves.push(key.replace("pipboy_map_", ""));
    }
  }
  
  if (saves.length === 0) {
    log("NO SAVED MAPS FOUND", "#ffb300");
  } else {
    log(`SAVED MAPS: ${saves.join(", ")}`, "#3b82f6");
  }
}

// --- NETWORKING LOGIC (The Magic) ---
function toggleChatControls(enable) {
    chatInput.disabled = !enable;
    sendChatBtn.disabled = !enable;
    if (enable) {
        chatInput.classList.remove('disabled');
        sendChatBtn.classList.remove('disabled');
    } else {
        chatInput.classList.add('disabled');
        sendChatBtn.classList.add('disabled');
    }
}

function toggleClientControls(disable) {
    // GM Controls (Map Generation, Zoom, Density)
    const controls = document.getElementById('gmControls').querySelectorAll('.pip-input, select, .pip-btn');
    controls.forEach(control => {
        control.disabled = disable;
        if (disable) {
            control.classList.add('disabled');
            control.style.pointerEvents = 'none';
        } else {
            control.classList.remove('disabled');
            control.style.pointerEvents = 'auto';
        }
    });

    // Individual UI Toggles (Fix 2)
    const labelBtn = document.getElementById('labelBtn');
    const fogBtn = document.getElementById('fogBtn');
    
    [labelBtn, fogBtn].forEach(btn => {
        if (btn) {
            btn.disabled = disable;
            if (disable) {
                btn.classList.add('disabled');
            } else {
                btn.classList.remove('disabled');
            }
        }
    });

    // Token Button (Now GM Deploy Unit button)
    document.getElementById('addTokenBtn').disabled = disable;
    if (disable) document.getElementById('addTokenBtn').classList.add('disabled');
    else document.getElementById('addTokenBtn').classList.remove('disabled');
}

// FIX 1: New function to handle copying the ID
function copyHostId() {
    const id = document.getElementById('currentHostId').innerText;
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = id;
    tempInput.select();
    document.execCommand('copy');
    log("HOST ID COPIED", 'var(--pip-green)');
    document.body.removeChild(tempInput);
}

function hostSession() {
    // Check if user has selected the Overseer token
    if (playerToken?.name !== OVERSEER_TOKEN_ID) {
         log("ERROR: MUST SELECT OVERSEER ROLE TO HOST.", '#ef4444');
         // If not selected, force the player back to the selection screen
         showLoginScreen(); 
         return;
    }
    
    isHost = true;
    userName = "OVERSEER"; // Ensure name is set correctly
    toggleClientControls(false); // Enable GM controls
    toggleChatControls(true); // Ensure chat is enabled
    peer = new Peer(); // Create a new ID
    
    peer.on('open', (id) => {
        document.getElementById('netStatus').innerText = `HOST ID: ${id}`;
        document.getElementById('netStatus').style.color = 'var(--pip-green)';
        log(`UPLINK ESTABLISHED. ID: ${id}`, 'var(--pip-green)');
        
        // Show copyable ID, hide host/join buttons
        document.getElementById('hostBtn').classList.add('hidden-ui');
        document.getElementById('hostIdDisplay').classList.remove('hidden-ui');
        document.getElementById('joinBtn').classList.add('hidden-ui');
        document.getElementById('joinInput').classList.add('hidden-ui');
        document.getElementById('currentHostId').innerText = id;

        // Activate Main App UI
        activateAppUI();
    });

  peer.on('connection', (c) => {
    log("NEW TERMINAL CONNECTED", 'var(--pip-amber)');

    conn = c;                 // keep last connection for legacy use
    connections.push(c);      // NEW: track all client connections

    c.on('data', receiveData); // Attach data listener

    c.on('close', () => {
        connections = connections.filter(x => x !== c);
    });

    // Send current state immediately
    setTimeout(syncData, 500);
});


    peer.on('error', (err) => {
        log(`PEERJS ERROR: ${err.type}`, '#ef4444');
        document.getElementById('netStatus').innerText = "ERROR";
        document.getElementById('netStatus').style.color = '#ef4444';
    });
}

function joinSession() {
    // Check which input field is visible/being used (modal or main UI)
    const modalInput = document.getElementById('autoJoinInput');
    const mainInput = document.getElementById('joinInput');
    const targetId = modalInput.value.trim() || mainInput.value.trim();
    
    if (!targetId) { log("ERROR: HOST ID REQUIRED.", '#ef4444'); return; }

    // Ensure player token is selected
    if (!playerToken || playerToken.isHostTrigger) {
        log("ERROR: INVALID PLAYER SELECTION.", '#ef4444');
        return;
    }

    isClient = true;
    isHost = false;
    toggleClientControls(true); // Disable controls for player
    toggleChatControls(true); // Ensure chat is enabled

    // Activate App UI immediately upon clicking CONNECT, hide modal
    activateAppUI(); 
    document.getElementById('netStatus').innerText = "CONNECTING...";
    document.getElementById('netStatus').style.color = '#ffb300';
    
    peer = new Peer();
    
    peer.on('open', () => {
        conn = peer.connect(targetId);
        
        conn.on('open', () => {
            document.getElementById('netStatus').innerText = "CONNECTED";
            document.getElementById('netStatus').style.color = '#3b82f6';
            log(`CONNECTED TO OVERSEER as ${userName}`, '#3b82f6');
            
            // Hide Host UI elements on successful join
            document.getElementById('hostIdDisplay').classList.add('hidden-ui');
        });

        conn.on('data', receiveData); // Attach data listener

        conn.on('close', () => {
            log("CONNECTION LOST.", '#ef4444');
            document.getElementById('netStatus').innerText = "DISCONNECTED";
            document.getElementById('netStatus').style.color = '#ef4444';
        });
    });

    peer.on('error', (err) => {
        log(`ERROR: FAILED TO CONNECT. ${err.type}`, '#ef4444');
        document.getElementById('netStatus').innerText = "CONNECTION FAILED";
        document.getElementById('netStatus').style.color = '#ef4444';
    });
}

function receiveData(data) {
     if (data.type === 'CHAT') {
  // 1. Log on whoever received it
  log(data.message, data.color, data.sender);

  // 2. If this tab is the HOST, rebroadcast to all clients
  if (isHost && connections?.length) {
    connections.forEach(c => {
      // Avoid echoing back to the original sender if you want,
      // but simplest is just broadcast to all.
      c.send(data);
    });
  }
  return;
}

    // RECEIVE SYNC DATA FROM GM
    if (data.type === 'SYNC') {
        floorData = data.floorData;
        // Special handling for tokens: re-create image objects from URLs
        tokens = data.tokens.map(t => {
            // Check if image object exists or if source URL is different
            const existingToken = tokens.find(et => et.id === t.id);
            if (existingToken && existingToken.src === t.src && existingToken.img) {
                t.img = existingToken.img;
            } else if (t.src) {
                const img = new Image();
                img.src = t.src;
                img.onload = () => drawCurrentLevel(); // Redraw once image loads
                img.onerror = () => { t.img = null; drawCurrentLevel(); }; // Handle broken image
                t.img = img;
            }
            return t;
        });
        currentLevelIndex = data.levelIdx;
        config.mapType = data.mapType;
        interiorData = data.interiorData;
        viewMode = data.viewMode;
        currentInteriorKey = data.currentInteriorKey;
        
        // --- UPDATED CLIENT SYNC & REDRAW ---
        document.getElementById('mapType').value = config.mapType;
        updateLevelControls();
        const interiorName = interiorData[currentInteriorKey]?.name || 'INTERIOR';
        updateUIForMode(viewMode, interiorName);
        drawCurrentLevel();
        // ------------------------------------
    }
}

function syncData() {
    if (isHost && conn) {
        // Prepare tokens for serialization: only send URL (src), not the image object (img)
        const serializableTokens = tokens.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            label: t.label,
            color: t.color,
            src: t.src // Only send the source URL
        }));

        conn.send({
            type: 'SYNC',
            floorData: floorData,
            tokens: serializableTokens, // Send simplified token list
            levelIdx: currentLevelIndex,
            mapType: config.mapType,
            interiorData: interiorData,
            viewMode: viewMode,
            currentInteriorKey: currentInteriorKey
            // Removed gridSize from payload since it is now fixed/constant
        });
    }
}

function sendChatMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;

    const chatColor = isHost ? 'var(--pip-green)' : playerToken ? playerToken.color : '#3b82f6';
    const senderName = isHost ? 'OVERSEER' : userName;
    
    // 1. Log locally
    log(msg, chatColor, senderName);

    // 2. Send over network
   if (isHost && connections?.length) {
  connections.forEach(c => c.send({ type: 'CHAT', sender: senderName, message: msg, color: chatColor }));
} else if (!isHost && conn) {
  conn.send({ type: 'CHAT', sender: senderName, message: msg, color: chatColor });
} else {
  log('OFFLINE. MESSAGE NOT SENT.', 'var(--pip-amber)');
}

    // 3. Clear input
    chatInput.value = '';
}

async function init() {
    // --- FIREBASE INIT AND AUTH ---
    if (Object.keys(firebaseConfig).length > 0) {
        setLogLevel('debug');
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Sign in with custom token or anonymously
        try {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
            userId = auth.currentUser?.uid || crypto.randomUUID();
        } catch (error) {
            console.error("Firebase Auth Error:", error);
            log(`FIREBASE AUTH FAILED. Fallback to anonymous: ${error.message}`, '#ef4444');
            // Fallback to anonymous sign-in if custom token fails
            try {
                await signInAnonymously(auth);
                userId = auth.currentUser?.uid || crypto.randomUUID();
            } catch (e) {
                console.error("Anonymous Sign-in Failed:", e);
                userId = crypto.randomUUID();
            }
        }
    } else {
        userId = crypto.randomUUID();
        log("WARN: FIREBASE CONFIG MISSING. Using anonymous ID.", '#ffb300');
    }
    // --------------------------------------------------

    // Set High Resolution Canvas
    canvas.width = config.width * RENDER_SCALE;
    canvas.height = config.height * RENDER_SCALE;
    ctx.imageSmoothingEnabled = false;

    // FIX: Calculate cols/rows based on fixed gridSize (24) on startup
    config.cols = Math.floor(config.width / config.gridSize);
    config.rows = Math.floor(config.height / config.gridSize);

    // --- PROCEDURAL CLOUD TEXTURE GENERATION ---
    cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 512; cloudCanvas.height = 512;
    const cCtx = cloudCanvas.getContext('2d');
    
    // Fill with semi-transparent dark
    cCtx.fillStyle = 'rgba(0,0,0,0.5)';
    cCtx.fillRect(0,0,512,512);
    
    // Draw hundreds of soft puffs
    for(let i=0; i<300; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = Math.random() * 60 + 20;
        
        const g = cCtx.createRadialGradient(x, y, 0, x, y, r);
        const opacity = Math.random() * 0.15 + 0.05;
        g.addColorStop(0, `rgba(20, 40, 20, ${opacity})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        
        cCtx.fillStyle = g;
        cCtx.beginPath(); cCtx.arc(x, y, r, 0, Math.PI*2); cCtx.fill();
        
        // Wrap around edges for seamless tiling
        if (x < r) {	
            cCtx.fillStyle = g; cCtx.beginPath(); cCtx.arc(x+512, y, r, 0, Math.PI*2); cCtx.fill();	
        }
        if (y < r) {
            cCtx.fillStyle = g; cCtx.beginPath(); cCtx.arc(x, y+512, r, 0, Math.PI*2); cCtx.fill();
        }
    }

    // Init Dust System
    for(let i=0; i<50; i++) {
        dustMotes.push({
            x: Math.random() * config.width,
            y: Math.random() * config.height,
            size: Math.random() * 2,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            alpha: Math.random() * 0.5
        });
    }

    // --- UPDATED EVENT LISTENERS FOR PANNING ---
        // --- UPDATED EVENT LISTENERS FOR PANNING ---
    screenContainer.addEventListener('mousedown', handleMouseDown);
    screenContainer.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    screenContainer.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; isPanning = false; });
    screenContainer.addEventListener('contextmenu', (e) => e.preventDefault()); // ← ADD THIS
    
    // --- NEW: Chat Input Enter Key Listener ---
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // --- Zoom Slider Event Listener ---
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => setZoomLevel(e.target.value));
    }
    // ------------------------------------------
    
    updateHelperText();
    changeLevel(0);	
    generateCurrentLevel();	
    requestAnimationFrame(animate);



    // --- CHARACTER SELECTION GATE (Start flow) ---
    showLoginScreen();
    // ----------------------------------------------
}


function zoomIn() {
    if (zoomLevel < MAXZOOM) {
        zoomLevel += 0.25;
        updateZoomDisplay();
        drawCurrentLevel();
    }
}

function zoomOut() {
    if (zoomLevel > MINZOOM) {
        zoomLevel -= 0.25;
        updateZoomDisplay();
        drawCurrentLevel();
    }
}


function setZoomLevel(value) {
    zoomLevel = parseFloat(value);
    updateZoomDisplay();
    drawCurrentLevel();
}

function updateZoomDisplay() {
    const display = document.getElementById('zoomDisplay');
    if (display) display.innerText = Math.round(zoomLevel * 100) + '%';
    const slider = document.getElementById('zoomSlider');
    if (slider) slider.value = zoomLevel;
}

function animate(time) {
    requestAnimationFrame(animate);
    
    // Tumbleweed Spawner
    if (config.mapType !== 'vault' && viewMode === 'sector') {
        if (Math.random() < 0.005) {	
            const startY = Math.random() * (config.height - 100) + 50;
            tumbleweeds.push({
                x: -50,	
                y: startY,	
                speed: Math.random() * 2 + 1,	
                rot: 0,
                size: Math.random() * 20 + 10
            });
        }
        
        for (let i = tumbleweeds.length - 1; i >= 0; i--) {
            let t = tumbleweeds[i];
            t.x += t.speed;
            t.rot += 0.1;
            if (t.x > config.width + 50) tumbleweeds.splice(i, 1);
        }
    } else {
        tumbleweeds = [];
    }
    
    // Update Dust
    for(let m of dustMotes) {
        m.x += m.speedX;
        m.y += m.speedY;
        if(m.x < 0) m.x = config.width;
        if(m.x > config.width) m.x = 0;
        if(m.y < 0) m.y = config.height;
        if(m.y > config.height) m.y = 0;
    }
    
    drawCurrentLevel(time);
}

// --- NEW MOUSE HANDLER IMPLEMENTATION ---
function handleMouseDown(e) {
    // === RIGHT-CLICK TO TOGGLE TOKEN LABELS ===
    if (e.button === 2) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const rawX = (e.clientX - rect.left) * scaleX;
        const rawY = (e.clientY - rect.top) * scaleY;

        const logicalMouseX = rawX / (RENDER_SCALE * zoomLevel);
        const logicalMouseY = rawY / (RENDER_SCALE * zoomLevel);
        const pannedLogicalX = logicalMouseX - mapOffsetX;
        const pannedLogicalY = logicalMouseY - mapOffsetY;

        for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i];
            const dist = Math.hypot(pannedLogicalX - t.x, pannedLogicalY - t.y);
            if (dist < 20) {
                if (tokenLabelsVisible[t.id] === undefined) {
                    tokenLabelsVisible[t.id] = false;
                } else {
                    tokenLabelsVisible[t.id] = !tokenLabelsVisible[t.id];
                }
                drawCurrentLevel();
                if (typeof syncData === 'function') syncData();
                return;
            }
        }
        return; // Prevent panning after right-click
    }
    // === END RIGHT-CLICK HANDLER ===

    // Calculate mouse position for left-click actions
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;

    const logicalMouseX = rawX / (RENDER_SCALE * zoomLevel);
    const logicalMouseY = rawY / (RENDER_SCALE * zoomLevel);
    const pannedLogicalX = logicalMouseX - mapOffsetX;
    const pannedLogicalY = logicalMouseY - mapOffsetY;

    // 1. CHECK TOKEN DRAG START (GM ONLY)
    if (!isClient) {
        const isDeleteAttempt = e.altKey || e.ctrlKey || e.metaKey;
        for (let t of tokens) {
            const dx = pannedLogicalX - t.x;
            const dy = pannedLogicalY - t.y;
            if (dx * dx + dy * dy < 400) { // 20px hit radius
                if (isDeleteAttempt) {
                    // Deletion is a single click action, not drag.
                } else {
                    draggedToken = t;
                    screenContainer.classList.remove('crosshair');
                    screenContainer.classList.add('grabbing');
                    lastPanX = e.clientX;
                    lastPanY = e.clientY;
                    return;
                }
            }
        }
    }

    // 2. START PANNING
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    screenContainer.classList.add('grabbing');
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;

    const logicalMouseX = rawX / (RENDER_SCALE * zoomLevel);
    const logicalMouseY = rawY / (RENDER_SCALE * zoomLevel);

    const pannedLogicalX = logicalMouseX - mapOffsetX;
    const pannedLogicalY = logicalMouseY - mapOffsetY;

    mousePos = { x: logicalMouseX, y: logicalMouseY };

    if (draggedToken) {
        draggedToken.x = pannedLogicalX;
        draggedToken.y = pannedLogicalY;
        drawCurrentLevel();
        screenContainer.classList.add('grabbing');
        return;
    }

    if (isPanning) {
        const dx = e.clientX - lastPanX;
        const dy = e.clientY - lastPanY;

        mapOffsetX += dx / RENDER_SCALE;
        mapOffsetY += dy / RENDER_SCALE;

        const viewportWidth = config.width / zoomLevel;
        const viewportHeight = config.height / zoomLevel;
        const maxOverhang = Math.max(viewportWidth, viewportHeight) / 2;
        const maxPanX = maxOverhang;
        const minPanX = -config.width + viewportWidth - maxOverhang;
        const maxPanY = maxOverhang;
        const minPanY = -config.height + viewportHeight - maxOverhang;

        mapOffsetX = Math.max(minPanX, Math.min(maxPanX, mapOffsetX));
        mapOffsetY = Math.max(minPanY, Math.min(maxPanY, mapOffsetY));

        lastPanX = e.clientX;
        lastPanY = e.clientY;

        drawCurrentLevel();
        return;
    }

    // 2. TOOLTIP CHECK
    const data = (viewMode === 'interior') ? interiorData[currentInteriorKey] : floorData[currentLevelIndex];
    if (!data) return;

    const gridX = Math.floor(pannedLogicalX / config.gridSize);
    const gridY = Math.floor(pannedLogicalY / config.gridSize);
    
    document.getElementById('coordDisplay').innerText = `${gridX},${gridY}`;
    let hovering = false;

    // --- LOOT TOOLTIP ---
    if (!hovering && data.loot) {
        for(let item of data.loot) {
            if (config.fogEnabled && !isLocationRevealed(data, gridX, gridY)) continue;
            if(item.x === gridX && item.y === gridY) {
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
                
                let status;
                if (item.looted) { status = `[ EMPTY ]`; }	
                else if (item.isLocked) { status = `[ LOCKED: ${item.lockDetail.replace(/\[|\]/g, '')} ${item.containerName} ]`; }	
                else { status = `[ ${item.containerName} ]`; }

                tooltip.innerText = status;
                screenContainer.classList.add('crosshair');
                hovering = true;
            }
        }
    }
    
    // --- DECORATION/LABEL TOOLTIP ---
    if (!hovering && data.labels) {
        for (let lbl of data.labels) {
            if (config.fogEnabled && !isLocationRevealed(data, Math.floor(lbl.x/config.gridSize), Math.floor(lbl.y/config.gridSize))) continue;
            
            if (Math.abs(pannedLogicalX - lbl.x) < 40 && Math.abs(pannedLogicalY - lbl.y) < 15) {
                // *** FIX: Only show ENTER tooltip if we are in Sector mode ***
                if (viewMode === 'sector' && isEnterable(lbl.text)) {
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                    tooltip.innerText = `[ ENTER ${lbl.text} ]`;
                    screenContainer.classList.add('crosshair');
                    hovering = true;
                } else if (lbl.text.includes("STAIRS")) {
                     tooltip.style.display = 'block';
                     tooltip.style.left = (e.clientX + 15) + 'px';
                     tooltip.style.top = (e.clientY + 15) + 'px';
                     tooltip.innerText = `[ ${lbl.text} ]`;
                     screenContainer.classList.add('crosshair');
                     hovering = true;
                }
            }
        }
    }
    
    if (!hovering && viewMode === 'interior' && data.exit && data.exit.x === gridX && data.exit.y === gridY) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY + 15) + 'px';
        tooltip.innerText = `[ EXIT TO SECTOR ]`;
        screenContainer.classList.add('crosshair');
        hovering = true;
    }

    // 3. TOKEN DELETE HINT
    if (!hovering && !isClient && (e.altKey || e.ctrlKey || e.metaKey)) {
        for (let t of tokens) {
             const dx = pannedLogicalX - t.x;
             const dy = pannedLogicalY - t.y;
             if (dx*dx + dy*dy < 400) {
                 tooltip.style.display = 'block';
                 tooltip.style.left = (e.clientX + 15) + 'px';
                 tooltip.style.top = (e.clientY + 15) + 'px';
                 tooltip.innerText = `[ DELETE ${t.label} ]`;
                 screenContainer.classList.add('crosshair');
                 hovering = true;
                 break;
            }
        }
    }

    if (!hovering) { tooltip.style.display = 'none'; screenContainer.classList.remove('crosshair'); }
}

function handleMouseUp(e) {
    screenContainer.classList.remove('grabbing');

    if (draggedToken) {
        draggedToken = null;
        syncData();
        isPanning = false;
        return;
    }

    if (
        isPanning &&
        Math.abs(e.clientX - lastPanX) < MINIMAL_MOVEMENT_THRESHOLD &&
        Math.abs(e.clientY - lastPanY) < MINIMAL_MOVEMENT_THRESHOLD
    ) {
        handleCanvasAction(e);
    }

    isPanning = false;
}

// Renamed from handleCanvasClick
function handleCanvasAction(e) {
    const data = (viewMode === 'interior') ? interiorData[currentInteriorKey] : floorData[currentLevelIndex];
    if(!data) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Raw canvas coords
    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;
    
    // Logical coords for interaction (must be corrected by map offset)
    const logicalMouseX = rawX / (RENDER_SCALE * zoomLevel);
    const logicalMouseY = rawY / (RENDER_SCALE * zoomLevel);

    const pannedLogicalX = logicalMouseX - mapOffsetX;
    const pannedLogicalY = logicalMouseY - mapOffsetY;
    
    // Grid coords based on corrected mouse position
    const gridX = Math.floor(pannedLogicalX / config.gridSize);
    const gridY = Math.floor(pannedLogicalY / config.gridSize);
    
    let clicked = false;
    const currentTime = Date.now();
    
    // 1. CHECK TOKEN DELETE (GM ONLY)
    if (!isClient) {
        const isDeleteAttempt = e.altKey || e.ctrlKey || e.metaKey;	
        if (isDeleteAttempt) {
            for (let i = 0; i < tokens.length; i++) {
                let t = tokens[i];
                // Hit test using the *corrected* mouse position
                const dx = pannedLogicalX - t.x;
                const dy = pannedLogicalY - t.y;

                if (dx*dx + dy*dy < 400) {	
                    log(`UNIT REMOVED: ${t.label}`, '#ef4444');
                    tokens.splice(i, 1);	
                    syncData();
                    return;	
                }
            }
        }
    }

    // 2. CLIENT RESTRICTION CHECK (Clients can only click visible labels for info)
    if (isClient) {
        // Only allow label visibility toggle/info log
        if (viewMode === 'sector') {
            for (let lbl of data.labels) {
                const lx = lbl.x; const ly = lbl.y;
                if (Math.abs(pannedLogicalX - lx) < 40 && Math.abs(pannedLogicalY - ly) < 15) {
                    if (!isEnterable(lbl.text)) {
                        lbl.visible = !lbl.visible;
                        log(`${lbl.text} LABEL TOGGLED [Visible: ${lbl.visible}]`);
                        // Client cannot sync data to host, but they can update their local map data
                        // The GM is the source of truth, so this local change might be overwritten on next sync. 
                        // Ideally, clients only request map changes from GM, but for local flavor, we allow it.
                        // NOTE: The current PeerJS setup only supports GM->Client broadcast.
                        clicked = true;
                    }
                }
            }
        }
        return; // Stop client interaction here.
    }

    // --- GM ONLY ACTIONS BELOW ---

    // FOG REVEAL
    if (config.fogEnabled && data.rooms) {
        const room = data.rooms.find(r => gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h);
        if (room && !room.visited) {
            room.visited = true;
            log(`SECTOR REVEALED: ${room.name || 'UNKNOWN'}`, 'var(--pip-green)');
            clicked = true;
            syncData();	
            return;
        }
    }

    // --- LOOT INTERACTION (GM ONLY) ---
    if (data.loot) {
        for(let item of data.loot) {
            if (item.x === gridX && item.y === gridY) {
                if (item.looted) {
                    log(`NOTE: ${item.containerName} is already emptied.`, 'var(--dim-color)');
                }	
                else if (item.isLocked) {
                    const isDoubleClick = lastLootClick.x === gridX && lastLootClick.y === gridY && (currentTime - lastLootClick.time < DOUBLE_CLICK_TIME);

                    if (isDoubleClick) {
                        // GM Double-Click Override (Success)
                        item.isLocked = false;
                        item.looted = true;
                        log(`ACCESS GRANTED: ${item.containerName} force-unlocked by Overseer.`, 'var(--pip-green)');
                        logLoot(item.containerName, item.contents);
                        // Reset click state
                        lastLootClick = { x: -1, y: -1, time: 0 };	
                    } else {
                        // First click on a locked item (Logs Challenge)
                        log(`ACCESS DENIED: ${item.containerName} is locked. Challenge required. ${item.lockDetail}`, '#ef4444');
                        lastLootClick = { x: gridX, y: gridY, time: currentTime };
                    }
                }	
                else {
                    // Unlocked container - loot it
                    item.looted = true;
                    logLoot(item.containerName, item.contents);
                    lastLootClick = { x: -1, y: -1, time: 0 }; // Clear state
                }
                
                clicked = true;
                syncData(); // Sync looted status immediately
            }
        }
    }
    // ------------------------------------------
    
    // RADIO INTERACTION
    if (!clicked && data.decorations) {
         for(let deco of data.decorations) {
              if (config.fogEnabled && !isLocationRevealed(data, deco.x, deco.y)) continue;
              if (deco.x === gridX && deco.y === gridY && deco.type === 'radio') {
                   const tunes = ["'Distant gunfire'", "'Buzzing neon lights'", "'Howling wind'", "'Geiger counter clicking'", "'Dripping water'", "'A Lone Voice'", "'No Signal'"];
                   log(`RADIO TUNED: 🎵 ${tunes[Math.floor(Math.random()*tunes.length)]}`, 'var(--pip-amber)');
                   clicked = true;
              }
         }
    }

    // EXIT INTERIOR
    if (!clicked && viewMode === 'interior' && data.exit && data.exit.x === gridX && data.exit.y === gridY) {
         exitInterior();	
         clicked = true;
         // syncData() called inside exitInterior
    }

    // ENTER INTERIOR / TOGGLE LABELS
    if (!clicked && viewMode === 'sector') {
        for (let lbl of data.labels) {
            const lx = lbl.x; const ly = lbl.y;
            // Check panned logical mouse against un-panned label position
            if (Math.abs(pannedLogicalX - lx) < 40 && Math.abs(pannedLogicalY - ly) < 15) {
                if (isEnterable(lbl.text)) {
                    enterInterior(lbl);
                    clicked = true;
                    // syncData() called inside enterInterior
                }
                else {
                    // Toggle non-enterable labels like STREET or STAIRS
                    lbl.visible = !lbl.visible;
                    log(`${lbl.text} LABEL TOGGLED [Visible: ${lbl.visible}]`);
                    syncData(); // Sync label visibility
                }
                clicked = true;
            }
        }
    }
}

// --- END NEW MOUSE HANDLER IMPLEMENTATION ---

function isLocationRevealed(data, x, y) {
    if (!data.rooms) return true;
    const room = data.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (room && !room.visited) return false;
    return true;
}

function isEnterable(text) {
    if (config.mapType === 'vault') return false;
    if (text.includes("STAIRS") || text.includes("UNKNOWN")) return false;
    for(let blocked of NON_ENTERABLE) if (text.includes(blocked)) return false;
    return true;
}

function changeLevel(delta) {
    const type = config.mapType || 'vault';
    const maxLvl = (type === 'vault') ? 2 : 0;
    const minLvl = -2;
    let target = currentLevelIndex + delta;
    if (target < minLvl) target = minLvl;
    if (target > maxLvl) target = maxLvl;
    
    currentLevelIndex = target;
    const levelName = LEVEL_NAMES[currentLevelIndex] || `LEVEL ${currentLevelIndex}`;
    document.getElementById('levelDisplay').innerText = levelName;
    updateLevelControls();
    
    // Check if map data exists for the new level
    if(!floorData[currentLevelIndex]) {
        floorData[currentLevelIndex] = null;
        log(`NOTE: ${levelName} is UNMAPPED. Press [ >> SCAN LEVEL ] to begin cartography.`, 'var(--pip-amber)');
    }
    
    // Force redraw when changing level
    drawCurrentLevel();
    
    // Sync state if host
    if (isHost) syncData();
}

function updateLevelControls() {
     const type = config.mapType || 'vault';
     const maxLvl = (type === 'vault') ? 2 : 0;
     const minLvl = -2;
     const btnUp = document.getElementById('btnUp');
     const btnDown = document.getElementById('btnDown');
     if (btnUp) {
         if (currentLevelIndex >= maxLvl) btnUp.classList.add('disabled');
         else btnUp.classList.remove('disabled');
     }
     if (btnDown) {
         if (currentLevelIndex <= minLvl) btnDown.classList.add('disabled');
         else btnDown.classList.remove('disabled');
     }
}

function toggleLabels() {	
    if (isClient) return; // Prevent client interaction (Fix 2)
    config.showLabels = !config.showLabels;	
}

function log(msg, color, sender) { // Added optional sender argument
    const entry = document.createElement('div');
    entry.className = 'loot-entry';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if(sender) {
        // This is a chat message
        entry.className += ' chat-entry';
        entry.innerHTML = `
            <span style="color: ${color};">${timestamp}</span>	
            <strong style="color: ${color};">${sender}:</strong>	
            ${msg}
        `;
    } else {
        // This is a system/loot message
        if(color) entry.style.color = color;
        entry.innerHTML = `<span>${timestamp}</span> ${msg}`;
    }

    lootLog.appendChild(entry);
    lootLog.scrollTop = lootLog.scrollHeight;
}

function logLoot(container, items) {
    let totalVal = 0;
    const itemStr = items.map(i => { totalVal += i.v; return `${i.n} (${i.v}c)`; }).join(", ");
    log(`ACCESSING: <strong>${container}</strong><br><span style="color:var(--main-color); opacity: 1; padding-left: 10px;">> FOUND: ${itemStr} <span style="opacity:0.5">[TOTAL: ${totalVal}c]</span></span>`);
}

function enterInterior(labelObj) {
    const key = `${currentLevelIndex}_${Math.floor(labelObj.x)}_${Math.floor(labelObj.y)}`;
    currentInteriorKey = key;
    if (!interiorData[key]) {
        log(`GENERATING INTERIOR: ${labelObj.text}...`, 'var(--main-color)');
        generateInterior(key, labelObj.text);
    } else { log(`ENTERING: ${labelObj.text}`); }
    viewMode = 'interior';
    updateUIForMode('interior', labelObj.text);
    
    // FIX: Send the new interior map data and view mode to the client
    syncData();	
}

function exitInterior() {
    log("RETURNING TO SECTOR...");
    viewMode = 'sector';
    currentInteriorKey = null;
    updateUIForMode('sector');
    
    // FIX: Send the sector view mode back to the client
    syncData();
}

function updateUIForMode(mode, text) {
    const sec = document.getElementById('sectorControls');
    const int = document.getElementById('interiorControls');
    const btn = document.getElementById('scanBtn');
    if (mode === 'interior') {
        sec.classList.add('hidden-ui'); int.classList.remove('hidden-ui');
        document.getElementById('interiorDisplay').innerText = text;
        btn.disabled = true; btn.classList.add('opacity-50');
    } else {	
        sec.classList.remove('hidden-ui'); int.classList.add('hidden-ui');
        btn.disabled = false; btn.classList.remove('opacity-50');
    }
    // Always redraw to ensure the new viewmode is rendered correctly
    drawCurrentLevel();
}

// --- UPDATED GENERATE INTERIOR (V.29.0) ---
function generateInterior(key, name) {
    const densityInput = parseInt(document.getElementById('density').value);
    
    // 1. Determine the effective thematic archetype based on map type and level
    let effectiveArchKey = getArchetype(name);

    if (config.mapType === 'ruins' && currentLevelIndex < 0) {
        // City Basement -> Sewer/Bunker/Creepy
        effectiveArchKey = (Math.random() < 0.4) ? 'SEWER' : (Math.random() < 0.6) ? 'BUNKER' : 'CULT';
        log(`SUB-LEVEL THEME: FORCED [${effectiveArchKey}]`, 'var(--pip-amber)');
    } else if (config.mapType === 'cave') {
        // Cave Interior -> Natural/Bunker
        effectiveArchKey = (Math.random() < 0.7) ? 'NATURAL' : 'BUNKER';
        log(`SUB-LEVEL THEME: FORCED [${effectiveArchKey}]`, 'var(--pip-amber)');
    } else if (config.mapType === 'vault') {
        // Vault interior, maintain Vault theme
        effectiveArchKey = 'VAULT';
    }
    
    const archKey = effectiveArchKey;

    let sizeMod = 1.0;	
    if (archKey === 'RETAIL' || archKey === 'GENERIC') sizeMod = 0.5;
    else if (archKey === 'INDUSTRIAL' || archKey === 'HOSPITAL' || archKey === 'VAULT' || archKey === 'NATURAL') sizeMod = 1.5;

    let targetRoomCount = Math.floor(((densityInput / 4) + 2) * sizeMod);
    targetRoomCount = Math.max(3, Math.min(targetRoomCount, 30));
    
    // Use fixed config.gridSize
    const intConfig = { ...config, cols: Math.floor(config.width/config.gridSize), rows: Math.floor(config.height/config.gridSize) };
    const newData = { grid: Array(intConfig.cols).fill().map(() => Array(intConfig.rows).fill(0)), labels: [], stairs: [], loot: [], decorations: [], doors: [], rooms: [], threats: [], exit: null };
    
    const rooms = [];
    const entryRoom = { x: Math.floor(intConfig.cols/2) - 3, y: intConfig.rows - 8, w: 6, h: 6, name: "Entrance", visited: true };	
    createRoom(newData.grid, entryRoom, intConfig);
    rooms.push(entryRoom); newData.rooms.push(entryRoom);
    newData.exit = { x: Math.floor(entryRoom.x + entryRoom.w/2), y: entryRoom.y + entryRoom.h - 1 };
    
    let attempts = 0;
    let maxAttempts = 1000;
    
    while (rooms.length < targetRoomCount && attempts < maxAttempts) {
        attempts++;
        const source = rooms[Math.floor(Math.random() * rooms.length)];
        const w = Math.floor(Math.random() * 6) + 4;	
        const h = Math.floor(Math.random() * 6) + 4;
        const dir = Math.floor(Math.random() * 4);	
        const dist = (sizeMod < 1.0) ? 1 : Math.floor(Math.random() * 3) + 2;	
        
        let x = source.x; let y = source.y;
        
        if(dir === 0) y -= (dist + h);	 	
        if(dir === 1) x += (source.w + dist);	
        if(dir === 2) y += (source.h + dist);	
        if(dir === 3) x -= (dist + w);	 	
        
        if (x < 2 || y < 2 || x + w > intConfig.cols - 2 || y + h > intConfig.rows - 2) continue;
        
        const newRoom = {x, y, w, h, visited: false};
        let failed = false;
        for (let other of rooms) {
            if (x < other.x + other.w + 1 && x + w + 1 > other.x &&	
                y < other.y + other.h + 1 && y + h + 1 > other.y) {
                failed = true;
                break;
            }
        }
        
        if (!failed) {
            createRoom(newData.grid, newRoom, intConfig);
            const srcCenterX = source.x + Math.floor(source.w/2);
            const srcCenterY = source.y + Math.floor(source.h/2);
            const newCenterX = newRoom.x + Math.floor(newRoom.w/2);
            const newCenterY = newRoom.y + Math.floor(newRoom.h/2);
            createCorridor(newData.grid, srcCenterX, srcCenterY, newCenterX, newCenterY, intConfig);
            
            // Use the derived archKey here
            const roomName = getRoomDecision(archKey, rooms, source.name);
            
            newRoom.name = roomName;
            rooms.push(newRoom);	
            newData.rooms.push(newRoom);
            addLabelToData(newData, newCenterX, newCenterY, roomName);
        }
    }
    
    generateDoors(newData);	
    generateLoot(newData, 'interior');	
    generateDecorations(newData, 'interior', densityInput);	
    interiorData[key] = newData;
}
// --- END UPDATED GENERATE INTERIOR ---

function clearCurrentLevel() { floorData[currentLevelIndex] = null; log(`LEVEL DATA CLEARED`, '#ef4444'); }
function purgeAll() { setTimeout(() => { floorData = {}; interiorData = {}; lootLog.innerHTML = ""; currentLevelIndex = 0; viewMode = 'sector'; changeLevel(0); generateCurrentLevel(); log("SYSTEM PURGE COMPLETE", '#ef4444'); }, 500); }

function exportReport() {
    const textArea = document.getElementById('reportArea');
    const type = document.getElementById('mapType').value.toUpperCase();
    let report = `LOCATION ANALYSIS: ${type}\n================================\n\n`;
    for(let i = -2; i <= 2; i++) {
        if(floorData[i]) {
            report += `[ ${LEVEL_NAMES[i]} ]\n--------------------------------\n`;
            floorData[i].labels.forEach(lbl => report += ` - ${lbl.text} [GRID: ${Math.floor(lbl.x/config.gridSize)}, ${Math.floor(lbl.y/config.gridSize)}]\n`);
            if(floorData[i].loot) floorData[i].loot.forEach(l => report += ` - ${l.containerName}: ${l.contents.map(c=>c.n).join(", ")}\n`);
            report += "\n";
        }
    }
    textArea.value = report;
    document.getElementById('reportModal').style.display = 'flex';
}
function closeModal() { document.getElementById('reportModal').style.display = 'none'; }
function copyReport() { document.getElementById('reportArea').select(); document.execCommand('copy'); log("COPIED TO CLIPBOARD", 'var(--main-color)'); }

function generateAtmosphere() {
    const sounds = ["Distant gunfire", "Buzzing neon lights", "Howling wind", "Geiger counter clicking", "Dripping water", "Static from a radio", "Salty wind", "Silence... too quiet", "Metallic grinding"];
    const smells = ["Ozone and rust", "Rotting brahmin meat", "Antiseptic and dust", "Old paper and mildew", "Gunpowder", "Stagnant water", "Burnt plastic"];
    const lighting = ["Flickering emergency red", "Harsh noonday sun", "Pitch black", "Soft blue CRT glow", "Hazy green irradiation", "Dim orange lantern"];
    const s = sounds[Math.floor(Math.random() * sounds.length)];
    const sm = smells[Math.floor(Math.random() * smells.length)];
    const l = lighting[Math.floor(Math.random() * lighting.length)];
    return `> SENSORS: AUDIO[${s}] // OLFACTORY[${sm}] // VISUAL[${l}]`;
}

function generateCurrentLevel() {
    if (isClient) return; // Client should never generate maps

        patternCache = {}; // Force pattern regeneration

    // gridSize is now fixed in config
    config.mapType = document.getElementById('mapType').value;
    const density = parseInt(document.getElementById('density').value);
    
    // cols and rows should already be set in init based on fixed gridSize
    
    log(`INITIATING SCAN: ${LEVEL_NAMES[currentLevelIndex]}`);

    const newData = { grid: Array(config.cols).fill().map(() => Array(config.rows).fill(0)), labels: [], stairs: [], loot: [], decorations: [], doors: [], rooms: [], threats: [] };
    let fixedAnchors = [];
    let syncRequired = false; // Flag to check if we modified an adjacent level

    const canHaveUpperStairs = (config.mapType === 'vault') || (currentLevelIndex < 0);
    
    // ----------------------------------------------------
    // 1. LINKING TO UPPER LEVEL (L(N+1))
    // ----------------------------------------------------
    if (canHaveUpperStairs && floorData[currentLevelIndex + 1]) {
        const upper = floorData[currentLevelIndex + 1];
        const match = upper.stairs.find(s => s.type === 'down'); // Find DOWN stair on L(N+1)
        
        if (match) {
            // Match found: Place reciprocal UP stair on current level (L(N))
            const anchor = { x: match.x, y: match.y, type: 'up' };	
            fixedAnchors.push(anchor); newData.stairs.push(anchor);
            addLabelToData(newData, anchor.x, anchor.y - 0.7, "STAIRS UP");
        } else if (currentLevelIndex < 2) {
            // No match, but upper level exists: Create new link point on L(N+1)
            const spot = findRandomFloor(upper.grid);
            if(spot) {
                // Modify UPPER level (L(N+1)) data and flag for sync.
                upper.stairs.push({x:spot.x, y:spot.y, type:'down'});	
                addLabelToData(upper, spot.x, spot.y-0.7, "STAIRS DOWN");
                syncRequired = true; // IMPORTANT: Flag that adjacent data was changed

                // Create matching UP stair on current level (L(N))
                const anchor = {x:spot.x, y:spot.y, type:'up'}; fixedAnchors.push(anchor); newData.stairs.push(anchor);	
                addLabelToData(newData, anchor.x, anchor.y-0.7, "STAIRS UP");
            }
        }
    }

    // ----------------------------------------------------
    // 2. LINKING TO LOWER LEVEL (L(N-1))
    // ----------------------------------------------------
    if (floorData[currentLevelIndex - 1]) {
        const lower = floorData[currentLevelIndex - 1];
        const match = lower.stairs.find(s => s.type === 'up'); // Find UP stair on L(N-1)
        
        if (match) {
            // Match found: Place reciprocal DOWN stair on current level (L(N))
            const anchor = { x: match.x, y: match.y, type: 'down' };	
            fixedAnchors.push(anchor); newData.stairs.push(anchor);
            addLabelToData(newData, anchor.x, anchor.y - 0.7, "STAIRS DOWN");
        } else if (currentLevelIndex > -2) {
            // No match, but lower level exists: Create new link point on L(N-1)
            const spot = findRandomFloor(lower.grid);
            if(spot) {
                // Modify LOWER level (L(N-1)) data and flag for sync.
                lower.stairs.push({x:spot.x, y:spot.y, type:'up'});	
                addLabelToData(lower, spot.x, spot.y-0.7, "STAIRS UP");
                syncRequired = true; // IMPORTANT: Flag that adjacent data was changed

                // Create matching DOWN stair on current level (L(N))
                const anchor = {x:spot.x, y:spot.y, type:'down'}; fixedAnchors.push(anchor); newData.stairs.push(anchor);	
                addLabelToData(newData, anchor.x, anchor.y-0.7, "STAIRS DOWN");
            }
        }
    }
    // ----------------------------------------------------

    log(generateAtmosphere(), 'var(--pip-amber)');

    if (config.mapType === 'cave') generateCaves(newData, density, fixedAnchors);
    else if (config.mapType === 'vault') { generateVault(newData, density, fixedAnchors); generateDoors(newData); }
    else generateRuins(newData, density, fixedAnchors);

    // NEW: Erode Buildings for Ruins
    if (config.mapType === 'ruins') {
        erodeBuildings(newData);
    }

    generateLoot(newData, config.mapType);
    generateDecorations(newData, config.mapType, density);
    generateLocksAndKeys(newData);

    // SAVE the newly generated level
    floorData[currentLevelIndex] = newData;
    
    // --- FIX 2: Clarify Fog of War to GM ---
    log("FOG OF WAR ENABLED. Click on dark areas to reveal sectors to players.", 'var(--pip-amber)');
    // ---------------------------------------
    
    // Sync new data to clients if host, ESPECIALLY if adjacent levels were modified
    if (isHost && (conn || syncRequired)) {
        syncData(); // This is the crucial missing step that ensures L0 knows about the new stair on L-1
    }
    
    // Fix Host Blank Canvas: Ensure immediate redraw after generation
    drawCurrentLevel();	
}

function erodeBuildings(data) {
    // We iterate multiple times to make the erosion feel natural
    const passes = 3;	
    
    for (let i = 0; i < passes; i++) {
        // Create a copy so we don't mess up checks mid-loop
        let changes = [];
        
        for (let x = 1; x < config.cols - 1; x++) {
            for (let y = 1; y < config.rows - 1; y++) {
                if (data.grid[x][y] === 1) { // If it's a floor...
                    let walls = getWallCount(data.grid, x, y);
                    
                    // If it's a corner (3+ walls) or a thin edge, maybe nuke it
                    // Higher probability near the "outside" of a building
                    let erosionChance = 0.0;
                    if (walls >= 3) erosionChance = 0.4; // Corners crumble easily
                    else if (walls === 2) erosionChance = 0.1; // Edges crumble sometimes
                    
                    if (Math.random() < erosionChance) {
                        changes.push({x, y});
                    }
                }
            }
        }
        
        // Apply the damage
        changes.forEach(p => data.grid[p.x][p.y] = 0);
    }
}

function findRandomFloor(grid) {
    const spots = [];
    for(let x=1; x<grid.length-1; x++) for(let y=1; y<grid[0].length-1; y++) if(grid[x][y]===1) spots.push({x,y});
    return spots.length ? spots[Math.floor(Math.random()*spots.length)] : null;
}

function generateDoors(data) {
    for(let x=1; x<config.cols-1; x++) {
        for(let y=1; y<config.rows-1; y++) {
            if(data.grid[x][y] === 1) {
                const n = data.grid[x][y-1], s = data.grid[x][y+1], e = data.grid[x+1][y], w = data.grid[x-1][y];
                let isDoor = (e===0 && w===0 && n===1 && s===1) || (n===0 && s===0 && e===1 && w===1);
                if(isDoor) {
                    let onEdge = false;
                    let parentRoom = null;
                    for(let r of data.rooms) {
                        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1)) {
                            onEdge = true;
                            parentRoom = r;
                        }
                    }
                    if(onEdge && !isOccupied(data, x, y)) {
                        data.doors.push({x, y, locked: false, parentRoom: parentRoom});
                    }
                }
            }
        }
    }
}

function generateLocksAndKeys(data) {
    if (!data.rooms || data.rooms.length < 2) return;
    let availableColors = [...KEY_COLORS];
    
    for (let r of data.rooms) {
        const logic = ROOM_RELATIONS[r.name];	
        const isLocked = (logic && logic.tags && logic.tags.includes("Secure"));	
        
        if (isLocked && availableColors.length > 0) {
            const door = data.doors.find(d => d.parentRoom === r);
            if (door) {
                const color = availableColors.shift();
                door.locked = true;
                door.keyColor = color;
                const otherRooms = data.rooms.filter(or => or !== r);
                if (otherRooms.length > 0) {
                    const keyRoom = otherRooms[Math.floor(Math.random() * otherRooms.length)];
                    let loot = data.loot.find(l => l.x >= keyRoom.x && l.x < keyRoom.x + keyRoom.w && l.y >= keyRoom.y && l.y < keyRoom.y + keyRoom.h);
                    const keyItem = { n: `ACCESS CARD (${color})`, v: 50, color: color };
                    if (loot) { loot.contents.push(keyItem); }	
                    else {	
                        // NEW: Force spawn container near key room if none exists
                        data.loot.push({	
                            x: Math.floor(keyRoom.x + keyRoom.w/2),	
                            y: Math.floor(keyRoom.y + keyRoom.h/2),	
                            containerName: "Desk",	
                            contents: [keyItem],	
                            looted: false,
                            isLocked: false,
                            lockDetail: ""
                        });	
                    }
                }
            }
        }
    }
}

// --- NEW LOOT HELPER FUNCTIONS ---
function filterItemsByLootFocus(pool, focus) {
    // Focus logic based on required items:
    if (focus === "HIGH_VALUE") {
        return pool.filter(i => i.v >= 70 || i.n.includes("Mini-Nuke") || i.n.includes("Stealth Boy") || i.n.includes("Pip-Boy"));
    }
    if (focus === "JUMPSUIT_GUNS") {
        return pool.filter(i => i.n.includes("Jumpsuit") || i.n.includes("Pistol") || i.n.includes("Armor") || i.n.includes("SMG") || i.n.includes("Rifle") || i.n.includes("Shotgun"));
    }
    if (focus === "REPAIR_JUNK") {
        return pool.filter(i => i.n.includes("Duct Tape") || i.n.includes("Wonderglue") || i.n.includes("Turpentine") || i.n.includes("Toolbox") || i.n.includes("Scrap") || i.n.includes("Conductor") || i.n.includes("Sensor"));
    }
    if (focus === "PAPER_JUNK") {
        return pool.filter(i => i.n.includes("Money") || i.n.includes("Book") || i.n.includes("Pin") || i.n.includes("Cigarettes") || i.n.includes("Pre-War Hat"));
    }
    if (focus === "MEDS") {
        return pool.filter(i => i.n.includes("Stimpak") || i.n.includes("Rad-X") || i.n.includes("RadAway") || i.n.includes("Doctor's Bag") || i.n.includes("Antidote") || i.n.includes("Antivenom") || i.n.includes("Healing Powder") || i.n.includes("Trauma Pack") || i.n.includes("Hypo") || i.n.includes("Fixer") || i.n.includes("Super Stimpak"));
    }
    if (focus === "LOW_CAPS") {
        return pool.filter(i => i.n.includes("Money") || i.v < 10);
    }
    if (focus === "NUKA_COLA") {
        return pool.filter(i => i.n.includes("Nuka-Cola") || i.n.includes("Quantum") || i.n.includes("Alcohol") || i.n.includes("Jet") || i.n.includes("Psycho") || i.n.includes("Mentats"));
    }
    if (focus === "AMMO_EXP") {
        return pool.filter(i => i.n.includes("Dynamite") || i.n.includes("Molotov") || i.n.includes("Pistol") || i.n.includes("Rifle") || i.n.includes("Shotgun") || i.n.includes("SMG") || i.n.includes("Mini-Nuke"));
    }
    if (focus === "FOOD_WATER" || focus === "SURVIVAL") {
        return pool.filter(i => i.n.includes("Water") || i.n.includes("Food") || i.n.includes("Fruit") || i.n.includes("Meat") || i.n.includes("Fungus") || i.n.includes("Outfit") || i.n.includes("Machete"));
    }
    // Default fallback to all general junk and low value
    return pool.filter(i => i.v < 25);
}

// --- UPDATED pickWeightedItem (Rule A Implemented) ---
function pickWeightedItem(type, requiredFocus = null, isLockedContainer = false) {
    const pool = ITEM_DATABASE[type] || ITEM_DATABASE['cave'];
    let effectivePool = pool;
    
    if (requiredFocus) {
        let focusedPool = filterItemsByLootFocus(pool, requiredFocus);
        if (focusedPool.length > 0) {
            effectivePool = focusedPool;
        } else {
             effectivePool = pool.filter(i => i.v < 25);	
        }
    }

    // Define weights based on loot quality priority (Rule A)
    const getWeight = (itemValue) => {
        if (isLockedContainer) {
            // Locked containers prioritize high value items
            if (itemValue >= 25) return 100; // High chance for high-value items
            if (itemValue >= 15) return 20;	 // Medium chance
            return 5;	 		 	 	 // Low chance for junk
        } else {
            // Unlocked containers prioritize low value items (Junk)
            if (itemValue < 25) return 100;	
            if (itemValue < 75) return 15;
            if (itemValue < 200) return 3;
            return 0.5;
        }
    };

    // Calculate total weight using the dynamic function
    let totalWeight = effectivePool.reduce((sum, i) => sum + getWeight(i.v), 0);
    let random = Math.random() * totalWeight;

    for(let item of effectivePool) {
        let w = getWeight(item.v);
        random -= w;	
        if(random <= 0) return item;
    }
    return effectivePool[0] || pool[0]; // Safest fallback
}

// --- NEW HELPER FUNCTION: getLockDifficulty (Rule B Implementation) ---
function getLockDifficulty(lootFocus) {
    const roll = Math.random();
    if (lootFocus === "HIGH_VALUE") {
        // Rule B: HIGH_VALUE -> HARD or VERY HARD (70% chance)
        if (roll < 0.35) return "HARD";
        if (roll < 0.70) return "VERY HARD";
        return "AVERAGE"; // 30% chance for average
    }
    if (lootFocus === "MEDS" || lootFocus === "AMMO_EXP") {
        // Rule B: MEDS/AMMO -> EASY or AVERAGE (70% chance)
        if (roll < 0.35) return "EASY";
        if (roll < 0.70) return "AVERAGE";
        return "HARD"; // 30% chance for hard
    }
    // Default (JUNK/SURVIVAL/PAPER) -> mostly EASY, often unlocked (handled by lock chance)
    if (roll < 0.70) return "EASY";
    return "AVERAGE";
}
// ----------------------------------------------------------------------


function generateLoot(data, type) {
    // 1. Define the primary category based on the determined map theme
    const mapTheme = (type === 'interior' && currentInteriorKey) ? getArchetype(interiorData[currentInteriorKey]?.name || 'GENERIC') : type.toUpperCase();
    
    // FIX START: V's Contextual Container Filter
    const mapCategory = (mapTheme === 'VAULT') ? 'Vault' :	
                         (mapTheme === 'CAVE' || mapTheme === 'NATURAL') ? 'Cave' : 'Ruins';
    
    // 2. Filter CONTAINER_DETAILS: Must include the primary category OR the generic "Interior" tag
    let allowedContainerKeys = Object.keys(CONTAINER_DETAILS)
        .filter(key => {
            const details = CONTAINER_DETAILS[key];
            
            // Always allow containers that match the main category (Vault, Cave, Ruins)
            if (details.types.includes(mapCategory)) return true;
            
            // Special case for Ruins/Interior: If in a Ruins or Interior map, allow containers tagged Interior/Ruins
            if (mapCategory === 'Ruins' && details.types.includes('Ruins')) return true;
            if (mapCategory === 'Ruins' && details.types.includes('Interior')) return true;

            // If in a Cave, only allow things specifically tagged Cave (prevents Dumpster spawn)
            if (mapCategory === 'Cave' && !details.types.includes('Cave')) return false;

            // Fallback for Interior: If mapTheme is an interior archetype (like MEDICAL/RETAIL), filter for things
            // that belong inside, ignoring the original sector type. (e.g., Desk/Locker)
            if (mapTheme !== 'VAULT' && mapCategory !== 'Cave' && details.types.includes('Interior')) return true;

            return false;
        })
        .filter((key, index, self) => self.indexOf(key) === index); // Remove duplicates
    
    // 3. Fail-safe check: If the filter produced nothing, default to universal survival junk.
    if (allowedContainerKeys.length === 0) {
        log(`FATAL: Filtered container list is empty for ${mapTheme}. Defaulting to Junk Crates.`, '#ef4444');
        allowedContainerKeys = ["Crate", "Corpse", "Sack"];
    }
    // FIX END
    
    // Use 'ruins' pool for interiors in terms of actual item names
    const itemPoolKey = (type === 'interior') ? 'ruins' : type;

    let zoomModifier = (config.gridSize <= 16) ? 0.8 : 1.0;

    for (let x = 1; x < config.cols - 1; x++) {
        for (let y = 1; y < config.rows - 1; y++) {
            if (data.grid[x][y] === 1 && !isOccupied(data, x, y)) {
                let wallCount = getWallCount(data.grid, x, y);
                let chance = (mapTheme === 'VAULT' || mapTheme === 'RUINS' || mapTheme === 'INTERIOR')	
                    ? (wallCount > 0 ? 0.06 : 0.005)	
                    : 0.03;
                
                chance = chance * zoomModifier;

                if (Math.random() < chance) {
                    const cName = allowedContainerKeys[Math.floor(Math.random() * allowedContainerKeys.length)];
                    const details = CONTAINER_DETAILS[cName];
                    
                    // Determine lock difficulty (Rule B)
                    let lockDetail = "";
                    let isLocked = details.lock && Math.random() < 0.6; // 60% chance to be locked if lockable
                    
                    if (isLocked) {
                        const difficulty = getLockDifficulty(details.lootFocus);
                        const skill = (cName.includes("File Cabinet")) ? "SCIENCE" : "LOCKPICK";
                        lockDetail = `[${skill}: ${difficulty}] `;
                    }

                    // Generate contents using mandatory focus
                    const numItems = Math.floor(Math.random() * 3) + 1;
                    let contentArray = [];
                    // 1. Ensure the first item meets the mandatory focus (Rule A check passed through here)
                    contentArray.push(pickWeightedItem(itemPoolKey, details.lootFocus, isLocked));

                    // 2. Fill remaining slots with general items
                    for(let i=1; i<numItems; i++) {	
                        contentArray.push(pickWeightedItem(itemPoolKey, null, isLocked));
                    }
                    
                    data.loot.push({	
                        x,	
                        y,	
                        containerName: cName,	
                        contents: contentArray,	
                        looted: false,
                        isLocked: isLocked, // New state for locking
                        lockDetail: lockDetail	
                    });
                }
            }
        }
    }
}

function generateDecorations(data, type, density) {
    let baseChance = density / 1000;	
    if (type !== 'vault') baseChance = baseChance * 0.7;	

    // Determine indoors/outdoors status
    const isIndoors = (type === 'vault' || type === 'interior' || currentLevelIndex < 0);

    // Dynamic pool selection based on map type and level
    let poolKey = '';
    if (type === 'cave') {
        poolKey = (currentLevelIndex >= 0) ? 'wasteland_surface' : 'wasteland_cave';
    } else if (type === 'ruins') {
        poolKey = (currentLevelIndex >= 0) ? 'city_street' : 'city_interior';
    } else if (type === 'vault') {
        poolKey = 'vault';
    } else if (type === 'interior') {
        const parentType = floorData[currentLevelIndex]?.mapType || 'ruins';	
        poolKey = (parentType === 'cave') ? 'wasteland_cave' : 'city_interior';
    } else {
        poolKey = 'city_interior'; // Default fallback
    }

    let pool = DECO_POOLS[poolKey] || DECO_POOLS.vault;
    
    // Stricter filtering based on indoors/outdoors
    if (isIndoors) {
        // Must not appear indoors
        pool = pool.filter(d => !['joshua_tree', 'brahmin_skull', 'boulder', 'car', 'tire_pile', 'traffic_cone', 'broken_pole', 'street_sign'].includes(d));
    } else {
        // Must not appear outdoors
        pool = pool.filter(d => !['server_rack', 'vr_pod', 'wall_terminal', 'vent_grate', 'filing_cabinet', 'diner_booth', 'auto_doc', 'blood_stain'].includes(d));
    }
    
    // Common decorations acceptable almost anywhere
    const COMMON_DECOS = ['fire_barrel', 'radio', 'skeleton', 'rubble', 'crate'];

    // Ensure Vending Machines and Fire Barrels work indoors/outdoors
    if ((poolKey.includes('city') || poolKey.includes('vault')) && !pool.includes('vending_machine')) {
         pool.push('vending_machine');
    }
    if ((poolKey.includes('wasteland') || poolKey.includes('city_street')) && !pool.includes('fire_barrel')) {
         pool.push('fire_barrel');
    }


    if (type === 'vault') {
        // Existing Vault overhead light generation logic
        for(let r of data.rooms) {
            if (Math.random() > 0.3) {
                data.decorations.push({x: Math.floor(r.x + r.w/2), y: Math.floor(r.y + r.h/2), type: 'overhead_light'});
            }
        }
    }

    for (let x = 1; x < config.cols - 1; x++) {
        for (let y = 1; y < config.rows - 1; y++) {
            if (data.grid[x][y] === 1 && Math.random() < baseChance && !isOccupied(data, x, y)) {
                
                let decoType = pool[Math.floor(Math.random() * pool.length)];
                
                // --- Specific Chance Weighting (existing logic preserved) ---
                if (decoType === 'radio' && Math.random() > 0.05) continue;	
                if (decoType === 'gore_bag' && Math.random() > 0.1) continue;
                if (decoType === 'campfire' && Math.random() > 0.3) continue;	
                if (decoType === 'fire_barrel' && Math.random() > 0.4) continue;	
                if (decoType === 'server_rack' && Math.random() > 0.15) continue;
                if (decoType === 'vr_pod' && Math.random() > 0.15) continue;
                if (decoType === 'auto_doc' && Math.random() > 0.05) continue;
                // ------------------------------------------------------------
                
                data.decorations.push({x, y, type: decoType});
                
                if (['joshua_tree', 'rubble', 'glowing_fungus', 'server_rack'].includes(decoType)) {
                    if (Math.random() < 0.4) {	
                        let nx = x + (Math.random() > 0.5 ? 1 : -1);
                        let ny = y + (Math.random() > 0.5 ? 1 : -1);
                        if (data.grid[nx][ny] === 1 && !isOccupied(data, nx, ny)) {
                             data.decorations.push({x: nx, y: ny, type: decoType});
                        }
                    }
                }
            }
        }
    }
}

function isOccupied(data, x, y) {
    for(let s of data.stairs) if(s.x === x && s.y === y) return true;
    for(let l of data.loot) if(l.x === x && l.y === y) return true;
    if (data.exit && data.exit.x === x && data.exit.y === y) return true;
    for(let d of data.doors) if(d.x === x && d.y === y) return true;
    for(let d of data.decorations) if(d.x === x && d.y === y) return true;
    return false;
}

function getSmartName(category, sourceName) {
    const candidates = NAMES[category];
    if (!candidates) return "UNKNOWN SECTOR";
    if (!sourceName) return candidates[Math.floor(Math.random() * candidates.length)];
    let bestName = candidates[0];
    let bestScore = -Infinity;
    const sourceLogic = ROOM_LOGIC[sourceName] || { tags: [] };
    const sourceTags = sourceLogic.tags || [];
    const linkTarget = sourceLogic.link;
    for(let i=0; i<15; i++) {
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        const logic = ROOM_LOGIC[candidate] || { tags: [], avoid: [] };
        let score = 0;
        const isSourceClean = sourceTags.includes("Clean");
        const isCandDirty = logic.tags && logic.tags.includes("Dirty");
        if (isSourceClean && isCandDirty) score -= 100;
        if (linkTarget === candidate) score += 50;
        if (logic.link === sourceName) score += 50;
        if (logic.avoid) { for(let avoidTag of logic.avoid) { if (sourceTags.includes(avoidTag)) score -= 50; } }
        if (candidate === "Entrance Airlock" && currentLevelIndex !== 0) score -= 1000;
        if (candidate === "Reactor Core" && currentLevelIndex > -2) score -= 50;
        if (candidate === "Penthouse" && currentLevelIndex < 2) score -= 100;
        score += Math.random() * 20;
        if (score > bestScore) { bestScore = score; bestName = candidate; }
    }
    return bestName;
}

function generateVault(data, density, anchors) {
    data.grid = Array(config.cols).fill().map(() => Array(config.rows).fill(0));
    const targetRoomCount = Math.floor(density / 3) + 5;	
    const rooms = []; const BUFFER = 2;	
    
    anchors.forEach(anchor => {	
        const room = { x: Math.max(1, Math.min(config.cols - 6 - 1, anchor.x - 3)), y: Math.max(1, Math.min(config.rows - 6 - 1, anchor.y - 3)), w: 6, h: 6, visited: true };	
        createRoom(data.grid, room, config);	
        const name = getSmartName('vault', anchor.upperName);	
        room.name = name;
        const safeSpot = findSafeLabelSpot(room.x, room.y, room.w, room.h, name, data.stairs);
        addLabelToData(data, safeSpot.x, safeSpot.y, name);
        rooms.push(room); data.rooms.push(room);	
    });
    
    for (let i = 0; i < rooms.length - 1; i++) createCorridor(data.grid, rooms[i].x + 3, rooms[i].y + 3, rooms[i+1].x + 3, rooms[i+1].y + 3, config);
    
    if (currentLevelIndex === 0 && anchors.length === 0) {
         const entryRoom = { x: Math.floor(config.cols/2)-3, y: config.rows-8, w: 6, h: 6, visited: true, name: "ENTRANCE AIRLOCK (START)" };
         createRoom(data.grid, entryRoom, config);
         addLabelToData(data, entryRoom.x + 3, entryRoom.y + 3, "ENTRANCE AIRLOCK (START)");
         rooms.push(entryRoom); data.rooms.push(entryRoom);
         data.doors.push({x: Math.floor(entryRoom.x + 3), y: entryRoom.y + 6, locked: true, keyColor: '#3b82f6'});	
    }

    let attempts = 0;
    const maxAttempts = 1000;
    while (rooms.length < targetRoomCount && attempts < maxAttempts) {	
        attempts++;
        let w = Math.floor(Math.random() * 7) + 4;	
        let h = Math.floor(Math.random() * 7) + 4;	
        let x, y;
        let sourceRoom = null;
        if (rooms.length > 0) {	
            sourceRoom = rooms[Math.floor(Math.random() * rooms.length)];	
            const dir = Math.floor(Math.random() * 4);	
            const dist = Math.floor(Math.random() * 6) + 3;	
            x = sourceRoom.x; y = sourceRoom.y;	
            if(dir === 0) y -= (dist + h); if(dir === 1) x += (sourceRoom.w + dist); if(dir === 2) y += (sourceRoom.h + dist); if(dir === 3) x -= (dist + w);
        } else { x = Math.floor(Math.random() * (config.cols - w - 2)) + 1; y = Math.floor(Math.random() * (config.rows - h - 2)) + 1; }

        x = Math.max(BUFFER, Math.min(config.cols - w - BUFFER, x)); y = Math.max(BUFFER, Math.min(config.rows - h - BUFFER, y));	
        const newRoom = { x, y, w, h, visited: false };	
        let failed = false;	
        for (let other of rooms) {
            if (x < other.x + other.w + BUFFER && x + w + BUFFER > other.x && y < other.y + other.h + BUFFER && y + h + BUFFER > other.y) { failed = true; break; }
        }

        if (!failed) {	
            createRoom(data.grid, newRoom, config);	
            let roomName = getRoomDecision('VAULT', rooms, sourceRoom ? sourceRoom.name : null);
            if (roomName === "Entrance Airlock" && currentLevelIndex !== 0) roomName = "Storage Closet";
            newRoom.name = roomName;
            const safeSpot = findSafeLabelSpot(newRoom.x, newRoom.y, newRoom.w, newRoom.h, roomName, data.stairs);
            addLabelToData(data, safeSpot.x, safeSpot.y, roomName);	
            if (sourceRoom) {	
                createCorridor(data.grid, sourceRoom.x + Math.floor(sourceRoom.w/2), sourceRoom.y + Math.floor(sourceRoom.h/2), newRoom.x + Math.floor(newRoom.w/2), newRoom.y + Math.floor(newRoom.h/2), config);	
            }	
            rooms.push(newRoom); data.rooms.push(newRoom);	
        }
    }
}

function generateRuins(data, density, anchors) {
    const buildings = []; const BUFFER = 3; const maxRandomLabels = 4;
    if (currentLevelIndex < 0) {
        data.grid = Array(config.cols).fill().map(() => Array(config.rows).fill(0));	
        let placedLinkedLabels = 0;
        let selectedThemeKey = 'industrial';	
        let foundSmartTheme = false;
        if (anchors.length > 0 && anchors[0].upperName) {
            const up = anchors[0].upperName.toUpperCase();
            if (up.includes("HOME") || up.includes("HOUSE") || up.includes("APARTMENT") || up.includes("BODEGA") || up.includes("HOTEL")) { selectedThemeKey = 'residential'; foundSmartTheme = true; }	
            else if (up.includes("STREET") || up.includes("HUB") || up.includes("PARK") || up.includes("ALLEY")) { selectedThemeKey = 'sewer'; foundSmartTheme = true; }	
            else if (up.includes("FACTORY") || up.includes("PLANT") || up.includes("POWER") || up.includes("ROCKET") || up.includes("SHOP") || up.includes("STORE") || up.includes("TRANSIT")) { selectedThemeKey = 'industrial'; foundSmartTheme = true; }	
            else if (up.includes("CHURCH") || up.includes("GRAVE") || up.includes("HOSPITAL") || up.includes("BANK")) { selectedThemeKey = 'creepier'; foundSmartTheme = true; }
        }
        if (!foundSmartTheme) {
            const themes = Object.keys(SUB_THEMES);
            selectedThemeKey = themes[Math.floor(Math.random() * themes.length)];
        }
        const allowedRooms = SUB_THEMES[selectedThemeKey];
        log(`SUB-LEVEL THEME: ${selectedThemeKey.toUpperCase()}`, 'var(--pip-amber)');

        anchors.forEach(anchor => {
            const w = Math.floor(Math.random() * 4) + 4; const h = Math.floor(Math.random() * 4) + 4;
            let x = Math.max(BUFFER, Math.min(config.cols - w - BUFFER, anchor.x - Math.floor(w/2)));	
            let y = Math.max(BUFFER, Math.min(config.rows - h - BUFFER, anchor.y - Math.floor(h/2)));	
            const newBuilding = { x, y, w, h, visited: true };	
            for (let bx = x; bx < x + w; bx++) for (let by = y; by < y + h; by++) data.grid[bx][by] = 1;	
            const safeSpot = findSafeLabelSpot(x, y, w, h, "Ruins", data.stairs);
            const roomName = allowedRooms[Math.floor(Math.random() * allowedRooms.length)];
            newBuilding.name = roomName;
            addLabelToData(data, safeSpot.x, safeSpot.y, roomName);	
            buildings.push(newBuilding); data.rooms.push(newBuilding); placedLinkedLabels++;
        });
        if (buildings.length > 1) for (let i = 1; i < buildings.length; i++) createCorridor(data.grid, buildings[i-1].x+2, buildings[i-1].y+2, buildings[i].x+2, buildings[i].y+2, config);
        addRandomLabels(data, allowedRooms, maxRandomLabels - placedLinkedLabels, anchors);
    } else {
        data.grid = Array(config.cols).fill().map(() => Array(config.rows).fill(1));	
        for (let x = 0; x < config.cols; x++) { data.grid[x][0] = 0; data.grid[x][config.rows - 1] = 0; }
        for (let y = 0; y < config.rows; y++) { data.grid[0][y] = 0; data.grid[config.cols - 1][y] = 0; }
        
        const numBuildings = Math.floor(density / 3) + 5;
        let buildingsPlaced = 0;
        let bAttempts = 0;
        
        while (buildingsPlaced < numBuildings && bAttempts < 1000) {	
            bAttempts++;
            const w = Math.floor(Math.random() * 6) + 3; const h = Math.floor(Math.random() * 6) + 3;	
            let x = Math.floor(Math.random() * (config.cols - w - BUFFER * 2)) + BUFFER;	
            let y = Math.floor(Math.random() * (config.rows - h - BUFFER * 2)) + BUFFER;	
            let failed = false;
            for (let other of buildings) if (x < other.x + other.w + BUFFER && x + w + BUFFER > other.x && y < other.y + other.h + BUFFER && y + h + BUFFER > other.y) failed = true;	
            for(let anchor of anchors) if (x < anchor.x + 1 && x + w > anchor.x && y < anchor.y + 1 && y + h > anchor.y) failed = true;	
            if(!failed) {
                for (let bx = x; bx < x + w; bx++) for (let by = y; by < y + h; by++) data.grid[bx][by] = 0;	
                
                const name = getRandomName('ruins_street');
                const safeSpot = findSafeLabelSpot(x, y, w, h, name, data.stairs);
                addLabelToData(data, safeSpot.x, safeSpot.y, name);	
                const bObj = { x, y, w, h, name, visited: true };	
                buildings.push(bObj); data.rooms.push(bObj);
                data.doors.push({ x: Math.floor(x + w/2), y: y + h, locked: false });
                buildingsPlaced++;
            }
        }
    }
}

function generateCaves(data, density, anchors) {
    // 1. Cellular Automata Generation
    for (let x = 0; x < config.cols; x++) for (let y = 0; y < config.rows; y++) data.grid[x][y] = (x === 0 || x === config.cols - 1 || y === 0 || y === config.rows - 1) ? 0 : (Math.random() * 100 < density) ? 1 : 0;
    for (let i = 0; i < 4; i++) {	
        let newGrid = JSON.parse(JSON.stringify(data.grid));	
        for (let x = 1; x < config.cols - 1; x++) for (let y = 1; y < config.rows - 1; y++) {	
            let neighbors = getWallCount(data.grid, x, y);	
            if (neighbors > 4) newGrid[x][y] = 0; else if (neighbors < 4) newGrid[x][y] = 1;	
        }	
        data.grid = newGrid;	
    }
    
    // 2. Ensure Anchors are Clear
    anchors.forEach(anchor => { for(let dx = -2; dx <= 2; dx++) for(let dy = -2; dy <= 2; dy++) if (anchor.x+dx > 0 && anchor.x+dx < config.cols-1 && anchor.y+dy > 0 && anchor.y+dy < config.rows-1) data.grid[anchor.x+dx][anchor.y+dy] = 1; });
    
    // 3. CONNECTIVITY FIX (Flood Fill + Tunneling)
    const visited = new Set();
    const regions = [];
    
    for (let x = 1; x < config.cols - 1; x++) {
        for (let y = 1; y < config.rows - 1; y++) {
            if (data.grid[x][y] === 1 && !visited.has(`${x},${y}`)) {
                const region = [];
                const queue = [{x,y}];
                visited.add(`${x},${y}`);
                while(queue.length > 0) {
                    const curr = queue.pop();
                    region.push(curr);
                    const neighbors = [{x: curr.x+1, y: curr.y}, {x: curr.x-1, y: curr.y}, {x: curr.x, y: curr.y+1}, {x: curr.x, y: curr.y-1}];
                    for(let n of neighbors) {
                        if (n.x > 0 && n.x < config.cols-1 && n.y > 0 && n.y < config.rows-1 && data.grid[n.x][n.y] === 1 && !visited.has(`${n.x},${n.y}`)) {
                            visited.add(`${n.x},${n.y}`);
                            queue.push(n);
                        }
                    }
                }
                regions.push(region);
            }
        }
    }

    regions.sort((a, b) => b.length - a.length);
    
    if (regions.length > 1) {
        const mainRegion = regions[0];
        for (let i = 1; i < regions.length; i++) {
            const targetRegion = regions[i];
            let minDistance = Infinity;
            let startPoint = null;
            let endPoint = null;
            
            const targetPt = targetRegion[Math.floor(targetRegion.length/2)];
            for (let mainPt of mainRegion) {
                const d = Math.abs(mainPt.x - targetPt.x) + Math.abs(mainPt.y - targetPt.y);
                if (d < minDistance) {
                    minDistance = d;
                    startPoint = mainPt;
                    endPoint = targetPt;
                }
            }
            
            if (startPoint && endPoint) {
                createCorridor(data.grid, startPoint.x, startPoint.y, endPoint.x, endPoint.y, config);
            }
        }
    }
    
    addRandomLabels(data, currentLevelIndex < 0 ? 'cave_underground' : 'cave_surface', 4, anchors);
}

function addRandomLabels(data, source, count, anchors) {
    let attempts = 0, placed = 0;	
    const hasOasis = Math.random() < 0.25;	
    
    while (placed < count && attempts < 100) {	
        const rx = Math.floor(Math.random() * (config.cols - 2)) + 1;	
        const ry = Math.floor(Math.random() * (config.rows - 2)) + 1;	
        
        if (data.grid[rx][ry] === 1) {	
            let safe = true; for(let a of anchors) if(Math.abs(rx - a.x) < 3 && Math.abs(ry - a.y) < 3) safe = false;
            if (safe) {	
                let name = getRandomName(source);
                
                if (hasOasis && placed === 0) {
                    name = "Hidden Oasis";
                    for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) {
                        if (rx+dx>0 && rx+dx<config.cols-1 && ry+dy>0 && ry+dy<config.rows-1 && data.grid[rx+dx][ry+dy] === 1) {
                            data.grid[rx+dx][ry+dy] = 2; // Water ID
                        }
                    }
                }

                addLabelToData(data, rx, ry, name);	
                data.rooms.push({x: rx-2, y: ry-2, w: 5, h: 5, visited: false, name: "Area"});
                placed++;	
            }	
        }	
        attempts++;	
    }
}

function addLabelToData(data, gridX, gridY, text) {
    data.labels.push({ x: gridX * config.gridSize + (config.gridSize/2), y: gridY * config.gridSize + (config.gridSize/2), text: text, visible: true });
}

function createRoom(grid, room, conf) { for (let x = room.x; x < room.x + room.w; x++) for (let y = room.y; y < room.y + room.h; y++) if (x < conf.cols && y < conf.rows) grid[x][y] = 1; }
function createCorridor(grid, x1, y1, x2, y2, conf) { let x = x1; let y = y1; while (x !== x2) { if (x < conf.cols && y < conf.rows) { grid[x][y] = 1; grid[x][y+1] = 1; } x += (x < x2) ? 1 : -1; } while (y !== y2) { if (x < conf.cols && y < conf.rows) { grid[x][y] = 1; grid[x+1][y] = 1; } y += (y < y2) ? 1 : -1; } }
function getWallCount(grid, gridX, gridY) { let wallCount = 0; for (let neighborX = gridX - 1; neighborX <= gridX + 1; neighborX++) for (let neighborY = gridY - 1; neighborY <= gridY + 1; neighborY++) if (neighborX >= 0 && neighborX < grid.length && neighborY >= 0 && neighborY < grid[0].length) { if (grid[neighborX][neighborY] === 0) wallCount++; } else { wallCount++; } return wallCount; }

function getRandomName(source) {	
    const list = Array.isArray(source) ? source : NAMES[source];	
    if (list) return list[Math.floor(Math.random() * list.length)];	
    return "UNKNOWN SECTOR";	
}

function findSafeLabelSpot(roomX, roomY, roomW, roomH, text, stairs) { return { x: Math.floor(roomX + roomW/2), y: Math.floor(roomY + roomH/2) }; }	

const ITEM_DATABASE = {
    // UPDATED ITEM DATABASE (V.29.1)
    vault: [	
        {n: "Bobby Pin", v: 1}, {n: "Scalpel", v: 2}, {n: "Abraxo cleaner", v: 5}, {n: "Rad-X", v: 5},	
        {n: "Jumpsuit", v: 8}, {n: "Pre-War Money", v: 10}, {n: "Conductor", v: 15}, {n: "Fission Battery", v: 20},	
        {n: "Sensor Module", v: 20}, {n: "Stimpak", v: 25}, {n: "Doctor's Bag", v: 25}, {n: "Fixer", v: 25},	
        {n: "Baton", v: 25}, {n: "Radaway", v: 35}, {n: "Super Stimpak", v: 50}, {n: "Skill Book", v: 50},	
        {n: "Security Armor", v: 70}, {n: "Power Fist", v: 100}, {n: "Hypo", v: 75}, {n: "Trauma Pack", v: 100},
        {n: "Laser Pistol", v: 200}, {n: "10mm Pistol", v: 250}, {n: "Mini-Nuke", v: 250}, {n: "Stealth Boy", v: 500},	
        {n: "Pip-Boy", v: 1000}	
    ],
    ruins: [	
        {n: "Tin Can", v: 1}, {n: "Bobby Pin", v: 1}, {n: "Empty Syringe", v: 2}, {n: "Coffee Pot", v: 3},	
        {n: "Abraxo cleaner", v: 5}, {n: "Duct Tape", v: 5}, {n: "Scrap Metal", v: 5}, {n: "Jet", v: 5},	
        {n: "Pre-War Hat", v: 6}, {n: "Turpentine", v: 8}, {n: "Pre-War Suit", v: 8}, {n: "Lunchbox", v: 10},	
        {n: "Pre-War Money", v: 10}, {n: "Vacuum", v: 10}, {n: "Paint Gun", v: 10}, {n: "Cigarettes", v: 10},	
        {n: "Wonderglue", v: 15}, {n: "Psycho", v: 15}, {n: "Buffout", v: 15}, {n: "Mentats", v: 15},	
        {n: "Nuka-Cola", v: 20}, {n: "Alcohol", v: 20}, {n: "Brass Knuckles", v: 20}, {n: "Gas Tank", v: 25},	
        {n: "Stimpak", v: 25}, {n: "Molotov", v: 25}, {n: "Switchblade", v: 25}, {n: "Psycho-D", v: 30},
        {n: "Radaway", v: 35}, {n: "Super Stimpak", v: 50}, {n: "Leather Jacket", v: 50}, {n: "Baseball Bat", v: 55},	
        {n: "Quantum", v: 100}, {n: "Raider Armor", v: 180}, {n: "Laser Pistol", v: 200}, {n: "10mm SMG", v: 300},	
        {n: "Shotgun", v: 370}	
    ],
    cave: [	
        {n: "Bobby Pin", v: 1}, {n: "Antidote", v: 2}, {n: "Broc Flower", v: 3}, {n: "Xander Root", v: 3},	
        {n: "Fruit", v: 3}, {n: "Antivenom", v: 5}, {n: "Healing Powder", v: 5}, {n: "Poultice", v: 5},	
        {n: "Meat", v: 5}, {n: "Fungus", v: 5}, {n: "Outfit", v: 6}, {n: "Tribal Garb", v: 6},	
        {n: "Dirty Water", v: 10}, {n: "Water", v: 20}, {n: "Armor", v: 15}, {n: "Dynamite", v: 25},	
        {n: "Stimpak", v: 25}, {n: "Meat (Cooked)", v: 30}, {n: "Radaway", v: 35}, {n: "Deathclaw Hand", v: 45},	
        {n: "Skill Book", v: 50}, {n: "Machete", v: 50}, {n: "Merc Outfit", v: 50}, {n: "Pipe Rifle", v: 50},	
        {n: "Power Fist", v: 100}, {n: ".32 Hunting Rifle", v: 150}, {n: "Leather Armor", v: 160}, {n: "Sniper Rifle", v: 320}	
    ]
};

// --- MISSING NAMES DEFINITION ADDED HERE ---
const NAMES = {
    ruins_street: [	
        "Casino Lobby", "Transit Hub", "Ruined Bodega", "Barricaded Street",	
        "Sniper Nest", "Crater Edge", "Gang Hideout", "Corporate Bullpen",	
        "Hospital ER", "Bank Vault", "Movie Theater", "Police Precinct",	
        "Public Park", "Dead End Alley", "Highway Overpass", "Penthouse",	
        "Speakeasy", "Fire Station", "Power Substation", "Catwalk",	
        "Pawn Shop", "Chem Den", "Radio Tower", "Hotel Ballroom",
        "Bombed-Out Apartment", "Makeshift Clinic", "Raider Fighting Pit",
        "Collapsed Subway", "Nuka-Cola Billboard", "Super Mutant Stronghold", "Slave Pen"
    ],
    cave_surface: [	
        "Radscorpion Burrow", "Raider Camp", "Red Rocket", "Farmhouse",	
        "Relay Tower", "Cave Entrance", "Canyon Pass", "Factory Ruin",	
        "Train Wreck", "Campsite", "Mine Entrance", "Tar Pit", "Checkpoint",	
        "Drive-In Theater", "Scrapyard", "Crashed B-29", "Satellite Array",	
        "Hunting Lodge", "Cliff Edge", "Rope Bridge", "Dried Riverbed",	
        "Tribal Village", "Brahmin Pen", "Wind Farm", "Solar Array",	
        "Ranger Outpost", "Vertibird Crash", "Nuka-Cola Truck Wreck",	
        "Mysterious Cave", "Gecko Hunting Grounds", "Coyote Den", "Sulfur Pits",
        "Hermit's Shack", "Tribal Altar", "Prospector Camp"
    ],
    cave_underground: [	
        "Cave Den", "Mine Shaft", "Underground Spring", "Collapsed Tunnel",	
        "Fissure Wall", "Mushroom Grotto", "Sump Chamber", "Burial Site",	
        "Supply Cache", "Flooded Cavern", "Glowing Grove", "Ant Nest",	
        "Mole Rat Tunnels", "Underground Lake", "Crystal Formation", "Bat Roost",
        "Subterranean River", "Legendary Creature Den", "Queen's Nest"
    ]
};
// ---------------------------------------------


// --- 🎨 PROFESSIONAL GRAPHICS ENGINE ---

function createPixelPattern(colors, type) {
    const pCanvas = document.createElement('canvas');	
    const pCtx = pCanvas.getContext('2d');
    const size = 128; 
    pCanvas.width = size; pCanvas.height = size;
    
    // 1. Base Layer and Noise
    pCtx.fillStyle = colors.base;	
    pCtx.fillRect(0, 0, size, size);
    
    for(let i=0; i<800; i++) {
        pCtx.fillStyle = (Math.random() > 0.5) ? colors.dark : colors.light;
        pCtx.globalAlpha = 0.05;
        const x = Math.random()*size;
        const y = Math.random()*size;
        const w = Math.random()*2 + 1;
        pCtx.fillRect(x, y, w, w);
    }
    pCtx.globalAlpha = 1.0;

    if (type === 'vault' || type === 'interior_ruins') {
        // --- VAULT ENHANCEMENTS ---
        const spacing = 32;

        // A. Primary Grid Lines (Structural)
        pCtx.strokeStyle = colors.noise; // '#6f8179'
        pCtx.lineWidth = 1;
        pCtx.beginPath();
        for(let i=0; i<=size; i+=spacing) {
            pCtx.moveTo(i, 0); pCtx.lineTo(i, size);
            pCtx.moveTo(0, i); pCtx.lineTo(size, i);
        }
        pCtx.stroke();

        // B. Diamond Plate Texture (Diagonal Highlights)
        pCtx.strokeStyle = colors.light; // Highlights
        pCtx.lineWidth = 1;
        pCtx.globalAlpha = 0.4;
        pCtx.beginPath();
        for(let i=0; i<=size*2; i+=8) {
            // Diagonal Lines 1
            pCtx.moveTo(i, 0); pCtx.lineTo(0, i);
            // Diagonal Lines 2 (Opposite direction)
            pCtx.moveTo(size - i, 0); pCtx.lineTo(size, i);
        }
        pCtx.stroke();
        pCtx.globalAlpha = 1.0;

        // C. Rivets (Shadowed for depth)
        pCtx.fillStyle = colors.dark; 
        for(let y=0; y<=size; y+=spacing) {
            for(let x=0; x<=size; x+=spacing) {
                pCtx.fillRect(x-1, y-1, 3, 3);
            }
        }
        pCtx.fillStyle = colors.light; // Highlight dot
        for(let y=0; y<=size; y+=spacing) {
            for(let x=0; x<=size; x+=spacing) {
                pCtx.fillRect(x-1, y-2, 1, 1);
            }
        }

    } else if (type === 'cave') {
        // Organic Texture
        pCtx.fillStyle = colors.dark;
        pCtx.globalAlpha = 0.15;
        for(let i=0; i<20; i++) {
            pCtx.beginPath();
            pCtx.arc(Math.random()*size, Math.random()*size, Math.random()*15 + 5, 0, Math.PI*2);
            pCtx.fill();
        }
        pCtx.globalAlpha = 1.0;
   } else if (type === 'ruins') {
        // Enhanced Ruins: Cracks, Debris, and Road Markings
        
        // A. Major Cracks (Wider, more dramatic)
        pCtx.strokeStyle = colors.dark;
        pCtx.lineWidth = 2;
        pCtx.globalAlpha = 0.6;
        for(let i=0; i<8; i++) {
            pCtx.beginPath();
            let sx = Math.random()*size; 
            let sy = Math.random()*size;
            pCtx.moveTo(sx, sy);
            
            // Create branching cracks
            let segments = 3 + Math.floor(Math.random()*3);
            for(let j=0; j<segments; j++) {
                sx += (Math.random()-0.5)*30;
                sy += (Math.random()-0.5)*30;
                pCtx.lineTo(sx, sy);
            }
            pCtx.stroke();
        }
        
        // B. Fine Cracks (Spider-web detail)
        pCtx.lineWidth = 1;
        pCtx.globalAlpha = 0.3;
        for(let i=0; i<20; i++) {
            pCtx.beginPath();
            let sx = Math.random()*size; 
            let sy = Math.random()*size;
            pCtx.moveTo(sx, sy);
            pCtx.lineTo(sx + (Math.random()-0.5)*20, sy + (Math.random()-0.5)*20);
            pCtx.stroke();
        }
        
        // C. Debris/Dirt Stains
        pCtx.fillStyle = colors.dark;
        pCtx.globalAlpha = 0.2;
        for(let i=0; i<15; i++) {
            pCtx.beginPath();
            pCtx.arc(Math.random()*size, Math.random()*size, Math.random()*12 + 4, 0, Math.PI*2);
            pCtx.fill();
        }
        
        // D. Faded Road Markings (Dashed lines)
        pCtx.strokeStyle = colors.light;
        pCtx.lineWidth = 3;
        pCtx.globalAlpha = 0.15;
        pCtx.setLineDash([8, 12]);
        
        // Horizontal marking
        pCtx.beginPath();
        pCtx.moveTo(0, size/2);
        pCtx.lineTo(size, size/2);
        pCtx.stroke();
        
        // Vertical marking
        pCtx.beginPath();
        pCtx.moveTo(size/2, 0);
        pCtx.lineTo(size/2, size);
        pCtx.stroke();
        
        pCtx.setLineDash([]);
        
        // E. Rust Patches
        pCtx.fillStyle = '#8b4513'; // Rust brown
        pCtx.globalAlpha = 0.1;
        for(let i=0; i<10; i++) {
            const px = Math.random()*size;
            const py = Math.random()*size;
            const pr = Math.random()*10 + 5;
            pCtx.beginPath();
            pCtx.arc(px, py, pr, 0, Math.PI*2);
            pCtx.fill();
        }
        
        pCtx.globalAlpha = 1.0;
    }
    
    return ctx.createPattern(pCanvas, 'repeat');
}

function drawSprite(ctx, type, x, y, size, time) {
    const cx = x + size/2; const cy = y + size/2;
    
    // Enhanced Soft Shadow
    const shadowG = ctx.createRadialGradient(cx + 2, cy + size*0.4, 0, cx + 2, cy + size*0.4, size*0.3);
    shadowG.addColorStop(0, 'rgba(0,0,0,0.6)');
    shadowG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowG;
    ctx.fillRect(x, y + size*0.3, size, size*0.3);

    if (type === 'tree' || type === 'joshua_tree') {
        const trunkW = size*0.12;
        const trunkH = size*0.5;
        ctx.fillStyle = '#3e2723'; ctx.fillRect(cx-trunkW/2, y+size*0.4, trunkW, trunkH);
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy+size*0.1); ctx.lineTo(cx-size*0.2, cy-size*0.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy+size*0.2); ctx.lineTo(cx+size*0.2, cy-size*0.1); ctx.stroke();
        const cl = '#15803d'; const clH = '#22c55e';
        const drawClump = (bx, by, s) => {
            ctx.fillStyle = cl; ctx.beginPath(); ctx.arc(bx, by, s, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = clH; ctx.fillRect(bx-2, by-4, 4, 4);	
        };
        drawClump(cx, cy-size*0.2, size*0.25);
        drawClump(cx-size*0.2, cy-size*0.2, size*0.15);
        drawClump(cx+size*0.2, cy-size*0.1, size*0.15);
    }	
    else if (type === 'car') {
        ctx.fillStyle = '#7f1d1d';	
        ctx.fillRect(x+4, cy+2, size-8, size*0.25);	
        
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(x+8, cy+size*0.2, 8, 6);
        ctx.fillRect(x+size-16, cy+size*0.2, 8, 6);

        ctx.fillStyle = '#b91c1c';	
        ctx.beginPath(); ctx.moveTo(x+8, cy+2); ctx.lineTo(x+size*0.3, cy-size*0.2); ctx.lineTo(x+size*0.7, cy-size*0.2); ctx.lineTo(x+size-8, cy+2); ctx.fill();
        
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.moveTo(x+10, cy); ctx.lineTo(x+size*0.32, cy-size*0.15); ctx.lineTo(x+size*0.68, cy-size*0.15); ctx.lineTo(x+size-10, cy); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(x+14, cy); ctx.lineTo(x+18, cy-4); ctx.stroke(); ctx.globalAlpha = 1.0;
    }
    else if (type === 'rubble') {
        ctx.fillStyle = '#57534e';
        ctx.beginPath(); ctx.arc(cx-4, cy+4, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#78716c';
        ctx.beginPath(); ctx.arc(cx+4, cy+2, 6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#44403c';
        ctx.fillRect(cx-2, cy-6, 6, 6);
    }
    else if (type === 'tumbleweed') {
        ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 1;	
        ctx.beginPath();
        for(let i=0; i<12; i++) {	
            const angle = Math.random() * Math.PI * 2;
            const rad = Math.random() * size * 0.4;
            ctx.moveTo(cx + Math.cos(angle)*rad, cy + Math.sin(angle)*rad);
            ctx.lineTo(cx + Math.cos(angle + 2)*rad, cy + Math.sin(angle + 2)*rad);
        }
        ctx.stroke();
    }
    else if (type === 'bed') {
        ctx.fillStyle = '#737373';	
        ctx.fillRect(x+4, y+4, size-8, size-8);
        ctx.fillStyle = '#1d4ed8';	
        ctx.fillRect(x+4, y+size*0.4, size-8, size*0.6-4);
        ctx.fillStyle = '#fafafa';	
        ctx.fillRect(x+6, y+6, size-12, size*0.15);
    }
     else if (type === 'safe') {
        // Heavy metal safe
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x+size*0.2, y+size*0.2, size*0.6, size*0.7);
        
        // Door highlight
        ctx.fillStyle = '#334155';
        ctx.fillRect(x+size*0.2, y+size*0.2, size*0.6, size*0.05);
        
        // Lock dial
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(cx, cy, size*0.15, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx, cy, size*0.1, 0, Math.PI*2);
        ctx.fill();
        
        // Handle
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(cx+size*0.2, cy-2, size*0.15, 4);
    }
    else if (type === 'locker') {
        // Tall metal locker
        ctx.fillStyle = '#475569';
        ctx.fillRect(x+size*0.25, y, size*0.5, size*0.9);
        
        // Door lines
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x+size*0.25, y+size*0.3, size*0.5, 2);
        ctx.fillRect(x+size*0.25, y+size*0.6, size*0.5, 2);
        
        // Vents
        for(let i=0; i<5; i++) {
            ctx.fillRect(x+size*0.3, y+size*0.1 + i*4, size*0.4, 2);
        }
        
        // Handle
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(cx-2, cy, 4, size*0.15);
    }
    else if (type === 'toolbox') {
        // Red toolbox
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(x+size*0.2, y+size*0.4, size*0.6, size*0.45);
        
        // Top/lid
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(x+size*0.2, y+size*0.25, size*0.6, size*0.15);
        
        // Handle
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, y+size*0.25, size*0.15, Math.PI, 0);
        ctx.stroke();
        
        // Latch
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx-3, y+size*0.4, 6, 4);
    }
    else if (type === 'medkit' || type === 'first_aid') {
        // White medical box with red cross
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x+size*0.2, y+size*0.3, size*0.6, size*0.5);
        
        // Red cross
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(cx-2, cy-size*0.2, 4, size*0.4);
        ctx.fillRect(cx-size*0.15, cy-2, size*0.3, 4);
        
        // Handle
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cx-size*0.1, y+size*0.25, size*0.2, size*0.08);
    }
    else if (type === 'footlocker') {
        // Military footlocker
        ctx.fillStyle = '#14532d';
        ctx.fillRect(x+size*0.15, y+size*0.35, size*0.7, size*0.5);
        
        // Metal bands
        ctx.fillStyle = '#374151';
        ctx.fillRect(x+size*0.15, y+size*0.35, size*0.7, 3);
        ctx.fillRect(x+size*0.15, y+size*0.6, size*0.7, 3);
        ctx.fillRect(x+size*0.15, y+size*0.82, size*0.7, 3);
        
        // Lock
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx-4, cy, 8, 6);
    }
    else if (type === 'file_cabinet') {
        // Office file cabinet
        ctx.fillStyle = '#64748b';
        ctx.fillRect(x+size*0.25, y+size*0.1, size*0.5, size*0.8);
        
        // Drawers
        for(let i=0; i<3; i++) {
            const dy = y+size*0.15 + i*size*0.25;
            ctx.fillStyle = '#475569';
            ctx.fillRect(x+size*0.25, dy, size*0.5, 2);
            
            // Handles
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(cx-6, dy+4, 12, 3);
        }
    }
    else if (type === 'desk') {
        // Office desk - existing code is good, keeping it
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x+2, y+size*0.4, size-4, size*0.3);
        ctx.fillStyle = '#a16207'; 
        ctx.fillRect(x+2, y+size*0.4, size-4, 2);	
        ctx.fillStyle = '#451a03';
        ctx.fillRect(x+2, y+size*0.7, 6, size*0.2);
        ctx.fillRect(x+size-8, y+size*0.7, 6, size*0.2);
    }
    else if (type === 'ammo_box') {
        // Military ammo crate
        ctx.fillStyle = '#14532d';
        ctx.fillRect(x+size*0.2, y+size*0.4, size*0.6, size*0.45);
        
        // Yellow warning stripe
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x+size*0.2, y+size*0.55, size*0.6, size*0.08);
        
        // Stencil text effect
        ctx.fillStyle = '#052e16';
        ctx.fillRect(x+size*0.25, y+size*0.45, 3, 6);
        ctx.fillRect(x+size*0.35, y+size*0.45, 3, 6);
        ctx.fillRect(x+size*0.45, y+size*0.45, 3, 6);
        
        // Handles
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x+size*0.25, y+size*0.4);
        ctx.lineTo(x+size*0.25, y+size*0.35);
        ctx.lineTo(x+size*0.35, y+size*0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x+size*0.75, y+size*0.4);
        ctx.lineTo(x+size*0.75, y+size*0.35);
        ctx.lineTo(x+size*0.65, y+size*0.35);
        ctx.stroke();
    }
    else if (type === 'duffel_bag') {
        // Canvas duffel bag
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.ellipse(cx, cy+size*0.1, size*0.35, size*0.25, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Bag body
        ctx.fillStyle = '#57534e';
        ctx.fillRect(x+size*0.25, cy, size*0.5, size*0.35);
        
        // Strap
        ctx.strokeStyle = '#44403c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy-size*0.1, size*0.2, 0.3, Math.PI-0.3);
        ctx.stroke();
    }
    else if (type === 'corpse') {
        // Skeleton corpse (reusing existing skeleton code)
        ctx.fillStyle = '#e5e5e5';
        ctx.beginPath(); 
        ctx.arc(cx, cy-2, size*0.12, 0, Math.PI*2); 
        ctx.fill();	
        ctx.fillStyle = '#000'; 
        ctx.fillRect(cx-2, cy-3, 1, 1); 
        ctx.fillRect(cx+1, cy-3, 1, 1);	
        ctx.strokeStyle = '#e5e5e5'; 
        ctx.lineWidth=2;
        ctx.beginPath(); 
        ctx.moveTo(cx-3, cy+2); 
        ctx.lineTo(cx+3, cy+2); 
        ctx.stroke();
        ctx.beginPath(); 
        ctx.moveTo(cx-3, cy+5); 
        ctx.lineTo(cx+3, cy+5); 
        ctx.stroke();
        
        // Add some bones scattered around
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(cx+4, cy+3, 6, 2);
        ctx.fillRect(cx-8, cy+6, 5, 2);
    }
    else if (type === 'sack') {
        // Burlap sack
        ctx.fillStyle = '#a16207';
        ctx.beginPath();
        ctx.ellipse(cx, cy+size*0.2, size*0.3, size*0.35, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Tie at top
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy-size*0.05, size*0.15, Math.PI, 0);
        ctx.stroke();
        
        // Texture lines
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1;
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            ctx.moveTo(cx-size*0.25, cy+i*4);
            ctx.lineTo(cx+size*0.25, cy+i*4);
            ctx.stroke();
        }
    }
    else if (type === 'hollow_rock') {
        // Rock with dark opening
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.ellipse(cx, cy, size*0.4, size*0.3, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Darker opening/shadow
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.ellipse(cx, cy, size*0.2, size*0.15, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Highlight
        ctx.fillStyle = '#a8a29e';
        ctx.beginPath();
        ctx.ellipse(cx-size*0.15, cy-size*0.1, size*0.1, size*0.08, 0, 0, Math.PI*2);
        ctx.fill();
    }
    else if (type === 'dumpster') {
        // Large trash dumpster
        ctx.fillStyle = '#14532d';
        ctx.fillRect(x+size*0.1, y+size*0.3, size*0.8, size*0.55);
        
        // Lid (slightly open)
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.moveTo(x+size*0.1, y+size*0.3);
        ctx.lineTo(x+size*0.2, y+size*0.15);
        ctx.lineTo(x+size*0.9, y+size*0.15);
        ctx.lineTo(x+size*0.9, y+size*0.3);
        ctx.fill();
        
        // Wheels
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x+size*0.25, y+size*0.88, size*0.08, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x+size*0.75, y+size*0.88, size*0.08, 0, Math.PI*2);
        ctx.fill();
    }
    else if (type === 'register' || type === 'cashier') {
        // Cash register
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x+size*0.2, y+size*0.4, size*0.6, size*0.4);
        
        // Display screen
        ctx.fillStyle = '#14532d';
        ctx.fillRect(x+size*0.25, y+size*0.25, size*0.5, size*0.2);
        
        // Green display glow
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x+size*0.28, y+size*0.28, size*0.44, size*0.14);
        
        // Keys
        ctx.fillStyle = '#e2e8f0';
        for(let row=0; row<2; row++) {
            for(let col=0; col<3; col++) {
                ctx.fillRect(x+size*0.25 + col*size*0.15, y+size*0.5 + row*size*0.12, size*0.1, size*0.08);
            }
        }
        
        // Cash drawer
        ctx.fillStyle = '#475569';
        ctx.fillRect(x+size*0.2, y+size*0.75, size*0.6, size*0.1);
    }
    else if (type === 'cooler') {
        // Ice chest/cooler
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(x+size*0.15, y+size*0.35, size*0.7, size*0.5);
        
        // White lid
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x+size*0.15, y+size*0.25, size*0.7, size*0.12);
        
        // Handle
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, y+size*0.25, size*0.15, Math.PI, 0);
        ctx.stroke();
        
        // Latch
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx-4, y+size*0.35, 8, 4);
    }
    else if (type === 'doctors_bag') {
        // Classic doctor's bag
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath();
        ctx.ellipse(cx, cy+size*0.1, size*0.35, size*0.3, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Brass clasp
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx-size*0.15, cy-size*0.1, size*0.3, size*0.08);
        
        // Handle
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy-size*0.15, size*0.2, 0.5, Math.PI-0.5);
        ctx.stroke();
    }
    else if (type === 'vending_machine') {
        // NUKA-COLA MACHINE (The Classic Red)
        // Body
        ctx.fillStyle = '#991b1b'; // Dark Red
        ctx.fillRect(x + 4, y - 8, size - 8, size + 4);
        
        // Side Highlight
        ctx.fillStyle = '#ef4444'; // Bright Red
        ctx.fillRect(x + 4, y - 8, 4, size + 4);

        // Display Window (Glowing Blue/White)
        const glow = Math.sin(time / 200) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(200, 255, 255, ${0.3 + glow * 0.2})`;
        ctx.fillRect(x + size/2, y, size/3, size/2);

        // "Cola" Stripe (White)
        ctx.fillStyle = '#e5e5e5';
        ctx.beginPath();
        ctx.moveTo(x + 4, y + size/2);
        ctx.bezierCurveTo(x + size/2, y + size/4, x + size/2, y + size*0.8, x + size - 4, y + size/2);
        ctx.lineTo(x + size - 4, y + size/2 + 2);
        ctx.bezierCurveTo(x + size/2, y + size*0.8 + 2, x + size/2, y + size/4 + 2, x + 4, y + size/2 + 2);
        ctx.fill();
    }
    else if (type === 'server_rack') {
        const isServer = type === 'server_rack';
        ctx.fillStyle = isServer ? '#111827' : '#991b1b';	
        ctx.fillRect(x+size*0.25, y+size*0.1, size*0.5, size*0.8);
        ctx.fillStyle = isServer ? '#374151' : '#ef4444';	
        ctx.fillRect(x+size*0.25, y, size*0.5, size*0.1);
        
        if (!isServer) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x+size*0.25, y+size*0.5, size*0.5, size*0.1);
        } else {
            ctx.fillStyle = '#000';	
            ctx.fillRect(x+size*0.3, y+size*0.2, size*0.4, size*0.2);
            // Blinking LEDs
            if(Math.random() > 0.1) {
                ctx.fillStyle = (Math.sin(time/100 + x)>0) ? '#22c55e' : '#064e3b';
                ctx.fillRect(x+size*0.35, y+size*0.6, 2, 2);
            }
            if(Math.random() > 0.1) {
                ctx.fillStyle = (Math.cos(time/150 + y)>0) ? '#ef4444' : '#7f1d1d';
                ctx.fillRect(x+size*0.45, y+size*0.6, 2, 2);
            }
        }
    }
    else if (type === 'crate' || type === 'ammo_crate') {
        ctx.fillStyle = '#14532d';	
        ctx.fillRect(x+4, y+size*0.4, size-8, size*0.5);
        ctx.fillStyle = '#166534';	
        ctx.fillRect(x+4, y+size*0.1, size-8, size*0.3);	
        ctx.fillStyle = '#052e16'; ctx.fillRect(x+4, y+size*0.4, size-8, 2);	
        ctx.strokeStyle = '#22c55e'; ctx.lineWidth=1;
        ctx.strokeRect(x+4, y+size*0.4, size-8, size*0.5);
    }
    else if (type === 'wall_terminal' || type === 'desk') {
        // TERMINAL (RobCo Style)
        // Desk/Stand
        ctx.fillStyle = '#4b5563'; // Grey metal
        ctx.fillRect(x + 2, y + size/2, size - 4, size/2);
        
        // Monitor Housing
        ctx.fillStyle = '#374151'; // Darker metal
        ctx.beginPath();
        ctx.arc(cx, y + size/2, size/3, Math.PI, 0); // Rounded top
        ctx.lineTo(cx + size/3, y + size/2 + 4);
        ctx.lineTo(cx - size/3, y + size/2 + 4);
        ctx.fill();

        // Screen (Flickering Green Code)
        if (Math.random() > 0.05) { // Occasional flicker off
            ctx.fillStyle = '#14532d'; // Dark Green Base
            ctx.fill(); // Fill background
            
            ctx.fillStyle = '#4ade80'; // Bright Green Text
            const screenW = size/2;
            const screenH = size/3;
            // Draw "Text lines"
            for(let i=0; i<3; i++) {
                ctx.fillRect(cx - screenW/3, (y + size/3) + (i*4), Math.random() * screenW/1.5, 2);
            }
        }
    }
    else if (type === 'table') {
        const isRound = type === 'table';
        if (isRound) {
            ctx.fillStyle = '#78350f';
            ctx.beginPath(); ctx.ellipse(cx, y+size*0.5, size*0.4, size*0.2, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#451a03';
            ctx.fillRect(cx-2, y+size*0.5, 4, size*0.4);
        } else {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(x+2, y+size*0.4, size-4, size*0.3);
            ctx.fillStyle = '#a16207'; ctx.fillRect(x+2, y+size*0.4, size-4, 2);	
            ctx.fillStyle = '#451a03';
            ctx.fillRect(x+2, y+size*0.7, 6, size*0.2);
            ctx.fillRect(x+size-8, y+size*0.7, 6, size*0.2);
        }
    }
    else if (type === 'skeleton' || type === 'skeleton_blue') {
        ctx.fillStyle = '#e5e5e5';
        ctx.beginPath(); ctx.arc(cx, cy-2, size*0.12, 0, Math.PI*2); ctx.fill();	
        ctx.fillStyle = '#000'; ctx.fillRect(cx-2, cy-3, 1, 1); ctx.fillRect(cx+1, cy-3, 1, 1);	
        ctx.strokeStyle = '#e5e5e5'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(cx-3, cy+2); ctx.lineTo(cx+3, cy+2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx-3, cy+5); ctx.lineTo(cx+3, cy+5); ctx.stroke();
    }
    else if (type === 'fire_barrel') {
        ctx.fillStyle = '#374151'; ctx.fillRect(x+size*0.25, y+size*0.25, size*0.5, size*0.75);
        ctx.fillStyle = '#1f2937';	
        ctx.fillRect(x+size*0.25, y+size*0.4, size*0.5, 2);
        ctx.fillRect(x+size*0.25, y+size*0.6, size*0.5, 2);
        
        const pTime = time / 100;
        ctx.globalCompositeOperation = 'lighter';
        for(let i=0; i<8; i++) {
            const fy = (pTime + i*1.5) % 10;	
            const fx = Math.sin(pTime + i) * 4;
            const alpha = 1 - (fy/10);
            ctx.fillStyle = `rgba(250, 204, 21, ${alpha})`;
            ctx.fillRect(cx + fx - 2, y + size*0.25 - fy*2, 4, 4);
        }
        ctx.globalCompositeOperation = 'source-over';
    }
    else if (type === 'rad_puddle') {
        const pulse = (Math.sin(time / 500) + 1) / 2;	
        const r = size/2 + (pulse * 4);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(132, 204, 22, 0.9)');
        g.addColorStop(0.6, 'rgba(132, 204, 22, 0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cx, cy, r, r*0.6, 0, 0, Math.PI*2); ctx.fill();
    }
    else if (type === 'glowing_fungus') {
        ctx.fillStyle = '#a3e635';
        ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(cx, cy+4, size*0.15, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
    else if (type === 'overhead_light') {
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
    }
    else if (type === 'server_rack') {
        ctx.fillStyle = '#57534e';	
        ctx.fillRect(x+8, y+size*0.4, size-16, size*0.4);
        ctx.fillStyle = '#78716c';	
        ctx.fillRect(x+8, y+size*0.2, size-16, size*0.2);
    }
  
}

function drawCRTEffects(ctx, width, height) {
    // Curved Screen Distortion (Simulated via Vignette and Radial Gradient)
    const grad = ctx.createRadialGradient(width/2, height/2, width/4, width/2, height/2, width*0.85);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.6)");	
    ctx.fillStyle = grad;
    ctx.fillRect(0,0, width, height);
    
    ctx.fillStyle = "rgba(0, 255, 100, 0.02)";
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillRect(0,0, width, height);
    ctx.globalCompositeOperation = 'source-over';
}

function drawCurrentLevel(time = 0) {
    const data = (viewMode === 'interior') ? interiorData[currentInteriorKey] : floorData[currentLevelIndex];
    const gs = config.gridSize;
    
    let pal = PALETTES.vault;	
    let patternType = 'vault';

    if (viewMode === 'sector') {
        if (config.mapType === 'ruins') { pal = PALETTES.ruins; patternType = 'ruins'; }
        if (config.mapType === 'cave') { pal = PALETTES.cave; patternType = 'cave'; }
    } else {	
        if (config.mapType === 'ruins') { pal = PALETTES.interior_ruins; patternType = 'interior_ruins'; }
        if (config.mapType === 'cave') { pal = PALETTES.interior_cave; patternType = 'cave'; }
    }
    
    // --- HARD CLEAR BEFORE PHOSPHOR ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);	

    // PHOSPHOR PERSISTENCE (Trails)
    ctx.fillStyle = 'rgba(5, 8, 5, 0.2)'; // Dark green-black tint
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // BEGIN SCALED RENDER
    ctx.save();
    // Multiply the render scale by the current zoom level
    ctx.scale(RENDER_SCALE * zoomLevel, RENDER_SCALE * zoomLevel); 
    
    // *** NEW: Apply Pan Offset to the map drawing coordinate system ***
    ctx.translate(mapOffsetX, mapOffsetY);
    
    if (!patternCache[patternType]) {
        patternCache[patternType] = createPixelPattern(pal.floor, patternType);
    }
    
    const floorPattern = patternCache[patternType];

    if (!data) {	
        // --- STRONGER ERROR MESSAGE ---
        ctx.font = "bold 30px 'VT323', monospace";	
        ctx.fillStyle = 'var(--pip-amber)';	
        ctx.textAlign = "center";	
        ctx.fillText(">> NO MAP DATA DETECTED <<", config.width/2, config.height/2);	
        
        ctx.font = "20px 'VT323', monospace";
        ctx.fillText("INITIATE [ >> SCAN LEVEL ] TO GENERATE", config.width/2, config.height/2 + 30);	

        ctx.restore();
        return;	
    }

    // --- ORGANIC CAVE RENDERING (JAGGED ROCK) ---
    if (patternType === 'cave') {
        ctx.fillStyle = floorPattern;
        
        // Deterministic Random Helper (Stops the jiggling)
        const getOffset = (bx, by, seed) => {
            return (Math.abs(Math.sin(bx * 12.9898 + by * 78.233 + seed) * 43758.5453) % 1);
        };

        for (let x = 0; x < config.cols; x++) {
            for (let y = 0; y < config.rows; y++) {
                if (data.grid[x][y] >= 1) {
                    const px = x * gs;	
                    const py = y * gs;
                    const overlap = gs * 0.4;	
                    
                    ctx.beginPath();
                    // Seed 1 (Top Left)
                    ctx.moveTo(px - (getOffset(x, y, 1) * overlap), py - (getOffset(x, y, 2) * overlap));
                    // Seed 2 (Top Right)
                    ctx.lineTo(px + gs + (getOffset(x, y, 3) * overlap), py - (getOffset(x, y, 4) * overlap));
                    // Seed 3 (Bottom Right)
                    ctx.lineTo(px + gs + (getOffset(x, y, 5) * overlap), py + gs + (getOffset(x, y, 6) * overlap));
                    // Seed 4 (Bottom Left)
                    ctx.lineTo(px - (getOffset(x, y, 7) * overlap), py + gs + (getOffset(x, y, 8) * overlap));
                    
                    ctx.fill();

                    // Add Water Tint if needed
                    if (data.grid[x][y] === 2) {
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
                        ctx.fill();
                        ctx.fillStyle = floorPattern; // Reset
                    }
                }
            }
        }
    }	
    else {
        // STANDARD / RUINS RENDERING
        for (let x = 0; x < config.cols; x++) {
            for (let y = 0; y < config.rows; y++) {
                if (data.grid[x][y] >= 1) {	
                    const px = x * gs; const py = y * gs;
                    
                    if (data.grid[x][y] === 2) {
                        // Water
                        const offset = Math.sin(time/500 + x/2 + y/2) * 4;
                        ctx.fillStyle = '#1e3a8a'; ctx.fillRect(px, py, gs, gs);
                        ctx.fillStyle = '#3b82f6'; ctx.globalAlpha = 0.5;
                        ctx.fillRect(px + offset + 4, py + 4, gs-8, 2);
                        ctx.fillRect(px - offset + 4, py + 12, gs-8, 2);
                        ctx.globalAlpha = 1.0;
                    } else {
                        ctx.fillStyle = floorPattern;	
                        ctx.fillRect(px, py, gs, gs);
                        
                        // Ambient Occlusion (Corner Shadows)
                        ctx.fillStyle = 'rgba(0,0,0,0.4)';
                        if (x > 0 && data.grid[x-1][y] === 0) ctx.fillRect(px, py, 4, gs); // Left Shadow
                        if (y > 0 && data.grid[x][y-1] === 0) ctx.fillRect(px, py, gs, 4); // Top Shadow
                        if (x < config.cols-1 && data.grid[x+1][y] === 0) ctx.fillRect(px+gs-4, py, 4, gs); // Right Shadow
                        if (y < config.rows-1 && data.grid[x][y+1] === 0) ctx.fillRect(px, py+gs-4, gs, 4); // Bottom Shadow
                    }
                }
            }
        }
    }

    // FOG RENDERING (Unified)
    for (let x = 0; x < config.cols; x++) {
        for (let y = 0; y < config.rows; y++) {
            if (config.fogEnabled && !isLocationRevealed(data, x, y)) {
                const px = x * gs; const py = y * gs;
                // Base darkness
                ctx.fillStyle = '#050805';	
                ctx.fillRect(px, py, gs, gs);
                
                // Organic Cloud Puff (The draw image destination is already affected by ctx.translate)
                const scrollX1 = (time * 0.02) % 512;
                const scrollY1 = (time * 0.01) % 512;
                // Calculate texture source coordinates based on logical map position + time scroll
                const sx = (px + scrollX1) % 512;	
                const sy = (py + scrollY1) % 512;
                
                // Draw from the pre-rendered cloud texture (cloudCanvas)
                // This texture draw needs to cover the current tile (px, py)
                // We draw a larger image than the tile size to ensure seamless movement.
                ctx.drawImage(cloudCanvas, sx, sy, gs, gs, px - gs/2, py - gs/2, gs*2, gs*2);
            }
        }
    }
    
    if (data.decorations) for (let deco of data.decorations) {
        if (config.fogEnabled && !isLocationRevealed(data, deco.x, deco.y)) continue;
        drawSprite(ctx, deco.type, deco.x * gs, deco.y * gs, gs, time);
    }

    for (let t of tumbleweeds) {
        // Tumbleweeds should also move with the map offset if they are part of the map world
         ctx.save();
         ctx.translate(t.x, t.y);
         ctx.rotate(t.rot);
         drawSprite(ctx, 'tumbleweed', -t.size/2, -t.size/2, t.size, time);
         ctx.restore();
    }

    // WALL RENDER (2.5D) - Only needed for non-cave types to show depth
    if (patternType !== 'cave') {
        for (let x = 0; x < config.cols; x++) {
            for (let y = 0; y < config.rows; y++) {
                if (data.grid[x][y] === 0) {
                    const px = x * gs; const py = y * gs;
                    const wallHeight = gs / 2;
                    const southOpen = (y < config.rows - 1 && data.grid[x][y+1] >= 1);
                    const southRevealed = southOpen && (!config.fogEnabled || isLocationRevealed(data, x, y+1));

                    if (southRevealed) {
                        const grad = ctx.createLinearGradient(px, py+gs-wallHeight, px, py+gs);
                        grad.addColorStop(0, pal.wall.front);
                        grad.addColorStop(1, '#0a0a0a');	
                        ctx.fillStyle = grad;
                        ctx.fillRect(px, py + gs - wallHeight, gs, wallHeight);
                        
                        // Rust/Grime Detail
                        if ((x+y) % 5 === 0) {
                            ctx.fillStyle = 'rgba(0,0,0,0.3)';
                            ctx.fillRect(px + gs/2, py+gs-wallHeight, 2, wallHeight);
                        }

                        ctx.fillStyle = pal.wall.top;
                        ctx.fillRect(px, py, gs, gs - wallHeight);
                        
                        ctx.fillStyle = pal.wall.highlight;
                        ctx.fillRect(px, py, gs, 2);	
                        ctx.fillRect(px, py, 2, gs-wallHeight);	
                        
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(px, py+gs, gs, gs*0.4);
                    } else {
                        let nearRevealed = false;
                        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) {
                            if (x+dx>=0 && x+dx<config.cols && y+dy>=0 && y+dy<config.rows) {
                                if(data.grid[x+dx][y+dy]>=1 && (!config.fogEnabled || isLocationRevealed(data, x+dx, y+dy))) nearRevealed = true;
                            }
                        }
                        
                        if(nearRevealed) {
                            ctx.fillStyle = pal.wall.top;
                            ctx.fillRect(px, py, gs, gs);
                            ctx.fillStyle = pal.wall.highlight;
                            ctx.fillRect(px, py, gs, 2);	
                            ctx.fillRect(px, py, 2, gs);
                            ctx.fillStyle = 'rgba(0,0,0,0.3)';	
                            ctx.fillRect(px + 4, py + 4, gs - 8, gs - 8);
                        }
                    }
                }
            }
        }
    }

    if (data.doors) for(let door of data.doors) {
        const dx = door.x * gs; const dy = door.y * gs;
        const isLocked = door.locked;
        
        if (viewMode === 'sector') {	
            ctx.fillStyle = '#0a0a0a'; ctx.fillRect(dx + 2, dy - gs/2 + 2, gs - 4, gs/2);	
            ctx.fillStyle = isLocked ? '#ef4444' : pal.accent;	
            ctx.fillRect(dx + gs/2 - 4, dy - gs/2, 8, 4);	
        } else {	
            ctx.fillStyle = '#171717'; ctx.fillRect(dx, dy-4, gs, gs+4);
            ctx.fillStyle = isLocked ? '#7f1d1d' : '#334155';	
            ctx.fillRect(dx + 4, dy, gs - 8, gs - 4);
            ctx.fillStyle = 'rgba(255,255,255,0.1)';	
            ctx.fillRect(dx+4, dy, 2, gs-4);
            ctx.fillRect(dx+gs-6, dy, 2, gs-4);
        }
    }

    if (data.loot) for(let item of data.loot) {
        if (config.fogEnabled && !isLocationRevealed(data, item.x, item.y)) continue;
        const px = item.x * gs; const py = item.y * gs;
        
       const typeMap = { 
            "Safe": "safe", 
            "Locker": "locker", 
            "Desk": "desk", 
            "Ammo Box": "ammo_box", 
            "File Cabinet": "file_cabinet", 
            "Footlocker": "footlocker", 
            "Doctor's Bag": "doctors_bag", 
            "Medkit": "medkit", 
            "First Aid": "first_aid", 
            "Toolbox": "toolbox",
            "Duffel Bag": "duffel_bag",
            "Corpse": "corpse",
            "Hollow Rock": "hollow_rock",
            "Sack": "sack",
            "Crate": "crate",
            "Dumpster": "dumpster",
            "Register": "register",
            "Cashier": "cashier",
            "Cooler": "cooler"
        };
        let sType = "crate";
        for(let key in typeMap) {
            if(item.containerName.includes(key)) {
                sType = typeMap[key];
                break;
            }
        }
        
        if (item.looted) {
             ctx.globalAlpha = 0.4;
             drawSprite(ctx, sType, px, py, gs, time);
             ctx.globalAlpha = 1.0;
        } else {
            drawSprite(ctx, sType, px, py, gs, time);
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(px+gs/2, py+gs/2, 0, px+gs/2, py+gs/2, gs/2);
            g.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(px, py, gs, gs);
            ctx.globalCompositeOperation = 'source-over';
            
            // Locked icon over item
            if (item.isLocked) {
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(px + gs/2 - 4, py + gs/2 - 12, 8, 4); // Lock box
                ctx.fillRect(px + gs/2 - 2, py + gs/2 - 8, 4, 8); // Lock body
            }
        }
    }
    
    if (viewMode === 'sector' && data.stairs) data.stairs.forEach(stair => {
        if (config.fogEnabled && !isLocationRevealed(data, stair.x, stair.y)) return;
        const sx = stair.x * gs; const sy = stair.y * gs;
        ctx.fillStyle = '#0f0f0f'; ctx.fillRect(sx, sy, gs, gs);
        ctx.fillStyle = '#a855f7';	
        for(let i=0; i<gs; i+=6) ctx.fillRect(sx + 4, sy + i, gs - 8, 3);	
    });

    if (viewMode === 'interior' && data.exit) {
        const ex = data.exit.x * gs; const ey = data.exit.y * gs;
        ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'; ctx.fillRect(ex, ey, gs, gs);
        ctx.fillStyle = '#facc15';	
        for(let i=0; i<3; i++) {
            const oy = (time / 100 + i * 10) % 20;
            ctx.globalAlpha = 1 - (oy/20);
            ctx.fillRect(ex + gs/2 - 8, ey + 20 - oy, 16, 2);
            ctx.globalAlpha = 1.0;
        }
    }

    // --- LIGHTING ENGINE (Volumetric Pass) ---
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, config.width, config.height);

    ctx.globalCompositeOperation = 'lighter';

    // Interactive Flashlight (position must be translated back relative to the view)
    const lightX = mousePos.x - mapOffsetX;
    const lightY = mousePos.y - mapOffsetY;

    const cursorG = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, 200);
    cursorG.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    cursorG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cursorG;
    ctx.fillRect(0, 0, config.width, config.height);

    // Dust Particles
    ctx.fillStyle = 'rgba(200, 255, 200, 0.3)';
    for(let m of dustMotes) {
        // Only draw dust near light
        const dx = m.x - lightX; const dy = m.y - lightY;
        if (dx*dx + dy*dy < 40000) {
            ctx.fillRect(m.x, m.y, m.size, m.size);
        }
    }

    if (data.decorations) for (let deco of data.decorations) {
        if (config.fogEnabled && !isLocationRevealed(data, deco.x, deco.y)) continue;
        
        const cx = deco.x * gs + gs/2;
        const cy = deco.y * gs + gs/2;
        let radius = 0;
        let colorStart = '';
        let colorMid = '';
        
        if (deco.type === 'fire_barrel' || deco.type === 'campfire') {
            const flicker = Math.sin(time / 80) * 5 + Math.random() * 3;
            radius = gs * 2.5 + flicker;
            colorStart = 'rgba(255, 200, 100, 0.6)';	
            colorMid = 'rgba(234, 88, 12, 0.2)';
        }	
        else if (deco.type === 'rad_puddle') {
            const pulse = Math.sin(time / 600);
            radius = gs * 2 + (pulse * 10);
            colorStart = 'rgba(180, 255, 100, 0.5)';
            colorMid = 'rgba(132, 204, 22, 0.2)';
        }
        else if (deco.type === 'glowing_fungus') {
            radius = gs * 1.5;
            colorStart = 'rgba(200, 255, 100, 0.4)';
            colorMid = 'rgba(163, 230, 53, 0.15)';
        }
        else if (deco.type === 'overhead_light') {
            if (Math.random() > 0.98) radius = 0;
            else radius = gs * 4 + Math.sin(time / 200)*2;
            colorStart = 'rgba(255, 255, 255, 0.3)';
            colorMid = 'rgba(224, 242, 254, 0.1)';	
        }
        else if (deco.type === 'server_rack') {
            radius = gs * 1.0;
            colorStart = 'rgba(100, 255, 150, 0.3)';
            colorMid = 'rgba(34, 197, 94, 0.1)';
        }
        
        if (radius > 0) {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            grad.addColorStop(0, colorStart);
            grad.addColorStop(0.4, colorMid);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
    }
    
    ctx.globalCompositeOperation = 'source-over';
    drawCRTEffects(ctx, config.width, config.height);

   
    
    ctx.restore(); // Restore from scaled/translated map context
    ctx.save(); // Save again for UI overlay

    // --- DRAW LABELS (MOVED TO UI LAYER) ---
    if (config.showLabels) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        const fontSize = 14 * RENDER_SCALE * zoomLevel;
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.lineWidth = 4 * zoomLevel;
        ctx.lineJoin = 'round';

        for (let lbl of data.labels) {
            // 1. Fog of War Check
            const gx = Math.floor(lbl.x / config.gridSize);
            const gy = Math.floor(lbl.y / config.gridSize);
            if (config.fogEnabled && !isLocationRevealed(data, gx, gy)) continue;
            if (!lbl.visible) continue;

            // 2. Calculate Position
            const lx = (lbl.x + mapOffsetX) * RENDER_SCALE * zoomLevel;
            const ly = (lbl.y + mapOffsetY) * RENDER_SCALE * zoomLevel;

            // 3. Determine Style (Pulse if Enterable in Sector Mode)
            const isInteractive = viewMode === 'sector' && isEnterable(lbl.text);

            if (isInteractive) {
                // GREEN PULSE EFFECT
                const pulse = (Math.sin(time / 200) + 1) / 2; // Oscillates 0.0 to 1.0
                const alpha = 0.5 + (pulse * 0.5); // Oscillates 0.5 to 1.0
                
                // Pulsing Green Outline
                ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`; 
                // Bright Green-White Text
                ctx.fillStyle = '#f0fdf4'; 
            } else {
                // STANDARD STYLE (Black Outline, White Text)
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.fillStyle = '#ffffff';
            }

            // Draw
            ctx.strokeText(lbl.text, lx, ly);
            ctx.fillText(lbl.text, lx, ly);
        }
    }
    // --- DRAW TOKENS --- (Tokens are drawn in a new, un-translated context)
    
   // --- DRAW TOKENS ---
    for (let t of tokens) {
        // 1. Apply Zoom to Position
        const tx = (t.x + mapOffsetX) * RENDER_SCALE * zoomLevel;
        const ty = (t.y + mapOffsetY) * RENDER_SCALE * zoomLevel;

        // 2. DYNAMIC RADIUS LOGIC
        // Check if the token is a player. if not, make it bigger!
    const isPlayer = TOKEN_PRESETS.some(p => p.name === t.label);
    let baseSize = isPlayer ? 15 : 25; // Players are 15, Enemies are 25

    // 1. SPECIFIC SPECIES SIZE OVERRIDES
    if (t.label.includes("Behemoth") || t.label.includes("Sentry Bot") || t.label.includes("Deathclaw")) {
        baseSize = 45; // Huge
    }
    if (t.label.includes("Radroach") || t.label.includes("Bloatfly") || t.label.includes("Ant")) {
        baseSize = 12; // Tiny
    }

    // 2. THE MULTIPLIER MATH (The part you wanted!)
    // We grab the multiplier we stored in the token (0.75, 1.0, 1.5, or 2.0)
    // If it's a player or manual token, it uses 1.0 as a fallback.
    const difficultyMultiplier = t.multiplier || 1.0;

    // 3. FINAL CALCULATION
    const tokenRadius = (baseSize * difficultyMultiplier) * RENDER_SCALE * zoomLevel;
    const imgSize = tokenRadius * 2;

            // --- A. CIRCULAR CROPPING ---
            ctx.save(); // Start isolation
            
            // --- NEW: DEATH FILTERS ---
            // If the tracker said they're dead or sent the grey color code
            if (t.dead || t.color === '#4b5563') {
                ctx.globalAlpha = 0.5;            // Make them 50% transparent
                ctx.filter = 'grayscale(100%)';  // Turn the image black and white
            }

            ctx.beginPath();
            ctx.arc(tx, ty, tokenRadius, 0, Math.PI*2); // Define the circle
            ctx.clip(); // Cut everything outside the circle
            
            // Draw the image (now grayscale/transparent if they are dead)
            ctx.drawImage(t.img, tx - tokenRadius, ty - tokenRadius, imgSize, imgSize);
            
            ctx.restore(); // End isolation (Reset alpha and filter for next token)

           // --- B. BORDER RING ---
            // To remove the circle, just comment out these 5 lines:
            /* ctx.strokeStyle = t.color;
            ctx.lineWidth = 3 * RENDER_SCALE * zoomLevel; 
            ctx.beginPath();
            ctx.arc(tx, ty, tokenRadius, 0, Math.PI*2);
            ctx.stroke();
            */

        } else {
            // Draw default dot/disc (Fallback if no image)
            ctx.fillStyle = t.color;
            ctx.beginPath();
            ctx.arc(tx, ty, tokenRadius * 0.8, 0, Math.PI*2);
            ctx.fill();
            
            // Draw Pulse/Glow
            ctx.strokeStyle = t.color;
            ctx.lineWidth = 2 * RENDER_SCALE * zoomLevel;
            ctx.beginPath();
            ctx.arc(tx, ty, (10 + Math.sin(time/200)*2) * RENDER_SCALE * zoomLevel, 0, Math.PI*2);
            ctx.stroke();
        }

        // --- C. LEGIBLE LABEL ---
if (config.showLabels && tokenLabelsVisible[t.id] !== false) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const fontSize = 14 * RENDER_SCALE * zoomLevel;
    ctx.font = `bold ${fontSize}px monospace`;
    const labelY = ty + tokenRadius + 5 * zoomLevel;

    // 1. Black outline
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 4 * zoomLevel;
    ctx.lineJoin = "round";
    ctx.strokeText(t.label, tx, labelY);

    // 2. White text
        ctx.fillStyle = "#ffffff";
        ctx.fillText(t.label, tx, labelY);
    } // Close if(showLabels)

    } // Close for(tokens) <--- THIS WAS MISSING/MISPLACED

    // Restore the UI overlay context
    // This must happen OUTSIDE the loop, or the canvas will glitch
    ctx.restore();

} // Close function drawCurrentLevel <--- THIS WAS MISSING

// --- GLOBAL EXPOSURE FOR INLINE HTML HANDLERS ---
// Expose functions used in onclick="..." attributes to the global scope
window.init = init;
window.hostSession = hostSession;
window.joinSession = joinSession;
window.openGMTokenDeploy = openGMTokenDeploy;
window.closeGMTokenDeploy = closeGMTokenDeploy;
window.spawnCustomToken = spawnCustomToken;
window.spawnToken = spawnToken;
window.selectCharacter = selectCharacter;
window.updateHelperText = updateHelperText;
window.generateCurrentLevel = generateCurrentLevel;
window.changeLevel = changeLevel;
window.exitInterior = exitInterior;
window.toggleLabels = toggleLabels;
window.toggleFog = toggleFog;
window.downloadMap = downloadMap;
window.recordClip = recordClip;
window.clearCurrentLevel = clearCurrentLevel;
window.purgeAll = purgeAll;
window.exportReport = exportReport;
window.closeModal = closeModal;
window.copyReport = copyReport;
window.copyHostId = copyHostId;
window.sendChatMessage = sendChatMessage;

// NEW: wire save/load helpers
window.saveMapState    = saveMapState;
window.loadMapState    = loadMapState;
window.loadMapFromFile = loadMapFromFile;
window.listSavedMaps   = listSavedMaps;

// Expose new pan functions for debugging/testing
window.handleMouseDown = handleMouseDown;
window.handleMouseUp = handleMouseUp;

// --------------------------------------------------

window.onload = init;
