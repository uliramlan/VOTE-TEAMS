const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Vote state
let votes = {
  gm: 0,
  omped: 0
};

// Routes
app.get('/vote', (req, res) => {
  res.sendFile(path.join(__dirname, 'VOTE.html'));
});

app.get('/results', (req, res) => {
  res.sendFile(path.join(__dirname, 'results.html'));
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Send current votes to new client
  socket.emit('updateVotes', votes);

  // Listen for votes
  socket.on('castVote', (teamKey) => {
    if (teamKey === 'gm' || teamKey === 'omped') {
      votes[teamKey]++;
      // Broadcast updated votes to all connected clients
      io.emit('updateVotes', votes);
      console.log(`Vote cast for ${teamKey}. Current votes:`, votes);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit /vote to vote`);
  console.log(`Visit /results to see live results`);
});

