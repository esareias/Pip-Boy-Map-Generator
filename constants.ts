// --- GAME CONSTANTS ---

export const BUILDING_ARCHETYPES: Record<string, any> = {
    MEDICAL: {
        keywords: ["HOSPITAL", "CLINIC", "MEDICAL", "DOCTOR", "LAB", "ER "],
        mandatory: ["Lobby", "ER Waiting Room"],
        allowed: ["Triage Center", "Patient Ward", "Nurse Station", "Operating Theater", "Pharmacy", "X-Ray Room", "Quarantine Cell", "Morgue", "Cafeteria", "Doctor's Office", "Medical Storage", "Gift Shop", "Scrub Room", "Burn Ward"],
        unique: ["Chief's Office", "Auto-Doc Chamber", "Experimental Lab", "Cryo-Storage"]
    },
    POLICE: {
        keywords: ["POLICE", "PRECINCT", "STATION", "OUTPOST", "SECURITY", "JAIL", "PRISON"],
        mandatory: ["Precinct Lobby", "Desk Sergeant"],
        allowed: ["Bullpen", "Holding Cells", "Interrogation Room", "Evidence Locker", "Armory", "Shooting Range", "Locker Room", "Briefing Room", "Detective's Office", "Kennel", "Drunk Tank"],
        unique: ["Chief's Office", "SWAT Gear Storage", "Secure Evidence Vault"]
    },
    INDUSTRIAL: {
        keywords: ["FACTORY", "PLANT", "POWER", "INDUSTRIAL", "ASSEMBLY", "WORKS", "REFINERY"],
        mandatory: ["Loading Dock", "Assembly Floor"],
        allowed: ["Machine Shop", "Foreman's Office", "Catwalks", "Generator Room", "Parts Storage", "Conveyor Maze", "Hazmat Disposal", "Locker Room", "Break Room", "Vat Room", "Boiler Room", "Smelting Pit"],
        unique: ["Main Control Room", "Reactor Core", "Prototype Assembly"]
    },
    ENTERTAINMENT: {
        keywords: ["CASINO", "HOTEL", "THEATER", "RESORT", "SPA", "CLUB", "LOUNGE"],
        mandatory: ["Grand Lobby", "Reception"],
        allowed: ["Ballroom", "Bar", "Guest Room", "Suite", "Kitchen", "Casino Floor", "Stage", "Backstage", "Dressing Room", "Manager's Office", "Vault", "Security Room", "Pool Area", "VIP Lounge"],
        unique: ["Penthouse Suite", "High Roller Room", "Director's Office", "Broadcast Booth"]
    },
    COMMERCIAL: {
        keywords: ["OFFICE", "SKYSCRAPER", "TOWER", "BANK", "AGENCY", "CORP"],
        mandatory: ["Lobby", "Security Desk"],
        allowed: ["Cubicle Farm", "Conference Room", "Executive Suite", "Break Room", "Server Room", "File Storage", "Mail Room", "Janitor Closet", "Restroom", "Server Farm", "Copy Room"],
        unique: ["CEO's Penthouse", "Mainframe Core", "Secret Wall Safe"]
    },
    RETAIL: {
        keywords: ["SHOP", "STORE", "MART", "BODEGA", "GROCERY", "MARKET", "MALL", "DINER", "BAR", "SALOON"],
        mandatory: ["Sales Floor"],
        allowed: ["Cashier Counter", "Stockroom", "Manager's Office", "Restroom", "Loading Bay", "Changing Rooms", "Cold Storage", "Kitchenette", "Alley Access"],
        unique: ["Safe Room", "Pharmacy Counter", "Hidden Basement"]
    },
    NATURAL: {
        keywords: ["CAVE", "HOLE", "BURROW", "DEN", "CLIFF", "PASS", "NEST", "GROTTO"],
        mandatory: ["Cave Entrance"],
        allowed: ["Damp Cavern", "Narrow Tunnel", "Underground Lake", "Glowing Mushroom Grove", "Rockfall", "Bear Den", "Pre-War Skeleton", "Supply Cache", "Fissure", "Bat Roost", "Crystal Formation", "Subterranean River"],
        unique: ["Queen's Nest", "Hidden Pre-War Bunker", "Crash Site", "Legendary Creature Den"]
    },
    BUNKER: {
        keywords: ["BUNKER", "SHELTER", "SILO", "BASE", "OUTPOST", "MILITARY"],
        mandatory: ["Blast Door", "Decontamination"],
        allowed: ["Barracks", "Mess Hall", "Armory", "Comms Room", "Generator", "Storage", "Officer Quarters", "War Room", "Firing Range", "Med Bay"],
        unique: ["Missile Silo", "Command Center", "Power Armor Station"]
    },
    SEWER: {
        keywords: ["SEWER", "DRAIN", "TUNNEL", "METRO", "SUBWAY"],
        mandatory: ["Maintenance Access", "Drainage Pipe"],
        allowed: ["Sluice Gate", "Pump Room", "Worker Tunnel", "Collapsed Section", "Rat Nest", "Raider Camp", "Sludge Pit", "Catwalk"],
        unique: ["Ghoulish Shrine", "Lost Engineering Deck", "Mutant Lair"]
    },
    CULT: {
        keywords: ["CHURCH", "CATHEDRAL", "SHRINE", "TEMPLE", "ALTAR"],
        mandatory: ["Nave", "Altar"],
        allowed: ["Pews", "Confessional", "Crypt", "Bell Tower", "Sacristy", "Graveyard", "Ritual Chamber", "Dormitory"],
        unique: ["Reliquary", "High Priest's Chamber", "Sacrificial Pit"]
    },
    VAULT: {
        keywords: ["VAULT", "SHELTER"],
        mandatory: ["Entrance Airlock", "Overseer's Office"],
        allowed: ["Atrium (Hub)", "Cafeteria", "Kitchen", "Clinic", "Quarters", "Classroom", "Water Purification", "Reactor Core", "Storage Closet", "Security Station", "Gym", "Hydroponics Jungle", "VR Pods"],
        unique: ["Entrance Airlock", "Overseer's Office", "Reactor Core", "Mainframe/ZAX Room", "Secret Experiment Lab"]
    },
    GENERIC: { keywords: [], mandatory: ["Entrance"], allowed: ["Room", "Hallway", "Storage", "Utility", "Restroom"], unique: [] }
};

