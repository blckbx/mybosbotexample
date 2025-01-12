// needs visualize.js and bos.js, the wrapper, in same folder
// run with: npm link balanceofsatoshis && node visualize
// makes webpage visual available on local machine at e.g. http://localhost:7890
// and local network at e.g. http://192.168.1.123:7890
// umbrel shortcut for local address also works with port specified, e.g.: http://umbrel.local:7890
// then just need to open the page and set settings with query string
// xAxis, yAxis, and rAxis can be set to days', ppm, routed, earned, count (for grouped)
// can combine items into xGroups number of groups along x axis
// ppm, routed, earned will be plotted in log scale, days in linear
// roundDown=1 will round down to nearest sat as a way to remove sub-satoshi base fees
// e.g.
// http://localhost:7890/?daysForStats=7&xGroups=0&xAxis=ppm&yAxis=earned&rAxis=routed&any=bfx&out=&from=&roundDown=&type=bubble
// http://localhost:7890/?daysForStats=7&xGroups=0&xAxis=ppm&yAxis=earned&rAxis=&out=&from=&roundDown=1&type=bubble
// http://localhost:7890/?daysForStats=14&xAxis=ppm&yAxis=earned
// http://localhost:7890/?daysForStats=14&xAxis=ppm&yAxis=earned&xGroups=10
// http://localhost:7890/?daysForStats=14&xAxis=ppm&yAxis=earned&out=aci
// http://localhost:7890/?daysForStats=14&xAxis=ppm&yAxis=earned&from=acinq
// http://localhost:7890/?daysForStats=14&xAxis=days&yAxis=earned
// http://localhost:7890/?daysForStats=14&xAxis=days&yAxis=earned&xGroups=10
// http://localhost:7890/?daysForStats=90&xAxis=days&yAxis=earned&xGroups=10&type=line
// http://localhost:7890/?daysForStats=30&xAxis=ppm&yAxis=earned&rAxis=count&xGroups=15
// http://localhost:7890/?daysForStats=7&xAxis=ppm&yAxis=earned&rAxis=routed
// http://localhost:7890/?daysForStats=7&xAxis=days&yAxis=earned&rAxis=count&xGroups=20
// http://localhost:7890/?daysForStats=30&yAxis=count&xAxis=routed&xGroups=21&type=line

import bos from '../bos.js'
import fs from 'fs'
import os from 'os'

import http from 'http'
import url from 'url'

let networkLocation = '0.0.0.0' // will try to overwrite with local network address
const HTML_PORT = '7890' // 80 probably taken

// eslint-disable-next-line no-unused-vars
const { max, min, floor, ceil, abs, trunc, log, exp, sqrt, pow, log10 } = Math
// eslint-disable-next-line no-extend-native
Object.defineProperty(Array.prototype, 'fsort', {
  value: function (compare) {
    return [].concat(this).sort(compare)
  }
})

const logPlots = ['ppm', 'earned', 'routed']

