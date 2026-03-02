const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// This variable stores whether players should be kicked.
// It resets to false when the server starts.
let shouldDisconnect = false;

// Middleware: This checks every request for your secret API Key
const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'];
    // It compares the header key to a secret we will set in Render
    if (userKey && userKey === process.env.API_KEY) {
        next(); // Key is correct, proceed!
    } else {
        res.status(401).send("Unauthorized: Invalid API Key");
    }
};

// ENDPOINT 1: Trigger the disconnect (You call this from a tool like Postman)
app.post('/disconnect', checkApiKey, (req, res) => {
    shouldDisconnect = true;
    console.log("Disconnect signal RECEIVED.");
    res.send("Signal sent: Roblox servers will now disconnect players.");
});

// ENDPOINT 2: Reset the signal (Call this to allow players back in)
app.post('/reset', checkApiKey, (req, res) => {
    shouldDisconnect = false;
    console.log("System RESET. Players can join again.");
    res.send("System reset. Players will no longer be kicked.");
});

// ENDPOINT 3: Check status (Roblox calls this every few seconds)
app.get('/status', checkApiKey, (req, res) => {
    res.json({ disconnect: shouldDisconnect });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});