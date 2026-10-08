# Coffee Flow

A small isometric management game about flow, queues and capacity. It comes with a headless runner and a solver
that use the game's own simulation. A run found by the solver can be pasted into the browser game and watched.

The design is in [docs/design.md](docs/design.md).

## Play

The game is published to GitHub Pages from `main` by the workflow in `.github/workflows/pages.yml`. To play it
locally, run `npm run build` and open `dist/index.html` in a browser. It needs an internet connection the first
time, to load three.js and the fonts from their CDNs.

Controls:

| Input | Action |
|---|---|
| Drag | Orbit the camera |
| Right-drag | Pan |
| Scroll | Zoom |
| Click a worker, then a station or crate | Assign them to it |
| Right-click | Context menu for whatever is under the cursor |
| B | Open the last build tray |
| R | Rotate while placing |
| Esc | Step back: stop placing, close a tray or panel |
| F | Flow charts |
| T | Research |
| Space | Pause |
| 1–5 | Speed |

The icon row along the bottom opens trays for building, the menu, beans and staff, plus research. Tools that
aren't useful yet are greyed out, and hovering or focusing one says what brings it in. Problems, tutorial steps and goals hang on the ticket rail at the top left and come down when
dealt with. Flow charts, replay codes, playtest bots and pixel mode are in the ⋯ menu.

The title screen lists the levels, plus free play: the whole shop with no goals and no way to lose.

## Levels

Every level starts from an empty room and is built up by the player. Each one is ordinary data in `src/levels.js`:
rule overrides (room size, cash, demand, what can be bought and researched, when the level is lost), a seed, a brief,
goals met in order and an optional time limit. The sim judges goals and losses, so the headless tools score a level
exactly as the game does.

| Level | Room | What it is about |
|---|---|---|
| 1 The Kiosk | 6×4 | Tutorial. One worker, filter only, nothing to research. Serve 20. |
| 2 Morning Rush | 6×6 | More trade than one person can serve; one hire allowed. Serve 60 in 5 hours. |
| 3 The Corner Café | 8×6 | Research espresso and install it while trading, then serve 120 in 8 hours. |
| 4 High Street | 10×8 | A full bar with milk and syrups. Keep up 25 served an hour for an hour, within 12 hours. |
| 5 The Flagship | 12×10 | Everything. Grow trade to 25 customers an hour, then run an hour hands-off. |

- **Rooms.** `room.x0`, `room.x1` and `room.z0` mark out the floor inside the 12×10 plot. The room must take in the
  front door and the squares staff start on; the back door sits in its back corner. Even edges keep the walls whole.
- **What a shop has.** `allow.items` and `allow.lanes` list, space-separated, the equipment that can be bought and the
  research lanes that can be studied. Trays, tiles and research lanes outside them are hidden.
- **Goals.** `served`, `cash`, `menu` (a product on the menu), `rate` (n served in the last hour, held for `mins`,
  optionally with door-to-cup under `lead` seconds), `trade` (n customers an hour coming in) and `handsOff` (`mins` with
  no actions at all, walk-outs at most `walkPct`% and cash ending higher; any action starts the clock again).
- **Losing.** Overdrawn for `fail.overdrawnMins` minutes, or more than `fail.overdraft` pence in the red at once, and
  the bank closes the shop. Satisfaction under `fail.sat` for `fail.satMins` minutes, judged once `fail.after`
  customers have finished, and trade dries up. Both timers run back down at the same pace while things are good, so
  a shop that keeps dipping under the line still loses. Past the time limit with goals unmet, the level is lost too.
  The defaults turn every check off, which is free play.
- **Progress.** Which levels this browser has won is kept in local storage; nothing else depends on it.
- **Keeping levels winnable.** `test/levels.test.js` plays each level with a reference policy (a preset, or genes and
  a hand-picked layout) and fails if it can no longer win. `node headless/cli.js levels` shows how the presets fare.

## Deploying

Every push to `main` runs the tests, builds `dist/index.html`, smoke-tests the headless runner, and deploys `dist/`
to GitHub Pages. Pull requests run the same checks without deploying.

One-time setup: in the repository's Settings, go to Pages and set Build and deployment → Source to
**GitHub Actions**.

## Layout

```
src/sim.js      the simulation: shop, customers, workers, stations, buffers, rules. Pure, deterministic, no DOM.
src/levels.js   the levels: rule overrides, goals and briefs. Data only.
src/bot.js      the player model: one policy with tunable genes; Solo / Steady / Rush are presets of it.
src/ui.js       the browser game (three.js rendering, input, panels). Reads and acts on src/sim.js.
src/head.html   page markup and styles.
build.js        bundles src/ into dist/index.html, one self-contained page. --fragment also writes a
                version without <html>/<head>/<body> for hosts that add their own.
headless/       command-line runner and solver. Loads src/sim.js, src/levels.js and src/bot.js unchanged.
test/           determinism, rules and level tests.
out/            solver, sweep and explore results (JSON/CSV, not committed).
docs/           the game design.
```

