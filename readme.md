## 🤝 参与贡献 (Contributing)

如果你喜欢这个项目，欢迎提交 Pull Request，或者给个 ⭐ **Star** 支持一下！

# ⚡ CF-Server-Monitor-Pro (Serverless 探针增强版)

10台VPS以下可以使用cf版本轻量部署，10台VPS以上建议使用docker部署在免费容器northflank https://github.com/a63414262/server-monitor

演示站点：https://tanzhen.kejikkk.com
alpine测试版本，已支持alpine系统挂载探针

基于 Cloudflare Workers 和 D1 数据库构建的轻量级、零成本、高定制化的服务器探针大盘。
完美复刻了商业级探针（如 Nezha）的核心体验，但无需额外部署任何服务端 VPS！完全白嫖 Cloudflare 的免费 Serverless 资源。

## ✨ 核心特性

### 🎨 极致的视觉与个性化体验
- **5 大精美主题一键切换**：内置默认清爽白、暗黑极客、新粗野主义、动态毛玻璃、赛博朋克 5 种完全不同的 UI 风格。
- **自定义背景图与全透明模式**：支持在后台直接上传本地图片（自动转为 Base64）或填写图片 URL。开启背景图后，所有卡片自动化身为绝美的“半透明毛玻璃”质感。
- **国旗智能匹配**：依托 Cloudflare 全球网络，自动识别 VPS 归属地并渲染超清图片国旗。
- **无感 AJAX 热更新**：彻底抛弃传统的 <meta refresh>，采用 DOM 局部替换技术，数据实时跳动，页面零闪烁。
- **多维视图切换**：内置 卡片 (Card)、表格 (Table) 和 世界地图 (Map) 三种视图，使用 LocalStorage 自动记忆用户偏好。
- **自定义主题** 🧑‍💻 自定义 CSS 代码  🧑‍💻 自定义 <head> 注入 (引入字体/外部CSS等)  🧑‍💻 自定义底部 Script 注入 (可执行任意 JS, 接管页面渲染)
### 📊 专业级监控与大盘展示
- **全局顶栏大盘**：直观展示服务器总数、在线/离线数、总计流量（入/出）以及全网实时网速。
- **硬核双栈检测**：自动探测并高亮打标 VPS 的 **IPv4** 与 **IPv6** 网络连通性。
- **商业级自定义徽章**：支持为每台机器单独设置**价格、到期时间（自动计算剩余天数）、带宽上限、流量配额**，并在前台以彩色徽章展示。
- **精细化分组**：支持在后台为服务器设置组别，前台大盘将自动按分组进行优雅排版。
- **过去24至实时详情图表**：点击任意节点卡片，即可查看基于 Chart.js 的 CPU、内存、磁盘、进程数、TCP/UDP 连接数及双向网速的过去24至实时跳动折线图以及三网延迟监控（来自https://zstaticcdn.com/nodes ）。
- **月度流量重置**：内置流量增量累加机制，支持开启每月 1 号自动重置统计，无惧被控端 VPS 重启导致的数据清零。

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
<img width="3971" height="1759" alt="image" src="https://github.com/user-attachments/assets/46567b0a-acf0-426e-b68a-58402aeff955" />
<img width="3971" height="1759" alt="image" src="https://github.com/user-attachments/assets/668b1dec-f9bf-4b4b-b703-d1398671ed10" />


### 3. 后台管理与全局设置
<img width="3971" height="1759" alt="image" src="https://github.com/user-attachments/assets/f481c42c-215f-42a4-9183-dc7250628842" />


---

## 🚀 部署指南 (Deployment)
第一步：配置 Cloudflare 环境

    登录 Cloudflare 控制台，进入 Workers & Pages。

    创建一个全新的 D1 数据库，命名为 probe-db

    创建一个新的 Worker 服务。

第二步：配置 Worker

    将本项目中的 worker.js 代码全部复制并覆盖到你的 Worker 代码编辑器中。

    在 Worker 的 设置 (Settings) -> 变量 (Variables) 中，绑定你刚才创建的 D1 数据库，变量名称必须为 DB。

    在环境变量中添加一个密码变量，用于后台登录：

        变量名：API_SECRET

        值：设置你的高强度密码

第三步：访问与初始化

部署完成后，访问你的 Worker 域名。

    管理后台路径：https://你的域名.workers.dev/admin

    账号：admin

    密码：你设置的 API_SECRET 的值
    (注意：首次访问会自动初始化 D1 数据表，无需手动建表)

💻 客户端探针安装 (Client Agent)

进入管理后台后，点击 "+ 添加新服务器"。添加完成后，列表中会生成专属的一键安装命令。

直接复制该命令，在你的目标 VPS 上（需 Root 权限）运行即可：
Bash

