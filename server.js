const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ── State ────────────────────────────────────────────────────────────────────
let lastMessage    = { type: 'idle', trip: null };
let countdownStart = null;
let countdownTotal = 0;
let scheduleEnabled = false;

// ── Trip schedule (busy season) ──────────────────────────────────────────────
// Every 30 mins, 6:00am → 3:30pm  [hour, minute, label]
const TRIPS = [
  [ 6,  0, '6:00am'],
  [ 6, 30, '6:30am'],
  [ 7,  0, '7:00am'],
  [ 7, 30, '7:30am'],
  [ 8,  0, '8:00am'],
  [ 8, 30, '8:30am'],
  [ 9,  0, '9:00am'],
  [ 9, 30, '9:30am'],
  [10,  0, '10:00am'],
  [10, 30, '10:30am'],
  [11,  0, '11:00am'],
  [11, 30, '11:30am'],
  [12,  0, '12:00pm'],
  [12, 30, '12:30pm'],
  [13,  0, '1:00pm'],
  [13, 30, '1:30pm'],
  [14,  0, '2:00pm'],
  [14, 30, '2:30pm'],
  [15,  0, '3:00pm'],
  [15, 30, '3:30pm'],
];

// ── Scheduler ────────────────────────────────────────────────────────────────
function pushMessage(msg) {
  lastMessage = msg;
  if (msg.type === 'checkin') {
    countdownStart = Date.now();
    countdownTotal = 30 * 60;
  } else if (msg.type === 'briefing') {
    countdownStart = Date.now();
    countdownTotal = 10 * 60;
  } else {
    countdownStart = null;
    countdownTotal = 0;
  }
  io.emit('display', msg);
  console.log('Auto-push:', msg.type, msg.trip);
}

function runScheduler() {
  if (!scheduleEnabled) return;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
  const h = now.getHours();
  const m = now.getMinutes();

  for (const [tripH, tripM, tripLabel] of TRIPS) {
    // Check-in: 30 mins before trip
    let ciH = tripM >= 30 ? tripH : tripH - 1;
    let ciM = tripM >= 30 ? tripM - 30 : tripM + 30;
    if (h === ciH && m === ciM) {
      pushMessage({ type: 'checkin', trip: tripLabel, briefingMins: 30, handicam: true, thirdcam: false });
    }
    // Briefing: at trip time
    if (h === tripH && m === tripM) {
      pushMessage({ type: 'briefing', trip: tripLabel });
    }
    // Final checks: 10 mins after trip
    let fcH = (tripM + 10) >= 60 ? tripH + 1 : tripH;
    let fcM = (tripM + 10) % 60;
    if (h === fcH && m === fcM) {
      pushMessage({ type: 'finalcheck', trip: tripLabel });
    }
  }
}

// Check every 30 seconds (fires within 30s of the target minute)
setInterval(runScheduler, 30000);

// ── Schedule endpoints ───────────────────────────────────────────────────────
app.get('/schedule/:state', (req, res) => {
  scheduleEnabled = req.params.state === 'on';
  console.log('Schedule:', scheduleEnabled ? 'ON' : 'OFF');
  res.json({ scheduleEnabled });
});

app.get('/schedule-status', (req, res) => {
  res.json({ scheduleEnabled });
});

