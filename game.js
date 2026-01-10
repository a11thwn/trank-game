const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const moneyEl = document.getElementById("money");
const gameOverEl = document.getElementById("gameOver");
const gameGuideEl = document.getElementById("gameGuide");
const shopOverlayEl = document.getElementById("shopOverlay");
const shopBtnEl = document.getElementById("shopBtn");

// 音频引擎 - 升级版
const AudioEngine = {
  ctx: null,
  isMuted: localStorage.getItem("tank_muted") === "true",
  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.updateMuteUI();
  },
  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem("tank_muted", this.isMuted);
    this.updateMuteUI();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  updateMuteUI() {
    const btn = document.getElementById("audioControl");
    if (btn) btn.innerText = this.isMuted ? "🔇" : "🔊";
  },
  playEffect(freq, type, duration, volume = 0.1) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration
    );
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration
    );
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  playShoot() {
    this.playEffect(400, "square", 0.15, 0.05);
  },
  playExplosion() {
    this.playEffect(60, "sawtooth", 0.5, 0.15);
  },
  playCoin() {
    this.playEffect(900, "sine", 0.1, 0.1);
  },

  startBGM() {
    if (!this.ctx) return;
    // 双声道：主旋律 + 低音基础
    const melody = [261.6, 0, 329.6, 0, 392.0, 392.0, 349.2, 329.6]; // C4, E4, G4...
    const bass = [130.8, 130.8, 164.8, 164.8, 196.0, 196.0, 174.6, 164.8]; // C3, E3, G3...
    let step = 0;

    const nextNote = () => {
      const tempo = 250; // 每个音符的毫秒数
      if (!this.isMuted && !isPaused && !isGameOver) {
        const time = this.ctx.currentTime;

        // 播放主旋律 (如果不是0)
        if (melody[step % melody.length] > 0) {
          this.osc(melody[step % melody.length], "triangle", 0.03, time, 0.4);
        }
        // 播放低音 (每一步都播，更有节奏感)
        this.osc(bass[step % bass.length], "square", 0.02, time, 0.2);
      }
      step++;
      setTimeout(nextNote, tempo);
    };
    nextNote();
  },
  osc(freq, type, vol, time, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(time);
    o.stop(time + dur);
  },
};

// 初始状态
let isPaused = true;
let isShopOpen = false;

// 坦克机型定义 (基于手绘图)
const TANK_MODELS = {
  R: {
    name: "基础型 R",
    price: 0,
    speed: 5,
    fastSpeed: 10,
    bullets: 1,
    color: "#445544",
    width: 50,
    height: 30,
  },
  C: {
    name: "轻型 C",
    price: 1050,
    speed: 7,
    fastSpeed: 13,
    bullets: 1,
    color: "#556677",
    width: 45,
    height: 28,
  },
  L: {
    name: "精英 L",
    price: 10000,
    speed: 6,
    fastSpeed: 11,
    bullets: 2,
    color: "#776655",
    width: 55,
    height: 32,
  },
  S: {
    name: "史诗 S",
    price: 100000000,
    speed: 8,
    fastSpeed: 15,
    bullets: 3,
    color: "#884444",
    width: 65,
    height: 35,
  },
  SS: {
    name: "传说 SS",
    price: 1000000000,
    speed: 9,
    fastSpeed: 18,
    bullets: 5,
    color: "#444488",
    width: 75,
    height: 40,
  },
  "?": {
    name: "未知兵器 ?",
    price: 5000000000,
    speed: 10,
    fastSpeed: 20,
    bullets: 8,
    color: "#CCAA00",
    width: 85,
    height: 45,
  },
};

let currentUser = localStorage.getItem("current_session_user") || "";
let currentModelKey = "R";
let ownedTanks = ["R"];
let money = 0;

function handleLogin() {
  const input = document.getElementById("usernameInput").value.trim();
  if (!input) {
    alert("请输入指挥官名称！");
    return;
  }
  currentUser = input;
  localStorage.setItem("current_session_user", currentUser);
  saveUserToList(currentUser); // 保存到历史列表
  loadUserData();
  startGame();
}

function saveUserToList(user) {
  let list = JSON.parse(localStorage.getItem("tank_user_list")) || [];
  if (!list.includes(user)) {
    list.push(user);
    localStorage.setItem("tank_user_list", JSON.stringify(list));
  }
}

