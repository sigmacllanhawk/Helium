const { createClient } = await import('redis')

const client = createClient({
  url: process.env.REDIS_URL
})
await client.connect()
import 'dotenv/config';  
import cluster from "node:cluster";
import os from "node:os";
import {
	createServer
} from "node:http";
import path, {
	join
} from "node:path";
import fs from "fs";
import { readFile } from "fs/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import {
	createClient
} from "redis";
import axios from "axios";
import wisp from "wisp-server-node";
import {
	epoxyPath
} from "@mercuryworkshop/epoxy-transport";
import {
	baremuxPath
} from "@mercuryworkshop/bare-mux/node";
import speakeasy from "speakeasy";
import { randomBytes } from 'node:crypto';

const port = parseInt(process.env.PORT || "") || 8080;
const numCPUs = os.cpus().length;
const TWO_FA_SECRET = process.env.ADMIN_2FA_SECRET;
const PASSWORD = process.env.ADMIN_PASSWORD;
const publicPath = join(process.cwd(), "static");
const uvPath = join(process.cwd(), "uv");
const PORN_BLOCK_FILE = "blocklists/porn-block.txt";
const LINKS_FILE = "links.json";
const ADMIN_COOKIE = "admin_token";
const redis = createClient();
await redis.connect();
console.log("TWO_FA_SECRET:", JSON.stringify(TWO_FA_SECRET));
console.log("EXPECTED TOTP:", speakeasy.totp({
  secret:   TWO_FA_SECRET,
  encoding: "base32",
  window:   1
}));
let pornDomains = new Set();
if (fs.existsSync(PORN_BLOCK_FILE)) {
	try {
		const data = fs.readFileSync(PORN_BLOCK_FILE, "utf-8").split("\n");
		pornDomains = new Set(data.map(domain => domain.trim()));
		console.log(`Loaded ${pornDomains.size} porn domains.`);
	} catch (error) {
		console.error("Error reading porn-block.txt:", error);
	}
}
async function requireAdmin(request, reply) {
	const token = request.cookies.admin_token;
	if (!token) {
	  return reply.code(401).send({ error: "Unauthorized" });
	}
	const isValid = await redis.sIsMember("admin_tokens", token);
	if (!isValid) {
	  return reply.clearCookie("admin_token", { path: "/admin" })
				  .code(401)
				  .send({ error: "Unauthorized" });
	}
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

const SESSION_PREFIX = "sess:";
const ACCOUNT_PREFIX = "acc:";
const REFERRAL_KEY = "referrals";
const LINKS_KEY = "links";

function sessionKey(id) {
	return `${SESSION_PREFIX}${id}`;
}

function accountKey(username) {
	return `${ACCOUNT_PREFIX}${username}`;
}

async function getSession(id) {
	const data = await redis.get(sessionKey(id));
	return data ? JSON.parse(data) : null;
}
async function setSession(id, value) {
	await redis.set(sessionKey(id), JSON.stringify(value));
}
async function deleteSession(id) {
	await redis.del(sessionKey(id));
}
async function getAllSessions() {
	const keys = await redis.keys(`${SESSION_PREFIX}*`);
	const sessions = {};
	for (const key of keys) {
		const data = await redis.get(key);
		if (data) sessions[key.slice(SESSION_PREFIX.length)] = JSON.parse(data);
	}
	return sessions;
}

async function getAccount(username) {
	const data = await redis.get(accountKey(username));
	return data ? JSON.parse(data) : null;
}
async function setAccount(username, value) {
	await redis.set(accountKey(username), JSON.stringify(value));
}
async function deleteAccount(username) {
	await redis.del(accountKey(username));
}

async function getReferrals() {
	const data = await redis.get(REFERRAL_KEY);
	if (!data) return {};
	const parsed = JSON.parse(data);
	for (const user in parsed) {
		if (parsed[user].referredUsers && !Array.isArray(parsed[user].referredUsers)) {
			parsed[user].referredUsers = Object.values(parsed[user].referredUsers);
		}
	}
	return parsed;
}
async function setReferrals(referrals) {
	await redis.set(REFERRAL_KEY, JSON.stringify(referrals));
}

async function getLinks() {
  try {
    // 1) Always read the file via promise‑API
    const fileData = await readFile(LINKS_FILE, "utf8");
    const links    = JSON.parse(fileData);

    // 2) Mirror into Redis
    await redis.set(LINKS_KEY, JSON.stringify(links));
    return links;
  } catch (err) {
    console.error("getLinks error:", err);
    return [];
  }
}

if (cluster.isPrimary) {
	console.log(`Primary ${process.pid} is running`);

	for (let i = 0; i < numCPUs; i++) {
		cluster.fork();
	}

	cluster.on("exit", (worker, code, signal) => {
		console.log(`Worker ${worker.process.pid} died`);
		cluster.fork();
	});
} else {
	const fastify = Fastify({
		serverFactory: (handler) => {
			return createServer()
				.on("request", (req, res) => handler(req, res))
				.on("upgrade", (req, socket, head) => {
					if (req.url.endsWith("/wisp/")) {
						wisp.routeRequest(req, socket, head);
					} else {
						socket.end();
					}
				});
		},
	});
	
	fastify.register(fastifyCookie);
		  
	fastify.addHook("preHandler", async (request, reply) => {
		const { url, method } = request;
	  
		// 2a) Allow GET /admin/login (show form)
		if (url === "/admin/login" && method === "GET") {
		  return;
		}
	  
		// 2b) Allow POST /login (submit form)
		if (url === "/login" && method === "POST") {
		  return;
		}
	  
		// 2c) Allow POST /logout
		if (url === "/logout" && method === "POST") {
		  return;
		}
	  
		// 2d) Everything else under /admin/* requires a token
		if (url.startsWith("/admin")) {
		  const token = request.cookies[ADMIN_COOKIE];
		  const ok    = token && await redis.sIsMember("admin_tokens", token);
		  if (!ok) {
			return reply.redirect("/admin/login");
		  }
		}
	  });
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
	fastify.post("/login", async (request, reply) => {
		try {
		  const { password, token } = request.body || {};
		  if (!password || !token) {
			return reply.code(400).send({ success: false, error: "Missing password or 2FA code" });
		  }
	  
		  // 1) Check password
		  if (password !== PASSWORD) {
			return reply.send({ success: false });
		  }
	  
		  // 2) Check TOTP token
		  const valid = speakeasy.totp.verify({
			secret:   TWO_FA_SECRET,
			encoding: "base32",
			token,
			window:   1     // allow ±30s drift
		  });
		  if (!valid) {
			return reply.send({ success: false });
		  }
	  
		  // 3) Revoke any existing admin tokens
		  await redis.del("admin_tokens");
	  
		  // 4) Generate a new random token and store it
		  const newToken = randomBytes(32).toString("hex");
		  await redis.sAdd("admin_tokens", newToken);

	  
		  // 5) Set the cookie and return success
		  return reply
			.setCookie(ADMIN_COOKIE, newToken, {
			  path:     "/",
			  httpOnly: true,
			  sameSite: "strict",
			  // secure: true,   // enable under HTTPS
			  maxAge:   60 * 60 * 1000  // 1 hour
			})
			.send({ success: true });
	  
		} catch (err) {
		  console.error("❌ /login error:", err);
		  return reply.code(500).send({ success: false, error: "Internal server error" });
		}
	  });
	  
	  
	  // 1c) Allow logout from anywhere
	  fastify.post("/logout", async (request, reply) => {
		return reply
		  .clearCookie(ADMIN_COOKIE, { path: "/admin" })
		  .send({ success: true });
	  });

	  
	  
	fastify.post("/ban/:id", { preHandler: requireAdmin }, async (request, reply) => {
		const {
			id
		} = request.params;
		const {
			message,
			duration
		} = request.body;
		let session = await getSession(id);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		if (!session.banned) {
			session.banned = true;
			session.banMessage = message || "You have been banned.";
			if (duration) {
				const expiresAt = Date.now() + duration * 60000;
				session.banExpires = expiresAt;
				setTimeout(async () => {
					session.banned = false;
					delete session.banExpires;
					delete session.banMessage;
					await setSession(id, session);
				}, duration * 60000);
			} else {
				delete session.banExpires;
			}
		} else {
			session.banned = false;
			delete session.banExpires;
			delete session.banMessage;
		}

		await setSession(id, session);
		reply.send({
			status: "ok",
			banned: session.banned
		});
	});

	fastify.get("/ban/message/:id", async (request, reply) => {
		const {
			id
		} = request.params;
		let session = await getSession(id);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		let remainingTime = null;
		if (session.banExpires) {
			const timeLeft = session.banExpires - Date.now();
			if (timeLeft > 0) {
				remainingTime = formatTime(Math.ceil(timeLeft / 60000));
			} else {
				session.banned = false;
				delete session.banExpires;
				delete session.banMessage;
				await setSession(id, session);
			}
		}

		reply.send({
			message: session.banMessage || "You have been banned.",
			duration: remainingTime || "Unlimited",
		});
	});

	const timeouts = {};

	fastify.post("/heartbeat", async (request, reply) => {
		const sessionId = request.headers["x-session-id"] || "MISSING_SESSION_ID";
		const timestamp = Date.now();

		let session = await getSession(sessionId);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		if (session.banned) {
			return reply.send({
				status: "banned"
			});
		}

		session.lastOnline = timestamp;
		session.status = "Online";

		if (timeouts[sessionId]) {
			clearTimeout(timeouts[sessionId]);
		}

		timeouts[sessionId] = setTimeout(async () => {
			session.status = "Offline";
			await setSession(sessionId, session);
		}, 12000);

		await setSession(sessionId, session);
		reply.send({
			status: "ok"
		});
	});

	fastify.post("/log", async (request, reply) => {
		const sessionId = request.headers["x-session-id"] || "MISSING_SESSION_ID";
		const {
			url
		} = request.body;
		const timestamp = Date.now();

		if (!url) return reply.status(400).send({
			error: "Missing URL"
		});

		let session = await getSession(sessionId);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		if (session.banned) return reply.send({
			status: "banned"
		});

		session.logs.push({
			url,
			timestamp
		});
		await setSession(sessionId, session);

		reply.send({
			status: "ok"
		});
	});

	fastify.post("/admin/broadcast",  { preHandler: requireAdmin }, async (request, reply) => {
		const {
			message,
			bgColor
		} = request.body;
		if (!message || !bgColor) {
			return reply.status(400).send({
				error: "Message and background color are required."
			});
		}

		const sessions = await getAllSessions();
		for (const sessionId in sessions) {
			if (sessions[sessionId].status === "Online") {
				sessions[sessionId].lastMessage = {
					message,
					bgColor
				};
				await setSession(sessionId, sessions[sessionId]);
			}
		}

		reply.send({
			success: true,
			message: "Broadcast sent successfully."
		});
	});

	fastify.get("/get-broadcasts/:sessionId", async (request, reply) => {
		const {
			sessionId
		} = request.params;
		const session = await getSession(sessionId);
		if (!session || !session.lastMessage) return reply.send({
			message: null
		});

		const messageData = session.lastMessage;
		delete session.lastMessage;
		await setSession(sessionId, session);

		reply.send(messageData);
	});
	fastify.post("/admin/message",  { preHandler: requireAdmin },  async (request, reply) => {
		const {
			sessionId,
			message,
			bgColor
		} = request.body;

		if (!sessionId || !message || !bgColor) {
			return reply.status(400).send({
				error: "Session ID, message, and background color are required."
			});
		}

		let session = await getSession(sessionId);
		if (!session) return reply.status(404).send({
			error: "Session not found."
		});

		session.lastMessage = {
			message,
			bgColor
		};
		await setSession(sessionId, session);

		reply.send({
			success: true,
			message: "Message sent successfully."
		});
	});

	fastify.get("/get-message/:sessionId", async (request, reply) => {
		const {
			sessionId
		} = request.params;
		const session = await getSession(sessionId);
		if (!session || !session.lastMessage) return reply.send({
			message: null
		});

		const messageData = session.lastMessage;
		delete session.lastMessage;
		await setSession(sessionId, session);

		reply.send(messageData);
	});

	fastify.get("/visited-websites/logs", async (request, reply) => {
		const category = request.query.category || "all";
		const page = parseInt(request.query.page) || 1;
		const logsPerPage = 20;

		const sessions = await getAllSessions();
		let allLogs = [];

		for (const sessionId in sessions) {
			sessions[sessionId].logs?.forEach(log => {
				allLogs.push({
					sessionId,
					url: log.url,
					timestamp: log.timestamp
				});
			});
		}

		allLogs.sort((a, b) => b.timestamp - a.timestamp);

		if (category === "porn") {
			allLogs = allLogs.filter(entry => {
				try {
					let urlObj = new URL(entry.url);
					let baseDomain = urlObj.hostname.replace(/^www\./, "");
					if (baseDomain === "localhost" || baseDomain.endsWith(".local")) return false;
					return pornDomains.has(baseDomain);
				} catch (err) {
					return false;
				}
			});
		}

		const totalLogs = allLogs.length;
		const totalPages = Math.ceil(totalLogs / logsPerPage);
		const start = (page - 1) * logsPerPage;
		const paginatedLogs = allLogs.slice(start, start + logsPerPage);

		reply.send({
			totalLogs,
			totalPages,
			currentPage: page,
			logs: paginatedLogs,
		});
	});

	fastify.get("/sessions/logs", async (request, reply) => {
		const page = parseInt(request.query.page) || 1;
		const sessionsPerPage = 15;
		const search = (request.query.search || "").toLowerCase();
		const filter = request.query.filter || "all";

		const allSessions = await getAllSessions();
		let sessionList = Object.entries(allSessions).map(([id, data]) => {
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

		sessionList = sessionList.filter(session => {
			const matchesSearch = session.sessionId.toLowerCase().includes(search);
			const matchesFilter =
				filter === "all" ||
				(filter === "Online" && session.status === "Online") ||
				(filter === "Offline" && session.status.startsWith("Last online")) ||
				(filter === "Banned" && session.banned);

			return matchesSearch && matchesFilter;
		});

		sessionList.sort((a, b) => {
			if (a.status === "Online" && b.status !== "Online") return -1;
			if (b.status === "Online" && a.status !== "Online") return 1;
			return 0;
		});

		const totalSessions = sessionList.length;
		const totalPages = Math.max(1, Math.ceil(totalSessions / sessionsPerPage));
		const start = (page - 1) * sessionsPerPage;
		const paginatedSessions = sessionList.slice(start, start + sessionsPerPage);

		reply.send({
			totalSessions,
			totalPages,
			currentPage: page,
			sessions: paginatedSessions
		});
	});

	fastify.get("/sessions/:id", async (request, reply) => {
		const {
			id
		} = request.params;
		let session = await getSession(id);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		let formattedDuration = "Unlimited";
		if (session.banned && session.banExpires) {
			const timeLeft = session.banExpires - Date.now();
			if (timeLeft > 0) {
				formattedDuration = formatTime(Math.ceil(timeLeft / 60000));
			} else {
				session.banned = false;
				delete session.banExpires;
				delete session.banMessage;
				await setSession(id, session);
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

	fastify.get("/sessions/:id/logs", async (request, reply) => {
		const {
			id
		} = request.params;
		const page = parseInt(request.query.page) || 1;
		const logsPerPage = 10;

		let session = await getSession(id);
		if (!session) session = {
			logs: [],
			lastOnline: 0,
			status: "Offline",
			banned: false
		};

		const totalLogs = session.logs.length;
		const totalPages = Math.ceil(totalLogs / logsPerPage);

		const start = (page - 1) * logsPerPage;
		const paginatedLogs = session.logs.slice(start, start + logsPerPage);

		reply.send({
			totalLogs,
			totalPages,
			currentPage: page,
			logs: paginatedLogs,
		});
	});

	function calculatePerkStatus(referredCount, manualPerk) {
		let referralPerk = 0;
		if (referredCount >= 20) referralPerk = 3;
		else if (referredCount >= 10) referralPerk = 2;
		else if (referredCount >= 5) referralPerk = 1;
		return Math.max(referralPerk, manualPerk);
	}

	fastify.post("/acc/create-account", async (request, reply) => {
		const {
			username,
			password
		} = request.body;
		const account = await getAccount(username);
		if (account) return reply.status(400).send({
			error: "Username already exists."
		});

		await setAccount(username, {
			hashedPassword: password
		});
		reply.send({
			success: true,
			message: "Account created successfully."
		});
	});
	fastify.post("/acc/login", async (request, reply) => {
		const {
			username,
			password
		} = request.body;
		const account = await getAccount(username);
		if (!account || account.hashedPassword !== password) {
			return reply.status(401).send({
				error: "Invalid username or password."
			});
		}

		reply
			.setCookie("session", username, {
				path: "/",
				maxAge: 86400
			})
			.send({
				success: true,
				message: "Login successful.",
				session: username
			});
	});

	fastify.post("/acc/logout", async (request, reply) => {
		reply.clearCookie("session", {
			path: "/"
		}).send({
			success: true,
			message: "Logged out successfully."
		});
	});

	fastify.get("/acc/session", async (request, reply) => {
		const session = request.cookies.session;
		const account = await getAccount(session);
		if (!session || !account) {
			return reply.status(401).send({
				error: "No active session."
			});
		}

		reply.send({
			success: true,
			username: session
		});
	});

	fastify.post("/acc/store-referral", async (request, reply) => {
		const {
			username,
			referralCode
		} = request.body;
		if (!username || !referralCode) {
			return reply.status(400).send({
				error: "Missing username or referral code."
			});
		}

		const referrals = await getReferrals();
		if (!referrals[username]) {
			referrals[username] = {
				referralLinks: [],
				referredUsers: [],
				perkStatus: 0,
				generatedDomains: 0
			};
		}

		referrals[username].referralLinks.push(referralCode);
		await setReferrals(referrals);

		reply.send({
			success: true,
			message: "Referral code stored successfully."
		});
	});

	fastify.post("/acc/visit-referral", async (request, reply) => {
		const {
			referralCode,
			sessionId
		} = request.body;
		if (!sessionId) return reply.status(400).send({
			error: "Session ID is required."
		});

		let referrals = await getReferrals();
		let referrer = Object.keys(referrals).find(username =>
			referrals[username].referralLinks?.includes(referralCode)
		);

		if (!referrer) return reply.status(404).send({
			error: "Invalid referral link."
		});

		referrals[referrer] = referrals[referrer] || {
			referralLinks: [],
			referredUsers: [],
			perkStatus: 0,
			generatedDomains: 0
		};

		if (referrals[referrer].referredUsers.includes(sessionId)) {
			return reply.status(400).send({
				error: "This session has already been used for a referral."
			});
		}

		referrals[referrer].referredUsers.push(sessionId);
		const referredCount = referrals[referrer].referredUsers.length;
		const manualPerk = referrals[referrer].perkStatus || 0;
		referrals[referrer].perkStatus = calculatePerkStatus(referredCount, manualPerk);

		await setReferrals(referrals);

		reply.send({
			success: true,
			message: `Referral added! ${referrer} now has ${referredCount} referrals.`
		});
	});

	fastify.post("/acc/set-perk-level", { preHandler: requireAdmin },  async (request, reply) => {
		const {
			username,
			perkLevel
		} = request.body;

		if (!username) return reply.status(400).send({
			error: "Username is required."
		});
		if (![0, 1, 2, 3].includes(perkLevel)) {
			return reply.status(400).send({
				error: "Invalid perk level. Must be 0, 1, 2, or 3."
			});
		}

		const referrals = await getReferrals();
		referrals[username] = referrals[username] || {
			referredUsers: [],
			referralLinks: [],
			perkStatus: 0,
			generatedDomains: 0
		};

		const requiredReferrals = {
			0: 0,
			1: 5,
			2: 10,
			3: 20
		} [perkLevel];
		while (referrals[username].referredUsers.length < requiredReferrals) {
			referrals[username].referredUsers.push(`placeholder-${referrals[username].referredUsers.length + 1}`);
		}

		referrals[username].referredUsers = referrals[username].referredUsers.slice(0, requiredReferrals);
		referrals[username].perkStatus = perkLevel;

		await setReferrals(referrals);
		reply.send({
			success: true,
			message: `Perk level set to ${perkLevel}. User now has ${requiredReferrals} referrals.`,
			referredUsers: referrals[username].referredUsers
		});
	});
	fastify.get("/acc/logs", async (request, reply) => {
		const page            = parseInt(request.query.page) || 1;
		const accountsPerPage = 15;
	  
		// 1) Load all referral info from Redis
		const referrals = await getReferrals();
	  
		// 2) Grab every account:<username> key from Redis
		const accKeys = await redis.keys(`${ACCOUNT_PREFIX}*`);
		// strip off the "acc:" prefix
		const usernames = accKeys.map(k => k.slice(ACCOUNT_PREFIX.length));
	  
		// 3) Build the array of account objects
		const accountsArray = usernames.map(username => {
		  const info = referrals[username] || {
			referredUsers: [],
			referralLinks: [],
			perkStatus:    0
		  };
		  return {
			username,
			referredCount: info.referredUsers.length,
			perkStatus:    info.perkStatus,
			referralLinks: info.referralLinks
		  };
		});
	  
		// 4) Paginate
		const totalAccounts = accountsArray.length;
		const totalPages    = Math.max(1, Math.ceil(totalAccounts / accountsPerPage));
		const start         = (page - 1) * accountsPerPage;
		const accounts      = accountsArray.slice(start, start + accountsPerPage);
	  
		// 5) Return exactly what your front‑end expects
		reply.send({
		  totalAccounts,
		  totalPages,
		  currentPage: page,
		  accounts
		});
	  });
	  
	fastify.post("/acc/delete-account", { preHandler: requireAdmin },  async (request, reply) => {
		const {
			username
		} = request.body;
		const account = await getAccount(username);
		if (!account) return reply.status(404).send({
			error: "User not found."
		});

		await deleteAccount(username);

		const referrals = await getReferrals();
		if (referrals[username]) {
			delete referrals[username];
			await setReferrals(referrals);
		}

		reply.send({
			success: true,
			message: `Account ${username} deleted from all records.`
		});
	});

	fastify.post("/acc/get-referral-stats", async (request, reply) => {
		const { username } = request.body;

   const account = await getAccount(username);
  if (!username || !account) {
    return reply.status(404).send({ error: "User not found." });
  }

   const referrals = await getReferrals();
   const userReferrals = referrals[username] ?? {
     referredUsers: [],
     referralLinks: [],
     perkStatus: 0,
     generatedDomains: 0
   };

   const referredCount = userReferrals.referredUsers.length;
   const links = await getLinks();
   const generatedLinks = links.slice(0, userReferrals.generatedDomains);

   reply.send({
     referredCount,
     perkStatus: userReferrals.perkStatus,
     referralLinks: userReferrals.referralLinks,
     generatedDomains: userReferrals.generatedDomains,
     generatedLinks
   });
});
	fastify.post("/acc/generate-domain", async (request, reply) => {
		const {
			username
		} = request.body;
		const referrals = await getReferrals();
		if (!username || !referrals[username]) {
			return reply.status(404).send({
				error: "User not found or no referrals."
			});
		}

		const user = referrals[username];
		const perk = user.perkStatus || 0;
		const links = await getLinks();

		if (perk < 2) {
			return reply.status(403).send({
				error: "Perk level must be 2 or higher."
			});
		}

		user.generatedDomains = user.generatedDomains || 0;

		if (perk === 2 && user.generatedDomains >= 1) {
			return reply.status(400).send({
				error: "You have already generated a domain."
			});
		}

		if (user.generatedDomains >= links.length) {
			return reply.status(400).send({
				error: "No available links left to generate."
			});
		}

		const nextDomain = links[user.generatedDomains];
		user.generatedDomains += 1;
		await setReferrals(referrals);

		reply.send({
			success: true,
			domain: nextDomain,
			generatedCount: user.generatedDomains,
			referredCount: user.referredUsers?.length || 0,
			message: `You have generated ${user.generatedDomains} domain(s).`
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

	fastify.get("/share/:referralCode", async (request, reply) => {
		const referralCode = request.params.referralCode;
		reply.type("text/html").send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Logging Referral...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <div class="container">
        <h1>Logging this referral</h1>
        <p>Please wait... Logging the referral to our database!</p>
        <div class="spinner"></div>
        <p class="footer">© 2025 Abyss Services LLC</p>
    </div>
    <script>
    (async function() {
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

        try {
            const response = await fetch("/acc/visit-referral", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ referralCode: "${referralCode}", sessionId })
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background: #0a0a0a;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            text-align: center;
        }
        .container { max-width: 500px; padding: 20px; }
        h1 { font-size: 2.5rem; margin-bottom: 10px; }
        p { font-size: 1.2rem; margin-bottom: 20px; }
        .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .footer { font-size: 0.9rem; opacity: 0.7; margin-top: 20px; }
    </style>
</body>
</html>
        `);
	});

	fastify.get("/uv/uv.config.js", (req, res) => {
		return res.sendFile("uv/uv.config.js", publicPath);
	});

	fastify.get("/get-links", async (request, reply) => {
		try {
			const links = await getLinks();
			reply.send(links);
		} catch (err) {
			console.error("Error fetching links:", err);
			reply.status(500).send({
				error: "Failed to retrieve links."
			});
		}
	});

	fastify.get("/ip/", async (request, reply) => {
		try {
			const response = await axios.get("https://api.ipify.org?format=json");
			reply.send(response.data);
		} catch (err) {
			console.error("Error fetching IP:", err);
			reply.code(500).send({
				error: "Failed to fetch IP"
			});
		}
	});

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	function shutdown() {
		console.log("SIGTERM signal received: closing HTTP server");
		fastify.close();
		process.exit(0);
	}

	fastify.listen({
		port,
		host: "0.0.0.0"
	}, (err, address) => {
		if (err) throw err;
		console.log("Worker is listening");
	});
} export default (req, res) => {
  // Your logic here
  res.send('Hello, world!');
};
