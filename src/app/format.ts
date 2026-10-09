import type { CatEntry } from './engine';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (p: number) => GBP.format(p / 100);
export const price = (c: CatEntry) => (c.cost ? money(c.cost) : 'Free');
export function fmtTime(t: number) { const m = Math.floor(t / 60); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
export function fmtClock(t: number) { const m = Math.floor(t / 60); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }
export const secsText = (n: number) => n >= 60 ? Math.floor(n / 60) + 'm ' + String(n % 60).padStart(2, '0') + 's' : n + 's';
export const pct = (v: number) => Math.round(v * 100) + '%';
