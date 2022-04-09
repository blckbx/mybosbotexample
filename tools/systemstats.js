// get system stats for remote monitoring
// optionally: send stats to TG
// requires package: systeminformation

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import systeminformation from 'systeminformation'
const si = systeminformation

// get Tor proxy for Telegram bot
const env = process.env;
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// --- settings ---
const LOG_FILE_PATH = '../logs/sysdata.log'

// Telegram Settings - 
// Caution! You are sending sensible data to Telegram servers!
const TELEGRAM_ACTIVE = false
const TELEGRAM_CHATID = env.TELEGRAM_CHATID || ''
const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN || ''
const TELEGRAM_PROXY_HOST = env.TELEGRAM_PROXY_HOST || ''
const TELEGRAM_PROXY_PORT = env.TELEGRAM_PROXY_PORT || ''

// --- end of settings  ---

const run = async () => {

  // init settings
  if(TELEGRAM_PROXY_HOST != '' 
    && TELEGRAM_PROXY_PORT != '' 
    && TELEGRAM_CHATID != ''
    && TELEGRAM_TOKEN != ''
    && TELEGRAM_ACTIVE)
  {
    log(`telegramLog(): Connecting with Telegram via proxy: socks://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}`)
  } else {
    log(`telegramLog(): Connecting with Telegram without proxy`)
  }

  // stats

  // uptime
  const os = (await si.time())
  const sysUptime = secondsToDhms(os.uptime)

  // cpu load, temperature
  const cpuTemp = (await si.cpuTemperature()).main
  const cpuLoad = (await si.currentLoad())
  const cpuLoadAvg = cpuLoad.avgLoad
  const cpuLoadSys = cpuLoad.currentLoadSystem.toFixed(2)

  // services - add your services here
  const servicesLoad = (await si.services('tor, bitcoind, lnd, electrs'))
  let servicesLoadData = ''
  servicesLoad.forEach(p => {
    if(p) {
      servicesLoadData += ` ${p.name.padEnd(10)} | status: ${p.running}` 
      p.running ? servicesLoadData += ` | cpu %: ${(p.cpu).toFixed(2).padEnd(5)} | mem %: ${p.mem}\n` : `\n`
    }
  })

  // memory
  const mem = (await si.mem())
  const memTotal = convertBytes(mem.total)
  const memUsed = convertBytes(mem.used - mem.buffcache)
  const swapTotal = convertBytes(mem.swaptotal)
  const swapUsed = convertBytes(mem.swapused)  
  const memData = `used: ${memUsed} / total: ${memTotal}`
  const swapData = `used: ${swapUsed} / total: ${swapTotal}`

  // mounting points
  const mountLayout = (await si.fsSize())
  let mountData = ''
  mountLayout.forEach(p => {
    if(p && !(p.fs).includes('sda1')) mountData += ` ${(p.fs).padEnd(10)} | ${(convertBytes(p.size)).padEnd(5)} | ${convertBytes(p.used)} (${p.use} %) used\n`
  });

  // disks
  const diskLayout = (await si.diskLayout())
  let diskData = ''
  diskLayout.forEach(p => {
    if(p) diskData += ` ${p.name} (${p.type}/${p.interfaceType}) | ${convertBytes(p.size)} | ${p.smartData?.temperature?.current ?? 'n/a'} °C | SMART Status: ${p.smartStatus}\n`
  })

  // ups over usp - connection check
  const usbDevices = (await si.usb())
  let upsIsActive = 'not connected'
  usbDevices.forEach(p => {
    if(p && p.name === 'UPS') upsIsActive = 'connected'
  })
  
  // network
  const interfaces = (await si.networkInterfaces())
  let interfacesString = ''
  interfaces.forEach(p => {
    if(p) interfacesString += ` ${p.iface.padEnd(10)} | type: ${p.type.padEnd(7)} | state: ${p.operstate.padEnd(7)} | speed: ${p.speed ?? 'n/a'}\n`
  })

  const ifStats = (await si.networkStats())
  let ifMsg = ''
  ifStats.forEach(p => {
    if(p) ifMsg += ` ${p.iface} | state: ${p.operstate} | rx: ${convertBytes(p.rx_bytes)} | tx: ${convertBytes(p.tx_bytes)}\n`
  })




  // construct final message
  const message = `
uptime: ${sysUptime}
cpu: 
 load: ${cpuLoadAvg} (avg) | ${cpuLoadSys} (sys)
 temperature: ${cpuTemp} °C

services
${servicesLoadData}
memory: ${memData}
swap:   ${swapData}
usb:    ups ${upsIsActive}

mounts
${mountData}
disks
${diskData}
networks
${interfacesString}
networkStats
${ifMsg}`

  log(message)
  if(TELEGRAM_ACTIVE) telegramLog(message)

}


// helpers

// uses telegram logging if available
const telegramLog = async message => {
  if(!TELEGRAM_TOKEN || !TELEGRAM_CHATID) return null
  
  let proxy = ''
  if(TELEGRAM_PROXY_HOST != '' && TELEGRAM_PROXY_PORT != '') { proxy = `socks://${TELEGRAM_PROXY_HOST}:${TELEGRAM_PROXY_PORT}` }
  if (TELEGRAM_TOKEN && TELEGRAM_CHATID) await bos.sayWithTelegramBot({ TELEGRAM_TOKEN, TELEGRAM_CHATID, message, proxy })
}

const convertBytes = function(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]

  if (bytes == 0) {
    return "n/a"
  }

  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))

  if (i == 0) {
    return bytes + " " + sizes[i]
  }

  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i]
}


// helpers
const secondsToDhms = (seconds) => {
  const d = Math.floor(seconds / (3600*24));
  const h = Math.floor(seconds % (3600*24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`
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