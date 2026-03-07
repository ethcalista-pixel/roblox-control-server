app.post(`/poll/${API_KEY}`, (req, res) => {
    let { jobId, playerCount, isStudio, packets } = req.body;
    
    // If jobId is missing, don't process it (prevents "Unknown" duplicates)
    if (!jobId || jobId === "") return res.status(400).send("No JobId");

    // DEDUPLICATION: If this server already exists, we just update it
    if (!activeServers[jobId]) {
        activeServers[jobId] = { 
            shouldKick: false, 
            chats: [], 
            isStudio, 
            startTime: new Date().toLocaleString() 
        };
        console.log(`New session registered: ${jobId}`);
    }

    // Update existing data
    activeServers[jobId].lastSeen = Date.now();
    activeServers[jobId].playerCount = playerCount;

    if (packets && packets.length > 0) {
        packets.forEach(msg => {
            const entry = { t: new Date().toLocaleTimeString(), msg };
            activeServers[jobId].chats.push(entry);
            globalChat.unshift({ jobId: jobId, ...entry });
        });
        
        // Trim history to prevent memory bloat
        if (activeServers[jobId].chats.length > 100) activeServers[jobId].chats.shift();
        if (globalChat.length > 100) globalChat.pop();
    }

    res.json({ kick: activeServers[jobId].shouldKick });
});
