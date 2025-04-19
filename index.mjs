import cluster from "node:cluster";
import os from "node:os";
import { createServer } from "node:http";
import path, { join } from "node:path";
import fs from "fs";
import { readFile } from "fs/promises";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { createClient } from "redis";
import axios from "axios";
import wisp from "wisp-server-node";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import fastifyWebsocket from "@fastify/websocket";

const port = parseInt(process.env.PORT || "") || 8080;
const numCPUs = os.cpus().length;
const PASSWORD = "fm2!$&uprEa#Xxy%i7v*7e8jFSwmQs!!Nvz$6M44HZ%LXDs9jcWoiCXa$U&!it46SqN!s2Uf#tU8!^S^T7sDpRinY&f^RFHE5v$76njuhrvV^Ape#sSA@WQ9!f9h!YKT";
const publicPath = join(process.cwd(), "static");
const uvPath     = join(process.cwd(), "uv");
const PORN_BLOCK_FILE = "blocklists/porn-block.txt";
const LINKS_FILE      = "links.json";

// Redis setup
const redis = createClient();
await redis.connect();
const sub   = redis.duplicate();
await sub.connect();

// WebSocket client registry
const sockets = new Set();

// Load porn blocklist
let pornDomains = new Set();
if (fs.existsSync(PORN_BLOCK_FILE)) {
  try {
    const domains = fs.readFileSync(PORN_BLOCK_FILE, "utf-8").split("\n");
    pornDomains = new Set(domains.map(d => d.trim()));
    console.log(`Loaded ${pornDomains.size} porn domains.`);
  } catch (err) {
    console.error("Error reading porn-block.txt:", err);
  }
}

// Utility functions
function formatTime(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hrs = Math.floor(minutes/60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""}`;
  const days = Math.floor(hrs/24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""}`;
  const mos = Math.floor(days/30);
  if (mos < 12) return `${mos} month${mos !== 1 ? "s" : ""}`;
  const yrs = Math.floor(mos/12);
  return `${yrs} year${yrs !== 1 ? "s" : ""}`;
}
function timeAgo(ts) {
  const sec = Math.floor((Date.now()-ts)/1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec/60);
  if (min < 60) return `${min} minutes ago`;
  const hrs = Math.floor(min/60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs/24);
  if (days < 30) return `${days} days ago`;
  const mos = Math.floor(days/30);
  if (mos < 12) return `${mos} months ago`;
  const yrs = Math.floor(mos/12);
  return `${yrs} years ago`;
}

function isAdmin(request) {
  return request.cookies?.admin_session === "true";
}
const SESSION_PREFIX = "sess:";
const ACCOUNT_PREFIX = "acc:";
const REFERRAL_KEY   = "referrals";
const LINKS_KEY      = "links";

function sessionKey(id) { return `${SESSION_PREFIX}${id}`; }
function accountKey(u){ return `${ACCOUNT_PREFIX}${u}`; }

async function getSession(id) {
  const d = await redis.get(sessionKey(id));
  return d ? JSON.parse(d) : null;
}
async function setSession(id,v) {
  await redis.set(sessionKey(id), JSON.stringify(v));
}
async function deleteSession(id) {
  await redis.del(sessionKey(id));
}
async function getAllSessions() {
  const keys = await redis.keys(`${SESSION_PREFIX}*`);
  const out = {};
  for (let k of keys) {
    const d = await redis.get(k);
    if (d) out[k.slice(SESSION_PREFIX.length)] = JSON.parse(d);
  }
  return out;
}

async function getAccount(u) {
  const d = await redis.get(accountKey(u));
  return d ? JSON.parse(d) : null;
}
async function setAccount(u,v) {
  await redis.set(accountKey(u), JSON.stringify(v));
}
async function deleteAccount(u) {
  await redis.del(accountKey(u));
}