export const ROOM_RELATIONS: Record<string, any> = {
    "Cave Entrance": { tags: ["Nature", "Transition"], link: ["Damp Cavern", "Narrow Tunnel", "Bear Den"], avoid: ["Office", "Clean"] },
    "Damp Cavern": { tags: ["Nature"], link: ["Underground Lake", "Glowing Mushroom Grove", "Narrow Tunnel", "Bat Roost"], avoid: ["Clean", "Tech"] },
    "Narrow Tunnel": { tags: ["Nature"], link: ["Damp Cavern", "Bear Den", "Crystal Formation"], avoid: ["Grand"] },
    "Underground Lake": { tags: ["Water", "Nature"], link: ["Damp Cavern", "Subterranean River"], avoid: ["Fire", "Tech"] },
    "Glowing Mushroom Grove": { tags: ["Nature", "Light"], link: ["Damp Cavern", "Toxic Pit"], avoid: [] },
    "Bear Den": { tags: ["Nature", "Danger"], link: ["Narrow Tunnel", "Bone Pile"], avoid: ["Civilized"] },
    "Queen's Nest": { tags: ["Nature", "Boss"], link: ["Narrow Tunnel"], avoid: ["Safe"] },
    "Blast Door": { tags: ["Military", "Secure"], link: ["Decontamination", "Security Station"], avoid: ["Nature"] },
    "Barracks": { tags: ["Military", "Living"], link: ["Mess Hall", "Locker Room", "Showers"], avoid: ["Public"] },
    "War Room": { tags: ["Military", "Command"], link: ["Comms Room", "Officer Quarters"], avoid: ["Barracks"] },
    "Missile Silo": { tags: ["Military", "Tech", "High"], link: ["Command Center"], avoid: ["Nature"] },
    "Grand Lobby": { tags: ["Grand"], link: ["Casino Floor", "Ballroom", "Bar", "Reception"], avoid: ["Dirty", "Industrial"] },
    "Casino Floor": { tags: ["Loud", "Grand"], link: ["Bar", "High Roller Room", "Vault", "Cashier Cage"], avoid: ["Kitchen", "Bedroom"] },
    "Kitchen": { tags: ["Service", "Loud"], link: ["Cafeteria", "Dining Hall", "Cold Storage", "Pantry"], avoid: ["Bedroom", "Toilet", "Morgue", "Office"] },
    "Morgue": { tags: ["Cold", "Dirty", "Creepy"], link: ["Clinic", "Crematorium", "Autopsy Room"], avoid: ["Kitchen", "Cafeteria", "Nursery"] },
    "Cubicle Farm": { tags: ["Office", "Boring"], link: ["Conference Room", "Break Room", "Manager's Office"], avoid: ["Industrial", "Nature"] },
    "Executive Suite": { tags: ["Office", "Luxury"], link: ["Conference Room", "Private Bath"], avoid: ["Cubicle Farm", "Janitor Closet"] },
    "Server Room": { tags: ["Tech", "Cold"], link: ["IT Office", "Cooling System"], avoid: ["Water"] },
    "Drainage Pipe": { tags: ["Sewer", "Dirty"], link: ["Sluice Gate", "Rat Nest"], avoid: ["Clean"] },
    "Rat Nest": { tags: ["Nature", "Dirty"], link: ["Drainage Pipe"], avoid: ["Tech"] },
    "Mutant Lair": { tags: ["Danger", "Dirty"], link: ["Sludge Pit", "Collapsed Section"], avoid: ["Clean"] },
    "Hallway": { tags: ["Connector"], link: [], avoid: [] },
    "Corridor": { tags: ["Connector"], link: [], avoid: [] },
    "Stairs": { tags: ["Connector", "Vertical"], link: [], avoid: [] }
};

