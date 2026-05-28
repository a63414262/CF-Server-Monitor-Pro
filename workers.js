export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.origin;

    // ==========================================
    // 0. 数据库自动化热创建与无缝升级 (Auto Migration)
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
        
        // 新增了 virt 字段用于虚拟化识别
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
        
        globalThis.dbInitialized = true;
      } catch (e) {
        console.error("❌ 数据库自动初始化失败:", e);
      }
    }

    const formatBytes = (bytes) => {
      const b = parseInt(bytes);
      if (isNaN(b) || b === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // ==========================================
    // 1. 认证机制与全局设置加载
    // ==========================================
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

    let sys = {
      site_title: '⚡ Server Monitor Pro',
      admin_title: '⚙️ 探针管理后台',
      theme: 'theme1', 
      custom_bg: '',
      custom_css: '',
      custom_head: '',   
      custom_script: '', 
      is_public: 'true',
      show_price: 'true',
      show_expire: 'true',
      show_bw: 'true',
      show_tf: 'true',
      tg_notify: 'false',
      tg_bot_token: '',
      tg_chat_id: '',
      auto_reset_traffic: 'false',
      report_interval: '5'
    };

    try {
      const { results } = await env.DB.prepare('SELECT * FROM settings').all();
      if (results && results.length > 0) {
        results.forEach(r => sys[r.key] = r.value);
      }
    } catch (e) {}

    // ==========================================
    // Telegram 离线检测与通知机制
    // ==========================================
    const sendTelegram = async (msg) => {
      if (sys.tg_notify !== 'true' || !sys.tg_bot_token || !sys.tg_chat_id) return;
      try {
        await fetch(`https://api.telegram.org/bot${sys.tg_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: sys.tg_chat_id, text: msg, parse_mode: 'HTML' })
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

        let stateChanged = false;
        const now = Date.now();

        for (const s of allServers) {
          const diff = now - s.last_updated;
          const isOffline = diff > 120000; 

          if (isOffline && !alertState[s.id]) {
            await sendTelegram(`⚠️ <b>节点离线告警</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 离线 (超过2分钟未上报)\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
            alertState[s.id] = true;
            stateChanged = true;
          } else if (!isOffline && alertState[s.id]) {
            await sendTelegram(`✅ <b>节点恢复通知</b>\n\n<b>节点名称:</b> ${s.name}\n<b>状态:</b> 恢复在线\n<b>时间:</b> ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
            delete alertState[s.id];
            stateChanged = true;
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
      .theme5 .vps-card, .theme5 .global-stats, .theme5 .header-card, .theme5 .chart-card { background: #0b0c10; border: 1px solid #f0f; border-radius: 0; box-shadow: 0 0 10px rgba(255, 0, 255, 0.2); color: #fff; }
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
      .filter-tag { display: inline-flex; align-items: center; gap: 5px; background: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #475569; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid transparent; cursor:pointer;}
      .filter-tag.active { background: #3b82f6; color: white; border-color: #3b82f6; }
      #map-container { width: 100%; height: 500px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; border: 1px solid #e5e7eb; background-color: #b1c2d4; background-image: linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px); background-size: 20px 20px; z-index: 1; }
      body.theme2 #map-container, body.theme5 #map-container { background-color: #0d1117; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); border-color: #30363d; }
      .custom-map-badge div { background-color: #10b981; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
      .view-panel { display: none; } .view-panel.active { display: block; animation: fadeIn 0.3s ease; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      
      /* 新增的堆叠卡片样式 */
      .stat-group { display: flex; flex-direction: column; margin-bottom: 8px; }
      .stat-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: inherit; }
      .stat-bar-full { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
      .stat-bar-full > div { height: 100%; border-radius: 3px; transition: width 0.3s; }
      .stat-subtext { font-size: 11px; color: #6b7280; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .theme2 .stat-subtext, .theme4 .stat-subtext, .theme5 .stat-subtext { color: rgba(255,255,255,0.6); }
      .card-right { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 15px; border-left: 1px solid rgba(150,150,150,0.1); min-width: 0; }
      
      /* 表格内进度条通用样式修复 */
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
          const isOnline = (now - s.last_updated) < 30000;
          const status = isOnline ? '<span style="color:green; font-weight:bold;">在线</span>' : '<span style="color:red; font-weight:bold;">离线</span>';
          const hiddenBadge = s.is_hidden === 'true' ? '<span style="background:#64748b; color:white; padding:2px 6px; border-radius:4px; font-size:12px; margin-left:5px;">已隐藏</span>' : '';
          
          const osType = s.agent_os === 'alpine' ? 'alpine' : 'debian';
          const shellType = osType === 'alpine' ? 'sh' : 'bash';
          const cmdApp = "cur" + "l";
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
          .btn-blue { background: #3b82f6; } .btn-green { background: #10b981; } .btn-red { background: #ef4444; } .btn-gray { background: #6b7280; }
          .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .form-group { display: flex; flex-direction: column; margin-bottom: 15px; }
          .form-group label { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #555;}
          .form-group input[type="text"], .form-group select, .form-group input[type="date"] { padding: 10px; border: 1px solid #ccc; border-radius: 6px; }
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
          <h2>🛠️ 全局设置与高级自定义</h2>
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
                <label>🧑‍💻 自定义 &lt;head&gt; 注入 (引入字体/外部CSS等)</label>
                <textarea id="cfg_custom_head" rows="3" placeholder="&lt;link rel='stylesheet' href='...'&gt;">${sys.custom_head || ''}</textarea>
              </div>
              <div class="form-group">
                <label>🧑‍💻 自定义底部 Script 注入 (可执行任意 JS, 接管页面渲染)</label>
                <textarea id="cfg_custom_script" rows="4" placeholder="&lt;script&gt;console.log('Hello');&lt;/script&gt;">${sys.custom_script || ''}</textarea>
              </div>

              <div class="form-group">
                <label>🖼️ 自定义背景图片 (上传或填URL，开启后强制全透明)</label>
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
                <span style="font-size:12px; color:#888; margin-top:5px;">* 默认 5 秒。修改后，需去对应的 VPS 重新执行一次安装命令才会生效。</span>
              </div>
            </div>
            <div>
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #555;">👁️ 前台展示控制</label>
              
              <div class="checkbox-group" style="background:#fefce8; padding:8px; border-radius:6px; border:1px solid #fef08a; margin-bottom:15px;">
                <input type="checkbox" id="cfg_auto_reset_traffic" ${sys.auto_reset_traffic === 'true' ? 'checked' : ''}>
                <label for="cfg_auto_reset_traffic"><b>启用每月1号重置流量</b><br><span style="font-size:12px;color:#854d0e;font-weight:normal;">开启后大盘将计算自然月累计流量，且重启机器不会清零</span></label>
              </div>

              <div class="checkbox-group">
                <input type="checkbox" id="cfg_is_public" ${sys.is_public === 'true' ? 'checked' : ''}>
                <label for="cfg_is_public"><b>公开访问</b> (取消勾选后，访客必须输入密码才能查看探针)</label>
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

              <hr style="margin: 20px 0; border: none; border-top: 1px dashed #ccc;">
              <label style="font-size: 14px; font-weight: 600; margin-bottom: 10px; display: block; color: #e63946;">✈️ Telegram 离线告警设置</label>
              <div class="form-group">
                <label>开启离线通知</label>
                <select id="cfg_tg_notify">
                  <option value="false" ${sys.tg_notify !== 'true' ? 'selected' : ''}>关闭告警</option>
                  <option value="true" ${sys.tg_notify === 'true' ? 'selected' : ''}>开启告警 (超过2分钟掉线自动推送)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Bot Token</label>
                <input type="text" id="cfg_tg_bot_token" value="${sys.tg_bot_token || ''}" placeholder="如: 12345678:ABCDEFG...">
              </div>
              <div class="form-group">
                <label>Chat ID</label>
                <input type="text" id="cfg_tg_chat_id" value="${sys.tg_chat_id || ''}" placeholder="如: 123456789">
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
            <label>价格</label> <input type="text" id="editPrice" placeholder="如：40USD/Year 或 免费">
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
                tg_notify: document.getElementById('cfg_tg_notify').value,
                tg_bot_token: document.getElementById('cfg_tg_bot_token').value,
                tg_chat_id: document.getElementById('cfg_tg_chat_id').value,
                report_interval: document.getElementById('cfg_report_interval').value || '5'
              }
            };
            const res = await fetch('/admin/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { alert('✅ 设置已保存！'); location.reload(); } else alert('保存失败');
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
              action: 'edit', 
              id: document.getElementById('editId').value,
              name: document.getElementById('editName').value,
              agent_os: document.getElementById('editOs').value,
              server_group: document.getElementById('editGroup').value, price: document.getElementById('editPrice').value,
              expire_date: document.getElementById('editExpire').value, bandwidth: document.getElementById('editBandwidth').value,
              traffic_limit: document.getElementById('editTraffic').value,
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
    // 一键安装脚本 (/install.sh) - 完美兼容 Alpine/ash 和 Systemd/bash
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/install.sh') {
      let reportInterval = '5';
      try {
        const res = await env.DB.prepare("SELECT value FROM settings WHERE key = 'report_interval'").first();
        if (res && res.value) reportInterval = res.value;
      } catch(e) {}

      const osType = url.searchParams.get('os') || 'debian';
      const sh_bin = osType === 'alpine' ? "/bin/sh" : "/bin/bash";
      const cmdApp = "cur" + "l";
      const sh_sys = "system" + "ctl";

      let bashScript = `#!${sh_bin}
SERVER_ID=$1
SECRET=$2
WORKER_URL="${host}/update"

if [ -z "$SERVER_ID" ] || [ -z "$SECRET" ]; then echo "错误: 缺少参数。"; exit 1; fi
echo "开始安装全面增强版 CF Probe Agent (${osType === 'alpine' ? 'Alpine/OpenRC' : 'Systemd'})..."

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

get_net_bytes() { awk 'NR>2 {rx+=\\$2; tx+=\\$10} END {printf "%.0f %.0f", rx, tx}' /proc/net/dev; }
get_cpu_stat() { awk '/^cpu / {print \\$2+\\$3+\\$4+\\$5+\\$6+\\$7+\\$8+\\$9, \\$5+\\$6}' /proc/stat; }

get_http_ping() { rtt=\\$(${cmdApp} -o /dev/null -s -m 2 -w "%{time_total}" "http://\\$1" 2>/dev/null | awk '{printf "%.0f", \\$1*1000}'); echo "\\\${rtt:-0}"; }

NET_STAT=\\$(get_net_bytes)
RX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$1}')
TX_PREV=\\$(echo \\$NET_STAT | awk '{print \\$2}')
if [ -z "\\$RX_PREV" ]; then RX_PREV=0; fi
if [ -z "\\$TX_PREV" ]; then TX_PREV=0; fi

CPU_STAT=\\$(get_cpu_stat)
PREV_CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
PREV_CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')

LOOP_COUNT=0
IPV4="0"; IPV6="0"
PING_CT="0"; PING_CU="0"; PING_CM="0"; PING_BD="0"

while true; do
  if [ \\$((LOOP_COUNT % 60)) -eq 0 ]; then
    ${cmdApp} -s -4 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV4="1" || IPV4="0"
    ${cmdApp} -s -6 -m 3 https://cloudflare.com/cdn-cgi/trace 2>/dev/null | grep -q "ip=" && IPV6="1" || IPV6="0"
  fi
  
  if [ \\$((LOOP_COUNT % 6)) -eq 0 ]; then
    idx=\\$((LOOP_COUNT % 3))
    case \\$idx in
      0) CT_NODE="bj-ct-dualstack.ip.zstaticcdn.com"; CU_NODE="bj-cu-dualstack.ip.zstaticcdn.com"; CM_NODE="bj-cm-dualstack.ip.zstaticcdn.com" ;;
      1) CT_NODE="sh-ct-dualstack.ip.zstaticcdn.com"; CU_NODE="sh-cu-dualstack.ip.zstaticcdn.com"; CM_NODE="sh-cm-dualstack.ip.zstaticcdn.com" ;;
      2) CT_NODE="gd-ct-dualstack.ip.zstaticcdn.com"; CU_NODE="gd-cu-dualstack.ip.zstaticcdn.com"; CM_NODE="gd-cm-dualstack.ip.zstaticcdn.com" ;;
    esac
    PING_CT=\\$(get_http_ping "\\$CT_NODE")
    PING_CU=\\$(get_http_ping "\\$CU_NODE")
    PING_CM=\\$(get_http_ping "\\$CM_NODE")
    PING_BD=\\$(get_http_ping "lf3-ips.zstaticcdn.com")
  fi
  
  LOOP_COUNT=\\$((LOOP_COUNT + 1))

  OS=\\$(awk -F= '/^PRETTY_NAME/{print \\$2}' /etc/os-release 2>/dev/null | tr -d '"')
  if [ -z "\\$OS" ]; then OS=\\$(uname -srm); fi
  ARCH=\\$(uname -m)
  BOOT_TIME=\\$(uptime -s 2>/dev/null || stat -c %y / 2>/dev/null | cut -d'.' -f1 || echo "Unknown")
  CPU_INFO=\\$(grep -m 1 'model name' /proc/cpuinfo | awk -F: '{print \\$2}' | xargs | tr -d '"')
  
  VIRT=""
  if command -v systemd-detect-virt >/dev/null 2>&1; then VIRT=\\$(systemd-detect-virt 2>/dev/null); fi
  if [ -z "\\$VIRT" ] || [ "\\$VIRT" = "none" ]; then
    if grep -q "lxc" /proc/1/environ 2>/dev/null; then VIRT="lxc"
    elif grep -q "docker" /proc/1/environ 2>/dev/null; then VIRT="docker"
    elif [ -f /proc/user_beancounters ]; then VIRT="openvz"
    elif grep -qi "kvm" /proc/cpuinfo 2>/dev/null; then VIRT="kvm"
    elif grep -qi "qemu" /proc/cpuinfo 2>/dev/null; then VIRT="qemu"
    elif [ -f /sys/class/dmi/id/product_name ]; then VIRT=\\$(cat /sys/class/dmi/id/product_name | head -n1 | cut -d' ' -f1)
    else VIRT="Unknown"
    fi
  fi
  VIRT=\\$(echo "\\$VIRT" | tr '[:lower:]' '[:upper:]')

  CPU_STAT=\\$(get_cpu_stat)
  CPU_TOTAL=\\$(echo \\$CPU_STAT | awk '{print \\$1}')
  CPU_IDLE=\\$(echo \\$CPU_STAT | awk '{print \\$2}')
  DIFF_TOTAL=\\$((CPU_TOTAL - PREV_CPU_TOTAL))
  DIFF_IDLE=\\$((CPU_IDLE - PREV_CPU_IDLE))
  
  CPU=\\$(awk -v t=\\$DIFF_TOTAL -v i=\\$DIFF_IDLE 'BEGIN {if (t<=0) print 0; else {pct=(1 - i/t)*100; if(pct<0) print 0; else if(pct>100) print 100; else printf "%.2f", pct}}')
  
  PREV_CPU_TOTAL=\\$CPU_TOTAL; PREV_CPU_IDLE=\\$CPU_IDLE
  
  MEM_INFO=\\$(free -m 2>/dev/null)
  RAM_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$2}')
  RAM_USED=\\$(echo "\\$MEM_INFO" | awk '/Mem:/ {print \\$3}')
  RAM=\\$(awk "BEGIN {if(\\$RAM_TOTAL>0) printf \\"%.2f\\", \\$RAM_USED/\\$RAM_TOTAL * 100.0; else print 0}")
  
  SWAP_TOTAL=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$2}')
  SWAP_USED=\\$(echo "\\$MEM_INFO" | awk '/Swap:/ {print \\$3}')
  if [ -z "\\$SWAP_TOTAL" ]; then SWAP_TOTAL=0; fi
  if [ -z "\\$SWAP_USED" ]; then SWAP_USED=0; fi

  DISK_INFO=\\$(df -m / 2>/dev/null | tail -n1 | awk '{print \\$2, \\$3, \\$5}')
  DISK_TOTAL=\\$(echo "\\$DISK_INFO" | awk '{print \\$1}')
  DISK_USED=\\$(echo "\\$DISK_INFO" | awk '{print \\$2}')
  DISK=\\$(echo "\\$DISK_INFO" | awk '{print \\$3}' | tr -d '%')

  LOAD=\\$(cat /proc/loadavg | awk '{print \\$1, \\$2, \\$3}')
  UPTIME=\\$(awk '{d=int(\\$1/86400); h=int((\\$1%86400)/3600); m=int((\\$1%3600)/60); if(d>0) printf "%d days, %02d:%02d\\n", d, h, m; else printf "%02d:%02d\\n", h, m}' /proc/uptime 2>/dev/null || uptime -p 2>/dev/null | sed 's/up //')
  
  PROCESSES=\\$(ps -e 2>/dev/null | grep -v "PID" | wc -l)
  
  if command -v ss >/dev/null 2>&1; then
    TCP_CONN=\\$(ss -ant 2>/dev/null | grep -v "State" | wc -l)
    UDP_CONN=\\$(ss -anu 2>/dev/null | grep -v "State" | wc -l)
  else
    TCP_CONN=\\$(netstat -ant 2>/dev/null | grep -c "^tcp")
    UDP_CONN=\\$(netstat -anu 2>/dev/null | grep -c "^udp")
  fi
  if [ -z "\\$TCP_CONN" ]; then TCP_CONN=0; fi
  if [ -z "\\$UDP_CONN" ]; then UDP_CONN=0; fi
  
  NET_STAT=\\$(get_net_bytes)
  RX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$1}')
  TX_NOW=\\$(echo \\$NET_STAT | awk '{print \\$2}')
  if [ -z "\\$RX_NOW" ]; then RX_NOW=0; fi
  if [ -z "\\$TX_NOW" ]; then TX_NOW=0; fi

  RX_SPEED=\\$(((RX_NOW - RX_PREV) / 5))
  TX_SPEED=\\$(((TX_NOW - TX_PREV) / 5))
  RX_PREV=\\$RX_NOW; TX_PREV=\\$TX_NOW
  
  PAYLOAD="{\\"id\\": \\"\\$SERVER_ID\\", \\"secret\\": \\"\\$SECRET\\", \\"metrics\\": { \\"cpu\\": \\"\\$CPU\\", \\"ram\\": \\"\\$RAM\\", \\"ram_total\\": \\"\\$RAM_TOTAL\\", \\"ram_used\\": \\"\\$RAM_USED\\", \\"swap_total\\": \\"\\$SWAP_TOTAL\\", \\"swap_used\\": \\"\\$SWAP_USED\\", \\"disk\\": \\"\\$DISK\\", \\"disk_total\\": \\"\\$DISK_TOTAL\\", \\"disk_used\\": \\"\\$DISK_USED\\", \\"load\\": \\"\\$LOAD\\", \\"uptime\\": \\"\\$UPTIME\\", \\"boot_time\\": \\"\\$BOOT_TIME\\", \\"net_rx\\": \\"\\$RX_NOW\\", \\"net_tx\\": \\"\\$TX_NOW\\", \\"net_in_speed\\": \\"\\$RX_SPEED\\", \\"net_out_speed\\": \\"\\$TX_SPEED\\", \\"os\\": \\"\\$OS\\", \\"arch\\": \\"\\$ARCH\\", \\"cpu_info\\": \\"\\$CPU_INFO\\", \\"processes\\": \\"\\$PROCESSES\\", \\"tcp_conn\\": \\"\\$TCP_CONN\\", \\"udp_conn\\": \\"\\$UDP_CONN\\", \\"ip_v4\\": \\"\\$IPV4\\", \\"ip_v6\\": \\"\\$IPV6\\", \\"ping_ct\\": \\"\\$PING_CT\\", \\"ping_cu\\": \\"\\$PING_CU\\", \\"ping_cm\\": \\"\\$PING_CM\\", \\"ping_bd\\": \\"\\$PING_BD\\", \\"virt\\": \\"\\$VIRT\\" }}"
  
  ${cmdApp} -s -X POST -H "Content-Type: application/json" -d "\\$PAYLOAD" "\\$WORKER_URL" > /dev/null
  sleep ${reportInterval}
