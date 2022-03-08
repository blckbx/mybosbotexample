// logs peer disconnects/connects and graph policy updates (fee rates n stuff) in our channels
// also logs forwarding successes and failures w/ reason if provided
// and block updates and channel opening/closings
// optionally send events to Telegram Bot

import fs from 'fs'
import path from 'path';
import dotenv from 'dotenv';
import bos from '../bos.js'
const { lnService } = bos

// --- settings ---

const LOG_FILE_PATH = 'events.log'
const SETTINGS_PATH = 'settings.json'
// Tor Proxy for Telegram Bot
const env = process.env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const TELEGRAM_PROXY_HOST = env.TELEGRAM_PROXY_HOST || ''
const TELEGRAM_PROXY_PORT = env.TELEGRAM_PROXY_PORT || ''
const mynode = {}

// this filters what htlc fail events will be shown
const WHEN_LOG_FAILED_HTLCS = forward =>
  // must have reason or no point displaying
  (forward.external_failure || forward.internal_failure) &&
  // no probes
  forward.internal_failure !== 'UNKNOWN_INVOICE'

// shows forwards that confirm
const LOG_SUCCESSFUL_FORWARDS = true

// allow or deny incomingprivate channel requests
const ALLOW_PRIVATE_CHANNELS = false

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
  const chanOpenEvents = await lnService.subscribeToOpenRequests({ lnd })

  // init telegram settings
  if (fs.existsSync(SETTINGS_PATH)) {
    mynode.settings = JSON.parse(fs.readFileSync(SETTINGS_PATH))
  }
  if(TELEGRAM_PROXY_HOST != '' && TELEGRAM_PROXY_PORT != '' &&
      mynode.settings?.telegram.chat_id && mynode.settings?.telegram.token)
  {
    log(`bos.sayWithTelegramBot(): Connecting via proxy: socks://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}`)
  } else {
    log(`bos.sayWithTelegramBot(): Connecting without proxy`)
  }


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
    
    await telegramLog(`📣 ${whoUpdated} update for peer ${publicKeyToAlias[remote_key]} ${remote_key} ${offlineStatus}\n${updates.join('\n')}`)  

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
    let alias_format = publicKeyToAlias[pkey] ?? 'unknown'
    // if non-peer, try to fetch non-peer's alias from graph
    if (alias_format === 'unknown') {
      alias_format = (await bos.getNodeFromGraph({ public_key: pkey }))?.alias ?? 'unknown'
    }

    // get peer's current socket
    const { peers } = await bos.callAPI('getPeers') ?? {}
    const thisPeer = peers.find(p => p.public_key === pkey)
    const socket_format = thisPeer?.socket ? `@ ${thisPeer?.socket}` : ''

    const message = `💚 connected to ${alias_format} ${pkey} ${socket_format}`
    log(message)
    // await telegramLog(message)
  })

  peerEvents.on('disconnected', async update => {
    const pkey = update.public_key

    // get alias from direct peers table
    let alias_format = publicKeyToAlias[pkey] ?? 'unknown'
    // if non-peer, try to fetch non-peer's alias from graph
    if (alias_format === 'unknown') {
      alias_format = (await bos.getNodeFromGraph({ public_key: pkey }))?.alias ?? 'unknown'
    }
    
    const message = `⛔ disconnected from ${alias_format} ${pkey}`
    log(message)
    // await telegramLog(message)
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
    const message = `🔗 block height: ${f.height} | id: ${f.id}`
    log(message)
    // await telegramLog(message)
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
    const message = `🌱 channel opened: 
    remote_pubkey: ${f.partner_public_key}
    channel_id: ${f.id}
    capacity: ${pretty(f.capacity, 3)} sats 
    funding_tx: ${f.transaction_id}:${f.transaction_vout}
    is_private: ${is_private}
    initiator: ${initiator}`
    log(message)
    await telegramLog(message)
  })

  chanEvents.on('channel_closed', async f => {
    const is_private = f.is_private ? 'yes' : 'no'
    
    if (f.is_force_close) {
      
      const force_initiator = (f.is_local_force_close ? 'local' : 'remote') || 'n/a'

      const message = `🥀 channel force-closed:
      alias: ${publicKeyToAlias[f.partner_public_key]}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      force_close_initiator: ${force_initiator}      
      capacity: ${pretty(f.capacity, 0)} sats
      local: ${pretty(f.final_local_balance, 0)} sats | ${pretty((f.capacity - f.final_local_balance), 0)} sats :remote
      funding_tx: ${f.transaction_id}:${f.transaction_vout}
      is_private: ${is_private}`
      log(message)
      await telegramLog(message)

    } else {

      const coop_initiator = (f.is_partner_closed ? 'remote' : 'local') || 'n/a'

      const message = `🥀 channel coop-closed:
      alias: ${publicKeyToAlias[f.partner_public_key]}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      coop_initiator: ${coop_initiator}
      capacity: ${pretty(f.capacity, 0)} sats
      local: ${pretty(f.final_local_balance, 0)} sats | ${pretty((f.capacity - f.final_local_balance), 0)} sats :remote
      funding_tx: ${f.transaction_id}:${f.transaction_vout}
      is_private: ${is_private}`
      log(message)
      await telegramLog(message)
    }
  })

  chanEvents.on('error', () => {
    log('chan events error')
    process.exit(1)
  })

  // channelOpenRequests
  // https://github.com/alexbosworth/ln-service#subscribetoopenrequests 
  // ability to reject private channels
  chanOpenEvents.on('channel_request', async f => {
    try {
      let result
      if(!ALLOW_PRIVATE_CHANNELS) {
        result = f.is_private ? f.reject() : f.allowed()

        if(f.is_private) {
          const message = `🚫 private channel rejected:
      alias: ${(await bos.getNodeFromGraph({ public_key: f.partner_public_key }))?.alias ?? 'unknown'}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      capacity: ${pretty(f.capacity, 0)} sats`
          log(message)
          await telegramLog(message)
        }
      } else {
        result = f.accept()

        const message = `🌱 channel opening accepted:
      alias: ${(await bos.getNodeFromGraph({ public_key: f.partner_public_key }))?.alias ?? 'unknown'}
      remote_pubkey: ${f.partner_public_key}
      channel_id: ${f.id}
      capacity: ${pretty(f.capacity, 0)} sats`
        log(message)
        await telegramLog(message)
      }
      return result
    } catch(e) {
      log(`chanOpenEvents error`)
    }
  })


  log('listening for events...')
}


// uses telegram logging if available
const telegramLog = async message => {
  const { token, chat_id } = mynode.settings?.telegram || {}
  if(!token || !chat_id) return null
  
  let proxy
  if(TELEGRAM_PROXY_HOST != '' && TELEGRAM_PROXY_PORT != '') { proxy = `socks://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}` }
  if (token && chat_id) await bos.sayWithTelegramBot({ token, chat_id, message, proxy })
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
