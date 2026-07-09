CF探针pro版本已经集成进KUI

https://github.com/a6216abcd/K-UI/tree/dev

## 🚀 快速部署与使用

### 第一步：一键部署到 Cloudflare

# 新人点击下方一键极速部署/老用户直接覆盖代码升级  

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/a63414262/CF-Server-Monitor-Pro)



### 第二步：添加节点并挂载探针

1. 进入后台后，在“节点列表”区域输入「节点名称」，选择对应的「系统环境」，点击 **+ 添加新服务器**。
2. 节点生成后，点击对应行的 **复制安装** 按钮。
3. 登录你的被控端 VPS 或 Windows 服务器，粘贴命令并回车运行。
4. 等待 5~10 秒，回到前台大盘刷新即可看到数据跳动。

---
## 📸 界面预览

演示站点：https://still-cell-000f.a6856191801.workers.dev 

演示站点已经使用本页提供的CSS个性化代码美化设置，只想简单探针可以不用个性化的CSS代码，直接用默认主题就行

### 1. 前台多节点大盘与单节点实时性能折线图
<img width="3840" height="1738" alt="image" src="https://github.com/user-attachments/assets/aee57ca7-6123-4aa6-adb7-fe132c64cd06" />
<img width="3840" height="1765" alt="image" src="https://github.com/user-attachments/assets/084d95c1-2f8b-44a0-87ff-ed43a8accc09" />
<img width="3840" height="1765" alt="image" src="https://github.com/user-attachments/assets/31803b80-ffa5-4a3e-a589-c972d24836cc" />

### 2. 后台管理与全局设置
<img width="3840" height="1765" alt="image" src="https://github.com/user-attachments/assets/272b6683-fe67-4c4c-806b-fde6ff66ec14" />
<img width="3840" height="1765" alt="image" src="https://github.com/user-attachments/assets/8cb999d0-ca82-4b2c-a9a9-c8b403bf1e9b" />
<img width="3840" height="1765" alt="image" src="https://github.com/user-attachments/assets/bc0f8735-46ec-4cb7-831d-c9a4b9dc555c" />


---

# ⚡ CF-Server-Monitor-Pro (Serverless 探针增强版)

10台VPS以下可以使用cf版本轻量部署，10台VPS以上建议使用docker部署在免费容器northflank https://github.com/a63414262/server-monitor

基于 Cloudflare Workers 和 D1 数据库构建的零成本、高定制化服务器探针大盘。
完全白嫖 Cloudflare 的免费 Serverless 资源，无需额外部署任何服务端 VPS！支持多节点大盘展示、单节点详情图表、全平台 Agent 监控与 Telegram 机器人深度交互。

## ✨ 核心特性

* **🚀 纯 Serverless 架构**：后端与数据库依托 Cloudflare，全球极速访问，彻底告别服务端宕机烦恼。
* **🚀 新增首页访客弹窗**：开启访客首次访问弹窗 (按IP和浏览器缓存控制)。
* **🤖 Telegram 深度管理**：不仅支持节点离线/恢复告警推送，更支持通过 Telegram Bot 快捷菜单直接**添加节点、修改配置、全局设置交互**。
* **🌐 Gossip 去中心化排行**：内置节点互联共识协议，自动加入全网数字资产与在线设备数量的排行榜。
* **📊 全维度高精度监控**：
* 支持 CPU、内存、磁盘、进程数、TCP/UDP 连接数实时折线图。
* **硬核双栈检测**：自动探测 IPv4 与 IPv6 网络连通性。
* **三网延迟监控**：实时获取电信 (CT)、联通 (CU)、移动 (CM) 及字节核心节点的 HTTP Ping 延迟。
* **智能流量统计**：支持总流量累计，**新增按节点设定“重置日”**，每月自动清零重新统计。


* **💻 全平台 Agent 支持**：后台一键生成挂载命令，完美支持 **Linux (Systemd)**、**Alpine (OpenRC)** 及 **Windows (PowerShell)**。
* **🎨 极致视效与高定制性**：
* 卡片、表格、世界地图三种视图无缝切换，本地记忆偏好。
* AJAX 局部无感热更新，数据跳动页面不闪烁。
* 支持自定义背景图片、全局透明光幕风格，预留完全自定义 CSS 与 JS 脚本注入入口。



---

## 🤖 Telegram 机器人配置 (可选)

配置完成后，不仅可以接收掉线告警，还能直接在 TG 发送 `/menu` 调出可视化管理面板。

1. 在 Telegram 搜索 `@BotFather`，创建机器人并获取 **Bot Token**。
2. 搜索 `@userinfobot` 或向你的机器人发送任意消息，获取你的 **Chat ID**。
3. 登录探针后台，在 **Telegram 机器人管理与告警** 模块填入 Token 和 Chat ID。
4. 将状态设置为 **开启告警与管理**，点击保存（系统将自动向 TG 注册 Webhook 和快捷菜单指令）。

---

## 🎨 界面高度自定义 (进阶)

后台支持极其强大的 DIY 功能，在「前端主题风格」中选择 **完全自定义 CSS (Custom Theme)**，即可解锁魔改：

* **更换全屏高清壁纸**：在后台「自定义背景图片」直接贴入图片 URL（开启后卡片会自动变为优雅半透明光幕）。
* **自定义 CSS 注入**：修改卡片颜色、字体、甚至隐藏指定元素。
* **自定义 Script 注入**：支持插入纯原生 JavaScript 特效（如樱花飘落、鼠标跟随粒子等），不依赖第三方库，极速渲染。

### ✨ 自定义背景图片透明主题 CSS 演示

