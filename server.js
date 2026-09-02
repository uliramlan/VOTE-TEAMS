const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the static HTML and images from the 'public' folder
app.use(express.static('public'));

// Store votes in memory
let votes = { gm: 0, omped: 0 };

io.on('connection', (socket) => {
    // Send current vote count to anyone who connects (e.g., vMix browser)
    socket.emit('updateVotes', votes);

    // Listen for incoming votes
    socket.on('castVote', (team) => {
        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        
        // Broadcast the new totals to everyone instantly
        io.emit('updateVotes', votes);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));