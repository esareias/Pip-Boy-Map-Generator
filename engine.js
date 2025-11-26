
import { BUILDING_ARCHETYPES, ROOM_RELATIONS, PALETTES, ITEM_DATABASE, CONTAINER_DETAILS, DECO_POOLS, SUB_THEMES, NAMES } from './constants.js';

export class GameEngine {
  constructor(canvas, onLog, onSync) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.onLog = onLog;
    this.onSync = onSync;
    
    // State
    this.width = 800;
    this.height = 600;
    this.gridSize = 24;
    this.cols = Math.floor(this.width / this.gridSize);
    this.rows = Math.floor(this.height / this.gridSize);
    
    this.floorData = {};
    this.interiorData = {};
    this.tokens = [];
    
    this.currentLevelIndex = 0;
    this.viewMode = 'sector';
    this.currentInteriorKey = null;
    this.mapType = 'vault';
    this.fogEnabled = true;
    this.showLabels = true;
    
    // Rendering internals
    this.RENDER_SCALE = 2;
    this.mapOffsetX = 0;
    this.mapOffsetY = 0;
    this.patternCache = {};
    this.cloudCanvas = null;
    this.tumbleweeds = [];
    this.dustMotes = [];
    
    // Mouse interaction
    this.lastPanX = 0;
    this.lastPanY = 0;
    this.isPanning = false;
    this.draggedToken = null;

    // Init canvas size
    this.canvas.width = this.width * this.RENDER_SCALE;
    this.canvas.height = this.height * this.RENDER_SCALE;
    this.ctx.imageSmoothingEnabled = false;

