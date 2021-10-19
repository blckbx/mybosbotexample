## BosBot (example) - Don't use as is - Don't trust, verify!

**Prerequisites:**

Bosbot is designed to manage lightning nodes (rebalancing, fee adjustment, connectivity management). In this early state the script has set hardcoded parameters which will be changed in future releases to fit nodes in different shapes and sizes. For now Bosbot assumes that there are enough channels for rebalancing and channel sizes are above 2M satoshis. Bosbot collects statistically valuable data to determine convenient parameters for its management routines.
Bosbot needs Balance of Satoshi (BoS: https://github.com/alexbosworth/balanceofsatoshis) globally installed.

**Rebalancing:**

Bosbot tries to balance imbalanced channels close to 1:1. Imbalance is detected if channels liquidity is 500_000 sats away from perfect balance (`MIN_SATS_OFF_BALANCE`). Especially depleted channels (liquidity < 1M on local or remote side) are treated as rebalance candidates (`MIN_SATS_PER_SIDE`). Rebelance amount is set between 51_000 sats (`MIN_REBALANCE_SATS`) and 400_000 sats (`MAX_REBALANCE_SATS` but off-balance amount is preferred). Bosbot takes inbound fee (peers' fees) and historic data into account (safety margin) before doing any rebalancing (cost effectiveness), so ideally future expected income (future forwards) pay out the effort. In addition, Bosbot rebalances pairs of local-heavy and remote-heavy channels parallel (up to `MAX_PARALLEL_REBALANCES`).

**Fee adjustment / HTLC sizes:**

Bosbot is setting channel fees based on activity per hours/days or manually if defined in settings.json. Fees are adjusted faster upwards than downwards. Best practice: For a new channel set fees initially high and let it drop (Bosbot) until forwards happen. Initial fees have to be set by LND favourably (lnd.conf, bitcoin section). Edge cases can be set in settings.json, e.g. no rebalancing to remote side for draining-only channels (like LN exchanges). Furthermore Bosbot is setting max htlc sizes for each channel to reduce channel failures on forwards. 

**Usage:**

Edit index.js to your needs. At the top of the script set which `MANAGEMENT SWITCHES` should apply.

`ALLOW_BOS_RECONNECT`: bosbot checks for offline peers and tries to reconnect them within a given time period

`ADJUST_POLICIES`: bosbot is permitted to adjust outgoing fees and max htlc sizes of your channels

`DO_REBALANCING`: bosbot rebalances channels which are depleted to local or remote side (500_000 sats off balance with channel size above 2M)

**Useful settings:**

`MIN_PPM_ABSOLUTE`: minimum fees

`MAX_PPM_ABSOLUTE`: maximum fees

`MAX_PARALLEL_REBALANCES`: maximum number of parallel rebalances

`MINUTES_BETWEEN_FEE_CHANGES`: period of time to adjust fees and htlc sizes (forwards may fail if changed too often due to gossip delay)

**Workflow:**
1) runBotReconnectCheck()
2) runUpdateFeesCheck()
3) runBotRebalanceOrganizer()
4) runBot() // repeat every 10 minutes (`MINUTES_BETWEEN_STEPS`)

**Fine-Tuning:**
1) Setup Telegram Bot: Edit settings.json to your needs. Add HTTP API Token (set by BotFather) and chat id (lookup "/id" on Telegram).
2) Set rules for channels (see settings.json.example): aliasMatch, min_ppm, max_ppm, no_local_rebalance, no_remote_balance, max_htlc_sats

**Visualization:**

Run `node visualize` to start up a webpage hosted at http://localhost:7890 or http://(your-local-address):7890  
  
**Nodes in Path:**
  
Running `node nodes_in_path` shows most used nodes in past rebalances. Switches `DAYS_FOR_STATS` (how many days to look back) and `SHOW_PEERS` (show already connected peers) are adjustable. For this script to run a database is needed (run index.js at least once).

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

