/**
 * SURVIVOR ENGINE V8
 * Player Collision Physics & Skeleton Nerf
 */

const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');
CANVAS.width = window.innerWidth;
CANVAS.height = window.innerHeight;

// ==========================================
// ESTADO DO JOGO
// ==========================================
const GAME_STATE = {
    running: true,
    paused: false,
    startTime: Date.now(),
    enemiesKilled: 0,
    player: null,
    enemies: [],
    pickups: [],
    particles: [],
    enemyProjectiles: [],
    keys: {},
    
    // Director
    nextSpawnTime: 0,
    nextHordeTime: 0,
    nextBatSwarmTime: 0
};

// ==========================================
// ARMAS
// ==========================================

class Weapon {
    constructor(owner) { this.owner = owner; this.level = 1; this.cooldownTimer = 0; }
    update() {} draw() {} upgrade() { this.level++; }
}

class MagicWand extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = "Varinha Mágica";
        this.cooldownMax = 90; 
        this.damage = 12;
        this.speed = 4;
        this.projectileCount = 1; 
    }
    upgrade() { this.level++; this.damage += 5; this.projectileCount++; }
    update() {
        if (this.cooldownTimer <= 0) {
            const target = findNearestEnemy(this.owner);
            if (target) {
                const angle = Math.atan2(target.y - this.owner.y, target.x - this.owner.x);
                const fwdX = Math.cos(angle); const fwdY = Math.sin(angle);
                const rightX = Math.cos(angle + Math.PI/2); const rightY = Math.sin(angle + Math.PI/2);
                const spacing = 12; const depth = 12;

                for(let i=0; i < this.projectileCount; i++) {
                    let spawnX = this.owner.x; let spawnY = this.owner.y;
                    if (i > 0) {
                        const row = Math.floor((i + 1) / 2);
                        const side = (i % 2 === 1) ? 1 : -1;
                        spawnX -= fwdX * (row * depth); spawnY -= fwdY * (row * depth);
                        spawnX += rightX * (row * spacing * side); spawnY += rightY * (row * spacing * side);
                    }
                    GAME_STATE.particles.push(new Projectile(spawnX, spawnY, angle, this.damage, this.speed));
                }
                this.cooldownTimer = this.cooldownMax;
            }
        } else { this.cooldownTimer--; }
    }
}

class OrbitGuardian extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = "Aura Sagrada";
        this.radius = 80;
        this.baseDamage = 0.5;
    }
    upgrade() { this.level++; this.radius += 20; this.baseDamage += 0.2; }
    update() {
        GAME_STATE.enemies.forEach(enemy => {
            const dist = Math.hypot(this.owner.x - enemy.x, this.owner.y - enemy.y);
            if (dist < this.radius + enemy.radius) enemy.takeDamage(this.baseDamage);
        });
    }
    draw() {
        CTX.beginPath(); CTX.arc(this.owner.x, this.owner.y, this.radius, 0, Math.PI * 2);
        CTX.fillStyle = `rgba(52, 152, 219, 0.15)`; CTX.fill();
        CTX.strokeStyle = `rgba(52, 152, 219, ${0.4 + (this.level * 0.1)})`;
        CTX.lineWidth = 2; CTX.stroke();
    }
}

class ArcSlasher extends Weapon {
    constructor(owner) {
        super(owner);
        this.name = "Lâmina Arcana";
        this.cooldownMax = 60; this.cooldownTimer = 0;
        this.damage = 40; this.range = 100; this.sideIndex = 0;
    }
    upgrade() { this.level++; this.damage += 10; this.range += 10; }
    update() {
        if (this.cooldownTimer <= 0) {
            const anglesToSlash = [];
            if (this.level === 1) {
                anglesToSlash.push(this.sideIndex === 0 ? 0 : Math.PI);
                this.sideIndex = 1 - this.sideIndex;
            } else if (this.level === 2) {
                anglesToSlash.push(0, Math.PI);
            } else {
                anglesToSlash.push(0, Math.PI, Math.PI/2, -Math.PI/2);
            }
            anglesToSlash.forEach(angle => { this.performSlash(angle); });
            this.cooldownTimer = this.cooldownMax;
        } else { this.cooldownTimer--; }
    }
    performSlash(centerAngle) {
        GAME_STATE.enemies.forEach(enemy => {
            const dx = enemy.x - this.owner.x; const dy = enemy.y - this.owner.y;
            const dist = Math.hypot(dx, dy);
            if (dist < this.range) {
                const enemyAngle = Math.atan2(dy, dx);
                let diff = enemyAngle - centerAngle;
                while (diff > Math.PI) diff -= 2*Math.PI;
                while (diff < -Math.PI) diff += 2*Math.PI;
                if (Math.abs(diff) < Math.PI / 3) enemy.takeDamage(this.damage);
            }
        });
        GAME_STATE.particles.push(new SlashEffect(this.owner, centerAngle, this.range));
    }
}

