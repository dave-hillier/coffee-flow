# Coffee Flow

> A small isometric management game about flow, queues, capacity, growth
> and finishing work.

## The idea

**Coffee Flow** is a management game in which a coffee shop is treated
as a visible flow system.

Customers arrive with preferences. Workers take orders, move cups and
food between stations, make products, install equipment and serve
customers. Work waits in physical buffers. When one part of the system
cannot keep up, the queue should be visible in the shop before the
player ever needs to look at a chart.

The player is not primarily trying to keep every worker busy. They are
trying to build a system that produces good customer outcomes, makes
money and continues to work as demand and complexity increase.

The game should teach ideas from queueing theory, lean and product
development by making the player experience them first:

-   bottlenecks;
-   work in progress (WIP);
-   throughput;
-   lead time;
-   utilisation;
-   variability;
-   flow efficiency;
-   batching;
-   cost of delay;
-   Little's Law.

The terminology comes later. The game comes first.

## Design principles

> **Everything is a queue.**

The same small set of concepts should explain most of the game:

-   **Work** --- something that has entered a process but is not yet
    complete.
-   **Stations** --- places where workers transform work.
-   **Buffers** --- bounded places where work waits.
-   **Workers** --- finite capacity.
-   **Completion** --- the point at which work actually releases value.

These ideas apply at several scales.

A customer order is work. A labelled cup waiting for a barista is WIP. A
coffee machine being installed is WIP. A technology unlock at 80%
completion is WIP.

> **Progress is not value. Completion is value.**

Other principles follow from that:

-   Busy is not the same as productive.
-   Workers are capacity.
-   Spare capacity is not automatically waste.
-   A boundary or buffer that does not improve flow has a cost.
-   Fixing one bottleneck should often expose another.
-   Success generates load.
-   Micromanagement is a symptom of a system that is not managing itself
    well.
-   A good system should be able to run quickly without constant player
    intervention.

------------------------------------------------------------------------

## Core game loop

The longer-form game is continuous. There is no artificial end-of-day
planning phase and no staff-rota minigame.

The basic rhythm is:

``` text
design
  ↓
run
  ↓
observe
  ↓
constraint emerges
  ↓
diagnose
  ↓
change the system
  ↓
stabilise
  ↓
grow
  └──────────────→ repeat
```

When the shop is healthy, the player should be comfortable running at
high speed and watching the little system work.

Eventually something changes. Demand grows. The customer mix changes. A
new menu item adds load to a station. A buffer starts filling. A new
machine needs installing. A previously adequate system approaches its
capacity frontier.

The player slows down, understands what is happening, changes something,
and gets the system flowing again.

The intended long-form rhythm is:

> **Design → run fast → observe → diagnose → change → run fast.**

------------------------------------------------------------------------

## The two economic loops

### Cash

``` text
cash
  ↓
workers / equipment / capability
  ↓
customers served
  ↓
sales
  ↓
cash
```

Cash buys capacity and capability.

More capacity is not automatically better because workers, equipment and
space have costs.

### Satisfaction

``` text
customer experience
  ↓
satisfaction
  ↓
reputation / future demand
  ↓
more customers
  ↓
more opportunities for good or bad experiences
```

Satisfaction is a second top-level outcome, but not necessarily a
spendable currency.

It is primarily driven by:

-   how closely the available product matches the customer's preference;
-   product/service quality;
-   total lead time and waiting.

These two loops deliberately pull against one another.

A shop can protect satisfaction with excessive spare capacity and make
little money. It can maximise short-term revenue by running too hot and
destroy customer experience.

The player is looking for a good operating point rather than maximising
a single number.

------------------------------------------------------------------------

## Customers

Customers arrive continuously.

Each customer has:

-   a set of product preferences;
-   a degree of time sensitivity;
-   a maximum patience;
-   an order chosen from the currently offered menu;
-   a resulting satisfaction outcome.

Customers entering the shop intend to buy. They do not walk in, inspect
the menu and leave simply because their perfect drink is unavailable.
Instead, they choose the best available match and may be less satisfied.

