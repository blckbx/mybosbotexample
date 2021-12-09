# ⚡ BosBot - Don't use as is - Don't trust, verify! ⚡

## **Prerequisites:**

Bosbot is designed to manage lightning nodes (rebalancing, fee adjustment, connectivity management). In this early state the script has set hardcoded parameters which will be changed in future releases to fit nodes in different shapes and sizes. For now Bosbot assumes that there are enough channels for rebalancing and channel sizes are above 2M satoshis. Bosbot collects statistically valuable data to determine convenient parameters for its management routines.
Bosbot needs Balance of Satoshi (BoS: https://github.com/alexbosworth/balanceofsatoshis) globally installed.

Tested configuration:
- [LND-0.14.1-beta](https://github.com/lightningnetwork/lnd/releases/tag/v0.14.1-beta)
- [BoS 11.12.0](https://github.com/alexbosworth/balanceofsatoshis#install) 
- [npm 8.1.3](https://gist.github.com/alexbosworth/8fad3d51f9e1ff67995713edf2d20126)

## **🧬 Rebalancing:**

BosBot tries to balance imbalanced channels close to 1:1. Imbalance is detected if a channel's liquidity is `MIN_SATS_OFF_BALANCE` away from perfect balance. Especially depleted channels (liquidity < `MIN_SATS_PER_SIDE` on local or remote side) are treated as rebalance candidates. Rebelance amount is set between `MIN_REBALANCE_SATS` (BoS minimum size) and `MAX_REBALANCE_SATS`, preferably exact off-balance amount. BosBot takes inbound fees (peers' fees) and historic data into account and adds a safety margin before rebalancing (cost effectiveness), so ideally future expected income (future forwards) earns some profit. In addition, BosBot rebalances pairs of local-heavy and remote-heavy channels up to `MAX_PARALLEL_REBALANCES` in parallel.
````
  🕺(me)  (448)   3.4M [ ||||-> ]   0.6M (20)       Channel A --> ⚡ --> Channel B     (300)   1.7M [ ||||-> ]   0.4M (462)   🕺(me) 1.00w 
  🕺(me)  (248)   9.8M [ ||||-> ]   0.2M (1)        Channel C --> ⚡ --> Channel D      (39)   3.9M [ ||||-> ]   0.1M (899)   🕺(me) 1.00w 
  🕺(me)  (248)   3.4M [ ||||-> ]   0.6M (1)        Channel E --> ⚡ --> Channel F     (250)   3.7M [ ||||-> ]   2.3M (248)   🕺(me) 1.00w 
  🕺(me)  (149)   1.8M [ ||||-> ]   0.1M (50)       Channel G --> ⚡ --> Channel H      (83)   3.6M [ ||||-> ]   1.4M (248)   🕺(me) 1.00w 💚
  🕺(me)   (49)   3.4M [ ||||-> ]   0.8M (469)      Channel I --> ⚡ --> Channel J       (1)   1.8M [ ||||-> ]   0.2M (248)   🕺(me) 1.00w 

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
Once rebalancing was successful for the first time, Bosbot fires this route again via `bos send` (if allowed) until balance is reached. Sending less amount due to risk of stuck htlcs. The more discount we achieve, the more emojis (up to 5) will be displayed ;)

````
Updating   Channel A --> Channel B   run #1  <555 ppm rebalance succeeded for 197_737 sats @ 100 ppm 🍀🍀🍀🍀🍀 & moving onto run #2
Starting   Channel A --> Channel B   run #2 rebalance @  <555 ppm,    781_402 sats left to balance (via bos send)
Updating   Channel A --> Channel B   run #2  <555 ppm rebalance succeeded for 96_511 sats @ 200 ppm 🍀🍀🍀🍀 & moving onto run #3
Starting   Channel A --> Channel B   run #3 rebalance @  <555 ppm,    684_891 sats left to balance (via bos send)
Updating   Channel A --> Channel B   run #3  <555 ppm rebalance succeeded for 92_135 sats @ 300 ppm 🍀🍀🍀 & moving onto run #4
Starting   Channel A --> Channel B   run #4 rebalance @  <555 ppm,    592_756 sats left to balance (via bos send)
Updating   Channel A --> Channel B   run #4  <555 ppm rebalance succeeded for 99_892 sats @ 400 ppm 🍀🍀 & moving onto run #5
Starting   Channel A --> Channel B   run #5 rebalance @  <555 ppm,    492_864 sats left to balance (via bos send)
Updating   Channel A --> Channel B   run #5  <555 ppm rebalance succeeded for 91_228 sats @ 500 ppm 🍀 & moving onto run #6
Starting   Channel A --> Channel B   run #6 rebalance @  <555 ppm,    401_636 sats left to balance (via bos send)
Updating   Channel A --> Channel B   run #6  <555 ppm rebalance succeeded for 94_035 sats @ 540 ppm 🍀 & moving onto run #7
Starting   Channel A --> Channel B   run #7 rebalance @  <555 ppm,    307_601 sats left to balance (via bos send)
Completed  Channel A --> Channel B   at #7  <555 ppm rebalance succeeded for 90_611 sats @ 540 ppm 🍀 & reached max number of repeats. (5/5 done after 10.0 minutes)
````


## **📊 Fee Adjustment / 🚧 Max HTLC Sizes per Channel:**

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

## **🧱 HTLC Limiter / Firewall:**

A module to watch and limit numbers of pending htlcs per channel based on fee policies. In parallel BosBot watches for forwarding requests, calculates the htlc's fee and adds the forward to its fee range (currently 2^X). If the number of pending htlcs within a given fee range exceeds the limit, the forward is rejected. For now there are more htlcs allowed for outgoing than incoming direction. Also it acts as a rate limiter for htlcs. 
````
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   699469x1484x1 {"1":1,"2":1} -> 699743x2177x1   {"2":1} 
htlcLimiter() ✅       3353  amt,      1.231  fee     ~2^0 Channel A -> Channel C       all: {is_forward: 6, other: 3, out: 6, in: 3}   699469x1484x1 {"0":1,"1":1,"2":1} -> 694035x2032x1   {"0":1,"1":1} 
htlcLimiter() ✅       1649  amt,      1.061  fee     ~2^0 Channel A -> Channel D       all: {is_forward: 2, other: 4, out: 4, in: 2}   699469x1484x1 {"0":2} -> 695396x2072x1   {"0":1} 
htlcLimiter() ❌       1652  amt,      1.062  fee     ~2^0 Channel A -> Channel D       all: {is_forward: 2, other: 4, out: 4, in: 2}   699469x1484x1 {"0":2} -> 695396x2072x1   {"0":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel D       all: {is_forward: 4, other: 4, out: 5, in: 3}   699469x1484x1 {"0":2,"2":1} -> 699743x2177x1   {"2":1} 
htlcLimiter() ✅       1652  amt,      1.196  fee     ~2^0 Channel A -> Channel F       all: {is_forward: 4, other: 4, out: 5, in: 3}   699469x1484x1 {"0":2,"2":1} -> 703229x1986x1   {"0":1} 
htlcLimiter() ✅       1652  amt,      1.196  fee     ~2^0 Channel A -> Channel F       all: {is_forward: 2, other: 3, out: 4, in: 1}   699469x1484x1 {"0":1} -> 703229x1986x1   {"0":1} 
htlcLimiter() ✅       8348  amt,      2.470  fee     ~2^1 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   699469x1484x1 {"0":1,"1":1} -> 694035x2032x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel C       all: {is_forward: 6, other: 3, out: 6, in: 3}   699469x1484x1 {"0":1,"1":1,"2":1} -> 699743x2177x1   {"2":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel C       all: {is_forward: 2, other: 3, out: 4, in: 1}   699469x1484x1 {"2":1} -> 699743x2177x1   {"2":1} 
htlcLimiter() ✅       8343  amt,      2.469  fee     ~2^1 Channel A -> Channel B       all: {is_forward: 4, other: 3, out: 5, in: 2}   699469x1484x1 {"1":1,"2":1} -> 694035x2032x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel D       all: {is_forward: 4, other: 5, out: 7, in: 2}   699469x1484x1 {"1":1,"2":1} -> 699743x2177x1   {"2":1} 
htlcLimiter() ✅       5022  amt,      1.645  fee     ~2^0 Channel A -> Channel B       all: {is_forward: 6, other: 5, out: 8, in: 3}   699469x1484x1 {"0":1,"1":1,"2":1} -> 694035x2032x1   {"0":1,"1":1} 
htlcLimiter() ❌       8261  amt,      1.622  fee     ~2^0 Channel A -> Channel E       all: {is_forward: 0, other: 5, out: 5, in: 0}   699469x1484x1 {} -> 709164x1324x1   {"0":3} 
htlcLimiter() ✅       8261  amt,      2.448  fee     ~2^1 Channel A -> Channel C       all: {is_forward: 2, other: 5, out: 6, in: 1}   699469x1484x1 {"1":1} -> 694035x2032x1   {"1":1} 
htlcLimiter() ✅       8123  amt,      5.736  fee     ~2^2 Channel A -> Channel B       all: {is_forward: 2, other: 5, out: 6, in: 1}   699469x1484x1 {"2":1} -> 699743x2177x1   {"2":1} 
````

## **🗄 Backup Payments:**

To clean and speed up LND, backing up and removing payments from `channel.db` to external files (json) is a way to do so. Backup files are saved into `\logs\` directory and read on startup.

Cleaning DB:
````
runCleaning()
555 payments backed up
all payments deleted from database
````

Reading Files:
````
generateSnapshots()
0 payment records found in db
1111111111111_paymentHistory.json - is Recent? false
2222222222222_paymentHistory.json - is Recent? false
3333333333333_paymentHistory.json - is Recent? false
4444444444444_paymentHistory.json - is Recent? true
````

## **🔌 BoS Reconnect:**

Checks frequently (`MINUTES_BETWEEN_RECONNECTS`) for offline / inactive peers and tries to reconnect them with `bos reconnect`. Additionally a Telegram message with stats of successful and/or unsuccessful reconnects is being sent:
````
🔌 Offline Statistics:
 3 / x peers offline (y%):
- Node 1
- Node 2
- Node 3
Reconnected: 
- Node 1
(BoS reconnects every x minutes).
````

## **🌱 Statistics for 7 days:**

On every run BosBot messages some statistics about earned, spent and net sats for the last 7 days. Routing rewards are displayed in min, 1/4th, median, average, 3/4th and max amounts as well as the overall count of routings:
````
🌱 Statistics for 7 days:
earned: 2000
spent: 1000
net: 1000
routing rewards: (n: 100) min: 1, 1/4th: 2.5, median: 5.5, avg: 20.5, 3/4th: 21, max: 210.0
````

## **Usage:**

Edit `index.js` to your needs. At the top of the script set which `MANAGEMENT SWITCHES` should apply.

`ALLOW_BOS_RECONNECT`: bosbot checks for offline peers and tries to reconnect them within a given time period

`ADJUST_POLICIES`: bosbot is permitted to adjust outgoing fees and max htlc sizes of your channels

`ADJUST_POLICIES_FEES` : if false this restricts policy management (setting htlc sizes/fees) to htlc size management only

`ALLOW_REBALANCING`: bosbot rebalances channels which are depleted to local or remote side (500_000 sats off balance with channel size above 2M)

`ALLOW_NODE_RESET`: experimental feature trying to reset services if too many peers seem to be offline (reset Tor or restart node)

`ALLOW_DB_CLEANUP`: enables or disables backup payments in jsons and remove from channel database for speed every `DAYS_BETWEEN_DB_CLEANING` days


## **Start Commands:**

`npm start` : starts bosbot

`npm run start-limiter` : starts htlcLimiter from `\tools\` directory (in a separate process)


## **Adjust Settings:**

`MIN_PPM_ABSOLUTE`: minimum fees

`MAX_PPM_ABSOLUTE`: maximum fees

`ROUTING_STOPPING_FEE_RATE`: stop fees for drained channels


## **Workflow:**

1) `runBotReconnectCheck()`
2) `runUpdateFeesCheck()`
3) `runBotRebalanceOrganizer()`
4) `runCleaningCheck()`
5) `runBot()` // repeat every x minutes (`MINUTES_BETWEEN_STEPS`)


## **Fine Tuning:**

1) Setup Telegram Bot: Edit `settings.json` to your needs. Add HTTP API Token (set by BotFather) and chat id (lookup `/id` on Telegram).
2) Set rules for channels (see settings.json.example): `aliasMatch`, `min_ppm`, `max_ppm`, `no_local_rebalance`, `no_remote_balance`, `max_htlc_sats`, `AVOID_LIST` (nodes to exclude from rebalancing (even in-path))



## **/ TOOLS /**

**Summary:**

Run `node lndsummary` to gather useful data based on your node's statistics (balances, fees, weekly stats for profits and forwards)
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

**Visualization:**

Run `node visualize` to start up a webservice hosted at http://localhost:7890 or http://(your-local-address/ip):7890 

![image](https://github.com/blckbx/mybosbotexample/blob/main/examples/visualize.png)
Example: For all forwards show earned fees and ppm rates
  
**Nodes in Path:**

Running `node nodes_in_path` shows most used nodes in past rebalances. Switches `DAYS_FOR_STATS` (how many days to look back) and `SHOW_PEERS` (show already connected peers) are adjustable. For this script to run some data is needed (run index.js at least once, turn off any management switches).

**Lookup:**

Running `node lookup <alias>` displays data of a specific alias/peer.

**IsItDown:**

Query a node's number of disabled channels to get an overview if a certain node is possibly down or if there are connectivity problems. `node isitdown <alias>`

````
$ node isitdown.js alias
~X % of Y channels disabled towards alias
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

