const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'votes.json');
const ADMIN_SECRET = 'satesirat12!'; // Change this password to your own secure key

// Timer configuration state
let votingActive = false;
let timerEndTime = null;

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

// Serve static assets (such as team logos in 'static/logo team/')
app.use('/static', express.static(path.join(__dirname, 'static')));

// Clean HTML Route Mappings
app.get('/vote', (req, res) => {
    res.sendFile(path.join(__dirname, 'viewers vote.html'));
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'results.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

// Admin endpoint to start voting window for X minutes
app.get('/start-timer', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    const minutes = parseFloat(req.query.minutes) || 5;
    votingActive = true;
    timerEndTime = Date.now() + (minutes * 60 * 1000);

    // Automatically close voting when time runs out
    setTimeout(() => {
        votingActive = false;
        timerEndTime = null;
        io.emit('timerStatus', { active: false });
    }, minutes * 60 * 1000);

    io.emit('timerStatus', { active: true, endTime: timerEndTime });
    res.send(`Voting window opened successfully for ${minutes} minutes.`);
});

// Admin endpoint to manually close/stop voting early
app.get('/stop-timer', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    votingActive = false;
    timerEndTime = null;
    io.emit('timerStatus', { active: false });
    res.send('Voting window closed manually.');
});

// Admin endpoint to reset scoreboards
app.get('/reset', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    votes = { gm: 0, omped: 0 };
    saveVotes(votes);
    io.emit('updateVotes', votes);

    res.send('Success! Votes have been reset to 0.');
});

// Real-time Socket.io communication
io.on('connection', (socket) => {
    socket.emit('updateVotes', votes);
    socket.emit('timerStatus', { active: votingActive, endTime: timerEndTime });

    socket.on('castVote', (team) => {
        // Enforce timer restriction on the server side
        if (!votingActive) {
            socket.emit('voteRejected', 'Voting is currently closed.');
            return;
        }

        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        
        saveVotes(votes);
        io.emit('updateVotes', votes);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
