// The shared domain files, loaded exactly as the headless tools load them: each attaches itself to the global object.
// This module gives them types for the browser game. Only the parts the game reads are described.
import '../sim.js';
import '../levels.js';
import '../bot.js';

export type Cell = { x: number; z: number };

export interface CatEntry {
  name: string; w: number; d: number; ws: string; cs: string | null; blurb: string;
  cost: number; mins: number; cap: number;
}
export interface ProdEntry {
  name: string; machine: string; grinds?: boolean; stations?: string[];
  price: number; cost: number; make: number; grind?: number; doses?: number;
  [station: string]: unknown;
}
export interface Topic {
  lane: string; name: string; blurb: string; sets?: string[]; unlocks?: string[]; needs?: string[];
}
export interface ItemRules { cost: number; buildMins: number; slots?: number; hopper?: number; knock?: number; sacks?: number }
export interface Rules {
  startCash: number;
  room: { x0: number; x1: number; z0: number };
  fail: { overdraft: number; overdrawnMins: number; sat: number; satMins: number; after: number };
  supply: { sackDoses: number; sackCost: number; leadMins: number };
  research: { enabled: number; rate: number; switchPct: number; topics: Record<string, { work: number; to?: number; pct?: number }> };
  wagePerMin: number; rentPerMin: number; hireCost: number; maxWorkers: number;
  mix: Record<string, number>;
  demand: { base: number; perLevel: number; menuBonus: number; growAt: number; gain: number; walkoutLoss: number; max: number };
  items: Record<string, ItemRules>;
  CAT: Record<string, CatEntry>;
  PROD: Record<string, ProdEntry>;
}

export interface Item {
  id: number; type: string; x: number; z: number; r: number; n: number; built: boolean;
  work: number; total: number; buf: number[]; queue: number[]; cap: number; util: number;
  beans: number; grounds: number; sacks: number; chore: number | null;
  wc: Cell; cc: Cell | null;
}
export interface Agent {
  id: number; x: number; z: number; path: Cell[]; prog: number; spd: number;
  anim: string; face: number | null;
}
export interface Worker extends Agent {
  name: string; load: string | null; all: boolean; patch: number[]; builds: number[];
  task: { kind: string } | null; carry: number | null; util: number; status: string; leaving: boolean;
}
export interface Customer extends Agent {
  look: number; arrive: number; pat: number; state: string; outcome: number | null; carry: string | null;
}
export interface Cup { id: number; prod: string; state: string; at: number; waste?: boolean }
export interface ResearchState { done: number; weight: number; complete: boolean; started: number; finished: number }
export interface Goal { kind: string; title: string; n?: number; mins?: number; p?: string; walkPct?: number; lead?: number }
export interface Level {
  id: string; n: number; title: string; seed: number; tutorial?: boolean; brief: string; lesson?: string;
  goals: Goal[]; rules: Record<string, unknown>;
}
export interface SimEvent { n: number; t: number; text: string; kind: string }
export interface Mark { t: number; kind: string; text: string }

export interface GameState {
  R: Rules; over: Record<string, unknown>; seed: number; t: number; cash: number; open: boolean;
  level: Level | null; goal: number; end: { won: boolean; why: string; text: string; t: number } | null;
  judge: { red: number; poor: number; streak: number };
  items: Item[]; workers: Worker[]; customers: Customer[]; cups: Cup[];
  imap: Record<number, Item>; wmap: Record<number, Worker>;
  menuOff: Record<string, boolean>; log: unknown[]; pending: unknown[]; events: SimEvent[]; served: unknown[];
  supply: { door: number; onOrder: number; orders: { due: number }[]; auto: { point: number; qty: number } };
  resPlan: string[]; research: Record<string, ResearchState>;
  acts: Record<string, { name: string; left?: boolean; segs: [string, number, number][] }>;
  marks: Mark[];
  hist: Record<string, number[]>;
  st: {
    arrived: number; served: number; abandoned: number; sat: number; demand: number; lead: number;
    beansBought: number; beansUsed: number;
  };
}

export interface SimApi {
  VERSION: number; GW: number; GH: number; IN: number;
  CAT: Record<string, CatEntry>; PROD: Record<string, ProdEntry>; PKEYS: string[]; BASE: string[];
  TOPICS: Record<string, Topic>; TKEYS: string[];
  DEFAULT_RULES: Rules;
  create(seed: number, log?: unknown[] | null, rules?: Record<string, unknown>, level?: Level | null): GameState;
  step(S: GameState): void;
  act(S: GameState, op: string, ...args: unknown[]): string | null;
  canPlace(S: GameState, type: string, x: number, z: number, r: number): string | null;
  whyNotRemove(S: GameState, it: Item): string | null;
  whyNotOpen(S: GameState): string | null;
  offered(S: GameState): string[];
  unlocked(S: GameState, p: string): boolean;
  label(S: GameState, it: Item): string;
  dimsOf(type: string, r: number): [number, number];
  wcell(it: { type: string; x: number; z: number; r: number }, grid?: unknown): Cell;
  ccell(it: { type: string; x: number; z: number; r: number }): Cell | null;
  encode(S: GameState): string;
  decode(code: string): { seed: number; log: unknown[]; rules: Record<string, unknown>; level: string | null; current: boolean };
  topicChanges(R: Rules, k: string): { path: string; from: number; to: number }[];
  routeTo(S: GameState, k: string): string[];
  prereqs(k: string): string[];
  recipe(S: GameState, p: string): { type: string; secs: number }[];
  needsResearch(S: GameState, thing: string): string | null;
  allowed(S: GameState, type: string): boolean;
  topicOpen(S: GameState, k: string): boolean;
  inRoom(S: GameState, c: Cell): boolean;
  goalNow(S: GameState, g: Goal): { v: number; of: number };
  goalOf(S: GameState): Goal | null;
}

export interface BotPlayer { name: string }
export interface Strategy { name: string; blurb: string }
export interface TrialResult {
  finalCash: number; minCash: number; lastHour: number; served: number; abandoned: number; arrived: number;
  sat: number; workers: number; items: string[]; cash: number[];
}
export interface BotApi {
  STRATS: Record<string, Strategy>;
  create(key: string): BotPlayer;
  tick(bot: BotPlayer, S: GameState, say: (m: string) => void): void;
  trial(key: string, seed: number, hours: number): TrialResult;
}
export interface LevelsApi { LEVELS: Level[]; byId(id: string): Level | null }

const g = globalThis as unknown as { CoffeeSim: SimApi; CoffeeLevels: LevelsApi; CoffeeBot: BotApi };
export const Sim = g.CoffeeSim;
export const Levels = g.CoffeeLevels;
export const Bot = g.CoffeeBot;
