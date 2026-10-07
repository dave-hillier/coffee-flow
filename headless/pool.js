// A small worker-thread pool. Each worker loads the same sim and policy files and plays whole games.
'use strict';
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread) {
  const { Bot } = require('./load');
  parentPort.on('message', ({ id, spec, seed, hours, rules, keepCode }) => {
    try {
      const r = Bot.trial(spec, seed, hours, rules);
      if (!keepCode) { delete r.code; }
      parentPort.postMessage({ id, r });
    } catch (e) { parentPort.postMessage({ id, err: e.message }); }
  });
} else {
  class Pool {
    constructor(n) {
      this.size = Math.max(1, n || os.cpus().length);
      this.workers = []; this.queue = []; this.waiting = new Map(); this.nextId = 1; this.idle = [];
      for (let i = 0; i < this.size; i++) {
        const w = new Worker(path.join(__dirname, 'pool.js'));
        w.on('message', (m) => {
          const job = this.waiting.get(m.id); this.waiting.delete(m.id);
          if (m.err) job.reject(new Error(m.err)); else job.resolve(m.r);
          this.idle.push(w); this.pump();
        });
        w.on('error', (e) => { for (const j of this.waiting.values()) j.reject(e); });
        this.workers.push(w); this.idle.push(w);
      }
    }
    run(job) {
      return new Promise((resolve, reject) => { this.queue.push({ job, resolve, reject }); this.pump(); });
    }
    pump() {
      while (this.idle.length && this.queue.length) {
        const w = this.idle.pop(), q = this.queue.shift(), id = this.nextId++;
        this.waiting.set(id, q); w.postMessage(Object.assign({ id }, q.job));
      }
    }
    close() { return Promise.all(this.workers.map((w) => w.terminate())); }
  }
  module.exports = { Pool };
}
