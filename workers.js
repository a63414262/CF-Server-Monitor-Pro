// ==========================================
// 创世时间戳与网络参数 (Genesis Setup)
// ==========================================
const EPOCH_START = 1780239482981; 
const GENESIS_NODE = 'https://sweet-mode-d36b.lucy01012023.workers.dev'; 
const DEFAULT_SEEDS = [GENESIS_NODE]; 
const SLOT_TIME = 10000; // 10秒出块
const OFFLINE_THRESHOLD = 300000; // 5分钟离线判定
const FINALITY_DEPTH = 6; // 终局确认深度

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.origin;
    
    // ==========================================
    // 0. 数据库自动化热创建
    // ==========================================
    if (!globalThis.dbInitialized) {
      try {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
        
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            name TEXT, cpu TEXT, ram TEXT, disk TEXT, load_avg TEXT, uptime TEXT, last_updated INTEGER,
            ram_total TEXT, net_rx TEXT, net_tx TEXT, net_in_speed TEXT, net_out_speed TEXT,
            os TEXT, cpu_info TEXT, arch TEXT, boot_time TEXT, ram_used TEXT, swap_total TEXT, 
            swap_used TEXT, disk_total TEXT, disk_used TEXT, processes TEXT, tcp_conn TEXT, udp_conn TEXT, 
            country TEXT, ip_v4 TEXT, ip_v6 TEXT,
            server_group TEXT DEFAULT '默认分组', price TEXT DEFAULT '', expire_date TEXT DEFAULT '', 
            bandwidth TEXT DEFAULT '', traffic_limit TEXT DEFAULT '', agent_os TEXT DEFAULT 'debian'
          )
        `).run();

        const { results: columns } = await env.DB.prepare(`PRAGMA table_info(servers)`).all();
        const existingCols = columns.map(c => c.name);
        
        const newCols = {
          ping_ct: "TEXT DEFAULT '0'", ping_cu: "TEXT DEFAULT '0'", ping_cm: "TEXT DEFAULT '0'", ping_bd: "TEXT DEFAULT '0'",
          monthly_rx: "TEXT DEFAULT '0'", monthly_tx: "TEXT DEFAULT '0'", last_rx: "TEXT DEFAULT '0'", last_tx: "TEXT DEFAULT '0'", reset_month: "TEXT DEFAULT ''",
          agent_os: "TEXT DEFAULT 'debian'",
          history: "TEXT DEFAULT '{}'",
          is_hidden: "TEXT DEFAULT 'false'",
          virt: "TEXT DEFAULT ''"
        };

        for (const [colName, colDef] of Object.entries(newCols)) {
          if (!existingCols.includes(colName)) {
            await env.DB.prepare(`ALTER TABLE servers ADD COLUMN ${colName} ${colDef}`).run();
          }
        }

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS blockchain_peers (
            domain TEXT PRIMARY KEY, 
            is_beacon TEXT DEFAULT 'false', 
            vps_count INTEGER DEFAULT 0, 
            total_asset REAL DEFAULT 0, 
            last_seen INTEGER, 
            reputation_score INTEGER DEFAULT 100
          )
        `).run();

        // 🚨 V9 大扫除：强制恢复被错误隔离的节点身份
        const fixFlag9 = await env.DB.prepare("SELECT value FROM settings WHERE key='fix_asset_bug_v9'").first();
        if (!fixFlag9) {
            await env.DB.prepare("UPDATE blockchain_peers SET is_beacon = 'true'").run(); 
            await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('fix_asset_bug_v9', 'true')").run();
        }

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS blockchain_ledger (
            slot_id INTEGER PRIMARY KEY, 
            proposer_domain TEXT, 
            block_hash TEXT, 
            parent_hash TEXT,
            payload TEXT, 
            timestamp INTEGER,
            total_difficulty INTEGER DEFAULT 0,
            status INTEGER DEFAULT 1
          )
        `).run();
        
        try { await env.DB.prepare(`ALTER TABLE blockchain_ledger ADD COLUMN parent_hash TEXT DEFAULT '0000000000000000000000000000000000000000'`).run(); } catch(e){}
        try { await env.DB.prepare(`ALTER TABLE blockchain_ledger ADD COLUMN total_difficulty INTEGER DEFAULT 0`).run(); } catch(e){}
        try { await env.DB.prepare(`ALTER TABLE blockchain_ledger ADD COLUMN status INTEGER DEFAULT 1`).run(); } catch(e){}

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS checkpoints (
            slot_id INTEGER PRIMARY KEY, 
            state_root TEXT,
            state_snapshot TEXT,
            block_hash TEXT,
            signature TEXT
          )
        `).run();
        try { await env.DB.prepare(`ALTER TABLE checkpoints ADD COLUMN state_snapshot TEXT`).run(); } catch(e){}
        try { await env.DB.prepare(`ALTER TABLE checkpoints ADD COLUMN block_hash TEXT`).run(); } catch(e){}
        try { await env.DB.prepare(`ALTER TABLE checkpoints ADD COLUMN signature TEXT`).run(); } catch(e){}

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS blockchain_wallets (
            address TEXT PRIMARY KEY, 
            balance REAL DEFAULT 0
          )
        `).run();

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS mempool (
            tx_id TEXT PRIMARY KEY, 
            payload TEXT, 
            timestamp INTEGER
          )
        `).run();

        try { await env.DB.prepare(`DROP TABLE IF EXISTS executed_txs`).run(); } catch(e) {}

        // 🚨 V10.1 终极对齐：强制删除本地旧分叉数据，从创世节点重新全量同步
        if (host !== GENESIS_NODE) {
            const forceSyncV10 = await env.DB.prepare("SELECT value FROM settings WHERE key='force_sync_v10_1'").first();
            if (!forceSyncV10) {
                await env.DB.prepare("DELETE FROM blockchain_ledger").run();
                await env.DB.prepare("DELETE FROM blockchain_wallets").run();
                await env.DB.prepare("DELETE FROM checkpoints").run();
                await env.DB.prepare("DELETE FROM mempool").run();
                await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('force_sync_v10_1', 'true')").run();
                await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rebuild_ledger', 'true')").run();
                console.log("已强制清除本地旧区块数据，准备从创世节点全量同步");
            }
        }

        await env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('is_beacon', 'true')`).run();

        let initialPeers = [...DEFAULT_SEEDS];
        let initialPingNodes = { ct: [], cu: [], cm: [] };
        
        try {
            const ghRes = await fetch('https://raw.githubusercontent.com/a63414262/CF-Server-Monitor-Pro/refs/heads/main/nodes.json', { signal: AbortSignal.timeout(5000) });
            if (ghRes.ok) {
                const ghData = await ghRes.json();
                if (ghData.peers && Array.isArray(ghData.peers)) {
                    initialPeers = ghData.peers;
                }
                if (ghData.ct) initialPingNodes.ct = ghData.ct;
                if (ghData.cu) initialPingNodes.cu = ghData.cu;
                if (ghData.cm) initialPingNodes.cm = ghData.cm;
            }
        } catch(e) {}

        for (const peer of initialPeers) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO blockchain_peers (domain, is_beacon, vps_count, total_asset, last_seen, reputation_score)
              VALUES (?, 'true', 0, 0, ?, 9999)
            `).bind(peer, Date.now()).run();
        }

        await env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('ping_nodes_list', ?)`).bind(JSON.stringify(initialPingNodes)).run();

        if (host !== GENESIS_NODE && initialPeers.includes(GENESIS_NODE)) {
            ctx.waitUntil(fetch(`${GENESIS_NODE}/api/consensus/register`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ domain: host, is_beacon: 'true', vps_count: 0, total_asset: 0 })
            }).catch(()=>{}));
        }

        globalThis.dbInitialized = true;
      } catch (e) {
        console.error("❌ 数据库自动初始化失败:", e);
      }
    }

    let sys = {
      site_title: '⚡ Server Monitor Pro', admin_title: '⚙️ 探针管理后台',
      theme: 'theme1', custom_bg: '', custom_css: '', custom_head: '', custom_script: '', 
      is_public: 'true', show_price: 'true', show_expire: 'true', show_bw: 'true', show_tf: 'true',
      show_asset: 'false', asset_currency: '元', is_beacon: 'true', enable_ranking: 'false', ranking_api: '',
      tg_notify: 'false', tg_bot_token: '', tg_chat_id: '',
      auto_reset_traffic: 'false', report_interval: '5',
      ping_node_ct: 'default', ping_node_cu: 'default', ping_node_cm: 'default',
      miner_wallet: '', ping_nodes_list: ''
    };

    try {
      const { results } = await env.DB.prepare('SELECT * FROM settings').all();
      if (results && results.length > 0) results.forEach(r => sys[r.key] = r.value);
    } catch (e) {}

    if (request.method === 'GET' && url.pathname === '/config.json') {
      const cache = caches.default;
      let response = await cache.match(request);
      
      if (!response) {
        if (!globalThis.configCache) {
           globalThis.configCache = JSON.stringify({ INTERVAL: parseInt(sys.report_interval || '5'), CT: sys.ping_node_ct, CU: sys.ping_node_cu, CM: sys.ping_node_cm });
        }
        let configData = globalThis.configCache;
        response = new Response(configData, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=5, s-maxage=15' 
          }
        });
        ctx.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    }

    const getNetworkTime = () => Date.now();

    const consensusResponse = (body, status = 200) => {
        const headers = new Headers();
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('X-Network-Time', getNetworkTime().toString());
        if (typeof body === 'object') {
            headers.set('Content-Type', 'application/json');
            return new Response(JSON.stringify(body), { status, headers });
        }
        return new Response(body, { status, headers });
    };

    const fetchWithTimeSync = async (url, opts = {}, peerDomain = null) => {
        if (!opts.signal) opts.signal = AbortSignal.timeout(3000);
        try {
            const res = await fetch(url, opts);
            return res;
        } catch(e) {
            return new Response(null, { status: 504 });
        }
    };

    const executeBatchWithRetry = async (batchStmts, maxRetries = 3) => {
        if (!batchStmts || batchStmts.length === 0) return true;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await env.DB.batch(batchStmts);
                return true;
            } catch (e) {
                if (attempt === maxRetries - 1) throw e;
                // 引入 Math.random() * 50 增加防死锁抖动 (Jitter)
                await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt) + Math.random() * 50)); 
            }
        }
        return false;
    };

    const formatBytes = (bytes) => {
      const b = parseInt(bytes);
      if (isNaN(b) || b === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const miniHash = async (str) => {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const calcServerAsset = (server, nowMs) => {
        let amount = 0; let remValue = 0;
        try {
            if (server.price && typeof server.price === 'string' && server.price.match(/[\d.]+/)) {
                const match = server.price.match(/[\d.]+/);
                let rawAmount = match ? parseFloat(match[0]) : 0;
                if (isNaN(rawAmount)) rawAmount = 0;
                rawAmount = Math.min(rawAmount, 10000); 

                let rate = 1; const pUpper = server.price.toUpperCase();
                if (pUpper.includes('USD') || pUpper.includes('$')) rate = 7.23;
                else if (pUpper.includes('EUR') || pUpper.includes('€')) rate = 7.85;
                else if (pUpper.includes('GBP') || pUpper.includes('£')) rate = 9.12;
                else if (pUpper.includes('HKD')) rate = 0.92;
                else if (pUpper.includes('JPY')) rate = 0.048;
                else if (pUpper.includes('TWD')) rate = 0.22;
                else if (pUpper.includes('RUB')) rate = 0.078;
                else if (pUpper.includes('CAD')) rate = 5.25;
                else if (pUpper.includes('AUD')) rate = 4.75;
                
                amount = rawAmount * rate;
                if (isNaN(amount)) amount = 0;

                let cycleDays = 365; 
                const priceStr = server.price.toLowerCase();
                if (priceStr.includes('月') || priceStr.includes('mo')) cycleDays = 30;
                else if (priceStr.includes('季') || priceStr.includes('qu')) cycleDays = 90;
                else if (priceStr.includes('半年') || priceStr.includes('half')) cycleDays = 180;
                else if (priceStr.includes('天') || priceStr.includes('day')) cycleDays = 1;
                
                let expDays = -1;
                if (server.expire_date) {
                    const expTime = new Date(server.expire_date).getTime();
                    if (!isNaN(expTime)) {
                        const diff = expTime - nowMs;
                        expDays = diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) : 0;
                    }
                }
                if (expDays === -1) remValue = amount; else remValue = (amount / cycleDays) * expDays;
                if (isNaN(remValue)) remValue = 0;
            }
        } catch(e) {}
        
        return { amount: amount || 0, remValue: remValue || 0 };
    };

    const getBootstrapPeers = async () => {
        const { results } = await env.DB.prepare(`SELECT domain FROM blockchain_peers WHERE is_beacon IN ('true', '1') ORDER BY last_seen DESC LIMIT 10`).all();
        let peers = results.map(r => r.domain);

        DEFAULT_SEEDS.forEach(seed => {
            if (!peers.includes(seed) && seed !== host) peers.push(seed);
        });

        return peers;
    };

    const getValidLeadersForSlot = async (slotId) => {
        let leaderPool = [GENESIS_NODE];
        try {
            const { results: recentBlocks } = await env.DB.prepare('SELECT payload FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 5').all();
            for (const b of recentBlocks) {
                if (!b || !b.payload) continue;
                const pl = JSON.parse(b.payload);
                if (pl.active_nodes && Array.isArray(pl.active_nodes) && pl.active_nodes.length > 0) {
                    leaderPool = pl.active_nodes;
                    break;
                }
            }
        } catch(e) {}
        
        if (!leaderPool.includes(GENESIS_NODE)) leaderPool.push(GENESIS_NODE);
        
        leaderPool = [...new Set(leaderPool)].sort();

        const hashHex = await miniHash(slotId + "-deterministic-seed-v10");
        const pseudoRandom = parseInt(hashHex.substring(0, 8), 16);
        
        const leaders = [];
        for(let i=0; i<5; i++) {
            leaders.push(leaderPool[(pseudoRandom + i) % leaderPool.length]);
        }
        return leaders;
    };

    const evaluateTxs = async (txs) => {
        const { results: wallets } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets').all();
        let balances = new Map();
        wallets.forEach(w => balances.set(w.address, w.balance));

        let validTxs = [];
        let stateDiff = new Map();

        for (const tx of txs) {
            if (!tx || !tx.id || tx.amount <= 0) continue;
            const amt = parseFloat(tx.amount);
            
            if (tx.type !== 'COINBASE' && tx.from) {
                const currentFrom = balances.get(tx.from) || 0;
                if (currentFrom < amt) continue; 
                balances.set(tx.from, currentFrom - amt);
                stateDiff.set(tx.from, (stateDiff.get(tx.from) || 0) - amt);
            }
            
            if (tx.to) {
                balances.set(tx.to, (balances.get(tx.to) || 0) + amt);
                stateDiff.set(tx.to, (stateDiff.get(tx.to) || 0) + amt);
            }
            validTxs.push(tx);
        }
        
        let finalWallets = Array.from(balances.entries())
            .filter(([addr, bal]) => bal > 0)
            .map(([addr, bal]) => ({ address: addr, balance: bal }))
            .sort((a, b) => a.address === b.address ? 0 : (a.address < b.address ? -1 : 1));
            
        const stateStr = finalWallets.map(w => `${w.address}:${w.balance.toFixed(6)}`).join('|');
        const state_root = await miniHash(stateStr);

        return { validTxs, stateDiff, state_root };
    };

    const getTxsStateStmts = (allTxs, stateDiffMap) => {
        let batchStmts = [];
        for (const tx of allTxs) {
            if (tx && tx.id) {
                batchStmts.push(env.DB.prepare(`DELETE FROM mempool WHERE tx_id = ?`).bind(tx.id));
            }
        }
        for (const [addr, diff] of stateDiffMap.entries()) {
            if (diff !== 0) {
                batchStmts.push(env.DB.prepare(`
                    INSERT INTO blockchain_wallets (address, balance) 
                    VALUES (?, ?) 
                    ON CONFLICT(address) DO UPDATE SET balance = balance + excluded.balance
                `).bind(addr, diff));
            }
        }
        return batchStmts;
    };

    const rebuildBalances = async () => {
        try {
            const ck = await env.DB.prepare('SELECT slot_id, state_snapshot FROM checkpoints ORDER BY slot_id DESC LIMIT 1').first();
            let startSlot = 0;
            let newBalances = {};
            
            if (ck && ck.state_snapshot) {
                startSlot = ck.slot_id;
                try { newBalances = JSON.parse(ck.state_snapshot); } catch(e) {}
            }

            let executed = new Set();
            let lastId = startSlot;
            while (true) {
                const { results: blocks } = await env.DB.prepare('SELECT slot_id, payload, block_hash FROM blockchain_ledger WHERE slot_id > ? AND status = 1 ORDER BY slot_id ASC LIMIT 1000').bind(lastId).all();
                if (!blocks || blocks.length === 0) break;
                for (const b of blocks) {
                    lastId = b.slot_id;
                    try {
                        const pl = JSON.parse(b.payload);
                        if (pl.txs && Array.isArray(pl.txs)) {
                            for (const tx of pl.txs) {
                                if (!tx || !tx.id || executed.has(tx.id)) continue;
                                const amount = parseFloat(tx.amount) || 0;
                                if (amount <= 0) continue;
                                if (tx.type !== 'COINBASE' && tx.from) {
                                    const currentFromBal = newBalances[tx.from] || 0;
                                    if (currentFromBal < amount) continue; 
                                    newBalances[tx.from] = currentFromBal - amount;
                                }
                                if (tx.to) newBalances[tx.to] = (newBalances[tx.to] || 0) + amount;
                                executed.add(tx.id);
                            }
                        }
                    } catch(e) {}
                }
            }
            
            const { results: currentWallets } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets').all();
            let oldBalances = {};
            for (const w of currentWallets) oldBalances[w.address] = w.balance;
            
            let batchStmts = [];
            for (const [addr, newBal] of Object.entries(newBalances)) {
                if (newBal > 0) {
                    if (oldBalances[addr] !== newBal) {
                        batchStmts.push(env.DB.prepare('INSERT INTO blockchain_wallets (address, balance) VALUES (?, ?) ON CONFLICT(address) DO UPDATE SET balance = ?').bind(addr, newBal, newBal));
                    }
                    delete oldBalances[addr]; 
                }
            }
            for (const addr of Object.keys(oldBalances)) {
                batchStmts.push(env.DB.prepare('DELETE FROM blockchain_wallets WHERE address = ?').bind(addr));
            }
            if (batchStmts.length > 0) {
                for (let i = 0; i < batchStmts.length; i += 100) await executeBatchWithRetry(batchStmts.slice(i, i + 100));
            }
        } catch(e) {}
    };

    const checkAndRebuildLedger = async () => {
        try {
            const flag = await env.DB.prepare("SELECT value FROM settings WHERE key='rebuild_ledger'").first();
            if (flag && flag.value === 'true') {
                await env.DB.prepare("UPDATE settings SET value='false' WHERE key='rebuild_ledger'").run();
                await rebuildBalances();
            }
        } catch (e) {}
    };
    ctx.waitUntil(checkAndRebuildLedger());

    const resolveFork = async (peerDomain, sinceSlot) => {
        try {
            const localTopRow = await env.DB.prepare('SELECT slot_id FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
            const localHeight = localTopRow ? localTopRow.slot_id : 0;

            const syncRes = await fetchWithTimeSync(`${peerDomain}/api/consensus/sync?since_slot=${sinceSlot}`, {}, peerDomain);
            if (!syncRes.ok) return;
            const syncData = await syncRes.json();
            if (!syncData.blocks || syncData.blocks.length === 0) return;

            const forkStartSlot = syncData.blocks[0].slot_id;
            if (localHeight - forkStartSlot >= FINALITY_DEPTH) return;

            let forkResolved = false;
            let batchStmts = [];
            batchStmts.push(env.DB.prepare(`UPDATE blockchain_ledger SET status = 0 WHERE slot_id >= ?`).bind(forkStartSlot));

            for (const b of syncData.blocks) {
                batchStmts.push(env.DB.prepare(`
                    INSERT OR IGNORE INTO blockchain_ledger (slot_id, proposer_domain, block_hash, parent_hash, payload, timestamp, total_difficulty, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                `).bind(b.slot_id, b.proposer_domain, b.block_hash, b.parent_hash || '', b.payload, b.timestamp || getNetworkTime(), b.total_difficulty || 0));
                forkResolved = true;
            }

            if (forkResolved && batchStmts.length > 0) {
                const batchSuccess = await executeBatchWithRetry(batchStmts);
                if (batchSuccess) {
                    await env.DB.prepare(`DELETE FROM blockchain_ledger WHERE status = 0`).run();
                    await env.DB.prepare("UPDATE settings SET value='true' WHERE key='rebuild_ledger'").run();
                    await rebuildBalances();
                }
            }
        } catch(e) {}
    };

    const checkAuth = (req) => {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return false;
      const [scheme, encoded] = authHeader.split(' ');
      if (scheme !== 'Basic' || !encoded) return false;
      const decoded = atob(encoded);
      const [username, password] = decoded.split(':');
      return username === 'admin' && password === env.API_SECRET;
    };

    const authResponse = (realmTitle) => new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': `Basic realm="${realmTitle}"` }
    });

    if (request.method === 'GET' && url.searchParams.get('action') === 'balance') {
        const addr = url.searchParams.get('address') || '';
        try {
            const wallet = await env.DB.prepare('SELECT balance FROM blockchain_wallets WHERE address = ?').bind(addr).first();
            return consensusResponse({ balance: wallet ? wallet.balance : 0 });
        } catch(e) {
            return consensusResponse({ balance: 0 });
        }
    }

    // ==========================================
    // Web3 共识网络核心路由
    // ==========================================
    globalThis.forkObservations = globalThis.forkObservations || new Map();

    if (url.pathname.startsWith('/api/consensus/')) {
        const route = url.pathname.replace('/api/consensus/', '');
        
        if (request.method === 'POST' && route === 'register') {
            try {
                const data = await request.json();
                if (data.domain) {
                    const isBeaconStr = data.is_beacon ? 'true' : 'false';
                    await env.DB.prepare(`
                        INSERT INTO blockchain_peers (domain, is_beacon, vps_count, total_asset, last_seen, reputation_score) 
                        VALUES (?, ?, ?, ?, ?, 100) 
                        ON CONFLICT(domain) DO UPDATE SET is_beacon=excluded.is_beacon, vps_count=excluded.vps_count, total_asset=excluded.total_asset, last_seen=excluded.last_seen
                    `).bind(data.domain, isBeaconStr, parseInt(data.vps_count)||0, parseFloat(data.total_asset)||0, Date.now()).run();
                }
                return consensusResponse({ status: 'ok' });
            } catch(e) { return consensusResponse('Error', 400); }
        }

        if (request.method === 'GET' && route === 'checkpoints') {
            const { results: checkpoints } = await env.DB.prepare('SELECT * FROM checkpoints ORDER BY slot_id DESC LIMIT 10').all();
            return consensusResponse({ checkpoints });
        }

        if (request.method === 'GET' && route === 'snapshot') {
            const { results: wallets } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets WHERE balance > 0').all();
            const latestBlock = await env.DB.prepare('SELECT slot_id, block_hash FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first() || {};
            return consensusResponse({ snapshot_slot: latestBlock.slot_id || 0, latest_hash: latestBlock.block_hash || '', wallets });
        }
        
        if (request.method === 'GET' && route === 'sync') {
            const since = parseInt(url.searchParams.get('since_slot') || '0');
            const { results: blocks } = await env.DB.prepare('SELECT * FROM blockchain_ledger WHERE slot_id > ? AND status = 1 ORDER BY slot_id ASC LIMIT 1000').bind(since).all();
            const { results: peers } = await env.DB.prepare('SELECT * FROM blockchain_peers WHERE is_beacon IN ("true", "1") ORDER BY last_seen DESC LIMIT 20').all();
            const { results: mempool } = await env.DB.prepare('SELECT * FROM mempool ORDER BY timestamp DESC LIMIT 20').all();
            return consensusResponse({ blocks, peers, mempool });
        }

        if (request.method === 'POST' && route === 'submit') {
            if (sys.is_beacon !== 'true') return consensusResponse('Not a beacon', 403);
            try {
                const block = await request.json();

                const currentSlot = Math.max(1, Math.floor((getNetworkTime() - EPOCH_START) / SLOT_TIME));
                if (parseInt(block.slot_id) > currentSlot + 3) return consensusResponse('Block from future rejected', 400);

                const expectedSig = await miniHash(`${block.proposer_domain}-${block.slot_id}-${block.payload}`);
                if (block.signature !== expectedSig) return consensusResponse('Invalid Signature', 403);
                
                const expectedHash = await miniHash(`${block.slot_id}-${block.parent_hash}-${block.proposer_domain}-${block.payload}`);
                if (expectedHash !== block.block_hash) return consensusResponse('Invalid Hash Chain', 400);

                const pl = JSON.parse(block.payload);
                let evalResult = { validTxs: [], stateDiff: new Map() };

                if (pl.txs && pl.state_root) {
                    evalResult = await evaluateTxs(pl.txs);
                    if (evalResult.state_root !== pl.state_root) {
                        ctx.waitUntil(env.DB.prepare("UPDATE settings SET value='true' WHERE key='rebuild_ledger'").run().catch(()=>{}));
                    }
                }

                const localPrevBlock = await env.DB.prepare('SELECT slot_id, block_hash, total_difficulty FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
                const localPrevHash = localPrevBlock ? localPrevBlock.block_hash : '0000000000000000000000000000000000000000';
                const localHeight = localPrevBlock ? localPrevBlock.slot_id : 0;
                const localDifficulty = localPrevBlock ? (localPrevBlock.total_difficulty || 0) : 0;
                const blockDifficulty = parseInt(block.total_difficulty || 0);

                if (block.parent_hash !== localPrevHash && block.slot_id > 1) {
                    if (blockDifficulty > localDifficulty || (blockDifficulty === localDifficulty && block.block_hash < localPrevHash)) {
                        ctx.waitUntil(resolveFork(block.proposer_domain, Math.max(0, localHeight - 15)));
                        return consensusResponse('Syncing fork...', 202);
                    }
                    return consensusResponse('Weak Chain Rejected.', 403);
                }

                const currentBlock = await env.DB.prepare('SELECT block_hash, total_difficulty FROM blockchain_ledger WHERE slot_id = ?').bind(block.slot_id).first();
                const safeTotalAsset = Math.min(parseFloat(pl.total_asset)||0, 500000); 

                // 🚨 难度覆盖
                if (currentBlock) {
                    if (blockDifficulty > (currentBlock.total_difficulty || 0) || (blockDifficulty === (currentBlock.total_difficulty || 0) && block.block_hash < currentBlock.block_hash)) {
                        await env.DB.prepare('DELETE FROM blockchain_ledger WHERE slot_id = ?').bind(block.slot_id).run();
                    } else {
                        return consensusResponse('Block rejected: Lower difficulty for same slot', 400);
                    }
                }

                let allStmts = [];
                allStmts.push(env.DB.prepare(`INSERT OR IGNORE INTO blockchain_ledger (slot_id, proposer_domain, block_hash, parent_hash, payload, timestamp, total_difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(block.slot_id, block.proposer_domain, block.block_hash, block.parent_hash, block.payload, block.timestamp || getNetworkTime(), blockDifficulty));
                
                allStmts.push(env.DB.prepare(`
                    INSERT INTO blockchain_peers (domain, is_beacon, vps_count, total_asset, last_seen) 
                    VALUES (?, 'true', ?, ?, ?) 
                    ON CONFLICT(domain) DO UPDATE SET 
                        is_beacon='true', 
                        vps_count=excluded.vps_count, 
                        total_asset=excluded.total_asset, 
                        last_seen=MAX(last_seen, excluded.last_seen)
                `).bind(block.proposer_domain, parseInt(pl.vps_count)||0, safeTotalAsset, Date.now()));
                
                if (pl.txs && pl.txs.length > 0) allStmts.push(...getTxsStateStmts(pl.txs, evalResult.stateDiff));

                const batchSuccess = await executeBatchWithRetry(allStmts);
                if (!batchSuccess) return consensusResponse('Database Transaction Failed', 500);

                if (block.slot_id % 100 === 0 && pl.state_root) {
                    const { results: wallets } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets WHERE balance > 0').all();
                    const snapMap = {};
                    wallets.forEach(w => snapMap[w.address] = w.balance);
                    await env.DB.prepare('INSERT OR REPLACE INTO checkpoints (slot_id, state_root, state_snapshot, block_hash, signature) VALUES (?, ?, ?, ?, ?)').bind(block.slot_id, pl.state_root, JSON.stringify(snapMap), block.block_hash, block.signature).run();
                }

                if (!globalThis.gossipCache) globalThis.gossipCache = new Set();
                if (!globalThis.gossipCache.has(block.block_hash)) {
                    globalThis.gossipCache.add(block.block_hash);
                    if (globalThis.gossipCache.size > 500) globalThis.gossipCache.clear();
                    
                    ctx.waitUntil((async () => {
                        await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
                        const tip = await env.DB.prepare('SELECT block_hash FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
                        if (tip && tip.block_hash === block.block_hash) {
                            const blockData = { slot_id: block.slot_id, proposer_domain: host, block_hash: block.block_hash, parent_hash: block.parent_hash, payload: block.payload, timestamp: block.timestamp, total_difficulty: blockDifficulty, signature: block.signature };
                            const { results: beacons } = await env.DB.prepare(`SELECT domain FROM blockchain_peers WHERE is_beacon IN ('true', '1') AND domain != ? ORDER BY RANDOM() LIMIT 4`).bind(host).all();
                            for (const b of beacons) {
                                fetchWithTimeSync(`${b.domain}/api/consensus/submit`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(blockData) }, b.domain).catch(() => {});
                            }
                        }
                    })());
                }
                return consensusResponse('Consensus Accepted', 200);
            } catch(e) { return consensusResponse('Block Reject', 400); }
        }
        
        if (request.method === 'POST' && route === 'tx') {
            try {
                const data = await request.json();
                const tx = data.tx || data; 
                if (!tx || !tx.from || !tx.to || !tx.amount || tx.amount <= 0) throw new Error("Invalid Tx Payload");

                const wallet = await env.DB.prepare('SELECT balance FROM blockchain_wallets WHERE address = ?').bind(tx.from).first();
                if (!wallet || wallet.balance < tx.amount) throw new Error("Insufficient balance");

                // 直接插入 D1 数据库 Mempool，解决多节点沙箱隔离问题
                await env.DB.prepare(`INSERT OR IGNORE INTO mempool (tx_id, payload, timestamp) VALUES (?, ?, ?)`).bind(tx.id, JSON.stringify(tx), tx.timestamp).run();

                return consensusResponse('Tx Accepted', 202);
            } catch(e) { return consensusResponse('Tx Reject: ' + e.message, 400); }
        }
    }

    const mineAndGossip = async (localAsset, localVpsCount) => {
        try {
            await env.DB.prepare(`
                INSERT INTO blockchain_peers (domain, is_beacon, vps_count, total_asset, last_seen, reputation_score)
                VALUES (?, ?, ?, ?, ?, 9999)
                ON CONFLICT(domain) DO UPDATE SET is_beacon=excluded.is_beacon, vps_count=excluded.vps_count, total_asset=excluded.total_asset, last_seen=MAX(last_seen, excluded.last_seen)
            `).bind(host, sys.is_beacon === 'true' ? 'true' : 'false', localVpsCount, Math.max(0, localAsset), Date.now()).run().catch(()=>{});

            const currentNetTime = getNetworkTime();
            const currentSlot = Math.max(1, Math.floor((currentNetTime - EPOCH_START) / SLOT_TIME));
            const slotStart = EPOCH_START + currentSlot * SLOT_TIME;
            const elapsedInSlot = currentNetTime - slotStart;

            const syncFromPeer = async (peerDomain) => {
                let since = 0;
                try {
                    const localTopRow = await env.DB.prepare('SELECT slot_id FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
                    since = localTopRow ? localTopRow.slot_id : 0;
                    
                    const syncRes = await fetchWithTimeSync(`${peerDomain}/api/consensus/sync?since_slot=${Math.max(0, since - 10)}`, {}, peerDomain);
                    if (!syncRes.ok) return false;
                    const syncData = await syncRes.json();
                    if (!syncData.blocks || syncData.blocks.length === 0) return false;

                    let allStmts = [];
                    for (const b of syncData.blocks) {
                        if (b.slot_id <= currentSlot + 3) {
                            const exist = await env.DB.prepare('SELECT block_hash FROM blockchain_ledger WHERE slot_id = ? AND status = 1').bind(b.slot_id).first();
                            if (!exist) {
                                allStmts.push(env.DB.prepare(`INSERT OR IGNORE INTO blockchain_ledger (slot_id, proposer_domain, block_hash, parent_hash, payload, timestamp, total_difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(b.slot_id, b.proposer_domain, b.block_hash, b.parent_hash || '', b.payload, b.timestamp || getNetworkTime(), b.total_difficulty || 0));
                                const pl = JSON.parse(b.payload);
                                const evalRes = await evaluateTxs(pl.txs || []);
                                allStmts.push(...getTxsStateStmts(pl.txs || [], evalRes.stateDiff));
                                const safeTotalAsset = Math.min(parseFloat(pl.total_asset)||0, 500000);
                                
                                allStmts.push(env.DB.prepare(`
                                    INSERT INTO blockchain_peers (domain, is_beacon, vps_count, total_asset, last_seen) 
                                    VALUES (?, 'true', ?, ?, ?) 
                                    ON CONFLICT(domain) DO UPDATE SET 
                                        is_beacon='true', 
                                        vps_count=CASE WHEN excluded.last_seen > last_seen THEN excluded.vps_count ELSE vps_count END, 
                                        total_asset=CASE WHEN excluded.last_seen > last_seen THEN excluded.total_asset ELSE total_asset END, 
                                        last_seen=MAX(last_seen, excluded.last_seen)
                                `).bind(b.proposer_domain, parseInt(pl.vps_count)||0, safeTotalAsset, b.timestamp || getNetworkTime()));
                            }
                        }
                    }
                    if (allStmts.length > 0) {
                        for (let i = 0; i < allStmts.length; i += 100) await executeBatchWithRetry(allStmts.slice(i, i + 100));
                    }
                } catch(e) {}
                return true;
            };

            const localTopRow = await env.DB.prepare('SELECT slot_id, timestamp FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
            
            // 🚨 防止掉队
            if (!localTopRow || currentSlot - localTopRow.slot_id > 5) {
                if (host !== GENESIS_NODE) {
                    await syncFromPeer(GENESIS_NODE);
                }
            }
            
            const timeSinceLastBlock = localTopRow ? (currentNetTime - localTopRow.timestamp) : 999999;
            const leaders = await getValidLeadersForSlot(currentSlot);
            let isMyTurn = false;
            let isRescueMint = false; 
            
            // ⏱️ 完美阶梯错峰发车机制 (0s, 2s, 4s, 6s, 8s) - 让替补真正上场！
            if (sys.is_beacon === 'true') {
                if (leaders[0] === host) {
                    isMyTurn = true; // 绝对顺位 0秒出发
                } else if (leaders.length > 1 && leaders[1] === host && elapsedInSlot >= 2000) {
                    isMyTurn = true; // 主力没出，替补1 2秒接力
                } else if (leaders.length > 2 && leaders[2] === host && elapsedInSlot >= 4000) {
                    isMyTurn = true; // 替补2 4秒接力
                } else if (leaders.length > 3 && leaders[3] === host && elapsedInSlot >= 6000) {
                    isMyTurn = true; // 替补3 6秒接力
                } else if (leaders.length > 4 && leaders[4] === host && elapsedInSlot >= 8000) {
                    isMyTurn = true; // 替补4 8秒接力
                } else if (elapsedInSlot >= 9000 && timeSinceLastBlock > 25000) {
                    // 🧨 上帝模式 (Rescue Mint) : 如果全网 25 秒没人打块，任何人在 9秒时直接化身造物主强行开火！
                    isMyTurn = true; 
                    isRescueMint = true; 
                }
            }

            if (!isMyTurn) {
                if (Math.random() < 0.1) {
                    const bootstrapPeers = await getBootstrapPeers();
                    let syncTargets = bootstrapPeers.filter(p => p !== host);
                    if (syncTargets.length > 0) {
                        const target = syncTargets[Math.floor(Math.random() * syncTargets.length)];
                        fetchWithTimeSync(`${target}/api/consensus/register`, {
                            method: 'POST', headers: {'Content-Type':'application/json'},
                            body: JSON.stringify({ domain: host, is_beacon: sys.is_beacon === 'true' ? 'true' : 'false', vps_count: localVpsCount, total_asset: localAsset })
                        }, target).catch(()=>{});
                    }
                }
                return;
            }

            // 发车前最后查一次岗，避免自己撞自己
            const existCheck = await env.DB.prepare('SELECT slot_id FROM blockchain_ledger WHERE slot_id = ?').bind(currentSlot).first();
            if (existCheck) return;

            const localPrevBlock = await env.DB.prepare('SELECT block_hash, total_difficulty FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
            const parentHash = localPrevBlock ? localPrevBlock.block_hash : '0000000000000000000000000000000000000000';
            const parentDifficulty = localPrevBlock ? (localPrevBlock.total_difficulty || 0) : 0;
            const proposerAsset = Math.max(1, Math.floor(localAsset));
            
            let currentDifficulty = parentDifficulty + proposerAsset;
            if (isRescueMint) currentDifficulty += 10000000; // 难度炸弹

            const { results: pendingTxs } = await env.DB.prepare('SELECT payload FROM mempool ORDER BY timestamp ASC, tx_id ASC LIMIT 20').all();
            let blockTxs = pendingTxs.map(t => JSON.parse(t.payload));
            blockTxs.sort((a, b) => a.timestamp !== b.timestamp ? a.timestamp - b.timestamp : (a.id < b.id ? -1 : 1));

            if (sys.miner_wallet) {
                const coinbaseId = 'cb-' + currentSlot + '-' + await miniHash(host);
                blockTxs.push({ id: coinbaseId, type: 'COINBASE', to: sys.miner_wallet, amount: 1, timestamp: currentNetTime });
            }

            // 🏆 V10 扩大摇号池，让新部署的 0 资产节点也能加入全网大名单参与公平摇号！
            const activeThreshold = Date.now() - 86400000; // 24小时内活跃即可
            const { results: topPeers } = await env.DB.prepare(`SELECT domain FROM blockchain_peers WHERE is_beacon IN ('true', '1') AND last_seen > ? ORDER BY total_asset DESC, last_seen DESC LIMIT 100`).bind(activeThreshold).all();
            let active_nodes = topPeers.map(p => p.domain);
            if (!active_nodes.includes(host)) active_nodes.push(host);
            if (!active_nodes.includes(GENESIS_NODE)) active_nodes.push(GENESIS_NODE);
            active_nodes = [...new Set(active_nodes)].sort();

            const evalResult = await evaluateTxs(blockTxs);
            const state_root = evalResult.state_root;
            const payloadStr = JSON.stringify({ vps_count: localVpsCount, total_asset: localAsset, txs: blockTxs, state_root, active_nodes });
            const hash = await miniHash(`${currentSlot}-${parentHash}-${host}-${payloadStr}`);
            const signature = await miniHash(`${host}-${currentSlot}-${payloadStr}`);

            let allStmts = [];
            allStmts.push(env.DB.prepare(`INSERT OR IGNORE INTO blockchain_ledger (slot_id, proposer_domain, block_hash, parent_hash, payload, timestamp, total_difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).bind(currentSlot, host, hash, parentHash, payloadStr, currentNetTime, currentDifficulty));
            allStmts.push(...getTxsStateStmts(blockTxs, evalResult.stateDiff));

            const batchSuccess = await executeBatchWithRetry(allStmts);
            if (batchSuccess && currentSlot % 100 === 0) {
                const { results: wallets } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets WHERE balance > 0').all();
                const snapMap = {};
                wallets.forEach(w => snapMap[w.address] = w.balance);
                await env.DB.prepare('INSERT OR REPLACE INTO checkpoints (slot_id, state_root, state_snapshot, block_hash, signature) VALUES (?, ?, ?, ?, ?)').bind(currentSlot, state_root, JSON.stringify(snapMap), hash, signature).run();
            }

            if (!globalThis.gossipCache) globalThis.gossipCache = new Set();
            globalThis.gossipCache.add(hash);

            const blockData = { slot_id: currentSlot, proposer_domain: host, block_hash: hash, parent_hash: parentHash, payload: payloadStr, timestamp: currentNetTime, total_difficulty: currentDifficulty, signature: signature };
            
            const gossipLimit = isRescueMint ? 20 : 4;
            const { results: beacons } = await env.DB.prepare(`SELECT domain FROM blockchain_peers WHERE is_beacon IN ('true', '1') AND domain != ? ORDER BY RANDOM() LIMIT ?`).bind(host, gossipLimit).all();
            for (const b of beacons) {
                fetchWithTimeSync(`${b.domain}/api/consensus/submit`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(blockData) }, b.domain).catch(() => {});
            }
        } catch(e) {}
    };

    const sendTelegram = async (msg) => {
      if (sys.tg_notify !== 'true' || !sys.tg_bot_token || !sys.tg_chat_id) return;
      try {
        await fetch(`https://api.telegram.org/bot${sys.tg_bot_token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: sys.tg_chat_id, text: msg, parse_mode: 'HTML' }),
          signal: AbortSignal.timeout(3000)
        });
      } catch (e) {}
    };

    const checkOfflineNodes = async () => {
      if (sys.tg_notify !== 'true') return;
      try {
        const { results: allServers } = await env.DB.prepare('SELECT id, name, last_updated FROM servers').all();
        let alertState = {};
        const stateRes = await env.DB.prepare("SELECT value FROM settings WHERE key = 'alert_state'").first();
        if (stateRes) alertState = JSON.parse(stateRes.value);

        let stateChanged = false; const now = Date.now();
        for (const s of allServers) {
          const diff = now - s.last_updated;
          const isOffline = diff > OFFLINE_THRESHOLD; 

          if (isOffline && !alertState[s.id]) {
            await sendTelegram(`⚠️ <b>节点离线告警</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 离线 (超过5分钟未上报)\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
            alertState[s.id] = true; stateChanged = true;
          } else if (!isOffline && alertState[s.id]) {
            await sendTelegram(`✅ <b>节点恢复通知</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 恢复在线\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
            delete alertState[s.id]; stateChanged = true;
          }
        }
        if (stateChanged) {
          await env.DB.prepare('INSERT INTO settings (key, value) VALUES ("alert_state", ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(JSON.stringify(alertState)).run();
        }
      } catch (e) {}
    };

    const getFooterHtml = (sys) => `
      <div style="text-align: center; margin-top: 40px; padding-bottom: 20px; font-size: 13px; color: inherit; opacity: 0.8;">
        <div style="margin-bottom: 8px;">
            <span style="margin-right: 15px;">👁️ 历史总访问：<b style="color: #3b82f6;">${sys.visits_total || 0}</b> 次</span>
            <span>🔥 今日访问：<b style="color: #10b981;">${sys.visits_today || 0}</b> 次</span>
        </div>
        Powered by <a href="https://github.com/a63414262/CF-Server-Monitor-Pro" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 600;">CF-Server-Monitor-Pro</a> | 
        <a href="https://www.youtube.com/@%E7%A7%91%E6%8A%80KKK" target="_blank" style="color: #ef4444; text-decoration: none; font-weight: 600;">▶️ 小K分享频道</a>
      </div>
    `;

    const themeStyles = `
      body.theme2 { background-color: #0d1117; color: #c9d1d9; }
      .theme2 .vps-card, .theme2 .global-stats, .theme2 .header-card, .theme2 .chart-card { background: #161b22; color: #c9d1d9; box-shadow: 0 4px 6px rgba(0,0,0,0.4); border: 1px solid #30363d; }
      .theme2 .vps-card:hover { border-color: #8b949e; }
      .theme2 .group-header { color: #58a6ff; border-left-color: #58a6ff; }
      .theme2 .stat-val, .theme2 .g-val { color: #fff; }
      .theme2 .stat-label, .theme2 .g-label, .theme2 .g-sub, .theme2 .card-meta { color: #8b949e; }
      .theme2 .stat-bar, .theme2 .stat-bar-full { background: #21262d; }
      .theme2 .divider { background: #30363d; }
      .theme2 .card-title { color: #fff; }
      .theme2 .view-controls { background: #0d1117; border: 1px solid #30363d; }
      .theme2 .toggle-btn { color: #8b949e; }
      .theme2 .toggle-btn:hover { color: #c9d1d9; }
      .theme2 .toggle-btn.active { background: #21262d; color: #58a6ff; border: 1px solid #30363d; }
      .theme2 .custom-table { background: #161b22; color: #c9d1d9; border: 1px solid #30363d; box-shadow: none; }
      .theme2 .custom-table th { background: #0d1117; color: #8b949e; border-bottom-color: #30363d; }
      .theme2 .custom-table td { border-bottom-color: #30363d; }
      .theme2 .custom-table tr:hover { background: #21262d; }
      .theme2 .filter-tag { background: #161b22; color: #c9d1d9; border-color: #30363d; }

      body.theme3 { background-color: #fef08a; color: #000; font-weight: 500; }
      .theme3 .vps-card, .theme3 .global-stats, .theme3 .header-card, .theme3 .chart-card { background: #fff; border: 3px solid #000; border-radius: 0; box-shadow: 6px 6px 0px #000; transition: transform 0.1s, box-shadow 0.1s; }
      .theme3 .vps-card:hover { transform: translate(2px, 2px); box-shadow: 4px 4px 0px #000; border-color: #000; }
      .theme3 .group-header { color: #000; border-left: none; border-bottom: 4px solid #000; padding-left: 0; display: inline-block; font-size: 22px; font-weight: 900; text-transform: uppercase; }
      .theme3 .stat-bar, .theme3 .stat-bar-full { background: #e5e5e5; border: 1px solid #000; }
      .theme3 .stat-bar > div, .theme3 .stat-bar-full > div { border-right: 1px solid #000; }
      .theme3 .badge { border: 1px solid #000; border-radius: 0; }
      .theme3 .stat-val, .theme3 .g-val, .theme3 .card-title { font-weight: 900; color: #000; }
      .theme3 .custom-table, .theme3 .filter-tag { background: #fff; border: 3px solid #000; border-radius: 0; box-shadow: 6px 6px 0px #000; }

      body.theme4 { background: linear-gradient(45deg, #4facfe 0%, #00f2fe 100%); background-attachment: fixed; color: #fff; }
      .theme4 .vps-card, .theme4 .global-stats, .theme4 .header-card, .theme4 .chart-card { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1); color: #fff; }
      .theme4 .vps-card:hover { background: rgba(255, 255, 255, 0.3); border-color: rgba(255, 255, 255, 0.8); }
      .theme4 .group-header { color: #fff; border-left-color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      .theme4 .stat-val, .theme4 .g-val, .theme4 .card-title { color: #fff; }
      .theme4 .stat-label, .theme4 .g-label, .theme4 .g-sub, .theme4 .card-meta { color: rgba(255,255,255,0.8); }
      .theme4 .stat-bar, .theme4 .stat-bar-full { background: rgba(0,0,0,0.2); }
      .theme4 .divider { background: rgba(255,255,255,0.2); }
      .theme4 .custom-table, .theme4 .filter-tag { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.1); color: #fff; }
      .theme4 .custom-table th, .theme4 .custom-table tr:hover { background: rgba(0,0,0,0.1); color:#fff;}
      .theme4 .os-text { color: #eee; }

      body.theme5 { background-color: #050505; color: #0ff; font-family: 'Courier New', Courier, monospace; }
      .theme5 .vps-card, .theme5 .global-stats, .header-card, .theme5 .chart-card { background: #0b0c10; border: 1px solid #f0f; border-radius: 0; box-shadow: 0 0 10px rgba(255, 0, 255, 0.2); color: #fff; }
      .theme5 .vps-card:hover { box-shadow: 0 0 20px rgba(0, 255, 255, 0.5); border-color: #0ff; }
      .theme5 .group-header { color: #f0f; border-left: 5px solid #0ff; text-shadow: 0 0 5px #f0f; }
      .theme5 .stat-val, .theme5 .g-val, .theme5 .card-title { color: #0ff; text-shadow: 0 0 5px #0ff; }
      .theme5 .stat-label, .theme5 .g-label, .theme5 .g-sub, .theme5 .card-meta { color: #f0f; }
      .theme5 .stat-bar, .theme5 .stat-bar-full { background: #222; border: 1px solid #f0f; border-radius: 0; }
      .theme5 .stat-bar > div, .theme5 .stat-bar-full > div { background: #0ff !important; box-shadow: 0 0 10px #0ff; border-radius: 0; }
      .theme5 .divider { background: #333; }
      .theme5 .badge-bw { background: #f0f; box-shadow: 0 0 5px #f0f; }
      .theme5 .badge-tf { background: #0ff; color:#000; box-shadow: 0 0 5px #0ff; }
      .theme5 .custom-table, .theme5 .filter-tag { background: #0b0c10; border: 1px solid #f0f; border-radius: 0; box-shadow: 0 0 10px rgba(255, 0, 255, 0.2); color: #fff; }
      .theme5 .custom-table th { background: #111; color: #f0f; border-color: #333; }
      .theme5 .custom-table td { border-color: #333; }
      .theme5 .custom-table tr:hover { background: #222; }

      ${sys.theme === 'theme6' ? (sys.custom_css || '') : ''}
      .ping-box { font-size:11px; margin-top:10px; display:flex; gap:10px; padding: 6px 8px; border-radius: 4px; flex-wrap:wrap; background: rgba(150,150,150,0.1); border: 1px solid rgba(150,150,150,0.2); }
      .chart-full { grid-column: 1 / -1; }
      .chart-full canvas { max-height: 250px !important; }

      ${sys.custom_bg ? `
        body { background: url('${sys.custom_bg}') no-repeat center center fixed !important; background-size: cover !important; }
        .vps-card, .global-stats, .header-card, .chart-card, .custom-table, .filter-tag, .view-controls { background: rgba(255, 255, 255, 0.4) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; border: 1px solid rgba(255, 255, 255, 0.6) !important; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1) !important; color: #111 !important; }
        .vps-card:hover { background: rgba(255, 255, 255, 0.6) !important; transform: translateY(-3px); }
        .group-header { color: #fff !important; text-shadow: 0 2px 5px rgba(0,0,0,0.6) !important; border-left-color: #fff !important; }
        .stat-val, .g-val, .card-title { color: #000 !important; font-weight: 800 !important; }
        .stat-label, .g-label, .g-sub, .card-meta { color: #333 !important; font-weight: 600 !important; }
        .stat-bar, .stat-bar-full { background: rgba(0,0,0,0.1) !important; }
      ` : ''}

      .view-controls { display: flex; gap: 8px; background: rgba(0,0,0,0.05); padding: 4px; border-radius: 8px; }
      .toggle-btn { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border: none; background: transparent; cursor: pointer; border-radius: 6px; font-size: 13px; font-weight: 600; color: #64748b; transition: all 0.2s; }
      .toggle-btn:hover { color: #0f172a; }
      .toggle-btn.active { background: white; color: #3b82f6; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .custom-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
      .custom-table th { background: #f8fafc; padding: 14px 16px; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
      .custom-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
      .custom-table tr:hover { background: #f8fafc; }
      .os-text { color: #64748b; font-size: 12px; }
      .table-responsive { width: 100%; overflow-x: auto; }
      .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
      .filter-tag { display: inline-flex; align-items: center; gap: 5px; background: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #475569; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid transparent; cursor:pointer; transition: all 0.2s;}
      .filter-tag:hover { background: #f1f5f9; }
      .filter-tag.active { background: #3b82f6; color: white; border-color: #3b82f6; }
      #map-container { width: 100%; height: 500px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; border: 1px solid #e5e7eb; background-color: #b1c2d4; background-image: linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px); background-size: 20px 20px; z-index: 1; }
      body.theme2 #map-container, body.theme5 #map-container { background-color: #0d1117; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); border-color: #30363d; }
      .custom-map-badge div { background-color: #10b981; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
      .view-panel { display: none; } .view-panel.active { display: block; animation: fadeIn 0.3s ease; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      
      .stat-group { display: flex; flex-direction: column; margin-bottom: 8px; }
      .stat-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: inherit; }
      .stat-bar-full { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
      .stat-bar-full > div { height: 100%; border-radius: 3px; transition: width 0.3s; }
      .stat-subtext { font-size: 11px; color: #6b7280; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .theme2 .stat-subtext, .theme4 .stat-subtext, .theme5 .stat-subtext { color: rgba(255,255,255,0.6); }
      
      .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 15px; }
      .vps-card { display: flex; justify-content: space-between; align-items: stretch; background: white; padding: 18px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-decoration: none; color: inherit; border: 1px solid transparent; transition: all 0.2s ease; }
      .card-left { flex: 0 0 180px; display: flex; flex-direction: column; justify-content: center; }
      .card-title { display: flex; align-items: center; margin-bottom: 4px; }
      .card-title-text { font-weight: 600; }
      .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; flex-shrink:0; }
      .card-meta { font-size: 12px; color: #6b7280; margin-bottom: 3px; }
      .card-badges { margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap; }
      .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; color: white; }
      .badge-bw { background: #3b82f6; } .badge-tf { background: #10b981; } .badge-v4 { background: #a855f7; } .badge-v6 { background: #ec4899; }
      .card-right { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 15px; border-left: 1px solid rgba(150,150,150,0.1); min-width: 0; }
      .stat-bar { width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
      .stat-bar > div { height: 100%; border-radius: 2px; transition: width 0.3s; }
    `;

    // ==========================================
    // 后台管理 API (/admin/api)
    // ==========================================
    if (request.method === 'POST' && url.pathname === '/admin/api') {
      if (!checkAuth(request)) return authResponse(sys.admin_title);
      try {
        const data = await request.json();
        
        if (data.action === 'save_settings') {
          for (const [k, v] of Object.entries(data.settings)) {
            await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
          }

          const configPayload = {
            INTERVAL: parseInt(data.settings.report_interval || '5'),
            CT: data.settings.ping_node_ct || 'default',
            CU: data.settings.ping_node_cu || 'default',
            CM: data.settings.ping_node_cm || 'default'
          };
          globalThis.configCache = JSON.stringify(configPayload); 

          const cache = caches.default;
          ctx.waitUntil(cache.delete(new Request(`${host}/config.json`)));

          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } 
        else if (data.action === 'add') {
          const id = crypto.randomUUID();
          const name = data.name || 'New Server';
          await env.DB.prepare(`
            INSERT INTO servers 
            (id, name, cpu, ram, disk, load_avg, uptime, last_updated, ram_total, net_rx, net_tx, net_in_speed, net_out_speed, os, cpu_info, arch, boot_time, ram_used, swap_total, swap_used, disk_total, disk_used, processes, tcp_conn, udp_conn, country, ip_v4, ip_v6, server_group, price, expire_date, bandwidth, traffic_limit, ping_ct, ping_cu, ping_cm, ping_bd, monthly_rx, monthly_tx, last_rx, last_tx, reset_month, agent_os, history, is_hidden) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, name, '0', '0', '0', '0', '0', 0, '0', '0', '0', '0', '0', '', '', '', '', '0', '0', '0', '0', '0', '0', '0', '0', '', '0', '0', '默认分组', '免费', '', '', '', '0', '0', '0', '0', '0', '0', '0', '0', '', data.agent_os || 'debian', '{}', 'false').run();
          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } 
        else if (data.action === 'delete') {
          await env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(data.id).run();
          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        } 
        else if (data.action === 'edit') {
          await env.DB.prepare(`
            UPDATE servers SET name = ?, server_group = ?, price = ?, expire_date = ?, bandwidth = ?, traffic_limit = ?, agent_os = ?, is_hidden = ? WHERE id = ?
          `).bind(data.name || 'Unnamed', data.server_group || '默认分组', data.price || '', data.expire_date || '', data.bandwidth || '', data.traffic_limit || '', data.agent_os || 'debian', data.is_hidden || 'false', data.id).run();
          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        else if (data.action === 'send_tx') {
          if (!data.from || !data.to || !data.amount) throw new Error("Missing params");
          const amountNum = parseFloat(data.amount);
          if (amountNum <= 0) throw new Error("Invalid amount");
          
          const wallet = await env.DB.prepare('SELECT balance FROM blockchain_wallets WHERE address = ?').bind(data.from).first();
          if (!wallet || wallet.balance < amountNum) throw new Error("余额不足 (Insufficient balance)");

          const txData = { id: crypto.randomUUID(), type: 'TRANSFER', from: data.from, to: data.to, amount: amountNum, timestamp: getNetworkTime() };
          
          // 直接写入数据库，放弃容易内存泄漏且无法跨实例同步的全局变量 txBuffer
          await env.DB.prepare(`INSERT OR IGNORE INTO mempool (tx_id, payload, timestamp) VALUES (?, ?, ?)`).bind(txData.id, JSON.stringify(txData), txData.timestamp).run();
          
          ctx.waitUntil((async () => {
              const { results: beacons } = await env.DB.prepare(`SELECT domain FROM blockchain_peers WHERE is_beacon IN ('true', '1') AND domain != ? ORDER BY reputation_score DESC LIMIT 4`).bind(host).all();
              for (const b of beacons) {
                  fetchWithTimeSync(`${b.domain}/api/consensus/tx`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(txData) }, b.domain).catch(() => {});
              }
          })());

          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
    }

    // ==========================================
    // 后台管理 UI (/admin)
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/admin') {
      if (!checkAuth(request)) return authResponse(sys.admin_title);
      
      const { results } = await env.DB.prepare('SELECT id, name, last_updated, server_group, price, expire_date, bandwidth, traffic_limit, agent_os, is_hidden FROM servers').all();
      const now = Date.now();
      
      let trs = '';
      if (results && results.length > 0) {
        for (const s of results) {
          const isOnline = (now - s.last_updated) < OFFLINE_THRESHOLD;
          const status = isOnline ? '<span style="color:green; font-weight:bold;">在线</span>' : '<span style="color:red; font-weight:bold;">离线</span>';
          const hiddenBadge = s.is_hidden === 'true' ? '<span style="background:#64748b; color:white; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:5px;">已隐藏</span>' : '';
          
          const osType = s.agent_os === 'alpine' ? 'alpine' : 'debian';
          const shellType = osType === 'alpine' ? 'sh' : 'bash';
          const cmdApp = "curl";
          const cmd = `${cmdApp} -sL ${host}/install.sh?os=${osType} | ${shellType} -s ${s.id} ${env.API_SECRET}`;
          
          trs += `
            <tr>
              <td>${s.name} ${hiddenBadge}</td>
              <td>${s.server_group || '默认分组'}</td>
              <td><span style="background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:4px; font-size:12px;">${osType}</span></td>
              <td>${status}</td>
              <td>
                <input type="text" readonly value="${cmd}" style="width:260px; padding:6px; margin-right:5px; border:1px solid #ccc; border-radius:4px;" id="cmd-${s.id}">
                <button onclick="copyCmd('${s.id}')" class="btn btn-green">复制命令</button>
                <button onclick="openEditModal('${s.id}', '${s.name}', '${s.server_group||''}', '${s.price||''}', '${s.expire_date||''}', '${s.bandwidth||''}', '${s.traffic_limit||''}', '${osType}', '${s.is_hidden||'false'}')" class="btn btn-blue">✏️ 编辑</button>
                <button onclick="deleteServer('${s.id}')" class="btn btn-red">🗑️ 删除</button>
              </td>
            </tr>
          `;
        }
      }

      let walletBalance = 0;
      if (sys.miner_wallet) {
          try {
              const w = await env.DB.prepare('SELECT balance FROM blockchain_wallets WHERE address = ?').bind(sys.miner_wallet).first();
              if (w) walletBalance = w.balance;
          } catch(e) {}
      }

      // ==========================================
      // 从 D1 读取测速节点列表
      // ==========================================
      let pingOpts = { ct: [], cu: [], cm: [] };
      if (sys.ping_nodes_list) {
          try { 
              pingOpts = JSON.parse(sys.ping_nodes_list); 
          } catch(e) {}
      } else {
          try {
              const resp = await fetch('https://raw.githubusercontent.com/a63414262/CF-Server-Monitor-Pro/refs/heads/main/nodes.json', { signal: AbortSignal.timeout(4000) });
              if (resp.ok) {
                  const data = await resp.json();
                  pingOpts.ct = data.ct || []; pingOpts.cu = data.cu || []; pingOpts.cm = data.cm || [];
                  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ping_nodes_list', ?)").bind(JSON.stringify(pingOpts)).run();
              }
          } catch (e) {}
      }

      const buildOpts = (group, selectedVal) => {
          let opts = `<option value="default" ${selectedVal === 'default' ? 'selected' : ''}>默认节点 (双栈多节点轮询)</option>`;
          if (Array.isArray(group)) {
              group.forEach(n => {
                  if (n.name && n.host) {
                      opts += `<option value="${n.host}" ${selectedVal === n.host ? 'selected' : ''}>${n.name}</option>`;
                  }
              });
          }
          return opts;
      };

      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${sys.admin_title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f0f2f5; color: #333;}
          .card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); max-width: 1100px; margin: 0 auto 20px auto; }
          h2 { margin-top: 0; border-bottom: 2px solid #f0f2f5; padding-bottom: 10px; font-size: 20px;}
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
          th, td { border: 1px solid #eee; padding: 12px; text-align: left; }
          th { background: #f8f9fa; }
          .btn { cursor: pointer; border-radius: 4px; font-size: 13px; transition: opacity 0.2s; border: none; padding: 6px 10px; color: white; margin-left: 5px; }
          .btn:hover { opacity: 0.8; }
          .btn-blue { background: #3b82f6; } .btn-green { background: #10b981; } .btn-red { background: #ef4444; } .btn-gray { background: #6b7280; } .btn-purple { background: #8b5cf6; }
          .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .form-group { display: flex; flex-direction: column; margin-bottom: 15px; }
          .form-group label { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #555;}
          .form-group input[type="text"], .form-group select, .form-group input[type="date"], .form-group input[type="number"] { padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
          .form-group textarea { padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-family: monospace; font-size: 12px; resize: vertical; line-height: 1.4; background: #fafafa;}
          .checkbox-group { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 14px;}
          .checkbox-group input { width: 18px; height: 18px; cursor: pointer; }
          .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100; overflow-y: auto; }
          .modal-content { background: white; padding: 20px; border-radius: 8px; width: 450px; max-width: 95%; margin: 40px auto; position: relative; max-height: 85vh; overflow-y: auto; box-sizing: border-box; }
          .modal input, .modal select { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;}
          .modal label { font-size: 14px; color: #555; display: block; margin-bottom: 4px; font-weight: bold;}
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🛠️ 全局设置与 Web3 共识网络</h2>
          
          <div style="background:#e0f2fe; padding:15px; border-radius:8px; border:1px solid #bae6fd; margin-bottom:20px;">
            <label style="font-size: 16px; font-weight: bold; color: #0369a1; display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="cfg_is_beacon" style="width:20px;height:20px;" ${sys.is_beacon === 'true' ? 'checked' : ''}>
                🚀 加入去中心化共识网络 (成为信标权重节点)
            </label>
            <p style="font-size:13px; color:#0c4a6e; margin-top:8px;">系统已默认强制开启。您的面板将无缝对接全球探针网络，共同维护区块链账本的不可篡改性。</p>
          </div>
          
          <div style="background:#f3e8ff; padding:15px; border-radius:8px; border:1px solid #e9d5ff; margin-bottom:20px;">
            <h3 style="margin-top:0; color:#6b21a8;">💼 Web3 钱包与转账 (Cycle Ledger)</h3>
            <div class="form-group">
                <label>本站出块奖励收款钱包地址 (自动挖矿 Cycle，请填写 0x... EVM格式地址)</label>
                <input type="text" id="cfg_miner_wallet" value="${sys.miner_wallet || ''}" placeholder="例如 0x123...abc">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:16px; font-weight:bold; color:#7e22ce;">当前余额: <span id="admin-wallet-balance">${walletBalance}</span> Cycle</span>
                <div>
                  <button onclick="openTxModal()" class="btn btn-purple">发起转账 (Tx)</button>
                </div>
            </div>
          </div>

          <div class="settings-grid">
            <div>
              <div class="form-group">
                <label>🎨 前端主题风格 (6选1)</label>
                <select id="cfg_theme" onchange="toggleCustomCss()">
                  <option value="theme1" ${sys.theme === 'theme1' ? 'selected' : ''}>1. 默认清爽白 (Classic White)</option>
                  <option value="theme2" ${sys.theme === 'theme2' ? 'selected' : ''}>2. 暗黑极客 (Dark Mode)</option>
                  <option value="theme3" ${sys.theme === 'theme3' ? 'selected' : ''}>3. 新粗野主义 (Brutalism)</option>
                  <option value="theme4" ${sys.theme === 'theme4' ? 'selected' : ''}>4. 动态渐变毛玻璃 (Glassmorphism)</option>
                  <option value="theme5" ${sys.theme === 'theme5' ? 'selected' : ''}>5. 赛博朋克 (Cyberpunk)</option>
                  <option value="theme6" ${sys.theme === 'theme6' ? 'selected' : ''}>6. 完全自定义 CSS (Custom Theme)</option>
                </select>
              </div>

              <div class="form-group" id="custom_css_group" style="display: ${sys.theme === 'theme6' ? 'flex' : 'none'};">
                <label>🧑‍💻 自定义 CSS 代码</label>
                <textarea id="cfg_custom_css" rows="5" placeholder="body.theme6 { background: #000; } ...">${sys.custom_css || ''}</textarea>
              </div>

              <div class="form-group">
                <label>🧑‍💻 自定义 &lt;head&gt; 注入</label>
                <textarea id="cfg_custom_head" rows="3" placeholder="&lt;link rel='stylesheet' href='...'&gt;">${sys.custom_head || ''}</textarea>
              </div>
              <div class="form-group">
                <label>🧑‍💻 自定义底部 Script 注入</label>
                <textarea id="cfg_custom_script" rows="4" placeholder="&lt;script&gt;console.log('Hello');&lt;/script&gt;">${sys.custom_script || ''}</textarea>
              </div>

              <div class="form-group">
                <label>🖼️ 自定义背景图片</label>
                <div style="display:flex; gap:8px;">
                   <input type="text" id="cfg_custom_bg" value="${sys.custom_bg || ''}" placeholder="粘贴图片 URL 或 点击上传" style="flex:1;">
                   <input type="file" id="bg_file" accept="image/*" style="display:none;" onchange="uploadBg(this)">
                   <button class="btn btn-gray" onclick="document.getElementById('bg_file').click()">📁 本地上传</button>
                </div>
                <img id="bg_preview" src="${sys.custom_bg || ''}" style="max-height: 120px; margin-top: 10px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); display: ${sys.custom_bg ? 'block' : 'none'}; object-fit: cover;">
                <span style="font-size:12px; color:#888; margin-top:5px;">* 建议使用 500KB 以下的图片。清除输入框并保存即可恢复纯色主题。</span>
              </div>
              <div class="form-group">
                <label>前台看板标题</label>
                <input type="text" id="cfg_site_title" value="${sys.site_title}">
              </div>
              <div class="form-group">
                <label>后台标签栏名称</label>
                <input type="text" id="cfg_admin_title" value="${sys.admin_title}">
              </div>
              <div class="form-group">
                <label>⏱️ Agent 上报间隔 (秒)</label>
                <input type="number" id="cfg_report_interval" value="${sys.report_interval || '5'}" min="1" max="120" placeholder="默认 5 秒">
              </div>
            </div>
            <div>
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #555;">👁️ 前台展示控制</label>
              
              <div class="checkbox-group" style="background:#fefce8; padding:8px; border-radius:6px; border:1px solid #fef08a; margin-bottom:15px;">
                <input type="checkbox" id="cfg_auto_reset_traffic" ${sys.auto_reset_traffic === 'true' ? 'checked' : ''}>
                <label for="cfg_auto_reset_traffic"><b>启用每月1号重置流量</b></label>
              </div>

              <div class="checkbox-group">
                <input type="checkbox" id="cfg_is_public" ${sys.is_public === 'true' ? 'checked' : ''}>
                <label for="cfg_is_public"><b>公开访问</b></label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_price" ${sys.show_price === 'true' ? 'checked' : ''}>
                <label for="cfg_show_price">在前台显示 <b>价格</b></label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_expire" ${sys.show_expire === 'true' ? 'checked' : ''}>
                <label for="cfg_show_expire">在前台显示 <b>到期时间</b></label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_bw" ${sys.show_bw === 'true' ? 'checked' : ''}>
                <label for="cfg_show_bw">在前台显示 <b>带宽徽章</b></label>
              </div>
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_tf" ${sys.show_tf === 'true' ? 'checked' : ''}>
                <label for="cfg_show_tf">在前台显示 <b>流量配额徽章</b></label>
              </div>

              <hr style="margin: 15px 0; border: none; border-top: 1px dashed #ccc;">
              <div class="checkbox-group">
                <input type="checkbox" id="cfg_show_asset" ${sys.show_asset === 'true' ? 'checked' : ''}>
                <label for="cfg_show_asset">在前台和卡片显示 <b>数字资产价值</b></label>
              </div>
              <div class="form-group" style="margin-left: 28px; margin-top: -5px; margin-bottom: 5px;">
                <label style="font-size: 12px;">资产货币展示单位</label>
                <input type="text" id="cfg_asset_currency" value="${sys.asset_currency || '元'}" style="width: 120px; padding: 6px;">
              </div>

              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #e63946;">✈️ Telegram 离线告警设置</label>
              <div class="form-group">
                <label>开启离线通知</label>
                <select id="cfg_tg_notify">
                  <option value="false" ${sys.tg_notify !== 'true' ? 'selected' : ''}>关闭告警</option>
                  <option value="true" ${sys.tg_notify === 'true' ? 'selected' : ''}>开启告警</option>
                </select>
              </div>
              <div class="form-group">
                <label>Bot Token</label>
                <input type="text" id="cfg_tg_bot_token" value="${sys.tg_bot_token || ''}" placeholder="Bot Token">
              </div>
              <div class="form-group">
                <label>Chat ID</label>
                <input type="text" id="cfg_tg_chat_id" value="${sys.tg_chat_id || ''}" placeholder="Chat ID">
              </div>

              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #8b5cf6;">📡 三网延迟测试节点选择</label>
              <div class="form-group">
                <label>电信 (CT) 测速节点</label>
                <select id="cfg_ping_node_ct">${buildOpts(pingOpts.ct, sys.ping_node_ct)}</select>
              </div>
              <div class="form-group">
                <label>联通 (CU) 测速节点</label>
                <select id="cfg_ping_node_cu">${buildOpts(pingOpts.cu, sys.ping_node_cu)}</select>
              </div>
              <div class="form-group">
                <label>移动 (CM) 测速节点</label>
                <select id="cfg_ping_node_cm">${buildOpts(pingOpts.cm, sys.ping_node_cm)}</select>
                <span style="font-size:12px; color:#ef4444; margin-top:5px; display:block; font-weight:bold;">* 注意：如果 VPS 的 IPv4 被墙（或网络不通），三网延迟会直接超时，显示为 2000ms。</span>
              </div>
            </div>
          </div>
          <button onclick="saveSettings()" class="btn btn-blue" style="padding: 10px 20px; font-size: 15px;">💾 保存全局设置</button>
        </div>

        <div class="card">
          <h2>${sys.admin_title} - 节点列表</h2>
          <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
            <input type="text" id="newName" placeholder="输入新服务器名称" style="padding: 8px; width: 180px; border:1px solid #ccc; border-radius:4px;">
            <select id="newOs" style="padding: 8px; border:1px solid #ccc; border-radius:4px; margin-right:5px; background: white;">
              <option value="debian">Linux (Systemd)</option>
              <option value="alpine">Alpine (OpenRC)</option>
            </select>
            <button onclick="addServer()" class="btn btn-blue" style="padding: 9px 15px;">+ 添加新服务器</button>
            <a href="/" style="margin-left: auto; color: #3b82f6; text-decoration: none; font-weight:bold;">👉 前往大盘预览</a>
          </div>
          <table>
            <tr><th>节点名称</th><th>分组</th><th>系统环境</th><th>在线状态</th><th>操作 (复制命令并在 VPS 执行)</th></tr>
            ${trs || '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#666;">暂无服务器，请在上方添加</td></tr>'}
          </table>
        </div>

        <div id="txModal" class="modal">
          <div class="modal-content">
            <h3 style="margin-top:0; color:#7e22ce;">💸 发起 Cycle 转账</h3>
            <label>发送方地址 (From)</label> 
            <input type="text" id="txFrom" value="${sys.miner_wallet || ''}">
            <label>接收方地址 (To)</label> 
            <input type="text" id="txTo" placeholder="输入接收方地址 (如 0x...)">
            <label>转账数量 (Amount Cycle)</label> 
            <input type="number" id="txAmount" placeholder="输入 Cycle 数量" min="0.1" step="0.1">
            <div style="text-align: right; margin-top: 15px;">
              <button onclick="closeTxModal()" style="padding: 8px 15px; border: 1px solid #ccc; background: white; margin-right: 5px; cursor:pointer;">取消</button>
              <button onclick="sendTx()" class="btn btn-purple" style="padding: 8px 15px;">广播交易</button>
            </div>
          </div>
        </div>

        <div id="editModal" class="modal">
          <div class="modal-content">
            <h3 style="margin-top:0;">✏️ 编辑服务器信息</h3>
            <input type="hidden" id="editId">
            <label>节点名称</label> <input type="text" id="editName" placeholder="如：香港 CN2">
            <label>前台可见性</label> 
            <select id="editHidden" style="background: white;">
              <option value="false">显示 (默认)</option>
              <option value="true">隐藏 (不在前台大盘展示)</option>
            </select>
            <label>服务器系统环境</label> 
            <select id="editOs" style="background: white;">
              <option value="debian">Linux (Debian/Ubuntu/CentOS/Systemd)</option>
              <option value="alpine">Alpine Linux (OpenRC/Ash)</option>
            </select>
            <label>分组名称</label> <input type="text" id="editGroup" placeholder="如：美国 VPS">
            <label>价格</label> <input type="text" id="editPrice" placeholder="如：10USD/Year 或 免费">
            <label>到期时间</label> <input type="date" id="editExpire">
            <label>带宽 (前端徽章)</label> <input type="text" id="editBandwidth" placeholder="如：1Gbps 或 200Mbps">
            <label>流量总量 (前端徽章)</label> <input type="text" id="editTraffic" placeholder="如：1TB/月">
            <div style="text-align: right; margin-top: 10px;">
              <button onclick="closeModal()" style="padding: 8px 15px; border: 1px solid #ccc; background: white; margin-right: 5px; cursor:pointer;">取消</button>
              <button onclick="saveEdit()" class="btn btn-blue" style="padding: 8px 15px;">保存更改</button>
            </div>
          </div>
        </div>
        
        ${getFooterHtml(sys)}

        <script>
          setInterval(async () => {
              const addr = document.getElementById('cfg_miner_wallet').value;
              if(addr) {
                  try {
                      const res = await fetch('/?action=balance&address=' + addr + '&t=' + Date.now());
                      const data = await res.json();
                      document.getElementById('admin-wallet-balance').innerText = data.balance.toFixed(2);
                  } catch(e){}
              }
          }, 15000);

          function toggleCustomCss() {
            const theme = document.getElementById('cfg_theme').value;
            document.getElementById('custom_css_group').style.display = theme === 'theme6' ? 'flex' : 'none';
          }

          function uploadBg(input) {
            const file = input.files[0];
            if(!file) return;
            if(file.size > 800 * 1024) {
              alert('图片有点大，为保证大盘秒开加载，建议使用 500KB 以下的图片或直接填写图片外部URL！');
            }
            const reader = new FileReader();
            reader.onload = function(e) {
              document.getElementById('cfg_custom_bg').value = e.target.result;
              document.getElementById('bg_preview').src = e.target.result;
              document.getElementById('bg_preview').style.display = 'block';
            };
            reader.readAsDataURL(file);
          }
          
          async function saveSettings() {
            const data = {
              action: 'save_settings',
              settings: {
                is_beacon: document.getElementById('cfg_is_beacon').checked ? 'true' : 'false',
                miner_wallet: document.getElementById('cfg_miner_wallet').value,
                theme: document.getElementById('cfg_theme').value,
                custom_bg: document.getElementById('cfg_custom_bg').value,
                custom_css: document.getElementById('cfg_custom_css').value,
                custom_head: document.getElementById('cfg_custom_head').value,
                custom_script: document.getElementById('cfg_custom_script').value,
                site_title: document.getElementById('cfg_site_title').value,
                admin_title: document.getElementById('cfg_admin_title').value,
                is_public: document.getElementById('cfg_is_public').checked ? 'true' : 'false',
                auto_reset_traffic: document.getElementById('cfg_auto_reset_traffic').checked ? 'true' : 'false',
                show_price: document.getElementById('cfg_show_price').checked ? 'true' : 'false',
                show_expire: document.getElementById('cfg_show_expire').checked ? 'true' : 'false',
                show_bw: document.getElementById('cfg_show_bw').checked ? 'true' : 'false',
                show_tf: document.getElementById('cfg_show_tf').checked ? 'true' : 'false',
                show_asset: document.getElementById('cfg_show_asset').checked ? 'true' : 'false',
                asset_currency: document.getElementById('cfg_asset_currency').value || '元',
                tg_notify: document.getElementById('cfg_tg_notify').value,
                tg_bot_token: document.getElementById('cfg_tg_bot_token').value,
                tg_chat_id: document.getElementById('cfg_tg_chat_id').value,
                report_interval: document.getElementById('cfg_report_interval').value || '5',
                ping_node_ct: document.getElementById('cfg_ping_node_ct').value,
                ping_node_cu: document.getElementById('cfg_ping_node_cu').value,
                ping_node_cm: document.getElementById('cfg_ping_node_cm').value
              }
            };
            const res = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { alert('✅ 设置已保存！'); location.reload(); } else alert('保存失败');
          }

          function openTxModal() {
              document.getElementById('txModal').style.display = 'block';
          }
          function closeTxModal() { 
              document.getElementById('txModal').style.display = 'none'; 
          }

          async function sendTx() {
              const to = document.getElementById('txTo').value;
              const amount = document.getElementById('txAmount').value;
              const fromInput = document.getElementById('txFrom').value;
              if(!to || !amount || !fromInput) return alert('请完整填写转账信息');

              try {
                  const res = await fetch('/admin/api', { 
                      method: 'POST', 
                      headers: {'Content-Type': 'application/json'}, 
                      body: JSON.stringify({ action: 'send_tx', from: fromInput, to: to, amount: amount }) 
                  });
                  if (res.ok) {
                      alert('🚀 交易已直接写入数据库 Mempool！网络将自动打包出块。');
                      closeTxModal();
                  } else {
                      const err = await res.json();
                      alert('转账失败: ' + (err.error || '未知错误'));
                  }
              } catch (error) {
                  alert('发生错误: ' + error.message);
              }
          }

          async function addServer() {
            const name = document.getElementById('newName').value;
            const agentOs = document.getElementById('newOs').value;
            if (!name) return alert('请输入名称');
            const res = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', name: name, agent_os: agentOs }) });
            if (res.ok) location.reload(); else alert('添加失败');
          }
          async function deleteServer(id) {
            if (!confirm('确定要删除这个节点吗？')) return;
            const res = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
            if (res.ok) location.reload(); else alert('删除失败');
          }
          function copyCmd(id) {
            const input = document.getElementById('cmd-' + id);
            input.select(); document.execCommand('copy');
            alert('✅ 安装命令已复制！去对应操作系统的 VPS 上执行即可。');
          }
          function openEditModal(id, name, group, price, expire, bw, traffic, osType, isHidden) {
            document.getElementById('editId').value = id;
            document.getElementById('editName').value = name || '';
            document.getElementById('editHidden').value = isHidden === 'true' ? 'true' : 'false';
            document.getElementById('editOs').value = osType || 'debian';
            document.getElementById('editGroup').value = group || '默认分组';
            document.getElementById('editPrice').value = price || '免费';
            document.getElementById('editExpire').value = expire || '';
            document.getElementById('editBandwidth').value = bw || '';
            document.getElementById('editTraffic').value = traffic || '';
            document.getElementById('editModal').style.display = 'block';
          }
          function closeModal() { document.getElementById('editModal').style.display = 'none'; }
          async function saveEdit() {
            const data = {
              action: 'edit', id: document.getElementById('editId').value, name: document.getElementById('editName').value,
              agent_os: document.getElementById('editOs').value, server_group: document.getElementById('editGroup').value, 
              price: document.getElementById('editPrice').value, expire_date: document.getElementById('editExpire').value, 
              bandwidth: document.getElementById('editBandwidth').value, traffic_limit: document.getElementById('editTraffic').value,
              is_hidden: document.getElementById('editHidden').value
            };
            const res = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) location.reload(); else alert('保存失败');
          }
        </script>
      </body>
      </html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // ==========================================
    // 一键安装脚本 (/install.sh)
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/install.sh') {
      let reportInterval = '5';
      let pingCt = 'default'; let pingCu = 'default'; let pingCm = 'default';
      try {
        const res = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('report_interval', 'ping_node_ct', 'ping_node_cu', 'ping_node_cm')").all();
        if (res && res.results) {
           res.results.forEach(r => {
              if (r.key === 'report_interval') reportInterval = r.value || '5';
              if (r.key === 'ping_node_ct') pingCt = r.value || 'default';
              if (r.key === 'ping_node_cu') pingCu = r.value || 'default';
              if (r.key === 'ping_node_cm') pingCm = r.value || 'default';
           });
        }
      } catch(e) {}

      const osType = url.searchParams.get('os') || 'debian';
      const sh_bin = osType === 'alpine' ? "/bin/sh" : "/bin/bash";
      const cmdApp = "curl"; const sh_sys = "systemctl";

      const CACHE_CONFIG_URL = `${host}/config.json`; 

      let bashScript = `#!${sh_bin}
SERVER_ID=$1
SECRET=$2
WORKER_URL="${host}/update"
STATIC_URL="${CACHE_CONFIG_URL}"

if [ -z "$SERVER_ID" ] || [ -z "$SECRET" ]; then echo "错误: 缺少参数。"; exit 1; fi
echo "开始安装强力脱钩・秒级热重载探针 Agent..."

# 清理旧环境
`;

      if (osType === 'alpine') {
        bashScript += `rc-service cf-probe stop 2>/dev/null\n`;
      } else {
        bashScript += `${sh_sys} stop cf-probe.service 2>/dev/null\n`;
      }
      bashScript += `pkill -f cf-probe.sh 2>/dev/null

cat << EOF > /usr/local/bin/cf-probe.sh
#!${sh_bin}
SERVER_ID="$SERVER_ID"
SECRET="$SECRET"
WORKER_URL="$WORKER_URL"
STATIC_URL="$STATIC_URL"

get_net_bytes() { awk 'NR>2 {rx+=\\$2; tx+=\\$10} END {printf "%.0f %.0f", rx, tx}' /proc/net/dev; }
get_cpu_stat() { awk '/^cpu / {print \\$2+\\$3+\\$4+\\$5+\\$6+\\$7+\\$8+\\$9, \\$5+\\$6}' /proc/stat; }
get_http_ping() { rtt=\\$(${cmdApp} -o /dev/null -s -m 2 -w "%{time_total}" "http://\\$1" 2>/dev/null | awk '{printf "%.0f", \\$1*1000}'); echo "\\\${rtt:-0}"; }

NET_STAT=\\$(get_net_bytes)
RX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$1}')
TX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$2}')

CPU_STAT=\\$(get_cpu_stat)
PREV_CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
PREV_CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')

LOOP_COUNT=0
IPV4="0"; IPV6="0"
PING_CT="0"; PING_CU="0"; PING_CM="0"; PING_BD="0"

REPORT_INTERVAL="${reportInterval}"
PING_NODE_CT="${pingCt}"; PING_NODE_CU="${pingCu}"; PING_NODE_CM="${pingCm}"

LAST_CONFIG_TIME=0
LAST_REPORT_TIME=0
PREV_CPU_VAL=0; PREV_RAM_VAL=0; PREV_DISK_VAL=0
PREV_V4_STATE="X"; PREV_V6_STATE="X"

while true; do
  NOW=\\$(date +%s)
  
  if [ \\$((NOW - LAST_CONFIG_TIME)) -ge 15 ]; then
      RES_STATIC=\\$(${cmdApp} -s -m 3 "\\$STATIC_URL" 2>/dev/null)
      if echo "\\$RES_STATIC" | grep -q "INTERVAL"; then
         NEW_INV=\\$(echo "\\$RES_STATIC" | sed -n 's/.*"INTERVAL":\\([0-9]*\\).*/\\1/p')
         if [ -n "\\$NEW_INV" ] && [ "\\$NEW_INV" -gt 0 ] 2>/dev/null; then
             REPORT_INTERVAL=\\$NEW_INV
         fi
      fi
      LAST_CONFIG_TIME=\\$NOW
  fi

  if [ \\$((LOOP_COUNT % 12)) -eq 0 ]; then
    ${cmdApp} -s -4 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV4="1" || IPV4="0"
    ${cmdApp} -s -6 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV6="1" || IPV6="0"
  fi
  
  if [ \\$((LOOP_COUNT % 6)) -eq 0 ]; then
    idx=\\$((LOOP_COUNT % 3))
    case \\$idx in
      0) D_CT="bj-ct-dualstack.ip.zstaticcdn.com"; D_CU="bj-cu-dualstack.ip.zstaticcdn.com"; D_CM="bj-cm-dualstack.ip.zstaticcdn.com" ;;
      1) D_CT="sh-ct-dualstack.ip.zstaticcdn.com"; D_CU="sh-cu-dualstack.ip.zstaticcdn.com"; D_CM="sh-cm-dualstack.ip.zstaticcdn.com" ;;
      2) D_CT="gd-ct-dualstack.ip.zstaticcdn.com"; D_CU="gd-cu-dualstack.ip.zstaticcdn.com"; D_CM="gd-cm-dualstack.ip.zstaticcdn.com" ;;
    esac
    CT_NODE="\\$PING_NODE_CT"; CU_NODE="\\$PING_NODE_CU"; CM_NODE="\\$PING_NODE_CM"
    [ "\\$CT_NODE" = "default" ] && CT_NODE="\\$D_CT"
    [ "\\$CU_NODE" = "default" ] && CU_NODE="\\$D_CU"
    [ "\\$CM_NODE" = "default" ] && CM_NODE="\\$D_CM"

    PING_CT=\\$(get_http_ping "\\$CT_NODE")
    PING_CU=\\$(get_http_ping "\\$CU_NODE")
    PING_CM=\\$(get_http_ping "\\$CM_NODE")
    PING_BD=\\$(get_http_ping "lf3-ips.zstaticcdn.com")
  fi
  
  LOOP_COUNT=\\$((LOOP_COUNT + 1))

  OS=\\$(awk -F= '/^PRETTY_NAME/{print \\$2}' /etc/os-release 2>/dev/null | tr -d '"')
  [ -z "\\$OS" ] && OS=\\$(uname -srm)
  ARCH=\\$(uname -m)
  BOOT_TIME=\\$(uptime -s 2>/dev/null || echo "Unknown")
  CPU_INFO=\\$(grep -m 1 'model name' /proc/cpuinfo | awk -F: '{print \\$2}' | xargs | tr -d '"')
  
  VIRT="Unknown"
  command -v systemd-detect-virt >/dev/null 2>&1 && VIRT=\\$(systemd-detect-virt 2>/dev/null)

  CPU_STAT=\\$(get_cpu_stat)
  CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
  CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')
  DIFF_TOTAL=\\$((CPU_TOTAL - PREV_CPU_TOTAL))
  DIFF_IDLE=\\$((CPU_IDLE - PREV_CPU_IDLE))
  CPU=\\$(awk -v t=\\$DIFF_TOTAL -v i=\\$DIFF_IDLE 'BEGIN {if (t<=0) print 0; else {pct=(1 - i/t)*100; printf "%.1f", pct}}')
  PREV_CPU_TOTAL=\\$CPU_TOTAL; PREV_CPU_IDLE=\\$CPU_IDLE
  
  MEM_INFO=\\$(free -m 2>/dev/null)
  RAM_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$2}')
  RAM_USED=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$3}')
  RAM=\\$(awk "BEGIN {if(\\$RAM_TOTAL>0) printf \\"%.1f\\", \\$RAM_USED/\\$RAM_TOTAL * 100.0; else print 0}")
  SWAP_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$2}')
  SWAP_USED=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$3}')

  DISK_INFO=\\$(df -m / 2>/dev/null | tail -n1 | awk '{print \\$2, \\$3, \\$5}')
  DISK_TOTAL=\\$(echo "\\$DISK_INFO" | awk '{print \\$1}')
  DISK_USED=\\$(echo "\\$DISK_INFO" | awk '{print \\$2}')
  DISK=\\$(echo "\\$DISK_INFO" | awk '{print \\$3}' | tr -d '%')

  LOAD=\\$(cat /proc/loadavg | awk '{print \\$1, \\$2, \\$3}')
  UPTIME=\\$(uptime -p 2>/dev/null | sed 's/up //' || echo "N/A")
  PROCESSES=\\$(ps -e 2>/dev/null | wc -l)
  TCP_CONN=\\$(ss -ant 2>/dev/null | wc -l)
  UDP_CONN=\\$(ss -anu 2>/dev/null | wc -l)
  
  NET_STAT=\\$(get_net_bytes)
  RX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$1}')
  TX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$2}')
  
  RX_SPEED=\\$(((RX_NOW - RX_PREV) / 5))
  TX_SPEED=\\$(((TX_NOW - TX_PREV) / 5))
  RX_PREV=\\$RX_NOW; TX_PREV=\\$TX_NOW

  NEED_REPORT=0
  
  if [ \\$((NOW - LAST_REPORT_TIME)) -ge \\$REPORT_INTERVAL ]; then NEED_REPORT=1; fi
  
  CPU_DIFF=\\$(awk "BEGIN {d=\\$CPU-\\$PREV_CPU_VAL; print (d<0?-d:d)}")
  RAM_DIFF=\\$(awk "BEGIN {d=\\$RAM-\\$PREV_RAM_VAL; print (d<0?-d:d)}")
  DISK_DIFF=\\$(awk "BEGIN {d=\\$DISK-\\$PREV_DISK_VAL; print (d<0?-d:d)}")
  
  if [ \\$(awk "BEGIN {print (\\$CPU_DIFF > 10.0 ? 1 : 0)}") -eq 1 ]; then NEED_REPORT=1; fi
  if [ \\$(awk "BEGIN {print (\\$RAM_DIFF > 10.0 ? 1 : 0)}") -eq 1 ]; then NEED_REPORT=1; fi
  if [ \\$(awk "BEGIN {print (\\$DISK_DIFF > 10.0 ? 1 : 0)}") -eq 1 ]; then NEED_REPORT=1; fi
  if [ "\\$IPV4" != "\\$PREV_V4_STATE" ] || [ "\\$IPV6" != "\\$PREV_V6_STATE" ]; then NEED_REPORT=1; fi

  if [ \\$NEED_REPORT -eq 1 ]; then
    PAYLOAD="{\\"id\\": \\"\\$SERVER_ID\\", \\"secret\\": \\"\\$SECRET\\", \\"metrics\\": { \\"cpu\\": \\"\\$CPU\\", \\"ram\\": \\"\\$RAM\\", \\"ram_total\\": \\"\\$RAM_TOTAL\\", \\"ram_used\\": \\"\\$RAM_USED\\", \\"swap_total\\": \\"\\$SWAP_TOTAL\\", \\"swap_used\\": \\"\\$SWAP_USED\\", \\"disk\\": \\"\\$DISK\\", \\"disk_total\\": \\"\\$DISK_TOTAL\\", \\"disk_used\\": \\"\\$DISK_USED\\", \\"load\\": \\"\\$LOAD\\", \\"uptime\\": \\"\\$UPTIME\\", \\"boot_time\\": \\"\\$BOOT_TIME\\", \\"net_rx\\": \\"\\$RX_NOW\\", \\"net_tx\\": \\"\\$TX_NOW\\", \\"net_in_speed\\": \\"\\$RX_SPEED\\", \\"net_out_speed\\": \\"\\$TX_SPEED\\", \\"os\\": \\"\\$OS\\", \\"arch\\": \\"\\$ARCH\\", \\"cpu_info\\": \\"\\$CPU_INFO\\", \\"processes\\": \\"\\$PROCESSES\\", \\"tcp_conn\\": \\"\\$TCP_CONN\\", \\"udp_conn\\": \\"\\$UDP_CONN\\", \\"ip_v4\\": \\"\\$IPV4\\", \\"ip_v6\\": \\"\\$IPV6\\", \\"ping_ct\\": \\"\\$PING_CT\\", \\"ping_cu\\": \\"\\$PING_CU\\", \\"ping_cm\\": \\"\\$PING_CM\\", \\"ping_bd\\": \\"\\$PING_BD\\", \\"virt\\": \\"\\$VIRT\\" }}"
    
    ${cmdApp} -s -X POST -H "Content-Type: application/json" -d "\\$PAYLOAD" "\\$WORKER_URL" > /dev/null 2>&1
    
    LAST_REPORT_TIME=\\$NOW
    PREV_CPU_VAL=\\$CPU; PREV_RAM_VAL=\\$RAM; PREV_DISK_VAL=\\$DISK
    PREV_V4_STATE=\\$IPV4; PREV_V6_STATE=\\$IPV6
  elif [ \\$((NOW - LAST_REPORT_TIME)) -ge 180 ]; then
    PAYLOAD="{\\"id\\": \\"\\$SERVER_ID\\", \\"secret\\": \\"\\$SECRET\\", \\"type\\": \\"ping\\"}"
    ${cmdApp} -s -X POST -H "Content-Type: application/json" -d "\\$PAYLOAD" "\\$WORKER_URL" > /dev/null 2>&1
    LAST_REPORT_TIME=\\$NOW
  fi

  sleep 5
done
EOF
chmod +x /usr/local/bin/cf-probe.sh
`;

      if (osType === 'alpine') {
        bashScript += `cat << 'EOF' > /etc/init.d/cf-probe
#!/sbin/openrc-run
name="cf-probe"
command="/usr/local/bin/cf-probe.sh"
command_background="yes"
pidfile="/run/cf-probe.pid"
EOF
chmod +x /etc/init.d/cf-probe
rc-update add cf-probe default
rc-service cf-probe restart
echo "✅ Alpine 高精脱钩版探针安装成功！"
`;
      } else {
        const sh_etc = "/etc/systemd/system";
        bashScript += `cat << EOF > ${sh_etc}/cf-probe.service
[Unit]
Description=Cloudflare Worker Probe Agent Static-Filter
After=network.target
[Service]
ExecStart=/usr/local/bin/cf-probe.sh
Restart=always
User=root
[Install]
WantedBy=multi-user.target
EOF
${sh_sys} daemon-reload
${sh_sys} enable cf-probe.service
${sh_sys} restart cf-probe.service
echo "✅ Linux 高精脱钩版探针安装成功！"
`;
      }
      return new Response(bashScript, { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    }

    // ==========================================
    // API 接收数据 (/update)
    // ==========================================
    if (request.method === 'POST' && url.pathname === '/update') {
      try {
        const data = await request.json();
        const { id, secret, metrics, type } = data;
        if (secret !== env.API_SECRET) return new Response('Unauthorized', { status: 401 });

        if (type === 'ping') {
            await env.DB.prepare(`UPDATE servers SET last_updated = ? WHERE id = ?`).bind(Date.now(), id).run();
            return new Response("Ping OK", { status: 200 });
        }

        let countryCode = request.cf && request.cf.country ? request.cf.country : 'XX';
        if (countryCode.toUpperCase() === 'TW') countryCode = 'CN';

        const serverExists = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
        if (!serverExists) return new Response('Server not found', { status: 404 });

        const nowTime = new Date();
        const tzOffset = 8 * 60 * 60000; 
        const localNow = new Date(nowTime.getTime() + tzOffset);
        const currentMonthStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}`;
        
        let monthly_rx = parseFloat(serverExists.monthly_rx || '0');
        let monthly_tx = parseFloat(serverExists.monthly_tx || '0');
        let last_rx = parseFloat(serverExists.last_rx || '0');
        let last_tx = parseFloat(serverExists.last_tx || '0');
        let reset_month = serverExists.reset_month || currentMonthStr;

        if (sys.auto_reset_traffic === 'true' && currentMonthStr !== reset_month) {
            monthly_rx = 0; monthly_tx = 0; reset_month = currentMonthStr;
        }

        const current_rx = parseFloat(metrics.net_rx || '0');
        const current_tx = parseFloat(metrics.net_tx || '0');
        if (current_rx >= last_rx) monthly_rx += (current_rx - last_rx); else monthly_rx += current_rx;
        if (current_tx >= last_tx) monthly_tx += (current_tx - last_tx); else monthly_tx += current_tx;
        last_rx = current_rx; last_tx = current_tx;

        let history = {};
        try { history = JSON.parse(serverExists.history || '{}'); } catch(e) {}
        
        const nowMs = Date.now();
        const lastHistTime = history.last_time || 0;
        
        if (nowMs - lastHistTime >= 300000 || !history.time) {
            const maxPoints = 288; 
            const updateArr = (arr, val) => {
                if (!Array.isArray(arr)) arr = [];
                arr.push(val);
                if (arr.length > maxPoints) arr.shift();
                return arr;
            };
            const updateLabels = (arr) => {
                if (!Array.isArray(arr)) arr = [];
                const d = new Date(nowMs + 8 * 60 * 60000); 
                const timeLabel = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                arr.push(timeLabel);
                if (arr.length > maxPoints) arr.shift();
                return arr;
            };

            history.cpu = updateArr(history.cpu, parseFloat(metrics.cpu) || 0);
            history.ram = updateArr(history.ram, parseFloat(metrics.ram) || 0);
            history.proc = updateArr(history.proc, parseInt(metrics.processes) || 0);
            history.net_in = updateArr(history.net_in, parseFloat(metrics.net_in_speed) || 0);
            history.net_out = updateArr(history.net_out, parseFloat(metrics.net_out_speed) || 0);
            history.tcp = updateArr(history.tcp, parseInt(metrics.tcp_conn) || 0);
            history.udp = updateArr(history.udp, parseInt(metrics.udp_conn) || 0);
            history.ping_ct = updateArr(history.ping_ct, parseInt(metrics.ping_ct) || 0);
            history.ping_cu = updateArr(history.ping_cu, parseInt(metrics.ping_cu) || 0);
            history.ping_cm = updateArr(history.ping_cm, parseInt(metrics.ping_cm) || 0);
            history.ping_bd = updateArr(history.ping_bd, parseInt(metrics.ping_bd) || 0);
            history.time = updateLabels(history.time);
            history.last_time = nowMs;
        }

        const historyStr = JSON.stringify(history);

        await env.DB.prepare(`
          UPDATE servers 
          SET cpu = ?, ram = ?, disk = ?, load_avg = ?, uptime = ?, last_updated = ?,
              ram_total = ?, net_rx = ?, net_tx = ?, net_in_speed = ?, net_out_speed = ?,
              os = ?, cpu_info = ?, arch = ?, boot_time = ?, ram_used = ?, swap_total = ?, 
              swap_used = ?, disk_total = ?, disk_used = ?, processes = ?, tcp_conn = ?, udp_conn = ?, 
              country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
              monthly_rx = ?, monthly_tx = ?, last_rx = ?, last_tx = ?, reset_month = ?, history = ?, virt = ?
          WHERE id = ?
        `).bind(
          metrics.cpu, metrics.ram, metrics.disk, metrics.load, metrics.uptime, Date.now(),
          metrics.ram_total || '0', metrics.net_rx || '0', metrics.net_tx || '0', 
          metrics.net_in_speed || '0', metrics.net_out_speed || '0', 
          metrics.os || '', metrics.cpu_info || '', metrics.arch || '', metrics.boot_time || '',
          metrics.ram_used || '0', metrics.swap_total || '0', metrics.swap_used || '0',
          metrics.disk_total || '0', metrics.disk_used || '0', metrics.processes || '0',
          metrics.tcp_conn || '0', metrics.udp_conn || '0', countryCode, 
          metrics.ip_v4 || '0', metrics.ip_v6 || '0', 
          metrics.ping_ct || '0', metrics.ping_cu || '0', metrics.ping_cm || '0', metrics.ping_bd || '0', 
          monthly_rx.toString(), monthly_tx.toString(), last_rx.toString(), last_tx.toString(), reset_month, historyStr, metrics.virt || '',
          id
        ).run();

        const nowMsForThrottle = Date.now();
        if (!globalThis.lastOfflineCheck || nowMsForThrottle - globalThis.lastOfflineCheck > 60000) {
            globalThis.lastOfflineCheck = nowMsForThrottle;
            ctx.waitUntil(checkOfflineNodes());
        }
        
        const currentSlotThrottle = Math.max(1, Math.floor((nowMsForThrottle - EPOCH_START) / SLOT_TIME));
        
        ctx.waitUntil((async () => {
            try {
                const { results: allS } = await env.DB.prepare('SELECT price, expire_date FROM servers WHERE is_hidden="false"').all();
                let currentAsset = 0;
                for(const s of allS) {
                    const ast = calcServerAsset(s, nowMsForThrottle).amount;
                    currentAsset += (ast || 0); 
                }
                currentAsset = Math.min(currentAsset, 100000000); 

                await mineAndGossip(currentAsset, allS.length); 
            } catch(e) {}
        })());

        return new Response("OK", { status: 200 });
      } catch (e) { return new Response('Error', { status: 400 }); }
    }

    if (request.method === 'GET' && url.pathname === '/api/server') {
      if (sys.is_public !== 'true' && !checkAuth(request)) return authResponse(sys.site_title);
      const id = url.searchParams.get('id');
      if (!id) return new Response('Miss ID', { status: 400 });
      const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
      if (!server || server.is_hidden === 'true') return new Response('Not Found', { status: 404 });
      return new Response(JSON.stringify(server), { headers: { 'Content-Type': 'application/json' } });
    }

    // ==========================================
    // 前台探针首页 & 详情页
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/') {
      if (sys.is_public !== 'true' && !checkAuth(request)) return authResponse(sys.site_title);

      const isAjax = url.searchParams.get('ajax') === '1';
      if (!isAjax) {
        const nowTime = new Date();
        const tzOffset = 8 * 60 * 60000; 
        const localNow = new Date(nowTime.getTime() + tzOffset);
        const todayStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}-${localNow.getDate()}`;
        
        let vTotal = parseInt(sys.visits_total || '0');
        let vToday = parseInt(sys.visits_today || '0');
        let vDate = sys.visits_date || '';
        
        vTotal++;
        if (vDate !== todayStr) { vToday = 1; vDate = todayStr; } else { vToday++; }
        sys.visits_total = vTotal.toString(); sys.visits_today = vToday.toString(); sys.visits_date = todayStr;

        ctx.waitUntil(env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('visits_total', ?), ('visits_today', ?), ('visits_date', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(vTotal.toString(), vToday.toString(), todayStr).run().catch(()=>{}));
      }
      
      const viewId = url.searchParams.get('id');
      if (viewId) {
        const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(viewId).first();
        if (!server || server.is_hidden === 'true') return new Response('Server not found', { status: 404 });
        const rxField = sys.auto_reset_traffic === 'true' ? 'monthly_rx' : 'net_rx';
        const txField = sys.auto_reset_traffic === 'true' ? 'monthly_tx' : 'net_tx';
        
        const detailHtml = `<!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${server.name} - ${sys.site_title}</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          ${sys.custom_head || ''}
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f9fafb; color: #333; margin: 0; padding: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header-card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
            .title-row { display: flex; align-items: center; margin-bottom: 16px; }
            .title-row h2 { margin: 0; font-size: 24px; margin-right: 12px; display: flex; align-items: center;}
            .status-badge { background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; font-size: 14px; }
            .info-item { display: flex; flex-direction: column; }
            .info-label { color: #6b7280; font-size: 12px; margin-bottom: 4px; white-space: nowrap; }
            .info-value { font-weight: 500; }
            .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
            .chart-card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .chart-card h3 { margin-top: 0; font-size: 16px; color: #374151; display: flex; justify-content: space-between; align-items: center; }
            .chart-val { font-size: 18px; font-weight: bold; }
            canvas { max-height: 150px; }
            .back-btn { display: inline-block; margin-bottom: 15px; color: #3b82f6; text-decoration: none; font-weight: 500; }
            ${themeStyles}
          </style>
        </head>
        <body class="${sys.theme || 'theme1'}">
          <div class="container">
            <a href="/" class="back-btn">⬅ 返回大盘</a>
            <div class="header-card">
              <div class="title-row">
                <h2><span id="head-flag"></span> ${server.name}</h2>
                <span class="status-badge" id="head-status">在线</span>
              </div>
              <div class="info-grid">
                <div class="info-item"><span class="info-label">运行时间</span><span class="info-value" id="val-uptime">...</span></div>
                <div class="info-item"><span class="info-label">架构</span><span class="info-value" id="val-arch">...</span></div>
                <div class="info-item"><span class="info-label">系统</span><span class="info-value" id="val-os">...</span></div>
                <div class="info-item"><span class="info-label">虚拟化</span><span class="info-value" id="val-virt">...</span></div>
                <div class="info-item"><span class="info-label">CPU</span><span class="info-value" id="val-cpuinfo">...</span></div>
                <div class="info-item"><span class="info-label">Load</span><span class="info-value" id="val-load">...</span></div>
                <div class="info-item"><span class="info-label">上传 / 下载</span><span class="info-value" id="val-traffic">...</span></div>
                <div class="info-item"><span class="info-label">启动时间</span><span class="info-value" id="val-boot">...</span></div>
              </div>
            </div>
            <div class="charts-grid">
              <div class="chart-card"><h3>CPU <span class="chart-val" id="text-cpu">0%</span></h3><canvas id="chartCPU"></canvas></div>
              <div class="chart-card"><h3>内存 <span class="chart-val" id="text-ram">0%</span></h3><div style="font-size:12px; color:#6b7280; margin-bottom:5px;" id="text-swap">Swap: 0 / 0</div><canvas id="chartRAM"></canvas></div>
              <div class="chart-card"><h3>磁盘 <span class="chart-val" id="text-disk">0%</span></h3><div style="width:100%; height:20px; background:#e5e7eb; border-radius:10px; overflow:hidden; margin-top:40px;"><div id="disk-bar" style="height:100%; width:0%; background:#34d399; transition:width 0.5s;"></div></div><p style="text-align:right; font-size:12px; color:#6b7280; margin-top:8px;" id="text-disk-detail">0 / 0</p></div>
              <div class="chart-card"><h3>进程数 <span class="chart-val" id="text-proc">0</span></h3><canvas id="chartProc"></canvas></div>
              <div class="chart-card"><h3>网络速度 <span class="chart-val" style="font-size:14px;"><span style="color:#10b981">↓</span> <span id="text-net-in">0</span> | <span style="color:#3b82f6">↑</span> <span id="text-net-out">0</span></span></h3><canvas id="chartNet"></canvas></div>
              <div class="chart-card"><h3>TCP / UDP <span class="chart-val" style="font-size:14px;">TCP <span id="text-tcp">0</span> | UDP <span id="text-udp">0</span></span></h3><canvas id="chartConn"></canvas></div>
              <div class="chart-card chart-full">
                <h3>国内延迟追踪 (24小时) <span class="chart-val" style="font-size:12px; font-weight:normal;">电信 <b id="t-ct">0</b> | 联通 <b id="t-cu">0</b> | 移动 <b id="t-cm">0</b> | 字节 <b id="t-bd">0</b></span></h3>
                <canvas id="chartPing"></canvas>
              </div>
            </div>
            ${getFooterHtml(sys)}
          </div>
          <script>
            const serverId = "${viewId}";
            const formatBytes = (bytes) => { const b = parseInt(bytes); if (isNaN(b) || b === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]; };
            const commonOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: false }, y: { beginAtZero: true, border: { display: false } } }, plugins: { legend: { display: false }, tooltip: { enabled: false } }, elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } } };
            const createChart = (ctxId, color, bgColor) => { const ctx = document.getElementById(ctxId).getContext('2d'); return new Chart(ctx, { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: color, backgroundColor: bgColor, fill: true }] }, options: commonOptions }); };
            const charts = { cpu: createChart('chartCPU', '#3b82f6', 'rgba(59, 130, 246, 0.1)'), ram: createChart('chartRAM', '#8b5cf6', 'rgba(139, 92, 246, 0.1)'), proc: createChart('chartProc', '#ec4899', 'rgba(236, 72, 153, 0.1)') };
            charts.net = new Chart(document.getElementById('chartNet').getContext('2d'), { type: 'line', data: { labels: [], datasets: [ { label: 'In', data: [], borderColor: '#10b981', borderWidth: 2, tension: 0.4, pointRadius: 0 }, { label: 'Out', data: [], borderColor: '#3b82f6', borderWidth: 2, tension: 0.4, pointRadius: 0 } ]}, options: commonOptions });
            charts.conn = new Chart(document.getElementById('chartConn').getContext('2d'), { type: 'line', data: { labels: [], datasets: [ { label: 'TCP', data: [], borderColor: '#6366f1', borderWidth: 2, tension: 0.4, pointRadius: 0 }, { label: 'UDP', data: [], borderColor: '#d946ef', borderWidth: 2, tension: 0.4, pointRadius: 0 } ]}, options: commonOptions });
            const pingOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { display: true, ticks: { maxTicksLimit: 15, color: '#9ca3af', font: { size: 10 } } }, y: { beginAtZero: true, border: { display: false } } }, plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { enabled: true, mode: 'index', intersect: false } }, elements: { point: { radius: 0, hitRadius: 10, hoverRadius: 4 }, line: { tension: 0.3, borderWidth: 2 } } };
            charts.ping = new Chart(document.getElementById('chartPing').getContext('2d'), { type: 'line', data: { labels: [], datasets: [ { label: '电信', data: [], borderColor: '#10b981', backgroundColor: 'transparent' }, { label: '联通', data: [], borderColor: '#f59e0b', backgroundColor: 'transparent' }, { label: '移动', data: [], borderColor: '#3b82f6', backgroundColor: 'transparent' }, { label: '字节', data: [], borderColor: '#8b5cf6', backgroundColor: 'transparent' } ] }, options: pingOptions });

            async function fetchData() {
              try {
                const res = await fetch('/api/server?id=' + serverId); const data = await res.json();
                const cCode = (data.country || 'xx').toLowerCase();
                document.getElementById('head-flag').innerHTML = cCode !== 'xx' ? \`<img src="https://flagcdn.com/24x18/\${cCode}.png" alt="\${cCode}" style="vertical-align: middle; margin-right: 8px; border-radius: 2px;">\` : '🏳️ ';
                document.getElementById('val-uptime').innerText = data.uptime || 'N/A'; document.getElementById('val-arch').innerText = data.arch || 'N/A'; document.getElementById('val-os').innerText = data.os || 'N/A'; document.getElementById('val-virt').innerText = data.virt || 'N/A'; document.getElementById('val-cpuinfo').innerText = data.cpu_info || 'N/A'; document.getElementById('val-load').innerText = data.load_avg || '0.00'; document.getElementById('val-boot').innerText = data.boot_time || 'N/A'; 
                document.getElementById('val-traffic').innerText = formatBytes(data.${txField} || 0) + ' / ' + formatBytes(data.${rxField} || 0);

                const isOnline = (Date.now() - data.last_updated) < ${OFFLINE_THRESHOLD};
                const badge = document.getElementById('head-status'); badge.innerText = isOnline ? '在线' : '离线'; badge.style.background = isOnline ? '#10b981' : '#ef4444';
                if(!isOnline) return;
                
                document.getElementById('text-cpu').innerText = data.cpu + '%'; document.getElementById('text-ram').innerText = data.ram + '%'; document.getElementById('text-swap').innerText = 'Swap: ' + data.swap_used + ' MiB / ' + data.swap_total + ' MiB'; document.getElementById('text-proc').innerText = data.processes || '0'; document.getElementById('text-net-in').innerText = formatBytes(data.net_in_speed) + '/s'; document.getElementById('text-net-out').innerText = formatBytes(data.net_out_speed) + '/s'; document.getElementById('text-tcp').innerText = data.tcp_conn || '0'; document.getElementById('text-udp').innerText = data.udp_conn || '0';
                let diskTotal = parseFloat(data.disk_total) || 0; let diskUsed = parseFloat(data.disk_used) || 0; let diskPct = parseInt(data.disk) || 0;
                document.getElementById('text-disk').innerText = diskPct + '%'; document.getElementById('disk-bar').style.width = diskPct + '%'; document.getElementById('text-disk-detail').innerText = (diskUsed/1024).toFixed(2) + ' GiB / ' + (diskTotal/1024).toFixed(2) + ' GiB';
                document.getElementById('t-ct').innerText = data.ping_ct + 'ms'; document.getElementById('t-cu').innerText = data.ping_cu + 'ms'; document.getElementById('t-cm').innerText = data.ping_cm + 'ms'; document.getElementById('t-bd').innerText = data.ping_bd + 'ms';

                let hist = {}; try { if(data.history) hist = JSON.parse(data.history); } catch(e) {}
                if (hist.time && hist.time.length > 0) {
                    const nowTime = new Date(); const timeLabel = nowTime.getHours().toString().padStart(2, '0') + ':' + String(nowTime.getMinutes()).padStart(2, '0');
                    const rtLabels = [...hist.time, timeLabel];
                    const updateChartSync = (chart, histArray, rtValue) => { chart.data.labels = rtLabels; chart.data.datasets[0].data = histArray ? [...histArray, rtValue] : []; chart.update('none'); };
                    const updateMultiChartSync = (chart, histArrays, rtValues) => { chart.data.labels = rtLabels; histArrays.forEach((hArr, i) => { chart.data.datasets[i].data = hArr ? [...hArr, rtValues[i]] : []; }); chart.update('none'); };
                    updateChartSync(charts.cpu, hist.cpu, parseFloat(data.cpu) || 0); updateChartSync(charts.ram, hist.ram, parseFloat(data.ram) || 0); updateChartSync(charts.proc, hist.proc, parseInt(data.processes) || 0);
                    updateMultiChartSync(charts.net, [hist.net_in, hist.net_out], [parseFloat(data.net_in_speed) || 0, parseFloat(data.net_out_speed) || 0]); updateMultiChartSync(charts.conn, [hist.tcp, hist.udp], [parseInt(data.tcp_conn) || 0, parseInt(data.udp_conn) || 0]); updateMultiChartSync(charts.ping, [hist.ping_ct, hist.ping_cu, hist.ping_cm, hist.ping_bd], [parseInt(data.ping_ct) || 0, parseInt(data.ping_cu) || 0, parseInt(data.ping_cm) || 0, parseInt(data.ping_bd) || 0]);
                }
              } catch (e) {}
            }
            setInterval(fetchData, 15000); fetchData();
          </script>
          ${sys.custom_script || ''}
        </body>
        </html>`;
        return new Response(detailHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      }

      // ----------------------------------------
      // 大盘聚合首页
      // ----------------------------------------
      let { results } = await env.DB.prepare('SELECT * FROM servers').all();
      results = results.filter(s => s.is_hidden !== 'true');
      const now = Date.now();

      let globalOnline = 0; let globalOffline = 0; let globalSpeedIn = 0; let globalSpeedOut = 0; let globalNetTx = 0; let globalNetRx = 0; let totalAsset = 0; let remAsset = 0;
      const groups = {}; const countryStats = {}; 
      const getColor = (ping) => { const p = parseInt(ping); if (p === 0 || isNaN(p)) return '#9ca3af'; if (p < 100) return '#10b981'; if (p < 200) return '#f59e0b'; return '#ef4444'; };

      if (results && results.length > 0) {
        for (const server of results) {
          const isOnline = (now - server.last_updated) < OFFLINE_THRESHOLD;
          if (isOnline) { globalOnline++; globalSpeedIn += parseFloat(server.net_in_speed) || 0; globalSpeedOut += parseFloat(server.net_out_speed) || 0; } else { globalOffline++; }
          const rx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0);
          const tx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0);
          globalNetTx += (tx_val || 0); globalNetRx += (rx_val || 0);

          const { amount, remValue } = calcServerAsset(server, now);
          totalAsset += (amount || 0); remAsset += (remValue || 0); 
          server._remValue = (remValue || 0); server._amount = (amount || 0);

          const grpName = server.server_group || '默认分组';
          if (!groups[grpName]) groups[grpName] = [];
          groups[grpName].push(server);

          let cCodeMap = (server.country || 'xx').toUpperCase();
          if (cCodeMap === 'TW') cCodeMap = 'CN';
          if (cCodeMap !== 'XX') countryStats[cCodeMap] = (countryStats[cCodeMap] || 0) + 1;
        }
      }

      let localRank = 1; let globalNetAsset = totalAsset; let globalProposer = '--'; let currentHeight = 0; let activeBeacons = 0; let globalNodes = 1; let pendingTxsCount = 0;
      try {
          const activeThreshold = Date.now() - 86400000; 
          const { results: rankList } = await env.DB.prepare('SELECT domain, total_asset FROM blockchain_peers WHERE last_seen > ?').bind(activeThreshold).all();
          let higherCount = 0; let otherAssets = 0;
          
          for (const p of rankList) {
              if (p.domain !== host) {
                  let pAsset = parseFloat(p.total_asset) || 0;
                  pAsset = Math.min(pAsset, 500000); 
                  otherAssets += pAsset;
                  
                  if (pAsset > totalAsset + 0.001) {
                      higherCount++;
                  } else if (Math.abs(pAsset - totalAsset) <= 0.001) {
                      if (p.domain > host) {
                          higherCount++;
                      }
                  }
              }
          }
          localRank = higherCount + 1; globalNetAsset = totalAsset + otherAssets;
          
          let finalityHeight = 0; const topBlock = await env.DB.prepare('SELECT slot_id FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 1').first();
          if (topBlock) {
              finalityHeight = Math.max(1, topBlock.slot_id - FINALITY_DEPTH);
              const finalizedBlock = await env.DB.prepare('SELECT slot_id, proposer_domain FROM blockchain_ledger WHERE slot_id <= ? AND status = 1 ORDER BY slot_id DESC LIMIT 1').bind(finalityHeight).first();
              if (finalizedBlock) { currentHeight = finalizedBlock.slot_id; globalProposer = finalizedBlock.proposer_domain.replace('https://', ''); }
          }
          const bCountRow = await env.DB.prepare('SELECT count(*) as c FROM blockchain_peers WHERE is_beacon IN ("true", "1") AND last_seen > ?').bind(activeThreshold).first();
          activeBeacons = bCountRow ? bCountRow.c : 0;
          const nCountRow = await env.DB.prepare('SELECT count(*) as c FROM blockchain_peers WHERE last_seen > ?').bind(activeThreshold).first();
          globalNodes = nCountRow && nCountRow.c > 0 ? nCountRow.c : 1;
          const mCount = await env.DB.prepare('SELECT count(*) as c FROM mempool').first();
          pendingTxsCount = mCount ? mCount.c : 0;
      } catch(e) {}

      let filterTagsHtml = `<span class="filter-tag" data-code="all" onclick="setFilter('all')">全部 ${results.length}</span>`;
      for (const [code, count] of Object.entries(countryStats)) {
          filterTagsHtml += `<span class="filter-tag" data-code="${code.toLowerCase()}" onclick="setFilter('${code.toLowerCase()}')"><img src="https://flagcdn.com/16x12/${code.toLowerCase()}.png" alt="${code}"> ${code} ${count}</span>`;
      }

      let cardContentHtml = ''; let tableBodyHtml = '';
      if (Object.keys(groups).length === 0) {
        cardContentHtml = '<p style="text-align:center; width: 100%; color:#888;">暂无公开服务器</p>';
      } else {
        for (const [grpName, grpServers] of Object.entries(groups)) {
          cardContentHtml += `<div class="group-header">${grpName}</div><div class="grid-container">`;
          for (const server of grpServers) {
            const isOnline = (now - server.last_updated) < OFFLINE_THRESHOLD;
            const statusColor = isOnline ? '#10b981' : '#ef4444'; 
            const cpu = parseFloat(server.cpu || '0').toFixed(1); const ram = parseFloat(server.ram || '0').toFixed(1); const disk = parseFloat(server.disk || '0').toFixed(1);
            const netInSpeed = formatBytes(server.net_in_speed); const netOutSpeed = formatBytes(server.net_out_speed);
            const cCode = (server.country || 'xx').toLowerCase();
            const flagHtml = cCode !== 'xx' ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" style="vertical-align: sub; margin-right: 5px; border-radius: 2px;">` : '🏳️';
            
            let metaHtml = '';
            if (sys.show_price === 'true') {
              let priceHtml = `价格: ${server.price || '免费'}`;
              if (sys.show_asset === 'true' && server._amount > 0) priceHtml += ` <span style="color:#8b5cf6;font-weight:600;margin-left:8px;">剩余价值: ${server._remValue.toFixed(2)}${sys.asset_currency || '元'}</span>`;
              metaHtml += `<div class="card-meta" style="margin-top:8px;">${priceHtml}</div>`;
            }
            if (sys.show_expire === 'true') {
              let expireText = '永久';
              if (server.expire_date) {
                const expTime = new Date(server.expire_date).getTime();
                if (!isNaN(expTime)) { const diff = expTime - now; expireText = diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) + ' 天' : '已过期'; }
              }
              metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' ? 'margin-top:8px;' : ''}">剩余天数: ${expireText}</div>`;
            }

            const rx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0));
            const tx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0));
            metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' && sys.show_expire !== 'true' ? 'margin-top:8px;' : ''}">流量: <span style="color:#10b981">↓</span> ${rx_val_str} | <span style="color:#3b82f6">↑</span> ${tx_val_str}</div>`;
            const diffSec = Math.round((now - server.last_updated) / 1000);
            metaHtml += `<div class="card-meta" style="margin-top:2px;">在线: ${(server.uptime || '-').replace('days','天')} | 更新: ${diffSec}s前</div>`;

            let badgesHtml = '';
            if (sys.show_bw === 'true' && server.bandwidth) badgesHtml += `<span class="badge badge-bw">${server.bandwidth}</span>`;
            if (sys.show_tf === 'true' && server.traffic_limit) badgesHtml += `<span class="badge badge-tf">${server.traffic_limit}</span>`;
            if (server.ip_v4 === '1') badgesHtml += `<span class="badge badge-v4">IPv4</span>`;
            if (server.ip_v6 === '1') badgesHtml += `<span class="badge badge-v6">IPv6</span>`;

            const pingHtml = `<div class="ping-box"><span>电信 <span style="color:${getColor(server.ping_ct)}; font-weight:bold;">${server.ping_ct === '0' ? '超时' : server.ping_ct + 'ms'}</span></span><span>联通 <span style="color:${getColor(server.ping_cu)}; font-weight:bold;">${server.ping_cu === '0' ? '超时' : server.ping_cu + 'ms'}</span></span><span>移动 <span style="color:${getColor(server.ping_cm)}; font-weight:bold;">${server.ping_cm === '0' ? '超时' : server.ping_cm + 'ms'}</span></span><span>字节 <span style="color:${getColor(server.ping_bd)}; font-weight:bold;">${server.ping_bd === '0' ? '超时' : server.ping_bd + 'ms'}</span></span></div>`;
            const ramUsedStr = formatBytes((parseFloat(server.ram_used || 0) * 1048576).toString());
            const ramTotalStr = formatBytes((parseFloat(server.ram_total || 0) * 1048576).toString());
            const diskUsedStr = formatBytes((parseFloat(server.disk_used || 0) * 1048576).toString());
            const diskTotalStr = formatBytes((parseFloat(server.disk_total || 0) * 1048576).toString());

            cardContentHtml += `
              <a href="/?id=${server.id}" class="vps-card" data-country="${cCode}">
                <div class="card-left">
                  <div class="card-title"><div class="status-dot" style="background:${statusColor};"></div>${flagHtml} <span style="font-size:15px;" class="card-title-text">${server.name}</span></div>
                  ${metaHtml}
                  <div class="card-badges">${badgesHtml}</div>
                  ${pingHtml}
                </div>
                <div class="card-right">
                  <div class="stat-group">
                    <div class="stat-header"><span>CPU</span><span>${cpu}%</span></div>
                    <div class="stat-bar-full"><div style="width:${cpu}%; background:${cpu > 80 ? '#ef4444' : '#3b82f6'};"></div></div>
                    <div class="stat-subtext">${server.cpu_info || '-'}</div>
                  </div>
                  <div class="stat-group">
                    <div class="stat-header"><span>内存</span><span>${ram}%</span></div>
                    <div class="stat-bar-full"><div style="width:${ram}%; background:${ram > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${ramUsedStr} / ${ramTotalStr}</div>
                  </div>
                  <div class="stat-group">
                    <div class="stat-header"><span>存储</span><span>${disk}%</span></div>
                    <div class="stat-bar-full"><div style="width:${disk}%; background:${disk > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${diskUsedStr} / ${diskTotalStr}</div>
                  </div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; color:#888; margin-top:2px;">
                    <div>${server.os || '-'} | ${server.arch || '-'}</div>
                    <div>TCP/UDP: ${server.tcp_conn || '0'} / ${server.udp_conn || '0'}</div>
                  </div>
                  <div style="display:flex; justify-content:space-between; font-size:11px; color:#888; margin-top:4px; gap:8px;">
                    <div>↓ ${netInSpeed}/s</div><div>↑ ${netOutSpeed}/s</div>
                  </div>
                </div>
              </a>
            `;

            tableBodyHtml += `
              <tr onclick="window.location.href='/?id=${server.id}'" style="cursor:pointer;" data-country="${cCode}">
                <td style="text-align:center;"><div class="status-dot" style="background:${statusColor}; display:inline-block; margin:0;"></div></td>
                <td><b>${server.name}</b></td><td>${flagHtml}</td><td><span class="os-text">${server.os || '-'}</span></td>
                <td><div style="display:flex; align-items:center; gap:8px;"><div class="stat-bar" style="width:50px; margin:0;"><div style="width:${cpu}%; background:#3b82f6;"></div></div><span>${cpu}%</span></div></td>
                <td><div style="display:flex; align-items:center; gap:8px;"><div class="stat-bar" style="width:50px; margin:0;"><div style="width:${ram}%; background:#10b981;"></div></div><span>${ram}%</span></div></td>
                <td><div style="display:flex; align-items:center; gap:8px;"><div class="stat-bar" style="width:50px; margin:0;"><div style="width:${disk}%; background:#10b981;"></div></div><span>${disk}%</span></div></td>
                <td>${rx_val_str} | ${tx_val_str}</td><td>${netInSpeed}/s</td><td>${netOutSpeed}/s</td><td>${Math.round((now - server.last_updated)/1000)} 秒前</td>
              </tr>
            `;
          }
          cardContentHtml += `</div>`;
        }
      }

      let richListRows = '';
      try {
          const { results: rList } = await env.DB.prepare('SELECT address, balance FROM blockchain_wallets ORDER BY balance DESC LIMIT 10').all();
          rList.forEach((r, idx) => {
              const shortAddr = r.address.length > 15 ? r.address.substring(0,8) + '...' + r.address.slice(-6) : r.address;
              richListRows += `<tr><td>#${idx+1} <a href="javascript:void(0)" onclick="searchBalance('${r.address}')" style="color:#3b82f6; text-decoration:none; font-family:monospace;">${shortAddr}</a></td><td style="text-align:right; font-weight:bold; color:#10b981;">${r.balance.toFixed(2)} Cycle</td></tr>`;
          });
      } catch(e) {}

      let blockExplorerRows = '';
      try {
          const { results: recentBlocks } = await env.DB.prepare('SELECT * FROM blockchain_ledger WHERE status = 1 ORDER BY slot_id DESC LIMIT 50').all();
          for (const b of recentBlocks) {
              const bDate = new Date((b.timestamp || getNetworkTime()) + 8*3600000).toISOString().replace('T',' ').substring(0, 19);
              let txsHtml = `<span style="color:#94a3b8;">0 Txs</span>`;
              try {
                  const bPayload = JSON.parse(b.payload);
                  if (bPayload.txs && bPayload.txs.length > 0) {
                      const safeTxs = JSON.stringify(bPayload.txs).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                      txsHtml = `<a href="javascript:void(0)" onclick="showBlockTxs('${safeTxs}')" style="color:#8b5cf6; font-weight:bold; text-decoration:underline;">${bPayload.txs.length} Txs</a>`;
                  }
              } catch(e) {}
              blockExplorerRows += `<tr><td><b style="color:#10b981;"># ${b.slot_id}</b></td><td><span style="color:#3b82f6;">${b.proposer_domain.replace('https://','')}</span></td><td style="font-family:monospace; font-size:11px;">${b.block_hash}</td><td>${b.total_difficulty || 0}</td><td>${txsHtml}</td><td>${bDate}</td></tr>`;
          }
      } catch(e){}

      if (isAjax) {
          const ajaxResponse = `
              <div id="ajax-stats-payload" data-rank="${localRank}" data-net-asset="${(globalNetAsset || 0).toFixed(2)}" data-proposer="${globalProposer}" data-height="${currentHeight}" data-beacons="${activeBeacons}" data-nodes="${globalNodes}" data-pending-txs="${pendingTxsCount}" style="display:none;"></div>
              <div id="ajax-stats" style="display:none;">
                <div class="g-item"><div class="g-label">本站服务器总数</div><div class="g-val">${results.length}</div></div>
                ${sys.show_asset === 'true' ? `<div class="g-item"><div class="g-label">本站数字资产</div><div class="g-val">${(totalAsset||0).toFixed(2)} | ${(remAsset||0).toFixed(2)}</div></div>` : ''}
                <div class="g-item"><div class="g-label">总计流量</div><div class="g-val">${formatBytes(globalNetRx)} | ${formatBytes(globalNetTx)}</div></div>
                <div class="g-item"><div class="g-label">实时网速</div><div class="g-val">↓ ${formatBytes(globalSpeedIn)}/s | ↑ ${formatBytes(globalSpeedOut)}/s</div></div>
              </div>
              <div id="ajax-filters" style="display:none;">${filterTagsHtml}</div>
              <div id="ajax-cards">${cardContentHtml}</div>
              <tbody id="ajax-table" style="display:none;">${tableBodyHtml || '<tr><td>暂无数据</td></tr>'}</tbody>
              <tbody id="ajax-blocks" style="display:none;">${blockExplorerRows}</tbody>
              <tbody id="ajax-richlist" style="display:none;">${richListRows}</tbody>
              <script id="map-data" type="application/json">${JSON.stringify(countryStats)}</script>
          `;
          return new Response(ajaxResponse, { headers: { 'Content-Type': 'text/html' } });
      }

      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${sys.site_title}</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
        <script id="map-data" type="application/json">${JSON.stringify(countryStats)}</script>
        ${sys.custom_head || ''}
        <style>
          ${themeStyles}
          .consensus-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); padding: 15px 20px; border-radius: 12px; margin-bottom: 25px; font-family: monospace; box-sizing: border-box;}
          .c-label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
          .c-val { font-size: 18px; font-weight: bold; color: #10b981; }
          .ticker-bar { width: 100%; height: 4px; background: #e2e8f0; margin-top: 8px; border-radius: 2px; overflow: hidden; }
          .ticker-fill { height: 100%; background: #10b981; transition: width 0.1s linear; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f5f7; color: #333; margin: 0; padding: 20px; }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .admin-btn { padding: 8px 16px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight:bold; }
          .global-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); margin-bottom: 30px; text-align: center; }
          .g-val { font-size: 22px; font-weight: bold; color: #111; margin: 8px 0; }
          .g-label { font-size: 13px; color: #666; }
          .asset-radar { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
          .asset-radar input { flex: 1; min-width: 250px; padding: 10px 15px; border: 1px solid #e2e8f0; border-radius: 8px; font-family: monospace; }
          .asset-radar button { background: #8b5cf6; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
          .block-dashboard-layout { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; align-items: start; }
          .rich-list-card { background: white; border-radius: 12px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
          .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100; }
          .modal-content { background: white; padding: 20px; border-radius: 12px; width: 600px; max-width: 95%; margin: 40px auto; position: relative; max-height: 85vh; overflow-y: auto; }
        </style>
      </head>
      <body class="${sys.theme || 'theme1'}">
        <div class="container" id="app-container">
          <div class="header">
            <h1 style="margin:0;">${sys.site_title}</h1>
            <div style="display: flex; align-items: center; gap: 15px;">
              <div class="view-controls">
                <button class="toggle-btn active" id="btn-card" onclick="switchView('card')">卡片</button>
                <button class="toggle-btn" id="btn-table" onclick="switchView('table')">表格</button>
                <button class="toggle-btn" id="btn-map" onclick="switchView('map')">地图</button>
                <button class="toggle-btn" id="btn-block" onclick="switchView('block')">链上区块</button>
              </div>
              <a href="/admin" class="admin-btn">${sys.admin_title}</a>
            </div>
          </div>

          <div class="consensus-panel" id="web3-dashboard">
            <div><div class="c-label">最新区块高度 (已终局)</div><div class="c-val"># <span id="ui-height">${currentHeight}</span></div></div>
            <div>
              <div class="c-label">Slot 出块倒计时</div>
              <div class="c-val"><span id="ui-ticker">10.0</span> s</div>
              <div class="ticker-bar"><div class="ticker-fill" id="ui-ticker-bar"></div></div>
            </div>
            <div><div class="c-label">终局见证人</div><div class="c-val" style="font-size:13px;" id="ui-proposer">${globalProposer}</div></div>
            <div><div class="c-label">信标 / 全网节点数</div><div class="c-val"><span id="ui-beacons">${activeBeacons}</span> / <span id="ui-nodes">${globalNodes}</span></div></div>
          </div>

          <div class="global-stats" style="margin-bottom:15px;">
            <div class="g-item"><div class="g-label">全网综合排名 / 内存池待打包</div><div class="g-val">🏆 第 <span style="color:#f59e0b" id="ui-rank">${localRank}</span> 名 | <span style="color:#8b5cf6;" id="ui-pending-txs">${pendingTxsCount}</span> 笔</div></div>
            <div class="g-item"><div class="g-label">全网探针总资产重力</div><div class="g-val">💰 <span id="ui-net-asset">${(globalNetAsset || 0).toFixed(2)}</span> CNY</div></div>
          </div>

          <div class="filter-bar" id="ajax-filters">${filterTagsHtml}</div>
          <div class="global-stats" id="ajax-stats">
            <div class="g-item"><div class="g-label">本站服务器总数</div><div class="g-val">${results.length}</div></div>
            <div class="g-item"><div class="g-label">总计流量</div><div class="g-val">${formatBytes(globalNetRx)} | ${formatBytes(globalNetTx)}</div></div>
          </div>

          <div id="view-card" class="view-panel active"><div id="ajax-cards">${cardContentHtml}</div></div>
          <div id="view-table" class="view-panel"><div class="table-responsive"><table class="custom-table"><thead><tr><th>状态</th><th>节点名称</th><th>地区</th><th>系统</th><th>CPU</th><th>内存</th><th>磁盘</th><th>流量</th><th>下行</th><th>上行</th><th>更新</th></tr></thead><tbody id="ajax-table">${tableBodyHtml}</tbody></table></div></div>
          <div id="view-map" class="view-panel"><div id="map-container"></div></div>
          
          <div id="view-block" class="view-panel">
            <div class="asset-radar"><input type="text" id="radar-input" placeholder="输入 EVM 钱包地址 (0x...)"><button onclick="executeSearch()">🔍 查询资产</button></div>
            <div id="ui-balance-result" style="display:none; padding:15px; margin-bottom:20px; background:rgba(16,185,129,0.1); border-radius:8px;"></div>
            <div class="block-dashboard-layout">
                <div class="table-responsive" style="background:white; border-radius:12px; padding:10px;"><table class="custom-table"><thead><tr><th>区块高度 (Slot)</th><th>出块见证人</th><th>区块哈希</th><th>总难度</th><th>交易数</th><th>时间</th></tr></thead><tbody id="table-blocks-body">${blockExplorerRows}</tbody></table></div>
                <div class="rich-list-card"><h3>🏆 Cycle 财富英雄榜</h3><table class="custom-table"><tbody id="ajax-richlist">${richListRows}</tbody></table></div>
            </div>
          </div>
          ${getFooterHtml(sys)}
        </div>

        <div id="txTraceModal" class="modal"><div class="modal-content"><h3>🔗 区块交易流水</h3><div id="txTraceList" style="max-height:400px; overflow-y:auto; margin-bottom:15px;"></div><button onclick="document.getElementById('txTraceModal').style.display='none'">关闭</button></div></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          let mapInitialized = false; window.currentFilter = 'all';
          const EPOCH_START = ${EPOCH_START}; const SLOT_TIME = ${SLOT_TIME};
          setInterval(() => {
              const now = Date.now(); const elapsed = Math.max(0, now - EPOCH_START); const remMs = SLOT_TIME - (elapsed % SLOT_TIME);
              document.getElementById('ui-ticker').innerText = (remMs / 1000).toFixed(1);
              document.getElementById('ui-ticker-bar').style.width = (remMs / SLOT_TIME * 100) + '%';
          }, 100);

          function switchView(viewName) {
            document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active')); document.getElementById('btn-' + viewName).classList.add('active');
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active')); document.getElementById('view-' + viewName).classList.add('active');
            if (viewName === 'map') { if (!mapInitialized) { initMap(); mapInitialized = true; } else { window.myMap.invalidateSize(); } }
          }
          function setFilter(code) { window.currentFilter = code; applyFilter(); }
          function applyFilter() {
              document.querySelectorAll('.vps-card').forEach(el => el.style.display = (window.currentFilter === 'all' || el.dataset.country === window.currentFilter) ? 'flex' : 'none');
              document.querySelectorAll('#ajax-table tr').forEach(el => el.style.display = (window.currentFilter === 'all' || el.dataset.country === window.currentFilter) ? '' : 'none');
          }
          async function executeSearch() {
              const addr = document.getElementById('radar-input').value.trim(); if(!addr) return;
              const resDiv = document.getElementById('ui-balance-result'); resDiv.style.display = 'block';
              try {
                  const res = await fetch('/?action=balance&address=' + addr + '&t=' + Date.now()); const data = await res.json();
                  resDiv.innerHTML = \`账户地址 <b>\${addr}</b> 持有资产：<b style="color:#10b981;">\${data.balance.toFixed(2)} Cycle</b>\`;
              } catch(e) { resDiv.innerHTML = \`查询失败\`; }
          }
          function showBlockTxs(txsStr) {
              const txs = JSON.parse(txsStr); let html = '<ul>';
              txs.forEach(tx => { html += tx.type === 'COINBASE' ? \`<li>⛏️ 挖矿奖励 &rarr; \${tx.to} [+ \${tx.amount} Cycle]</li>\` : \`<li>💸 转账: \${tx.from} &rarr; \${tx.to} [\${tx.amount} Cycle]</li>\`; });
              document.getElementById('txTraceList').innerHTML = html + '</ul>'; document.getElementById('txTraceModal').style.display = 'block';
          }
          let markersLayer; let geoJsonLayer; let worldGeoJson = null; let currentMapDataStr = "";
          const countryCoords = { 'US': [37.09, -95.71], 'CN': [35.86, 104.19], 'JP': [36.20, 138.25], 'HK': [22.31, 114.16], 'SG': [1.35, 103.81], 'DE': [51.16, 10.45] };
          async function initMap() {
            window.myMap = L.map('map-container', { attributionControl: false }).setView([30, 10], 2);
            try { const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json'); worldGeoJson = await res.json(); drawMarkers(); } catch (e) {}
          }
          function drawMarkers() {
            if(!window.myMap || !worldGeoJson) return; const newDataStr = document.getElementById('map-data').textContent; if (currentMapDataStr === newDataStr) return; currentMapDataStr = newDataStr;
            if(geoJsonLayer) window.myMap.removeLayer(geoJsonLayer); if(markersLayer) markersLayer.clearLayers(); else markersLayer = L.layerGroup().addTo(window.myMap);
            const data = JSON.parse(newDataStr);
            geoJsonLayer = L.geoJSON(worldGeoJson, { style: function() { return { fillColor: '#d5dce2', weight: 1, color: '#ffffff' }; } }).addTo(window.myMap);
            for (const [code, count] of Object.entries(data)) { if(countryCoords[code]) { L.marker(countryCoords[code], {icon: L.divIcon({ className: 'custom-map-badge', html: \`<div>\${count}</div>\` })}).addTo(markersLayer); } }
          }

          setInterval(async () => {
            try {
              const res = await fetch(location.href + (location.href.includes('?') ? '&' : '?') + 'ajax=1'); const htmlText = await res.text();
              const parser = new DOMParser(); const newDoc = parser.parseFromString(htmlText, 'text/html');
              const payloadData = newDoc.getElementById('ajax-stats-payload');
              if (payloadData) {
                  document.getElementById('ui-rank').innerText = payloadData.getAttribute('data-rank'); document.getElementById('ui-net-asset').innerText = payloadData.getAttribute('data-net-asset'); document.getElementById('ui-proposer').innerText = payloadData.getAttribute('data-proposer'); document.getElementById('ui-height').innerText = payloadData.getAttribute('data-height'); document.getElementById('ui-beacons').innerText = payloadData.getAttribute('data-beacons'); document.getElementById('ui-nodes').innerText = payloadData.getAttribute('data-nodes'); document.getElementById('ui-pending-txs').innerText = payloadData.getAttribute('data-pending-txs');
              }
              ['ajax-stats', 'ajax-cards', 'ajax-table', 'table-blocks-body', 'ajax-filters', 'map-data', 'ajax-richlist'].forEach(id => {
                  const newEl = newDoc.getElementById(id === 'table-blocks-body' ? 'ajax-blocks' : id);
                  if (newEl && document.getElementById(id)) { if (id === 'map-data') document.getElementById(id).textContent = newEl.textContent; else document.getElementById(id).innerHTML = newEl.innerHTML; }
              });
              drawMarkers(); applyFilter(); 
            } catch (e) {}
          }, 15000); 
        </script>
      </body>
      </html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    return new Response('Not Found', { status: 404 });
  }
};
