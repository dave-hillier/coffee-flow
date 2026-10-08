/* Coffee Flow levels: data only. Each level starts from an empty room and is a set of rule overrides (see
   DEFAULT_RULES in src/sim.js) plus a seed, a brief, goals met in order and an optional time limit in game minutes.
   The sim judges the goals and the failure rules, so headless runs score a level exactly as the game does. */
(function (root) {
  'use strict';
  const ALL_LANES = 'counter bar drinks menu beans guests team';
  const LEVELS = [
    {
      id: 'kiosk', n: 1, title: 'The Kiosk', seed: 11, tutorial: true,
      brief: 'A coffee cart in a station concourse: one person, one brewer, filter coffee only. Build it, open up and serve your first customers.',
      lesson: 'One worker doing everything is simple one-piece flow. Nothing piles up because nothing can.',
      rules: {
        startCash: 40000, 'start.sacks': 2, maxWorkers: 1, 'patience.min': 1800,
        'room.x0': 2, 'room.x1': 7, 'room.z0': 6,
        'allow.items': 'till pickup brewer', 'allow.lanes': ''
      },
      goals: [{ kind: 'served', n: 20, title: 'Serve 20 customers' }]
    },
    {
      id: 'rush', n: 2, title: 'Morning Rush', seed: 22,
      brief: 'A bigger kiosk by the station exit, with more trade than one person can serve. You can take on a second pair of hands.',
      lesson: 'Specialisation creates queues, and a bigger buffer is not more throughput.',
      rules: {
        startCash: 50000, 'start.sacks': 3, maxWorkers: 2, 'demand.base': 16,
        'room.x0': 2, 'room.x1': 7, 'room.z0': 4,
        'allow.items': 'till pickup brewer', 'allow.lanes': 'counter',
        'fail.overdraft': 10000, 'fail.overdrawnMins': 30, 'fail.sat': 0.3, 'fail.satMins': 30
      },
      goals: [{ kind: 'served', n: 60, title: 'Serve 60 customers' }],
      limitMins: 300
    },
    {
      id: 'corner', n: 3, title: 'The Corner Café', seed: 33,
      brief: 'A proper café with a back door and room to grow. Customers want espresso: there is money for the machine, but staff need training first, and installing it takes them off the floor.',
      lesson: 'Installing equipment takes the workers who are serving, and research that runs in parallel finishes later.',
      rules: {
        startCash: 100000, maxWorkers: 3,
        'room.x0': 2, 'room.x1': 9, 'room.z0': 4,
        'allow.items': 'till pickup brewer grinder espresso stock store', 'allow.lanes': 'counter bar beans',
        'fail.overdraft': 20000, 'fail.overdrawnMins': 30, 'fail.sat': 0.35, 'fail.satMins': 20
      },
      goals: [{ kind: 'menu', p: 'espresso', title: 'Put espresso on the menu' }, { kind: 'served', n: 120, title: 'Serve 120 customers' }],
      limitMins: 480
    },
    {
      id: 'high', n: 4, title: 'High Street', seed: 44,
      brief: 'A high-street unit with money to fit out a full bar. Lattes go grinder, machine, milk: how you lay that out matters more than any one upgrade.',
      lesson: 'The bottleneck moves when you fix it, and layout is capacity.',
      rules: {
        startCash: 150000, maxWorkers: 4, 'start.demand': 0.2, 'research.topics.espresso.work': 0,
        'room.x0': 0, 'room.x1': 9, 'room.z0': 2,
        'allow.lanes': 'counter bar drinks menu beans',
        'fail.overdraft': 30000, 'fail.overdrawnMins': 20, 'fail.sat': 0.35, 'fail.satMins': 20
      },
      goals: [{ kind: 'rate', n: 25, mins: 60, title: 'Keep up 25 served an hour for a whole hour' }],
      limitMins: 720
    },
    {
      id: 'flagship', n: 5, title: 'The Flagship', seed: 55,
      brief: 'The whole floor and everything to research. Grow trade until 25 customers an hour come in, then build a shop that runs itself.',
      lesson: 'A well-built shop runs itself. Success brings load, and a fragile shop needs you to step in.',
      rules: {
        'allow.lanes': ALL_LANES,
        'fail.overdraft': 50000, 'fail.overdrawnMins': 15, 'fail.sat': 0.4, 'fail.satMins': 20
      },
      goals: [{ kind: 'trade', n: 25, title: 'Grow trade to 25 customers an hour' }, { kind: 'handsOff', mins: 60, walkPct: 3, title: 'Run an hour hands-off: no changes, 3% walk-outs at most, cash up' }]
    }
  ];
  const byId = (id) => LEVELS.find((l) => l.id === id) || null;
  root.CoffeeLevels = { LEVELS, byId };
})(typeof window !== 'undefined' ? window : globalThis);