    this.initDust();
    this.initClouds();
  }
  
  initDust() {
      this.dustMotes = [];
      for(let i=0; i<50; i++) {
        this.dustMotes.push({
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            size: Math.random() * 2,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5
        });
    }
  }
  
  initClouds() {
    this.cloudCanvas = document.createElement('canvas');
    this.cloudCanvas.width = 512; 
    this.cloudCanvas.height = 512;
    const cCtx = this.cloudCanvas.getContext('2d');
    if (!cCtx) return;
    
    cCtx.fillStyle = 'rgba(0,0,0,0.5)';
    cCtx.fillRect(0,0,512,512);
    
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
        
        // Wrap
        if (x < r) { cCtx.fillStyle = g; cCtx.beginPath(); cCtx.arc(x+512, y, r, 0, Math.PI*2); cCtx.fill(); }
        if (y < r) { cCtx.fillStyle = g; cCtx.beginPath(); cCtx.arc(x, y+512, r, 0, Math.PI*2); cCtx.fill(); }
    }
  }

  // --- GENERATION LOGIC ---
  
  changeLevel(delta) {
    const minLvl = -2;
    const maxLvl = (this.mapType === 'vault') ? 2 : 0;
    let target = this.currentLevelIndex + delta;
    if (target < minLvl) target = minLvl;
    if (target > maxLvl) target = maxLvl;
    
    this.currentLevelIndex = target;
    this.onSync();
  }

  generateCurrentLevel(density) {
      this.patternCache = {};
      
      const newData = { 
          grid: Array(this.cols).fill(0).map(() => Array(this.rows).fill(0)), 
          labels: [], stairs: [], loot: [], decorations: [], doors: [], rooms: [], 
          mapType: this.mapType 
      };
      
      let fixedAnchors = [];
      const canHaveUpperStairs = (this.mapType === 'vault') || (this.currentLevelIndex < 0);
      
      // Link Upper
      if (canHaveUpperStairs && this.floorData[this.currentLevelIndex + 1]) {
           const upper = this.floorData[this.currentLevelIndex + 1];
           const match = upper.stairs.find(s => s.type === 'down');
           if (match) {
               fixedAnchors.push({ x: match.x, y: match.y, type: 'up', upperName: upper.labels.find(l => Math.abs(l.x - match.x*this.gridSize) < 50)?.text });
               newData.stairs.push({ x: match.x, y: match.y, type: 'up' });
               newData.labels.push({ x: match.x * this.gridSize + 12, y: (match.y-0.7) * this.gridSize + 12, text: "STAIRS UP", visible: true });
           }
      }
      // Link Lower
      if (this.floorData[this.currentLevelIndex - 1]) {
           const lower = this.floorData[this.currentLevelIndex - 1];
           const match = lower.stairs.find(s => s.type === 'up');
           if (match) {
               fixedAnchors.push({ x: match.x, y: match.y, type: 'down' });
               newData.stairs.push({ x: match.x, y: match.y, type: 'down' });
               newData.labels.push({ x: match.x * this.gridSize + 12, y: (match.y-0.7) * this.gridSize + 12, text: "STAIRS DOWN", visible: true });
           }
      }
      
      if (this.mapType === 'cave') this.generateCaves(newData, density, fixedAnchors);
      else if (this.mapType === 'vault') this.generateVault(newData, density, fixedAnchors);
      else this.generateRuins(newData, density, fixedAnchors);
      
      if (this.mapType === 'ruins') this.erodeBuildings(newData);

      this.generateLoot(newData, this.mapType);
      this.generateDecorations(newData, this.mapType, density);
      this.generateLocksAndKeys(newData);

      this.floorData[this.currentLevelIndex] = newData;
      this.onLog(`SCAN COMPLETE: LEVEL ${this.currentLevelIndex}`, 'var(--pip-green)');
      this.onSync();
  }
  
  createRoom(grid, r) {
      for(let x=r.x; x<r.x+r.w; x++) for(let y=r.y; y<r.y+r.h; y++) {
          if (x < this.cols && y < this.rows) grid[x][y] = 1;
      }
  }
  
  createCorridor(grid, x1, y1, x2, y2) {
      let x = x1; let y = y1;
      while (x !== x2) {
          if (x < this.cols && y < this.rows) { grid[x][y] = 1; grid[x][y+1] = 1; }
          x += (x < x2) ? 1 : -1;
      }
      while (y !== y2) {
          if (x < this.cols && y < this.rows) { grid[x][y] = 1; grid[x+1][y] = 1; }
          y += (y < y2) ? 1 : -1;
      }
  }

  getRoomDecision(archetypeKey, currentRooms, sourceRoomName) {
      const arch = BUILDING_ARCHETYPES[archetypeKey] || BUILDING_ARCHETYPES.GENERIC;
      
      const roomCounts = {};
      currentRooms.forEach(r => {
          roomCounts[r.name] = (roomCounts[r.name] || 0) + 1;
      });

      let effectiveMandatory = arch.mandatory;
      if (archetypeKey === 'VAULT' && this.currentLevelIndex !== 0) {
          effectiveMandatory = effectiveMandatory.filter((m) => m !== "Entrance Airlock");
      }

      const unbuiltMandatory = effectiveMandatory.filter((m) => !currentRooms.some(r => r.name === m));
      if (unbuiltMandatory.length > 0) return unbuiltMandatory[0];
      
      let candidates = [...arch.allowed];

      // Filter out over-used
      candidates = candidates.filter(c => (roomCounts[c] || 0) < 3);
      
      // Filter out unique (Vault-Wide Check Implemented Here)
      candidates = candidates.filter(c => {
        if (arch.unique && arch.unique.includes(c)) {
            // Extended uniqueness filter for vault-wide unique rooms
            if (archetypeKey === 'VAULT') {
                // For vaults: search ALL rooms in all levels
                const allRooms = Object.values(this.floorData).reduce((arr, lvl) => {
                    return (lvl && lvl.rooms) ? arr.concat(lvl.rooms) : arr;
                }, []);
                
                // Also check the current rooms being built to ensure no duplicates in the current session
                if (currentRooms.some(r => r.name === c)) return false;
                
                return !allRooms.some((r) => r.name === c);
            } else {
                // Otherwise just in current level
                return !currentRooms.some(r => r.name === c);
            }
        }
        return true;
      });

      if (sourceRoomName) {
          candidates = candidates.filter(c => c !== sourceRoomName);
      }

      if (Math.random() < 0.05) {
          const flavorRooms = ["Gore Room", "Speakeasy", "Boiler Room"];
          candidates.push(...flavorRooms);
      }

      if (sourceRoomName && ROOM_RELATIONS[sourceRoomName]) {
          const logic = ROOM_RELATIONS[sourceRoomName];
          if (logic.link && Math.random() < 0.6) {
              const linkedCandidates = candidates.filter(c => logic.link.includes(c));
              if (linkedCandidates.length > 0) candidates = linkedCandidates;
          }
          if (logic.avoid) candidates = candidates.filter(c => !logic.avoid.includes(c));
      }

      if (candidates.length === 0) return (Math.random() < 0.5) ? "Hallway" : "Corridor";
      
      return candidates[Math.floor(Math.random() * candidates.length)];
  }

  generateVault(data, density, anchors) {
      const targetRoomCount = Math.floor(density / 3) + 5;
      const rooms = [];
      const BUFFER = 2;
      
      anchors.forEach(anchor => {
          const room = { x: Math.max(1, anchor.x - 3), y: Math.max(1, anchor.y - 3), w: 6, h: 6, visited: true, name: "Connector" };
          this.createRoom(data.grid, room);
          rooms.push(room); data.rooms.push(room);
      });
      
      if (this.currentLevelIndex === 0 && anchors.length === 0) {
          const entry = { x: Math.floor(this.cols/2)-3, y: this.rows-8, w: 6, h: 6, visited: true, name: "Entrance Airlock" };
          this.createRoom(data.grid, entry);
          rooms.push(entry); data.rooms.push(entry);
          data.doors.push({x: Math.floor(entry.x+3), y: entry.y+6, locked: true, keyColor: '#3b82f6'});
      }
      
      let attempts = 0;
      while (rooms.length < targetRoomCount && attempts < 1000) {
          attempts++;
          let w = Math.floor(Math.random() * 7) + 4;
          let h = Math.floor(Math.random() * 7) + 4;
          let x, y;
          let source = null;
          
          if (rooms.length > 0) {
              source = rooms[Math.floor(Math.random() * rooms.length)];
              const dir = Math.floor(Math.random()*4);
              const dist = Math.floor(Math.random()*6)+3;
              x = source.x; y = source.y;
              if (dir===0) y -= (dist+h);
              if (dir===1) x += (source.w+dist);
              if (dir===2) y += (source.h+dist);
              if (dir===3) x -= (dist+w);
          } else {
              x = Math.floor(Math.random()*(this.cols-w-2))+1;
              y = Math.floor(Math.random()*(this.rows-h-2))+1;
          }
          
          x = Math.max(BUFFER, Math.min(this.cols-w-BUFFER, x));
          y = Math.max(BUFFER, Math.min(this.rows-h-BUFFER, y));
          
          let failed = false;
          for(let other of rooms) {
               if (x < other.x + other.w + BUFFER && x + w + BUFFER > other.x && y < other.y + other.h + BUFFER && y + h + BUFFER > other.y) failed = true;
          }
          
          if (!failed) {
              const newRoom = { x, y, w, h, visited: false, name: "Room" };
              let roomName = this.getRoomDecision('VAULT', rooms, source ? source.name : null);
              if (roomName === "Entrance Airlock" && this.currentLevelIndex !== 0) roomName = "Storage Closet";
              newRoom.name = roomName;
              
              this.createRoom(data.grid, newRoom);
              if (source) this.createCorridor(data.grid, source.x + Math.floor(source.w/2), source.y + Math.floor(source.h/2), newRoom.x + Math.floor(newRoom.w/2), newRoom.y + Math.floor(newRoom.h/2));
              
              rooms.push(newRoom); data.rooms.push(newRoom);
              data.labels.push({ x: (newRoom.x+newRoom.w/2)*this.gridSize, y: (newRoom.y+newRoom.h/2)*this.gridSize, text: newRoom.name || "ROOM", visible: true });
          }
      }
  }

  generateRuins(data, density, anchors) {
      const buildings = [];
      const BUFFER = 3;
      
      if (this.currentLevelIndex < 0) {
          data.grid = Array(this.cols).fill(0).map(() => Array(this.rows).fill(0));
          
          let selectedThemeKey = 'industrial';
          let foundSmartTheme = false;
          if (anchors.length > 0 && anchors[0].upperName) {
              const up = anchors[0].upperName.toUpperCase();
              if (up.includes("HOME") || up.includes("HOUSE") || up.includes("APARTMENT") || up.includes("HOTEL")) { selectedThemeKey = 'residential'; foundSmartTheme = true; }
              else if (up.includes("STREET") || up.includes("HUB") || up.includes("PARK") || up.includes("ALLEY")) { selectedThemeKey = 'sewer'; foundSmartTheme = true; }
              else if (up.includes("FACTORY") || up.includes("PLANT") || up.includes("POWER")) { selectedThemeKey = 'industrial'; foundSmartTheme = true; }
              else if (up.includes("CHURCH") || up.includes("GRAVE") || up.includes("HOSPITAL")) { selectedThemeKey = 'creepier'; foundSmartTheme = true; }
          }
          if (!foundSmartTheme) {
              const themes = Object.keys(SUB_THEMES);
              selectedThemeKey = themes[Math.floor(Math.random() * themes.length)];
          }
          const allowedRooms = SUB_THEMES[selectedThemeKey];
          
          anchors.forEach(anchor => {
              const w = Math.floor(Math.random() * 4) + 4; const h = Math.floor(Math.random() * 4) + 4;
              let x = Math.max(BUFFER, Math.min(this.cols - w - BUFFER, anchor.x - Math.floor(w/2)));
              let y = Math.max(BUFFER, Math.min(this.rows - h - BUFFER, anchor.y - Math.floor(h/2)));
              const newBuilding = { x, y, w, h, visited: true, name: "Ruins" };
              for (let bx = x; bx < x + w; bx++) for (let by = y; by < y + h; by++) if(bx<this.cols && by<this.rows) data.grid[bx][by] = 1;
              const roomName = allowedRooms[Math.floor(Math.random() * allowedRooms.length)];
              newBuilding.name = roomName;
              data.labels.push({ x: (x+w/2)*this.gridSize, y: (y+h/2)*this.gridSize, text: roomName, visible: true });
              buildings.push(newBuilding); data.rooms.push(newBuilding);
          });
          
          if (buildings.length > 1) for (let i = 1; i < buildings.length; i++) this.createCorridor(data.grid, buildings[i-1].x+2, buildings[i-1].y+2, buildings[i].x+2, buildings[i].y+2);
          
      } else {
        data.grid = Array(this.cols).fill(0).map(() => Array(this.rows).fill(1));
        for(let x=0;x<this.cols;x++) { data.grid[x][0]=0; data.grid[x][this.rows-1]=0; }
        for(let y=0;y<this.rows;y++) { data.grid[0][y]=0; data.grid[this.cols-1][y]=0; }
        
        const numBuildings = Math.floor(density/3) + 5;
        let placed = 0;
        let attempts = 0;
        
        while (placed < numBuildings && attempts < 1000) {
            attempts++;
            const w = Math.floor(Math.random()*6)+3;
            const h = Math.floor(Math.random()*6)+3;
            const x = Math.floor(Math.random()*(this.cols-w-BUFFER*2)) + BUFFER;
            const y = Math.floor(Math.random()*(this.rows-h-BUFFER*2)) + BUFFER;
            
            let failed = false;
            for(let b of buildings) {
                 if (x < b.x + b.w + BUFFER && x + w + BUFFER > b.x && y < b.y + b.h + BUFFER && y + h + BUFFER > b.y) failed = true;
            }
            if(!failed) {
                for(let bx=x; bx<x+w; bx++) for(let by=y; by<y+h; by++) data.grid[bx][by] = 0; 
                const name = NAMES.ruins_street[Math.floor(Math.random() * NAMES.ruins_street.length)];
                data.labels.push({ x: (x+w/2)*this.gridSize, y: (y+h/2)*this.gridSize, text: name, visible: true });
                const bObj = {x, y, w, h, name, visited: true};
                buildings.push(bObj); data.rooms.push(bObj);
                data.doors.push({x: Math.floor(x+w/2), y: y+h, locked: false});
                placed++;
            }
        }
      }
  }
  
  generateCaves(data, density, anchors) {
      for(let x=0; x<this.cols; x++) for(let y=0; y<this.rows; y++) data.grid[x][y] = (Math.random()*100 < density) ? 1 : 0;
      // CA smoothing
      for(let i=0; i<4; i++) {
          const next = JSON.parse(JSON.stringify(data.grid));
          for(let x=1; x<this.cols-1; x++) for(let y=1; y<this.rows-1; y++) {
              let walls = 0;
              for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++) if(data.grid[x+dx][y+dy]===0) walls++;
              if(walls > 4) next[x][y] = 0; else if(walls < 4) next[x][y] = 1;
          }
          data.grid = next;
      }
      anchors.forEach(a => {
          for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) if(data.grid[a.x+dx]?.[a.y+dy] !== undefined) data.grid[a.x+dx][a.y+dy] = 1;
      });
      const namePool = this.currentLevelIndex < 0 ? NAMES.cave_underground : NAMES.cave_surface;
      for(let i=0; i<4; i++) {
          const rx = Math.floor(Math.random()*(this.cols-2))+1;
          const ry = Math.floor(Math.random()*(this.rows-2))+1;
          if(data.grid[rx][ry]===1) {
              data.labels.push({x: rx*this.gridSize, y: ry*this.gridSize, text: namePool[Math.floor(Math.random()*namePool.length)], visible: true});
          }
      }
  }

  erodeBuildings(data) {
      const passes = 3;
      for (let i = 0; i < passes; i++) {
          const changes = [];
          for (let x = 1; x < this.cols - 1; x++) {
              for (let y = 1; y < this.rows - 1; y++) {
                  if (data.grid[x][y] === 1) {
                      let walls = 0;
                      for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++) if(data.grid[x+dx][y+dy]===0) walls++;
                      let chance = 0;
                      if (walls >= 3) chance = 0.4;
                      else if (walls === 2) chance = 0.1;
                      if (Math.random() < chance) changes.push({x, y});
                  }
              }
          }
          changes.forEach(p => data.grid[p.x][p.y] = 0);
      }
  }

  generateLocksAndKeys(data) {
    if (!data.rooms || data.rooms.length < 2) return;
    const KEY_COLORS = ["#ef4444", "#3b82f6", "#eab308", "#a855f7"];
    let availableColors = [...KEY_COLORS];
    
    for (let r of data.rooms) {
        const logic = ROOM_RELATIONS[r.name || ''];
        const isLocked = (logic && logic.tags && logic.tags.includes("Secure"));
        
        if (isLocked && availableColors.length > 0) {
            const door = data.doors.find(d => {
                return Math.abs(d.x - (r.x + r.w/2)) < r.w && Math.abs(d.y - (r.y + r.h)) < 2;
            });
            if (door) {
                const color = availableColors.shift();
                door.locked = true;
                door.keyColor = color;
                
                const otherRooms = data.rooms.filter(or => or !== r);
                if (otherRooms.length > 0) {
                    const keyRoom = otherRooms[Math.floor(Math.random() * otherRooms.length)];
                    const keyItem = { n: `ACCESS CARD (${color})`, v: 50, color: color };
                    
                    const loot = data.loot.find(l => l.x >= keyRoom.x && l.x < keyRoom.x + keyRoom.w && l.y >= keyRoom.y && l.y < keyRoom.y + keyRoom.h);
                    if(loot) {
                        loot.contents.push(keyItem);
                    } else {
                         data.loot.push({
                            x: Math.floor(keyRoom.x + keyRoom.w/2),
                            y: Math.floor(keyRoom.y + keyRoom.h/2),
                            containerName: "Desk",
                            contents: [keyItem],
                            looted: false,
                            isLocked: false
                        });
                    }
                }
            }
        }
    }
  }

  pickWeightedItem(type, requiredFocus = null, isLockedContainer = false) {
    const pool = ITEM_DATABASE[type] || ITEM_DATABASE['cave'];
    let effectivePool = pool;
    
    if (requiredFocus) {
        if (requiredFocus === "HIGH_VALUE") effectivePool = pool.filter(i => i.v >= 70);
        else if (requiredFocus === "MEDS") effectivePool = pool.filter(i => i.n.includes("Stimpak") || i.n.includes("Bag") || i.n.includes("Med"));
        else if (requiredFocus === "AMMO_EXP") effectivePool = pool.filter(i => i.n.includes("Ammo") || i.n.includes("Pistol") || i.n.includes("Rifle"));
        if (effectivePool.length === 0) effectivePool = pool;
    }

    const getWeight = (itemValue) => {
        if (isLockedContainer) {
            if (itemValue >= 25) return 100;
            if (itemValue >= 15) return 20;
            return 5;
        } else {
            if (itemValue < 25) return 100;
            if (itemValue < 75) return 15;
            if (itemValue < 200) return 3;
            return 0.5;
        }
    };

    let totalWeight = effectivePool.reduce((sum, i) => sum + getWeight(i.v), 0);
    let random = Math.random() * totalWeight;

    for(let item of effectivePool) {
        let w = getWeight(item.v);
        random -= w;
        if(random <= 0) return item;
    }
    return effectivePool[0];
  }

  generateLoot(data, type) {
    const mapTheme = type.toUpperCase();
    const mapCategory = (mapTheme === 'VAULT') ? 'Vault' : (mapTheme === 'CAVE' || mapTheme === 'NATURAL') ? 'Cave' : 'Ruins';
    
    let allowedContainerKeys = Object.keys(CONTAINER_DETAILS).filter(key => {
        const details = CONTAINER_DETAILS[key];
        if (details.types.includes(mapCategory)) return true;
        if (mapCategory === 'Ruins' && details.types.includes('Ruins')) return true;
        if (mapCategory === 'Ruins' && details.types.includes('Interior')) return true;
        if (mapCategory === 'Cave' && !details.types.includes('Cave')) return false;
        return false;
    });

    if (allowedContainerKeys.length === 0) allowedContainerKeys = ["Crate", "Corpse", "Sack"];
    const itemPoolKey = (type === 'interior') ? 'ruins' : type;

    for (let x = 1; x < this.cols - 1; x++) {
        for (let y = 1; y < this.rows - 1; y++) {
            if (data.grid[x][y] === 1) {
                if (data.loot.some(l => l.x===x && l.y===y)) continue;
                if (data.doors.some(d => d.x===x && d.y===y)) continue;

                let wallCount = 0;
                for(let dx=-1; dx<=1; dx++) for(let dy=-1; dy<=1; dy++) if(data.grid[x+dx][y+dy]===0) wallCount++;
                
                let chance = (mapTheme === 'VAULT' || mapTheme === 'RUINS') ? (wallCount > 0 ? 0.06 : 0.005) : 0.03;
                if (Math.random() < chance) {
                    const cName = allowedContainerKeys[Math.floor(Math.random() * allowedContainerKeys.length)];
                    const details = CONTAINER_DETAILS[cName];
                    let isLocked = details.lock && Math.random() < 0.6;
                    
                    const numItems = Math.floor(Math.random() * 3) + 1;
                    let contentArray = [];
                    contentArray.push(this.pickWeightedItem(itemPoolKey, details.lootFocus, isLocked));
                    for(let i=1; i<numItems; i++) contentArray.push(this.pickWeightedItem(itemPoolKey, null, isLocked));
                    
                    data.loot.push({
                        x, y,
                        containerName: cName,
                        contents: contentArray,
                        looted: false,
                        isLocked: isLocked,
                        lockDetail: isLocked ? `[${details.skill}]` : ""
                    });
                }
            }
        }
    }
  }

  generateDecorations(data, type, density) {
      let baseChance = density / 1000;
      if (type !== 'vault') baseChance = baseChance * 0.7;
      
      const isIndoors = (type === 'vault' || type === 'interior' || this.currentLevelIndex < 0);
      let poolKey = '';
      if (type === 'cave') poolKey = (this.currentLevelIndex >= 0) ? 'wasteland_surface' : 'wasteland_cave';
      else if (type === 'ruins') poolKey = (this.currentLevelIndex >= 0) ? 'city_street' : 'city_interior';
      else poolKey = 'vault';
      
      let pool = DECO_POOLS[poolKey] || DECO_POOLS.vault;
      
      if (isIndoors) pool = pool.filter(d => !['joshua_tree', 'brahmin_skull', 'boulder', 'car'].includes(d));
      else pool = pool.filter(d => !['server_rack', 'vr_pod', 'auto_doc'].includes(d));

      if ((poolKey.includes('city') || poolKey.includes('vault')) && !pool.includes('vending_machine')) pool.push('vending_machine');
      
      for(let x=1; x<this.cols-1; x++) for(let y=1; y<this.rows-1; y++) {
          if(data.grid[x][y]===1 && Math.random() < baseChance) {
              if (data.loot.some(l => l.x===x && l.y===y)) continue;
              if (data.doors.some(d => d.x===x && d.y===y)) continue;
              
              const decoType = pool[Math.floor(Math.random() * pool.length)];
              data.decorations.push({x, y, type: decoType});
          }
      }
  }

  createPixelPattern(colors, type) {
    const pCanvas = document.createElement('canvas');
    const pCtx = pCanvas.getContext('2d');
    if(!pCtx) return null;
    const size = 128;
    pCanvas.width = size; pCanvas.height = size;
    
    pCtx.fillStyle = colors.base;
    pCtx.fillRect(0,0,size,size);
    
    for(let i=0; i<800; i++) {
        pCtx.fillStyle = (Math.random()>0.5) ? colors.dark : colors.light;
        pCtx.globalAlpha = 0.05;
        pCtx.fillRect(Math.random()*size, Math.random()*size, Math.random()*2+1, Math.random()*2+1);
    }
    pCtx.globalAlpha = 1.0;
    
    if (type === 'vault') {
        pCtx.strokeStyle = colors.noise;
        pCtx.lineWidth = 1;
        for(let i=0; i<=size; i+=32) {
             pCtx.moveTo(i,0); pCtx.lineTo(i,size);
             pCtx.moveTo(0,i); pCtx.lineTo(size,i);
        }
        pCtx.stroke();
        pCtx.fillStyle = colors.dark;
        for(let y=0; y<=size; y+=32) for(let x=0; x<=size; x+=32) pCtx.fillRect(x-1, y-1, 3, 3);
    } else if (type === 'ruins') {
        pCtx.strokeStyle = colors.dark;
        pCtx.lineWidth = 2;
        pCtx.globalAlpha = 0.6;
        for(let i=0; i<8; i++) {
            pCtx.beginPath();
            let sx = Math.random()*size, sy = Math.random()*size;
            pCtx.moveTo(sx, sy);
            pCtx.lineTo(sx+(Math.random()-0.5)*30, sy+(Math.random()-0.5)*30);
            pCtx.stroke();
        }
        pCtx.globalAlpha = 1.0;
    }
    
    return this.ctx.createPattern(pCanvas, 'repeat');
  }

  drawSprite(ctx, type, x, y, size, time) {
      const cx = x + size/2; const cy = y + size/2;
      
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(cx, cy+size*0.3, size*0.4, size*0.15, 0, 0, Math.PI*2); ctx.fill();

      if (type === 'crate' || type === 'ammo_crate') {
          ctx.fillStyle = '#14532d'; ctx.fillRect(x+4, y+size*0.4, size-8, size*0.5);
          ctx.fillStyle = '#166534'; ctx.fillRect(x+4, y+size*0.1, size-8, size*0.3);
          ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1; ctx.strokeRect(x+4, y+size*0.4, size-8, size*0.5);
      }
      else if (type === 'safe') {
          ctx.fillStyle = '#1e293b'; ctx.fillRect(x+size*0.2, y+size*0.2, size*0.6, size*0.7);
          ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(cx, cy, size*0.15, 0, Math.PI*2); ctx.fill();
      }
      else if (type === 'vending_machine') {
          ctx.fillStyle = '#991b1b'; ctx.fillRect(x+4, y-8, size-8, size+4);
          const glow = Math.sin(time/200)*0.5+0.5;
          ctx.fillStyle = `rgba(200, 255, 255, ${0.3+glow*0.2})`;
          ctx.fillRect(x+size/2, y, size/3, size/2);
      }
      else if (type === 'fire_barrel') {
          ctx.fillStyle = '#374151'; ctx.fillRect(x+size*0.25, y+size*0.25, size*0.5, size*0.75);
          const pTime = time / 100;
          ctx.globalCompositeOperation = 'lighter';
          for(let i=0; i<8; i++) {
              const fy = (pTime + i*1.5) % 10;
              const fx = Math.sin(pTime + i) * 4;
              ctx.fillStyle = `rgba(250, 204, 21, ${1-fy/10})`;
              ctx.fillRect(cx+fx-2, y+size*0.25-fy*2, 4, 4);
          }
          ctx.globalCompositeOperation = 'source-over';
      }
      else if (type === 'server_rack') {
           ctx.fillStyle = '#111827'; ctx.fillRect(x+size*0.25, y+size*0.1, size*0.5, size*0.8);
           if(Math.random() > 0.1) {
               ctx.fillStyle = (Math.sin(time/100)>0) ? '#22c55e' : '#064e3b';
               ctx.fillRect(x+size*0.35, y+size*0.6, 2, 2);
           }
      }
      else {
          ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();
      }
  }

  draw(time) {
      const data = this.viewMode === 'interior' ? this.interiorData[this.currentInteriorKey] : this.floorData[this.currentLevelIndex];
      const gs = this.gridSize;
      
      this.ctx.fillStyle = '#050505';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      this.ctx.save();
      this.ctx.scale(this.RENDER_SCALE, this.RENDER_SCALE);
      this.ctx.translate(this.mapOffsetX, this.mapOffsetY);
      
      if (!data) {
          this.ctx.font = "bold 30px 'VT323', monospace";
          this.ctx.fillStyle = '#ef4444';
          this.ctx.textAlign = "center";
          this.ctx.fillText(">> NO SIGNAL <<", this.width/2, this.height/2);
          this.ctx.restore();
          return;
      }
      
      let pal = PALETTES.vault;
      let pType = 'vault';
      if (this.mapType === 'ruins') { pal = PALETTES.ruins; pType = 'ruins'; }
      else if (this.mapType === 'cave') { pal = PALETTES.cave; pType = 'cave'; }
      
      if (!this.patternCache[pType]) {
          const p = this.createPixelPattern(pal.floor, pType);
          if(p) this.patternCache[pType] = p;
      }
      const floorPattern = this.patternCache[pType] || pal.floor.base;

      for(let x=0; x<this.cols; x++) for(let y=0; y<this.rows; y++) {
          if(data.grid[x][y] >= 1) {
              const px = x*gs; const py = y*gs;
              this.ctx.fillStyle = floorPattern;
              this.ctx.fillRect(px, py, gs, gs);
              
              if(this.fogEnabled) {
                  const isRevealed = data.rooms.some(r => r.visited && x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h);
                  if(!isRevealed && this.cloudCanvas) {
                      const sx = (px + (time*0.02))%512;
                      const sy = (py + (time*0.01))%512;
                      this.ctx.drawImage(this.cloudCanvas, sx, sy, gs, gs, px, py, gs, gs);
                      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
                      this.ctx.fillRect(px, py, gs, gs);
                  }
              }
              
              if (pType !== 'cave') {
                   if (y < this.rows-1 && data.grid[x][y+1] === 0) {
                        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        this.ctx.fillRect(px, py+gs-4, gs, 4);
                   }
              }
          }
      }
      
      if (data.decorations) for(let d of data.decorations) {
           const isRevealed = data.rooms.some(r => r.visited && d.x>=r.x && d.x<r.x+r.w && d.y>=r.y && d.y<r.y+r.h);
           if(this.fogEnabled && !isRevealed) continue;
           this.drawSprite(this.ctx, d.type, d.x*gs, d.y*gs, gs, time);
      }
      
      for(let l of data.loot) {
          const isRevealed = data.rooms.some(r => r.visited && l.x>=r.x && l.x<r.x+r.w && l.y>=r.y && l.y<r.y+r.h);
          if(this.fogEnabled && !isRevealed) continue;
          
          let sType = "crate";
          if (l.containerName.includes("Safe")) sType = "safe";
          if (l.containerName.includes("Ammo")) sType = "ammo_crate";
          
          if(l.looted) {
              this.ctx.globalAlpha = 0.5;
              this.drawSprite(this.ctx, sType, l.x*gs, l.y*gs, gs, time);
              this.ctx.globalAlpha = 1.0;
          } else {
              this.drawSprite(this.ctx, sType, l.x*gs, l.y*gs, gs, time);
              this.ctx.globalCompositeOperation = 'lighter';
              const g = this.ctx.createRadialGradient(l.x*gs+gs/2, l.y*gs+gs/2, 0, l.x*gs+gs/2, l.y*gs+gs/2, gs/2);
              g.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
              g.addColorStop(1, 'rgba(0,0,0,0)');
              this.ctx.fillStyle = g; this.ctx.fillRect(l.x*gs, l.y*gs, gs, gs);
              this.ctx.globalCompositeOperation = 'source-over';
              
              if(l.isLocked) {
                  this.ctx.fillStyle = '#ef4444';
                  this.ctx.fillRect(l.x*gs+gs/2-3, l.y*gs+gs/2-4, 6, 8);
              }
          }
      }
      
      this.ctx.restore();
      
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
      this.ctx.fillRect(0,0, this.width*this.RENDER_SCALE, this.height*this.RENDER_SCALE);
      
      this.ctx.fillStyle = 'rgba(200, 255, 200, 0.2)';
      for(let m of this.dustMotes) {
          m.x += m.speedX; m.y += m.speedY;
          if(m.x < 0) m.x = this.width; if(m.x > this.width) m.x = 0;
          if(m.y < 0) m.y = this.height; if(m.y > this.height) m.y = 0;
          this.ctx.fillRect(m.x * this.RENDER_SCALE, m.y * this.RENDER_SCALE, m.size*this.RENDER_SCALE, m.size*this.RENDER_SCALE);
      }
      this.ctx.restore();
      
      this.ctx.save();
      this.ctx.scale(this.RENDER_SCALE, this.RENDER_SCALE);
      this.ctx.translate(this.mapOffsetX, this.mapOffsetY);
      
      for(let t of this.tokens) {
          this.ctx.fillStyle = t.color;
          this.ctx.beginPath(); this.ctx.arc(t.x, t.y, 10, 0, Math.PI*2); this.ctx.fill();
          this.ctx.fillStyle = '#fff';
          this.ctx.font = "10px monospace";
          this.ctx.textAlign = "center";
          this.ctx.fillText(t.label, t.x, t.y + 15);
      }
      
      if (this.showLabels && data.labels) {
          this.ctx.font = "bold 12px 'VT323', monospace";
          this.ctx.textAlign = "center";
          for(let lbl of data.labels) {
              if (this.fogEnabled) {
                  const isRevealed = data.rooms.some(r => r.visited && Math.abs(r.x*gs - lbl.x) < r.w*gs && Math.abs(r.y*gs - lbl.y) < r.h*gs);
                  if(!isRevealed) continue;
              }
              const w = this.ctx.measureText(lbl.text).width + 8;
              this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
              this.ctx.fillRect(lbl.x - w/2, lbl.y - 8, w, 16);
              this.ctx.fillStyle = '#22c55e';
              this.ctx.fillText(lbl.text, lbl.x, lbl.y+4);
          }
      }
      
      this.ctx.restore();
  }
}
