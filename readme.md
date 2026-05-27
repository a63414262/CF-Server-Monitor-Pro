## 📸 界面预览

演示站点：https://tanzhen.kejikkk.com

已添加支持alpine系统挂载探针，已个性化CSS设置，已添加网易云外链单曲循环，可通过CSS代码实现个性化探针主题实现

### 1. 前台多节点大盘与全局统计
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/0cd9b65a-ff8e-43b2-8a5f-8a3e6e424359" />
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/d341b70b-0131-4b3e-aeda-59ae36091c89" />
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/9c5283b5-05cc-4fae-9e10-8f70fe81381c" />


### 2. 单节点实时性能折线图
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/81ce19c3-7554-4dd1-818a-7ca478d3eb0d" />
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/7024bd65-7ec2-4912-8c7a-38af36796cf3" />

### 3. 后台管理与全局设置
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/9d4d21de-6f2a-4980-9b0c-c9850f1e1223" />
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/f90c7c96-e145-49e9-889b-3e22d06af464" />
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/c6989909-0ce7-4cc1-87e6-65d87e4ea48b" />

---
## 🤝 参与贡献 (Contributing)

如果你喜欢这个项目，欢迎提交 Pull Request，或者给个 ⭐ **Star** 支持一下！

# ⚡ CF-Server-Monitor-Pro (Serverless 探针增强版)

10台VPS以下可以使用cf版本轻量部署，10台VPS以上建议使用docker部署在免费容器northflank https://github.com/a63414262/server-monitor


基于 Cloudflare Workers 和 D1 数据库构建的轻量级、零成本、高定制化的服务器探针大盘。
完美复刻了商业级探针（如 Nezha）的核心体验，但无需额外部署任何服务端 VPS！完全白嫖 Cloudflare 的免费 Serverless 资源。

## ✨ 核心特性

### 🎨 极致的视觉与个性化体验
- **高级自定义CSS个性化设置探针主题**：支持完全自定义CSS，实现网易云外链作为背景音乐自动单曲播放
- **国旗智能匹配**：依托 Cloudflare 全球网络，自动识别 VPS 归属地并渲染超清图片国旗。
- **无感 AJAX 热更新**：彻底抛弃传统的 <meta refresh>，采用 DOM 局部替换技术，数据实时跳动，页面零闪烁。
- **多维视图切换**：内置 卡片 (Card)、表格 (Table) 和 世界地图 (Map) 三种视图，使用 LocalStorage 自动记忆用户偏好。
- **管理后台新增**： Agent 上报间隔自定义设置，指定VPS前台显示或隐藏，添加对alpine系统的支持，可自动生成不同系统架构的一键探针命令。
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


### ✨ 自定义二次元透明主题 CSS 演示

将以下代码填入后台的 **「自定义 CSS 代码」** 输入框中，即可实现超清动漫壁纸与全站半透明毛玻璃卡片效果：
```css
/* 1. 网页全局二次元背景图 */
body.theme6 {
  background: url('https://i.33xp.cn/__imgapi.cn__/__imgapi.cn__5d19cf2105e31.jpg') no-repeat center center fixed !important;
  background-size: cover !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}

/* 2. 背景暗色蒙版，提高可读性 */
body.theme6::before {
    content: "";
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.2); 
    z-index: -1;
}

/* 3. 卡片毛玻璃半透明效果 (包含详情页) */
.theme6 .vps-card, 
.theme6 .global-stats, 
.theme6 .custom-table, 
.theme6 .header,
.theme6 .view-controls,
.theme6 .header-card,
.theme6 .chart-card {
  background-color: rgba(255, 255, 255, 0.65) !important; 
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  border-radius: 16px !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
  transition: all 0.3s ease;
}

/* 4. 悬停反馈 (更具科技感的发光边框) */
.theme6 .vps-card:hover,
.theme6 .chart-card:hover {
  background-color: rgba(255, 255, 255, 0.85) !important;
  box-shadow: 0 0 20px rgba(33, 186, 69, 0.2) !important;
  border-color: rgba(33, 186, 69, 0.4) !important;
}

/* 5. 进度条统一改为 Nezha 绿色 */
.theme6 .stat-bar > div,
.theme6 #disk-bar {
  background-color: #21ba45 !important;
}

/* 6. 文字颜色与字体适配 */
.theme6 .stat-label, 
.theme6 .g-label, 
.theme6 .card-meta, 
.theme6 .info-label { 
  color: #555 !important; 
}

.theme6 .stat-val, 
.theme6 .g-val, 
.theme6 .card-title-text, 
.theme6 .info-value, 
.theme6 .chart-card h3,
.theme6 .speed-val { 
  color: #000 !important; 
  font-family: 'Consolas', 'Monaco', monospace !important;
}

.theme6 .group-header { 
  color: #fff !important; 
  text-shadow: 0 2px 4px rgba(0,0,0,0.8); 
}

/* 7. 优化滚动条样式 */
.theme6 ::-webkit-scrollbar { width: 6px; height: 6px; }
.theme6 ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 3px; }
.theme6 ::-webkit-scrollbar-thumb:hover { background: rgba(33, 186, 69, 0.5); }

/* 8. 图表入场动画 */
.theme6 .chart-card {
    animation: fadeInUp 0.6s ease-out;
}
@keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
```

### ✨ 炫酷动态特效注入 (0 依赖纯原生)

如果你喜欢二次元或更加生动的展示界面，可以将以下代码完全复制，并粘贴到管理后台的 **「自定义底部 Script 注入」** 输入框中。

这段脚本包含了三种精美的特效，**全部由纯原生 JavaScript 和 Canvas 物理引擎手搓而成，不依赖 jQuery，不需要加载任何外部图片或库，极速渲染且永久有效！**

*   🌸 **樱花飘落**：使用纯数学贝塞尔曲线动态绘制花瓣。
*   ✨ **星光拖尾**：随鼠标移动生成的炫彩粒子跟随拖尾。
*   ❤️ **爱心浮动**：鼠标点击页面任意位置，生成随机颜色的爱心并上浮。
*   ❤️ **背景音乐播放**：实现网易云外链作为背景音乐自动单曲播放。https://music.163.com/song/media/outer/url?id=2616476400.mp3  id=你想替换的网易云音乐的ID即可
```html
<audio id="bgm" autoplay loop preload="auto" style="display:none;">
    <source src="https://music.163.com/song/media/outer/url?id=2616476400.mp3" type="audio/mpeg">
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