done
EOF

chmod +x /usr/local/bin/cf-probe.sh

`;

      // 差异化安装守护进程
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
echo "✅ Alpine 探针安装成功！"
`;
      } else {
        const sh_etc = "/etc/" + "systemd/" + "system";
        bashScript += `cat << EOF > ${sh_etc}/cf-probe.service
[Unit]
Description=Cloudflare Worker Probe Agent
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
echo "✅ Linux 探针安装成功！"
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
        const { id, secret, metrics } = data;

        if (secret !== env.API_SECRET) return new Response('Unauthorized', { status: 401 });

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

        if (current_rx >= last_rx) monthly_rx += (current_rx - last_rx);
        else monthly_rx += current_rx;

        if (current_tx >= last_tx) monthly_tx += (current_tx - last_tx);
        else monthly_tx += current_tx;

        last_rx = current_rx; last_tx = current_tx;

        // 提取并更新历史数据
        let history = {};
        try { history = JSON.parse(serverExists.history || '{}'); } catch(e) {}
        
        const nowMs = Date.now();
        const lastHistTime = history.last_time || 0;
        
        // 5分钟记录一次历史数据 (288点 = 24小时)
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

        ctx.waitUntil(checkOfflineNodes());
        return new Response('OK', { status: 200 });
      } catch (e) {
        return new Response('Error', { status: 400 });
      }
    }

    // ==========================================
    // 单个服务器详情 JSON API
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/api/server') {
      if (sys.is_public !== 'true' && !checkAuth(request)) return authResponse(sys.site_title);
      
      const id = url.searchParams.get('id');
      if (!id) return new Response('Miss ID', { status: 400 });
      const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
      if (!server || server.is_hidden === 'true') return new Response('Not Found', { status: 404 });
      return new Response(JSON.stringify(server), { headers: { 'Content-Type': 'application/json' } });
    }

    // ==========================================
    // 前台探针首页 & 详情页 (/ )
    // ==========================================
    if (request.method === 'GET' && url.pathname === '/') {
      if (sys.is_public !== 'true' && !checkAuth(request)) {
        return authResponse(sys.site_title);
      }

      // ==========================================
      // 访问量统计逻辑 (避免 Ajax/接口 刷新被意外记录)
      // ==========================================
      const isAjax = url.searchParams.get('ajax') === '1';
      if (!isAjax) {
        // 使用东八区时间计算当前日期
        const nowTime = new Date();
        const tzOffset = 8 * 60 * 60000; 
        const localNow = new Date(nowTime.getTime() + tzOffset);
        const todayStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}-${localNow.getDate()}`;
        
        let vTotal = parseInt(sys.visits_total || '0');
        let vToday = parseInt(sys.visits_today || '0');
        let vDate = sys.visits_date || '';
        
        vTotal++;
        if (vDate !== todayStr) {
            vToday = 1; // 跨天重置
            vDate = todayStr;
        } else {
            vToday++;
        }
        
        // 更新内存状态，保证页面能立即渲染最新数值
        sys.visits_total = vTotal.toString();
        sys.visits_today = vToday.toString();
        sys.visits_date = todayStr;

        // 通过 waitUntil 后台静默保存到 D1 数据库，不阻塞页面返回
        const updateVisits = async () => {
            try {
                await env.DB.prepare(`
                    INSERT INTO settings (key, value) VALUES ('visits_total', ?), ('visits_today', ?), ('visits_date', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                `).bind(vTotal.toString(), vToday.toString(), todayStr).run();
            } catch(e) {
                console.error("更新访问量失败", e);
            }
        };
        ctx.waitUntil(updateVisits());
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
            
            const commonOptions = { 
              responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, 
              scales: { x: { display: false }, y: { beginAtZero: true, border: { display: false } } }, 
              plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
              elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } } 
            };
            
            const createChart = (ctxId, color, bgColor) => { 
                const ctx = document.getElementById(ctxId).getContext('2d'); 
                return new Chart(ctx, { 
                    type: 'line', 
                    data: { labels: [], datasets: [{ data: [], borderColor: color, backgroundColor: bgColor, fill: true }] }, 
                    options: commonOptions 
                }); 
            };
            
            const charts = { 
                cpu: createChart('chartCPU', '#3b82f6', 'rgba(59, 130, 246, 0.1)'), 
                ram: createChart('chartRAM', '#8b5cf6', 'rgba(139, 92, 246, 0.1)'), 
                proc: createChart('chartProc', '#ec4899', 'rgba(236, 72, 153, 0.1)') 
            };
            
            charts.net = new Chart(document.getElementById('chartNet').getContext('2d'), { 
                type: 'line', 
                data: { labels: [], datasets: [ 
                    { label: 'In', data: [], borderColor: '#10b981', borderWidth: 2, tension: 0.4, pointRadius: 0 }, 
                    { label: 'Out', data: [], borderColor: '#3b82f6', borderWidth: 2, tension: 0.4, pointRadius: 0 } 
                ]}, options: commonOptions 
            });
            
            charts.conn = new Chart(document.getElementById('chartConn').getContext('2d'), { 
                type: 'line', 
                data: { labels: [], datasets: [ 
                    { label: 'TCP', data: [], borderColor: '#6366f1', borderWidth: 2, tension: 0.4, pointRadius: 0 }, 
                    { label: 'UDP', data: [], borderColor: '#d946ef', borderWidth: 2, tension: 0.4, pointRadius: 0 } 
                ]}, options: commonOptions 
            });
            
            const pingOptions = { 
                responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, 
                scales: { x: { display: true, ticks: { maxTicksLimit: 15, color: '#9ca3af', font: { size: 10 } } }, y: { beginAtZero: true, border: { display: false } } }, 
                plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { enabled: true, mode: 'index', intersect: false } }, 
                elements: { point: { radius: 0, hitRadius: 10, hoverRadius: 4 }, line: { tension: 0.3, borderWidth: 2 } } 
            };
            
            charts.ping = new Chart(document.getElementById('chartPing').getContext('2d'), { 
                type: 'line', 
                data: { labels: [], datasets: [ 
                    { label: '电信', data: [], borderColor: '#10b981', backgroundColor: 'transparent' }, 
                    { label: '联通', data: [], borderColor: '#f59e0b', backgroundColor: 'transparent' }, 
                    { label: '移动', data: [], borderColor: '#3b82f6', backgroundColor: 'transparent' }, 
                    { label: '字节', data: [], borderColor: '#8b5cf6', backgroundColor: 'transparent' } 
                ] }, 
                options: pingOptions 
            });

            async function fetchData() {
              try {
                const res = await fetch('/api/server?id=' + serverId); const data = await res.json();
                const cCode = (data.country || 'xx').toLowerCase();
                document.getElementById('head-flag').innerHTML = cCode !== 'xx' ? \`<img src="https://flagcdn.com/24x18/\${cCode}.png" alt="\${cCode}" style="vertical-align: middle; margin-right: 8px; border-radius: 2px;">\` : '🏳️ ';
                document.getElementById('val-uptime').innerText = data.uptime || 'N/A'; document.getElementById('val-arch').innerText = data.arch || 'N/A'; document.getElementById('val-os').innerText = data.os || 'N/A'; document.getElementById('val-virt').innerText = data.virt || 'N/A'; document.getElementById('val-cpuinfo').innerText = data.cpu_info || 'N/A'; document.getElementById('val-load').innerText = data.load_avg || '0.00'; document.getElementById('val-boot').innerText = data.boot_time || 'N/A'; 
                document.getElementById('val-traffic').innerText = formatBytes(data.${txField} || 0) + ' / ' + formatBytes(data.${rxField} || 0);

                const isOnline = (Date.now() - data.last_updated) < 30000;
                const badge = document.getElementById('head-status'); badge.innerText = isOnline ? '在线' : '离线'; badge.style.background = isOnline ? '#10b981' : '#ef4444';
                if(!isOnline) return;
                
                document.getElementById('text-cpu').innerText = data.cpu + '%'; document.getElementById('text-ram').innerText = data.ram + '%'; document.getElementById('text-swap').innerText = 'Swap: ' + data.swap_used + ' MiB / ' + data.swap_total + ' MiB'; document.getElementById('text-proc').innerText = data.processes || '0'; document.getElementById('text-net-in').innerText = formatBytes(data.net_in_speed) + '/s'; document.getElementById('text-net-out').innerText = formatBytes(data.net_out_speed) + '/s'; document.getElementById('text-tcp').innerText = data.tcp_conn || '0'; document.getElementById('text-udp').innerText = data.udp_conn || '0';
                let diskTotal = parseFloat(data.disk_total) || 0; let diskUsed = parseFloat(data.disk_used) || 0; let diskPct = parseInt(data.disk) || 0;
                document.getElementById('text-disk').innerText = diskPct + '%'; document.getElementById('disk-bar').style.width = diskPct + '%'; document.getElementById('text-disk-detail').innerText = (diskUsed/1024).toFixed(2) + ' GiB / ' + (diskTotal/1024).toFixed(2) + ' GiB';
                document.getElementById('t-ct').innerText = data.ping_ct + 'ms'; document.getElementById('t-cu').innerText = data.ping_cu + 'ms'; document.getElementById('t-cm').innerText = data.ping_cm + 'ms'; document.getElementById('t-bd').innerText = data.ping_bd + 'ms';

                let hist = {};
                try { if(data.history) hist = JSON.parse(data.history); } catch(e) {}
                
                if (hist.time && hist.time.length > 0) {
                    const nowTime = new Date(); 
                    const timeLabel = nowTime.getHours().toString().padStart(2, '0') + ':' + String(nowTime.getMinutes()).padStart(2, '0');
                    const rtLabels = [...hist.time, timeLabel];

                    const updateChartSync = (chart, histArray, rtValue) => {
                        chart.data.labels = rtLabels;
                        chart.data.datasets[0].data = histArray ? [...histArray, rtValue] : [];
                        chart.update('none');
                    };

                    const updateMultiChartSync = (chart, histArrays, rtValues) => {
                        chart.data.labels = rtLabels;
                        histArrays.forEach((hArr, i) => {
                            chart.data.datasets[i].data = hArr ? [...hArr, rtValues[i]] : [];
                        });
                        chart.update('none');
                    };

                    updateChartSync(charts.cpu, hist.cpu, parseFloat(data.cpu) || 0);
                    updateChartSync(charts.ram, hist.ram, parseFloat(data.ram) || 0);
                    updateChartSync(charts.proc, hist.proc, parseInt(data.processes) || 0);

                    updateMultiChartSync(charts.net, [hist.net_in, hist.net_out], [parseFloat(data.net_in_speed) || 0, parseFloat(data.net_out_speed) || 0]);
                    updateMultiChartSync(charts.conn, [hist.tcp, hist.udp], [parseInt(data.tcp_conn) || 0, parseInt(data.udp_conn) || 0]);
                    updateMultiChartSync(charts.ping, [hist.ping_ct, hist.ping_cu, hist.ping_cm, hist.ping_bd], [parseInt(data.ping_ct) || 0, parseInt(data.ping_cu) || 0, parseInt(data.ping_cm) || 0, parseInt(data.ping_bd) || 0]);
                }
              } catch (e) {}
            }
            setInterval(fetchData, 3000); fetchData();
          </script>
          ${sys.custom_script || ''}
        </body>
        </html>`;
        return new Response(detailHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      }

      // ----------------------------------------
      // 大盘聚合首页 (包含卡片、表格、地图功能)
      // ----------------------------------------
      let { results } = await env.DB.prepare('SELECT * FROM servers').all();
      // 在首页、表格和地图中过滤掉隐藏节点
      results = results.filter(s => s.is_hidden !== 'true');

      const now = Date.now();

      let globalOnline = 0; let globalOffline = 0;
      let globalSpeedIn = 0; let globalSpeedOut = 0;
      let globalNetTx = 0; let globalNetRx = 0;
      const groups = {};
      const countryStats = {}; 

      const getColor = (ping) => { const p = parseInt(ping); if (p === 0 || isNaN(p)) return '#9ca3af'; if (p < 100) return '#10b981'; if (p < 200) return '#f59e0b'; return '#ef4444'; };

      if (results && results.length > 0) {
        for (const server of results) {
          const isOnline = (now - server.last_updated) < 30000;
          if (isOnline) {
            globalOnline++;
            globalSpeedIn += parseFloat(server.net_in_speed) || 0;
            globalSpeedOut += parseFloat(server.net_out_speed) || 0;
          } else {
            globalOffline++;
          }
          
          const rx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0);
          const tx_val = sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0);

          globalNetTx += tx_val;
          globalNetRx += rx_val;

          const grpName = server.server_group || '默认分组';
          if (!groups[grpName]) groups[grpName] = [];
          groups[grpName].push(server);

          let cCodeMap = (server.country || 'xx').toUpperCase();
          if (cCodeMap === 'TW') cCodeMap = 'CN';
          if (cCodeMap !== 'XX') {
              countryStats[cCodeMap] = (countryStats[cCodeMap] || 0) + 1;
          }
        }
      }

      let filterTagsHtml = `<span class="filter-tag active">全部 ${results.length}</span>`;
      for (const [code, count] of Object.entries(countryStats)) {
          filterTagsHtml += `<span class="filter-tag"><img src="https://flagcdn.com/16x12/${code.toLowerCase()}.png" alt="${code}"> ${code} ${count}</span>`;
      }

      let cardContentHtml = '';
      let tableBodyHtml = '';

      if (Object.keys(groups).length === 0) {
        cardContentHtml = '<p style="text-align:center; width: 100%; color:#888;">暂无公开服务器</p>';
      } else {
        for (const [grpName, grpServers] of Object.entries(groups)) {
          cardContentHtml += `<div class="group-header">${grpName}</div><div class="grid-container">`;
          
          for (const server of grpServers) {
            const isOnline = (now - server.last_updated) < 30000;
            const statusColor = isOnline ? '#10b981' : '#ef4444'; 
            
            const cpu = parseFloat(server.cpu || '0').toFixed(1); 
            const ram = parseFloat(server.ram || '0').toFixed(1); 
            const disk = parseFloat(server.disk || '0').toFixed(1);
            const netInSpeed = formatBytes(server.net_in_speed); 
            const netOutSpeed = formatBytes(server.net_out_speed);
            
            const cCode = (server.country || 'xx').toLowerCase();
            const flagHtml = cCode !== 'xx' ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" style="vertical-align: sub; margin-right: 5px; border-radius: 2px;">` : '🏳️';
            
            let metaHtml = '';
            if (sys.show_price === 'true') {
              metaHtml += `<div class="card-meta" style="margin-top:8px;">价格: ${server.price || '免费'}</div>`;
            }
            if (sys.show_expire === 'true') {
              let expireText = '永久';
              if (server.expire_date) {
                const expTime = new Date(server.expire_date).getTime();
                if (!isNaN(expTime)) {
                  const diff = expTime - now;
                  expireText = diff > 0 ? Math.ceil(diff / (1000 * 3600 * 24)) + ' 天' : '已过期';
                }
              }
              metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' ? 'margin-top:8px;' : ''}">剩余天数: ${expireText}</div>`;
            }

            // 流量统计
            const rx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_rx || 0) : parseFloat(server.net_rx || 0));
            const tx_val_str = formatBytes(sys.auto_reset_traffic === 'true' ? parseFloat(server.monthly_tx || 0) : parseFloat(server.net_tx || 0));
            metaHtml += `<div class="card-meta" style="${sys.show_price !== 'true' && sys.show_expire !== 'true' ? 'margin-top:8px;' : ''}">流量: <span style="color:#10b981">↓</span> ${rx_val_str} | <span style="color:#3b82f6">↑</span> ${tx_val_str}</div>`;
            
            // 在线时间与更新时间
            const diffSec = Math.round((now - server.last_updated) / 1000);
            let upTimeFormat = (server.uptime || '-').replace('days', '天').replace('day', '天');
            metaHtml += `<div class="card-meta" style="margin-top:2px;">在线: ${upTimeFormat} | 更新: ${diffSec}s前</div>`;

            let badgesHtml = '';
            if (sys.show_bw === 'true' && server.bandwidth) badgesHtml += `<span class="badge badge-bw">${server.bandwidth}</span>`;
            if (sys.show_tf === 'true' && server.traffic_limit) badgesHtml += `<span class="badge badge-tf">${server.traffic_limit}</span>`;
            if (server.ip_v4 === '1') badgesHtml += `<span class="badge badge-v4">IPv4</span>`;
            if (server.ip_v6 === '1') badgesHtml += `<span class="badge badge-v6">IPv6</span>`;

            const pingHtml = `<div class="ping-box"><span>电信 <span style="color:${getColor(server.ping_ct)}; font-weight:bold;">${server.ping_ct === '0' ? '超时' : server.ping_ct + 'ms'}</span></span><span>联通 <span style="color:${getColor(server.ping_cu)}; font-weight:bold;">${server.ping_cu === '0' ? '超时' : server.ping_cu + 'ms'}</span></span><span>移动 <span style="color:${getColor(server.ping_cm)}; font-weight:bold;">${server.ping_cm === '0' ? '超时' : server.ping_cm + 'ms'}</span></span><span>字节 <span style="color:${getColor(server.ping_bd)}; font-weight:bold;">${server.ping_bd === '0' ? '超时' : server.ping_bd + 'ms'}</span></span></div>`;

            // 处理容量的显示 (假设从 agent 获取的单位是 MB，需要乘上 1024*1024 再格式化)
            const ramUsedStr = formatBytes((parseFloat(server.ram_used || 0) * 1048576).toString());
            const ramTotalStr = formatBytes((parseFloat(server.ram_total || 0) * 1048576).toString());
            const diskUsedStr = formatBytes((parseFloat(server.disk_used || 0) * 1048576).toString());
            const diskTotalStr = formatBytes((parseFloat(server.disk_total || 0) * 1048576).toString());

            cardContentHtml += `
              <a href="/?id=${server.id}" class="vps-card">
                <div class="card-left">
                  <div class="card-title">
                    <div class="status-dot" style="background:${statusColor};"></div>
                    ${flagHtml} <span style="font-size:15px;" class="card-title-text">${server.name}</span>
                  </div>
                  ${metaHtml}
                  <div class="card-badges">${badgesHtml}</div>
                  ${pingHtml}
                </div>
                
                <div class="card-right">
                  <div class="stat-group">
                    <div class="stat-header"><span>CPU</span><span style="color: ${cpu > 80 ? '#ef4444' : 'inherit'};">${cpu}%</span></div>
                    <div class="stat-bar-full"><div style="width:${cpu}%; background: ${cpu > 80 ? '#ef4444' : '#3b82f6'};"></div></div>
                    <div class="stat-subtext" title="${server.cpu_info || '-'}">${server.cpu_info || '-'}</div>
                  </div>
                  
                  <div class="stat-group">
                    <div class="stat-header"><span>内存</span><span style="color: ${ram > 80 ? '#ef4444' : 'inherit'};">${ram}%</span></div>
                    <div class="stat-bar-full"><div style="width:${ram}%; background: ${ram > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${ramUsedStr} / ${ramTotalStr}</div>
                  </div>

                  <div class="stat-group">
                    <div class="stat-header"><span>存储</span><span style="color: ${disk > 80 ? '#ef4444' : 'inherit'};">${disk}%</span></div>
                    <div class="stat-bar-full"><div style="width:${disk}%; background: ${disk > 80 ? '#ef4444' : '#10b981'};"></div></div>
                    <div class="stat-subtext">${diskUsedStr} / ${diskTotalStr}</div>
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 2px;">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 5px;" title="${server.os || '-'} | ${server.arch || '-'} | ${server.virt || '-'}">${server.os || '-'} | ${server.arch || '-'} | ${server.virt || '-'}</div>
                    <div style="white-space: nowrap; flex-shrink: 0;">TCP/UDP: ${server.tcp_conn || '0'} / ${server.udp_conn || '0'}</div>
                  </div>
                  
                  <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 4px; white-space: nowrap; gap: 8px;">
                    <div style="overflow: hidden; text-overflow: ellipsis;"><span style="color:#10b981">↓</span> ${netInSpeed}/s</div>
                    <div style="overflow: hidden; text-overflow: ellipsis;"><span style="color:#3b82f6">↑</span> ${netOutSpeed}/s</div>
                  </div>
                </div>
              </a>
            `;

            tableBodyHtml += `
              <tr onclick="window.location.href='/?id=${server.id}'" style="cursor:pointer;">
                <td style="text-align:center;"><div class="status-dot" style="background:${statusColor}; display:inline-block; margin:0;"></div></td>
                <td><b>${server.name}</b></td>
                <td>${flagHtml}</td>
                <td><span class="os-text">${server.os || '-'} / ${server.arch || '-'} / ${server.virt || '-'}</span></td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${cpu}%; background:#3b82f6;"></div></div>
                    <span>${cpu}%</span>
                  </div>
                </td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${ram}%; background:#10b981;"></div></div>
                    <span>${ram}%</span>
                  </div>
                </td>
                <td style="min-width:100px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="stat-bar" style="width:50px; margin:0;"><div style="width:${disk}%; background:#10b981;"></div></div>
                    <span>${disk}%</span>
                  </div>
                </td>
                <td style="color:#64748b; font-size:12px; white-space: nowrap;">${rx_val_str} | ${tx_val_str}</td>
                <td style="white-space: nowrap;">${netInSpeed}/s</td>
                <td style="white-space: nowrap;">${netOutSpeed}/s</td>
                <td style="color:#64748b; font-size:12px; white-space: nowrap;">${Math.round((now - server.last_updated)/1000)} 秒前</td>
              </tr>
            `;
          }
          cardContentHtml += `</div>`;
        }
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
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f5f7; color: #333; margin: 0; padding: 20px; }
          .container { max-width: 1200px; margin: 0 auto; }
          .global-stats { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-around; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); margin-bottom: 30px; text-align: center; }
          .g-item { flex: 1; min-width: 200px; }
          .g-val { font-size: 24px; font-weight: bold; color: #111; margin: 8px 0; white-space: nowrap; }
          .g-label { font-size: 13px; color: #666; white-space: nowrap; }
          .g-sub { font-size: 12px; color: #999; white-space: nowrap; }
          .group-header { font-size: 18px; font-weight: 600; color: #444; margin: 25px 0 15px 5px; border-left: 4px solid #3b82f6; padding-left: 10px; }
          .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 15px; }
          
          .vps-card { display: flex; justify-content: space-between; align-items: stretch; background: white; padding: 18px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-decoration: none; color: inherit; border: 1px solid transparent; transition: all 0.2s ease; }
          .vps-card:hover { border-color: #e5e7eb; transform: translateY(-2px); box-shadow: 0 8px 15px rgba(0,0,0,0.08); }
          .card-left { flex: 0 0 180px; display: flex; flex-direction: column; justify-content: center; }
          .card-title { display: flex; align-items: center; margin-bottom: 4px; }
          .card-title-text { font-weight: 600; }
          .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; flex-shrink:0; }
          .card-meta { font-size: 12px; color: #6b7280; margin-bottom: 3px; }
          .card-badges { margin-top: 10px; display: flex; gap: 5px; flex-wrap: wrap; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; color: white; }
          .badge-bw { background: #3b82f6; } .badge-tf { background: #10b981; } .badge-v4 { background: #a855f7; } .badge-v6 { background: #ec4899; }
          
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .admin-btn { padding: 8px 16px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight:bold; }
          @media (max-width: 800px) { .grid-container { grid-template-columns: 1fr; } .vps-card { flex-direction: column; } .card-right { padding-left: 0; border-left: none; border-top: 1px solid #f0f0f0; margin-top: 15px; padding-top: 15px; } .header { flex-direction: column; align-items: flex-start; gap: 15px;} .header-right { width:100%; justify-content: space-between;} }
          
          ${themeStyles}
        </style>
      </head>
      <body class="${sys.theme || 'theme1'}">
        <div class="container" id="app-container">
          
          <div class="header" style="flex-wrap: wrap; gap: 15px;">
            <h1 style="margin:0;">${sys.site_title}</h1>
            
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
              <div class="view-controls">
                <button class="toggle-btn active" id="btn-card" onclick="switchView('card')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> 卡片
                </button>
                <button class="toggle-btn" id="btn-table" onclick="switchView('table')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg> 表格
                </button>
                <button class="toggle-btn" id="btn-map" onclick="switchView('map')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg> 地图
                </button>
              </div>
              <a href="/admin" class="admin-btn">${sys.admin_title}</a>
            </div>
          </div>

          <div class="filter-bar" id="ajax-filters">
            ${filterTagsHtml}
          </div>

          <div class="global-stats" id="ajax-stats">
            <div class="g-item"><div class="g-label">服务器总数</div><div class="g-val">${results.length}</div><div class="g-sub">在线 <span style="color:#10b981">${globalOnline}</span> | 离线 <span style="color:#ef4444">${globalOffline}</span></div></div>
            <div class="g-item"><div class="g-label">总计流量 (入 | 出) ${sys.auto_reset_traffic === 'true' ? '<span style="font-size:10px; color:#c2410c;">(本月)</span>' : ''}</div><div class="g-val">${formatBytes(globalNetRx)} | ${formatBytes(globalNetTx)}</div></div>
            <div class="g-item"><div class="g-label">实时网速 (入 | 出)</div><div class="g-val"><span style="color:#10b981">↓</span> ${formatBytes(globalSpeedIn)}/s | <span style="color:#3b82f6">↑</span> ${formatBytes(globalSpeedOut)}/s</div></div>
          </div>

          <div id="view-card" class="view-panel active">
             <div id="ajax-cards">${cardContentHtml}</div>
          </div>

          <div id="view-table" class="view-panel">
            <div class="table-responsive">
              <table class="custom-table">
                <thead>
                  <tr><th>状态</th><th>节点名称</th><th>地区</th><th>系统/架构/虚拟化</th><th>CPU</th><th>内存</th><th>磁盘</th><th>流量(入|出)</th><th>下行</th><th>上行</th><th>更新</th></tr>
                </thead>
                <tbody id="ajax-table">
                  ${tableBodyHtml || '<tr><td colspan="11" style="text-align:center;">暂无数据</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div id="view-map" class="view-panel">
            <div id="map-container"></div>
          </div>
          
          ${getFooterHtml(sys)}
        </div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
        
        <script>
          let mapInitialized = false;

          function switchView(viewName) {
            document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('btn-' + viewName).classList.add('active');
            
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById('view-' + viewName).classList.add('active');
            
            localStorage.setItem('monitor_preferred_view', viewName);

            if (viewName === 'map') {
              if (!mapInitialized) {
                initMap();
                mapInitialized = true;
              } else {
                window.myMap.invalidateSize(); 
              }
            }
          }

          let markersLayer;
          let geoJsonLayer;
          let worldGeoJson = null;
          let currentMapDataStr = "";

          const countryCoords = {
            'US': [37.09, -95.71], 'CN': [35.86, 104.19], 'JP': [36.20, 138.25], 'HK': [22.31, 114.16],
            'SG': [1.35, 103.81], 'KR': [35.90, 127.76], 'DE': [51.16, 10.45], 'GB': [55.37, -3.43],
            'NL': [52.13, 5.29], 'FR': [46.22, 2.21], 'CA': [56.13, -106.34], 'AU': [-25.27, 133.77],
            'IN': [20.59, 78.96], 'BR': [-14.23, -51.92], 'RU': [61.52, 105.31], 'ZA': [-30.55, 22.93],
            'TW': [23.69, 120.96], 'IT': [41.87, 12.56], 'SE': [60.12, 18.64], 'CH': [46.81, 8.22],
            'ES': [40.46, -3.74], 'PL': [51.91, 19.14], 'FI': [61.92, 25.74], 'NO': [60.47, 8.46],
            'DK': [56.26, 9.50], 'IE': [53.14, -7.69], 'AT': [47.51, 14.55], 'TR': [38.96, 35.24],
            'AE': [23.42, 53.84], 'MY': [4.21, 101.97], 'TH': [15.87, 100.99], 'VN': [14.05, 108.27],
            'PH': [12.87, 121.77], 'ID': [-0.78, 113.92]
          };

          const iso2To3 = {
            "US":"USA","CN":"CHN","JP":"JPN","HK":"HKG","SG":"SGP","KR":"KOR","DE":"DEU","GB":"GBR",
            "NL":"NLD","FR":"FRA","CA":"CAN","AU":"AUS","IN":"IND","BR":"BRA","RU":"RUS","ZA":"ZAF",
            "TW":"TWN","IT":"ITA","SE":"SWE","CH":"CHE","ES":"ESP","PL":"POL","FI":"FIN","NO":"NOR",
            "DK":"DNK","IE":"IRL","AT":"AUT","TR":"TUR","AE":"ARE","MY":"MYS","TH":"THA","VN":"VNM",
            "PH":"PHL","ID":"IDN"
          };

          async function initMap() {
            window.myMap = L.map('map-container', {
                zoomControl: true,
                attributionControl: false,
                minZoom: 1
            }).setView([30, 10], 2);

            try {
                const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
                worldGeoJson = await res.json();
                drawMarkers();
            } catch (e) {
                console.error("Map load failed", e);
            }
          }

          function drawMarkers() {
            if(!window.myMap || !worldGeoJson) return;

            const newDataStr = document.getElementById('map-data').textContent;
            if (currentMapDataStr === newDataStr) return;
            currentMapDataStr = newDataStr;

            if(geoJsonLayer) window.myMap.removeLayer(geoJsonLayer);
            if(markersLayer) markersLayer.clearLayers();
            else markersLayer = L.layerGroup().addTo(window.myMap);

            const data = JSON.parse(newDataStr);
            const isDark = document.body.className.includes('theme2') || document.body.className.includes('theme5');

            const activeIso3 = {};
            for (const code in data) {
                if (iso2To3[code]) activeIso3[iso2To3[code]] = true;
            }

            geoJsonLayer = L.geoJSON(worldGeoJson, {
                style: function(feature) {
                    const isActive = activeIso3[feature.id];
                    return {
                        fillColor: isActive ? '#10b981' : (isDark ? '#2a303c' : '#d5dce2'),
                        weight: 1,
                        opacity: 1,
                        color: isDark ? '#1a202c' : '#ffffff',
                        fillOpacity: 1
                    };
                }
            }).addTo(window.myMap);

            for (const [code, count] of Object.entries(data)) {
              if(countryCoords[code]) {
                const icon = L.divIcon({ className: 'custom-map-badge', html: \`<div>\${count}</div>\`, iconSize: [22,22] });
                L.marker(countryCoords[code], {icon: icon}).addTo(markersLayer);
              }
            }
          }

          document.addEventListener('DOMContentLoaded', () => {
             const savedView = localStorage.getItem('monitor_preferred_view') || 'card';
             switchView(savedView);
          });

          // 【新增修改】：为了防止 AJAX 自动刷新导致后端访问量虚高，每次自动刷新强制带上 ?ajax=1 标记
          setInterval(async () => {
            try {
              const currentUrl = new URL(location.href);
              currentUrl.searchParams.set('ajax', '1');
              const res = await fetch(currentUrl.toString());
              const htmlText = await res.text();
              const parser = new DOMParser();
              const newDoc = parser.parseFromString(htmlText, 'text/html');
              
              document.getElementById('ajax-stats').innerHTML = newDoc.getElementById('ajax-stats').innerHTML;
              document.getElementById('ajax-cards').innerHTML = newDoc.getElementById('ajax-cards').innerHTML;
              document.getElementById('ajax-table').innerHTML = newDoc.getElementById('ajax-table').innerHTML;
              document.getElementById('ajax-filters').innerHTML = newDoc.getElementById('ajax-filters').innerHTML;
              
              document.getElementById('map-data').textContent = newDoc.getElementById('map-data').textContent;
              drawMarkers();
            } catch (e) {
              console.log('Ajax Refresh Failed', e);
            }
          }, 4000);
        </script>
        
        ${sys.custom_script || ''}
      </body>
      </html>`;

      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    return new Response('Not Found', { status: 404 });
  }
};
