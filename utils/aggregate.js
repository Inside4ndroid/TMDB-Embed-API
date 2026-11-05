// Progressive aggregator: tez providers ka result turant, slow providers (4khdhub, netmirror ...)
// background me chalte rehte hain aur agle request me jud jaate hain.
//
//   aggregate({ key, names, runOne, softMs, hardMs })
//     -> { streams, partial, pending, timings, errors }
//
// - Same key ke liye ek hi job chalta hai (har request dobara scraping nahi karta)
// - softMs: itni der tak wait karke jo mila wo wapas (partial=true agar kuch pending ho)
// - hardMs(name): kisi ek provider ko max itna time
// - Poora result (streams > 0) ttlMs tak cache hota hai
// - streams ka order "jis provider ne pehle khatam kiya" hota hai; baad ke snapshots pehle wale ka
//   superset hote hain (client sirf naye append kar sakta hai)

const jobs = new Map();
const done = new Map();
const MAX_DONE = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function startJob(key, names, runOne, hardMs, ttlMs) {
  const job = {
    key,
    startedAt: Date.now(),
    order: [],
    results: {},
    timings: {},
    errors: {},
    pending: new Set(names),
    finished: false,
  };

  job.promise = Promise.all(
    names.map(async (name) => {
      const t0 = Date.now();
      try {
        const r = await withTimeout(Promise.resolve().then(() => runOne(name)), hardMs(name), name);
        job.results[name] = Array.isArray(r) ? r : [];
        job.timings[name] = Date.now() - t0;
      } catch (e) {
        job.results[name] = [];
        job.timings[name] = null;
        job.errors[name] = e.message;
      } finally {
        job.order.push(name);
        job.pending.delete(name);
      }
    })
  ).then(() => {
    job.finished = true;
    jobs.delete(key);
    if (snapshotStreams(job).length > 0) {
      done.set(key, { t: Date.now(), ttlMs, job });
      if (done.size > MAX_DONE) done.delete(done.keys().next().value);
    }
  });

  jobs.set(key, job);
  return job;
}

function snapshotStreams(job) {
  const seen = new Set();
  const out = [];
  for (const name of job.order) {
    for (const s of job.results[name] || []) {
      if (!s || !s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
}

function snapshot(job) {
  return {
    streams: snapshotStreams(job),
    partial: !job.finished,
    pending: Array.from(job.pending),
    timings: { ...job.timings },
    errors: { ...job.errors },
  };
}

async function aggregate({ key, names, runOne, softMs = 12000, hardMs = () => 25000, ttlMs = 10 * 60 * 1000, force = false }) {
  const cached = done.get(key);
  if (!force && cached && Date.now() - cached.t < cached.ttlMs) return snapshot(cached.job);

  const job = jobs.get(key) || startJob(key, names, runOne, hardMs, ttlMs);
  if (softMs > 0 && !job.finished) await Promise.race([job.promise, sleep(softMs)]);
  return snapshot(job);
}

function _reset() { jobs.clear(); done.clear(); }

module.exports = { aggregate, withTimeout, _reset };