The browser and Node load the same three files. None of them knows which one it is running in.

## Commands

Requires Node 18 or later. There are no dependencies to install.

```sh
npm test                                     # replays rebuild exactly; rules round-trip; every level can still be won
npm run build                                # writes dist/index.html

node headless/cli.js rules                   # every balance rule and its default
node headless/cli.js play --bot steady --seed 3 --hours 8    # one game: decisions, hour-by-hour table, replay code
node headless/cli.js replay CF1-...          # re-run a code from the game or the solver, check it is deterministic
node headless/cli.js bench --seeds 8         # the three preset bots side by side
node headless/cli.js solve --gens 12 --pop 20 --seeds 5      # search for the best policy, confirm on unseen games
node headless/cli.js sweep --rule demand.base=9,15,30 --rule wagePerMin=15,8   # best achievable result per rule set
node headless/cli.js explore --samples 100 --refine 3 --out out/explore.json --csv out/explore.csv   # Monte Carlo
node headless/cli.js levels --seeds 4                     # every preset on every level: won, lost and why
node headless/cli.js play --level rush --bot rush         # one game of a level, stopping when it is won or lost
```

Common options:

| Option | Meaning |
|---|---|
| `--hours 8` | Game length. 20 real minutes at 20× is about 6.7 game hours. |
| `--seeds 5` | Games per policy while searching. |
| `--holdout 8` | Unseen games used to check the winner. |
| `--rule key=value` | Override any balance rule (repeatable). In `sweep`, give comma-separated values. |
| `--level id` | Play a level (`kiosk`, `rush`, `corner`, `high`, `flagship`) in `play`, `bench`, `solve` and `levels`. Its rules come first, then any `--rule`. On a level the solver puts winning first and winning sooner second. |
| `--json` | Print machine-readable output. |
| `--out file.json` | Save the result. |
| `--workers N` | Number of worker threads (defaults to the number of cores). |

## Rules

All balance numbers live in `DEFAULT_RULES` in `src/sim.js`. Money is in pence and times are in game seconds.

Override a value by its dotted path, for example `startCash`, `wagePerMin`, `orderTime`,
`items.espresso.cost`, `products.filter.make`, `demand.base` or `demand.growAt`.
Run `node headless/cli.js rules` for the full list.

A game's overrides are stored in its replay code, so a solver result plays back in the browser with the same rules.
A level game's code carries the level's id, and the level's own rules come from `src/levels.js`.
The game's subtitle shows "custom rules" in that case. Codes also carry the simulation version (`Sim.VERSION`), and
the game warns when a code was made with an older version. Bump the version whenever a change alters how existing
replays play out.

## Beans, grounds and flow

- **The back door.** Deliveries and rubbish use the back door, in the side wall at the back corner. Sacks are left
  on the paving outside it and grounds go in the wheelie bin beside it. Staff stand on the cell just inside to
  fetch or tip, so nothing can be built there, and building can't cut it off from the rest of the shop.
- **Beans come in sacks.** You order them (`order n`), and they arrive at the back door after `supply.leadMins`.
  A standing order (`auto point qty`) orders `qty` sacks whenever the beans in the shop, at the door and on
  order fall below `point` cups' worth.
- **Stock areas and cupboards.** A stock area (`stock`) is a floor tile marked out for `items.stock.sacks` sacks.
  It is free and ready at once, with no crate to build. A stock cupboard (`store`) holds the same number of sacks
  (`items.store.sacks`) and costs money; the difference is only how it looks. Both block walking like any other
  station. When workers have nothing more pressing, they carry sacks from the back door into stock. Hopper refills come
  from the nearest stocked tile or cupboard, or from the back door if there is none. Stock close to the machines
  shortens every refill trip, but stocking it costs worker time, so it only pays when staff have slack. The Flow
  chart stacks beans by where they are: in hoppers, in stock, at the back door. Bots decide whether to mark out a stock
  area with the `storeSpare` gene.
- **Hoppers and knock boxes.** The brewer and grinder have hoppers (`items.*.hopper`). Workers carry a sack in
  from the back door and tip it into a hopper. The brewer and the espresso machine fill knock boxes with grounds
  (`items.*.knock`); when one is full that machine stops until a worker empties it and takes the grounds out
  to the bin by the back door.
- **Chores compete for time.** A worker does a chore first when a machine can't run without it. Otherwise they
  tidy up when they have nothing else to do.
- **History lives in the sim.** It records one sample per game minute in `S.hist`, keeping 24 hours: customers
  queuing, orders waiting, being made, ready, beans in the shop, at the door and on order, grounds, cash, served,
  walk-outs and beans used. The game's Flow panel (F) charts it as stock over time, which works as a cumulative
  flow diagram you read by band thickness. Headless runs get the same data.