They *can* abandon because the process takes too long.

### Patience and abandonment

Satisfaction should deteriorate as lead time increases, with a hard or
semi-hard patience threshold beyond which the customer leaves.

The visual state can make this obvious:

``` text
🙂  →  😐  →  😟  →  😠  →  leaves
```

This prevents overload from creating literally infinite queues.

It also makes the difference between **demand** and **throughput**
visible:

``` text
80 customers arrive/hour
48 complete
29 abandon
3 remain in the system
```

Where payment occurs matters.

If the customer has not paid, abandonment is primarily lost potential
revenue and poor satisfaction.

If they have already paid, abandonment may require a refund and can
additionally waste ingredients, completed work and capacity.

------------------------------------------------------------------------

## Process design

The game should not assume there is exactly one correct coffee-shop
process.

A Starbucks-like process might be:

``` text
customer
   ↓
order + payment
   ↓
labelled cup
   ↓
order buffer
   ↓
make drink
   ↓
pickup
   ↓
customer leaves
```

Another shop might operate:

``` text
customer
   ↓
order
   ↓
make / assemble
   ↓
payment
   ↓
handover
```

These are not cosmetic differences. They place queues and commitment at
different points in the system.

The first prototype may use a fixed process for scope, but the
simulation should avoid baking payment into an immutable stage if
possible.

------------------------------------------------------------------------

## Stations, buffers and work

### Stations

A station transforms work.

Conceptually:

``` text
input
  ↓
[ station + worker + time ]
  ↓
output
```

Examples include:

-   till/order point;
-   grinder;
-   espresso machine;
-   milk station;
-   filter coffee;
-   food/cake;
-   assembly;
-   payment;
-   pickup;
-   construction.

Equipment creates **potential capacity**. It only becomes useful
capacity when the process around it can actually use it.

A second espresso machine without a worker may achieve nothing.

### Buffers

Buffers are physical places where work waits.

They should be visible in the world wherever practical.

For example:

``` text
customers
    ↓
  [TILL]
    ↓
☕ ☕ ☕ ☕ ☕      labelled cups waiting
    ↓
[ESPRESSO]
    ↓
🥤 🥤             finished drinks waiting
    ↓
 [PICKUP]
```

Possible buffers include:

-   order buffer --- labelled cups or tickets;
-   work buffer --- partially completed items;
-   assembly buffer --- components waiting to be combined;
-   pickup buffer --- completed orders;
-   construction --- equipment that has been bought but is not
    operational.

Buffers are **bounded**.

If a four-cup order counter is full, the upstream process blocks rather
than silently creating an infinite invisible queue.

A larger buffer can therefore be a seductive upgrade:

``` text
4 cup buffer → 12 cup buffer
```

It may reduce blocking without improving throughput at all.

The player has apparently fixed the problem while actually increasing
WIP and lead time.

------------------------------------------------------------------------

## Workers

Workers are small autonomous characters --- creatures, robots or
similarly fictional labourers --- that make the flow readable.

They are capacity, not RPG characters.

A worker has:

``` text
home station
current task
temporary assignment (optional)
```

### Home stations

A worker normally dwells at their home station and processes available
work there.

For example:

``` text
Worker A → Till
Worker B → Espresso
Worker C → Food
```

The player should not need to continually drag them around when the
system is well designed.

### Temporary assignments

Workers can be borrowed for temporary work.

For example, a new coffee machine arrives and the player assigns the
cashier and barista to install it.

They:

1.  finish their current task;
2.  walk to the installation;
3.  contribute work;
4.  finish the installation;
5.  automatically return to their home stations.

This avoids turning temporary intervention into permanent
micromanagement.

### One-worker operation

At the beginning, a single worker may operate several stations.

They might:

``` text
take order
→ move to coffee
→ make drink
→ fetch cake
→ take payment
→ hand over
→ serve next customer
```

At low demand this can work surprisingly well.

It has low WIP and natural one-piece flow, but poor maximum throughput.

Adding specialist workers increases potential throughput while also
making it possible for internal queues to form.

