import { createServer } from "node:http";
import { join } from "node:path";
import { hostname } from "node:os";
import wisp from "wisp-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import axios from 'axios';
import path from "path";
import fs from "fs";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const SESSION_DATA_FILE = "session_data.json";
const publicPath = join(process.cwd(), "static");
const uvPath = join(process.cwd(), "uv");
const PASSWORD = "CB8FHPbsWd$4J2#!@7^!ta2bvrCWNETh#&JCmKT^DTxaZkWLKB5a3h&ePgeSj3@^^X6C7uqFH5gTRL5R@yeiQhmKURmEEMQAUbHcVUZ6W%5ViLd*6$45T66^!m4H!C5h";
const REFERRAL_DATA_FILE = "referrals.json";
const PORN_BLOCK_FILE = "blocklists/porn-block.txt";
const ACCOUNT_DATA_FILE = 'account_data.json';
const REFERRALS_DATA_FILE = 'referrals_data.json';
let pornDomains = new Set();
let xpnonce = "";
let sessions = {};
let timeouts = {};
let accounts = {};
let referrals = {};

if (fs.existsSync(ACCOUNT_DATA_FILE)) {
    try {
        const data = fs.readFileSync(ACCOUNT_DATA_FILE, 'utf-8');
        accounts = data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Error reading account_data.json:", error);
        accounts = {};
    }
} else {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify({}, null, 2));
}

function saveAccounts() {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accounts, null, 2));
}

function formatTime(minutes) {
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
    const years = Math.floor(months / 12);
    return `${years} year${years !== 1 ? 's' : ''}`;
}

if (fs.existsSync(REFERRALS_DATA_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(REFERRALS_DATA_FILE, 'utf-8'));
        for (const username in data) {
            referrals[username] = {
                referralLinks: data[username].referralLinks || [],
                referredUsers: new Set(Array.isArray(data[username].referredUsers) ? data[username].referredUsers : []),
                perkStatus: data[username].perkStatus || 0
            };
        }
    } catch (error) {
        console.error("Error loading referral data:", error);
    }
}

function saveData() {
    const dataToSave = {};
    for (const username in referrals) {
        dataToSave[username] = {
            referralLinks: referrals[username].referralLinks,
            referredUsers: Array.from(referrals[username].referredUsers), // Convert Set to Array
            perkStatus: referrals[username].perkStatus
        };
    }
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(dataToSave, null, 2));
}


if (fs.existsSync(PORN_BLOCK_FILE)) {
    try {
        const data = fs.readFileSync(PORN_BLOCK_FILE, "utf-8").split("\n");
        pornDomains = new Set(data.map(domain => domain.trim())); // Store in a Set for fast lookup
        console.log(`Loaded ${pornDomains.size} porn domains.`);
    } catch (error) {
        console.error("Error reading porn-block.txt:", error);
    }
} else {
    console.warn("porn-block.txt not found!");
}

// Load existing sessions
if (fs.existsSync(SESSION_DATA_FILE)) {
    try {
        const data = fs.readFileSync(SESSION_DATA_FILE, "utf-8");
        sessions = data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Error reading session_data.json:", error);
        sessions = {};
    }
} else {
    fs.writeFileSync(SESSION_DATA_FILE, JSON.stringify({}, null, 2));
}

// Save sessions (excluding timeouts)
function saveSessions() {
    fs.writeFileSync(SESSION_DATA_FILE, JSON.stringify(sessions, null, 2));
}

// Ensure session exists
function ensureSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = { logs: [], lastOnline: 0, status: "Offline", banned: false };
    }
}

