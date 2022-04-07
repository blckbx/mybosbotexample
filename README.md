# ⚡ BosBot - Don't use as is - Don't trust, verify! ⚡

## **Preconditions:**

BosBot is designed to manage lightning nodes (rebalancing, fee adjustment, connectivity management). In this early state the script has set hardcoded parameters which will be changed in future releases to fit nodes of different shapes and sizes. For now Bosbot assumes that there are enough channels for rebalancing and channel sizes are above 2M satoshis. BosBot collects statistically valuable data to determine convenient parameters for its management routines.
BosBot needs Balance of Satoshi (BoS: https://github.com/alexbosworth/balanceofsatoshis) globally [installed](https://gist.github.com/alexbosworth/8fad3d51f9e1ff67995713edf2d20126#setup-npm).

Tested configuration:
- [LND-0.14.3-beta](https://github.com/lightningnetwork/lnd/releases/tag/v0.14.2-beta)
- [BoS 11.64.x](https://github.com/alexbosworth/balanceofsatoshis#install) 
- [npm 8.5.5](https://gist.github.com/alexbosworth/8fad3d51f9e1ff67995713edf2d20126)
- [NodeJS LTS](https://nodejs.org)


## **✏ Get Started / Usage / Management Switches:**

1) Clone the repo: `git clone https://github.com/blckbx/bosbot.git`
2) Create your own settings file: `cp .env .env.local` (prevents overwriting personal settings on update via `git pull` but mind changes made to `.env)
3) Edit `nano .env.local` to your needs (see below).
4) At the top of the file set which `MANAGEMENT SWITCHES` should be applied.

- `ALLOW_BOS_RECONNECT`: BosBot checks for offline peers and tries to reconnect them within a given time period
- `ALLOW_SIMPLE_RECONNECT`: BosBot checks for inactive peers and disabled channels and tries to reactivate them quickly via disconnecting and reconnecting
- `ADJUST_POLICIES`: BosBot is permitted to adjust outgoing fees and max htlc sizes of your channels (**experimental!**)
- `ADJUST_POLICIES_FEES` : if false this restricts policy management (setting htlc sizes/fees) to htlc size management only
- `ALLOW_REBALANCING`: BosBot rebalances channels which are depleted to local or remote side (750_000 sats off balance with channel size above 2M)
- `ALLOW_DB_CLEANUP`: BosBot backs up historical payments in json files and marks them for deletion in LND's channel database (compaction required to actually free up space) every `DAYS_BETWEEN_DB_CLEANING` days

5) Adjust Important Settings:

- `MIN_PPM_ABSOLUTE`: minimum fees
- `MAX_PPM_ABSOLUTE`: maximum fees
- `SAFETY_MARGIN`: proportional safety ppm margin
- `SAFETY_MARGIN_FLAT_MAX`: maximum flat safety margin (below this limit: proportional)
- `NUDGE_UP`: max size of fee adjustment upward
- `NUDGE_DOWN_PER_DAY`: max size of fee adjustment downward
- `DAYS_FOR_FEE_REDUCTION`: min days of no routing before allowing fee reduction
- `ROUTING_STOPPING_FEE_RATE`: ppm fees for drained channels
- `MAX_PARALLEL_REBALANCES`: max count of parallel rebalances (high usage of resouces!)
- `TELEGRAM_CHATID` & `TELEGRAM_TOKEN`: Add HTTP API Token (set by BotFather) and chat id (lookup `/id` on Telegram). ⚠ **A word of caution: Connecting the node with a Telegram ID may expose your identity (registrered telephone number on Telegram)! It's adviced to use a proxy (e.g. Tor, see `.env` settings) to connect to a Telegram bot.** 
- `TELEGRAM_PROXY_HOST` & `TELEGRAM_PROXY_PORT`: add a (Tor) proxy to communicate with Telegram bot (recommended)
- `DB_PATH`: adjust path to channel.db file
- `MINUTES_BETWEEN_BOS_RECONNECTS`: run `bos reconnect` every x minutes
- `MINUTES_BETWEEN_SIMPLE_RECONNECTS`: run simple reconnect every x minutes

6) Fine Tuning:
- Set rules for channels and rebalances (see settings.json): `aliasMatch`, `min_ppm`, `max_ppm`, `no_local_rebalance`, `no_remote_balance`, `max_htlc_sats`, `AVOID_LIST` (nodes to exclude from rebalancing (also in-path))

7) Start Commands:

- `npm start` : starts [BosBot](#-workflow)
- `npm run limiter` : starts [htlcLimiter](#-htlc-limiter--firewall) (logs to screen and file `limiter.log`)
- `npm run monitor` : starts [monitorPeers](#-monitorpeers) (logs to screen and file `events.log`)
- `npm run visualize` : starts [visualizer](#-visualization)
- `npm run nodesinpaths` : starts [nodesInPaths](#-nodes-in-paths)
- `npm run isitdown <alias/pubkey>` : starts [isItDown](#-isitdown)
- `npm run lookup <alias>` : starts [lookup](#-lookup) of a peer's collected data
- `npm run isitsafetorestart` starts [isItSafeToRestart](#-isitsafetorestart)
- `npm run getcapacityfees`: starts [getCapacityFees](#-getcapacityfees)
- `npm run checkchans`: starts [checkChans](#-checkchans)

## **♾ Workflow:**

1) `runReloadSettings()`
2) `runBotReconnectCheck()`
3) `runUpdateFeesCheck()`
4) `runCleaningCheck()`
5) `runSimpleReconnect()`
6) `runBotRebalanceOrganizer()`
7) `runBot()` // repeat every x minutes (`MINUTES_BETWEEN_STEPS`)


## **🧬 Rebalancing:**

BosBot tries to balance imbalanced channels close to 1:1. Imbalance is detected if a channel's liquidity is `MIN_SATS_OFF_BALANCE` away from perfect balance. Especially depleted channels (liquidity < `MIN_SATS_PER_SIDE` on local or remote side) are treated as rebalance candidates. Rebelance amount is set between `MIN_REBALANCE_SATS` (BoS minimum size) and `MAX_REBALANCE_SATS`, preferably exact off-balance amount. BosBot takes inbound fees (peers' fees) and historic data into account and adds a safety margin before rebalancing (cost effectiveness), so ideally future expected income (future forwards) earns some profit. In addition, BosBot rebalances pairs of local-heavy and remote-heavy channels up to `MAX_PARALLEL_REBALANCES` in parallel.
````
5 rebalance matchups from 11 remote-heavy & 2 local-heavy peers
      sorted with offbalance-weighted randomness of peer =>
  1 - exp(-2 * pow(PI, 2) * pow((peer.outbound_liquidity - 0.5 * peer.capacity) / (peer.capacity - 2 * MIN_SATS_PER_SIDE), 2))
      weighting factors: wL = local-offbalance, wR = remote-offbalance, wT = aged weight, wO = outflow weight
      rebalance ppm's considered: eff = effective, safe = max safe, rush = offbalance emergency

  🕺(me)  (448)   3.4M [ ||||-> ]   0.6M (20)       Channel A --> ⚡ --> Channel B     (300)   1.7M [ ||||-> ]   0.4M (462)   🕺(me) 0.9wL 1.0wR 1.0wT 1.0wO 1.0wE  638eff  509safe  637rush 
  🕺(me)  (248)   9.8M [ ||||-> ]   0.2M (1)        Channel C --> ⚡ --> Channel D      (39)   3.9M [ ||||-> ]   0.1M (899)   🕺(me) 0.9wL 1.0wR 1.0wT 1.0wO 1.0wE  638eff  509safe  637rush 
  🕺(me)  (248)   3.4M [ ||||-> ]   0.6M (1)        Channel E --> ⚡ --> Channel F     (250)   3.7M [ ||||-> ]   2.3M (248)   🕺(me) 0.9wL 1.0wR 1.0wT 1.0wO 1.0wE  638eff  509safe  637rush
  🕺(me)  (149)   1.8M [ ||||-> ]   0.1M (50)       Channel G --> ⚡ --> Channel H      (83)   3.6M [ ||||-> ]   1.4M (248)   🕺(me) 1.0wL 0.8wR 1.0wT 1.0wO 1.0wE  299eff  238safe  298rush 💚
  🕺(me)   (49)   3.4M [ ||||-> ]   0.8M (469)      Channel I --> ⚡ --> Channel J       (1)   1.8M [ ||||-> ]   0.2M (248)   🕺(me) 0.9wL 1.0wR 1.0wT 1.0wO 1.0wE  638eff  509safe  637rush 

Starting     Channel A --> Channel B                 run #1 rebalance @  <409 ppm,    629_165 sats left to balance (via bos rebalance)
Stopping     Channel A --> Channel B                 run #1  <409 ppm rebalance failed (Reason: FailedToFindPathBetweenPeers) (1/5 done after 0.0 minutes)
Starting     Channel C --> Channel D                 run #1 rebalance @  <568 ppm,  1_937_553 sats left to balance (via bos rebalance)
Starting     Channel E --> Channel F                 run #1 rebalance @  <272 ppm,    739_981 sats left to balance (via bos rebalance)
Starting     Channel G --> Channel H                 run #1 rebalance @  <222 ppm,    850_685 sats left to balance (via bos rebalance)
Starting     Channel I --> Channel J                 run #1 rebalance @  <254 ppm,    791_230 sats left to balance (via bos rebalance)

    All 5 parallel rebalances launched!

Stopping    Channel C --> Channel D                  run #1  <222 ppm rebalance failed (Reason: needed  341 ppm) (2/5 done after 0.5 minutes)
Stopping    Channel E --> Channel F                  run #1  <568 ppm rebalance failed (Reason: FailedToFindPathBetweenPeers) (3/5 done after 1.2 minutes)
Stopping    Channel G --> Channel H                  run #1  <272 ppm rebalance failed (Reason: needed  608 ppm) (4/5 done after 1.2 minutes)
Stopping    Channel I --> Channel J                  run #1  <254 ppm rebalance failed (Reason: needed 2077 ppm) (5/5 done after 2.0 minutes)
ALL TASKS COMPLETED:
  0 rebalancing runs done for Channel A --> Channel B 
  0 rebalancing runs done for Channel C --> Channel D 
  0 rebalancing runs done for Channel E --> Channel F 
  0 rebalancing runs done for Channel G --> Channel H 
  0 rebalancing runs done for Channel I --> Channel J 
````
Once rebalancing was successful for the first time, BosBot fires this route again via `bos send` (if allowed) until balance is reached. Sending less amount due to risk of stuck htlcs. The more discount we achieve, the more emojis (up to 5) will be displayed ;)

````
Updating     Channel A --> Channel B    run #1  <223 ppm rebalance succeeded for 195_314 sats @ 108 ppm 🍀🍀 & moving onto run #2
Starting     Channel A --> Channel B    run #2 rebalance @  <223 ppm,    342_813 sats left to balance (via bos send)
Updating     Channel A --> Channel B    run #2  <223 ppm rebalance succeeded for 91_250 sats @ 109 ppm 🍀🍀 & moving onto run #3
Starting     Channel A --> Channel B    run #3 rebalance @  <223 ppm,    251_563 sats left to balance (via bos send)
Updating     Channel A --> Channel B    run #3  <223 ppm rebalance succeeded for 93_004 sats @ 107 ppm 🍀🍀 & moving onto run #4
Starting     Channel A --> Channel B    run #4 rebalance @  <223 ppm,    158_559 sats left to balance (via bos send)
Updating     Channel A --> Channel B    run #4  <223 ppm rebalance succeeded for 99_097 sats @ 111 ppm 🍀🍀 & moving onto run #5
Starting     Channel A --> Channel B    run #5 rebalance @  <223 ppm,     59_462 sats left to balance (via bos send)
Completed    Channel A --> Channel B    at #5  <223 ppm rebalance succeeded for 59_067 sats @ 118 ppm 🍀 & done! 🏆 (3/5 done after 0.8 minutes)
````


## **🛠 Fee Adjustment / 🚧 Max HTLC Sizes per Channel:**

**Experimental Feature! Use with caution!** 

BosBot is applying channel fees based on activity per hours/days or manually if defined in `settings.json`. Fees are adjusted faster upwards than downwards. Best practice: For a new channel set fees initially high and let it drop (automatically with BosBot) until forwards happen. Initial fees have to be set by LND favourably (lnd.conf, bitcoin section). Edge cases can be set in `settings.json`, e.g. no rebalancing to remote side for draining-only channels (like LN exchanges). Furthermore BosBot is setting max htlc sizes for each channel to reduce channel failures on forwards. To obfuscate a channel's balance, max htlc size is calculated to nearest limit of 2^X. 


````
Fee Adjustment
Channel A    9999    same   ppm   (799.000)         no flow    7+ days    0.1M|1.9M    max htlc:      65_536   💤-VRH ⛔-BLOCK 9999ppm
Channel B     700    same   ppm   (700.000)         no flow    7+ days    1.0M|1.0M    max htlc:     524_288   💤-VRH
Channel C     275 -> 274    ppm   (274.000)         no flow    7+ days    1.0M|1.0M    max htlc:   1_048_576  ↘ 
Channel D     222    same   ppm   (222.000)       inflowing   0.1 days    1.0M|2.0M    max htlc:   1_048_576     66_666 sats/day 
Channel E     513 -> 532    ppm   (532.000)      outflowing   1.1 days    4.0M|5.0M    max htlc:   4_194_304  ↗
Channel F     400    same   ppm   (400.000)      outflowing   0.5 days    2.5M|2.5M    max htlc:   2_097_152


Max HTLC Size Adjustment
Channel A     max htlc:     262_144
Channel B     max htlc:     524_288
Channel C     max htlc:   1_048_576
Channel D     max htlc:   2_097_152
Channel E     max htlc:   4_194_304
Channel F     max htlc:   8_388_608
````


## **🛡 HTLC Limiter / Firewall:**

A module to watch and limit numbers of pending htlcs per channel based on fee policies. In parallel BosBot watches for forwarding requests, calculates the htlc's fee and adds the forward to its fee range (currently 2^X). If the number of pending htlcs within a given fee range exceeds the limit, the forward is rejected. For now there are more htlcs allowed for outgoing than incoming direction. Also it acts as a rate limiter for htlcs. Run `npm run limiter` to start (separate terminal window recommended).
````
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   666666x1111x1 {"1":1,"2":1} -> 777777x2222x1   {"2":1} 
htlcLimiter() ✅       3353  amt,      1.231  fee     ~2^0 Channel A -> Channel C       all: {is_forward: 6, other: 3, out: 6, in: 3}   666666x1111x1 {"0":1,"1":1,"2":1} -> 694035x2032x1   {"0":1,"1":1} 
htlcLimiter() ✅       1649  amt,      1.061  fee     ~2^0 Channel A -> Channel D       all: {is_forward: 2, other: 4, out: 4, in: 2}   666666x1111x1 {"0":2} -> 777777x2222x1   {"0":1} 
htlcLimiter() ❌       1652  amt,      1.062  fee     ~2^0 Channel A -> Channel D       all: {is_forward: 2, other: 4, out: 4, in: 2}   666666x1111x1 {"0":2} -> 777777x2222x1   {"0":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel D       all: {is_forward: 4, other: 4, out: 5, in: 3}   666666x1111x1 {"0":2,"2":1} -> 777777x2222x1   {"2":1} 
htlcLimiter() ✅       1652  amt,      1.196  fee     ~2^0 Channel A -> Channel F       all: {is_forward: 4, other: 4, out: 5, in: 3}   666666x1111x1 {"0":2,"2":1} -> 777777x2222x1   {"0":1} 
htlcLimiter() ✅       1652  amt,      1.196  fee     ~2^0 Channel A -> Channel F       all: {is_forward: 2, other: 3, out: 4, in: 1}   666666x1111x1 {"0":1} -> 777777x2222x1   {"0":1} 
htlcLimiter() ✅       8348  amt,      2.470  fee     ~2^1 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   666666x1111x1 {"0":1,"1":1} -> 777777x2222x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel C       all: {is_forward: 6, other: 3, out: 6, in: 3}   666666x1111x1 {"0":1,"1":1,"2":1} -> 777777x2222x1   {"2":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel C       all: {is_forward: 2, other: 3, out: 4, in: 1}   666666x1111x1 {"2":1} -> 777777x2222x1   {"2":1} 
htlcLimiter() ✅       8343  amt,      2.469  fee     ~2^1 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   666666x1111x1 {"1":1,"2":1} -> 777777x2222x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel D       all: {is_forward: 4, other: 5, out: 7, in: 2}   666666x1111x1 {"1":1,"2":1} -> 777777x2222x1   {"2":1} 
htlcLimiter() ✅       5022  amt,      1.645  fee     ~2^0 Channel A -> Channel B       all: {is_forward: 6, other: 5, out: 8, in: 3}   666666x1111x1 {"0":1,"1":1,"2":1} -> 777777x2222x1   {"0":1,"1":1} 
htlcLimiter() ❌       8261  amt,      1.622  fee     ~2^0 Channel A -> Channel E       all: {is_forward: 0, other: 5, out: 5, in: 0}   666666x1111x1 {} -> 777777x2222x1   {"0":3} 
htlcLimiter() ✅       8261  amt,      2.448  fee     ~2^1 Channel A -> Channel C       all: {is_forward: 2, other: 5, out: 6, in: 1}   666666x1111x1 {"1":1} -> 777777x2222x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel B       all: {is_forward: 2, other: 5, out: 6, in: 1}   666666x1111x1 {"2":1} -> 777777x2222x1   {"2":1} 
````


## **🗄 Backup Payments:**

To clean and speed up LND, backing up and removing payments (`lncli deletepayments`) from `channel.db` to external files (json) is a way to do so. Backup files are saved into `\logs\` directory and read on startup.

Cleaning DB:
````
runCleaning()
555 payments backed up
all payments deleted from database
````

Reading Payment History Files:
````
generatePeersSnapshots()
555 payment records found in db
1111111111111_paymentHistory.json - is Recent? false
2222222222222_paymentHistory.json - is Recent? false
3333333333333_paymentHistory.json - is Recent? false
4444444444444_paymentHistory.json - is Recent? true
100 payment records used from log file
````


## **🔌 BoS Reconnect / Simple Reconnect:**

Checks frequently (`MINUTES_BETWEEN_BOS_RECONNECTS` / `MINUTES_BETWEEN_SIMPLE_RECONNECTS`) for offline / inactive peers and tries to reconnect them with `bos reconnect` (6h+ interval recommended) or `simple reconnect` for quick check and reconnect of inactive peers and/or in-disabled (🚫) channels. Additionally a Telegram message containing stats of successful and/or unsuccessful reconnects is being sent:
````
🔌 Offline Statistics (BoS Reconnect):
3 / 10 peers offline (30%):
- Node1 : 45% 🚫 | 0.5d offline
- Node2 : 75% 🚫 | 0.0d offline
- Node3 : 30% 🚫 | 1.5d offline
2 / 10 (20%) in-disabled (20%):
- Node4
- Node5
1 peers reconnected: 
- Node1
(BoS reconnects every x minutes).
````

````
🔌 Simple Reconnect Statistics:
2 / 10 peers offline (20%):
- Node1 : 45% 🚫 | 0.5d offline
- Node2 : 75% 🚫 | 0.0d offline
0 / 10 in-disabled (0%):
- n/a
0 peers reconnected:
- n/a
(Simple Reconnect every x minutes).
````


## **🌱 Statistics for 7 days:**

On every run BosBot messages some statistics about earned, spent and net sats for the last 7 days. Routing rewards are displayed in min, 1/4th, median, average, 3/4th and max amounts as well as the overall count of routings in this time frame. In addition, current channel.db size and an estimation of channel states is shown if configured:
````
🌱 7d Statistics:
earned: 2000
spent: 1000
net: 1000
routing rewards: (n: 100) min: 1, 1/4th: 2.5, median: 5.5, avg: 20.5, 3/4th: 21, max: 210.0
channel.db size: x_xxx MB
channel states size est: x_xxx MB
````


## **/ 🔧 TOOLS /**

### **📜 Summary:**
Gathers useful data based on your node's statistics (balances, fees, weekly stats for profits and forwards)
````
  NODE SUMMARY:

    total peers:                      x

    off-chain local available:        x sats
    off-chain remote available:       x sats
    off-chain total:                  x sats
    off-chain unsettled:              x sats (n: x)
    off-chain pending                 x sats

    on-chain closing:                 x sats
    on-chain total:                   x sats
  -------------------------------------------------------------
    my base fee stats:                (n: x) min: x, 1/4th: x, median: x, avg: x, 3/4th: x, max: x msats
    my proportional fee stats:        (n: x) min: x, 1/4th: x, median: x, avg: x, 3/4th: x, max: x ppm
    my channel capacity stats:        (n: x) min: x, 1/4th: x, median: x, avg: x, 3/4th: x, max: x sats
    lifetime all peers sent:          x sats
    lifetime all peers received:      x sats
    lifetime capacity used:           x %
  -------------------------------------------------------------
    (Per last 7 days)

    total earned:                     x sats
    total on-chain fees:              x sats
    total ln fees paid:               x sats

    NET PROFIT:                       x sats

    LN received from others:          x sats (n: x)
    LN payments to others:            x sats, fees: x sats (n: x)
    LN total rebalanced:              x sats, fees: x (n: x)
    LN total forwarded:               x sats (n: x)

    forwards stats by size:

    0 - 100 sats                      x sats routed              (n: x)
                                      x sats earned              (x ppm)

    100 - 10k sats                    x sats routed              (n: x)
                                      x sats earned              (x ppm)

    10k - 1M sats                     x sats routed              (n: x)
                                      x sats earned              (x ppm)

    1M - 100M sats                    x sats routed              (n: x)
                                      x sats earned              (x ppm)

    peers used for routing-out:       x / x
    peers used for routing-in:        x / x
    earned per peer stats:            (n: x) min: x, 1/4th: x, median: x, avg: x, 3/4th: x, max: x sats

    % routed/local                    x %
    % net-profit/earned               x %    
    avg earned/routed:                x ppm
    avg net-profit/routed:            x ppm
    avg earned/local:                 x ppm
    avg net-profit/local:             x ppm
    est. annual ROI:                  x %
    est. annual profit:               x sats
  -------------------------------------------------------------
    total unbalanced local:           x sats
    total unbalanced remote:          x sats
    total unbalanced:                 x sats
    total unbalanced sats percent:    x %
    net unbalanced:                   x sats
````


### **🏆 Scoring / Data Base:**
Bosbot collects historical data (channel stats, fee stats, peer stats) per peer that is used for future fee and rebalancing settings. Data is presented in various ways (node summary, fee changes, flow summary). Flow summary lists all peers sorted by score (routed out + routed in sats). Also routings (sats/day and direction), rebalancings (sats/day, direction and used ppm) and lifetime usage are presented. Additionally it states if a node is being used in a 2-WAY-REBALANCE or if IN-direction is disabled.
````
#3  score: 11_111_111 pubkey: xxx
         me   299ppm [--2.0M--|--2.0M--] 11ppm   xxx (./peers/x.json)  0.4b F_net--> 🚨 2-WAY-REBALANCE
    165_747 sats/day <---- routing ----> 5_613_325 sats/day      +1_682 sats/day     (505|300)         #18|#65   
  5_452_034 sats/day <-- rebalancing --> 231_598 sats/day        -108 sats/day       (110|467)        #370|#4    
    624_426 sats/day <- avg. lifetime -> 658_320 sats/day        22.2x capacity used over ~87 days
            4.3 days <-- last routed --> 0.0 days ago  last ∆ppm: 482.000 -> 482.000 ppm @ 47.2 days ago
      rebalances-in (<--) used (ppm): (n: 103) min: 29, 1/4th: 132, median: 173, avg: 188, 3/4th: 269, max: 372
      rebalances-in (<--) est. (ppm): (n: 302) min: 29, 1/4th: 266, median: 643, avg: 482, 3/4th: 699, max: 708
````


### **📈 Visualization:**

Starts up a webservice hosted at http://localhost:7890 or http://(your-local-address/ip):7890 to query some node data. xAxis, yAxis, and rAxis can be set to days, ppm, routed, earned, count (for grouped). Can combine items into xGroups number of groups along x axis. ppm, routed, earned will be plotted in log scale, days in linear. Some example query strings:
- http://localhost:7890/?daysForStats=7&xGroups=0&xAxis=ppm&yAxis=earned&rAxis=routed&any=bfx&out=&from=&roundDown=&type=bubble
- ?daysForStats=7&xGroups=0&xAxis=ppm&yAxis=earned&rAxis=&out=&from=&roundDown=1&type=bubble
- ?daysForStats=14&xAxis=ppm&yAxis=earned
- ?daysForStats=14&xAxis=ppm&yAxis=earned&xGroups=10
- ?daysForStats=14&xAxis=ppm&yAxis=earned&out=aci
- ?daysForStats=14&xAxis=ppm&yAxis=earned&from=acinq
- ?daysForStats=14&xAxis=days&yAxis=earned
- ?daysForStats=14&xAxis=days&yAxis=earned&xGroups=10
- ?daysForStats=90&xAxis=days&yAxis=earned&xGroups=10&type=line
- ?daysForStats=30&xAxis=ppm&yAxis=earned&rAxis=count&xGroups=15
- ?daysForStats=7&xAxis=ppm&yAxis=earned&rAxis=routed
- ?daysForStats=7&xAxis=days&yAxis=earned&rAxis=count&xGroups=20
- ?daysForStats=30&yAxis=count&xAxis=routed&xGroups=21&type=line

![image](https://github.com/blckbx/mybosbotexample/blob/main/examples/visualize.png)
Example: For all forwards show earned fees and ppm rates
  
 
### **💎 Nodes in Paths:** ###

Shows most used nodes in past rebalances. Switches `DAYS_FOR_STATS` (how many days to look back) and `SHOW_PEERS` (show already connected peers) are adjustable. For this script to run some data is needed (run index.js at least once, turn off any management switches).


### **🔍 Lookup:** ###

Displays data of a specific alias/peer.


### **🔴 IsItDown:** ###

Query any node's number and percentage of disabled channels towards them to get an overview if it is possibly down or if there are connectivity problems.

````
$ node isitdown alias
~X % of Y channels disabled towards alias
````


### **✅ checkChans:** ###

Checks your channels for inactive and IN/OUT-disabled channels to get a quick overview if strange things are going on.

````
$ node checkChans
                  alias public_key                                     local remote    iRD isSmall lastReconnected isOffline isInActive inDisabledPeers outDisabledToPeers
                  Node1 yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy    1.0M | 2.0M       -      -               -  offline  inactive         -   out-off 
                  Node2 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    1.0M | 1.0M       -  small   0.3h last rec        -         -         -   out-off 

    total peers:              10
    offline peers:            1
    not-active channels:      1
    not-active and online:    0
    peers disabling to me:    0
    me disabling to peers:    2
    disabled both ways:       0

````


### **♻ IsItSafeToRestart:** ###

Checks for pending HTLCs and returns an estimation if a restart could be potentially risky due to HTLC expiration.

````
$ node isitsafetorestart
current height is xxxxxx
there are x pending forwards
of which x are with offline peers
x are < 6 blocks away from timing out (~60 minutes)
````


### **🧾 getCapacityFees:** ###

Capacity-weighted median fee rates towards a node (incoming fee distribution) for your node and your peers. 

````
$ node getCapacityFees 
                            me  25%:x      50%:x     75%:x     88%:x     (n:x)

                       Peer 1  25%:100     50%:125     75%:150    88%:200     (n:x)
                       Peer 2  25%:1       50%:30      75%:60     88%:100     (n:x)
                       ...
````

### **📺 monitorPeers:** ###

Logs your and your peers' activity and forwards: graph policy updates of connected channels (base_fee_mtokens, cltv_delta, fee_rate, is_disabled, max_htlc_mtokens, min_htlc_mtokens, updated_at), peers disconnects/connects, forwardings (success/failures with reason, if provided). Start the listener in a separate terminal window (recommended).

New features: Block private channel opening requests on-the-fly. Running `monitorPeers` set `ALLOW_PRIVATE_CHANNELS` to `false` will intercept channel opening requests from peers and reject channels which contain the `private` flag. Message any event to TG bot specified in BosBot settings. Comment out `telegramLog` commands if you get spammed a lot.

````
⛔ disconnected from <alias> <pubkey>

💚 connected to <alias> <pubkey> @ <address:port>

🚨 forwarding failure: <alias1> -> <alias2> of 100000.000 sats for 100.000 sats fee
    external failure: TEMPORARY_CHANNEL_FAILURE
    internal failure: INSUFFICIENT_BALANCE
   
🚨 forwarding failure: <alias1> -> <alias2> of 100000.000 sats for 100.000 sats fee
    external failure: TEMPORARY_CHANNEL_FAILURE
    internal failure: FEE_INSUFFICIENT
   
🚨 forwarding failure: <alias1> -> <alias2> of 100000.000 sats for 100.000 sats fee
    external failure: UNKNOWN_NEXT_PEER
 
🚨 forwarding failure: <alias> -> n/a of n/a for n/a
    external failure: TEMPORARY_CHANNEL_FAILURE
    internal failure: HTLC_ADD_FAILED

⚡ forwarding success: <alias1> -> <alias2> of x sats for x fee

🔗 block height: xxxxxx | id: 00000000000000000001111111111111111111111111111111111111

🌱 channel opening accepted:
    alias: xxx
    remote_pubkey: xxx
    channel_id: yyyyxyyyyxy
    capacity: xxx sats
    
🚫 [private] channel rejected:
    alias: xxx
    remote_pubkey: xxx
    channel_id: yyyyxyyyyxy
    capacity: xxx sats
    
🌱 channel opened: 
    remote_pubkey: xxx
    channel_id: yyyyyxyyyyxy
    capacity: xxx sats 
    funding_tx: 11111111111111111111111111111111111111:1
    is_private: no
    initiator: local | remote
    
🥀 channel coop-closed:
    alias: xxx
    remote_pubkey: xxx
    channel_id: yyyyyxyyyyxy
    coop_initiator: local | remote
    capacity: xxx sats
    local: xxx sats | xxx sats :remote
    funding_tx: 11111111111111111111111111111111111111:1
    is_private: no

🥀 channel force-closed:
    alias: xxx
    remote_pubkey: xxx
    channel_id: yyyyyxyyyyxy
    force_close_initiator: local | remote
    capacity: xxx sats
    local: xxx sats | xxx sats :remote
    funding_tx: 11111111111111111111111111111111111111:1
    is_private: no
    
📣 local update for peer <alias> <pubkey> 
    base_fee_mtokens: x -> y
    fee_rate: x -> y
    is_disabled: x -> y
    max_htlc_mtokens: x -> y
    updated_at: <time1> -> <time2>

📣 remote update for peer <alias> <pubkey>
    base_fee_mtokens: x -> y
    fee_rate: x -> y
    is_disabled: x -> y
    max_htlc_mtokens: x -> y
    updated_at: <time1> -> <time2>

📩 message received from <alias>
<peer message>
````

___________________________________________________________
## original description by legalizemath

just meant as an example of how wrapping of bos (balanceofsatoshis) can be done in node

this does everything through bos by wrapping the js functions bos uses to act on terminal commands, bos wasn't made for calling these functions directly from other projects (yet) so compatibility can easily change and should be just used as an example

this is not ready for anyone to use and was just for experimentation I was doing, there's probably errors all over this thing, it's nowhere close to a working project

`bos.js` is where I place bos function wrappers and then call them from messy experiments I'm testing out in some script file `_____.js` like `visualize.js`

DO NOT USE AS IS

DO NOT USE AS IS

DO NOT USE AS IS

assumes bos is installed globally and "bos" commands work from anywhere so then just have to run

I used these installation guides so I can run bos commands like `bos utxos` from terminal, using nodejs v14 like in instructions

* https://gist.github.com/alexbosworth/8fad3d51f9e1ff67995713edf2d20126
* https://github.com/alexbosworth/balanceofsatoshis#install
* https://github.com/alexbosworth/balanceofsatoshis#saved-nodes

Then I created package.json with `{ "type": "module" }` for imports to work, then I place wrapper `bos.js` and script like `somescript.js` file into same folder

and I run somescript.js via

```bash
npm link balanceofsatoshis && node somescript
```

npm link will link global installation that already exists to the project so it's possible to use it w/o installing new one in node_modules & setting up auth again

there's 0 package dependencies except for linking balanceofsatoshis that is already installed and using nodejs that you already need to use balanceofsatoshis

I stop it with ctrl+c

#Bitcoin, not 💩coin

