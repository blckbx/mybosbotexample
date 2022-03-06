// logs peer disconnects/connects and graph policy updates (fee rates n stuff) in our channels
// also logs forwarding successes and failures w/ reason if provided
// and block updates and channel opening/closings

import fs from 'fs'
import bos from '../bos.js'
const { lnService } = bos

// --- settings ---

const LOG_FILE_PATH = 'events.log'

// this filters what htlc fail events will be shown
const WHEN_LOG_FAILED_HTLCS = forward =>
  // must have reason or no point displaying
  (forward.external_failure || forward.internal_failure) &&
  // no probes
  forward.internal_failure !== 'UNKNOWN_INVOICE'

// shows forwards that confirm
const LOG_SUCCESSFUL_FORWARDS = true

// sometimes just timestamp is updated, this ignores those gossip updates
const IGNORE_GOSSIP_UPDATES_WITHOUT_SETTING_CHANGES = true

// --- end of settings  ---

const run = async () => {
  const lnd = await bos.initializeAuth()
  const { public_key } = await lnService.getIdentity({ lnd })
  const publicKeyToAlias = await bos.getPublicKeyToAliasTable()
  const idToAlias = await bos.getIdToAliasTable()

  let lastPolicies = await bos.getNodeChannels()

  // subscriptions
  const graphEvents = await lnService.subscribeToGraph({ lnd })
  const peerEvents = await lnService.subscribeToPeers({ lnd })
  const forwardEvents = await lnService.subscribeToForwards({ lnd })
  const blockEvents = await lnService.subscribeToBlocks({ lnd })
  const chanEvents = await lnService.subscribeToChannels({ lnd })  

  
  // events
    
  // what to do on events for graph (that includes my node)
  // https://github.com/alexbosworth/ln-service#subscribetograph
  graphEvents.on('channel_updated', async update => {
    if (!update.public_keys.includes(public_key)) return null
    const remote_key = update.public_keys.find(v => v !== public_key)
    const [announcing_key] = update.public_keys // first key announces
    const whoUpdated = announcing_key === public_key ? 'local' : 'remote'
    // get this side's last state
    const before = lastPolicies[update.id]?.[whoUpdated]

    // summarize changes
    const updates = []
    const changes = {}
    for (const prop of [
      'base_fee_mtokens',
      'cltv_delta',
      'fee_rate',
      'is_disabled',
      'max_htlc_mtokens',
      'min_htlc_mtokens',
      'updated_at'
    ]) {
      if (before?.[prop] !== update[prop]) {
        updates.push(`${prop}: ${pretty(before?.[prop])} -> ${pretty(update[prop])}`)
        changes[prop] = true
      }
    }
    if (IGNORE_GOSSIP_UPDATES_WITHOUT_SETTING_CHANGES && updates.length <= 1) return null // just updated timestamp changed

    // check if peer is online if disable status changed
    const peer = changes.is_disabled ? (await bos.peers({}))?.find(p => p.public_key === remote_key) : null
    const offlineStatus = !peer ? '' : peer.is_offline ? '(offline)' : '(online)'

    log(
      `📣 ${whoUpdated} update for peer`,
      publicKeyToAlias[remote_key],
      remote_key,
      offlineStatus,
      '\n   ',
      updates.join('\n    ')
    )

    // update policy data
    lastPolicies = await bos.getNodeChannels()
  })
  graphEvents.on('error', () => {
    log('graph events error')
    process.exit(1)
  })

  // what to do on events for peers
  // addon: show reconnected socket (might be interesting for hybrid nodes)
  // https://github.com/alexbosworth/ln-service#subscribetopeers  
  peerEvents.on('connected', async update => { 
    // get alias from direct peers table
    const pkey = update.public_key
    var alias_format = publicKeyToAlias[pkey] ?? 'unknown'
    // if non-peer, try to fetch non-peer's alias from graph
    if (alias_format === 'unknown') {
      alias_format = (await bos.getNodeFromGraph({ public_key: pkey }))?.alias ?? 'unknown'
    }

    // get peer's current socket
    const { peers } = await bos.callAPI('getPeers') ?? {}
    const thisPeer = peers.find(p => p.public_key === pkey)
    const socket_format = thisPeer?.socket ? `@ ${thisPeer?.socket}` : ''

    log(`💚 connected to ${alias_format}`, pkey, `${socket_format}`)
  })
  peerEvents.on('disconnected', async update => {
    const pkey = update.public_key
    // get alias from direct peers table
    var alias_format = publicKeyToAlias[pkey] ?? 'unknown'
    // if non-peer, try to fetch non-peer's alias from graph
    if (alias_format === 'unknown') {
      alias_format = (await bos.getNodeFromGraph({ public_key: pkey }))?.alias ?? 'unknown'
    }
    log(`⛔ disconnected from ${alias_format}`, pkey)
  })
  peerEvents.on('error', () => {
    log('peer events error')
    process.exit(1)
  })

  // what to do for forwards
  // https://github.com/alexbosworth/ln-service#subscribetoforwards  
  const pastForwardEvents = {}
  forwardEvents.on('forward', f => {
    // have to store forwarding events amounts under unique id
    // if just starting to listen, likely will be missing past payment information
    const fid = `${f.in_channel} ${f.in_payment} ${f.out_channel} ${f.out_payment}`
    if (!pastForwardEvents[fid]) pastForwardEvents[fid] = {}
    if (f.mtokens) pastForwardEvents[fid].mtokens = f.mtokens
    if (f.fee_mtokens) pastForwardEvents[fid].fee_mtokens = f.fee_mtokens

    // try to get amount from previous events bc geniuses didn't include that every time
    const mtokens = f.mtokens ?? pastForwardEvents[fid]?.mtokens
    const fee_mtokens = f.fee_mtokens ?? pastForwardEvents[fid]?.fee_mtokens

    const from = idToAlias[f.in_channel] ?? f.in_channel ?? 'n/a'
    const to = idToAlias[f.out_channel] ?? f.out_channel ?? 'n/a'
    const amt = mtokens !== undefined ? `${pretty(+mtokens / 1000, 3)} sats` : 'n/a'
    const fee = fee_mtokens !== undefined ? `${pretty(+fee_mtokens / 1000, 3)} sats fee` : 'n/a'

    // done: failures
    if (f.is_failed) {
      // this checks rule on which forwards to show
      if (WHEN_LOG_FAILED_HTLCS(f)) {
        const msg = [`🚨 forwarding failure: ${from} -> ${to} of ${amt} for ${fee}`]

        if (f.internal_failure && f.internal_failure !== 'NO_DETAIL') {
          msg.push(`    internal failure: ${f.internal_failure}`)
        }
        if (f.external_failure && f.external_failure !== 'NO_DETAIL') {
          msg.push(`    external failure: ${f.external_failure}`)
        }

        log(msg.join('\n'))
      }
      delete pastForwardEvents[fid] // clear up memory
      return null
    }

    // done: success
    // print only real forwards, no rebalances
    if (f.is_confirmed &&
        from !== 'n/a' &&
          to !== 'n/a' &&
         amt !== 'n/a' &&
         fee !== 'n/a') {
      if (LOG_SUCCESSFUL_FORWARDS) {
        log(`⚡ forwarding success: ${from} -> ${to} of ${amt} for ${fee}`)
      }

      delete pastForwardEvents[fid] // clear up memory
      return null
    }

    // unresolved forwards with defined path
    // if (f.in_channel && f.out_channel) {
    //   log(`🕐 forwarding pending: ${from} -> ${to} of ${amt} for ${fee}`)
    // }

    // just in case too many fids in memory clean it all up above some limit
    if (Object.keys(pastForwardEvents).length >= 555) {
      Object.keys(pastForwardEvents).forEach(key => delete pastForwardEvents[key])
      log('forward id number limit hit, cleaning up RAM')
    }
  })
  forwardEvents.on('error', () => {
    log('forward events error')
    process.exit(1)
  })

  // block events: new block height, new block hash
  // https://github.com/alexbosworth/ln-service#subscribetoblocks  
  blockEvents.on('block', async f => {
    log(`🔗 block height: ${f.height} | id: ${f.id}`)
  })
  blockEvents.on('error', () => {
    log('block events error')
    process.exit(1)
  }) 

  // channel events: channel opening/opened/closed
  // https://github.com/alexbosworth/ln-service#subscribetochannels  
  chanEvents.on('channel_opened', async f => {
    const is_private = f.is_private ? 'yes' : 'no'
    const initiator = f.is_partner_initiated ? 'remote' : 'local'
    log(`🌱 channel opened: 
    remote_pubkey: ${f.partner_public_key}
    channel_id: ${f.id}
    capacity: ${pretty(f.capacity, 3)} sats 
    funding_tx: ${f.transaction_id}:${f.transaction_vout}
    is_private: ${is_private}
    initiator: ${initiator}`)
  })
  chanEvents.on('channel_opening', async f => {
    log(`🌱 channel opening: ${f.transaction_id}:${f.transaction_vout}`)
  })
  chanEvents.on('channel_closed', async f => {
    const is_private = f.is_private ? 'yes' : 'no'
    
    if (f.is_force_close) {
      
      const force_initiator = (f.is_local_force_close ? 'local' : 'remote') || 'n/a'

      log(`🥀 channel force-closed:
      alias: ${publicKeyToAlias[f.partner_public_key]}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      force_close_initiator: ${force_initiator}      
      capacity: ${pretty(f.capacity, 0)} sats
      local: ${pretty(f.final_local_balance, 0)} sats | ${pretty((f.capacity - f.final_local_balance), 0)} sats :remote
      funding_tx: ${f.transaction_id}:${f.transaction_vout}
      is_private: ${is_private}`)

    } else {

      const coop_initiator = (f.is_partner_closed ? 'remote' : 'local') || 'n/a'

      log(`🥀 channel coop-closed:
      alias: ${publicKeyToAlias[f.partner_public_key]}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      coop_initiator: ${coop_initiator}
      capacity: ${pretty(f.capacity, 0)} sats
      local: ${pretty(f.final_local_balance, 0)} sats | ${pretty((f.capacity - f.final_local_balance), 0)} sats :remote
      funding_tx: ${f.transaction_id}:${f.transaction_vout}
      is_private: ${is_private}`)

    }
  })
  chanEvents.on('error', () => {
    log('chan events error')
    process.exit(1)
  })
  
  log('listening for events...')
}


const log = (...args) =>
  setImmediate(() => {
    const msg = [getDate(), ...args, '\n'].join(' ')
    console.log(msg)
    fs.appendFileSync(LOG_FILE_PATH, msg + '\n')
  })
const getDate = () => new Date().toISOString().replace('T', ' ').replace('Z', '')
const pretty = (n, L = 0) => {
  if (isNaN(n)) return n
  return String((+n || 0).toFixed(L)).replace(/\B(?=(\d{3})+\b)/g, '_')
}

run()