export const PALETTES: Record<string, any> = {
    vault: { bg: '#050505', floor: { base: '#2b3330', dark: '#1e2522', light: '#4d5953', noise: '#6f8179' }, wall: { top: '#546e7a', front: '#37474f', outline: '#263238', highlight: '#78909c' }, accent: '#fbbf24' },
    ruins: { bg: '#0a0908', floor: { base: '#3c3836', dark: '#282828', light: '#504945', noise: '#665c54' }, wall: { top: '#8b4513', front: '#5c3317', outline: '#3e2723', highlight: '#a0522d' }, accent: '#ef4444' },
    cave: { bg: '#1a1612', floor: { base: '#c2b280', dark: '#a39264', light: '#e0d2a8', noise: '#8c7e58' }, wall: { top: '#8b7355', front: '#5c4b37', outline: '#2b2218', highlight: '#a68a66' }, accent: '#eab308' },
    interior_ruins: { bg: '#080a10', floor: { base: '#1e293b', dark: '#0f172a', light: '#334155', noise: '#475569' }, wall: { top: '#475569', front: '#1e293b', outline: '#0f172a', highlight: '#64748b' }, accent: '#38bdf8' },
    interior_cave: { bg: '#100d0c', floor: { base: '#362823', dark: '#241a17', light: '#4a3731', noise: '#5d453e' }, wall: { top: '#4e342e', front: '#3e2723', outline: '#211512', highlight: '#6d4c41' }, accent: '#fbbf24' }
};

export const TOKEN_PRESETS = [
    { name: "OVERSEER", color: "#16ff60", src: "https://i.redd.it/oaoxjcgfbnwc1.jpeg", isHostTrigger: true },
    { name: "Scabigail", color: "#eab308", src: "https://i.postimg.cc/Hx0nX4vK/Scabigail_Vault_Boy.png" },
    { name: "Sally", color: "#16ff60", src: "https://i.postimg.cc/hjRhX3s6/Sally_Vault_Boy.png" },
    { name: "K2-1B", color: "#ef4444", src: "https://i.postimg.cc/LXk5LBQG/K2_Vault_Boy.png" },
    { name: "Bulk McHuge-Large", color: "#3b82f6", src: "https://i.postimg.cc/C1C5kH6T/Bulk_Vault_Boy.png" },
    { name: "Sylvie", color: "#a855f7", src: "https://i.postimg.cc/tTdJWtvm/Sylvie_Vault_Boy.png" },
    { name: "Melody Jones", color: "#ffffff", src: "https://i.postimg.cc/3RjNmCb7/Melody_Vault_Boy.png" }
];

