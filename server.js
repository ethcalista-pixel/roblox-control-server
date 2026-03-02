const express = require('express');
const app = express();
app.use(express.json()); // Allows the server to read data sent by Roblox
const PORT = process.env.PORT || 3000;

// This object will hold all active Roblox servers
// Format: { "job-id-123": { lastSeen: timestamp, players: 5, shouldKick: false } }
let activeServers = {};

const API_KEY = process.env.API_KEY;

// Security Middleware
const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'];
    if (userKey && userKey === API_KEY) {
        next();
    } else {
        res.status(401).send("Unauthorized");
    }
};

// 1. ROBLOX CALLS THIS: "Registers" the server and checks if it should kick
app.post('/poll', checkApiKey, (req, res) => {
    // If jobId is empty (like in Studio), we name it "Studio-Debug"
    let jobId = req.body.jobId;
    if (!jobId || jobId === "") {
        jobId = "Studio-Debug";
    }

    const playerCount = req.body.playerCount || 0;

    // Create record if it's a new server
    if (!activeServers[jobId]) {
        activeServers[jobId] = { shouldKick: false };
    }

    // Update the server's info
    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;

    // Tell Roblox if it should kick everyone
    res.json({ kick: activeServers[jobId].shouldKick });
});

// 2. ADMIN CALLS THIS: See all active Roblox servers
app.get('/list-servers', checkApiKey, (req, res) => {
    // Clean up "dead" servers (haven't messaged in 30 seconds)
    const now = Date.now();
    for (let id in activeServers) {
        if (now - activeServers[id].lastSeen > 30000) {
            delete activeServers[id];
        }
    }
    res.json(activeServers);
});

// 3. ADMIN CALLS THIS: Trigger a kick for a SPECIFIC JobId
app.post('/kick-server', checkApiKey, (req, res) => {
    const { jobId } = req.body;
    if (activeServers[jobId]) {
        activeServers[jobId].shouldKick = true;
        res.send(`Server ${jobId} marked for disconnection.`);
    } else {
        res.status(404).send("Server not found.");
    }
});

// 4. ADMIN CALLS THIS: Reset a server so people can join again
app.post('/reset-server', checkApiKey, (req, res) => {
    const { jobId } = req.body;
    if (activeServers[jobId]) {
        activeServers[jobId].shouldKick = false;
        res.send(`Server ${jobId} reset.`);
    } else {
        res.status(404).send("Server not found.");
    }
});

app.listen(PORT, () => console.log("Server running..."));
