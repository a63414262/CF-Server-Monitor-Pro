太棒了！我们一步步把这个探针从一个简单的脚本，打造成了一个拥有图表、分组、自定义徽章和隐私控制的**商业级 Serverless 探针**。这个项目绝对值得在 GitHub 上拥有一个极具专业感的 `README.md`！

为了让别人（或者以后的你自己）能看懂并快速部署，我帮你把所有的核心特性、架构原理以及完整的安装步骤都整理出来了。我还为你加上了刚才你发给我的那些功能亮点的截图占位符。

你可以直接复制下面的代码，粘贴到你 GitHub 仓库的 `README.md` 文件里：

***

```markdown
# ⚡ CF-Server-Monitor-Pro (Serverless 探针增强版)

基于 Cloudflare Workers 和 D1 数据库构建的轻量级、零成本、高定制化的服务器探针大盘。
完美复刻了商业级探针（如 Nezha）的核心体验，但无需额外部署任何服务端 VPS！完全白嫖 Cloudflare 的免费 Serverless 资源。

## ✨ 核心特性

- **🆓 零成本服务端**：利用 Cloudflare Workers + D1 数据库，无需购买额外的服务器来运行探针面板。
- **📊 极简前台大盘**：直观的 Grid 布局卡片，全局统计总流量、实时网速、在线/离线节点数。
- **📈 实时详情图表**：点击单台服务器卡片，即可查看基于 Chart.js 的 CPU、内存、磁盘、进程数、TCP/UDP 连接数及网速的实时跳动折线图。
- **🌍 智能地理位置**：依托 Cloudflare 强大的节点网络，自动识别被控端 VPS 的真实地理位置，并显示高清国旗（内置特殊地区的合规展示）。
- **🏷️ 商业级自定义**：支持按地区或用途**分组**；支持自定义展示 VPS 的**价格、到期时间、带宽上限、流量配额**。
- **🛡️ 隐私保护模式**：支持一键切换“公开模式”与“私密模式”。私密模式下，需输入后台密码方可查看大盘。
- **🚀 极简一键安装**：后台自动生成被控端 Bash 一键安装命令。支持 IPv4/IPv6 双栈检测、底层 CPU 时钟精准计算、自动注册 systemd 守护进程守护。

---

---

## 🛠️ 部署指南

### 第一步：创建 Cloudflare D1 数据库
1. 登录 Cloudflare 控制台，进入 **Workers & Pages** -> **D1 SQL Database**。
2. 创建一个名为 `probe-db` 的数据库。
3. 进入该数据库的 **Console (控制台)**，执行以下 SQL 语句来初始化表结构：

```sql
-- 创建服务器节点表
CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT,
    cpu TEXT, ram TEXT, disk TEXT, load_avg TEXT, uptime TEXT, last_updated INTEGER,
    ram_total TEXT, net_rx TEXT, net_tx TEXT, net_in_speed TEXT, net_out_speed TEXT,
    os TEXT, cpu_info TEXT, arch TEXT, boot_time TEXT, ram_used TEXT, swap_total TEXT, 
    swap_used TEXT, disk_total TEXT, disk_used TEXT, processes TEXT, tcp_conn TEXT, udp_conn TEXT, 
    country TEXT, ip_v4 TEXT, ip_v6 TEXT,
    server_group TEXT DEFAULT '默认分组', price TEXT DEFAULT '', expire_date TEXT DEFAULT '', 
    bandwidth TEXT DEFAULT '', traffic_limit TEXT DEFAULT ''
);

-- 创建全局设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### 第二步：创建并配置 Cloudflare Worker
1. 在 **Workers & Pages** 中创建一个新的 Worker。
2. 进入该 Worker 的 **Settings (设置)** -> **Variables (变量与机密)**：
   - **绑定 D1 数据库**：变量名填 `DB`，选择你刚才创建的 `probe-db`。
   - **设置后台密码**：添加环境变量 `API_SECRET`，值为你自定义的管理后台登录密码（类型选择“文本”或“机密”均可）。

### 第三步：部署代码
1. 返回 Worker 的代码编辑页面（Edit Code）。
2. 将本项目中的 `worker.js` 代码全部复制并覆盖进去。
3. 点击 **Deploy (部署)**。

---

## 💻 使用说明

1. **访问后台**：在浏览器访问 `https://你的Worker域名/admin`。
2. **登录认证**：弹出的身份验证中，用户名为 `admin`，密码为你设置的 `API_SECRET` 的值。
3. **添加节点**：在后台输入节点名称并添加，你可以点击“✏️ 编辑”来设置分组、价格、到期日等高阶信息。
4. **安装探针**：点击绿色按钮“复制命令”，登录你的被控端 VPS 终端，粘贴并回车执行。
5. **定制面板**：在后台最上方的“🛠️ 全局设置”中，你可以修改网站标题，并自由开关首页的各种元素显示。

---

## ⚙️ 探针卸载 (Agent)

如果需要从被控端 VPS 卸载探针服务，请在 VPS 终端执行以下命令：
```bash
systemctl stop cf-probe.service
systemctl disable cf-probe.service
rm /etc/systemd/system/cf-probe.service
rm /usr/local/bin/cf-probe.sh
systemctl daemon-reload
```

## 📄 License
MIT License