// ── CSS ──────────────────────────────────────────────────────────────────────
function getCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { background: #0a0a0a !important; }
    body {
      background: #0a0a0a !important; color: #ffffff !important;
      font-family: Arial, Helvetica, sans-serif;
      width: 100%; height: 100%; overflow: hidden;
    }
    #screen {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: table; width: 100%; height: 100%; text-align: center;
    }
    #screen-inner { display: table-cell; vertical-align: middle; padding: 20px 60px; }
    .label { font-size: 22px; letter-spacing: 6px; text-transform: uppercase; color: #888888; margin-bottom: 16px; }
    .headline { font-size: 100px; font-weight: bold; line-height: 1; margin-bottom: 24px; }
    .col-orange { color: #e87c2a; }
    .col-blue   { color: #4a9eff; }
    .col-green  { color: #3dd68c; }
    .col-red    { color: #f87171; }
    .col-dim    { color: #333333; }
    .subtext { font-size: 28px; color: #aaaaaa; line-height: 1.6; }
    .subtext b { color: #ffffff; }
    .countdown { font-size: 160px; font-weight: bold; color: #ffd166; line-height: 1; margin: 10px 0 16px; }
    .countdown-urgent { color: #e87c2a; }
    .divider { width: 80px; height: 4px; margin: 20px auto; }
    .transport-row { display: table; margin: 24px auto 0; border-spacing: 24px 0; }
    .transport-cell { display: table-cell; padding: 0 12px; }
    .transport-card { display: inline-block; padding: 24px 60px; border: 3px solid; font-size: 36px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
    .card-bus { border-color: #4a9eff; color: #4a9eff; }
    .card-car { border-color: #3dd68c; color: #3dd68c; }
    #brand { position: fixed; top: 20px; left: 30px; font-size: 18px; letter-spacing: 4px; text-transform: uppercase; color: #333333; }
  `;
}

// ── Display builder ──────────────────────────────────────────────────────────
function getRemainingSeconds() {
  if (!countdownStart) return 0;
  const elapsed = Math.floor((Date.now() - countdownStart) / 1000);
  const remaining = countdownTotal - elapsed;
  return remaining > 0 ? remaining : 0;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function buildPage(msg) {
  const t    = msg.trip || '';
  const type = msg.type || 'idle';
  let content = '';

  if (type === 'idle') {
    content = '<div class="headline col-dim">WELCOME</div>'
            + '<div class="divider" style="background:#e87c2a;"></div>'
            + '<div class="subtext">Please check in at the counter</div>';

  } else if (type === 'checkin') {
    const remaining   = getRemainingSeconds();
    const urgentClass = remaining <= 60 ? 'countdown countdown-urgent' : 'countdown';

    // Camera cards
    const thirdcamBorder = msg.thirdcam ? '#4a9eff' : '#555555';
    const thirdcamColor  = msg.thirdcam ? '#4a9eff' : '#555555';
    const thirdcamStatus = msg.thirdcam ? 'Available' : 'Not available';
    const thirdcamCross  = msg.thirdcam ? '' :
      '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;">'
    + '<div style="position:relative;width:50px;height:50px;">'
    + '<div style="position:absolute;top:50%;left:0;right:0;height:5px;background:#e53e3e;transform:rotate(45deg);margin-top:-2px;"></div>'
    + '<div style="position:absolute;top:50%;left:0;right:0;height:5px;background:#e53e3e;transform:rotate(-45deg);margin-top:-2px;"></div>'
    + '</div></div>';

    const cameraHtml =
      '<div style="margin-top:20px;display:table;margin-left:auto;margin-right:auto;border-spacing:16px 0;">'
    + '<div style="display:table-row;">'
    + '<div style="display:table-cell;padding:0 10px;">'
    + '<div style="border:2px solid #e87c2a;padding:14px 28px;text-align:center;">'
    + '<div style="font-size:28px;margin-bottom:6px;">&#127909;</div>'
    + '<div style="font-size:18px;font-weight:bold;color:#e87c2a;letter-spacing:1px;">HANDICAM</div>'
    + '<div style="font-size:13px;color:#aaaaaa;margin-top:4px;">Available</div>'
    + '</div></div>'
    + '<div style="display:table-cell;padding:0 10px;">'
    + '<div style="border:2px solid ' + thirdcamBorder + ';padding:14px 28px;text-align:center;position:relative;">'
    + '<div style="font-size:28px;margin-bottom:6px;opacity:' + (msg.thirdcam ? '1' : '0.3') + ';">&#128247;</div>'
    + thirdcamCross
    + '<div style="font-size:18px;font-weight:bold;color:' + thirdcamColor + ';letter-spacing:1px;">3RD PARTY CAM</div>'
    + '<div style="font-size:13px;color:' + (msg.thirdcam ? '#aaaaaa' : '#e53e3e') + ';margin-top:4px;">' + thirdcamStatus + '</div>'
    + '</div></div>'
    + '</div></div>';

    content = '<div class="label">CHECK-IN NOW OPEN &mdash; ' + t + ' TRIP</div>'
            + '<div class="subtext" style="margin-bottom:10px;">Safety briefing begins in</div>'
            + '<div class="' + urgentClass + '">' + formatTime(remaining) + '</div>'
            + '<div class="divider" style="background:#e87c2a;"></div>'
            + '<div class="subtext">Please check in at the counter, then make your way to the <b>briefing room</b> when the timer ends.</div>'
            + cameraHtml;

  } else if (type === 'briefing') {
    const remaining   = getRemainingSeconds();
    const urgentClass = remaining <= 60 ? 'countdown countdown-urgent' : 'countdown';
    content = '<div class="label">SAFETY BRIEFING</div>'
            + '<div class="headline col-blue">' + t + ' GROUP</div>'
            + '<div class="' + urgentClass + '">' + formatTime(remaining) + '</div>'
            + '<div class="subtext">Please make your way to the <b>briefing room</b> now.</div>';

  } else if (type === 'finalcheck') {
    content = '<div class="label">BRIEFING COMPLETE</div>'
            + '<div class="headline col-green">' + t + ' GROUP</div>'
            + '<div class="divider" style="background:#3dd68c;"></div>'
            + '<div class="subtext" style="margin-bottom:20px;">Please come to the <b>counter</b> for your final checks.<br>How are you getting to the dropzone?</div>'
            + '<div class="transport-row">'
            + '<div class="transport-cell"><div class="transport-card card-bus">BUS</div></div>'
            + '<div class="transport-cell"><div class="transport-card card-car">DRIVING MYSELF</div></div>'
            + '</div>';

  } else if (type === 'weather') {
    content = '<div class="label col-red">TRIP CANCELLED</div>'
            + '<div class="headline col-red">' + t + ' TRIP</div>'
            + '<div class="divider" style="background:#f87171;"></div>'
            + '<div class="subtext">This trip has been <b>cancelled due to weather</b>.<br>Please speak to our staff at the counter<br>to reschedule or arrange a refund.</div>';
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="5">
<title>Skydive Signage - Display</title>
<style>${getCSS()}</style>
</head>
<body>
<div id="brand">SKYDIVE</div>
<div id="screen"><div id="screen-inner">${content}</div></div>
<script>
function tick(){var n=new Date(),h=String(n.getHours()).padStart(2,'0'),m=String(n.getMinutes()).padStart(2,'0'),s=String(n.getSeconds()).padStart(2,'0'),el=document.getElementById('clock');if(el)el.innerHTML=h+':'+m+':'+s;}
setInterval(tick,1000);tick();
</script>
</body>
</html>`;
}

// ── Routes ───────────────────────────────────────────────────────────────────
app.get('/display.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(buildPage(lastMessage));
});

app.use(express.static(path.join(__dirname)));

app.get('/state', (req, res) => res.json(lastMessage));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('display', lastMessage);

  socket.on('push', (msg) => {
    lastMessage = msg;
    if (msg.type === 'checkin') {
      countdownStart = Date.now();
      countdownTotal = (msg.briefingMins || 30) * 60;
    } else if (msg.type === 'briefing') {
      countdownStart = Date.now();
      countdownTotal = 10 * 60;
    } else {
      countdownStart = null;
      countdownTotal = 0;
    }
    io.emit('display', msg);
    console.log('Push:', msg);
  });

  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Skydive Signage running`);
  console.log(`   Controller: http://localhost:${PORT}/controller.html`);
  console.log(`   TV Display:  http://localhost:${PORT}/display.html\n`);
});