curl -sL [https://你的域名.workers.dev/install.sh](https://你的域名.workers.dev/install.sh) | bash -s <SERVER_ID> <API_SECRET>

探针脚本会自动注册为 systemd 服务 (cf-probe.service)，并在后台静默运行，每 5 秒上报一次数据。

🛠️ 高级自定义 (Advanced Injection)

本项目为喜欢折腾的开发者预留了最高权限的魔改入口。进入后台 全局设置 -> 前端主题风格 -> 选择“6. 完全自定义 CSS”：

    自定义 CSS：重写面板的所有样式，支持背景、卡片透明度、字体颜色等。

    <head> 注入：你可以引入外部的 Google Fonts、TailwindCSS CDN 等。

    Script 注入：编写原生 JavaScript 接管页面逻辑，比如增加动态粒子背景、甚至通过设置 body { display: none; } 隐藏原生页面，利用 AJAX 请求 /api/server?id=xxx 用你自己的前端框架重绘大盘。

### 👑 【高级玩法揭秘】如何利用注入层彻底重构你的探针？

既然你是能手搓量化框架和写各种环境脚手架的硬核选手，这些开放的注入区域就像给你提供了一个“跳板”。以下是三种高阶用法：

#### 玩法 1：极简换肤（引入大厂 CSS 变量库）

你可以在自定义 `<head>` 里注入 Bootstrap 或者你喜欢的 Google Fonts：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fira+Code&display=swap" rel="stylesheet">
<style>
  /* 覆盖默认的字体库 */
  body { font-family: 'Fira Code', monospace !important; }
</style>
```

#### 玩法 2：DOM 节点改造（通过 JS 拦截与重写）

不满意当前的 HTML 排版？直接在 **自定义底部 Script** 里面用原生 JS 或动态引入 jQuery，将页面按你的喜好重新拼装：

```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script>
  $(document).ready(function() {
    // 比如：在所有的卡片右上角加一个炫酷的动态时钟
    $('.card-title').append('<span class="my-clock" style="margin-left:auto; color:red;"></span>');
    setInterval(() => { $('.my-clock').text(new Date().toLocaleTimeString()); }, 1000);
  });
</script>
```

#### 玩法 3：最高权限：纯无头模式 (Headless Framework)

这是最强大的用法。在后台的主题里写入一句 CSS 将官方容器干掉：

```css
body.theme6 #app-container { display: none !important; }
```

然后，在 **自定义底部 Script** 里，引入 React/Vue 的 CDN，直接使用 `fetch('/api/server?id=xxx')`（或者你甚至可以通过 `SELECT * FROM servers` 的类似接口查出你的全量数据结构），在空白的 `<body>` 里用自己的组件库（例如 Ant Design、Element Plus）从零渲染一个 100% 独一无二的大盘监控。这样你的 Worker 就纯粹变成了一个后端的数据 API 中转站，而前端你可以随心所欲去开发。



### ✨ 自定义二次元透明主题 CSS 演示

将以下代码填入后台的 **「自定义 CSS 代码」** 输入框中，即可实现超清动漫壁纸与全站半透明毛玻璃卡片效果：
```css
/* 1. 网页全局二次元背景图 (换了一个保证能访问的超清动漫壁纸) */
body.theme6 {
  background: url('https://imgapi.cn/api.php?fl=dongman&=4k') no-repeat center center fixed !important;
  background-size: cover !important;
  font-family: Arial, Helvetica, sans-serif;
}

/* 2. 卡片半透明效果 */
.theme6 .vps-card, 
.theme6 .global-stats, 
.theme6 .custom-table, 
.theme6 .header,
.theme6 .view-controls {
  background-color: rgba(250, 250, 250, 0.65) !important; 
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border-radius: 0.6rem !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05) !important;
}

/* 3. 悬停卡片时的浮动反馈 */
.theme6 .vps-card:hover {
  background-color: rgba(255, 255, 255, 0.85) !important;
}

/* 4. 进度条颜色统一改为经典的 Nezha 绿色 (#21ba45) */
.theme6 .stat-bar > div {
  background-color: #21ba45 !important;
}