function renderUserList() {
  const list = JSON.parse(localStorage.getItem("tank_user_list")) || [];
  const container = document.getElementById("userListContainer");
  const listEl = document.getElementById("userList");
  
  if (list.length > 0) {
    container.style.display = "block";
    listEl.innerHTML = "";
    list.forEach(user => {
      const span = document.createElement("span");
      span.innerText = user;
      span.style.cssText = "background: #333; padding: 4px 12px; border-radius: 15px; border: 1px solid #555; cursor: pointer; font-size: 0.8em; transition: 0.2s;";
      span.onmouseover = () => span.style.borderColor = "#4CAF50";
      span.onmouseout = () => span.style.borderColor = "#555";
      span.onclick = () => {
        document.getElementById("usernameInput").value = user;
        handleLogin();
      };
      listEl.appendChild(span);
    });
  }
}

function loadUserData() {
  if (!currentUser) return;
  
  // 使用用户名作为前缀来存储数据
  currentModelKey = localStorage.getItem(`${currentUser}_current_tank`) || "R";
  ownedTanks = JSON.parse(localStorage.getItem(`${currentUser}_owned_tanks`)) || ["R"];
  money = parseInt(localStorage.getItem(`${currentUser}_money`)) || 0;
  
  // 更新坦克对象
  const m = TANK_MODELS[currentModelKey];
  tank = { ...m, x: tank.x, y: tank.y };
  
  // 更新 UI
  document.getElementById("currentUsername").innerText = currentUser;
  document.getElementById("userBadge").style.display = "flex";
  document.getElementById("shopBtn").style.display = "flex";
  moneyEl.innerText = formatMoney(money);
}

function logout() {
  localStorage.removeItem("current_session_user");
  location.reload(); // 刷新页面回到登录界面
}

// 游戏变量
let tank = { ...TANK_MODELS["R"], x: 400, y: 520 };

// 金币格式化函数
function formatMoney(n) {
  if (n >= 100000000) {
    return (n / 100000000).toFixed(1) + "亿";
  } else if (n >= 10000) {
    return (n / 10000).toFixed(1) + "万";
  }
  return n.toString();
}

// 保存并更新UI
function updateMoney(amount) {
  money += amount;
  localStorage.setItem(`${currentUser}_money`, money);
  moneyEl.innerText = formatMoney(money);
}

let isGameOver = false;
let keys = {};
let bullets = [];
let trees = [];
let planes = [];
let bombs = [];
let coins = []; // 实体金币数组
let particles = []; // 粒子数组
let shakeTime = 0; // 屏幕震动剩余时间

// 粒子类 (用于爆炸效果)
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.r = Math.random() * 4 + 2;
    this.vx = (Math.random() - 0.5) * 10;
    this.vy = (Math.random() - 0.5) * 10;
    this.life = 1.0;
    this.decay = Math.random() * 0.05 + 0.02;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
  }
  draw() {
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

function createExplosion(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
  shakeTime = 10; // 触发震动
}

// 金币类
class Coin {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 8;
    this.vy = -5 - Math.random() * 5; // 初始向上跳
    this.vx = (Math.random() - 0.5) * 6; // 向左右散开
    this.gravity = 0.5;
    this.bounce = 0.6;
    this.collected = false;
    this.timer = 0;
  }
  update() {
    // 磁铁逻辑：如果是终极坦克 (?)，金币会自动飞向坦克
    if (currentModelKey === "?") {
      let dx = tank.x + tank.width / 2 - this.x;
      let dy = tank.y + tank.height / 2 - this.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 300) {
        this.vx += (dx / dist) * 0.8;
        this.vy += (dy / dist) * 0.8;
      }
    }

    this.vx *= 0.98;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;

    // 地面碰撞
    if (this.y > 540) {
      this.y = 540;
      this.vy *= -this.bounce;
    }
    // 边缘碰撞
    if (this.x < 0 || this.x > canvas.width) this.vx *= -1;

    this.timer++;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    // 闪烁效果
    ctx.fillStyle = this.timer % 20 < 10 ? "#FFD700" : "#FFA500";
    ctx.fill();
    ctx.strokeStyle = "#B8860B";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 画中间的 $ 符号
    ctx.fillStyle = "#B8860B";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText("$", this.x, this.y + 4);
    ctx.restore();
  }
}

// 初始化树木
function createTree() {
  return {
    x: Math.random() * 700 + 50,
    y: Math.random() * 250 + 150,
    alive: true,
  };
}

for (let i = 0; i < 6; i++) trees.push(createTree());