async function getReferrals() {
  const d = await redis.get(REFERRAL_KEY);
  if (!d) return {};
  const parsed = JSON.parse(d);
  // ensure arrays
  for (let u in parsed) {
    if (parsed[u].referredUsers && !Array.isArray(parsed[u].referredUsers)) {
      parsed[u].referredUsers = Object.values(parsed[u].referredUsers);
    }
  }
  return parsed;
}
async function setReferrals(r) {
  await redis.set(REFERRAL_KEY, JSON.stringify(r));
}

async function getLinks() {
  try {
    const txt = await readFile(LINKS_FILE, "utf8");
    const arr = JSON.parse(txt);
    // mirror into Redis
    await redis.set(LINKS_KEY, JSON.stringify(arr));
    return arr;
  } catch (err) {
    console.error("getLinks error:", err);
    return [];
  }
}

// publish‐subscribe for WS
function broadcast(data) {
  redis.publish("helium:ws", JSON.stringify(data));
}
await sub.subscribe("helium:ws", raw => {
  for (let c of sockets) c.socket.send(raw);
});

// clustering
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} running`);
  for (let i=0; i<numCPUs; i++) cluster.fork();
  cluster.on("exit",(w,c,s)=> {
    console.log(`Worker ${w.process.pid} died, respawning`);
    cluster.fork();
  });
} else {
  const fastify = Fastify({
    serverFactory: handler => {
      return createServer()
        .on("request", (req,res)=> handler(req,res))
        .on("upgrade", (req,socket,head)=> {
          if (req.url.endsWith("/wisp/")) wisp.routeRequest(req,socket,head);
          else socket.end();
        });
    }
  });

  // WebSocket endpoint
  fastify.register(fastifyWebsocket);
  fastify.get("/ws", { websocket:true }, (connection, req) => {
    sockets.add(connection);
    connection.socket.on("close", ()=> sockets.delete(connection));
  });

  // static & cookie
  fastify.register(fastifyCookie);
  fastify.register(fastifyStatic, { root: publicPath, decorateReply:true });
  fastify.register(fastifyStatic, { root: uvPath,     prefix:"/staff/", decorateReply:false });
  fastify.register(fastifyStatic, { root: epoxyPath,  prefix:"/epoxy/", decorateReply:false });
  fastify.register(fastifyStatic, { root: baremuxPath, prefix:"/baremux/", decorateReply:false });

  // ——— Auth
  fastify.post("/login", async (req,reply) => {
    const { password } = req.body;
    if (password === PASSWORD) {
      reply.setCookie("admin_session","true",{ path:"/admin", httpOnly:true })
           .send({ success:true });
    } else {
      reply.send({ success:false });
    }
  });
  fastify.post("/logout", async (req,reply) => {
    reply.clearCookie("admin_session",{ path:"/admin" })
         .send({ success:true });
  });

  fastify.addHook("preHandler", async (req,reply) => {
    const allowed = ["/admin/login","/login.html","/login"];
    if (req.url.startsWith("/admin") && !allowed.includes(req.url)) {
      if (!isAdmin(req)) return reply.redirect("/admin/login");
    }
  });

  // ——— Ban endpoints
  fastify.post("/ban/:id", async (req,reply) => {
    const { id } = req.params;
    const { message, duration } = req.body;
    let session = await getSession(id) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    if (!session.banned) {
      session.banned = true;
      session.banMessage = message || "You have been banned.";
      if (duration) {
        const expiresAt = Date.now() + duration*60000;
        session.banExpires = expiresAt;
        setTimeout(async ()=> {
          session.banned = false;
          delete session.banExpires;
          delete session.banMessage;
          await setSession(id,session);
        }, duration*60000);
      }
    } else {
      session.banned = false;
      delete session.banExpires;
      delete session.banMessage;
    }
    await setSession(id, session);
	broadcast({
		type: "sessionStatus",
		sessionId: id,
		status: session.banned ? "Banned" : session.status
		});
    reply.send({ status:"ok", banned:session.banned });
  });

  fastify.get("/ban/message/:id", async (req,reply) => {
    const { id } = req.params;
    let session = await getSession(id) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    let remaining = null;
    if (session.banExpires) {
      const left = session.banExpires - Date.now();
      if (left>0) remaining = formatTime(Math.ceil(left/60000));
      else {
        session.banned = false;
        delete session.banExpires;
        delete session.banMessage;
        await setSession(id,session);
      }
    }
    reply.send({ message: session.banMessage||"You have been banned.", duration: remaining||"Unlimited" });
  });

  // ——— Heartbeat & logging
  const timeouts = {};
  fastify.post("/heartbeat", async (req,reply) => {
    const sessionId = req.headers["x-session-id"]||"MISSING";
    let session = await getSession(sessionId) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    if (session.banned) return reply.send({ status:"banned" });
    session.lastOnline = Date.now();
    session.status     = "Online";
    if (timeouts[sessionId]) clearTimeout(timeouts[sessionId]);
    timeouts[sessionId] = setTimeout(async ()=> {
      session.status = "Offline";
      await setSession(sessionId, session);
      broadcast({ type:"sessionStatus", sessionId, status:"Offline" });
    }, 12000);
    await setSession(sessionId, session);
    reply.send({ status:"ok" });
    broadcast({ type:"sessionStatus", sessionId, status:"Online" });
  });

  fastify.post("/log", async (req,reply) => {
    const sessionId = req.headers["x-session-id"]||"MISSING";
    const { url } = req.body;
    const ts = Date.now();
    if (!url) return reply.status(400).send({ error:"Missing URL" });
    let session = await getSession(sessionId) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    if (session.banned) return reply.send({ status:"banned" });
    session.logs.push({ url, timestamp:ts });
    await setSession(sessionId, session);
    reply.send({ status:"ok" });
    broadcast({ type:"logEntry", sessionId, url, timestamp:ts });
  });

  // ——— Admin messaging
  fastify.post("/admin/broadcast", async (req,reply) => {
    const { message, bgColor } = req.body;
    if (!message||!bgColor) return reply.status(400).send({ error:"Message and background color required" });
    const all = await getAllSessions();
    for (let sid in all) {
      if (all[sid].status==="Online") {
        all[sid].lastMessage = { message, bgColor };
        await setSession(sid, all[sid]);
      }
    }
	broadcast({ type: "broadcast", message, bgColor });
    reply.send({ success:true, message:"Broadcast sent" });
  });

  fastify.post("/admin/message", async (req,reply) => {
    const { sessionId, message, bgColor } = req.body;
    if (!sessionId||!message||!bgColor) return reply.status(400).send({ error:"Session, message & bgColor required" });
    let session = await getSession(sessionId);
    if (!session) return reply.status(404).send({ error:"Session not found" });
    session.lastMessage = { message, bgColor };
    await setSession(sessionId, session);
	broadcast({ type: "individualMessage", sessionId, message, bgColor });
    reply.send({ success:true, message:"Message sent" });
  });

  fastify.get("/get-broadcasts/:sessionId", async (req,reply) => {
    const { sessionId } = req.params;
    let s = await getSession(sessionId);
    if (!s||!s.lastMessage) return reply.send({ message:null });
    const m = s.lastMessage;
    delete s.lastMessage;
    await setSession(sessionId, s);
    reply.send(m);
  });

  fastify.get("/get-message/:sessionId", async (req,reply) => {
    const { sessionId } = req.params;
    let s = await getSession(sessionId);
    if (!s||!s.lastMessage) return reply.send({ message:null });
    const m = s.lastMessage;
    delete s.lastMessage;
    await setSession(sessionId, s);
    reply.send(m);
  });

  // ——— Visited websites & sessions listing
  fastify.get("/visited-websites/logs", async (req,reply) => {
    const category = req.query.category||"all";
    const page     = parseInt(req.query.page)||1;
    const perPage  = 20;
    const allS     = await getAllSessions();
    let logs = [];
    for (let sid in allS) {
      allS[sid].logs?.forEach(l => logs.push({ sessionId:sid, url:l.url, timestamp:l.timestamp }));
    }
    logs.sort((a,b)=>b.timestamp-a.timestamp);
    if (category==="porn") {
      logs = logs.filter(e=>{
        try {
          const host = (new URL(e.url)).hostname.replace(/^www\./,"");
          if (host==="localhost"||host.endsWith(".local")) return false;
          return pornDomains.has(host);
        } catch{ return false; }
      });
    }
    const totalPages = Math.ceil(logs.length/perPage);
    const slice = logs.slice((page-1)*perPage, page*perPage);
    reply.send({ totalLogs:logs.length, totalPages, currentPage:page, logs:slice });
  });

  fastify.get("/sessions/logs", async (req,reply) => {
    const page  = parseInt(req.query.page)||1;
    const per   = 15;
    const search= (req.query.search||"").toLowerCase();
    const filter= req.query.filter||"all";
    const allS  = await getAllSessions();
    let list = Object.entries(allS).map(([id,d])=>{
      let st = d.status;
      if (st==="Offline" && d.lastOnline) st = `Last online ${timeAgo(d.lastOnline)}`;
      return { sessionId:id, lastOnline:d.lastOnline, status:d.banned?"Banned":st,
               lastVisited: d.logs.length?d.logs[d.logs.length-1]:null, banned:d.banned };
    });
    list = list.filter(s=>{
      const okSearch = s.sessionId.toLowerCase().includes(search);
      const okFilter = filter==="all" ||
                       (filter==="Online" && s.status==="Online") ||
                       (filter==="Offline"&&s.status.startsWith("Last online")) ||
                       (filter==="Banned" && s.banned);
      return okSearch && okFilter;
    });
    list.sort((a,b)=> a.status==="Online"?-1:b.status==="Online"?1:0 );
    const totalPages = Math.max(1, Math.ceil(list.length/per));
    const slice = list.slice((page-1)*per, page*per);
    reply.send({ totalSessions:list.length, totalPages, currentPage:page, sessions:slice });
  });

  fastify.get("/sessions/:id", async (req,reply) => {
    const { id } = req.params;
    let session = await getSession(id) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    let banDur = "Unlimited";
    if (session.banned && session.banExpires) {
      const left = session.banExpires-Date.now();
      if (left>0) banDur = formatTime(Math.ceil(left/60000));
      else {
        session.banned = false;
        delete session.banExpires;
        delete session.banMessage;
        await setSession(id, session);
      }
    }
    reply.send({
      sessionId: id,
      lastOnline: session.lastOnline,
      status: session.banned?"Banned":session.status,
      lastVisited: session.logs.length?session.logs[session.logs.length-1]:null,
      banned: session.banned,
      banReason: session.banned?(session.banMessage||"No reason"):null,
      banDuration: banDur,
      logs: session.logs
    });
  });

  fastify.get("/sessions/:id/logs", async (req,reply) => {
    const { id } = req.params;
    const page    = parseInt(req.query.page)||1;
    const perPage = 10;
    let session   = await getSession(id) || { logs:[], lastOnline:0, status:"Offline", banned:false };
    const totalPages = Math.ceil(session.logs.length/perPage);
    const slice      = session.logs.slice((page-1)*perPage, page*perPage);
    reply.send({ totalLogs:session.logs.length, totalPages, currentPage:page, logs:slice });
  });

  // ——— Accounts & referrals
  function calculatePerkStatus(count, manual) {
    let perk = 0;
    if (count>=20) perk=3;
    else if (count>=10) perk=2;
    else if (count>=5 ) perk=1;
    return Math.max(perk, manual);
  }

  fastify.post("/acc/create-account", async (req,reply) => {
    const { username,password } = req.body;
    const a = await getAccount(username);
    if (a) return reply.status(400).send({ error:"Username exists." });
    await setAccount(username,{ hashedPassword:password });
    reply.send({ success:true, message:"Account created" });
  });
  fastify.post("/acc/login", async (req,reply) => {
    const { username,password } = req.body;
    const a = await getAccount(username);
    if (!a||a.hashedPassword!==password) return reply.status(401).send({ error:"Invalid credentials" });
    reply.setCookie("session",username,{ path:"/", maxAge:86400 })
         .send({ success:true, message:"Login successful", session:username });
  });
  fastify.post("/acc/logout", async (req,reply) => {
    reply.clearCookie("session",{ path:"/" }).send({ success:true, message:"Logged out" });
  });
  fastify.get("/acc/session", async (req,reply) => {
    const s = req.cookies.session;
    const a = s && await getAccount(s);
    if (!s||!a) return reply.status(401).send({ error:"No active session" });
    reply.send({ success:true, username:s });
  });

  fastify.post("/acc/store-referral", async (req,reply) => {
    const { username, referralCode } = req.body;
    if (!username||!referralCode) return reply.status(400).send({ error:"Missing data" });
    const refs = await getReferrals();
    refs[username] ||= { referralLinks:[], referredUsers:[], perkStatus:0, generatedDomains:0 };
    refs[username].referralLinks.push(referralCode);
    await setReferrals(refs);
    reply.send({ success:true, message:"Stored referral code" });
  });

  fastify.post("/acc/visit-referral", async (req,reply) => {
    const { referralCode, sessionId } = req.body;
    if (!sessionId) return reply.status(400).send({ error:"Session ID required" });
    const refs = await getReferrals();
    const referrer = Object.keys(refs).find(u=>refs[u].referralLinks.includes(referralCode));
    if (!referrer) return reply.status(404).send({ error:"Invalid referral" });
    refs[referrer].referredUsers ||= [];
    if (refs[referrer].referredUsers.includes(sessionId)) {
      return reply.status(400).send({ error:"Already used this session" });
    }
    refs[referrer].referredUsers.push(sessionId);
    refs[referrer].perkStatus = calculatePerkStatus(refs[referrer].referredUsers.length, refs[referrer].perkStatus||0);
    await setReferrals(refs);
    reply.send({ success:true, message:`Referral added! ${referrer} now has ${refs[referrer].referredUsers.length}` });
  });

  fastify.post("/acc/set-perk-level", async (req,reply) => {
    const { username, perkLevel } = req.body;
    if (!username) return reply.status(400).send({ error:"Username required" });
    if (![0,1,2,3].includes(perkLevel)) return reply.status(400).send({ error:"Invalid perkLevel" });
    const refs = await getReferrals();
    refs[username] ||= { referredUsers:[], referralLinks:[], perkStatus:0, generatedDomains:0 };
    const needed = {0:0,1:5,2:10,3:20}[perkLevel];
    while (refs[username].referredUsers.length < needed) {
      refs[username].referredUsers.push(`placeholder-${refs[username].referredUsers.length+1}`);
    }
    refs[username].referredUsers = refs[username].referredUsers.slice(0,needed);
    refs[username].perkStatus = perkLevel;
    await setReferrals(refs);
    reply.send({ success:true, message:`Perk set to ${perkLevel}. Refs: ${needed}`, referredUsers: refs[username].referredUsers });
  });

  fastify.get("/acc/logs", async (req,reply) => {
    const page = parseInt(req.query.page)||1;
    const per  = 15;
    const refs = await getReferrals();
    const accKeys = await redis.keys(`${ACCOUNT_PREFIX}*`);
    const users   = accKeys.map(k=>k.slice(ACCOUNT_PREFIX.length));
    const arr = users.map(u => {
      const info = refs[u]||{ referredUsers:[], referralLinks:[], perkStatus:0 };
      return { username:u, referredCount:info.referredUsers.length, perkStatus:info.perkStatus, referralLinks:info.referralLinks };
    });
    const totalPages = Math.max(1, Math.ceil(arr.length/per));
    const slice = arr.slice((page-1)*per, page*per);
    reply.send({ totalAccounts:arr.length, totalPages, currentPage:page, accounts:slice });
  });

  fastify.post("/acc/delete-account", async (req,reply) => {
    const { username } = req.body;
    const a = await getAccount(username);
    if (!a) return reply.status(404).send({ error:"User not found" });
    await deleteAccount(username);
    const refs = await getReferrals();
    if (refs[username]) { delete refs[username]; await setReferrals(refs); }
    reply.send({ success:true, message:`Deleted account ${username}` });
  });

  fastify.post("/acc/get-referral-stats", async (req,reply) => {
    const { username } = req.body;
    const a = await getAccount(username);
    if (!a) return reply.status(404).send({ error:"User not found" });
    const refs = await getReferrals();
    const info = refs[username] || { referredUsers:[], referralLinks:[], perkStatus:0, generatedDomains:0 };
    const links = await getLinks();
    const generatedLinks = links.slice(0, info.generatedDomains);
    reply.send({
      referredCount: info.referredUsers.length,
      perkStatus:    info.perkStatus,
      referralLinks: info.referralLinks,
      generatedDomains: info.generatedDomains,
      generatedLinks
    });
  });

  fastify.post("/acc/generate-domain", async (req,reply) => {
    const { username } = req.body;
    const refs = await getReferrals();
    const user = refs[username];
    if (!username||!user) return reply.status(404).send({ error:"No such user" });
    const perk = user.perkStatus||0;
    const links= await getLinks();
    if (perk<2) return reply.status(403).send({ error:"Perk >=2 required" });
    user.generatedDomains ||= 0;
    if (perk===2 && user.generatedDomains>=1) return reply.status(400).send({ error:"Already used domain" });
    if (user.generatedDomains>=links.length)    return reply.status(400).send({ error:"No links left" });
    const next = links[user.generatedDomains];
    user.generatedDomains += 1;
    await setReferrals(refs);
    reply.send({ success:true, domain:next, generatedCount:user.generatedDomains, referredCount:user.referredUsers.length });
  });

  // ——— Admin static pages
  fastify.get("/admin",         (req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("admin","index.html"),"utf-8")));
  fastify.get("/admin/login",   (req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("admin","login.html"),"utf-8")));
  fastify.get("/admin/session", (req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("admin","session.html"),"utf-8")));
  fastify.get("/admin/logs",    (req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("admin","visited.html"),"utf-8")));
  fastify.get("/admin/accounts",(req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("admin","accounts.html"),"utf-8")));
  fastify.get("/banned",(req,reply)=> reply.type("text/html").send(fs.readFileSync(path.join("static","banned.html"),"utf-8")));
  // ——— Referral landing page
  fastify.get("/share/:referralCode", async (req,reply) => {
    const { referralCode } = req.params;
    reply.type("text/html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Logging Referral…</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>…</body></html>`);
  });

  // ——— UV config & misc
  fastify.get("/uv/uv.config.js", (req,res)=> res.sendFile("uv/uv.config.js", publicPath));
  fastify.get("/get-links", async (req,reply)=> {
    try { reply.send(await getLinks()); }
    catch(e){ console.error(e); reply.status(500).send({ error:"Failed to get links" }); }
  });
  fastify.get("/ip", async (req,reply)=> {
    try { const { data } = await axios.get("https://api.ipify.org?format=json"); reply.send(data); }
    catch(e){ console.error(e); reply.code(500).send({ error:"Failed to fetch IP" }); }
  });

  // graceful shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  function shutdown(){ fastify.close(); process.exit(0); }

  // start server
  fastify.listen({ port, host:"0.0.0.0" }, (err,address) => {
    if (err) throw err;
    console.log(`Worker ${process.pid} listening on ${address}`);
  });
}
