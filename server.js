const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'votes.json');
const ADMIN_SECRET = 'supersecret123'; // Change to your secure admin key

// Timer state for stream viewers
let streamVotingActive = false;
let streamTimerEndTime = null;

// Track unique voter tokens persistently in memory
const streamVoters = new Set();

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

function saveVotes(votes) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(votes), 'utf8');
    } catch (err) {
        console.error('Error saving vote file:', err);
    }
}

let votes = loadVotes();

app.use('/static', express.static(path.join(__dirname, 'static')));

// App Routes
app.get('/vote', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, 'results.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/stream-vote', (req, res) => {
    res.sendFile(path.join(__dirname, 'stream-vote.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'VOTE.html'));
});

// Admin Timer & Reset Endpoints
app.get('/start-timer', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    const minutes = parseFloat(req.query.minutes) || 5;
    streamVotingActive = true;
    streamTimerEndTime = Date.now() + (minutes * 60 * 1000);

    setTimeout(() => {
        streamVotingActive = false;
        streamTimerEndTime = null;
        io.emit('streamTimerStatus', { active: false });
    }, minutes * 60 * 1000);

    io.emit('streamTimerStatus', { active: true, endTime: streamTimerEndTime });
    res.send(`Stream voting window opened for ${minutes} minutes.`);
});

app.get('/stop-timer', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    streamVotingActive = false;
    streamTimerEndTime = null;
    io.emit('streamTimerStatus', { active: false });
    res.send('Stream voting window closed manually.');
});

app.get('/reset', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    votes = { gm: 0, omped: 0 };
    streamVoters.clear();
    saveVotes(votes);
    io.emit('updateVotes', votes);

    res.send('Success! Votes have been reset to 0.');
});

// Socket.io Real-Time Handler
io.on('connection', (socket) => {
    socket.emit('updateVotes', votes);
    socket.emit('streamTimerStatus', { active: streamVotingActive, endTime: streamTimerEndTime });

    // Verify if connecting client's token has already voted
    socket.on('checkVoterToken', (token) => {
        if (token && streamVoters.has(token)) {
            socket.emit('alreadyVoted');
        }
    });

    // Unrestricted in-person live event vote
    socket.on('castVote', (team) => {
        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        
        saveVotes(votes);
        io.emit('updateVotes', votes);
    });

    // Time-restricted, single-vote stream viewer vote
    socket.on('castStreamVote', ({ team, token }) => {
        if (!streamVotingActive) {
            socket.emit('voteRejected', 'Stream voting is currently closed.');
            return;
        }

        if (!token || streamVoters.has(token)) {
            socket.emit('alreadyVoted');
            socket.emit('voteRejected', 'You have already cast your stream vote from this device!');
            return;
        }

        streamVoters.add(token);

        if (team === 'gm') votes.gm++;
        if (team === 'omped') votes.omped++;
        
        saveVotes(votes);
        io.emit('updateVotes', votes);
        socket.emit('voteSuccess', 'Stream vote recorded successfully!');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