That transition is an important early lesson.

### Switching cost

There should not be an arbitrary modifier such as:

> Worker changed role: -25% efficiency.

Switching costs should emerge from the simulation:

-   finishing the current task;
-   walking;
-   any real setup;
-   the queue accumulating at the station they left;
-   the queue they are moving to.

Flexible working can be good. Frantic reassignment should be bad because
the underlying system is unstable, not because the game applies a hidden
punishment.

------------------------------------------------------------------------

## Construction

Buying equipment does not instantly create capacity.

New equipment arrives and must be installed.

Construction is simply another kind of work:

``` text
equipment purchased
      ↓
construction WIP
      ↓
workers contribute installation work
      ↓
operational station
```

An installation might require, for example, 12 work units.

With a simple initial model:

``` text
1 worker  → 12 minutes
2 workers →  6 minutes
3 workers →  4 minutes
```

This can be tuned later if linear scaling proves too generous.

The important part is the trade-off.

Workers installing future capacity are not serving customers now.

The player can choose:

> **slow installation, small operational disruption**

or:

> **fast installation, large short-term disruption**

Because the shop never stops running, construction happens inside the
live system.

------------------------------------------------------------------------

## Menu and equipment

Menu expansion should change the flow rather than merely increase
revenue.

Examples:

``` text
grinder + espresso machine
        ↓
     espresso

espresso + milk capability
        ↓
latte / cappuccino / flat white
```

An unlocked product does not have to be offered.

The active menu is itself an operating decision.

Adding cappuccino may improve customer preference fit and increase
demand while pushing the milk or espresso station towards saturation.

Adding tea may satisfy a new customer segment without touching the
espresso bottleneck.

Adding food can introduce parallel work and assembly.

The menu therefore affects:

-   demand;
-   preference satisfaction;
-   station load;
-   service-time variability;
-   assembly complexity.

------------------------------------------------------------------------

## Development / tech tree

The development system is a deliberately simple cost-of-delay model.

Unlocks have a fixed amount of work.

The player has finite development capacity that is paid into active
items over time.

For example:

``` text
Development capacity: 3 units / minute

Espresso upgrade     6 units
Cake capability      6 units
New process          6 units
```

The player is allowed to split that capacity however they want.

### Parallel work

``` text
Espresso  +1 / minute
Cake      +1 / minute
Process   +1 / minute
```

All three finish after six minutes.

For the first five minutes, none of them creates value.

### Serial work

``` text
Espresso  +3 / minute → complete at minute 2
Cake      +3 / minute → complete at minute 4
Process   +3 / minute → complete at minute 6
```

Exactly the same amount of work has been performed by minute six.

But value was released earlier.

There should be **no artificial parallel-work penalty**.

The penalty is raw cost of delay.

> **Starting work creates WIP. Finishing work creates capability.**

The tech tree should make the states obvious:

``` text
AVAILABLE → IN PROGRESS → COMPLETE
```

A player with eight technologies at 70% has created a great deal of
progress and potentially very little value.

------------------------------------------------------------------------

## Continuous growth and optimisation pressure

A coffee shop is not inherently difficult enough to sustain the game if
the player can discover a staffing ratio and leave it forever.

The game therefore needs to continually push a successful system towards
a new constraint.

### Success creates load

A stable shop creates good customer experiences.

Good experiences improve satisfaction and reputation.

That creates more demand.

More demand increases utilisation.

Higher utilisation creates queues and exposes the next constraint.

``` text
better system
     ↓
better service
     ↓
higher satisfaction
     ↓
more demand
     ↓
higher utilisation
     ↓
new constraint
     ↓
improve system again
```

Stability is therefore not an endpoint. It creates the conditions for
growth.

### Capacity must have a cost

The trivial solution to every queue must not be:

> Hire another worker.

Workers cost money. Equipment costs money. Equipment takes time and
existing capacity to install. Space eventually becomes constrained.

A shop can always protect flow by carrying enormous spare capacity, but
that should be economically poor.

The player is balancing:

``` text
resource efficiency  ←────────→  flow efficiency
profit                ←────────→  resilience
utilisation           ←────────→  spare capacity
```

The goal is not to maximise any one of these.

### Variability matters

Average capacity should not be enough to solve the game.

If a station can theoretically serve 60 customers/hour and average
demand is 55/hour, it may still perform badly because:

-   arrivals are uneven;
-   drink mix varies;
-   service times vary;
-   customers arrive in groups;
-   other stations create bursts of work.

This lets the game demonstrate why operating close to 100% utilisation
under variability creates disproportionate waiting.

### Bottlenecks should move

Different periods and product mixes can stress different parts of the
system.

``` text
Morning
Espresso   ██████████
Food       ███

Lunch
Espresso   ███████
Food       ██████████

Afternoon
Espresso   █████
Food       ███████
Pickup     █████████
```

Adding capacity to one stage should often expose another constraint
rather than permanently "solve" the café.

### Growth is partly player-driven

The player should be able to choose when to take on additional
complexity.

Examples:

-   introduce food;
-   broaden the drink menu;
-   advertise;
-   increase seating;
-   accept takeaway/mobile orders;
-   add delivery;
-   expand the premises;
-   improve quality/reputation.

Each decision is effectively:

> **I'm ready to put more load through my system.**

This gives the player some control over the pace without requiring
discrete days or levels.

------------------------------------------------------------------------

## Time and player attention

The simulation should support aggressive acceleration.

A provisional control set:

``` text
Pause | 1× | 2× | 5× | 20×
```

At 20× the player is effectively saying:

> I've designed the system. Show me whether it works.

A healthy system should mostly operate itself.

A poorly designed system may force the player to repeatedly:

-   slow down;
-   reassign workers;
-   prioritise work;
-   clear queues;
-   intervene in construction.

That makes player attention an implicit resource.

> **Micromanagement is punishment for failing to design a system that
> can manage itself.**

The game should permit firefighting without making firefighting the
optimal play style.

------------------------------------------------------------------------

## Analysis

The shop view should make problems intuitively visible.

The analysis view explains them.

The player should be able to move from:

> There are loads of cups there.

to:

> Coffee cannot keep up.

to:

> Coffee is operating at 98% utilisation and WIP is accumulating.

to:

> Variability at this utilisation is causing lead time to grow rapidly.

These are different descriptions of the same event.

### Core measures

The useful measures are:

-   **Throughput** --- completed customers/orders per unit time.
-   **WIP** --- work currently inside the system.
-   **Lead time** --- elapsed time from arrival/order to completion.
-   **Utilisation** --- proportion of available capacity being used.
-   **Abandonment** --- demand that entered but did not complete.
-   **Satisfaction** --- customer outcome and future-demand input.
-   **Interventions** --- manual or temporary management actions.

------------------------------------------------------------------------

## Cumulative Flow Diagram

The CFD is a primary diagnostic rather than an optional analytics
screen.

An order-level CFD might contain:

``` text
Arrived
Ordered
Preparing
Ready
Served
Abandoned
```

It should make several ideas visual:

-   band thickness → WIP;
-   widening band → accumulating queue;
-   completed-work slope → throughput;
-   horizontal separation → lead time;
-   changing band width → movement of constraints.

Preparation can later be drilled into:

``` text
waiting for grinder
waiting for espresso
waiting for milk
waiting for assembly
```

Clicking or selecting a problematic part of the CFD should take the
player back to that point in the replay and highlight the corresponding
physical queue.

The same visualisation can diagnose development:

``` text
Available → In Progress → Complete
```

Too much started development makes the **In Progress** band balloon in
exactly the same way that too many accepted coffee orders create WIP.

------------------------------------------------------------------------

## Worker timeline / Gantt

A Gantt-style view should show where capacity went.

A stable system might look roughly like:

``` text
Cashier   █████████████ TILL █████████████████
Barista   ███████████ ESPRESSO ███████████████
Food      █████ FOOD ███ BUILD ███ FOOD ██████
```

A heavily micromanaged system might look like:

``` text
Worker A  TILL│COF│TILL│BUILD│COF│TILL│...
Worker B  COF │BUILD│TILL│COF│BUILD│...
```

The point is not that switching is intrinsically bad.

The timeline lets the player ask whether all of that intervention
actually improved flow.

Construction and development completion events can be overlaid on the
same timeline.

------------------------------------------------------------------------

## Replay

Replay is a first-class part of the game.

The simulation should be deterministic given:

``` text
scenario / world version
random seed
player action stream
```

The replay does not need to store every customer position or cup state.

It stores decisions.

Conceptually:

``` text
tick 1042  assign worker 2 → construction 7
tick 1188  buy espresso machine
tick 1927  set worker 1 home → till
tick 2110  allocate development → milk capability
```

Actions are recorded against **simulation time**, not wall-clock time.

This means the replay can be watched at any speed regardless of how
quickly the original player ran the game.

### Shareable replay codes

The action stream can be compressed into a URL-safe or short textual
representation.

For example:

``` text
CF1-A7K2-9FXQ-4MNP-...
```

A replay code can reconstruct the complete run.

This supports:

-   workshop submissions;
-   comparing different solutions to the same seed;
-   sharing interesting failures;
-   community challenges;
-   "beat my café" scenarios.

------------------------------------------------------------------------

## Workshop mode

The initial use case is a group session of roughly 20 minutes followed
by discussion.

Everyone starts with:

-   the same scenario;
-   the same starting resources;
-   the same deterministic seed;
-   the same rules.

The simulation itself remains continuous. There is no special day
structure introduced for the workshop.

The facilitator can simply say:

> **You have 20 minutes. Build the best business you can.**

The interesting result is not merely who accumulated the most cash.

A run can be evaluated across:

-   cash/profit;
-   satisfaction;
-   throughput;
-   abandonment;
-   WIP;
-   lead time;
-   amount of capacity purchased;
-   management interventions.

### Group review

After play:

1.  collect the replay codes;
2.  inspect the headline outcomes;
3.  choose a strong run and an interesting weak run;
4.  replay them;
5.  inspect worker allocation on the Gantt;
6.  inspect WIP and bottlenecks on the CFD;
7.  inspect development completion timing;
8.  only then introduce the formal concepts.

For example:

> "You had three technologies at 70%. What value were they generating?"

None.

That creates the opening to discuss **cost of delay**.

Or:

> "Every time Coffee backed up, you moved the Food worker. Look at what
> happened to the queues afterwards."

That creates the opening to discuss **constraints, utilisation and
moving bottlenecks**.

The game supplies the shared experience before the theory is named.

------------------------------------------------------------------------

## Longer-form game

The workshop is a constrained mode of the same game, not the whole
product.

Longer play can add complexity without abandoning the core model.

Possible additions include:

-   more complex drinks;
-   food preparation and assembly;
-   sit-in versus takeaway flows;
-   mobile ordering;
-   delivery;
-   larger premises;
-   different customer populations;
-   more complex process topologies;
-   maintenance and cleaning;
-   new forms of demand generation.

The game should remain understandable in terms of the same primitives:

> **work → buffers → stations → capacity → completion**

The late game should not simply mean hundreds of workers.

A relatively small number of agents and stations preserves the player's
ability to understand why a queue exists.

The aspiration is closer to the readability of classic management games
such as *Theme Hospital*: lots of small autonomous activity, but with a
deeper representation of the work flowing between service points.

------------------------------------------------------------------------

## Presentation

The visual style is compact isometric pixel art.

Workers should be small but expressive enough that their current
behaviour is obvious:

-   waiting at home station;
-   walking;
-   carrying work;
-   processing;
-   constructing;
-   returning home.

Queues should be visually unmistakable:

``` text
☕ ☕ ☕ ☕ ☕ ☕
```

is better than:

``` text
Coffee queue: 6
```

wherever the physical representation is practical.

The shop should look like a little machine when it is working well.

When it is failing, the failure should also be visible in the machine.

### Spatial design

Layout should matter, but not dominate.