function startGame() {
  if (!AudioEngine.ctx) {
    AudioEngine.init();
    AudioEngine.startBGM();
  }
  gameGuideEl.style.display = "none";
  isPaused = false;
  update();
}

// 初始化飞机
function createPlane() {
  return { x: -100, y: 50, speed: 2 + Math.random() * 2 };
}
planes.push(createPlane());

// 监听按键
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space" && !isGameOver) {
    shoot();
    AudioEngine.playShoot();
  }
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

function shoot() {
  const model = TANK_MODELS[currentModelKey];
  if (model.bullets === 1) {
    bullets.push({ x: tank.x + tank.width / 2, y: tank.y, r: 5, vx: 0 });
  } else {
    // 实现手绘图中的多发效果
    const step = 20 / (model.bullets - 1 || 1);
    for (let i = 0; i < model.bullets; i++) {
      bullets.push({
        x: tank.x + tank.width / 2,
        y: tank.y,
        r: 5,
        vx: (i - (model.bullets - 1) / 2) * 2, // 扇形扩散
      });
    }
  }
}

function toggleShop() {
  isShopOpen = !isShopOpen;
  isPaused = isShopOpen;
  shopOverlayEl.style.display = isShopOpen ? "grid" : "none";
  if (isShopOpen) {
    renderShop();
  } else {
    // 修复返回游戏卡死的问题：当关闭商店时，重新启动 update 循环
    update();
  }
}

function renderShop() {
  shopOverlayEl.innerHTML = "";
  Object.keys(TANK_MODELS).forEach((key) => {
    const m = TANK_MODELS[key];
    const isOwned = ownedTanks.includes(key);
    const canAfford = money >= m.price;

    const div = document.createElement("div");
    div.className = `shop-item ${
      isOwned ? "owned" : !canAfford ? "locked" : ""
    }`;
    div.innerHTML = `
            <div class="preview">
                <div style="width: ${m.width * 0.6}px; height: ${
      m.height * 0.6
    }px; background: ${m.color}; border: 2px solid #222;"></div>
            </div>
            <h3>${m.name}</h3>
            <div class="price">${
              isOwned ? "已解锁" : "💰 " + formatMoney(m.price)
            }</div>
            <small>火力: ${m.bullets} | 速度: ${m.speed}</small>
            ${
              key === "?"
                ? '<br><span style="color:#FFD700;font-size:0.8em">✨ 特性: 自动吸金磁铁</span>'
                : ""
            }
        `;
    div.onclick = () => {
      if (isOwned) {
        selectTank(key);
      } else if (canAfford) {
        buyTank(key);
      }
    };
    shopOverlayEl.appendChild(div);
  });
}

function buyTank(key) {
  const price = TANK_MODELS[key].price;
  if (money >= price) {
    money -= price;
    localStorage.setItem(`${currentUser}_money`, money);
    moneyEl.innerText = formatMoney(money);
    ownedTanks.push(key);
    localStorage.setItem(`${currentUser}_owned_tanks`, JSON.stringify(ownedTanks));
    AudioEngine.playEffect(600, "sine", 0.5, 0.2); // 购买成功音效
    selectTank(key);
    renderShop();
  }
}

function selectTank(key) {
  currentModelKey = key;
  localStorage.setItem(`${currentUser}_current_tank`, key);
  const m = TANK_MODELS[key];
  // 彻底更新坦克对象的所有属性
  const oldX = tank.x;
  const oldY = tank.y;
  tank = { ...m, x: oldX, y: oldY };
  toggleShop();
}

function resetGame() {
  tank.x = 400;
  money = 0;
  localStorage.setItem(`${currentUser}_money`, 0);
  moneyEl.innerText = "0";
  bullets = [];
  bombs = [];
  coins = [];
  particles = [];
  shakeTime = 0;
  isGameOver = false;
  gameOverEl.style.display = "none";
  update();
}

