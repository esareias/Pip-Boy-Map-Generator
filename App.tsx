
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from './services/engine';
import { Token, FloorData } from './types';
import { TOKEN_PRESETS } from './constants';
import { GoogleGenAI } from "@google/genai";

// Declare PeerJS globals
declare const Peer: any;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [logs, setLogs] = useState<{msg: string, color: string, time: string}[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [userToken, setUserToken] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [levelName, setLevelName] = useState('LEVEL 0 (GROUND)');
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [coord, setCoord] = useState("0,0");

  const addLog = useCallback((msg: string, color: string = 'var(--main-color)', sender?: string) => {
    setLogs(prev => [...prev.slice(-19), { 
      msg: sender ? `${sender}: ${msg}` : msg, 
      color, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }]);
  }, []);

  // Engine Setup
  useEffect(() => {
    if (!canvasRef.current || engineRef.current) return;
    
    const engine = new GameEngine(
      canvasRef.current, 
      addLog,
      () => { /* sync callback stub */ }
    );
    engineRef.current = engine;
    
    // Animation Loop
    let animId: number;
    const loop = (time: number) => {
      engine.draw(time);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    
    // Mouse Events
    const canvas = canvasRef.current;
    
    const onMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        engine.lastPanX = e.clientX;
        engine.lastPanY = e.clientY;
        engine.isPanning = true;
    };
    
    const onMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        // Update coord display
        const lx = (e.clientX - rect.left) * scaleX / engine.RENDER_SCALE - engine.mapOffsetX;
        const ly = (e.clientY - rect.top) * scaleX / engine.RENDER_SCALE - engine.mapOffsetY;
        const gx = Math.floor(lx / engine.gridSize);
        const gy = Math.floor(ly / engine.gridSize);
        setCoord(`${gx},${gy}`);

        if(engine.isPanning) {
            const dx = e.clientX - engine.lastPanX;
            const dy = e.clientY - engine.lastPanY;
            engine.mapOffsetX += dx / engine.RENDER_SCALE;
            engine.mapOffsetY += dy / engine.RENDER_SCALE;
            engine.lastPanX = e.clientX;
            engine.lastPanY = e.clientY;
        }
    };
    
    const onMouseUp = () => { engine.isPanning = false; };
    
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [addLog]);

  // Sync level name
  useEffect(() => {
      if(!engineRef.current) return;
      const idx = engineRef.current.currentLevelIndex;
      const names: Record<number, string> = { '-2': "LEVEL B2 (DEEP)", '-1': "LEVEL B1 (BASEMENT)", '0': "LEVEL 1 (GROUND)", '1': "LEVEL 2 (UPPER)", '2': "LEVEL 3 (ROOF)" };
      setLevelName(names[idx] || `LEVEL ${idx}`);
  }, [logs]); // Update when logs change (hacky trigger)

  // Network Setup (PeerJS)
  const initHost = () => {
    if(!engineRef.current) return;
    const peer = new Peer();
    peer.on('open', (id: string) => {
      setPeerId(id);
      setIsConnected(true);
      setIsHost(true);
      addLog(`HOST TERMINAL ONLINE. ID: ${id}`);
    });
    // Add connection handling logic here...
    setShowLogin(false);
  };
  
  const joinSession = () => {
    if(!hostId) return;
    const peer = new Peer();
    peer.on('open', (id: string) => {
       const conn = peer.connect(hostId);
       conn.on('open', () => {
           setIsConnected(true);
           addLog(`CONNECTED TO OVERSEER`, '#3b82f6');
       });
    });
    setShowLogin(false);
  };

  const handleCharacterSelect = (token: any) => {
    setUserToken(token);
    // Add token to engine
    if(engineRef.current) {
        engineRef.current.tokens.push({
            id: Date.now(),
            x: 400, y: 300,
            label: token.name,
            color: token.color,
            src: token.src
        });
    }
  };

  const generateLevel = () => {
      engineRef.current?.generateCurrentLevel(50);
  };
  
  const analyzeSector = async () => {
      if(!process.env.API_KEY) {
          addLog("ERROR: NO AI UPLINK (API KEY)", "#ef4444");
          return;
      }
      setAiAnalysis("ANALYZING SECTOR...");
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const roomCount = engineRef.current?.floorData[engineRef.current.currentLevelIndex]?.rooms.length || 0;
          const prompt = `You are a Pip-Boy 3000 tactical computer. Analyze this sector: It contains ${roomCount} rooms and is a ${engineRef.current?.mapType} type environment. Provide a brief, atmospheric tactical summary (max 2 sentences). Use military/sci-fi jargon.`;
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });
          setAiAnalysis(response.text);
          addLog("AI ANALYSIS COMPLETE");
      } catch(e) {
          setAiAnalysis("ANALYSIS FAILED");
          addLog("AI CONNECTION ERROR", "#ef4444");
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      
      {/* PIP-BOY PHYSICAL CASING */}
      <div className="pip-casing w-full h-[90vh]">
        
        {/* TOP HEADER */}
        <div className="flex justify-between items-end mb-4 border-b border-[var(--dim-color)] pb-2">
            <div>
                <h1 className="text-4xl font-bold tracking-wider" style={{textShadow: "0 0 10px var(--main-color)"}}>CARTOGRAPHY MODULE</h1>
                <p className="opacity-70 tracking-widest text-lg">V.29.3 - VAULT-TEC PRO</p>
            </div>
            <div className="text-right opacity-60 text-sm">
                ROBCO INDUSTRIES<br/>UNIFIED OPERATING SYSTEM
            </div>
        </div>

        {/* CONTROLS ROW */}
        <div className="flex justify-between items-center bg-black/40 p-2 mb-4 border border-[var(--dim-color)]">
             <div className="flex gap-4 items-center">
                <span className="opacity-70">SECTOR:</span>
                <span className="font-bold text-xl">{levelName}</span>
                <div className="h-6 w-px bg-[var(--main-color)] opacity-50"></div>
                <div className="text-xs opacity-80 max-w-md italic">{aiAnalysis}</div>
             </div>
             <div className="flex gap-2">
                 <button onClick={analyzeSector} className="pip-btn text-sm">AI ANALYZE</button>
                 {!isConnected && <button onClick={()=>setShowLogin(true)} className="pip-btn text-sm">LOGIN</button>}
             </div>
        </div>

        {/* MAIN SCREEN AREA */}
        <div className="screen-container">
            <div className="tracking-line"></div>
            <div className="crt-flicker"></div>
            
            {/* OVERLAY UI ON MAP */}
            <div className="absolute top-4 left-4 z-20 flex gap-2">
                 <button onClick={() => engineRef.current?.changeLevel(-1)} className="pip-btn bg-black/80 backdrop-blur">▼ LOWER</button>
                 <button onClick={() => engineRef.current?.changeLevel(1)} className="pip-btn bg-black/80 backdrop-blur">▲ UPPER</button>
                 <button onClick={generateLevel} className="pip-btn bg-black/80 backdrop-blur border-amber-500 text-amber-500">>> SCAN</button>
            </div>
            
            <div className="absolute bottom-2 left-2 z-20 bg-black/80 border border-[var(--dim-color)] px-2 py-1 text-sm font-bold">
                POS: {coord}
            </div>

            <canvas ref={canvasRef} className="w-full h-full object-cover" />
        </div>

        {/* BOTTOM TERMINAL LOG */}
        <div className="mt-4 flex gap-4 h-48">
             <div className="w-1/4 flex flex-col gap-2">
                 <div className="border border-[var(--dim-color)] p-2 flex-1 bg-black/20">
                     <div className="text-sm opacity-50 mb-1">SYSTEM STATUS</div>
                     <div className="text-lg">{isConnected ? "ONLINE" : "OFFLINE"}</div>
                     <div className="text-xs opacity-50">{isHost ? "HOST MODE" : "TERMINAL MODE"}</div>
                     {peerId && <div className="text-xs mt-2 break-all">ID: {peerId}</div>}
                 </div>
                 <div className="border border-[var(--dim-color)] p-2">
                     <div className="text-xs opacity-50">MAP TYPE</div>
                     <select 
                        className="pip-input w-full text-sm mt-1"
                        onChange={(e) => { if(engineRef.current) engineRef.current.mapType = e.target.value; }}
                     >
                         <option value="vault">VAULT</option>
                         <option value="ruins">RUINS</option>
                         <option value="cave">CAVE</option>
                     </select>
                 </div>
             </div>

             <div className="flex-1 flex flex-col border border-[var(--dim-color)] bg-black/40 p-2">
                 <div className="flex-1 overflow-y-auto font-mono text-sm space-y-1 pr-2 mb-2 custom-scrollbar">
                    {logs.map((l, i) => (
                        <div key={i} className="border-b border-dashed border-[var(--dim-color)] pb-1 mb-1 last:border-0">
                            <span className="opacity-50 text-xs mr-2">[{l.time}]</span>
                            <span style={{color: l.color}} dangerouslySetInnerHTML={{__html: l.msg}}></span>
                        </div>
                    ))}
                 </div>
                 <div className="flex gap-2">
                    <input 
                        value={inputMsg}
                        onChange={e => setInputMsg(e.target.value)}
                        onKeyDown={e => {
                            if(e.key === 'Enter') {
                                addLog(inputMsg, '#fff', userToken?.name || 'User');
                                setInputMsg('');
                            }
                        }}
                        className="pip-input flex-1"
                        placeholder="ENTER COMMAND..."
                    />
                    <button onClick={()=>{addLog(inputMsg, '#fff', userToken?.name || 'User'); setInputMsg('');}} className="pip-btn">TRANSMIT</button>
                 </div>
             </div>
        </div>

      </div>

      {/* LOGIN OVERLAY */}
      {showLogin && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
              <div className="border-4 border-[var(--main-color)] bg-[#0a0a0a] p-8 max-w-4xl w-full shadow-[0_0_50px_var(--dim-color)]">
                  <h2 className="text-4xl text-center font-bold mb-2">IDENTITY CONFIRMATION</h2>
                  <p className="text-center opacity-70 mb-8 text-xl">SELECT UNIT DESIGNATION</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      {TOKEN_PRESETS.map(t => (
                          <div 
                            key={t.name}
                            onClick={() => handleCharacterSelect(t)}
                            className={`border-2 p-4 cursor-pointer transition-all flex flex-col items-center gap-2 hover:scale-105 ${userToken?.name === t.name ? 'border-[var(--main-color)] bg-[var(--dim-color)]' : 'border-[#333] hover:border-[var(--dim-color)]'}`}
                          >
                              <img src={t.src} className="w-16 h-16 rounded-full border-2 border-[var(--main-color)] object-cover bg-black" alt={t.name} />
                              <div className="text-center font-bold tracking-wider text-sm">{t.name}</div>
                          </div>
                      ))}
                  </div>

                  {!isConnected && (
                      <div className="flex justify-center gap-4 mb-6 border-t border-[var(--dim-color)] pt-6">
                           <button onClick={initHost} className="pip-btn text-xl px-8">INITIALIZE HOST</button>
                           <div className="flex gap-2">
                               <input 
                                  value={hostId} 
                                  onChange={e=>setHostId(e.target.value)} 
                                  className="pip-input w-48 text-center text-lg" 
                                  placeholder="ENTER HOST ID" 
                               />
                               <button onClick={joinSession} className="pip-btn">CONNECT</button>
                           </div>
                      </div>
                  )}

                  <div className="text-center">
                       <button 
                        onClick={() => userToken && setShowLogin(false)} 
                        disabled={!userToken}
                        className="pip-btn text-2xl px-16 py-2 border-4 font-bold"
                      >
                          ENTER SYSTEM
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
