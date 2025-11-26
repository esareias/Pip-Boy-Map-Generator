
import { GameEngine } from './engine.js';
import { TOKEN_PRESETS } from './constants.js';
import { GoogleGenAI } from "https://esm.run/@google/genai";

let engine = null;
let userToken = null;
let isConnected = false;
let isHost = false;
let peerId = '';

const addLog = (msg, color = 'var(--main-color)', sender) => {
    const container = document.getElementById('logContainer');
    const div = document.createElement('div');
    div.className = "border-b border-dashed border-[var(--dim-color)] pb-1 mb-1";
    div.innerHTML = `<span class="opacity-50 text-xs mr-2">[${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]</span><span style="color:${color}">${sender ? sender + ': ' : ''}${msg}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
};

// --- INITIALIZATION ---
window.onload = () => {
    const canvas = document.getElementById('mapCanvas');
    engine = new GameEngine(canvas, addLog, () => {});
    
    // Animation Loop
    const loop = (time) => {
        engine.draw(time);
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // Populate Characters
    const charGrid = document.getElementById('characterGrid');
    TOKEN_PRESETS.forEach(t => {
        const div = document.createElement('div');
        div.className = "border-2 border-[#333] p-4 cursor-pointer transition-all flex flex-col items-center gap-2 hover:scale-105 hover:border-[var(--dim-color)]";
        div.onclick = () => {
             document.querySelectorAll('#characterGrid > div').forEach(d => d.classList.remove('border-[var(--main-color)]', 'bg-[var(--dim-color)]'));
             div.classList.add('border-[var(--main-color)]', 'bg-[var(--dim-color)]');
             userToken = t;
             document.getElementById('enterSystemBtn').disabled = false;
        };
        div.innerHTML = `<img src="${t.src}" class="w-16 h-16 rounded-full border-2 border-[var(--main-color)] object-cover bg-black"><div class="text-center font-bold tracking-wider text-sm">${t.name}</div>`;
        charGrid.appendChild(div);
    });

    // Event Listeners
    setupControls();
};

function setupControls() {
    // Mouse Interaction for Pan
    const canvas = document.getElementById('mapCanvas');
    canvas.addEventListener('mousedown', (e) => {
        engine.lastPanX = e.clientX; engine.lastPanY = e.clientY; engine.isPanning = true;
    });
    window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        const lx = (e.clientX - rect.left) * scale / engine.RENDER_SCALE - engine.mapOffsetX;
        const ly = (e.clientY - rect.top) * scale / engine.RENDER_SCALE - engine.mapOffsetY;
        document.getElementById('coordDisplay').innerText = `${Math.floor(lx/engine.gridSize)},${Math.floor(ly/engine.gridSize)}`;

        if(engine.isPanning) {
            engine.mapOffsetX += (e.clientX - engine.lastPanX) / engine.RENDER_SCALE;
            engine.mapOffsetY += (e.clientY - engine.lastPanY) / engine.RENDER_SCALE;
            engine.lastPanX = e.clientX; engine.lastPanY = e.clientY;
        }
    });
    window.addEventListener('mouseup', () => engine.isPanning = false);

    // Buttons
    document.getElementById('enterSystemBtn').onclick = () => {
        if(!userToken) return;
        document.getElementById('loginOverlay').style.display = 'none';
        engine.tokens.push({id: Date.now(), x: 400, y: 300, label: userToken.name, color: userToken.color, src: userToken.src});
        addLog(`USER AUTHENTICATED: ${userToken.name}`);
    };

    document.getElementById('initHostBtn').onclick = () => {
        const peer = new Peer();
        peer.on('open', (id) => {
             peerId = id; isHost = true; isConnected = true;
             updateStatus();
             addLog(`HOST TERMINAL ONLINE. ID: ${id}`);
        });
        document.getElementById('loginOverlay').style.display = 'none';
    };
    
    document.getElementById('connectBtn').onclick = () => {
        const hostId = document.getElementById('hostIdInput').value;
        if(!hostId) return;
        const peer = new Peer();
        peer.on('open', () => {
            const conn = peer.connect(hostId);
            conn.on('open', () => {
                isConnected = true;
                updateStatus();
                addLog('CONNECTED TO OVERSEER', '#3b82f6');
            });
        });
        document.getElementById('loginOverlay').style.display = 'none';
    };

    document.getElementById('scanBtn').onclick = () => engine.generateCurrentLevel(50);
    document.getElementById('levelUpBtn').onclick = () => engine.changeLevel(1);
    document.getElementById('levelDownBtn').onclick = () => engine.changeLevel(-1);
    
    document.getElementById('transmitBtn').onclick = sendChat;
    document.getElementById('chatInput').addEventListener('keydown', (e) => { if(e.key==='Enter') sendChat(); });

    document.getElementById('aiAnalyzeBtn').onclick = async () => {
        addLog("AI: ANALYZING SECTOR...", "#fbbf24");
        // NOTE: In a real deploy, API_KEY should be handled securely or prompted. 
        // Since we are running client-side, we assume env var or prompt.
        if(!process.env.API_KEY) { addLog("ERROR: API KEY MISSING", "#ef4444"); return; }
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Analyze this sector: ${engine.mapType} environment, Level ${engine.currentLevelIndex}. Provide atmospheric tactical summary.`;
            const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            document.getElementById('aiAnalysisDisplay').innerText = resp.text;
            addLog("AI ANALYSIS RECEIVED");
        } catch(e) {
            addLog("AI UPLINK FAILED", "#ef4444");
        }
    };
    
    document.getElementById('mapTypeSelect').onchange = (e) => { engine.mapType = e.target.value; };
    document.getElementById('loginBtn').onclick = () => document.getElementById('loginOverlay').style.display = 'flex';
}

function updateStatus() {
    document.getElementById('connStatus').innerText = isConnected ? "ONLINE" : "OFFLINE";
    document.getElementById('hostModeDisplay').innerText = isHost ? "HOST MODE" : "TERMINAL MODE";
    document.getElementById('peerIdDisplay').innerText = peerId ? `ID: ${peerId}` : "";
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value;
    if(!msg) return;
    addLog(msg, '#fff', userToken ? userToken.name : 'User');
    input.value = '';
}
