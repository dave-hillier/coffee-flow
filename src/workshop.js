/* Coffee Flow · Workshop mode: a ~30-minute presenter-led session about flow, for a room or a video call.
   The presenter shares the screen and plays; the audience votes A, B or C in the chat before each run.
   Four rounds, each a scenario from src/lessons.js played in the real game:
     1 Rush hour (queueing and utilisation) · 2 Start everything (WIP, Little's Law)
     3 The latte art guild (specialists, handoffs, an AI upgrade on the wrong station) · 4 Impossible orders (thin slices)
   Uses only window.CoffeeUI (the hooks at the end of src/ui.js) and window.CoffeeLessons. Opens from the title screen,
   or straight away with #workshop on the URL. #script shows the presenter script for a second screen. */
(function () {
  'use strict';
  const UI = window.CoffeeUI, L = window.CoffeeLessons, Sim = window.CoffeeSim;
  if (!UI || !L || !Sim) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1));
  const f0 = (x) => (x == null ? '–' : String(Math.round(x)));
  const pct = (x) => Math.round(x * 100) + '%';
  const money = (p) => '£' + Math.round(p / 100).toLocaleString('en-GB');
  const ARTEFACT = 'https://claude.ai/artifact/JshBUriTAK9DrQujBYMG8Z';

  // ---------- headless results for the reveal cards (cached; a live run nobody touched ends identical) ----------
  const cache = {};
  function result(id, variant) {
    const k = id + ':' + variant;
    if (!cache[k]) { const r = L.run(id, variant); delete r.S; cache[k] = r; }
    return cache[k];
  }
  function rushCurve() {
    if (cache.curve) return cache.curve;
    const sc = L.SCENARIOS.rush;
    return (cache.curve = sc.levels.map((lv) => {
      let lead = 0, busy = 0;
      for (const seed of sc.chartSeeds) { const r = L.run('rush', lv.key, { seed }); lead += r.lead; busy += r.busy; }
      return { key: lv.key, label: lv.label, lead: lead / sc.chartSeeds.length, busy: busy / sc.chartSeeds.length };
    }));
  }
  // work ahead in small slices so the page stays responsive while a card is up
  const queue = [];
  function warm(...jobs) { queue.push(...jobs); if (queue.length === jobs.length) setTimeout(drain, 30); }
  function drain() { const job = queue.shift(); if (!job) return; try { job(); } catch (e) { /* computed again on demand */ } if (queue.length) setTimeout(drain, 15); }

  // ---------- the cast and the run of show ----------
  const R = { intro: 'Welcome', r1: '1 · Rush hour', r2: '2 · Start everything', r3: '3 · Latte art guild', r4: '4 · Impossible orders', wrap: 'Wrap' };
  const VARIANT = {
    study: { focus: 'One at a time', split: 'All at once' },
    guild: { base: 'Gustavo only', ai: 'AI grinder', hire: 'Fix A: hire', cross: 'Fix B: cross-train', skip: 'Fix C: lattes off' },
    mocha: { bigbang: 'A: everything first', iterate: 'B: open now, add as ready', filter: 'C: filter only' }
  };
  const FIX = { A: 'hire', B: 'cross', C: 'skip' }, MOCHA = { A: 'bigbang', B: 'iterate', C: 'filter' };

  const PERSONAS = [
    { id: 'yasmin', face: '👩‍💼', name: 'Yesterday Yasmin', role: 'Product manager', deadline: 90, say: 'Triple-shot caramel mocha, oat, extra hot, cinnamon dust. My stand-up starts in 90 seconds.',
      opts: [['Build the full spec', 'Every shot, syrup and sprinkle, exactly as ordered.', 240, 'bad', 0, 'Perfect drink, four minutes late. Yasmin runs stand-up without coffee and tells everyone.'],
        ['Good mocha now, extras next time', 'A great double mocha in 75 seconds. Offer caramel and cinnamon on her next visit.', 75, 'good', 3, 'Coffee in hand before stand-up. Tomorrow she tries the caramel and decides she doesn\'t like it. You never had to build it.'],
        ['Decline: "Can\'t be done"', 'Honest, but nothing is served.', 0, 'meh', 1, 'She buys a sad vending-machine coffee. Standards kept, customer lost.']] },
    { id: 'steve', face: '🧑‍💻', name: 'Spec-Sheet Steve', role: 'Arrives with a printed list', deadline: 120, say: 'Here\'s my order. All 14 points are essential. My train leaves in 2 minutes.',
      opts: [['Build all 14 points', 'Measure the foam with a ruler. Fold the receipt.', 540, 'bad', 0, 'Point 9 needed a second jug. Steve misses his train, holding a flawless flat white.'],
        ['Ask which 3 really matter', '"Which of these would ruin your day if I skipped them?"', 90, 'good', 3, '"Honestly? Oat, hot, not too foamy." Done in 90 seconds. The other 11 were preferences, not needs.'],
        ['Guess and make a latte', 'Skip the conversation, make what he probably wants.', 60, 'meh', 1, 'Fast, but it\'s dairy. Steve is lactose intolerant. That was point 1.']] },
    { id: 'priya', face: '👩‍🎨', name: 'Pixel-Perfect Priya', role: 'Product designer', deadline: 180, say: 'A swan in the foam, please. Symmetrical. I\'ll know it when I see it. Three minutes?',
      opts: [['Perfect a swan in secret', 'Three minutes of careful pouring, then the big reveal.', 200, 'bad', 1, '"The neck is wrong. Swans don\'t lean left." Start again from scratch.'],
        ['Rough pour, show her, adjust', 'Pour a quick swan in 40 seconds, ask, then pour the final one.', 120, 'good', 3, '"Rounder wings." The second pour nails it. Feedback after 40 seconds beat guessing for 3 minutes.'],
        ['Hand her the milk jug', '"You know what you want. You do it."', 30, 'bad', 0, 'There is now milk on the ceiling.']] },
    { id: 'josh', face: '🧔', name: 'Just-a-quick-one Josh', role: 'Knows exactly what he wants', deadline: 60, say: 'Black americano. That\'s it. I\'ve got a minute.',
      opts: [['Make it as ordered', '40 seconds. Hand it over.', 40, 'good', 3, 'Done. When the whole thing fits the deadline there\'s nothing to slice. Just ship it.'],
        ['Half an americano now', 'Serve a thin slice, top it up next visit.', 20, 'bad', 0, '"Why is this half a cup?" Slicing below the point of value is just waste.'],
        ['Pilot a caramel drizzle', 'He might love it. Who knows?', 70, 'meh', 1, 'Late, sticky, and nobody asked for it.']] },
    { id: 'kev', face: '🕵️', name: 'Compliance Kev', role: 'Has a clipboard', deadline: 300, say: 'Whole milk latte. I need a signed allergen declaration and a second barista to verify. Five minutes, max.',
      opts: [['Full process, every time', 'Fill in the form, fetch a second barista to countersign.', 280, 'meh', 1, 'Kev is satisfied. The six people behind him are not: the second barista left the bar for three minutes.'],
        ['Allergen card printed on the cup', 'Serve now with the standard allergen card. Email the signed form.', 70, 'good', 3, '"Acceptable control." A check built into the work beats a handoff to a second person.'],
        ['Skip the form', 'It\'s just milk.', 45, 'bad', 0, 'Kev opens an incident. You now have a 40-minute retro.']] }
  ];

  const vote = (o) => Object.assign({ kind: 'vote' }, o);
  const play = (o) => Object.assign({ kind: 'play' }, o);
  const card = (o) => Object.assign({ kind: 'card' }, o);
  const STEPS = [
    card({ round: 'intro', notes: { say: 'Welcome. Four rounds in a real café sim, about 30 minutes. Before each run the room predicts what will happen: A, B or C in the chat.', ask: 'Warm-up: "How long did you wait for your last coffee?"', hx: 'Built on the flow efficiency artefact: most of the time a change takes is spent waiting, not working.' },
      html: () => `<div class="ws-split"><div class="ws-stack">
        <span class="ws-k">A 30-minute workshop about flow</span>
        <h2 class="ws-title">Flow <em>&amp;</em> Froth</h2>
        <p class="ws-lede">We run a café. Before each run you predict what happens, then we watch it happen in the shop, then we work out why.</p>
        <ol class="ws-list">
          <li><b>Rush hour.</b> How busy is too busy?</li>
          <li><b>Start everything.</b> Juggling versus finishing.</li>
          <li><b>The latte art guild.</b> Specialists, handoffs and an AI upgrade.</li>
          <li><b>Impossible orders.</b> Big specs, tiny deadlines.</li>
        </ol>
        <p class="ws-chat"><span>A / B / C</span>When we vote, type your answer in the chat.</p>
      </div><div class="ws-stack">
        <span class="ws-k">The cast</span>
        <div class="ws-cast">${[['Bo', 'Our only barista'], ['Ana', 'Runs the research'], ['Gustavo', 'The only one allowed on espresso'], ['Gio & Sam', 'Till and filter'], ['The AI grinder', 'Grinds twice as fast'], ['Yasmin, Steve, Priya, Josh, Kev', 'Customers with opinions']].map(([n, r]) => `<div><b>${n}</b><span>${r}</span></div>`).join('')}</div>
      </div></div>` }),
    card({ round: 'intro', notes: { say: 'Customers feel one number: the time from walking in to coffee in hand. Busy staff don\'t make that number smaller.', ask: '"Who has waited ten minutes for a one-minute coffee?"', hx: 'Typical flow efficiency is 5–15%: about 85% of a change\'s life is spent waiting in queues and handoffs.' },
      html: () => `<div class="ws-split"><div class="ws-stack">
        <span class="ws-k">Why a coffee shop?</span>
        <h2>A filter coffee takes about two minutes to brew. So why were you in the shop for twenty?</h2>
        <p class="ws-lede">Customers don't see how busy the staff are. They feel the time from the door to coffee in hand. Software works the same way: most of the time a change takes is spent waiting, not being worked on.</p>
        <p class="ws-hx"><span class="ws-k">At hx</span>Measured flow efficiency in typical organisations is 5–15%. The rest is queues: waiting for review, for another team, for a reply.</p>
      </div><div class="ws-stack">
        <span class="ws-k">Life of a typical change</span>
        <div class="ws-flowbar"><i style="width:15%">15%</i><s>85% waiting</s></div>
        <p class="ws-small">Green: someone is working on it. Grey: it is sitting in a queue.</p>
      </div></div>` }),

    // ----- round 1 -----
    vote({ round: 'r1', id: 'v1', warm: () => warm(rushCurve), kicker: 'Round 1 · Rush hour', title: 'Management wants Bo busy all day.',
      body: 'Bo runs the shop alone: takes the order, brews, hands it over. "An idle barista is wasted money," says management. We\'ll make the shop busier and busier.',
      q: 'When Bo is busy 96% of the time instead of 60%, how long do customers spend in the shop?',
      options: [['A', 'About the same', 'Bo is just working harder.'], ['B', 'About 50% longer', 'A bit more queueing.'], ['C', 'More than twice as long', 'Something non-linear happens.']],
      answer: 'C', notes: { say: 'Introduce Bo and the "keep everyone busy" target. Let the chat vote for about 30 seconds.', ask: 'Read the question and the options.', answer: 'C. About 9 minutes at 60% busy, about 21 at 96%. Waiting grows as u ÷ (1 − u).', hx: 'Keeping everyone 100% busy is a resource-efficiency goal, not a flow goal.' } }),
    play({ round: 'r1', id: 'p1', scenario: 'rush', variants: () => L.SCENARIOS.rush.levels.map((l) => [l.key, l.label]), start: 'quiet',
      title: (v) => 'Bo on a ' + L.SCENARIOS.rush.levels.find((l) => l.key === v).label.toLowerCase() + ' afternoon',
      notes: { say: 'Start on Quiet, then click Steady, Busy and Rush hour in the bar at the bottom. Each is three café hours; 20× speed gets through one in about 20 seconds.', ask: 'On Rush hour: "Bo is barely busier than on Busy. Why is the queue out of the door?"', answer: 'Arrivals bunch up and a barista with no slack can\'t absorb them. The queue never gets the chance to drain.', hx: 'At 90% busy, a request waits about 9 jobs\' worth before anyone starts it.' },
      tickets(g, S) {
        const w = S.workers[0], busy = L.busyShare(S, w, Math.max(0, S.t - 1800));
        const q = S.items.reduce((n, i) => n + (i.type === 'till' ? i.queue.length : 0), 0);
        return [{ sev: 'step', k: 'Bo, last 30 min', title: pct(busy) + ' busy', bar: busy, body: 'Time in shop ' + f1(g.tr.mean()) + ' min · ' + q + ' queuing' }];
      } }),
    card({ round: 'r1', notes: { say: 'Point at the curve: flat, flat, then a cliff.', ask: '"Where on this curve does your team sit?"', hx: 'At 90% busy a request waits ~9 jobs\' worth. Leave slack (70–80%) so other teams\' requests can flow.' },
      html: () => { const c = rushCurve(), lo = c[1], hi = c[3];
        return `<div class="ws-split"><div class="ws-stack">
          <span class="ws-k">Round 1 · What happened</span>
          <h2>Busy is not the same as fast.</h2>
          <p class="ws-formula">wait ∝ u ÷ (1 − u)</p>
          <p class="ws-lede">At ${pct(lo.busy)} busy, customers spent ${f1(lo.lead)} min in the shop. At ${pct(hi.busy)} they spent ${f1(hi.lead)} min: ${f1(hi.lead / lo.lead)}× longer for the same coffee. Customers arrive in bunches, and a barista with no slack can't absorb them.</p>
          ${verdict('v1', 'C')}
          <p class="ws-hx"><span class="ws-k">At hx</span>A team that's 90% loaded makes every incoming request wait about 9 jobs' worth before anyone starts it. Plan for slack, around 70–80%, so requests from other teams flow instead of queueing.</p>
        </div><div class="ws-stack">${curveSVG(c)}<p class="ws-small">Each dot is the average of four three-hour afternoons in this café. The line is the u ÷ (1 − u) shape, fitted to them.</p></div></div>`; } }),

    // ----- round 2 -----
    vote({ round: 'r2', id: 'v2', warm: () => warm(() => result('study', 'focus'), () => result('study', 'split')), kicker: 'Round 2 · Start everything', title: 'Ana has three improvements to research.',
      body: 'A house blend (sells for more), a cake supplier and queue music. Each is the same size. Research is Ana\'s spare capacity, and switching between topics costs a little each time.',
      q: 'Which gets the first improvement into the shop sooner?',
      options: [['A', 'One at a time', 'Finish the blend, then cake, then music.'], ['B', 'All at once', 'Everything moves forward together.'], ['C', 'No difference', 'Same work, same capacity.']],
      answer: 'A', notes: { say: 'Three equal pieces of work, one person\'s spare capacity. Starting everything feels productive.', ask: 'Read the options. Expect plenty of C.', answer: 'A. One at a time ships the first after 30 min; all at once ships nothing until 136 min, and switching costs a quarter of the capacity.', hx: 'Every half-started PR is research at 33%: no value until it finishes.' } }),
    play({ round: 'r2', id: 'p2', scenario: 'study', variants: () => [['focus', VARIANT.study.focus], ['split', VARIANT.study.split]], start: () => (W.votes.v2 === 'B' ? 'split' : 'focus'),
      title: (v) => 'Ana researches ' + VARIANT.study[v].toLowerCase(),
      notes: { say: 'Run the room\'s choice, then click the other option to compare. Watch the three research tickets on the left.', ask: '"Which tickets have finished?"', answer: 'One at a time: the first lands at 30 min. All at once: all three crawl and land together at 136 min.', hx: 'Little\'s Law: the more you have in progress at the same rate, the longer each thing takes.' },
      tickets(g, S) {
        return L.SCENARIOS.study.topics.map((k) => { const r = S.research[k], work = S.R.research.topics[k].work;
          return { sev: r.complete ? 'good' : 'step', k: r.complete ? 'Done at ' + f0(r.finished / 60) + ' min' : r.weight > 0 ? 'In progress' : 'Waiting', title: Sim.TOPICS[k].name, bar: r.done / work, body: Math.round(100 * r.done / work) + '% · value only when finished' }; });
      } }),
    card({ round: 'r2', notes: { say: 'Little\'s Law: things in progress = rate × time each takes. Same rate, more in progress, longer waits.', ask: '"How many things do you have started right now?"', hx: 'Every half-done PR, ticket and spike is value nobody gets yet. Limit work in progress and finish together.' },
      html: () => { const a = result('study', 'focus'), b = result('study', 'split');
        return `<div class="ws-split"><div class="ws-stack">
          <span class="ws-k">Round 2 · What happened</span>
          <h2>Stop starting. Start finishing.</h2>
          <p class="ws-formula">L = λ × W</p>
          <p class="ws-lede">Things in progress = rate of finishing × time each takes. One at a time, each topic took ${f0(a.avgLead)} min and the first was in the shop after ${f0(a.first)}. All at once, each took ${f0(b.avgLead)} min, nothing landed until ${f0(b.first)}, and ${f0(b.lost)} units of research went on switching.</p>
          ${verdict('v2', 'A')}
          <p class="ws-hx"><span class="ws-k">At hx</span>Every half-done PR, ticket and spike is work nobody benefits from yet: context fades and rework grows. Limit work in progress and help each other finish.</p>
        </div><div class="ws-stack">${ganttSVG([['One at a time', a], ['All at once', b]])}
          ${table([['', 'One at a time', 'All at once'], ['First in the shop', f0(a.first) + ' min', f0(b.first) + ' min'], ['All three done', f0(a.all) + ' min', f0(b.all) + ' min'], ['Average time per topic', f0(a.avgLead) + ' min', f0(b.avgLead) + ' min'], ['Lost to switching', '0', f0(b.lost) + ' units']])}</div></div>`; } }),

    // ----- round 3 -----
    vote({ round: 'r3', id: 'v3', warm: () => warm(...['base', 'ai', 'hire', 'cross', 'skip'].map((v) => () => result('guild', v === 'hire' ? 'base' : v))), kicker: 'Round 3 · The latte art guild', title: 'Only Gustavo may touch the espresso machines.',
      body: 'Three staff, two espresso machines, one milk station. Gio and Sam take orders and pour filter. Every espresso and latte waits for Gustavo, the only one "qualified".',
      q: 'On a busy afternoon, how long does a customer spend in the shop?',
      options: [['A', 'About 10 minutes', 'Two machines is plenty.'], ['B', 'About 15 minutes', 'A bit of a wait for lattes.'], ['C', 'About 20 minutes', 'Everyone waits for Gustavo.']],
      answer: 'C', notes: { say: 'Introduce Gustavo, the specialist everyone depends on. Point at the two machines and the two people who aren\'t allowed near them.', ask: 'Read the question.', answer: 'C. About 20 minutes, and a few customers walk out. Gustavo is 95% busy; Gio is half idle and Sam mostly idle.', hx: 'Gustavo is the team that owns a service few others can change.' } }),
    play({ round: 'r3', id: 'p3', scenario: 'guild', fixed: 'base', title: () => 'Gustavo\'s guild',
      notes: { say: 'Click Gustavo to see his stations, then the Flow chart (F) to show who is busy. Gustavo\'s queue never empties.', ask: '"Who is busy and who is waiting?"', answer: 'Gustavo is flat out; Gio and Sam idle half the time; espresso customers wait longest.', hx: 'The bottleneck is a person, not a machine: capacity exists but only one person may use it.' },
      tickets: guildTickets }),
    vote({ round: 'r3', id: 'v3ai', kicker: 'Round 3 · Plot twist', title: 'Management buys an AI grinder.',
      body: 'It grinds every dose in half the time. The launch email has eleven rocket emoji. Gustavo is still the only one allowed on the espresso machines.',
      q: 'How much sooner do customers get their coffee?',
      options: [['A', 'Twice as fast', 'The grinder is twice as fast.'], ['B', 'About 25% faster', 'Grinding is part of every espresso.'], ['C', 'Barely any faster', 'Hmm. Gustavo…']],
      answer: 'C', notes: { say: 'Lean into the hype. This is the AI-native moment.', ask: 'Read the options.', answer: 'C. No faster at all on this afternoon (20.5 → 20.7 min). Grinding was never the bottleneck: Gustavo was.', hx: 'AI speeds up the working 15%. The 85% spent waiting is untouched.' } }),
    play({ round: 'r3', id: 'p3ai', scenario: 'guild', fixed: 'ai', title: () => 'Now with the AI grinder',
      notes: { say: 'Same customers as before. Compare the time in shop on the ticket with the last run.', ask: '"Why didn\'t it help?"', answer: 'It sped up a step that wasn\'t holding anyone up. Drinks still queue for Gustavo.', hx: 'Find the bottleneck before buying speed.' },
      tickets: guildTickets }),
    vote({ round: 'r3', id: 'v3fix', kicker: 'Round 3 · Fix the flow', title: 'Gustavo has a queue. What should we do?',
      body: 'Pick a fix. We\'ll run the same customers again; you can try the others afterwards.',
      q: 'Which fix should we try?',
      options: [['A', 'Hire a second Gustavo', 'Approved! Starts next quarter, after onboarding.'], ['B', 'Cross-train the crew', 'Everyone may use every station, espresso included.'], ['C', 'Take lattes off the menu', 'Less milk work for Gustavo.']],
      notes: { say: 'No single right answer. B and C both help; A changes nothing this quarter.', ask: 'Read the options.', answer: 'B: 12.5 min, no walk-outs, happiest customers, everyone sharing the work. C: 11.5 min but latte drinkers settle for something else. A: same as today.', hx: 'B = grow the contributor pool. C = cut scope that only the bottleneck can do.' } }),
    play({ round: 'r3', id: 'p3fix', scenario: 'guild', variants: () => [['hire', VARIANT.guild.hire], ['cross', VARIANT.guild.cross], ['skip', VARIANT.guild.skip]], start: () => FIX[W.votes.v3fix || 'B'],
      title: (v) => VARIANT.guild[v], banner: (v) => (v === 'hire' ? 'Gustavo #2 starts next quarter, after onboarding. Today\'s customers get today\'s shop.' : ''),
      notes: { say: 'Run the room\'s pick, then click the other fixes in the bar.', ask: '"Which would work in your team?"', answer: 'Cross-training spreads the work: everyone about 70% busy, time in shop down by a third.', hx: 'Choose tools, languages and docs that more people can confidently work in.' },
      tickets: guildTickets }),
    card({ round: 'r3', notes: { say: 'Bring it back to the artefact: specialists and handoffs, and why AI alone doesn\'t fix it.', ask: '"Who is the Gustavo in your world?"', hx: 'When only one team can confidently change a service, every change becomes a handoff into their queue.' },
      html: () => { const b = result('guild', 'base'), ai = result('guild', 'ai'), c = result('guild', 'cross'), k = result('guild', 'skip');
        const save = (b.lead - ai.lead) / b.lead;
        return `<div class="ws-split"><div class="ws-stack">
          <span class="ws-k">Round 3 · What happened</span>
          <h2>Find the bottleneck before you buy speed.</h2>
          <p class="ws-lede">With Gustavo the only one allowed on espresso, customers spent ${f1(b.lead)} min in the shop and he was ${pct(b.busy[0].share)} busy while Gio and Sam idled. ${save > 0.01 ? 'The AI grinder saved just ' + pct(save) + '.' : 'The AI grinder changed nothing: ' + f1(ai.lead) + ' min.'} Cross-training cut it to ${f1(c.lead)} min, with no walk-outs and the happiest customers of any run. Taking lattes off was quicker still, but latte drinkers had to settle.</p>
          <div class="ws-verdicts">${verdict('v3', 'C', 'Time in shop')}${verdict('v3ai', 'C', 'AI grinder')}</div>
          <p class="ws-hx"><span class="ws-k">At hx</span>When only one team can confidently change a service, every change queues for them, and context is lost at each handoff. AI speeds up the working time, but a typical organisation is only 5–15% working. Grow the contributor pool: tools, languages and docs more people can work in.</p>
        </div><div class="ws-stack">
          ${table([['Run', 'In shop', 'Walked out', 'Happy'], ...[['Gustavo only', b], ['AI grinder', ai], ['Fix A: hire (next quarter)', b], ['Fix B: cross-train', c], ['Fix C: lattes off', k]].map(([n, r]) => [n, f1(r.lead) + ' min', r.walked, pct(r.sat)])])}
          ${table([['How busy', ...b.busy.map((x) => x.name)], ['Gustavo only', ...b.busy.map((x) => pct(x.share))], ['Cross-trained', ...c.busy.map((x) => pct(x.share))]])}
        </div></div>`; } }),

    // ----- round 4 -----
    vote({ round: 'r4', id: 'v4', warm: () => warm(...['bigbang', 'iterate', 'filter'].map((v) => () => result('mocha', v))), kicker: 'Round 4 · Impossible orders', title: 'Customers want mochas with cream.',
      body: 'Our shop sells filter coffee. Mochas need espresso training, steamed milk, a syrup station and whipped cream: hours of research, plus four new machines to build.',
      q: 'Over a five-hour day, what earns the most and serves the most customers?',
      options: [['A', 'Everything first', 'Stay closed until mochas are ready, then launch properly.'], ['B', 'Open now, add as ready', 'Sell filter today; add espresso, lattes and mochas as each lands.'], ['C', 'Filter only', 'Forget mochas. Keep it simple.']],
      answer: 'B', notes: { say: 'This is our "triple-shot caramel mocha in 10 seconds" in shop form.', ask: 'Read the options.', answer: 'B. Opening now serves about three times as many customers as the big launch, and earns the most.', hx: 'Ship the smallest valuable slice, then iterate.' } }),
    play({ round: 'r4', id: 'p4', scenario: 'mocha', variants: () => [['bigbang', VARIANT.mocha.bigbang], ['iterate', VARIANT.mocha.iterate], ['filter', VARIANT.mocha.filter]], start: () => MOCHA[W.votes.v4 || 'B'],
      title: (v) => VARIANT.mocha[v],
      notes: { say: 'The coach researches and builds each machine as it unlocks; watch the crates arrive. Run the room\'s pick, then the others.', ask: '"When did the first customer get served?"', answer: 'The big launch serves nobody for most of the day; opening now serves from minute one and adds drinks as they land.', hx: 'Value starts when something is in a customer\'s hands, not when the plan is complete.' },
      tickets(g, S) {
        const open = S.open, menu = Sim.offered(S).map((p) => Sim.PROD[p].name);
        return [{ sev: open ? 'good' : 'warn', k: open ? 'Open' : 'Closed until mochas are ready', title: S.st.served + ' served', body: 'Takings ' + money(S.st.revenue) },
          { sev: 'step', k: 'On the menu', title: menu.length ? menu.length + ' drink' + (menu.length > 1 ? 's' : '') : 'Nothing yet', body: menu.join(', ') || 'Research and building in progress' }];
      } }),
    card({ round: 'r4', notes: { say: 'The shop version of "a good mocha now, caramel next visit". Then five quick customers.', ask: '', hx: 'With AI, building a slice is cheap. Waiting for feedback is the expensive part.' },
      html: () => { const a = result('mocha', 'bigbang'), b = result('mocha', 'iterate'), c = result('mocha', 'filter');
        return `<div class="ws-split"><div class="ws-stack">
          <span class="ws-k">Round 4 · What happened</span>
          <h2>Open now. Add the caramel next visit.</h2>
          <p class="ws-lede">Waiting for the full mocha line meant ${a.menuAt.filter != null ? 'opening after ' + f0(a.menuAt.filter) + ' min' : 'a late opening'} and serving ${a.served} customers. Opening at once and adding each drink as it was ready served ${b.served} and took ${money(b.revenue)}. Filter-only served ${c.served} but never gave anyone the drink they came for.</p>
          ${verdict('v4', 'B')}
          <p class="ws-hx"><span class="ws-k">At hx</span>Put a thin, valuable version in front of customers early and learn from it. The full spec, delivered late, earns nothing while you wait.</p>
        </div><div class="ws-stack">${table([['', 'Everything first', 'Open now, add as ready', 'Filter only'], ['Customers served', a.served, b.served, c.served], ['Takings', money(a.revenue), money(b.revenue), money(c.revenue)], ['Satisfaction', pct(a.sat), pct(b.sat), pct(c.sat)], ['Espresso on the menu', menuTime(a, 'espresso'), menuTime(b, 'espresso'), '–'], ['Mochas on the menu', menuTime(a, 'mocha'), menuTime(b, 'mocha'), '–']])}</div></div>`; } }),
    ...PERSONAS.map((p, i) => ({ kind: 'persona', round: 'r4', persona: p, idx: i,
      notes: { say: `Lightning round, customer ${i + 1} of ${PERSONAS.length}. Read the speech bubble in character.`, ask: 'A, B or C in the chat.', answer: p.opts.map((o, j) => 'ABC'[j] + ': ' + (o[3] === 'good' ? 'best' : o[3])).join(' · '), hx: i === 3 ? 'Josh is the trap: slicing is for when the whole thing doesn\'t fit.' : i === 4 ? 'Build checks into the work instead of adding a handoff.' : 'Smallest valuable slice first, then iterate with feedback.' } })),

    // ----- wrap -----
    card({ round: 'wrap', notes: { say: 'Five takeaways, then the Gustavo question. Share the artefact link.', ask: '"Where is Gustavo on your team? One word in the chat."', hx: 'Flow is a property of the system. Look at queues and handoffs, not at how busy people are.' },
      html: () => { const c = rushCurve(), s = result('study', 'focus'), sp = result('study', 'split'), b = result('guild', 'base'), ai = result('guild', 'ai'), cr = result('guild', 'cross'), it = result('mocha', 'iterate'), bb = result('mocha', 'bigbang');
        const T = [['Round 1', 'Busy ≠ fast', 'Leave slack. Waits explode near 100%.', `Bo: ${f1(c[1].lead)} → ${f1(c[3].lead)} min`],
          ['Round 2', 'Stop starting, start finishing', 'Limit work in progress.', `First done at ${f0(s.first)} vs ${f0(sp.first)} min`],
          ['Round 3', 'Grow the contributor pool', 'One gatekeeper is a queue.', `Gustavo only ${f1(b.lead)} → cross-trained ${f1(cr.lead)} min`],
          ['Round 3', 'Find the bottleneck first', 'Speeding up the wrong step changes little.', `AI grinder: ${f1(b.lead)} → ${f1(ai.lead)} min`],
          ['Round 4', 'Ship the good mocha', 'Thin, valuable slices first.', `${bb.served} → ${it.served} customers served`]];
        return `<div class="ws-stack">
          <span class="ws-k">Last orders</span><h2>Five things to take back to your team</h2>
          <div class="ws-takes">${T.map(([r, t, p, n]) => `<div><span class="ws-k">${r}</span><b>${t}</b><p>${p}</p><code>${n}</code></div>`).join('')}</div>
          <p class="ws-hx"><span class="ws-k">Discussion</span><b>Where is Gustavo on your team?</b> Type one word in the chat. Then read the <a href="${ARTEFACT}" target="_blank" rel="noopener">flow efficiency artefact</a> for the full argument.</p>
        </div>`; } })
  ];

  // ---------- small renderers ----------
  function verdict(id, answer, label) {
    if (!answer) return '';
    const v = W.votes[id];
    return `<p class="ws-verdict">${label ? esc(label) + ': ' : ''}${v ? 'room said ' + v + ' · ' : ''}answer ${answer}</p>`;
  }
  function table(rows) {
    return `<table class="ws-table">${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table>`;
  }
  const menuTime = (r, p) => (r.menuAt && r.menuAt[p] != null ? f0(r.menuAt[p]) + ' min' : 'not today');
  // time in shop against how busy Bo is, with a b + k·u/(1−u) curve fitted to the dots
  function curveSVG(c) {
    const W0 = 420, H0 = 250, X = (u) => 46 + u * 350, Y = (m) => 210 - Math.min(m, 30) * 6.2;
    const xs = c.map((p) => p.busy / (1 - p.busy)), ys = c.map((p) => p.lead), n = c.length;
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const k = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) * (x - mx), 0), b0 = my - k * mx;
    let d = '', g = '';
    for (let u = 0; u <= 0.985; u += 0.005) { const m = b0 + k * u / (1 - u); if (m > 30) break; d += (d ? 'L' : 'M') + X(u).toFixed(1) + ' ' + Y(m).toFixed(1); }
    for (const m of [0, 10, 20, 30]) g += `<line class="grid" x1="46" x2="396" y1="${Y(m)}" y2="${Y(m)}"/><text x="38" y="${Y(m) + 4}" text-anchor="end">${m}</text>`;
    for (const u of [0, 0.25, 0.5, 0.75, 1]) g += `<text x="${X(u)}" y="228" text-anchor="middle">${u * 100}%</text>`;
    g += `<path class="fit" d="${d}"/>`;
    for (const p of c) g += `<circle class="dot" cx="${X(p.busy)}" cy="${Y(p.lead)}" r="6"/><text class="lab" x="${X(p.busy) - 9}" y="${Y(p.lead) - 9}" text-anchor="end">${f1(p.lead)}</text>`;
    g += `<text x="221" y="246" text-anchor="middle">how busy Bo is</text><text x="12" y="120" text-anchor="middle" transform="rotate(-90 12 120)">minutes in the shop</text>`;
    return `<svg class="ws-chart" viewBox="0 0 ${W0} ${H0}" role="img" aria-label="Time in the shop against how busy the barista is">${g}</svg>`;
  }
  // when each research topic was in progress, for each way of working
  function ganttSVG(rows) {
    const end = Math.max(...rows.map(([, r]) => r.all || 150)), X = (m) => 120 + (m / end) * 290;
    let g = '', y = 14;
    for (const [label, r] of rows) {
      g += `<text class="lab" x="0" y="${y + 10}">${esc(label)}</text>`;
      r.span.forEach((s, i) => { if (s.start == null) return; const e = s.end == null ? end : s.end;
        g += `<rect class="bar b${i}" x="${X(s.start)}" y="${y + i * 15 - 4}" width="${Math.max(2, X(e) - X(s.start))}" height="11" rx="2"/>`;
        if (s.end != null) g += `<text x="${X(e) + 4}" y="${y + i * 15 + 5}">${f0(s.end)}</text>`; });
      y += 62;
    }
    for (const m of [0, 60, 120]) if (m <= end) g += `<text x="${X(m)}" y="${y + 2}" text-anchor="middle">${m} min</text>`;
    const names = rows[0][1].span.map((s, i) => `<span><i class="b${i}"></i>${esc(s.name)}</span>`).join('');
    return `<svg class="ws-chart" viewBox="0 0 440 ${y + 10}" role="img" aria-label="When each research topic was in progress">${g}</svg><p class="ws-legend">${names}</p>`;
  }
  function guildTickets(g, S) {
    const from = Math.max(0, S.t - 1800);
    return [{ sev: 'step', k: 'Customers', title: f1(g.tr.mean()) + ' min in shop', body: S.st.served + ' served · ' + S.st.abandoned + ' walked out' }]
      .concat(S.workers.map((w) => { const b = L.busyShare(S, w, from); return { sev: b > 0.85 ? 'crit' : b > 0.6 ? 'warn' : 'info', k: w.all ? 'Every station' : w.patch.map((id) => Sim.label(S, S.imap[id])).join(', '), title: w.name + ' ' + pct(b), bar: b, body: 'busy, last 30 min' }; }));
  }

  // ---------- state, overlay and strip ----------
  const W = { on: false, i: 0, votes: {}, picks: {}, live: null, variant: {}, hidden: false };
  let ov, cardEl, footEl, bar;
  function build() {
    if (ov) return;
    ov = document.createElement('div'); ov.className = 'ws'; ov.hidden = true;
    ov.innerHTML = '<div class="ws-card" role="dialog" aria-modal="true" aria-label="Workshop"><div class="ws-body" id="wsBody"></div><div class="ws-foot" id="wsFoot"></div></div>';
    document.body.appendChild(ov);
    cardEl = ov.querySelector('#wsBody'); footEl = ov.querySelector('#wsFoot');
    bar = document.createElement('div'); bar.className = 'ws-bar'; bar.hidden = true;
    (document.getElementById('stage') || document.body).appendChild(bar);
    ov.addEventListener('click', onClick); bar.addEventListener('click', onClick);
  }
  function onClick(e) {
    const b = e.target.closest('[data-ws]'); if (!b) return;
    const a = b.dataset.ws, v = b.dataset.v;
    if (a === 'next') go(W.i + 1);
    else if (a === 'back') go(W.i - 1);
    else if (a === 'pick') choose(v);
    else if (a === 'variant') runVariant(v);
    else if (a === 'restart') runVariant(W.live.variant);
    else if (a === 'leave') stop();
    else if (a === 'peek') peek(!W.hidden);
  }

  function start() {
    build();
    W.on = true; UI.hooks.quiet = true;
    UI.hooks.tickets = () => { const st = STEPS[W.i]; return W.live && st.kind === 'play' && st.tickets ? st.tickets(W.live, UI.S) : []; };
    // tick the lesson every step up to the end of its café day, then pause on that exact tick, so a run nobody
    // touches ends on the numbers the reveal quotes (the frame may step a few more ticks; they aren't counted)
    UI.hooks.onTick = (S) => {
      const g = W.live; if (!g || g.done || S.t > g.end) return;
      g.tick();
      if (S.t === g.end) { g.done = true; UI.setSpeed(0); UI.note('That\'s the end of the café day. Press Next for the reveal.', 'good'); }
    };
    UI.hideSplash(0);
    go(W.i || 0);
  }
  function stop() {
    W.on = false; W.live = null; UI.hooks.quiet = false; UI.hooks.tickets = null; UI.hooks.onTick = null;
    ov.hidden = true; bar.hidden = true;
    UI.newGame(1); UI.showSplash();
  }
  function go(i) {
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    W.i = i; const st = STEPS[i];
    if (st.warm) st.warm();
    W.hidden = false;
    if (st.kind === 'play') { ov.hidden = true; runVariant(W.variant[st.id] || (typeof st.start === 'function' ? st.start() : st.start) || st.fixed); }
    else { W.live = null; UI.setSpeed(0); bar.hidden = true; ov.hidden = false; renderCard(); }
  }
  function peek(on) { W.hidden = on; ov.hidden = on; bar.hidden = !on; if (on) renderPeekBar(); }

  function runVariant(v) {
    const st = STEPS[W.i]; if (st.kind !== 'play') return;
    W.variant[st.id] = v;
    const sc = L.SCENARIOS[st.scenario], lessonVariant = v === 'hire' ? 'base' : v;
    UI.newGame(sc.seed || 1, sc.rules(lessonVariant));
    W.live = L.begin(UI.S, st.scenario, lessonVariant); W.live.variant = v; W.live.end = Math.round(sc.hours * 3600); W.live.done = false;
    UI.refresh(); UI.setSpeed(20);    // a three-hour afternoon in about 18 seconds; 1–5 change speed as usual
    renderBar();
  }
  function renderCard() {
    const st = STEPS[W.i];
    let html = '';
    if (st.kind === 'vote') {
      const v = W.votes[st.id];
      html = `<div class="ws-stack"><span class="ws-k">${esc(st.kicker)}</span><h2>${esc(st.title)}</h2><p class="ws-lede">${esc(st.body)}</p></div>
        <h3 class="ws-q">${esc(st.q)}</h3>
        <div class="ws-opts">${st.options.map(([k, t, d]) => `<button type="button" class="ws-opt${v === k ? ' on' : ''}" data-ws="pick" data-v="${k}"><span class="ws-key">${k}</span><b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div>
        <p class="ws-chat"><span>A / B / C</span>Vote in the chat. The presenter presses the most popular letter, then Next to run it.</p>`;
    } else if (st.kind === 'persona') {
      const p = st.persona, k = W.picks[p.id], max = Math.max(p.deadline, ...p.opts.map((o) => o[2])) * 1.08;
      const sc = PERSONAS.reduce((n, q) => { const pk = W.picks[q.id]; return n + (pk ? q.opts['ABC'.indexOf(pk)][4] : 0); }, 0);
      html = `<div class="ws-head"><div class="ws-stack"><span class="ws-k">Round 4 · Lightning round · ${st.idx + 1} of ${PERSONAS.length}</span><h2>${esc(p.name)}</h2></div><p class="ws-meter">Happiness <b>${sc}</b> / ${PERSONAS.length * 3}</p></div>
        <div class="ws-split ws-persona"><div class="ws-stack"><div class="ws-face"><span>${p.face}</span><div><b>${esc(p.role)}</b><span class="ws-deadline">Deadline ${secs(p.deadline)}</span></div></div><p class="ws-speech">${esc(p.say)}</p></div>
        <div class="ws-stack">${p.opts.map((o, j) => { const K = 'ABC'[j], late = o[2] > p.deadline;
          return `<button type="button" class="ws-och${k === K ? ' on' : ''}" data-ws="pick" data-v="${K}"><span class="ws-key">${K}</span><span class="ws-och-b"><b>${esc(o[0])}</b><span>${esc(o[1])}</span>
            <span class="ws-time"><span class="ws-track"><s class="${late ? 'late' : ''}" style="width:${o[2] / max * 100}%"></s><i style="left:${p.deadline / max * 100}%"></i></span>${o[2] ? secs(o[2]) : '–'}${late ? ' · late' : ''}</span>
            ${k === K ? `<span class="ws-out ${o[3]}">${esc(o[5])}</span>` : ''}</span></button>`; }).join('')}</div></div>`;
    } else html = st.html();
    cardEl.innerHTML = html;
    const r = STEPS[W.i].round;
    footEl.innerHTML = `<button type="button" data-ws="back"${W.i ? '' : ' disabled'}>◂ Back</button>
      <span class="ws-where">${esc(R[r])} · step ${W.i + 1} of ${STEPS.length}</span>
      <button type="button" class="ws-ghost" data-ws="peek" title="Hide this card to look at the shop (Esc)">Peek</button>
      <button type="button" class="ws-ghost" data-ws="leave">Leave workshop</button>
      <button type="button" class="primary" data-ws="next"${W.i < STEPS.length - 1 ? '' : ' disabled'}>${STEPS[W.i + 1] && STEPS[W.i + 1].kind === 'play' ? 'Run it' : 'Next'} ▸</button>`;
  }
  const secs = (s) => (s < 120 ? s + 's' : (s / 60).toFixed(s % 60 ? 1 : 0) + ' min');
  function choose(k) {
    const st = STEPS[W.i];
    if (st.kind === 'vote') { W.votes[st.id] = k; renderCard(); }
    else if (st.kind === 'persona') { W.picks[st.persona.id] = k; renderCard(); }
  }
  function renderPeekBar() { bar.innerHTML = `<span class="ws-k">Peeking at the shop</span><button type="button" class="primary" data-ws="peek">Back to the card</button>`; }
  function renderBar() {
    const st = STEPS[W.i]; if (st.kind !== 'play' || !W.live) return;
    const v = W.live.variant, S = UI.S, prog = Math.min(1, S.t / W.live.end);
    const chips = st.variants ? `<span class="ws-chips">${st.variants().map(([k, label]) => `<button type="button" data-ws="variant" data-v="${k}" aria-pressed="${k === v}">${esc(label)}</button>`).join('')}</span>` : '';
    const banner = st.banner ? st.banner(v) : '';
    const html = `<span class="ws-bar-t"><span class="ws-k">${esc(R[st.round])}</span><b>${esc(st.title(v))}</b>${banner ? `<span class="ws-banner">${esc(banner)}</span>` : ''}</span>${chips}
      <span class="ws-prog" title="Café time"><s style="width:${(prog * 100).toFixed(1)}%"></s></span><span class="ws-clock">${W.live.done ? 'Done' : Math.floor(S.t / 3600) + 'h ' + String(Math.floor(S.t / 60) % 60).padStart(2, '0') + 'm'}</span>
      <button type="button" data-ws="restart" title="Run it again from the start">↺</button>
      <button type="button" data-ws="back">◂</button><button type="button" class="primary" data-ws="next">${W.live.done ? 'Reveal' : 'Next'} ▸</button>`;
    if (bar.html !== html) { bar.html = html; bar.innerHTML = html; }
    bar.hidden = false;
  }
  // keep the strip current
  setInterval(() => { if (W.on && W.live && !W.hidden) renderBar(); }, 250);

  // Keys. N, → and ← (unused by the game) move through the steps anywhere. While a card is up it takes A/B/C and Esc,
  // and keeps the game's own shortcuts (Space, digits, B, F, T, R) from reaching the paused shop behind it.
  // Everything else passes through: browser zoom, Tab, and Enter or Space on a focused button.
  const GAME_KEYS = /^(Digit[0-9]|KeyB|KeyF|KeyT|KeyR)$/;
  window.addEventListener('keydown', (e) => {
    if (!W.on || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('textarea, input'))) return;
    const k = e.key, cardUp = !ov.hidden, eat = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (k === 'ArrowRight' || k === 'n' || k === 'N' || k === 'PageDown') { eat(); go(W.i + 1); return; }
    if (k === 'ArrowLeft' || k === 'PageUp') { eat(); go(W.i - 1); return; }
    if (k === 'Escape' && (cardUp || W.hidden)) { eat(); peek(!W.hidden); return; }
    if (!cardUp) return;
    if (/^[abc]$/i.test(k)) { eat(); choose(k.toUpperCase()); return; }
    if (e.code === 'Space') { e.stopImmediatePropagation(); return; }   // a focused button still gets its click
    if (GAME_KEYS.test(e.code)) eat();
  }, true);

  // ---------- entry points ----------
  function script() {
    UI.hideSplash(0); document.body.classList.add('ws-script-mode');
    const page = document.createElement('div'); page.className = 'ws-script';
    page.innerHTML = '<h1>Flow <em>&amp;</em> Froth · presenter script</h1><p>Keep this on a second screen. The shared screen never shows the answers.</p>' +
      STEPS.map((st, i) => { const n = st.notes || {}, what = st.kind === 'vote' ? 'Vote' : st.kind === 'play' ? 'Run in the shop' : st.kind === 'persona' ? 'Customer: ' + st.persona.name : 'Card';
        return `<section><h2>Step ${i + 1} of ${STEPS.length} · ${esc(R[st.round])} · ${esc(what)}</h2>${[['Say', n.say], ['Ask', n.ask], ['Answer', n.answer], ['At hx', n.hx]].filter((x) => x[1]).map(([k, v]) => `<p><b>${k}</b> ${esc(v)}</p>`).join('')}</section>`; }).join('');
    document.body.appendChild(page);
  }
  if (location.hash === '#script') { script(); return; }
  const btn = document.getElementById('splashWorkshop');
  if (btn) btn.addEventListener('click', start);
  if (location.hash === '#workshop') setTimeout(start, 0);
  window.CoffeeWorkshop = { start, stop, go, get state() { return W; }, STEPS };
})();