const generatePage = async ({
  daysForStats, // number of days to look back at
  xGroups = 0, // round number of groups along x axis
  rAxis = '', // ppm, earned, routed, count
  xAxis = 'earned', // days, ppm, earned, routed
  yAxis = 'ppm', // days, ppm, earned, routed, count
  out = '', // partial alias or public key match
  from = '', // partial alias or public key match
  type = 'bubble', // can also be line
  any = '', // can be from or out of
  roundDown = '' // 1 or ''/0 ignore milisats (helps w/ removing <1 sat base fee)
}) => {
  // ensure integers where necessary
  if (xGroups) xGroups = +xGroups
  else xGroups = 0

  if (daysForStats) daysForStats = +daysForStats
  else daysForStats = 7

  if (+roundDown) roundDown = true
  else roundDown = false

  let peerForwards = []
  const pubkeyToAlias = {}
  let peerOut, peerIn, peerAny

  const peers = await bos.peers({ is_active: undefined })

  peers.forEach(p => {
    pubkeyToAlias[p.public_key] = p.alias
  })

  const peersForwards = await bos.customGetForwardingEvents({
    days: daysForStats,
    timeArray: true
  })

  peerForwards = peersForwards

  // specific peer or all
  if (out || from || any) {
    // if specific peer try to find alias data
    if (out) {
      peerOut =
        peers.find(p => p.public_key.includes(out.toLowerCase())) ||
        peers.find(p => p.alias.toLowerCase() === out.toLowerCase()) ||
        peers.find(p => p.alias.toLowerCase().includes(out.toLowerCase()))
      // if node still exists this will find alias and public key
      if (!peerOut) {
        peerOut = (await bos.find(out))?.nodes?.[0]
        if (peerOut) pubkeyToAlias[peerOut.public_key] = peerOut.alias
      }
      // if not doesn't still exist, would have to just match channel id
      peerOut = peerOut ?? { alias: 'unknown', public_key: '', id: out }
    }

    if (from) {
      peerIn =
        peers.find(p => p.public_key.includes(from.toLowerCase())) ||
        peers.find(p => p.alias.toLowerCase() === from.toLowerCase()) ||
        peers.find(p => p.alias.toLowerCase().includes(from.toLowerCase()))
      // if node still exists this will find alias and public key
      if (!peerIn) {
        peerIn = (await bos.find(from))?.nodes?.[0]
        if (peerIn) pubkeyToAlias[peerIn.public_key] = peerIn.alias
      }
      // if not doesn't still exist, would have to just match channel id
      peerIn = peerIn ?? { alias: 'unknown', public_key: '', id: from }
    }

    if (any) {
      peerAny =
        peers.find(p => p.public_key.includes(any.toLowerCase())) ||
        peers.find(p => p.alias.toLowerCase() === any.toLowerCase()) ||
        peers.find(p => p.alias.toLowerCase().includes(any.toLowerCase()))
      // if node still exists this will find alias and public key
      if (!peerAny) {
        peerAny = (await bos.find(any))?.nodes?.[0]
        if (peerAny) pubkeyToAlias[peerAny.public_key] = peerAny.alias
      }
      // if not doesn't still exist, would have to just match channel id
      peerAny = peerAny ?? { alias: any, public_key: '', id: any }
    }

    // peerOut && console.log({ peerOut })
    // peerIn && console.log({ peerIn })
    // peerAny && console.log({ peerAny })

    console.log('original number of forwards for all peers:', peersForwards.length)

    if (out) {
      peerForwards = peerForwards.filter(
        p => p.outgoing_peer === peerOut.public_key || p.outgoing_channel === peerOut.id
      )
      console.log('after filtering for out-peer:', peerForwards.length)
    }
    if (from) {
      peerForwards = peerForwards.filter(p => p.incoming_peer === peerIn.public_key || p.incoming_channel === peerIn.id)
      console.log('after filtering for from-peer:', peerForwards.length)
    }
    if (any) {
      peerForwards = peerForwards.filter(
        p =>
          p.incoming_peer === peerAny.public_key ||
          p.incoming_channel === peerAny.id ||
          p.outgoing_peer === peerAny.public_key ||
          p.outgoing_channel === peerAny.id
      )
      console.log('after filtering for any mention of a peer:', peerForwards.length)
    }
  }

  // console.log(peerForwards[0])
  console.log(JSON.stringify({ peerOut, peerIn, peerAny }))
  console.log('peerForwards n:', peerForwards.length)

  // console.log(Object.keys(peersForwards).length)

  const getMinMax = arr => {
    let myMin = Infinity
    let myMax = 0
    arr.forEach(d => {
      // eslint-disable-next-line no-extra-semi
      ;[myMin, myMax] = [min(d, myMin), max(d, myMax)]
    })
    return [myMin, myMax]
  }

  // eslint-disable-next-line no-unused-vars
  const [minTime, maxTime] = getMinMax(peerForwards.map(f => f.created_at_ms))

  // sats floor used if roundDown turned on
  const sf = mtokens => (roundDown ? floor(mtokens / 1000) * 1000 : mtokens)

  // figure out which are log scale plots
  const isLogX = logPlots.some(a => a === xAxis)
  const isLogY = logPlots.some(a => a === yAxis)

  // turn into data
  const now = Date.now()
  const data = peerForwards
    .map(p => {
      return {
        ppm: (1e6 * sf(p.fee_mtokens)) / p.mtokens,
        days: -(now - p.created_at_ms) / 1000 / 60 / 60 / 24,
        time: new Date(p.created_at_ms).toISOString(),
        hour: (new Date(p.created_at_ms).getUTCHours() + 24 - 5) % 24, // 24 hours EST time
        routed: p.mtokens / 1000,
        earned: sf(p.fee_mtokens) / 1000,
        from: (pubkeyToAlias[p.incoming_peer] || '') + ' ' + p.incoming_channel,
        to: (pubkeyToAlias[p.outgoing_peer] || '') + ' ' + p.outgoing_channel
      }
    })
    // remove 0 values for log plots
    .filter(d => {
      if (isLogX && d[xAxis] === 0) return false
      if (isLogY && d[yAxis] === 0) return false
      return true
    })

  const zerosRemoved = peerForwards.length - data.length
  if (zerosRemoved) console.log(`removed ${zerosRemoved} data points with 0 value on log scale axis`)

  // aggregate data

  const isTimeOnX = xAxis === 'days'
  const isGrouped = xGroups !== 0

  const [xMin, xMax] = getMinMax(
    data
      .map(d => d[xAxis])
      // use non-0 values only for log plot
      .filter(d => !isLogX || d > 0)
  )

  const linSize = abs(xMax - xMin) / xGroups

  const multiple = pow(xMax / xMin, 1 / xGroups)
  const logLevels = []
  if (isLogX & isGrouped) {
    for (let i = 0; i < xGroups; i++) logLevels.unshift(xMin * pow(multiple, i))
  }
  // if (isLogX & isGrouped) console.log({ multiple, xMax, xMin, xGroups, logLevels, logLevelsLength: logLevels.length })
  // find highest "rounded" level below data point and then move 1/2 level up for middle of range
  const gLog = v => (logLevels.find(L => L <= v) || logLevels[logLevels.length - 1]) * pow(multiple, 0.5) //
  const gLinear = (v, size) => ceil(v / size) * size // + 0.5 * size // was wrapped in trunc

  const dataGroups = {}
  if (isGrouped) {
    data.forEach(d => {
      // const group = gLog(d.ppm) // gLinear(d.ppm, xSize)
      const group = isLogX ? gLog(d[xAxis]) : gLinear(d[xAxis], linSize)
      // if (group === undefined) console.log(gLinear(d[xAxis], linSize))
      const routed = (dataGroups[String(group)]?.routed || 0) + d.routed
      const earned = (dataGroups[String(group)]?.earned || 0) + d.earned
      const count = (dataGroups[String(group)]?.count || 0) + 1
      // const ppm = xAxis === 'ppm' ? group : (earned / routed) * 1e6
      const ppm = (earned / routed) * 1e6 // actual total effective ppm
      const days = xAxis === 'days' ? group : d.days
      dataGroups[String(group)] = { days, routed, earned, count, ppm, group }
    })
  }

  // if time, the oldest day will be partial and thus show invalid data
  const dataAfterGrouping = isTimeOnX
    ? Object.values(dataGroups)
        .fsort((a, b) => a[xAxis] - b[xAxis])
        .slice(1)
    : Object.values(dataGroups)

  const dataForPlot = (isGrouped ? dataAfterGrouping : data)
    // including everything plus actually define x, y, r
    .map(d => ({ ...d, x: d.group ?? d[xAxis], y: d[yAxis], r: sqrt(d[rAxis] || 1) }))
    // for line plots this helps
    .fsort((a, b) => a.x - b.x)

  // fix radius
  const [rMin, rMax] = getMinMax(dataForPlot.map(d2 => d2.r))
  const scaleFromTo = ({ v, minFrom, maxFrom, minTo, maxTo }) =>
    maxFrom > minFrom ? ((v - minFrom) / (maxFrom - minFrom)) * (maxTo - minTo) + minTo : minTo
  const MIN_RADIUS_PX = 2
  const MAX_RADIUS_PX = 8
  dataForPlot.forEach(d2 => {
    d2.r = scaleFromTo({ v: d2.r, minFrom: rMin, maxFrom: rMax, minTo: MIN_RADIUS_PX, maxTo: MAX_RADIUS_PX })
  })

  const [, xMaxPlot] = getMinMax(dataForPlot.map(d => d.x))
  const [, yMaxPlot] = getMinMax(dataForPlot.map(d => d.y))

  const color1 = 'rgb(255, 99, 132)'
  const color2 = 'rgb(99, 132, 255)'

  const dataForPlot1 =
    any && !xGroups
      ? dataForPlot.filter(v => v.from.includes(peerAny?.alias) || v.from.includes(peerAny?.id))
      : dataForPlot
  const dataString1 = JSON.stringify(dataForPlot1)

  const dataForPlot2 =
    any && !xGroups ? dataForPlot.filter(v => v.to.includes(peerAny?.alias) || v.to.includes(peerAny?.id)) : []
  const dataString2 = JSON.stringify(dataForPlot2)

  // const colorData = dataForPlot.map(v => color1)

  const outOf = out ? 'out to ' + peerOut?.alias : ''
  const inFrom = from ? 'in from ' + peerIn?.alias : ''
  const anyUse = any ? 'with ' + peerAny?.alias : ''
  const whichPeers = anyUse || `${outOf}${outOf && inFrom ? ', ' : ''}${inFrom}`

  // annoys me can't see max axis label on some log axis
  const logMaxX = isLogX ? pow(10, ceil(log10(xMaxPlot))) : null
  const logMaxY = isLogY ? pow(10, ceil(log10(yMaxPlot))) : null

  // if few enough show what specific events are
  if (!isGrouped && dataForPlot.length < 42) {
    for (const f of dataForPlot) {
      console.log(`from: ${f.from.padEnd(28)} to: ${f.to.padEnd(28)} amt: ${f.routed.toFixed(3).padStart(15)}`)
    }
  }

  console.log('showing points:', dataForPlot.length)
  // console.log(dataForPlot[0])
  // console.log({ logMaxX, logMaxY, xMaxPlot, yMaxPlot })

  // https://cdnjs.com/libraries/Chart.js
  // prettier-ignore
  const myPage = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style type="text/css">
    body {
      background-color: #fff;
    }
    #title {
      font-size: 19pt;
      text-align: center;
      padding: 1.5vh;
      padding-top: 2vh;
    }
  </style>
