"use strict";
const tls = require("tls");
const WebSocket = require("ws");
const fs = require("fs");
const https = require("https");
const extractJsonFromString = require("extract-json-from-string");
const readline = require("readline");
const http2 = require("http2");
const crypto = require("crypto");
const { exec } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


let config;
try {
    const configFile = fs.readFileSync('config.json', 'utf8');
    config = JSON.parse(configFile);
} catch (error) {
    console.error('Error reading config file:', error);
    process.exit(1);
}

const POOL_SIZE = 7;
const connectionPool = [];

let vanity;
let mfaToken = "";
let filterEnabled = false;
const guilds = new Map();

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim().toLowerCase());
        });
    });``
}

function filterVanity(vanityURL) {
    if (typeof vanityURL !== "string") return false;
    if (!filterEnabled) return true;
    return vanityURL.length === 2;
}

async function initializeFilter() {
    if (config.FilterEnabled && (config.FilterEnabled.toLowerCase() === "on" || config.FilterEnabled.toLowerCase() === "off")) {
        filterEnabled = config.FilterEnabled.toLowerCase() === "on";
        console.log(`Filter ${filterEnabled ? "enabled (from config)" : "disabled (from config)"}`);
    } else {
        const answer = await askQuestion("Enable filter? (on/off): ");
        filterEnabled = answer === "on" || answer === "yes" || answer === "y";
        console.log(`Filter ${filterEnabled ? "enabled" : "disabled"}`);
    }
}

const createSession = () => http2.connect("https://canary.discord.com/", {
    settings: { enablePush: false, noDelay: true },
    secureContext: tls.createSecureContext({
        ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256',
        rejectUnauthorized: true,
    })
});

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Authorization': config.claimToken,
    'Content-Type': 'application/json',
    'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImFyIiwiaGFzX2NsaWVudF9tb2RzIjpmYWxzZSwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSHRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEzOS4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTM5LjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiJodHRwczovL3d3dy5nb29nbGUuY29tLyIsInJlZmVycmluZ19kb21haW4iOiJ3d3cuZ29vZ2xlLmNvbSIsInNlYXJjaF9lbmdpbmUiOiJnb29nbGUiLCJyZWZlcnJlcl9jdXJyZW50IjoiIiwicmVmZXJyaW5nX2RvbWFpbl9jdXJyZW50IjoiIiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X2J1aWxkX251bWJlciI6NDM4OTcxLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsLCJjbGllbnRfbGF1bmNoX2lkIjoiNTI2ZWM1MjEtNDMwOS00ODAyLWE2N2QtM2JjYWQwMzZlNDRlIiwibGF1bmNoX3NpZ25hdHVyZSI6IjFlMjk0ZWM0LTgxNDctNDI5My05ZjFlLWFiM2Q4MmRhMTcxNyIsImNsaWVudF9oZWFydGJlYXRfc2Vzc2lvbl9pZCI6Ijk3YjA0NTBiLTZlODgtNDQ3OC05YzFhLTdhYTQ1YWE2Y2VkOCIsImNsaWVudF9hcHBfc3RhdGUiOiJmb2N1c2VkIn0=',
    'X-Discord-Locale': 'en-US',
    'X-Discord-Timezone': 'Asia/Dubai'
};

const request = (session, method, path, customHeaders = {}, body = null) => {
    const reqHeaders = { 
        ...headers, 
        ...customHeaders, 
        ":method": method, 
        ":path": path, 
        ":authority": "discord.com", 
        ":scheme": "https" 
    };

    return new Promise((resolve, reject) => {
        const stream = session.request(reqHeaders);
        const chunks = [];
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
        stream.on("error", reject);
        body ? stream.end(body) : stream.end();
    });
};

const refreshMfaToken = async (session, serverId) => {
    try {
        const response = await request(session, "PATCH", `/api/v7/guilds/${serverId}/vanity-url`);
        const data = JSON.parse(response);

        if (data.code === 60003 && data.mfa?.ticket) {
            const mfaResponse = await request(
                session, 
                "POST", 
                "/api/v9/mfa/finish", 
                {}, 
                JSON.stringify({ 
                    ticket: data.mfa.ticket, 
                    mfa_type: "password", 
                    data: config.password
                })
            );

            const mfaData = JSON.parse(mfaResponse);
            if (mfaData.token) return mfaData.token;
        }
    } catch (error) {
        console.error('Error refreshing MFA token:', error);
        return null;
    }
};

const getMfaToken = async () => {
    const session = createSession();
    const token = await refreshMfaToken(session, config.server);

    if (token) {
        console.log('MFA Token obtained successfully');
        mfaToken = token;
    } else {
        console.log('Failed to obtain MFA token');
    }

    session.destroy();
};

async function mfaWatcher() { 
    await getMfaToken();
    setInterval(getMfaToken, 5 * 60 * 1000);
}

function createConnectionPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
        const tlsSocket = createSingleConnection(i);
        connectionPool.push(tlsSocket);
    }
}

