// Loads the shared domain files exactly as the browser does: they attach CoffeeSim, CoffeeLevels and CoffeeBot to the global object.
'use strict';
require('../src/sim.js');
require('../src/levels.js');
require('../src/bot.js');
module.exports = { Sim: globalThis.CoffeeSim, Levels: globalThis.CoffeeLevels, Bot: globalThis.CoffeeBot };