/* 5. 调整文字和图标颜色适配浅色半透明背景 */
.theme6 .stat-label, .theme6 .g-label, .theme6 .card-meta { color: #555 !important; }
.theme6 .stat-val, .theme6 .g-val, .theme6 .card-title-text { color: #000 !important; }
.theme6 .group-header { color: #fff !important; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
```

### ✨ 炫酷动态特效注入 (0 依赖纯原生)

如果你喜欢二次元或更加生动的展示界面，可以将以下代码完全复制，并粘贴到管理后台的 **「自定义底部 Script 注入」** 输入框中。

这段脚本包含了三种精美的特效，**全部由纯原生 JavaScript 和 Canvas 物理引擎手搓而成，不依赖 jQuery，不需要加载任何外部图片或库，极速渲染且永久有效！**

*   🌸 **樱花飘落**：使用纯数学贝塞尔曲线动态绘制花瓣。
*   ✨ **星光拖尾**：随鼠标移动生成的炫彩粒子跟随拖尾。
*   ❤️ **爱心浮动**：鼠标点击页面任意位置，生成随机颜色的爱心并上浮。
*   ❤️ **背景音乐播放**：网页打开自动单曲循环设置的背景音乐。
```html
<audio id="bgm" autoplay loop preload="auto" style="display:none;">
    <source src="https://music.163.com/song/media/outer/url?id=2126773572.mp3" type="audio/mpeg">
</audio>

<script>
// 1. 强制自动播放逻辑 (监听用户交互触发)
window.addEventListener('click', () => {
    const audio = document.getElementById('bgm');
    if (audio.paused) {
        audio.play().catch(e => console.log("等待用户交互开始播放"));
    }
}, { once: true });

// 2. 🌸 纯原生 Canvas 樱花飘落特效
!function(){
  var canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:9999997";
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d"), w = window.innerWidth, h = window.innerHeight;
  canvas.width = w; canvas.height = h;
  window.addEventListener("resize", function(){ w=window.innerWidth; h=window.innerHeight; canvas.width=w; canvas.height=h; });
  var petals = [];
  for(var i=0; i<40; i++) petals.push({ x: Math.random()*w, y: Math.random()*h, vx: Math.random()*0.5+0.5, vy: Math.random()*1+1, angle: Math.random()*Math.PI*2, spin: Math.random()*0.05-0.025, size: Math.random()*4+5 });
  function render(){
    ctx.clearRect(0,0,w,h);
    for(var i=0; i<petals.length; i++){
      var p = petals[i];
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      ctx.beginPath(); ctx.moveTo(0, -p.size);
      ctx.bezierCurveTo(p.size, -p.size, p.size, p.size, 0, p.size);
      ctx.bezierCurveTo(-p.size, p.size, -p.size, -p.size, 0, -p.size);
      ctx.fillStyle = "rgba(255, 183, 197, 0.7)"; ctx.fill(); ctx.restore();
      p.x += p.vx; p.y += p.vy; p.angle += p.spin;
      if(p.y > h || p.x > w) { p.y = -20; p.x = Math.random()*w; }
    }
    requestAnimationFrame(render);
  }
  render();
}();

// 3. ✨ 纯原生 Canvas 鼠标烟花/星光拖尾特效
!function(){
  var canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;z-index:9999998";
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d"), w = window.innerWidth, h = window.innerHeight;
  canvas.width = w; canvas.height = h;
  window.addEventListener("resize", function(){ w=window.innerWidth; h=window.innerHeight; canvas.width=w; canvas.height=h; });
  var particles = [], mouse = {x: -100, y: -100};
  window.addEventListener("mousemove", function(e){ 
    mouse.x=e.clientX; mouse.y=e.clientY; 
    particles.push({x:mouse.x, y:mouse.y, vx:Math.random()*2-1, vy:Math.random()*2-1, size:Math.random()*3+1.5, color:"hsl("+(Math.random()*360)+", 100%, 75%)"}); 
  });
  function render(){
    ctx.clearRect(0,0,w,h);
    for(var i=0; i<particles.length; i++){
      var p = particles[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fillStyle=p.color; ctx.fill();
      p.x += p.vx; p.y += p.vy; p.size *= 0.92;
    }
    particles = particles.filter(function(p){ return p.size > 0.5; });
    requestAnimationFrame(render);
  }
  render();
}();

// 4. ❤️ 纯原生 DOM 鼠标点击爱心上浮特效
!function(e,t,a){function n(){c(".heart{width: 10px;height: 10px;position: fixed;background: #f00;transform: rotate(45deg);-webkit-transform: rotate(45deg);-moz-transform: rotate(45deg);}.heart:after,.heart:before{content: '';width: inherit;height: inherit;background: inherit;border-radius: 50%;-webkit-border-radius: 50%;-moz-border-radius: 50%;position: fixed;}.heart:after{top: -5px;}.heart:before{left: -5px;}"),o(),r()}function r(){for(var e=0;e<d.length;e++)d[e].alpha<=0?(t.body.removeChild(d[e].el),d.splice(e,1)):(d[e].y--,d[e].scale+=.004,d[e].alpha-=.013,d[e].el.style.cssText="left:"+d[e].x+"px;top:"+d[e].y+"px;opacity:"+d[e].alpha+";transform:scale("+d[e].scale+","+d[e].scale+") rotate(45deg);background:"+d[e].color+";z-index:9999999");requestAnimationFrame(r)}function o(){var t="function"==typeof e.onclick&&e.onclick;e.onclick=function(e){t&&t(),i(e)}}function i(e){var a=t.createElement("div");a.className="heart",d.push({el:a,x:e.clientX-5,y:e.clientY-5,scale:1,alpha:1,color:s()}),t.body.appendChild(a)}function c(e){var a=t.createElement("style");a.type="text/css";try{a.appendChild(t.createTextNode(e))}catch(t){a.styleSheet.cssText=e}t.getElementsByTagName("head")[0].appendChild(a)}function s(){return"rgb("+~~(255*Math.random())+","+~~(255*Math.random())+","+~~(255*Math.random())+")"}var d=[];e.requestAnimationFrame=function(){return e.requestAnimationFrame||e.webkitRequestAnimationFrame||e.mozRequestAnimationFrame||e.oRequestAnimationFrame||e.msRequestAnimationFrame||function(e){setTimeout(e,1e3/60)}}(),n()}(window,document);
</script>
```

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
