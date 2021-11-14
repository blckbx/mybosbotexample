## BosBot (example) - Don't use as is - Don't trust, verify!

**Prerequisites:**

Bosbot is designed to manage lightning nodes (rebalancing, fee adjustment, connectivity management). In this early state the script has set hardcoded parameters which will be changed in future releases to fit nodes in different shapes and sizes. For now Bosbot assumes that there are enough channels for rebalancing and channel sizes are above 2M satoshis. Bosbot collects statistically valuable data to determine convenient parameters for its management routines.
Bosbot needs Balance of Satoshi (BoS: https://github.com/alexbosworth/balanceofsatoshis) globally installed.

**Rebalancing:**

Bosbot tries to balance imbalanced channels close to 1:1. Imbalance is detected if channels liquidity is `MIN_SATS_OFF_BALANCE` away from perfect balance. Especially depleted channels (liquidity < `MIN_SATS_PER_SIDE` on local or remote side) are treated as rebalance candidates. Rebelance amount is set between `MIN_REBALANCE_SATS` (BoS minimum size) and `MAX_REBALANCE_SATS`, preferably off-balance amount. Bosbot takes inbound fee (peers' fees) and historic data into account and adds a safety margin before rebalancing (cost effectiveness), so ideally future expected income (future forwards) earn profit. In addition, Bosbot rebalances pairs of local-heavy and remote-heavy channels up to `MAX_PARALLEL_REBALANCES` in parallel.

**Fee adjustment / Max HTLC sizes per Channel:**

Bosbot is setting channel fees based on activity per hours/days or manually if defined in settings.json. Fees are adjusted faster upwards than downwards. Best practice: For a new channel set fees initially high and let it drop (Bosbot) until forwards happen. Initial fees have to be set by LND favourably (lnd.conf, bitcoin section). Edge cases can be set in settings.json, e.g. no rebalancing to remote side for draining-only channels (like LN exchanges). Furthermore Bosbot is setting max htlc sizes for each channel to reduce channel failures on forwards.

**Backup Payments:**

To clean and speed up LND, backing up and removing payments from channel.db to external files (json) is a way to do so. Backup files are saved into `\logs\` directory and read on startup.


**Usage:**

Edit `index.js` to your needs. At the top of the script set which `MANAGEMENT SWITCHES` should apply.

`ALLOW_BOS_RECONNECT`: bosbot checks for offline peers and tries to reconnect them within a given time period

`ADJUST_POLICIES`: bosbot is permitted to adjust outgoing fees and max htlc sizes of your channels

`ADJUST_POLICIES_FEES` : if false this restricts policy management (setting htlc sizes/fees) to htlc management only

`ALLOW_REBALANCING`: bosbot rebalances channels which are depleted to local or remote side (500_000 sats off balance with channel size above 2M)

`ALLOW_NODE_RESET`: experimental feature trying to reset services if too many peers seem to be offline (reset Tor or restart node)

`ALLOW_DB_CLEANUP`: enables or disables backup payments in jsons and remove from channel database for speed every `DAYS_BETWEEN_DB_CLEANING` days

**Start Commands:**

`npm start` : starts bosbot

`npm run start-limiter` : starts htlcLimiter from `\tools\` directory

**Adjust settings:**

`MIN_PPM_ABSOLUTE`: minimum fees

`MAX_PPM_ABSOLUTE`: maximum fees

**Workflow:**

1) runBotReconnectCheck()
2) runUpdateFeesCheck()
3) runBotRebalanceOrganizer()
4) runBot() // repeat every x minutes (`MINUTES_BETWEEN_STEPS`)

**Fine-Tuning:**

1) Setup Telegram Bot: Edit settings.json to your needs. Add HTTP API Token (set by BotFather) and chat id (lookup "/id" on Telegram).
2) Set rules for channels (see settings.json.example): aliasMatch, min_ppm, max_ppm, no_local_rebalance, no_remote_balance, max_htlc_sats, AVOID_LIST (nodes to exclude from rebalancing (even in-path))




**/TOOLS/**

**Summary:**

Run `node lndsummary` to gather useful data based on your node's statistics (balances, fees, weekly stats for profits and forwards)

**Visualization:**

Run `node visualize` to start up a webservice hosted at http://localhost:7890 or http://(your-local-address/ip):7890  
  
**Nodes in Path:**

Running `node nodes_in_path` shows most used nodes in past rebalances. Switches `DAYS_FOR_STATS` (how many days to look back) and `SHOW_PEERS` (show already connected peers) are adjustable. For this script to run some data is needed (run index.js at least once, turn off any management switches).

**HTLC Limiter:**

A module to watch and limit numbers of pending htlcs per channel based on fee policies. In parallel it watches for forwarding requests, calculates the htlc's fee and adds it to a fee range (currently 2^X). If the number of pending htlcs within a given fee range exceeds the limit, the forward is rejected. For now there're more htlcs allowed for outgoing than incoming direction. Also it acts as a rate limiter for htlcs. To run htlcLimiter: `npm run start-limiter` from home directory

**Lookup:**

Running `node lookup <alias>` displays data of a specific alias/peer.

___________________________________________________________
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