function createSingleConnection(index) {
    const tlsSocket = tls.connect({
        host: "canary.discord.com",
        port: 443,
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.3",
        handshakeTimeout: 1000,
        rejectUnauthorized: false,
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384", 
        honorCipherOrder: true,
        requestOCSP: false,
        keepAlive: true,
        noDelay: true,
        enableTrace: false,
        isServer: false,
        zeroRtt: true,
        tcpNoDelay: true,
    });
    
    tlsSocket.setNoDelay(true);
    tlsSocket.setKeepAlive(true, 1000);
    tlsSocket.on("error", () => { process.exit(); });
    tlsSocket.on("end", () => { process.exit(); });
    
    tlsSocket.on("data", async (data) => {
        const ext = extractJsonFromString(data.toString());
        const find = ext.find((e) => e.code || e.message);
        
        if (find) {
            console.log('\x1b[37m' + JSON.stringify(find, null, 2) + '\x1b[0m');
            
            const codeValue = find.uses ?? find.code ?? "N/A";
            const shouldMention = codeValue === 0 || codeValue === "0";
            
const success = codeValue === 0 || codeValue === "0";

const messageContent = `\`\`\`json
 "Response": "${codeValue}", "Vanity": "${vanity || "N/A"}" ${success ? "Successfully Claimed Finlandiyalı" : ""}
\`\`\``;

const requestBody = JSON.stringify({
    content: success ? `**||@everyone||**\n${messageContent}` : messageContent
});
            
            const url = new URL(config.webhookURL);
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                }
            };
            
            const req = https.request(options, (res) => {});
            req.on('error', (error) => {
                console.error('Webhook error:', error);
            });
            req.write(requestBody);
            req.end();
        }
    });
    
    tlsSocket.on("secureConnect", () => {
        setInterval(() => {
            tlsSocket.write(["GET / HTTP/1.1", "Host: canary.discord.com", "", ""].join("\r\n"));
        }, 500);
    });
    
    return tlsSocket;
}

function setupWebSocket() {
    let websocket;
    
    function connect() {
        websocket = new WebSocket("wss://gateway.discord.gg/?v=9&encoding=json");
        
        websocket.onopen = () => { 
            if (websocket._socket) {   
                websocket._socket.setNoDelay(true); 
                websocket._socket.setKeepAlive(true, 1000); 
            } 
        };
        
        websocket.onmessage = (message) => {
            const { d, t, op } = JSON.parse(message.data);
            
            if (t === "GUILD_UPDATE") {
                const find = guilds.get(d.guild_id);
                if (find && find !== d.vanity_url_code) {
                    if (filterEnabled && !filterVanity(find)) {
                        return;
                    }
                    
                    const payload = JSON.stringify({ code: find });
                    const headers =
                        `PATCH /api/v10/guilds/${config.server}/vanity-url HTTP/1.1\r\n` +
                        `Host: canary.discord.com\r\n` +
                        `Authorization: ${config.claimToken}\r\n` +
                        `X-Discord-MFA-Authorization: ${mfaToken}\r\n` +
                        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9182 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36\r\n` +
                        `X-Super-Properties: eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC45MTgyIiwib3NfdmVyc2lvbiI6IjEwLjAuMjI2MzEiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoidHIiLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBkaXNjb3JkLzEuMC45MTgyIENocm9tZS8xMjQuMC42MzY3LjI0MyBFbGVjdHJvbi8zMC4yLjAgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjMwLjIuMCIsIm9zX3Nka192ZXJzaW9uIjoiMjI2MzEiLCJjbGllbnRfdnVibF9udW1iZXIiOjUyODI2fQ==\r\n` +
                        `Content-Type: application/json\r\n` +
                        `Connection: keep-alive\r\n` +
                        `Cookie: __Secure-recent_mfa=${mfaToken}; __Secure-mfa_token=${mfaToken}; __Secure-mfa_type=totp; __Secure-mfa_verified=true\r\n` +
                        `Content-Length: ${payload.length}\r\n\r\n` +
                        payload;

                    connectionPool.forEach((conn) => conn.write(headers));
                    vanity = `${find}`;
                }
            } else if (t === "READY") {
                d.guilds.forEach(({ id, vanity_url_code }) => {
                    if (vanity_url_code) {
                        if (!filterEnabled || filterVanity(vanity_url_code)) {
                            guilds.set(id, vanity_url_code);
                            console.log('\x1b[37m' + `Vanity listed: ${vanity_url_code}` + '\x1b[0m');
                        } else {
                            console.log('\x1b[37m' + `Filtered: ${vanity_url_code}` + '\x1b[0m');
                        }
                    }
                });
                
                const vanityList = Array.from(guilds.values()).join(', ');
                console.log('\x1b[37m' + `Guilds or Vanity (${guilds.size}) { ${vanityList} }` + '\x1b[0m');
            }
            
            if (op === 10) {
                websocket.send(JSON.stringify({
                    op: 2,
                    d: {
                        token: config.monitorToken,
                        intents: 1,
                        properties: { os: "Linux", browser: "chrome", device: "desktop" }
                    }
                }));
                
                setInterval(() => {
                    websocket.send(JSON.stringify({ op: 1, d: {}, s: null, t: "heartbeat" })); 
                }, 30000);
            }
        };
        
        websocket.onclose = () => { setTimeout(connect, 1000); };
        websocket.onerror = () => { websocket.close(); };
    }
    
    connect();
}

async function start() {
    console.log('\x1b[37m' + `Finlandiyalı` + '\x1b[0m');
    await initializeFilter();
    await mfaWatcher();
    setupWebSocket();
    createConnectionPool();
}

start();

process.on('SIGINT', () => {
    console.log('\x1b[37m' + 'Stopping service...' + '\x1b[0m');
    rl.close();
    process.exit(0);
});

