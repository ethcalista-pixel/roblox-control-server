// Replace your /poll endpoint in server.js with this:
app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, isStudio, packets } = req.body;
    if (!jobId || jobId === "") jobId = "Unknown";

    if (!activeServers[jobId]) {
        activeServers[jobId] = { shouldKick: false, chats: [], isStudio, startTime: new Date().toLocaleString() };
    }

    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;

    if (packets && packets.length > 0) {
        packets.forEach(msg => {
            const entry = { t: new Date().toLocaleTimeString(), msg };
            activeServers[jobId].chats.push(entry);
            
            // This line ensures the Global Feed knows which ID sent the message
            globalChat.unshift({ jobId: jobId, ...entry });
        });
        if (activeServers[jobId].chats.length > 100) activeServers[jobId].chats.shift();
        if (globalChat.length > 100) globalChat.pop();
    }
    res.json({ kick: activeServers[jobId].shouldKick });
});
