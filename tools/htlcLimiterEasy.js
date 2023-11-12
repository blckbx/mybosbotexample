/*

Limits # of htlcs in each channel

*/

import fs from "fs";
import { subscribeToForwardRequests } from "balanceofsatoshis/node_modules/ln-service/index.js";
import bos from "../bos.js";
const { stringify, parse } = JSON;

const seconds = 1000; // ms
const minutes = 60 * seconds;

// settings
const LOG_FILE_PATH = "./logs"; // where to store yyyy-mm-dd_htlcLimiter.log files
const MAX_RAM_USE_MB = null; // end process at _ MB usedHeap, set to null to disable
const UPDATE_DELAY = 12 * seconds; // ms between re-checking active htlcs in each channel, effectively rate limiter
const GC_UPDATE_DELAY = 42 * minutes; // ms between garbage collection
const LND_CHECK_DELAY = 2 * minutes; // ms between retrying lnd if issue

const ALLOWED_PER_GROUP_MAX = 6;

const DEBUG = true;
const PRINT_WHEN_HTLCS_RECOUNTED = false; // show when UPDATE_DELAY based recount of htlcs happens

const settings = {
  policies: {}, // fee rates
  auth: undefined, // auth object for re-use
  showLogs: true, // print to stdout/terminal
  fileLogs: true, // print to file
  stop: false, // stop all htlcs
  terminate: false, // end limiter process
};

// internal
const byChannel = {};
let pendingOtherCount = 0;
let pendingForwardCount = 0;
let outgoingCount = 0;
let incomingCount = 0;
let lastPolicyCheck = 0;
const keyToAlias = {};
const idToKey = {};

// starts everything
const initialize = async (
  showLogs = true,
  fileLogs = true,
  auth = undefined
) => {
  settings.showLogs = showLogs;
  settings.fileLogs = fileLogs;

  printout("started");
  if (auth) settings.auth = await bos.initializeAuth({ providedAuth: auth });
  if (!auth) settings.auth = await bos.initializeAuth();

  try {
    // will now be listening to events about forwarding requests
    const subForwardRequests = subscribeToForwardRequests({
      lnd: settings.auth,
    });
    subForwardRequests.on("forward_request", (f) =>
      decideOnForward({ f, showLogs })
    );

    // starts infinite async loop of updating snapshots of in flight htlcs for all channels
    updatePendingCounts({ subForwardRequests, showLogs });

    printout("initialized");
    return settings;
  } catch (e) {
    printout(
      `could not subscribe to htlc requests, re-initializing in ${LND_CHECK_DELAY}`
    );
    await sleep(LND_CHECK_DELAY);
    return await initialize(showLogs, fileLogs); // needs new auth, node likely restarted
  }
};

// decide to allow or block forward request
const decideOnForward = ({ f }) => {
  if (settings.stop) return f.reject(); // if stop all new forwards

  try {
    // how many unsettled
    const inboundCount = byChannel[f.in_channel] ?? 0;
    const outboundCount = byChannel[f.out_channel] ?? 0;

    DEBUG && printout("decideOnForward", stringify(byChannel, fixJSON));

    // check if there're enough available slots in both incoming and outgoing channel
    const allowed =
      inboundCount <= ALLOWED_PER_GROUP_MAX &&
      outboundCount <= ALLOWED_PER_GROUP_MAX;

    // snapshots aren't updated real time, so we update counts for tx we allow manually
    if (allowed) {
      // this htlc will be in 2 channels so add to their counters
      if (!byChannel[f.in_channel]) byChannel[f.in_channel] = {};
      if (!byChannel[f.out_channel]) byChannel[f.out_channel] = {};
      byChannel[f.in_channel] = inboundCount + 1;
      byChannel[f.out_channel] = outboundCount + 1;
      pendingForwardCount += 2;
      outgoingCount++;
      incomingCount++;
    }

    const result = allowed ? f.accept() : f.reject();

    announce(f, allowed);

    return result;
  } catch (e) {
    // do something in any case
    return f.reject();
  }
};