// ==========================================
// ENTIDADES
// ==========================================

class Entity {
    constructor(x, y, radius, color) {
        this.x = x; this.y = y; this.radius = radius; this.color = color;
        this.markedForDeletion = false;
    }
    draw() {
        CTX.beginPath(); CTX.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        CTX.fillStyle = this.color; CTX.fill();
    }
}

class Player extends Entity {
    constructor() {
        super(CANVAS.width / 2, CANVAS.height / 2, 15, '#fff');
        this.speed = 2; 
        this.hp = 100; this.maxHp = 100;
        this.level = 1; this.xp = 0; this.xpToNextLevel = 50;
        this.weapons = [];
        this.addWeapon(new MagicWand(this));
        this.invincibleTimer = 0;
    }

    addOrUpgradeWeapon(WeaponClass) {
        const existing = this.weapons.find(w => w instanceof WeaponClass);
        if (existing) existing.upgrade(); else this.addWeapon(new WeaponClass(this));
    }
    addWeapon(weapon) { this.weapons.push(weapon); }
    gainXp(amount) {
        this.xp += amount;
        if (this.xp >= this.xpToNextLevel) {
            this.xp -= this.xpToNextLevel; this.level++;
            this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.3);
            levelUpTrigger();
        }
        updateHUD();
    }

    update() {
        if (this.invincibleTimer > 0) this.invincibleTimer--;

        // Movimento
        if (GAME_STATE.keys['ArrowUp'] || GAME_STATE.keys['w']) this.y -= this.speed;
        if (GAME_STATE.keys['ArrowDown'] || GAME_STATE.keys['s']) this.y += this.speed;
        if (GAME_STATE.keys['ArrowLeft'] || GAME_STATE.keys['a']) this.x -= this.speed;
        if (GAME_STATE.keys['ArrowRight'] || GAME_STATE.keys['d']) this.x += this.speed;

        // --- NOVA FÍSICA DE COLISÃO DO JOGADOR ---
        GAME_STATE.enemies.forEach(enemy => {
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            const combinedRadius = this.radius + enemy.radius;
            
            if (dist < combinedRadius) {
                // Vetor de empurrão (do inimigo para o player)
                const pushX = this.x - enemy.x;
                const pushY = this.y - enemy.y;
                
                // Normaliza o vetor
                const length = Math.hypot(pushX, pushY);
                if (length > 0) {
                    // Empurra o jogador para longe (Soft Collision)
                    // O fator 1.5 define o quão "duro" é o empurrão
                    this.x += (pushX / length) * 1.5;
                    this.y += (pushY / length) * 1.5;
                }
            }
        });
        // ------------------------------------------

        // Limites da tela
        this.x = Math.max(this.radius, Math.min(CANVAS.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(CANVAS.height - this.radius, this.y));
        
        this.weapons.forEach(w => w.update());
    }

    draw() {
        if (this.invincibleTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) CTX.globalAlpha = 0.5;
        super.draw();
        CTX.globalAlpha = 1.0;
        this.weapons.forEach(w => { if(w.draw) w.draw(); }); 
    }

    takeDamage(amount) {
        if (this.invincibleTimer > 0) return;
        this.hp -= amount;
        this.invincibleTimer = 30; 
        updateHUD();
        if (this.hp <= 0) gameOver();
    }
}

// --- INIMIGOS ---
class Zombie extends Entity {
    constructor(x, y) {
        super(x, y, 12, '#2ecc71');
        this.speed = 0.8 + Math.random() * 0.4; 
        this.hp = 30; this.xpValue = 10;
    }
    update() {
        const p = GAME_STATE.player;
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        GAME_STATE.enemies.forEach(other => {
            if (other === this) return;
            const d = Math.hypot(other.x - this.x, other.y - this.y);
            if (d < this.radius + other.radius) {
                const pushX = (this.x - other.x) / d; const pushY = (this.y - other.y) / d;
                this.x += pushX * 0.5; this.y += pushY * 0.5;
            }
        });
        this.x += ((p.x - this.x) / dist) * this.speed;
        this.y += ((p.y - this.y) / dist) * this.speed;
        if (dist < this.radius + p.radius) p.takeDamage(10); 
    }
    takeDamage(amount) { this.hp -= amount; if (this.hp <= 0) die(this); }
}

