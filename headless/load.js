// Loads the shared domain files exactly as the browser does: they attach CoffeeSim and CoffeeBot to the global object.
'use strict';
require('../src/sim.js');
require('../src/bot.js');
module.exports = { Sim: globalThis.CoffeeSim, Bot: globalThis.CoffeeBot };
