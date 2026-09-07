const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs').promises; // Non-blocking async filesystem operations

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

const DATA_FILE = path.join(__dirname, 'votes.json');
const ADMIN_SECRET = 'supersecret123'; // Matches existing secret key

let streamVotingActive = false;
let streamTimerEndTime = null;
const streamVoters = new Set();
let votes = { red: 0, blue: 0 };
let isDirty = false; // Flag to check if votes need to be written to disk

// Load initial votes asynchronously at startup
async function initVotes() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        votes = JSON.parse(data);
    } catch (err) {
        votes = { red: 0, blue: 0 };
    }
}
initVotes();

// Periodic background file saver: Flushes RAM state to disk every 5 seconds
// Eliminates sync thread freezing (fs.writeFileSync) entirely
setInterval(async () => {
    if (!isDirty) return;
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(votes), 'utf8');
        isDirty = false;
    } catch (err) {
        console.error('Async disk write error:', err);
    }
}, 5000);

// Force browser caching for static assets (logos, css) to reduce server traffic
app.use('/static', express.static(path.join(__dirname, 'static'), {
    maxAge: '1d',
    immutable: true
}));

app.get('/vote', (req, res) => res.sendFile(path.join(__dirname, 'VOTE.html')));
app.get('/results', (req, res) => res.sendFile(path.join(__dirname, 'results.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/stream-vote', (req, res) => res.sendFile(path.join(__dirname, 'stream-vote.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'VOTE.html')));

app.get('/start-timer', (req, res) => {
    if (req.query.key !== ADMIN_SECRET) {
        return res.status(403).send('Unauthorized: Invalid secret key.');
    }

    const minutes = parseFloat(req.query.minutes) || 5;
    streamVotingActive = true;
    streamTimerEndTime = Date.now() + (minutes * 60 * 1000);
    
    streamVoters.clear();

    setTimeout(() => {
        streamVotingActive = false;
        streamTimerEndTime = null;
        io.emit('streamTimerStatus', { active: false });
    }, minutes * 60 * 1000);

    io.emit('sessionReset');
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

    votes = { red: 0, blue: 0 };
    streamVoters.clear();
    isDirty = true;
    
    io.emit('updateVotes', votes);
    io.emit('sessionReset');

    res.send('Success! Votes have been reset to 0 and all voters unlocked.');
});

io.on('connection', (socket) => {
    socket.emit('updateVotes', votes);
    socket.emit('streamTimerStatus', { active: streamVotingActive, endTime: streamTimerEndTime });

    socket.on('checkVoterToken', (token) => {
        if (token && streamVoters.has(token)) {
            socket.emit('alreadyVoted');
        }
    });

    socket.on('castVote', (team) => {
        if (team === 'red') votes.red++;
        if (team === 'blue') votes.blue++;
        
        isDirty = true;
        io.emit('updateVotes', votes);
    });

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

        if (team === 'red') votes.red++;
        if (team === 'blue') votes.blue++;
        
        isDirty = true;
        io.emit('updateVotes', votes);
        socket.emit('voteSuccess', 'Stream vote recorded successfully!');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
