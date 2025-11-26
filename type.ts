export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  w: number;
  h: number;
}

export interface Room extends Rect {
  name?: string;
  visited: boolean;
}

export interface Stair extends Point {
  type: 'up' | 'down';
}

export interface Label extends Point {
  text: string;
  visible: boolean;
}

export interface Item {
  n: string; // name
  v: number; // value
  color?: string;
}

export interface LootContainer extends Point {
  containerName: string;
  contents: Item[];
  looted: boolean;
  isLocked: boolean;
  lockDetail?: string;
}

export interface Door extends Point {
  locked: boolean;
  keyColor?: string;
  parentRoom?: Room;
}

export interface Decoration extends Point {
  type: string;
}

export interface FloorData {
  grid: number[][]; // 0=wall, 1=floor, 2=water
  rooms: Room[];
  stairs: Stair[];
  labels: Label[];
  loot: LootContainer[];
  doors: Door[];
  decorations: Decoration[];
  exit?: Point; // For interiors
  mapType?: string; // Metadata for reconstruction
}

export interface Token {
  id: number | string;
  x: number;
  y: number;
  label: string;
  color: string;
  src: string;
  img?: HTMLImageElement | null;
  isHostTrigger?: boolean;
}

export interface PeerMessage {
  type: 'CHAT' | 'SYNC';
  sender?: string;
  message?: string;
  color?: string;
  floorData?: Record<string, FloorData>;
  tokens?: any[];
  levelIdx?: number;
  mapType?: string;
  interiorData?: Record<string, FloorData>;
  viewMode?: 'sector' | 'interior';
  currentInteriorKey?: string | null;
}

export type MapType = 'vault' | 'ruins' | 'cave';
export type ViewMode = 'sector' | 'interior';
