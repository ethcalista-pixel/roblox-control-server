const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let activeServers = {};
const API_KEY = process.env.API_KEY;

// Serve the dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// The Roblox Poll endpoint
app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, flags } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) activeServers[jobId] = { shouldKick: false };

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;
    activeServers[jobId].flags = flags; // Store if keywords were found

    res.json({ kick: activeServers[jobId].shouldKick });
});

// Admin endpoints
app.get('/list-servers', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    res.json(activeServers);
});

app.post('/kick-server', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    if(activeServers[req.body.jobId]) activeServers[req.body.jobId].shouldKick = true;
    res.send("Done");
});

app.post('/reset-server', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    if(activeServers[req.body.jobId]) activeServers[req.body.jobId].shouldKick = false;
    res.send("Done");
});

app.listen(PORT);