class Bat extends Entity {
    constructor(x, y, overrideAngle = null) {
        super(x, y, 10, '#8e44ad');
        this.hp = 15; this.xpValue = 20;
        const p = GAME_STATE.player;
        const angle = overrideAngle !== null ? overrideAngle : Math.atan2(p.y - y, p.x - x);
        const speed = 3; 
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < -200 || this.x > CANVAS.width + 200 || this.y < -200 || this.y > CANVAS.height + 200) 
            this.markedForDeletion = true;
        const p = GAME_STATE.player;
        if (Math.hypot(p.x - this.x, p.y - this.y) < this.radius + p.radius) p.takeDamage(10);
    }
    takeDamage(amount) { this.hp -= amount; if (this.hp <= 0) die(this); }
}

class Skeleton extends Entity {
    constructor(x, y) {
        super(x, y, 14, '#bdc3c7');
        this.hp = 20; this.speed = 1.0; this.xpValue = 30;
        this.range = 250; 
        this.shootTimer = 0; 
        this.shootInterval = 240; // NERF: 4 segundos (antes 120)
    }
    update() {
        const p = GAME_STATE.player;
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        if (dist > this.range) {
            this.x += ((p.x - this.x) / dist) * this.speed;
            this.y += ((p.y - this.y) / dist) * this.speed;
        } else if (dist < this.range - 50) {
            this.x -= ((p.x - this.x) / dist) * (this.speed * 0.5);
            this.y -= ((p.y - this.y) / dist) * (this.speed * 0.5);
        }
        if (this.shootTimer <= 0) {
            GAME_STATE.enemyProjectiles.push(new BoneProjectile(this.x, this.y, p));
            this.shootTimer = this.shootInterval;
        } else { this.shootTimer--; }
        if (dist < this.radius + p.radius) p.takeDamage(5);
    }
    takeDamage(amount) { this.hp -= amount; if (this.hp <= 0) die(this); }
}

class BoneProjectile extends Entity {
    constructor(x, y, target) {
        super(x, y, 5, '#fff');
        const angle = Math.atan2(target.y - y, target.x - x);
        const speed = 2.5; // NERF: Velocidade 2.5 (antes 3)
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        const p = GAME_STATE.player;
        if (Math.hypot(this.x - p.x, this.y - p.y) < this.radius + p.radius) {
            p.takeDamage(15); this.markedForDeletion = true;
        }
        if (this.x < 0 || this.x > CANVAS.width || this.y < 0 || this.y > CANVAS.height) this.markedForDeletion = true;
    }
}

function die(enemy) {
    enemy.markedForDeletion = true;
    GAME_STATE.enemiesKilled++;
    GAME_STATE.pickups.push(new XpGem(enemy.x, enemy.y, enemy.xpValue));
    updateHUD();
}

class XpGem extends Entity {
    constructor(x, y, value) { super(x, y, 5, '#9b59b6'); this.value = value; }
    update() {
        const p = GAME_STATE.player;
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        if (dist < 100) { this.x += (p.x - this.x) * 0.15; this.y += (p.y - this.y) * 0.15; }
        if (dist < p.radius + 10) { p.gainXp(this.value); this.markedForDeletion = true; }
    }
}

class Projectile extends Entity {
    constructor(x, y, angle, damage, speed) {
        super(x, y, 6, '#f1c40f');
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed; this.damage = damage;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        GAME_STATE.enemies.forEach(e => {
            if (Math.hypot(this.x - e.x, this.y - e.y) < this.radius + e.radius) {
                e.takeDamage(this.damage); this.markedForDeletion = true;
            }
        });
        if (this.x < 0 || this.x > CANVAS.width || this.y < 0 || this.y > CANVAS.height) this.markedForDeletion = true;
    }
}

class SlashEffect {
    constructor(owner, angle, range) {
        this.owner = owner; this.angle = angle; this.range = range;
        this.life = 10; this.maxLife = 10; this.markedForDeletion = false;
    }
    update() { this.life--; if (this.life <= 0) this.markedForDeletion = true; }
    draw() {
        const ctx = CTX; ctx.save(); ctx.translate(this.owner.x, this.owner.y);
        ctx.beginPath();
        ctx.arc(0, 0, this.range, this.angle - Math.PI/4, this.angle + Math.PI/4);
        ctx.strokeStyle = `rgba(255, 255, 255, ${this.life / this.maxLife})`;
        ctx.lineWidth = 50; ctx.stroke(); ctx.restore();
    }
}