</head>
<body>

  <div id="title">Peer forwards for past ${daysForStats} days<br>${whichPeers}</div>
  <div class="chart-container" style="position: relative; height: 80vh; width: 80vw; margin: 3vh auto;">
  <canvas id="chart" width="400" height="400"></canvas>
  </div>
  <script
    src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.5.1/chart.min.js"
    integrity="sha512-Wt1bJGtlnMtGP0dqNFH1xlkLBNpEodaiQ8ZN5JLA5wpc1sUlk/O5uuOMNgvzddzkpvZ9GLyYNa8w2s7rqiTk5Q=="
    crossorigin="anonymous"
    referrerpolicy="no-referrer"
  ></script>
  <script>
  /* eslint-disable */
  const options = {
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            return Object.keys(context.raw).map(k => k + ': ' + context.raw[k])
          }
        }
      }
    },
    responsive: true,
    maintainAspectRatio: false,
    stacked: false,
    lineTension: 0.5,
    scales: {
      x: {
        type: '${isLogX ? 'logarithmic' : 'linear'}',
        // type: 'linear',
        // min: 100,
        ${logMaxX ? 'max: ' + logMaxX + ',' : ''}
        suggestedMax: 0,
        position: 'bottom',
        grace: '10%',
        title: {
          display: true,
          text: '${xAxis}'
        }
      },
      y: {
        type: '${isLogY ? 'logarithmic' : 'linear'}',
        // min: 100,
        ${logMaxY ? 'max: ' + logMaxY + ',' : ''}
        // suggestedMax: 100e6,
        grace: '10%',
        position: 'left',
        title: {
          display: true,
          text: '${yAxis}'
        }
      }
    }
  }

  Chart.defaults.font.size = 21

  const labelRadius = '${rAxis && type === 'bubble' ? 'area ∝ ' + rAxis + ', ' : ' '}'
  const labelGroups = '${xGroups ? `grouped into ${xGroups} x-axis regions, ` : ' '}'
  const labelCountFrom = 'count: ${dataForPlot1.length}'
  const labelCountOut = 'count: ${dataForPlot2.length}'
  const labelAnyFrom = '${any && !xGroups ? 'incoming, ' : ''}'
  const labelAnyOut = '${any && !xGroups ? 'outgoing, ' : ''}'

  const showBoth = ${any && !xGroups ? 'true' : 'false'}

  const dataset1 = {
    label: (labelAnyFrom + labelRadius + labelGroups + labelCountFrom).trim(),
    pointHoverRadius: 3,
    data: ${dataString1},
    backgroundColor: '${color1}',
    yAxisID: 'y'
  }

  const dataset2 = {
    label: (labelAnyOut + labelRadius + labelGroups + labelCountOut).trim(),
    pointHoverRadius: 3,
    data: ${dataString2},
    backgroundColor: '${color2}',
    yAxisID: 'y'
  }

  const data = {
    datasets: showBoth ? [ dataset1, dataset2 ] : [dataset1]
  }

  new Chart('chart', {
    type: '${type}',
    options,
    data
  })

  </script>
