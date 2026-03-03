const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Internal memory storage
let activeServers = {};
let globalChat = [];
let archivedSessions = {};
const API_KEY = process.env.API_KEY;

// Serve the Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// 1. ROBLOX POLL & CHAT RECEIVER
app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, isStudio, packets } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) {
        activeServers[jobId] = { 
            shouldKick: false, 
            chats: [], 
            isStudio, 
            startTime: new Date().toLocaleString() 
        };
    }

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;

    if (packets && packets.length > 0) {
        packets.forEach(msg => {
            const entry = { t: new Date().toLocaleTimeString(), msg };
            activeServers[jobId].chats.push(entry);
            // Links the message to the jobId for the clickable tags
            globalChat.unshift({ jobId: jobId, ...entry });
        });
        if (activeServers[jobId].chats.length > 100) activeServers[jobId].chats.shift();
        if (globalChat.length > 100) globalChat.pop();
    }

    res.json({ kick: activeServers[jobId].shouldKick });
});

// 2. ADMIN: List all data for Dashboard
app.get('/list-servers', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    
    const now = Date.now();
    for (let id in activeServers) {
        if (now - activeServers[id].lastSeen > 20000) delete activeServers[id];
    }
    
    res.json({ servers: activeServers, global: globalChat, archives: archivedSessions });
});

// 3. ADMIN: Move logs to Vault
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
    } else { res.status(404).send("Server Not Active"); }
});

// 4. ADMIN: Delete archived logs
app.post('/delete-archive', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    delete archivedSessions[req.body.archiveId];
    res.send("Deleted");
});

// 5. ADMIN: Terminate instance
app.post('/kick-server', (req, res) => {
    if (req.headers['x-api-key'] !== API_KEY) return res.status(401).send();
    if (activeServers[req.body.jobId]) activeServers[req.body.jobId].shouldKick = true;
    res.send("Done");
});

app.listen(PORT, () => console.log(`Nexus System Online on port ${PORT}`));