// ==========================================
// ENGINE CORE
// ==========================================

function init() {
    GAME_STATE.player = new Player();
    window.addEventListener('keydown', e => GAME_STATE.keys[e.key] = true);
    window.addEventListener('keyup', e => GAME_STATE.keys[e.key] = false);

    const now = Date.now();
    GAME_STATE.nextSpawnTime = now + 1000;
    GAME_STATE.nextHordeTime = now + 10000; 
    GAME_STATE.nextBatSwarmTime = now + 15000; 

    gameLoop();
}

function spawnDirector() {
    const now = Date.now();
    const elapsedSeconds = (now - GAME_STATE.startTime) / 1000;

    if (now > GAME_STATE.nextSpawnTime) {
        let spawnDelay = 2000; 
        if (elapsedSeconds > 30) spawnDelay = 1000; 
        if (elapsedSeconds > 60) spawnDelay = 500;  
        if (elapsedSeconds > 120) spawnDelay = 200; 
        spawnSpecificEnemy(null, elapsedSeconds); 
        GAME_STATE.nextSpawnTime = now + spawnDelay;
    }
    if (now > GAME_STATE.nextHordeTime) {
        let hordeSize = 3;
        let hordeInterval = 8000;
        if (elapsedSeconds > 30) { hordeSize = 5; hordeInterval = 6000; }
        if (elapsedSeconds > 60) { hordeSize = 8; hordeInterval = 5000; }
        spawnHorde(hordeSize, elapsedSeconds);
        GAME_STATE.nextHordeTime = now + hordeInterval;
    }
    if (now > GAME_STATE.nextBatSwarmTime) {
        if (elapsedSeconds > 15) {
            const swarmSize = elapsedSeconds > 60 ? 15 : 8; 
            spawnBatSwarm(swarmSize);
        }
        GAME_STATE.nextBatSwarmTime = now + 12000; 
    }
}

function spawnBatSwarm(amount) {
    const side = Math.floor(Math.random() * 4);
    let startX, startY, targetX, targetY;
    if (side === 0) { startX = Math.random() * CANVAS.width; startY = -50; targetX = startX; targetY = CANVAS.height + 50; } 
    else if (side === 1) { startX = CANVAS.width + 50; startY = Math.random() * CANVAS.height; targetX = -50; targetY = startY; } 
    else if (side === 2) { startX = Math.random() * CANVAS.width; startY = CANVAS.height + 50; targetX = startX; targetY = -50; } 
    else { startX = -50; startY = Math.random() * CANVAS.height; targetX = CANVAS.width + 50; targetY = startY; }

    const angle = Math.atan2(targetY - startY, targetX - startX);
    for(let i=0; i<amount; i++) {
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 100;
        GAME_STATE.enemies.push(new Bat(startX + offsetX, startY + offsetY, angle));
    }
}

function spawnHorde(amount, elapsedSeconds) {
    let centerX = Math.random() < 0.5 ? -50 : CANVAS.width + 50;
    let centerY = Math.random() * CANVAS.height;
    for (let i = 0; i < amount; i++) {
        const offsetX = (Math.random() - 0.5) * 80;
        const offsetY = (Math.random() - 0.5) * 80;
        spawnSpecificEnemy({x: centerX + offsetX, y: centerY + offsetY}, elapsedSeconds);
    }
}

function spawnSpecificEnemy(pos, elapsedSeconds) {
    let x = pos ? pos.x : (Math.random() < 0.5 ? -40 : CANVAS.width + 40);
    let y = pos ? pos.y : Math.random() * CANVAS.height;
    if (!pos) {
        if (Math.abs(x) < 50 || Math.abs(x - CANVAS.width) < 50) y = Math.random() * CANVAS.height;
        else y = Math.random() < 0.5 ? -40 : CANVAS.height + 40;
    }
    const rand = Math.random();
    if (elapsedSeconds < 30) {
        GAME_STATE.enemies.push(new Zombie(x, y));
    } else if (elapsedSeconds < 60) {
        if (rand < 0.2) GAME_STATE.enemies.push(new Bat(x, y));
        else GAME_STATE.enemies.push(new Zombie(x, y));
    } else {
        if (rand < 0.2) GAME_STATE.enemies.push(new Skeleton(x, y));
        else if (rand < 0.4) GAME_STATE.enemies.push(new Bat(x, y));
        else GAME_STATE.enemies.push(new Zombie(x, y));
    }
}

