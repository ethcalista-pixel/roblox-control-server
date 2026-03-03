const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let activeServers = {};
let globalChat = [];
let archivedSessions = {}; // Permanent storage
const API_KEY = process.env.API_KEY;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ROBLOX POLL
app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, flags, isStudio, packets } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) {
        activeServers[jobId] = { shouldKick: false, chats: [], isStudio, startTime: new Date().toLocaleString() };
    }

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;
    activeServers[jobId].flags = flags;

    if (packets && packets.length > 0) {
        packets.forEach(msg => {
            const entry = { t: new Date().toLocaleTimeString(), msg };
            activeServers[jobId].chats.push(entry);
            globalChat.unshift({ id: jobId, ...entry });
        });
        if (activeServers[jobId].chats.length > 100) activeServers[jobId].chats.shift();
        if (globalChat.length > 100) globalChat.pop();
    }
    res.json({ kick: activeServers[jobId].shouldKick });
});

// ADMIN: Fetch all data
app.get('/list-servers', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    const now = Date.now();
    for (let id in activeServers) {
        if (now - activeServers[id].lastSeen > 20000) delete activeServers[id];
    }
    res.json({ servers: activeServers, global: globalChat, archives: archivedSessions });
});

// ADMIN: Archive a session
app.post('/archive-session', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    const { jobId, customName } = req.body;
    if (activeServers[jobId]) {
        const id = "ARC-" + Date.now();
        archivedSessions[id] = {
            name: customName || "Unnamed Archive",
            jobId: jobId,
            chats: [...activeServers[jobId].chats],
            date: new Date().toLocaleString()
        };
        res.send("Archived");
    } else { res.status(404).send("Not Active"); }
});

// ADMIN: Delete Archive
app.post('/delete-archive', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    delete archivedSessions[req.body.archiveId];
    res.send("Deleted");
});

app.post('/kick-server', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    if (activeServers[req.body.jobId]) activeServers[req.body.jobId].shouldKick = true;
    res.send("Done");
});

app.listen(PORT);