- **New outcome measure.** `dryMins` counts game minutes when drinks were waiting and no machine had beans.
  Bots set a standing order from the `reorderPoint` and `reorderQty` genes.

## Drinks and recipes

- **Every drink has a recipe:** the stops it makes on the way to pickup and the time at each. `Sim.recipe(S, p)`
  returns it from the current rules. Espresso drinks are ground at a grinder (`products.<p>.grind`) and pulled at
  the espresso machine (`products.<p>.make`). Milk drinks then visit the milk station (`products.<p>.milk`), and
  flavoured drinks the syrup station (`products.<p>.syrup`). A station serves one worker at a time, so where it
  stands and how many there are both matter.
- **Who wants what.** `mix.<p>` is how many customers in a hundred pick a drink first. Filter, espresso and cake are
  always in the running; newer drinks only count while they are on the menu. Someone after a milk drink who can't
  have it falls back to espresso.
- **Menu.** The Menu tray shows each drink's price and recipe, and takes drinks off or puts them back. A drink is
  only offered when its research is done and every machine and station in its recipe is built.

## Research

- **The tree.** Topics sit in seven lanes: front counter, bar, drinks, menu, beans, customers and team. A topic's
  `needs` lists the topics that must finish first, and can reach into another lane (the drinks lane grows out of
  Espresso training).
- **Unlocks.** Espresso training unlocks the grinder and espresso machine. Cake supplier unlocks the cake display.
  In the drinks lane, Steamed milk unlocks the milk station and lattes, Microfoam adds cappuccinos, Syrup station
  unlocks the syrup station and vanilla lattes, then Caramel syrup, Seasonal syrups (gingerbread) and Whipped cream
  (mocha) add pricier drinks. The three Latte art tiers raise the price of lattes and cappuccinos.
  Standing orders unlocks automatic reordering; until it's researched, beans are ordered by hand. Storage needs
  no research.
- **Rule changes.** Every other topic changes rule values when it finishes: cup slots on tills and pickup counters
  (8, 12, then 16), order and collection times, make and grind times, hopper and knock box sizes, prices and
  ingredient costs, bean lead time and price, patience, demand growth and ceiling, build times, walking speed and
  the staff limit. Equipment and staff already in the shop pick the change up at once.
- **Plans.** The action `plan topic` queues everything the topic still needs, in order, then the topic itself;
  each step starts when the one before finishes. Choosing a topic by hand drops the plan, and `plan` with no
  topic clears it.
- **Shared capacity.** `research.rate` units per game minute are split across the topics in progress by weight,
  set with the action `research topic 0..3`.
- **Even split.** Three topics in progress each go at a third of the pace, and nothing is lost by splitting.
  Nothing pays off until a topic is finished, though, so one at a time gets the first topic sooner and the rest
  no later. That is the design doc's cost of delay. `research.switchPct` can add an optional context-switching
  loss per extra topic; it is 0 by default.
- **Rules.** `research.topics.<name>.work` sets each topic's size, and `0` means the topic is known from the start.
  Topics that change rules also take `research.topics.<name>.to` (the new value) or `.pct` (a change in percent,
  compounding across tiers). `research.enabled=0` makes every topic known from the start.
- **Bots.** `researchSerial` (one topic at a time or all at once) and `standingFirst` are policy genes. Steady
  focuses; Rush researches everything at once.

## Charts (Flow panel, F)

- **Who did what.** A Gantt chart with one row per worker. Colour is the kind of work: till, making, building or
  chores. Solid means working, faint means walking, striped means held up (waiting for a machine, room or the
  customer), and blank means idle. The percentage beside each name is time spent actually working. Markers show
  builds, deliveries, hires and finished research.
- **Value chain.** Every queue in the system, sharing the Gantt's time axis.
  - *Orders:* queuing to order, on the rail, being made, ready at pickup. **Stock** shows how many are at each
    stage. **Cumulative** shows the same thing as a true cumulative flow diagram, with curves for arrived,
    ordered, started, made and done. The gap between two curves is the stock at that stage, the slope of the
    bottom curve is throughput, and the horizontal distance between curves is lead time. A walk-out counts as
    leaving every later stage, so the gaps always equal the stock.
  - *Beans:* in hoppers, in the store and at the door, plus beans on order and grounds in bins.
  - *Research:* topics not started, in progress and complete.

The data lives in the simulation: `S.flow` holds cumulative counters, `S.acts` the activity log per worker,
`S.marks` the timeline markers, and `S.hist` per-minute samples. Headless runs get all of it.

## Monte Carlo exploration (`explore`)

`explore` looks for interesting games rather than checking one rule set at a time. It works in four steps.