// Convert time difference to human-readable format
function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} months ago`;
    const years = Math.floor(months / 12);
    return `${years} years ago`;
}
const fastify = Fastify({
    serverFactory: (handler) => {
        return createServer()
            .on("request", (req, res) => {
                handler(req, res);
            })
            .on("upgrade", (req, socket, head) => {
                if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
                else socket.end();
            });
    },
});
fastify.register(fastifyCookie);
fastify.register(fastifyStatic, {
    root: publicPath,
    decorateReply: true,
});
fastify.register(fastifyStatic, {
    root: uvPath,
    prefix: "/staff/",
    decorateReply: false,
});
fastify.register(fastifyStatic, {
    root: epoxyPath,
    prefix: "/epoxy/",
    decorateReply: false,
});
fastify.register(fastifyStatic, {
    root: baremuxPath,
    prefix: "/baremux/",
    decorateReply: false,
});
fastify.post("/ban/:id", async (request, reply) => {
    const { id } = request.params;
    const { message, duration } = request.body; // Get the ban message and duration (optional)
    
    ensureSession(id);

    if (!sessions[id].banned) {
        sessions[id].banMessage = message || "You have been banned."; // Store message
        sessions[id].banned = true;
        
        if (duration) {
            const expiresAt = Date.now() + duration * 60000; // Convert minutes to milliseconds
            sessions[id].banExpires = expiresAt;
            
            // Schedule automatic unban
            setTimeout(() => {
                sessions[id].banned = false;
                delete sessions[id].banExpires;
                delete sessions[id].banMessage;
                saveSessions();
            }, duration * 60000);
        } else {
            delete sessions[id].banExpires;
        }
    } else {
        sessions[id].banned = false;
        delete sessions[id].banExpires;
        delete sessions[id].banMessage;
    }
    
    saveSessions();
    reply.send({ status: "ok", banned: sessions[id].banned });
});


// New route to get the ban message
fastify.get("/ban/message/:id", async (request, reply) => {
    const { id } = request.params;
    ensureSession(id);

    let remainingTime = null;
    if (sessions[id].banExpires) {
        const timeLeft = sessions[id].banExpires - Date.now();
        if (timeLeft > 0) {
            remainingTime = formatTime(Math.ceil(timeLeft / 60000)); // Convert ms to formatted time
        } else {
            // Auto-remove expired ban
            sessions[id].banned = false;
            delete sessions[id].banExpires;
            delete sessions[id].banMessage;
            saveSessions();
        }
    }

    reply.send({ 
        message: sessions[id].banMessage || "You have been banned.", 
        duration: remainingTime || "Unlimited"
    });
});



fastify.post("/login", async (request, reply) => {
    const { password } = request.body;
    if (password === PASSWORD) {
        reply
            .setCookie("admin_session", "true", { path: "/admin", httpOnly: true }) // ✅ Set cookie properly
            .send({ success: true });
    } else {
        reply.send({ success: false });
    }
});
fastify.post("/logout", async (request, reply) => {
    reply
        .clearCookie("admin_session", { path: "/admin" })
        .send({ success: true });
});

// Middleware to check authentication
fastify.addHook("preHandler", async (request, reply) => {
    const allowedRoutes = ["/admin/login", "/login.html", "/login"]; // Allow access to login page
    if (!allowedRoutes.includes(request.url) && request.url.startsWith("/admin")) {
        const isLoggedIn = request.cookies?.admin_session === "true";

        if (!isLoggedIn) {
            return reply.redirect("/admin/login"); // Redirect only if not logged in
        }
    }
});


fastify.post("/log", async (request, reply) => {
    const sessionId = request.headers["x-session-id"] || "MISSING_SESSION_ID";
    const { url } = request.body;
    const timestamp = Date.now();

    if (!url) return reply.status(400).send({ error: "Missing URL" });

    ensureSession(sessionId);
    if (sessions[sessionId].banned) {
        return reply.send({ status: "banned" });
    }

    sessions[sessionId].logs.push({ url, timestamp });
    saveSessions();

    reply.send({ status: "ok" });
});

// Heartbeat tracking
fastify.post("/heartbeat", async (request, reply) => {
    const sessionId = request.headers["x-session-id"] || "MISSING_SESSION_ID";
    const timestamp = Date.now();

    ensureSession(sessionId);
    if (sessions[sessionId].banned) {
        return reply.send({ status: "banned" });
    }

    sessions[sessionId].lastOnline = timestamp;
    sessions[sessionId].status = "Online";

    // Clear any previous timeout
    if (timeouts[sessionId]) {
        clearTimeout(timeouts[sessionId]);
    }

    // Set a timeout to mark the session as Offline after 12 seconds
    timeouts[sessionId] = setTimeout(() => {
        sessions[sessionId].status = "Offline";
        saveSessions();
    }, 12000);

    saveSessions();
    reply.send({ status: "ok" });
});
fastify.post("/admin/broadcast", async (request, reply) => {
    const { message, bgColor } = request.body;

    if (!message || !bgColor) {
        return reply.status(400).send({ error: "Message and background color are required." });
    }

    // Broadcast message to all active sessions
    for (const sessionId in sessions) {
        if (sessions[sessionId].status === "Online") {
            sessions[sessionId].lastMessage = { message, bgColor };
        }
    }

    saveSessions();
    reply.send({ success: true, message: "Broadcast sent successfully." });
});

fastify.get("/get-broadcasts/:sessionId", async (request, reply) => {
    const { sessionId } = request.params;

    if (!sessions[sessionId] || !sessions[sessionId].lastMessage) {
        return reply.send({ message: null });
    }

    const messageData = sessions[sessionId].lastMessage;
    delete sessions[sessionId].lastMessage; // Clear after sending

    reply.send(messageData);
});
fastify.post("/admin/message", async (request, reply) => {
    const { sessionId, message, bgColor } = request.body;

    if (!sessionId || !message || !bgColor) {
        return reply.status(400).send({ error: "Session ID, message, and background color are required." });
    }

    if (!sessions[sessionId]) {
        return reply.status(404).send({ error: "Session not found." });
    }

    // Store the message for the specific session
    sessions[sessionId].lastMessage = { message, bgColor };
    saveSessions();

    reply.send({ success: true, message: "Message sent successfully." });
});

fastify.get("/get-message/:sessionId", async (request, reply) => {
    const { sessionId } = request.params;

    if (!sessions[sessionId] || !sessions[sessionId].lastMessage) {
        return reply.send({ message: null });
    }

    const messageData = sessions[sessionId].lastMessage;
    delete sessions[sessionId].lastMessage; // Clear after sending

    reply.send(messageData);
});

fastify.get("/visited-websites", async (request, reply) => {
    let category = request.query.category || "all"; // Default: "all"

    let allLogs = [];

    Object.entries(sessions).forEach(([sessionId, data]) => {
        data.logs.forEach(log => {
            allLogs.push({ 
                sessionId, 
                url: log.url, 
                timestamp: log.timestamp 
            });
        });
    });

    // Sort by most recent first
    allLogs.sort((a, b) => b.timestamp - a.timestamp);

    if (category === "porn") {
        allLogs = allLogs.filter(entry => {
            try {
                let urlObj = new URL(entry.url);
                let baseDomain = urlObj.hostname.replace(/^www\./, ""); // Remove "www."

                // Ignore localhost and internal URLs
                if (baseDomain === "localhost" || baseDomain.endsWith(".local")) {
                    return false;
                }

                return pornDomains.has(baseDomain); // Exact match check
            } catch (error) {
                return false; // Skip invalid URLs
            }
        });
    }

    reply.send(allLogs);
});


// Get all sessions sorted by online status
fastify.get("/sessions", async (request, reply) => {
    const sessionList = Object.entries(sessions).map(([id, data]) => {
        let status = data.status;
        if (status === "Offline" && data.lastOnline) {
            status = `Last online ${timeAgo(data.lastOnline)}`;
        }

        return {
            sessionId: id,
            lastOnline: data.lastOnline,
            status: data.banned ? "Banned" : status,
            lastVisited: data.logs.length ? data.logs[data.logs.length - 1] : null,
            banned: data.banned
        };
    });

    sessionList.sort((a, b) => (b.status === "Online" ? 1 : -1));
    reply.send(sessionList);
});



// Get session details
fastify.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    ensureSession(id);

    let session = sessions[id];
    let formattedDuration = "Unlimited"; // Default to unlimited

    if (session.banned && session.banExpires) {
        const timeLeft = session.banExpires - Date.now();
        if (timeLeft > 0) {
            formattedDuration = formatTime(Math.ceil(timeLeft / 60000)); // Convert ms to formatted time
        } else {
            // Auto-remove expired ban
            session.banned = false;
            delete session.banExpires;
            delete session.banMessage;
            saveSessions();
        }
    }

    reply.send({
        sessionId: id,
        lastOnline: session.lastOnline,
        status: session.banned ? "Banned" : session.status,
        lastVisited: session.logs.length ? session.logs[session.logs.length - 1] : null,
        banned: session.banned,
        banReason: session.banned ? (session.banMessage || "No reason provided.") : null,
        banDuration: formattedDuration, // Ensure this is a formatted string
        logs: session.logs
    });
});

fastify.post('/gpt/', async (request, reply) => {
    try {
        const response = await fetch('https://chatgpt4online.org/wp-json/mwai-ui/v1/chats/submit', {
            method: 'POST',
            headers: {
                "accept": "text/event-stream",
                "content-type": "application/json",
                "dnt": "1",
                "referer": "https://chatgpt4online.org/",
                "sec-ch-ua": `Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132`,
                "sec-ch-ua-mobile": "?1",
                "sec-ch-ua-platform": "Android",
                "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36",
                "x-wp-nonce": xpnonce
            },
            body: JSON.stringify(request.body),
            agent
        });

        reply.header('Content-Type', response.headers.get('content-type'));
        for await (const chunk of response.body) {
            reply.raw.write(chunk);
        }
        reply.raw.end();
    } catch (error) {
        reply.status(500).send({ error: error.message });
    }
});
fastify.post('/acc/store-referral', async (request, reply) => {
    const { username, referralCode } = request.body;

    if (!username || !referralCode) {
        return reply.status(400).send({ error: "Missing username or referral code." });
    }

    if (!referrals[username]) {
        referrals[username] = { referralLinks: [], referredUsers: new Set(), perkStatus: 0 };
    }

    referrals[username].referralLinks.push(referralCode);
    saveData(REFERRALS_DATA_FILE, referrals);

    reply.send({ success: true, message: "Referral code stored successfully." });
});

fastify.post('/acc/create-account', async (request, reply) => {
    const { username, password } = request.body;

    if (accounts[username]) {
        return reply.status(400).send({ error: "Username already exists." });
    }

    accounts[username] = { hashedPassword: password };
    saveAccounts();

    reply.send({ success: true, message: "Account created successfully." });
});

fastify.post('/acc/login', async (request, reply) => {
    const { username, password } = request.body;

    if (!accounts[username] || accounts[username].hashedPassword !== password) {
        return reply.status(401).send({ error: "Invalid username or password." });
    }

    reply
        .setCookie("session", username, { path: "/", maxAge: 86400 }) // 1-day session
        .send({ success: true, message: "Login successful.", session: username });
});

fastify.post('/acc/logout', async (request, reply) => {
    reply
        .clearCookie("session", { path: "/" })
        .send({ success: true, message: "Logged out successfully." });
});
fastify.get('/acc/session', async (request, reply) => {
    const session = request.cookies.session;
    if (!session || !accounts[session]) {
        return reply.status(401).send({ error: "No active session." });
    }

    reply.send({ success: true, username: session });
});

// Dynamically recalculate perk level based on referrals
function calculatePerkStatus(referredCount, manualPerk) {
    let referralPerk = 0;
    if (referredCount >= 20) {
        referralPerk = 3;
    } else if (referredCount >= 10) {
        referralPerk = 2;
    } else if (referredCount >= 5) {
        referralPerk = 1;
    }

    // If manually set perk is higher, keep it
    return Math.max(referralPerk, manualPerk);
}

// Update perk level dynamically when a user gets a new referral
fastify.post('/acc/visit-referral', async (request, reply) => {
    let { referralCode, sessionId } = request.body;

    if (!sessionId) {
        return reply.status(400).send({ error: "Session ID is required." });
    }

    // Find the referrer
    let referrer = Object.keys(referrals).find(username =>
        referrals[username].referralLinks.includes(referralCode)
    );

    if (!referrer) {
        return reply.status(404).send({ error: "Invalid referral link." });
    }

    if (referrals[referrer].referredUsers.has(sessionId)) {
        return reply.status(400).send({ error: "This session has already been used for a referral." });
    }

    // Add referral
    referrals[referrer].referredUsers.add(sessionId);

    // Recalculate perk level dynamically
    const referredCount = referrals[referrer].referredUsers.size;
    const manualPerk = referrals[referrer].perkStatus || 0;
    referrals[referrer].perkStatus = calculatePerkStatus(referredCount, manualPerk);

    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, null, 2));

    reply.send({ success: true, message: `Referral added! ${referrer} now has ${referredCount} referrals.` });
});

fastify.post('/acc/get-referral-stats', async (request, reply) => {
    const { username } = request.body;

    if (!username || !referrals[username]) {
        return reply.status(404).send({ error: "User not found or no referrals." });
    }

    const userReferrals = referrals[username];

    reply.send({
        referredCount: userReferrals.referredUsers.size,
        perkStatus: userReferrals.perkStatus,
        referralLinks: userReferrals.referralLinks
    });
});
// Middleware to check if the user is an admin
function isAdmin(request) {
    return request.cookies?.admin_session === "true";
}

fastify.post('/acc/set-perk-level', async (request, reply) => {
    const { username, perkLevel } = request.body;

    // Validate perk level
    let requiredReferrals = 0;
    if (perkLevel >= 3) {
        requiredReferrals = 20;
    } else if (perkLevel >= 2) {
        requiredReferrals = 10;
    } else if (perkLevel >= 1) {
        requiredReferrals = 5;
    } else {
        return reply.status(400).send({ error: "Invalid perk level." });
    }

    // Create user in account_data.json if not exists
    if (!accounts[username]) {
        accounts[username] = { hashedPassword: null }; // No password assigned
        fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accounts, null, 2));
    }

    // Create referral data if not exists
    if (!referrals[username]) {
        referrals[username] = { referredUsers: new Set(), referralLinks: [], perkStatus: 0 };
    }

    // Ensure user has the required referrals, add placeholders if needed
    while (referrals[username].referredUsers.size < requiredReferrals) {
        referrals[username].referredUsers.add(`placeholder-${referrals[username].referredUsers.size + 1}`);
    }

    // Set the user's perk level
    referrals[username].perkStatus = perkLevel;
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, null, 2));

    reply.send({ success: true, message: `Perk level set to ${perkLevel} with ${requiredReferrals} referrals.` });
});


fastify.post('/acc/delete-account', async (request, reply) => {
    const { username } = request.body;

    // Check if user exists in account_data.json
    if (!accounts[username]) {
        return reply.status(404).send({ error: "User not found in account_data.json." });
    }

    // Remove user from account_data.json
    delete accounts[username];

    // Remove user from referrals_data.json if exists
    if (referrals[username]) {
        delete referrals[username];
    }

    // Save updated account data
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accounts, null, 2));

    // Save updated referral data
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, null, 2));

    reply.send({ success: true, message: `Account ${username} deleted from all records.` });
});

fastify.get("/uv/uv.config.js", (req, res) => {
    return res.sendFile("uv/uv.config.js", publicPath);
});

fastify.get('/ip/', async (request, reply) => {
    try {
      const response = await axios.get('https://api.ipify.org?format=json');
      reply.send(response.data); // No need to stringify, Fastify handles JSON by default
    } catch (error) {
      console.error('Error fetching data:', error);
      reply.code(500).send({ error: 'Failed to fetch IP' });
    }
  });
// Fetch list of all accounts with referral stats (Paginated)
// Fetch list of all accounts with referral stats (Merged from both files)
fastify.get('/acc/get-referral-stats-list', async (request, reply) => {
    const page = parseInt(request.query.page) || 1;

    // Load account data (usernames & passwords)
    let accountsData = {};
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
        try {
            accountsData = JSON.parse(fs.readFileSync(ACCOUNT_DATA_FILE, 'utf-8'));
        } catch (error) {
            console.error("Error loading account data:", error);
        }
    }

    // Merge account data with referral data
    const accountsArray = Object.keys(accountsData).map(username => ({
        username,
        passwordHash: accountsData[username].hashedPassword, // From account_data.json
        referredCount: referrals[username]?.referredUsers?.size || 0, // From referrals_data.json
        perkStatus: referrals[username]?.perkStatus || 0,
        referralLinks: referrals[username]?.referralLinks || []
    }));

    // Pagination: 15 accounts per page
    const accountsPerPage = 15;
    const start = (page - 1) * accountsPerPage;
    const paginatedAccounts = accountsArray.slice(start, start + accountsPerPage);

    reply.send({
        totalAccounts: accountsArray.length,
        totalPages: Math.ceil(accountsArray.length / accountsPerPage),
        currentPage: page,
        accounts: paginatedAccounts
    });
});


fastify.get("/admin", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("admin", "index.html"), "utf-8"));
});
fastify.get("/admin/login", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("admin", "login.html"), "utf-8"));
});
fastify.get("/admin/session", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("admin", "session.html"), "utf-8"));
});
fastify.get("/admin/logs", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("admin", "visited.html"), "utf-8"));
});
fastify.get("/admin/accounts", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("admin", "accounts.html"), "utf-8"));
});
fastify.get("/banned", async (request, reply) => {
    reply.type("text/html").send(fs.readFileSync(path.join("static", "banned.html"), "utf-8"));
});
fastify.get('/share/:referralCode', async (request, reply) => {
    const referralCode = request.params.referralCode;

    // Serve a temporary page that logs the referral and redirects
    reply.type('text/html').send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Logging Referral...</title>
        </head>
        <body>
            <div class="container">
        <h1>Logging this referral</h1>
        <p>Please wait.. Logging the referral to our database!</p>
        <div class="spinner"></div>
        <p class="footer">© 2025 Abyss Services LLC</p>
    </div>
            <script>
(async function() {
    console.log("Checking referral visit...");

    function generateSessionId() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    let sessionId = localStorage.getItem("session_id");
    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem("session_id", sessionId);
    }

    const hasAccount = localStorage.getItem("acc_username");
    if (hasAccount) {
        window.location.href = "/";
        return;
    }

    // Get referral code from URL without regex
    const urlParts = window.location.pathname.split("/");
    const referralCode = urlParts[urlParts.length - 1]; // Last part of URL
    console.log("Referral Code:", referralCode);

    // Send referral to backend
    try {
        const response = await fetch("/acc/visit-referral", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referralCode, sessionId })
        });

        const data = await response.json();
        if (response.ok) {
            console.log(data.message);
        } else {
            console.error("Referral failed:", data.error);
        }
    } catch (error) {
        console.error("Error sending referral request:", error);
    }

    // Redirect to index.html after 2 seconds
    setTimeout(() => {
        window.location.href = "/";
    }, 2000);
})();
            </script>
            <style>
            * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            background: #0a0a0a;
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
        }
        .container {
            max-width: 500px;
            padding: 20px;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        p {
            font-size: 1.2rem;
            margin-bottom: 20px;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .footer {
            font-size: 0.9rem;
            opacity: 0.7;
            margin-top: 20px;
        }
    </style>
        </body>
        </html>
    `);
});

fastify.server.on("listening", () => {
    const address = fastify.server.address();
    console.log("Helium is listening on:");
    console.log(`\thttp://localhost:${address.port}`);
    console.log(`\thttp://${hostname()}:${address.port}`);
    console.log(
        `\thttp://${
            address.family === "IPv6" ? `[${address.address}]` : address.address
        }:${address.port}`
    );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
    console.log("SIGTERM signal received: closing HTTP server");
    fastify.close();
    process.exit(0);
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

fastify.listen({
    port: port,
    host: "0.0.0.0",
});

//setTimeout(fetchXpnonce,1000);
//setInterval(fetchXpnonce, 3 * 60 * 60 * 1000);