</body>
</html>
`

  fs.writeFileSync('./visualize.html', myPage)
  return myPage
}

// this gets local network ip

const interfaces = os.networkInterfaces()
for (const k in interfaces) {
  for (const k2 in interfaces[k]) {
    const address = interfaces[k][k2]
    if (address.address.startsWith('192.168')) {
      networkLocation = address.address
      break
    }
  }
}

if (networkLocation === 'localhost') {
  console.log('no local network ip found')
}

// serve html on HOST:HTML_PORT
;(async () => {
  const server = http.createServer(async (req, res) => {
    // print request url info
    const pageSettings = { ...url.parse(req.url, true).query }
    console.log({ pageSettings })

    // generate response
    if (req.url === '/') {
      // redirect to page with querry items written out for easier editing
      console.log('redirecting')
      res.writeHead(302, {
        Location: '/?daysForStats=7&xGroups=0&xAxis=ppm&yAxis=earned&rAxis=&any=&out=&from=&roundDown=&type=bubble'
      })
      res.end()
    } else {
      // return the full html page from string
      console.log('rendering')
      res.setHeader('Content-Type', 'text/html')
      res.writeHead(200)
      res.end(await generatePage(pageSettings))
    }
  })
  server.listen(HTML_PORT, '0.0.0.0', () => {
    console.log(
      `Visualization is available on lnd computer at http://localhost:${HTML_PORT} (can change port by changing HTML_PORT in script)`
    )
    if (networkLocation !== '0.0.0.0') {
      console.log(`Visualization is available on local network at http://${networkLocation}:${HTML_PORT}`)
    }
    console.log(`If port is closed might need to open. On ubuntu with ufw firewall: sudo ufw allow ${HTML_PORT}`)
  })
})()
