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
const PASSWORD = "sPUaR227A3V^h^68#Fs#2kLZTysRK87BR6Z998z@8X53&YTBdC%LnGpDNVvp@Q!576WF%ThPc8k6fY9H2Q@DUdV$JR%@W58%ZQGgKpU$#^TS4hD$58UgM5zP6#obti*%";
const PORN_BLOCK_FILE = "blocklists/porn-block.txt";
const ACCOUNT_DATA_FILE = 'account_data.json';
const REFERRALS_DATA_FILE = 'referrals_data.json';
const LINKS_FILE = "links.json";
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
if (!fs.existsSync(REFERRALS_DATA_FILE)) {
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify({}, null, 2));
}

if (!fs.existsSync(LINKS_FILE)) {
    fs.writeFileSync(LINKS_FILE, JSON.stringify([], null, 2));
}

let links = JSON.parse(fs.readFileSync(LINKS_FILE, "utf-8") || "[]");

// Load referrals data
if (fs.existsSync(REFERRALS_DATA_FILE)) {
    try {
        referrals = JSON.parse(fs.readFileSync(REFERRALS_DATA_FILE, "utf-8"));
        for (const username in referrals) {
            referrals[username].generatedDomains = referrals[username].generatedDomains || 0;
        }
    } catch (error) {
        console.error("Error loading referral data:", error);
    }
}

function saveReferrals() {
    const dataToSave = {};

    for (const username in referrals) {
        dataToSave[username] = {
            referralLinks: referrals[username].referralLinks,
            referredUsers: Array.from(referrals[username].referredUsers), // Convert Set to Array
            perkStatus: referrals[username].perkStatus,
            generatedDomains: referrals[username].generatedDomains || 0
        };
    }

    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(dataToSave, null, 2));
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
                referredUsers: new Set(data[username].referredUsers || []), // Convert to Set
                perkStatus: data[username].perkStatus || 0,
                generatedDomains: data[username].generatedDomains || 0
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
            referredUsers: Array.from(referrals[username].referredUsers), 
            perkStatus: referrals[username].perkStatus
        };
    }
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(dataToSave, null, 2));
}


if (fs.existsSync(PORN_BLOCK_FILE)) {
    try {
        const data = fs.readFileSync(PORN_BLOCK_FILE, "utf-8").split("\n");
        pornDomains = new Set(data.map(domain => domain.trim())); 
        console.log(`Loaded ${pornDomains.size} porn domains.`);
    } catch (error) {
        console.error("Error reading porn-block.txt:", error);
    }
} else {
    console.warn("porn-block.txt not found!");
}

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

function saveSessions() {
    fs.writeFileSync(SESSION_DATA_FILE, JSON.stringify(sessions, null, 2));
}

function ensureSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = { logs: [], lastOnline: 0, status: "Offline", banned: false };
    }
}

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
    const { message, duration } = request.body;
    
    ensureSession(id);

    if (!sessions[id].banned) {
        sessions[id].banMessage = message || "You have been banned."; 
        sessions[id].banned = true;
        
        if (duration) {
            const expiresAt = Date.now() + duration * 60000;
            sessions[id].banExpires = expiresAt;
            
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


fastify.get("/ban/message/:id", async (request, reply) => {
    const { id } = request.params;
    ensureSession(id);

    let remainingTime = null;
    if (sessions[id].banExpires) {
        const timeLeft = sessions[id].banExpires - Date.now();
        if (timeLeft > 0) {
            remainingTime = formatTime(Math.ceil(timeLeft / 60000)); 
        } else {
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
            .setCookie("admin_session", "true", { path: "/admin", httpOnly: true })
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

fastify.addHook("preHandler", async (request, reply) => {
    const allowedRoutes = ["/admin/login", "/login.html", "/login"]; 
    if (
        !allowedRoutes.includes(request.url) &&
        request.url.startsWith("/admin") 
    ) {
        const isLoggedIn = request.cookies?.admin_session === "true";

        if (!isLoggedIn) {
            return reply.redirect("/admin/login");
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

fastify.post("/heartbeat", async (request, reply) => {
    const sessionId = request.headers["x-session-id"] || "MISSING_SESSION_ID";
    const timestamp = Date.now();

    ensureSession(sessionId);
    if (sessions[sessionId].banned) {
        return reply.send({ status: "banned" });
    }

    sessions[sessionId].lastOnline = timestamp;
    sessions[sessionId].status = "Online";

    if (timeouts[sessionId]) {
        clearTimeout(timeouts[sessionId]);
    }

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
    delete sessions[sessionId].lastMessage; 

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
    delete sessions[sessionId].lastMessage; 

    reply.send(messageData);
});

fastify.get("/visited-websites", async (request, reply) => {
    let category = request.query.category || "all"; 

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

    allLogs.sort((a, b) => b.timestamp - a.timestamp);

    if (category === "porn") {
        allLogs = allLogs.filter(entry => {
            try {
                let urlObj = new URL(entry.url);
                let baseDomain = urlObj.hostname.replace(/^www\./, ""); 

                if (baseDomain === "localhost" || baseDomain.endsWith(".local")) {
                    return false;
                }

                return pornDomains.has(baseDomain); 
            } catch (error) {
                return false; 
            }
        });
    }

    reply.send(allLogs);
});


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



fastify.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    ensureSession(id);

    let session = sessions[id];
    let formattedDuration = "Unlimited"; 

    if (session.banned && session.banExpires) {
        const timeLeft = session.banExpires - Date.now();
        if (timeLeft > 0) {
            formattedDuration = formatTime(Math.ceil(timeLeft / 60000)); 
        } else {
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
        banDuration: formattedDuration, 
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
        .setCookie("session", username, { path: "/", maxAge: 86400 })
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

function calculatePerkStatus(referredCount, manualPerk) {
    let referralPerk = 0;
    if (referredCount >= 20) {
        referralPerk = 3;
    } else if (referredCount >= 10) {
        referralPerk = 2;
    } else if (referredCount >= 5) {
        referralPerk = 1;
    }
    return Math.max(referralPerk, manualPerk);
}

fastify.post('/acc/visit-referral', async (request, reply) => {
    const { referralCode, sessionId } = request.body;

    if (!sessionId) {
        return reply.status(400).send({ error: "Session ID is required." });
    }

    let referrer = Object.keys(referrals).find(username =>
        referrals[username].referralLinks.includes(referralCode)
    );

    if (!referrer) {
        return reply.status(404).send({ error: "Invalid referral link." });
    }

    if (!referrals[referrer]) {
        referrals[referrer] = { referredUsers: new Set(), referralLinks: [], perkStatus: 0, generatedDomains: 0 };
    }

    if (referrals[referrer].referredUsers.has(sessionId)) {
        return reply.status(400).send({ error: "This session has already been used for a referral." });
    }

    // Convert referredUsers to an array, update, and convert back to a Set
    let referredArray = Array.from(referrals[referrer].referredUsers);
    referredArray.push(sessionId);
    referrals[referrer].referredUsers = new Set(referredArray);

    // Update perk level
    const referredCount = referrals[referrer].referredUsers.size;
    const manualPerk = referrals[referrer].perkStatus || 0;
    referrals[referrer].perkStatus = calculatePerkStatus(referredCount, manualPerk);

    // Save data to JSON file to persist changes
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, (key, value) =>
        value instanceof Set ? [...value] : value, 2));

    reply.send({ success: true, message: `Referral added! ${referrer} now has ${referredCount} referrals.` });
});

fastify.post("/acc/get-referral-stats", async (request, reply) => {
    const { username } = request.body;

    if (!username || !referrals[username]) {
        return reply.status(404).send({ error: "User not found or no referrals." });
    }

    const userReferrals = referrals[username];

    // Ensure referredUsers is properly counted
    const referredCount = userReferrals.referredUsers ? userReferrals.referredUsers.size : 0;

    // Ensure only the correct number of links is returned
    const generatedLinks = links.slice(0, userReferrals.generatedDomains || 0);

    // Send response
    reply.send({
        referredCount: referredCount,  // ✅ Count of referred users
        perkStatus: userReferrals.perkStatus || 0,  // ✅ Current perk level
        referralLinks: userReferrals.referralLinks || [],  // ✅ List of generated referral links
        generatedDomains: userReferrals.generatedDomains || 0,  // ✅ Number of generated domains
        generatedLinks: generatedLinks  // ✅ List of actual generated domains
    });
});



function isAdmin(request) {
    return request.cookies?.admin_session === "true";
}

fastify.post('/acc/set-perk-level', async (request, reply) => {
    const { username, perkLevel } = request.body;

    if (!username) {
        return reply.status(400).send({ error: "Username is required." });
    }

    if (![0, 1, 2, 3].includes(perkLevel)) {
        return reply.status(400).send({ error: "Invalid perk level. Must be 0, 1, 2, or 3." });
    }

    if (!fs.existsSync(REFERRALS_DATA_FILE)) {
        return reply.status(500).send({ error: "Referral data file missing." });
    }

    // Load the latest referrals data
    referrals = JSON.parse(fs.readFileSync(REFERRALS_DATA_FILE, "utf-8"));

    if (!referrals[username]) {
        referrals[username] = { referredUsers: new Set(), referralLinks: [], perkStatus: 0 };
    }

    const requiredReferrals = { 0: 0, 1: 5, 2: 10, 3: 20 }[perkLevel];

    // Convert Set to an array, update, then convert back to Set
    let referredArray = Array.from(referrals[username].referredUsers);

    while (referredArray.length < requiredReferrals) {
        referredArray.push(`placeholder-${referredArray.length + 1}`);
    }

    // Trim excess referrals if needed
    referredArray = referredArray.slice(0, requiredReferrals);

    referrals[username].referredUsers = new Set(referredArray);
    referrals[username].perkStatus = perkLevel;

    // Save the updated referrals data
    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, (key, value) =>
        value instanceof Set ? [...value] : value, 2));

    console.log(`Perk level set to ${perkLevel} with ${requiredReferrals} referrals.`);
    
    reply.send({
        success: true,
        message: `Perk level set to ${perkLevel}. User now has ${requiredReferrals} referrals.`,
        referredUsers: referredArray
    });
});


fastify.post('/acc/delete-account', async (request, reply) => {
    const { username } = request.body;

    if (!accounts[username]) {
        return reply.status(404).send({ error: "User not found in account_data.json." });
    }

    delete accounts[username];

    if (referrals[username]) {
        delete referrals[username];
    }

    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accounts, null, 2));

    fs.writeFileSync(REFERRALS_DATA_FILE, JSON.stringify(referrals, null, 2));
    console.log(`Account ${username} deleted from all records.`);
    reply.send({ success: true, message: `Account ${username} deleted from all records.` });
});

fastify.post("/acc/generate-domain", async (request, reply) => {
    const { username } = request.body;

    if (!username || !referrals[username]) {
        return reply.status(404).send({ error: "Couldn't serve you a new link! You were not found in the database or no referrals were logged for you." });
    }

    const userReferrals = referrals[username];

    // Ensure referredUsers is preserved
    if (!userReferrals.referredUsers) {
        userReferrals.referredUsers = new Set();
    }

    const perkLevel = userReferrals.perkStatus || 0;

    if (perkLevel < 2) {
        return reply.status(403).send({ error: "Couldn't serve you a new link! Your perk level must be 2 or higher." });
    }

    userReferrals.generatedDomains = userReferrals.generatedDomains || 0;

    if (perkLevel === 2 && userReferrals.generatedDomains >= 1) {
        return reply.status(400).send({ error: "Couldn't serve you a new link! You have already generated a domain." });
    }

    if (userReferrals.generatedDomains >= links.length) {
        return reply.status(400).send({ error: "Couldn't serve you a new link! You have generated all available links." });
    }

    const nextDomain = links[userReferrals.generatedDomains];
    userReferrals.generatedDomains++;

    // Save changes, making sure to preserve `referredUsers`
    saveReferrals();

    reply.send({
        success: true,
        domain: nextDomain,
        generatedCount: userReferrals.generatedDomains,
        referredCount: userReferrals.referredUsers.size,  // ✅ Include referredCount in the response
        message: `You have generated ${userReferrals.generatedDomains} domain(s).`
    });
});

fastify.get("/uv/uv.config.js", (req, res) => {
    return res.sendFile("uv/uv.config.js", publicPath);
});
fastify.get("/get-links", async (request, reply) => {
    try {
        if (!fs.existsSync(LINKS_FILE)) {
            return reply.send([]);
        }

        const links = JSON.parse(fs.readFileSync(LINKS_FILE, "utf-8"));
        reply.send(links);
    } catch (error) {
        console.error("Error fetching links:", error);
        reply.status(500).send({ error: "Failed to retrieve links." });
    }
});
fastify.get('/ip/', async (request, reply) => {
    try {
      const response = await axios.get('https://api.ipify.org?format=json');
      reply.send(response.data); 
    } catch (error) {
      console.error('Error fetching data:', error);
      reply.code(500).send({ error: 'Failed to fetch IP' });
    }
  });
fastify.get('/acc/get-referral-stats-list', async (request, reply) => {
    const page = parseInt(request.query.page) || 1;

    let accountsData = {};
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
        try {
            accountsData = JSON.parse(fs.readFileSync(ACCOUNT_DATA_FILE, 'utf-8'));
        } catch (error) {
            console.error("Error loading account data:", error);
        }
    }

    const accountsArray = Object.keys(accountsData).map(username => ({
        username,
        passwordHash: accountsData[username].hashedPassword,
        referredCount: referrals[username]?.referredUsers?.size || 0, 
        perkStatus: referrals[username]?.perkStatus || 0,
        referralLinks: referrals[username]?.referralLinks || []
    }));

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

    const urlParts = window.location.pathname.split("/");
    const referralCode = urlParts[urlParts.length - 1]; 
    console.log("Referral Code:", referralCode);

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