Walking distance and access can affect flow enough to make obviously bad
layouts undesirable.

The game should not become primarily a tile-packing optimisation puzzle.

The interesting question is:

> **How should the work flow?**

not:

> **Can I save one tile of walking distance?**

------------------------------------------------------------------------

## First playable

The first playable should prove the flow model rather than the breadth
of the tycoon game.

### Include

-   one small café;
-   continuous simulation;
-   pause, 1×, 2×, 5× and 20×;
-   1--5 workers;
-   worker home stations;
-   temporary reassignment;
-   till/order;
-   coffee;
-   simple food/cake;
-   pickup;
-   construction;
-   bounded physical buffers;
-   a small preference-driven menu;
-   cash and satisfaction;
-   customer patience and abandonment;
-   a small work-unit tech tree;
-   deterministic simulation;
-   action-log replay;
-   CFD;
-   worker timeline/Gantt.

### Defer

-   multiple cafés;
-   staff rotas;
-   HR simulation;
-   worker personality/needs systems;
-   huge recipe catalogues;
-   complex inventory and supply chain;
-   dozens of currencies;
-   large-scale building construction;
-   real-time multiplayer;
-   hundreds of workers.

------------------------------------------------------------------------

## First scenario

A plausible first scenario begins with:

-   a small amount of cash;
-   one worker;
-   a minimally equipped shop;
-   immediate customer demand;
-   several tempting development options.

It should naturally create a sequence of discoveries.

### 1. One worker works

At low demand, one worker moving between tasks provides simple one-piece
flow.

There is little WIP.

### 2. Demand grows

The worker can no longer keep up.

The player adds capacity.

### 3. Specialisation creates queues

A cashier can now accept work faster than Coffee can complete it.

Labelled cups visibly accumulate.

### 4. The obvious fix may not be the fix

A bigger buffer reduces blocking but increases WIP.

A faster espresso machine may not help if milk is the constraint.

Another till may make the coffee queue worse.

### 5. Improvement consumes capacity

The player buys another machine.

Existing workers must install it while the shop continues operating.

### 6. Development creates another WIP problem

The player can start several unlocks.

Finishing one at a time releases capability earlier.

### 7. Success destabilises the system

Good satisfaction produces more demand.

Yesterday's balanced café becomes today's constrained café.

### 8. The player learns to trust the system

A well-designed shop can run at 20×.

A fragile shop requires constant intervention.

------------------------------------------------------------------------

## Open balance questions

These should be resolved through prototyping rather than treated as
design truths.

-   Exact starting cash.
-   Whether the opening always starts with one worker.
-   Worker purchase/hiring cost and ongoing cost.
-   Whether workers arrive immediately or require some lead time.
-   Exact construction speed-up from multiple workers.
-   Customer patience distributions.
-   How satisfaction affects demand and over what time period.
-   Buffer capacities.
-   Walking speed and the importance of layout.
-   Product preference distributions.
-   Service-time variability.
-   Development capacity rate and unlock costs.
-   How quickly successful shops generate additional demand.
-   Whether process topology is configurable in the first playable.
-   How much maintenance/cleaning belongs in the core game.
-   Workshop scoring and whether there should be a single declared
    winner.

------------------------------------------------------------------------

## Guardrails

Do **not** solve difficulty by adding administrative busywork.

In particular:

-   no conventional staff-rota game unless it later proves genuinely
    valuable;
-   no arbitrary worker-switching penalties;
-   no constant clicking as the optimal strategy;
-   no endless percentage-upgrade tree;
-   no hidden queues when WIP can reasonably be represented physically;
-   no analytics requirement for problems that should be obvious in the
    shop;
-   no educational pop-ups interrupting the initial experience;
-   no extra currencies without a real systemic purpose;
-   no giant workforce that destroys the player's mental model of the
    flow.

------------------------------------------------------------------------

## The design test

> **Can the player look at the café, see where work is waiting, decide
> where finite capacity should go, and then use the replay to understand
> why that decision worked or failed?**

If yes, the core game is working.
