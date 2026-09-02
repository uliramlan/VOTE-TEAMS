const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Path to store votes persistently on the container's disk
const DATA_FILE = path.join(__dirname, 'votes.json');
const ADMIN_SECRET = 'supersecret123'; // Change this to your own password!

// Load existing votes from file or default to zero
function loadVotes() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error reading vote file:', err);
    }
    return { gm: 0, omped: 0 };
}

// Save votes to file
function saveVotes(votes) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(votes), 'utf8');
    } catch (err) {
        console.error('Error saving vote file:', err);
    }
}

let votes = loadVotes();

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

// Clean routes
app.get('/vote', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'results.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

// Admin reset endpoint
app.get('/reset', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    votes = { gm: 0, omped: 0 };
    saveVotes(votes);
    io.emit('updateVotes', votes); // Instantly broadcast reset to vMix and users

    res.send('Success! Votes have been reset to 0.');
});

io.on('connection', (socket) => {
    socket.emit('updateVotes', votes);

    socket.on('castVote', (team) => {
        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        
        saveVotes(votes); // Save changes to disk instantly
        io.emit('updateVotes', votes);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