export const CONTAINER_DETAILS: Record<string, any> = {
    "Safe": { types: ["Ruins", "Vault"], lootFocus: "HIGH_VALUE", lock: true, skill: "LOCKPICK" },
    "Locker": { types: ["Vault", "Ruins"], lootFocus: "JUMPSUIT_GUNS", lock: true, skill: "LOCKPICK" },
    "Footlocker": { types: ["Vault", "Ruins"], lootFocus: "JUMPSUIT_GUNS", lock: true, skill: "LOCKPICK" },
    "Toolbox": { types: ["Ruins", "Vault"], lootFocus: "REPAIR_JUNK", lock: true, skill: "LOCKPICK" },
    "Desk": { types: ["Vault", "Ruins", "Interior"], lootFocus: "PAPER_JUNK", lock: false, skill: null },
    "File Cabinet": { types: ["Vault", "Ruins", "Interior"], lootFocus: "PAPER_JUNK", lock: true, skill: "SCIENCE" },
    "Medkit": { types: ["Ruins", "Interior", "Vault"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },
    "First Aid": { types: ["Vault", "Interior"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },
    "Doctor's Bag": { types: ["Vault", "Cave"], lootFocus: "MEDS", lock: true, skill: "LOCKPICK" },
    "Register": { types: ["Ruins", "Interior"], lootFocus: "LOW_CAPS", lock: true, skill: "LOCKPICK" },
    "Cashier": { types: ["Ruins"], lootFocus: "LOW_CAPS", lock: true, skill: "LOCKPICK" },
    "Vending Machine": { types: ["Ruins", "Vault"], lootFocus: "NUKA_COLA", lock: true, skill: "LOCKPICK" },
    "Cooler": { types: ["Vault", "Cave"], lootFocus: "FOOD_WATER", lock: false, skill: null },
    "Ammo Box": { types: ["Ruins", "Cave"], lootFocus: "AMMO_EXP", lock: true, skill: "LOCKPICK" },
    "Duffel Bag": { types: ["Cave", "Ruins"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Corpse": { types: ["Cave", "Ruins"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Hollow Rock": { types: ["Cave"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Sack": { types: ["Cave"], lootFocus: "SURVIVAL", lock: false, skill: null },
    "Crate": { types: ["Cave", "Ruins", "Vault"], lootFocus: "JUNK", lock: false, skill: null },
    "Dumpster": { types: ["Ruins"], lootFocus: "JUNK", lock: false, skill: null },
};

export const ITEM_DATABASE: Record<string, any[]> = {
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

export const DECO_POOLS: Record<string, string[]> = {
    wasteland_surface: ["joshua_tree", "brahmin_skull", "boulder", "skeleton", "rad_puddle", "fire_barrel"],
    wasteland_cave: ["glowing_fungus", "rock_pile", "skeleton", "gore_bag", "campfire", "mattress", "rad_puddle"],
    city_street: ["car", "rubble", "tire_pile", "traffic_cone", "broken_pole", "street_sign", "vending_machine", "fire_barrel"],
    city_interior: ["bed", "table", "chair", "file_cabinet", "rubble", "radio", "ammo_crate", "vending_machine"],
    vault: ["server_rack", "vr_pod", "wall_terminal", "vent_grate", "filing_cabinet", "stacked_crates", "water_pipe", "bulletin_board", "diner_booth", "food_dispenser", "jumpsuit_locker", "auto_doc", "skeleton_blue", "blood_stain", "barricade"]
};

export const SUB_THEMES: Record<string, string[]> = {
    residential: ["Apartment Lobby", "Laundry Room", "Boiler Room", "Storage Unit", "Rooftop Garden", "Collapsed Suite"],
    sewer: ["Drainage Pipe", "Maintenance Walkway", "Sluice Gate", "Control Room", "Rat Nest"],
    industrial: ["Assembly Line", "Loading Bay", "Foreman Office", "Generator Room", "Smelting Vat"],
    creepier: ["Morgue", "Crypt", "Surgical Theater", "Evidence Room", "Ritual Site"]
};

export const NAMES: Record<string, string[]> = {
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

export const NON_ENTERABLE = [ "Street", "Crater", "Park", "Alley", "Overpass", "Catwalk", "Ramp", "Pass", "Riverbed", "Tar Pit", "Shore", "Drive-In", "Scrapyard", "Bridge", "Wind Farm", "Solar Array", "Picnic", "Golf", "Ski", "Crash", "Wreck" ];