将以下代码填入后台的 **「自定义 CSS 代码」** 输入框中，即可实现超清壁纸与全站透明卡片效果：
https://pic.netbian.com/uploads/allimg/250516/110318-17473645980a8c.jpg  更换成你喜欢的壁纸图片
```css
/* 1. 网页全局背景 */
body.theme6 {
  background: url('https://pic.netbian.com/uploads/allimg/250516/110318-17473645980a8c.jpg') no-repeat center center fixed !important;
  background-size: cover !important;
}

/* 2. Canvas 樱花/特效层级提到最高且开启点击穿透 */
#effect_canvas {
    z-index: 99999999 !important;
    pointer-events: none !important;
}

/* 3. 材质重构：改用暗黑系全透明光幕（彻底解决吃字、看不清的问题） */
.theme6 .consensus-panel,
.theme6 .vps-card, 
.theme6 .global-stats, 
.theme6 .custom-table, 
.theme6 .header-card,
.theme6 .custom-table th,
.theme6 .chart-card,
.theme6 .modal-content {
  background: rgba(15, 23, 42, 0.45) !important; /* 优雅的45%半透明深色黑夜底板，压住复杂的背景干扰 */
  backdrop-filter: none !important; /* 保持100%全透明不浑浊 */
  -webkit-backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important; /* 极细的半透明白描边，勾勒出外框 */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2) !important; 
  border-radius: 12px !important;
}

/* 4. 荧光控光文字：在暗色背景下，亮色字体清晰度直接暴增 */
.theme6 .c-label,
.theme6 .g-label,
.theme6 .stat-label,
.theme6 .card-meta {
  color: #94a3b8 !important; /* 优雅的浅板岩灰，用于次要标签 */
  font-weight: 500 !important;
  text-shadow: none !important;
}

.theme6 .c-val,
.theme6 .g-val,
.theme6 .stat-val,
.theme6 .card-title-text,
.theme6 .card-title,
.theme6 td {
  color: #f8fafc !important; /* 纯净的月光白，无论背景多复杂都能一眼识别 */
  font-weight: 600 !important;
  text-shadow: none !important; 
}

/* 主标题微调（防止顶部标题看不清） */
.theme6 h1 {
  color: #ffffff !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5) !important;
}

/* 5. 进度条背景优化，在暗色下面更加醒目 */
.theme6 .stat-bar-full {
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
}

/* 6. 组件及特殊高亮标签微调 */
.theme6 .badge-bw { background: rgba(59, 130, 246, 0.8) !important; color: #fff !important; }
.theme6 .badge-tf { background: rgba(16, 185, 129, 0.8) !important; color: #fff !important; }
.theme6 span[style*="color:#8b5cf6"], 
.theme6 span[style*="color: rgb(139, 92, 246)"] {
  color: #c084fc !important; /* 改为淡紫色荧光 */
  font-weight: 700 !important;
}

/* 7. 确保点击事件可以传导给 body */
.container {
    position: relative;
    z-index: 10;
}

```

### ✨ 炫酷动态特效注入 (0 依赖纯原生)

如果你喜欢二次元或更加生动的展示界面，可以将以下代码完全复制，并粘贴到管理后台的 **「自定义底部 Script 注入」** 输入框中。

这段脚本包含了三种精美的特效，**全部由纯原生 JavaScript 和 Canvas 物理引擎手搓而成，不依赖 jQuery，不需要加载任何外部图片或库，极速渲染且永久有效！**

*   🌸 **樱花飘落**：使用纯数学贝塞尔曲线动态绘制花瓣。
*   ✨ **星光拖尾**：随鼠标移动生成的炫彩粒子跟随拖尾。
*   ❤️ **爱心浮动**：鼠标点击页面任意位置，生成随机颜色的爱心并上浮。
*   ❤️ **背景音乐播放**：实现网易云外链作为背景音乐自动单曲播放。https://music.163.com/song/media/outer/url?id=2614307770.mp3  id=你想替换的网易云音乐的ID即可,删除ID播放背景音乐不开启
```html
<audio id="bgm" autoplay loop preload="auto" style="display:none;">
    <source src="https://music.163.com/song/media/outer/url?id=2614307770.mp3" type="audio/mpeg">
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

---

## 🗑️ 探针卸载指南

如果你需要移除某台 VPS 上的探针：

**方式一（推荐）**：在管理后台的节点列表中，直接点击该节点的 **一键卸载**，复制命令到对应 VPS 执行即可自动完全清理服务和残留。

**方式二（手动执行）**：

* **Linux (Debian/Ubuntu/CentOS)**:
```bash
systemctl stop cf-probe.service
systemctl disable cf-probe.service
rm -f /etc/systemd/system/cf-probe.service /usr/local/bin/cf-probe.sh
systemctl daemon-reload

```




* **Alpine Linux**:
  ```bash
  rc-service cf-probe stop
  rc-update del cf-probe default
  rm -f /etc/init.d/cf-probe /usr/local/bin/cf-probe.sh



* **Windows (PowerShell 管理员模式)**:
```powershell
Stop-ScheduledTask -TaskName CFProbeAgent -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName CFProbeAgent -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Path C:\ProgramData\CFProbe -Recurse -Force -ErrorAction SilentlyContinue

```




*(注：卸载后请在探针后台列表中点击“删除节点”以清理大盘显示。)*

---

## 🤝 参与贡献与协议

本项目由纯 Serverless 爱好者开发，功能持续迭代中。
如果你喜欢这个项目，欢迎提交 PR，或者给个 ⭐ **Star** 支持一下！