1. **Sample worlds.** It draws random rule sets, covering both balance and starting setup, from the ranges in
   `headless/space.json`. Latin hypercube sampling spreads them so every range is covered evenly; `--plain` switches
   to plain random sampling. You can edit the space file:
   - `range` gives absolute bounds;
   - `scale` multiplies the defaults, and a `*` key such as `items.*.cost` moves all matching rules together;
   - `int` rounds to whole numbers, and `log` samples evenly by ratio rather than difference.
2. **Play a probe panel in each world.** Eleven contrasting policies play it over several random seeds: the three
   presets, Hire early, Espresso first, Espresso then hire, Lean team, Cake first, Big team, and two random policies.
3. **Score how interesting the world is.**
   - Can a good player grow?
   - How far does the best play beat typical play (skill gap)?
   - Can bad play still lose?
   - Does the winner follow the intended arc, hiring and buying espresso?

   Worlds where nothing can lose, Solo wins, the shop is overrun, or growth runs away score lower. Each world gets
   tags such as `hire to grow`, `skill matters`, `easy to lose`, `stay small` or `impossible`.
4. **Report.**
   - The most interesting worlds, with their biggest changes from today's rules.
   - Which rules drive growth, skill gap and interest (rank correlation across all samples).
   - A full policy search on the top `--refine` worlds.

Every world comes with a **scenario code**: a replay code with rules but no actions. Paste it into the game's Replay
box to play that world yourself. Refined worlds also come with a code for the solver's run, so you can watch it.

`--csv` writes one row per world, with every sampled value and score, for a spreadsheet.

Starting setup is part of the rules: `start.workers`, `start.demand`, and `start.till`, `start.pickup`,
`start.brewer`, `start.grinder`, `start.espresso` and `start.pastry`. Starting equipment is built in the standard
layout (`Sim.LAYOUT`).

## How the solver works

- **The policy.** A single policy in `src/bot.js` decides every 30 game seconds. Its genes cover:
  - when to buy espresso and cake, measured as cash to spare after the purchase;
  - the queue lengths that trigger a second brewer, espresso machine or till;
  - hiring: queue trigger, busyness trigger, maximum staff, minimum gap between hires, and a cash reserve;
  - firing when staff are under-used;
  - whether to split roles between till and making;
  - how many workers build each crate, whether to close while espresso is installed, and whether to drop filter
    once espresso is on.
- **The search.** A seeded evolutionary search starts from the three presets plus random policies. Each generation
  keeps the best, crosses them over and mutates them.
- **The score.** Each policy is scored on business worth: cash plus resale value of the equipment, with any debt
  counted at double. The score is the median across games.
- **The check.** The winner is replayed on games it never saw, next to the presets. You also get a replay code for
  one of those games.

## Findings from 100 random worlds (8 game hours)

- **Today's rules are an unlucky corner.** Only 5 of 100 random worlds were impossible; today's rules are one of them.
- **Prices drive almost everything.** Prices correlate most with growth (+0.49) and with interest (+0.44).
  Expensive equipment, slow ordering and high wages all pull the other way.
- **Espresso is structurally weak.** Only 1 of 100 worlds rewarded buying it; the winners buy cake or hire instead.
  Its make time plus grind time is too slow for its price premium. If espresso is meant to be the first upgrade,
  fix it directly: a shorter make time, a higher price, or customers who refuse filter.
- **Starting with espresso already built reduces the skill gap** (−0.61): it removes the most interesting decision.
- **The searched policy beats every probe.** In the top worlds it gained 27% to 79% over the best preset, so these
  worlds reward thinking.

## Findings from the first sweeps (8 game hours)

| Rules | Best policy | Worth | Last hour | Verdict |
|---|---|---|---|---|
| Defaults | Solo: never expands | £501 | +£10 | Never recovers the £600 it started with |
| Defaults, 24 hours | Hires once at a queue of 6 | £754 | +£22 | Grows slowly; never buys espresso |
| £900 start, or demand grows from 45% satisfaction | Solo | Start + about £0 | +£12 | Neither lever matters |
| Service times close to a real café | Solo | £621 | +£28 | A solo shop grows; expansion still doesn't pay |
| Fast service, espresso kit at £260, demand reacts more strongly | Hires up to 3 as the queue grows | £758 | +£74 | First real growth path; espresso still not bought |

What this shows:

1. **Workers are slow.** Taking an order takes 75 seconds and a filter coffee 90, so one worker serves about
   13 customers an hour. At £9 an hour, a hire only pays when it adds more than 4 customers an hour.
2. **Equipment is expensive.** It costs 100 to 200 drinks' worth of margin, so nothing pays back within a session.
3. **Espresso earns little extra.** It makes only £0.50 more per cup than filter, and its satisfaction boost is too
   small to justify the machine. If espresso is meant to be the first big upgrade, it needs a larger effect on
   demand or a smaller price.
