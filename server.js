const express = require('express');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

let sessionRegistry = {};
const AUTH_TOKEN = process.env.API_KEY; // We still use your secret key

// Renamed for discretion: /v1/sync instead of /poll
app.post('/v1/sync', (req, res) => {
    const token = req.headers['x-api-token']; // Renamed header
    if (token !== AUTH_TOKEN) return res.status(401).send();

    const { sid, pCount } = req.body; // Using short names to be discrete
    if (!sid) return res.status(400).send();

    if (!sessionRegistry[sid]) {
        sessionRegistry[sid] = { active: true, terminate: false };
    }

    sessionRegistry[sid].lastUpdate = Date.now();
    sessionRegistry[sid].players = pCount;

    // "u" stands for update (true means kick)
    res.json({ u: sessionRegistry[sid].terminate });
});

// Admin: List all sessions
app.get('/admin/inspect', (req, res) => {
    if (req.headers['x-api-token'] !== AUTH_TOKEN) return res.status(401).send();
    res.json(sessionRegistry);
});

// Admin: Trigger "Update" (Kick)
app.post('/admin/set-state', (req, res) => {
    if (req.headers['x-api-token'] !== AUTH_TOKEN) return res.status(401).send();
    const { sid, state } = req.body;
    if (sessionRegistry[sid]) {
        sessionRegistry[sid].terminate = state;
        res.send("State updated.");
    } else {
        res.status(404).send("Session not found.");
    }
});

app.listen(PORT, () => console.log("System initialized."));