// loop that updates all channel unsettled tx counts & more rarely checks fee policy
const updatePendingCounts = async ({ subForwardRequests }) => {
  // stop signal check
  if (settings.stop) return printout("htlcLimiter stop signal detected"); // terminate loop
  // terminat signal check
  if (settings.terminate) {
    subForwardRequests.removeAllListeners();
    return printout("htlcLimiter terminate signal detected"); // terminate loop & stop listening for requests
  }

  // occasionally update fee per channel data
  if (Date.now() - lastPolicyCheck > GC_UPDATE_DELAY) {
    // clean up previous data & log ram use (rarely)
    global?.gc?.();

    // grab aliases for convenient logging
    const peers = (await bos.peers({})) || [];
    peers.forEach((peer) => {
      keyToAlias[peer.public_key] = ca(peer.alias);
    });

    lastPolicyCheck = Date.now();
  }

  // main goal is to see all existing unsettled htlcs in each channel every time this loops
  const res = await bos.callAPI("getChannels");
  // if lnd issue, keep trying until fixed and then reinitialize
  if (!res) {
    printout(`lnd unavailable, retrying in ${LND_CHECK_DELAY} ms`);
    await sleep(LND_CHECK_DELAY);
    subForwardRequests.removeAllListeners();
    initialize(settings.showLogs, settings.fileLogs);
    // stop looping updatePendingCounts
    return null;
  }

  const channels = res?.channels || [];
  pendingOtherCount = 0;
  pendingForwardCount = 0;
  outgoingCount = 0;
  incomingCount = 0;
  for (const channel of channels) {
    idToKey[channel.id] = channel.partner_public_key;
    //byChannel[channel.id] = { raw: copy(channel.pending_payments) };
    for (const f of channel.pending_payments) {
      byChannel[channel.id] = (byChannel[channel.id] || 0) + 1;
      //printout(`${channel.id}: ${byChannel[channel.id]}`)
      if (f.is_forward) pendingForwardCount++;
      else pendingOtherCount++;
      if (f.is_outgoing) outgoingCount++;
      else incomingCount++;
    }
  }

  PRINT_WHEN_HTLCS_RECOUNTED && printout(`${channels.length} channels parsed`);
  if (DEBUG && MAX_RAM_USE_MB) getMemoryUsage();

  await sleep(UPDATE_DELAY);

  // loop
  setImmediate(() => updatePendingCounts({ subForwardRequests }));
};

// get sats routed
const getSats = (f) => f.tokens;
const announce = (f, isAccepted) => {
  printout(
    isAccepted ? "✅" : "❌",
    `${getSats(f)}`.padStart(10),
    " amt, ",
    (keyToAlias[idToKey[f.in_channel]] || f.in_channel)
      .slice(0, 20)
      .padStart(20),
    "->",
    (keyToAlias[idToKey[f.out_channel]] || f.out_channel)
      .slice(0, 20)
      .padEnd(20),
    `all: {is_forward: ${pendingForwardCount}, other: ${pendingOtherCount}, out: ${outgoingCount}, in: ${incomingCount}}`,
    //f.in_channel.padStart(15),
    //stringify({ ...byChannel[f.in_channel], raw: undefined }),
    //"->",
    //f.out_channel.padEnd(15),
    //stringify({ ...byChannel[f.out_channel], raw: undefined }),
    settings.stop ? "(stopped)" : ""
  );
};

const sleep = async (ms) =>
  await new Promise((resolve) => setTimeout(resolve, ms));
const getDate = (timestamp) =>
  (timestamp ? new Date(timestamp) : new Date()).toISOString();
const printout = (...args) => {
  if (settings.showLogs) {
    // print async to terminal when possible
    setImmediate(() => {
      // dimmed text as it's going to spam
      process.stdout.write(
        `\x1b[2m${getDate()} htlcLimiter() ${args.join(" ")}\x1b[0m\n`
      );
    });
  }
  if (settings.fileLogs) {
    // log to file when possible
    setImmediate(() => {
      const PATH = `${LOG_FILE_PATH}/${new Date()
        .toISOString()
        .slice(0, 10)}_htlcLimiter.log`;
      if (!fs.existsSync(LOG_FILE_PATH))
        fs.mkdirSync(LOG_FILE_PATH, { recursive: true });
      fs.appendFileSync(PATH, `${getDate()} htlcLimiter() ${args.join(" ")}\n`);
    });
  }
};

const getMemoryUsage = ({ quiet = false } = {}) => {
  const memUse = process.memoryUsage();
  const heapTotal = +(memUse.heapTotal / 1024 / 1024).toFixed(0);
  const heapUsed = +(memUse.heapUsed / 1024 / 1024).toFixed(0);
  const external = +(memUse.external / 1024 / 1024).toFixed(0);
  const rss = +(memUse.rss / 1024 / 1024).toFixed(0);

  if (!quiet) {
    printout(
      `memory: ${heapTotal} heapTotal & ${heapUsed} MB heapUsed & ${external} MB external & ${rss} MB resident set size.`
    );
  }

  if (MAX_RAM_USE_MB && rss > MAX_RAM_USE_MB) {
    console.log(
      `${getDate()} htlcLimiter heapUsed hit memory limit of ${MAX_RAM_USE_MB} & terminating`
    );
    process.exit(1);
  }
  return { heapTotal, heapUsed, external, rss };
};

const ca = (alias) => alias.replace(/[^\x00-\x7F]/g, "").trim();
const fixJSON = (k, v) => (v === undefined ? null : v);

// export default initialize
initialize(true); // uncomment this to run from terminal
