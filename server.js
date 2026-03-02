const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let activeServers = {};
const SECRET_PATH = process.env.API_KEY; // Your "password" is now part of the URL

// 1. DISCRETE POLL: The key is now in the URL path (e.g., /poll/YourSecretKey)
app.post(`/poll/${SECRET_PATH}`, (req, res) => {
    let { jobId, playerCount } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) {
        activeServers[jobId] = { shouldKick: false };
    }

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;

    res.json({ kick: activeServers[jobId].shouldKick });
});

// ADMIN ENDPOINTS (Keep these the same for ReqBin)
app.get('/list-servers', (req, res) => {
    if (req.headers['x-api-key'] !== SECRET_PATH) return res.status(401).send();
    res.json(activeServers);
});

app.post('/kick-server', (req, res) => {
    if (req.headers['x-api-key'] !== SECRET_PATH) return res.status(401).send();
    activeServers[req.body.jobId].shouldKick = true;
    res.send("Marked");
});

app.listen(PORT);
