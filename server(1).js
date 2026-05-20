const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store the last message
let lastMessage = { type: 'idle', trip: null };
// Store when the countdown started so we can calculate remaining time
let countdownStart = null;
let countdownTotal = 0;

function getCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a; color: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
      width: 100%; height: 100%; overflow: hidden;
    }
    #screen {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: table; width: 100%; height: 100%; text-align: center;
    }
    #screen-inner { display: table-cell; vertical-align: middle; padding: 40px 80px; }
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

function getRemainingSeconds() {
  if (!countdownStart) return 0;
  var elapsed = Math.floor((Date.now() - countdownStart) / 1000);
  var remaining = countdownTotal - elapsed;
  return remaining > 0 ? remaining : 0;
}

function formatTime(secs) {
  var m = Math.floor(secs / 60);
  var s = secs % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function buildPage(msg) {
  var t = msg.trip || '';
  var type = msg.type || 'idle';
  var content = '';

  if (type === 'idle') {
    content = '<div class="headline col-dim">WELCOME</div>'
            + '<div class="divider" style="background:#e87c2a;"></div>'
            + '<div class="subtext">Please check in at the counter</div>';

  } else if (type === 'checkin') {
    var remaining = getRemainingSeconds();
    var urgentClass = remaining <= 60 ? 'countdown countdown-urgent' : 'countdown';
    content = '<div class="label">CHECK-IN NOW OPEN &mdash; ' + t + ' TRIP</div>'
            + '<div class="subtext" style="margin-bottom:10px;">Safety briefing begins in</div>'
            + '<div class="' + urgentClass + '">' + formatTime(remaining) + '</div>'
            + '<div class="divider" style="background:#e87c2a;"></div>'
            + '<div class="subtext">Please check in at the counter, then<br>make your way to the <b>briefing room</b> when the timer ends.</div>';

  } else if (type === 'briefing') {
    var remaining = getRemainingSeconds();
    var urgentClass = remaining <= 60 ? 'countdown countdown-urgent' : 'countdown';
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
<meta http-equiv="refresh" content="3">
<title>Skydive Signage - Display</title>
<style>${getCSS()}</style>
</head>
<body>
<div id="brand">SKYDIVE</div>
<div id="screen"><div id="screen-inner">${content}</div></div>
</body>
</html>`;
}

// Serve the display page — dynamically generated, no JavaScript needed
app.get('/display.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(buildPage(lastMessage));
});

// Serve static files (controller.html etc)
app.use(express.static(path.join(__dirname)));

// Polling endpoint (kept for any modern browser fallback)
app.get('/state', (req, res) => {
  res.json(lastMessage);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('display', lastMessage);

  socket.on('push', (msg) => {
    lastMessage = msg;
    // Record when countdown started and how long it runs
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Skydive Signage running`);
  console.log(`   Controller: http://localhost:${PORT}/controller.html`);
  console.log(`   TV Display:  http://localhost:${PORT}/display.html\n`);
});
