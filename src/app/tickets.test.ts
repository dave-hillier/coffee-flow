import { describe, expect, it } from 'vitest';
import { Levels, Sim } from './engine';
import { newlyMetGoals, railTickets, tutorialStep } from './tickets';

const kiosk = () => Levels.byId('kiosk')!;

describe('the tutorial', () => {
  it('starts by asking for a till, pointing at the Counters tray', () => {
    const S = Sim.create(kiosk().seed, null, {}, kiosk());
    const step = tutorialStep(S, kiosk())!;
    expect(step.title).toBe('Place a till');
    expect(step.arg).toBe('counters');
  });

  it('moves on to building once the crates are down', () => {
    const S = Sim.create(kiosk().seed, null, {}, kiosk());
    expect(Sim.act(S, 'place', 'till', 4, 8, 0)).toBeNull();
    expect(Sim.act(S, 'place', 'pickup', 6, 8, 0)).toBeNull();
    expect(Sim.act(S, 'place', 'brewer', 2, 6, 0)).toBeNull();
    expect(tutorialStep(S, kiosk())!.title).toBe('Build the crates');
  });
});

describe('the rail', () => {
  it('shows the level brief until it is dismissed', () => {
    const S = Sim.create(kiosk().seed, null, {}, kiosk());
    const titles = (dismissed: Set<string>) => railTickets({ S, level: kiosk(), dismissed, goalsMet: new Set() }).shown.map((t) => t.title);
    expect(titles(new Set())).toContain('The Kiosk');
    expect(titles(new Set(['brief']))).not.toContain('The Kiosk');
  });

  it('puts the tutorial step first', () => {
    const S = Sim.create(kiosk().seed, null, {}, kiosk());
    expect(railTickets({ S, level: kiosk(), dismissed: new Set(), goalsMet: new Set() }).shown[0].sev).toBe('step');
  });
});

describe('free play milestones', () => {
  it('are met in order and only once', () => {
    const S = Sim.create(1);
    S.st.served = 60;
    const met = new Set<string>();
    expect(newlyMetGoals(S, met)).toEqual(['serve50']);
    expect(newlyMetGoals(S, met)).toEqual([]);
  });
});