function findNearestEnemy(player) {
    let nearest = null; let minDist = Infinity;
    GAME_STATE.enemies.forEach(e => {
        const d = Math.hypot(player.x - e.x, player.y - e.y);
        if (d < minDist) { minDist = d; nearest = e; }
    });
    return nearest;
}

const UPGRADE_POOL = [
    { type: 'weapon', classRef: MagicWand, title: "Varinha Mágica", desc: "Tiros teleguiados. Upgrade: +1 Projétil." },
    { type: 'weapon', classRef: OrbitGuardian, title: "Aura Sagrada", desc: "Dano em área. Upgrade: +Tamanho/Dano." },
    { type: 'weapon', classRef: ArcSlasher, title: "Lâmina Arcana", desc: "Ataque lateral. Upgrade: +Direção Simultânea." },
    { type: 'heal', title: "Poção de Vida", desc: "Recupera 50% da vida." },
    { type: 'speed', title: "Botas de Hermes", desc: "Aumenta velocidade de movimento (+0.5)." }
];

function levelUpTrigger() {
    GAME_STATE.paused = true;
    const modal = document.getElementById('levelup-modal');
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    modal.classList.remove('hidden');
    for (let i = 0; i < 3; i++) {
        const choice = UPGRADE_POOL[Math.floor(Math.random() * UPGRADE_POOL.length)];
        const card = document.createElement('div');
        card.className = 'card';
        let statusText = "";
        if (choice.type === 'weapon') {
            const hasIt = GAME_STATE.player.weapons.find(w => w instanceof choice.classRef);
            if(hasIt) statusText = `<small style='color:#2ecc71'>(NV ${hasIt.level + 1})</small>`;
            else statusText = "<small style='color:#e67e22'>(NOVA!)</small>";
        }
        card.innerHTML = `<h3>${choice.title}</h3>${statusText}<p>${choice.desc}</p>`;
        card.onclick = () => { applyUpgrade(choice); modal.classList.add('hidden'); GAME_STATE.paused = false; };
        container.appendChild(card);
    }
}

function applyUpgrade(choice) {
    const p = GAME_STATE.player;
    if (choice.type === 'weapon') p.addOrUpgradeWeapon(choice.classRef);
    else if (choice.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 50);
    else if (choice.type === 'speed') p.speed += 0.5;
    updateHUD();
}

function updateHUD() {
    const p = GAME_STATE.player;
    document.getElementById('hp-bar').style.width = (p.hp / p.maxHp * 100) + '%';
    document.getElementById('xp-bar').style.width = (p.xp / p.xpToNextLevel * 100) + '%';
    document.getElementById('kill-count').innerText = GAME_STATE.enemiesKilled;
    document.getElementById('level-display').innerText = p.level;
    const elapsed = Math.floor((Date.now() - GAME_STATE.startTime) / 1000);
    const m = Math.floor(elapsed/60).toString().padStart(2,'0');
    const s = (elapsed%60).toString().padStart(2,'0');
    document.getElementById('timer').innerText = `${m}:${s}`;
}

function gameOver() {
    GAME_STATE.running = false;
    alert("FIM DE JOGO! Tempo: " + document.getElementById('timer').innerText);
    location.reload();
}

function gameLoop() {
    requestAnimationFrame(gameLoop);
    if (!GAME_STATE.running || GAME_STATE.paused) return;

    spawnDirector();

    CTX.fillStyle = '#1a1a1a';
    CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);

    GAME_STATE.pickups.forEach((p, i) => {
        p.update(); p.draw();
        if (p.markedForDeletion) GAME_STATE.pickups.splice(i, 1);
    });

    GAME_STATE.player.update();
    GAME_STATE.player.draw();

    GAME_STATE.enemies.forEach((e, i) => {
        e.update(); e.draw();
        if (e.markedForDeletion) GAME_STATE.enemies.splice(i, 1);
    });

    GAME_STATE.enemyProjectiles.forEach((p, i) => {
        p.update(); p.draw();
        if (p.markedForDeletion) GAME_STATE.enemyProjectiles.splice(i, 1);
    });

    GAME_STATE.particles.forEach((p, i) => {
        p.update(); if (p.draw) p.draw(); 
        if (p.markedForDeletion) GAME_STATE.particles.splice(i, 1);
    });
}

init();
window.addEventListener('resize', () => { CANVAS.width=window.innerWidth; CANVAS.height=window.innerHeight; });