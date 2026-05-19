const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (controller.html and display.html) from this folder
app.use(express.static(path.join(__dirname)));

// Store the last message so a newly-opened display catches up immediately
let lastMessage = { type: 'idle', trip: null };

// Polling endpoint for TV browsers that can't run Socket.io
app.get('/state', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(lastMessage);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send the current display state to any new connection
  socket.emit('display', lastMessage);

  // Staff controller pushes a message → broadcast to all displays
  socket.on('push', (msg) => {
    lastMessage = msg;
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
