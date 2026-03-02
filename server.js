const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let activeServers = {};
const API_KEY = process.env.API_KEY;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ROBLOX POLL
app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, flags } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) activeServers[jobId] = { shouldKick: false };

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;
    activeServers[jobId].flags = flags;

    res.json({ kick: activeServers[jobId].shouldKick });
});

// ADMIN: List Servers (with automatic cleanup for dead ones)
app.get('/list-servers', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    
    const now = Date.now();
    for (let id in activeServers) {
        // If server hasn't checked in for 20 seconds, it's dead, remove it.
        if (now - activeServers[id].lastSeen > 20000) {
            delete activeServers[id];
        }
    }
    res.json(activeServers);
});

// ADMIN: Terminate
app.post('/kick-server', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    const id = req.body.jobId;
    
    if (activeServers[id]) {
        activeServers[id].shouldKick = true;
        
        // After 5 seconds, remove it from the list so it disappears from the GUI
        setTimeout(() => {
            delete activeServers[id];
        }, 5000);
        
        res.send("Termination Signal Sent");
    } else {
        res.status(404).send("Not found");
    }
});

app.listen(PORT);
