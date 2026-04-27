# ⚡ CF-Server-Monitor-Pro (Serverless 探针增强版)

基于 Cloudflare Workers 和 D1 数据库构建的轻量级、零成本、高定制化的服务器探针大盘。
完美复刻了商业级探针（如 Nezha）的核心体验，但无需额外部署任何服务端 VPS！完全白嫖 Cloudflare 的免费 Serverless 资源。

## ✨ 核心特性

### 🎨 极致的视觉与个性化体验
- **5 大精美主题一键切换**：内置默认清爽白、暗黑极客、新粗野主义、动态毛玻璃、赛博朋克 5 种完全不同的 UI 风格。
- **自定义背景图与全透明模式**：支持在后台直接上传本地图片（自动转为 Base64）或填写图片 URL。开启背景图后，所有卡片自动化身为绝美的“半透明毛玻璃”质感。
- **国旗智能匹配**：依托 Cloudflare 全球网络，自动识别 VPS 归属地并渲染超清图片国旗。

### 📊 专业级监控与大盘展示
- **全局顶栏大盘**：直观展示服务器总数、在线/离线数、总计流量（入/出）以及全网实时网速。
- **硬核双栈检测**：自动探测并高亮打标 VPS 的 **IPv4** 与 **IPv6** 网络连通性。
- **商业级自定义徽章**：支持为每台机器单独设置**价格、到期时间（自动计算剩余天数）、带宽上限、流量配额**，并在前台以彩色徽章展示。
- **精细化分组**：支持在后台为服务器设置组别，前台大盘将自动按分组进行优雅排版。
- **实时详情图表**：点击任意节点卡片，即可查看基于 Chart.js 的 CPU、内存、磁盘、进程数、TCP/UDP 连接数及双向网速的实时跳动折线图以及三网延迟监控（来自https://zstaticcdn.com/nodes ）。

### 🛡️ 隐私与安全控制
- **一键私密模式**：吃灰神机不想公开？在后台取消勾选“公开访问”，前台访客必须输入 admin 及密钥方可查看你的专属大盘。
- **模块化展示开关**：价格、到期时间、带宽、流量等敏感信息，可在后台一键控制是否在前台显示。

### 🚀 极简部署与高精度采集
- **底层精准算法**：抛弃传统不稳定的 `top` 命令，采用 Linux 内核级 `/proc/stat` 计算 CPU 时钟差值，数据跳动精准顺滑。
- **傻瓜式一键安装**：后台自动生成被控端 Bash 一键安装命令，自动注册 Systemd 守护进程。

---
## 📸 界面预览

### 1. 前台多节点大盘与全局统计
<img width="3994" height="1830" alt="image" src="https://github.com/user-attachments/assets/e993f66e-7d3f-4481-ab02-e37edb63a7a1" />


### 2. 单节点实时性能折线图
<img width="3989" height="1830" alt="image" src="https://github.com/user-attachments/assets/7eebc87c-a5aa-4620-a182-f4200fdaebca" />


### 3. 后台管理与全局设置
<img width="3984" height="1830" alt="image" src="https://github.com/user-attachments/assets/cd14d981-6ace-4d0c-97e8-534a177306ea" />


---

## 🛠️ 部署指南

### 第一步：创建 Cloudflare D1 数据库
1. 登录 Cloudflare 控制台，进入 **Workers & Pages** -> **D1 SQL Database**。
2. 创建一个名为 `probe-db` 的数据库。
3. 进入该数据库的 **Console (控制台)**，执行以下四个 SQL 语句来初始化表结构：


第一个-- 创建服务器节点表

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

第二个-- 创建全局设置表

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

第三创建三网延迟的字段

ALTER TABLE servers ADD COLUMN ping_ct TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN ping_cu TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN ping_cm TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN ping_bd TEXT DEFAULT '0';

第四增加用于月度统计的持久化字段

ALTER TABLE servers ADD COLUMN monthly_rx TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN monthly_tx TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN last_rx TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN last_tx TEXT DEFAULT '0';
ALTER TABLE servers ADD COLUMN reset_month TEXT DEFAULT '';

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

  https://imgapi.cn/api.php?fl=dongman&=4k   api接口可实现背景图片自动轮换   
  

##如何使用电报机器人通知：

    获取 Token：在 Telegram 找 @BotFather 创建机器人并拿到 Token。

    获取 Chat ID：在 Telegram 找 @userinfobot 发条消息，获取你的 ID。

    配置：

        登录你的探针后台 /admin。

        在 Telegram 离线告警设置 区域，填入 Token 和 Chat ID。

        将“开启通知”设为 启用告警。

        点击 保存全局设置。

    测试：如果你关掉一台 VPS 的 Agent，大约 2-3 分钟内，你的 Telegram 就会收到该节点的离线报警信息。当 Agent 重新启动，也会收到恢复通知。

注意事项：

    离线判断标准：代码中设定为 120 秒 未收到上报即发送告警。

    静默处理：告警状态存储在数据库中，节点掉线只会发一次通知，直到它重新上线后再次掉线才会触发新告警。
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