function update() {
  if (isPaused) return;
  if (isGameOver) {
    gameOverEl.style.display = "block";
    return;
  }

  // 坦克移动逻辑
  let s = keys["ShiftLeft"] || keys["ShiftRight"] ? tank.fastSpeed : tank.speed;
  if (keys["ArrowLeft"] || keys["KeyA"]) tank.x -= s;
  if (keys["ArrowRight"] || keys["KeyD"]) tank.x += s;
  tank.x = Math.max(0, Math.min(canvas.width - tank.width, tank.x));

  // 子弹逻辑
  bullets.forEach((b, i) => {
    b.y -= 8;
    b.x += b.vx || 0; // 支持散射
    if (b.y < 0 || b.x < 0 || b.x > canvas.width) bullets.splice(i, 1);

    // 碰撞检测：干倒大树
    trees.forEach((t) => {
      if (t.alive && Math.hypot(b.x - t.x, b.y - t.y) < 30) {
        t.alive = false;
        bullets.splice(i, 1);
        createExplosion(t.x, t.y, "#228B22", 15); // 绿色爆炸
        AudioEngine.playExplosion();
        // 击中树木产生 3-5 个金币
        const count = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < count; j++) {
          coins.push(new Coin(t.x, t.y));
        }
        setTimeout(() => {
          t.alive = true;
          t.x = Math.random() * 700 + 50;
        }, 2000);
      }
    });
  });

  // 飞机逻辑
  planes.forEach((p) => {
    p.x += p.speed;
    if (p.x > canvas.width + 100) p.x = -100;
    if (Math.random() < 0.02) bombs.push({ x: p.x, y: p.y, r: 8 });
  });

  // 炸弹逻辑：炸毁坦克
  bombs.forEach((b, i) => {
    b.y += 5;
    if (b.y > canvas.height) bombs.splice(i, 1);
    if (
      b.x > tank.x &&
      b.x < tank.x + tank.width &&
      b.y > tank.y &&
      b.y < tank.y + tank.height
    ) {
      createExplosion(
        tank.x + tank.width / 2,
        tank.y + tank.height / 2,
        "orange",
        30
      );
      AudioEngine.playExplosion();
      isGameOver = true;
    }
  });

  // 金币逻辑
  coins.forEach((c, i) => {
    c.update();
    // 坦克拾取检测 (使用矩形 vs 圆形近似)
    if (
      c.x > tank.x - 5 &&
      c.x < tank.x + tank.width + 5 &&
      c.y > tank.y - 5 &&
      c.y < tank.y + tank.height + 5
    ) {
      updateMoney(10); // 每个掉落的金币值 10 金币，让你更快买得起高级车
      AudioEngine.playCoin();
      coins.splice(i, 1);
    }
    // 自动消失（防止太多卡顿，虽然这里不太可能）
    if (c.timer > 500) coins.splice(i, 1);
  });

  // 粒子更新
  particles.forEach((p, i) => {
    p.update();
    if (p.life <= 0) particles.splice(i, 1);
  });

  if (shakeTime > 0) shakeTime--;

  draw();
  requestAnimationFrame(update);
}

function draw() {
  ctx.save();
  if (shakeTime > 0) {
    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  }
  ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);

  // 画草地
  ctx.fillStyle = "#7cfc00";
  ctx.fillRect(0, 550, canvas.width, 50);

  // 画大树
  trees.forEach((t) => {
    if (!t.alive) return;
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(t.x - 5, t.y, 10, 30);
    ctx.fillStyle = "#228B22";
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 40);
    ctx.lineTo(t.x - 30, t.y);
    ctx.lineTo(t.x + 30, t.y);
    ctx.fill();
  });

  // 画坦克
  ctx.fillStyle = tank.color;
  ctx.fillRect(tank.x, tank.y, tank.width, tank.height);
  ctx.fillStyle = "#222";
  // 根据等级画不同的炮塔 (S级及以上画多个炮管)
  const turretW = tank.width * 0.6;
  const turretH = tank.height * 0.6;
  ctx.fillRect(
    tank.x + (tank.width - turretW) / 2,
    tank.y - turretH / 2,
    turretW,
    turretH
  );

  ctx.fillStyle = "#222";
  if (tank.bullets > 3) {
    // 超级坦克：多管炮
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(tank.x + tank.width / 2 - 15 + i * 10, tank.y - 15, 6, 20);
    }
  } else {
    ctx.fillRect(tank.x + tank.width / 2 + 5, tank.y - 5, tank.width / 2, 6); // 普通炮管
  }

  // 画子弹
  ctx.fillStyle = "black";
  bullets.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 画飞机
  ctx.fillStyle = "#666";
  planes.forEach((p) => {
    ctx.fillRect(p.x, p.y, 60, 20);
    ctx.fillRect(p.x + 20, p.y - 10, 20, 40);
  });

  // 画炸弹
  ctx.fillStyle = "red";
  bombs.forEach((b) => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 画实体金币
  coins.forEach((c) => c.draw());

  // 画粒子
  particles.forEach((p) => p.draw());

  ctx.restore();
}

// 检查是否有已登录用户并初始化界面
renderUserList();
if (currentUser) {
  loadUserData();
}
