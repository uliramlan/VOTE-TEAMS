const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static assets (like your images in 'static/logo team/')
app.use('/static', express.static(path.join(__dirname, 'static')));

// Explicit routes for your HTML files
app.get('/VOTE.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

app.get('/results.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'results.html'));
});

// Optional: Redirect root to vote page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

let votes = { gm: 0, omped: 0 };

io.on('connection', (socket) => {
    socket.emit('updateVotes', votes);

    socket.on('castVote', (team) => {
        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        io.emit('updateVotes', votes);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
