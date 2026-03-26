/**
 * SURVIVOR ENGINE 
 * 
 * @author Dimitri Freitas
 * @version 1.7
 */

const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');
CANVAS.width = window.innerWidth;
CANVAS.height = window.innerHeight;

// ==========================================
// 1. DADOS E MEMÓRIA
// ==========================================

var CONFIG = {
    player: { speed: 2, maxHp: 100 },
    enemies: {
        zumbi: { speed: 0.8, hp: 30, xp: 10 },
        morcego: { speed: 3.0, hp: 15, xp: 20 },
        esqueleto: { speed: 1.0, hp: 20, xp: 30, fireRate: 240 }
    },
    settings: { invincibilityFrames: 30 }
};

// Gerenciador de Imagens 
const ASSETS = {
    background: new Image(),
    player: new Image(),
    bat: new Image(),
    zombie: new Image(),   
    skeleton: new Image(), 
    loaded: false
};

const GAME_STATE = {
    running: false, paused: false, startTime: 0, enemiesKilled: 0,
    player: null, enemies: [], pickups: [], particles: [], enemyProjectiles: [], keys: {},
    director: { nextSpawn: 0, nextHorde: 0, nextSwarm: 0 }
};

// ==========================================
// 2. INICIALIZAÇÃO
// ==========================================

$(document).ready(function() {
    $.ajax({
        type: "GET", url: "dados.xml", dataType: "xml",
        success: function(xml) { parseXML(xml); startGame(); },
        error: function(e) { alert("Erro ao carregar XML."); console.error(e); }
    });
    $(window).on('keydown', e => GAME_STATE.keys[e.key] = true);
    $(window).on('keyup', e => GAME_STATE.keys[e.key] = false);
    $(window).on('resize', () => { CANVAS.width = window.innerWidth; CANVAS.height = window.innerHeight; });
});

function parseXML(xml) {
    const $xml = $(xml);
    
    // Configs Numéricas
    CONFIG.player.speed = parseFloat($xml.find('jogador velocidade').text());
    CONFIG.player.maxHp = parseInt($xml.find('jogador vida_maxima').text());
    CONFIG.enemies.zumbi.speed = parseFloat($xml.find('inimigos zumbi velocidade').text());
    CONFIG.enemies.zumbi.hp = parseInt($xml.find('inimigos zumbi vida').text());
    CONFIG.enemies.morcego.speed = parseFloat($xml.find('inimigos morcego velocidade').text());
    CONFIG.enemies.esqueleto.fireRate = parseInt($xml.find('inimigos esqueleto fire_rate').text());
    CONFIG.settings.invincibilityFrames = parseInt($xml.find('invencibilidade_frames').text());

    // Leitura de ASSETS
    const bg = $xml.find('assets fundo').text();
    const pl = $xml.find('assets jogador').text();
    const bt = $xml.find('assets morcego').text();
    const zb = $xml.find('assets zumbi').text();     // Novo
    const sk = $xml.find('assets esqueleto').text(); // Novo

    if(bg) ASSETS.background.src = bg;
    if(pl) ASSETS.player.src = pl;
    if(bt) ASSETS.bat.src = bt;
    if(zb) ASSETS.zombie.src = zb;     // Carrega Zumbi
    if(sk) ASSETS.skeleton.src = sk;   // Carrega Esqueleto

    ASSETS.background.onload = () => { ASSETS.loaded = true; };
    console.log("Config e Assets carregados.");
}

// ==========================================
// 3. CLASSES DE ENTIDADES
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
        super(CANVAS.width / 2, CANVAS.height / 2, 15, '#0d6efd');
        this.speed = CONFIG.player.speed;
        this.hp = CONFIG.player.maxHp; this.maxHp = CONFIG.player.maxHp;
        this.level = 1; this.xp = 0; this.xpToNextLevel = 50;
        this.invincibleTimer = 0;
        this.weapons = [new MagicWand(this)];
    }
    update() {
        if (this.invincibleTimer > 0) this.invincibleTimer--;
        if (GAME_STATE.keys['ArrowUp'] || GAME_STATE.keys['w']) this.y -= this.speed;
        if (GAME_STATE.keys['ArrowDown'] || GAME_STATE.keys['s']) this.y += this.speed;
        if (GAME_STATE.keys['ArrowLeft'] || GAME_STATE.keys['a']) this.x -= this.speed;
        if (GAME_STATE.keys['ArrowRight'] || GAME_STATE.keys['d']) this.x += this.speed;

        GAME_STATE.enemies.forEach(enemy => {
            const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
            if (dist < this.radius + enemy.radius) {
                const px = this.x - enemy.x, py = this.y - enemy.y;
                const len = Math.hypot(px, py);
                if (len > 0) { this.x += (px/len)*1.5; this.y += (py/len)*1.5; }
            }
        });

        this.x = Math.max(this.radius, Math.min(CANVAS.width - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(CANVAS.height - this.radius, this.y));
        this.weapons.forEach(w => w.update());
    }
draw() {
        // Efeito de piscar (invencível)
        if (this.invincibleTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) CTX.globalAlpha = 0.5;

        if (ASSETS.player.complete && ASSETS.player.naturalHeight !== 0) {
            const ratio = ASSETS.player.naturalWidth / ASSETS.player.naturalHeight;
            const drawHeight = this.radius * 5.0; 
            const drawWidth = drawHeight * ratio;
            CTX.drawImage(
                ASSETS.player, 
                this.x - drawWidth / 2, 
                this.y - drawHeight / 2, 
                drawWidth, 
                drawHeight
            );
        } else {
            super.draw(); // Fallback bola azul
        }

        CTX.globalAlpha = 1.0;
        this.weapons.forEach(w => w.draw && w.draw());
    }
    takeDamage(amount) {
        if (this.invincibleTimer > 0) return;
        this.hp -= amount; this.invincibleTimer = CONFIG.settings.invincibilityFrames;
        updateHUD(); if (this.hp <= 0) gameOver();
    }
    gainXp(amount) {
        this.xp += amount;
        if (this.xp >= this.xpToNextLevel) {
            this.xp -= this.xpToNextLevel; this.level++;
            this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.3);
            levelUpTrigger();
        } updateHUD();
    }
    addOrUpgradeWeapon(Cls) { const ex = this.weapons.find(w => w instanceof Cls); if(ex) ex.upgrade(); else this.weapons.push(new Cls(this)); }
}

class Zombie extends Entity {
    constructor(x, y) {
        super(x, y, 12, '#198754');
        this.speed = CONFIG.enemies.zumbi.speed + Math.random() * 0.2;
        this.hp = CONFIG.enemies.zumbi.hp;
        this.xpValue = CONFIG.enemies.zumbi.xp;
    }
    update() { simplePursuit(this, GAME_STATE.player, 0.5); }
    
    draw() {
        if (ASSETS.zombie.complete && ASSETS.zombie.naturalHeight !== 0) {
            
            const size = this.radius * 6; 
            CTX.drawImage(ASSETS.zombie, this.x - size/2, this.y - size/2, size, size);
        } else {
            super.draw();
        }
    }

    takeDamage(dmg) { this.hp -= dmg; if(this.hp <= 0) die(this); }
}

class Bat extends Entity {
    constructor(x, y, angle) {
        super(x, y, 10, '#6610f2');
        this.speed = CONFIG.enemies.morcego.speed;
        this.hp = CONFIG.enemies.morcego.hp;
        this.xpValue = CONFIG.enemies.morcego.xp;
        this.vx = Math.cos(angle) * this.speed; this.vy = Math.sin(angle) * this.speed;
        this.angle = angle;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if(outOfBounds(this)) this.markedForDeletion = true;
        checkPlayerCollision(this, 10);
    }
    draw() {
        if (ASSETS.bat.complete && ASSETS.bat.naturalHeight !== 0) {
            CTX.save(); CTX.translate(this.x, this.y); CTX.rotate(this.angle);
            
            const size = this.radius * 5.5; 
            CTX.drawImage(ASSETS.bat, -size/2, -size/2, size, size);
            CTX.restore();
        } else { super.draw(); }
    }
    takeDamage(dmg) { this.hp -= dmg; if(this.hp <= 0) die(this); }
}

class Skeleton extends Entity {
    constructor(x, y) {
        super(x, y, 14, '#adb5bd');
        this.speed = CONFIG.enemies.esqueleto.speed;
        this.hp = CONFIG.enemies.esqueleto.hp;
        this.xpValue = CONFIG.enemies.esqueleto.xp;
        this.range = 250; this.shootTimer = 0; this.shootInterval = CONFIG.enemies.esqueleto.fireRate;
    }
    update() {
        const p = GAME_STATE.player;
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        if (dist > this.range) { this.x += ((p.x-this.x)/dist)*this.speed; this.y += ((p.y-this.y)/dist)*this.speed; }
        else if (dist < this.range - 50) { this.x -= ((p.x-this.x)/dist)*(this.speed*0.5); this.y -= ((p.y-this.y)/dist)*(this.speed*0.5); }

        if (this.shootTimer <= 0) { GAME_STATE.enemyProjectiles.push(new BoneProjectile(this.x, this.y, p)); this.shootTimer = this.shootInterval; }
        else this.shootTimer--;
        checkPlayerCollision(this, 5);
    }

    draw() {
        if (ASSETS.skeleton.complete && ASSETS.skeleton.naturalHeight !== 0) {
            
            const size = this.radius * 6; 
            CTX.drawImage(ASSETS.skeleton, this.x - size/2, this.y - size/2, size, size);
        } else {
            super.draw();
        }
    }

    takeDamage(dmg) { this.hp -= dmg; if(this.hp <= 0) die(this); }
}

// Projéteis e Itens
class BoneProjectile extends Entity {
    constructor(x, y, target) {
        super(x, y, 5, '#fff');
        const angle = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(angle) * 2.5; this.vy = Math.sin(angle) * 2.5;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if(outOfBounds(this)) this.markedForDeletion = true;
        checkPlayerCollision(this, 15, true);
    }
}

class XpGem extends Entity {
    constructor(x, y, value) { super(x, y, 5, '#0dcaf0'); this.value = value; }
    update() {
        const p = GAME_STATE.player;
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        if(dist < 100) { this.x += (p.x - this.x)*0.15; this.y += (p.y - this.y)*0.15; }
        if(dist < p.radius + 10) { p.gainXp(this.value); this.markedForDeletion = true; }
    }
}

class Projectile extends Entity {
    constructor(x, y, angle, damage) {
        super(x, y, 6, '#ffc107');
        this.vx = Math.cos(angle) * 4; this.vy = Math.sin(angle) * 4; this.damage = damage;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if(outOfBounds(this)) this.markedForDeletion = true;
        GAME_STATE.enemies.forEach(e => {
            if(Math.hypot(this.x - e.x, this.y - e.y) < this.radius + e.radius) {
                e.takeDamage(this.damage); this.markedForDeletion = true;
            }
        });
    }
}

class SlashEffect {
    constructor(owner, angle, range) {
        this.owner = owner; this.angle = angle; this.range = range;
        this.life = 10; this.maxLife = 10;
    }
    update() { this.life--; if(this.life <= 0) this.markedForDeletion = true; }
    draw() {
        CTX.save(); CTX.translate(this.owner.x, this.owner.y);
        CTX.beginPath(); CTX.arc(0, 0, this.range, this.angle - Math.PI/4, this.angle + Math.PI/4);
        CTX.strokeStyle = `rgba(255, 255, 255, ${this.life/this.maxLife})`; CTX.lineWidth = 50; CTX.stroke(); CTX.restore();
    }
}

// ==========================================
// 4. ARMAS
// ==========================================
class Weapon { constructor(o){this.owner=o;this.level=1;} update(){} upgrade(){this.level++;} }

class MagicWand extends Weapon {
    constructor(o) { super(o); this.cd=0; this.maxCd=90; this.dmg=12; this.count=1; }
    upgrade(){ super.upgrade(); this.dmg+=5; this.count++; }
    update() {
        if(this.cd <= 0) {
            const t = findNearest(this.owner);
            if(t) {
                const angle = Math.atan2(t.y - this.owner.y, t.x - this.owner.x);
                const fwdX=Math.cos(angle), fwdY=Math.sin(angle);
                const rX=Math.cos(angle+Math.PI/2), rY=Math.sin(angle+Math.PI/2);
                for(let i=0; i<this.count; i++) {
                    let sx=this.owner.x, sy=this.owner.y;
                    if(i>0) {
                        const row=Math.floor((i+1)/2), side=(i%2===1)?1:-1;
                        sx -= fwdX*(row*12); sy -= fwdY*(row*12);
                        sx += rX*(row*12*side); sy += rY*(row*12*side);
                    }
                    GAME_STATE.particles.push(new Projectile(sx, sy, angle, this.dmg));
                }
                this.cd = this.maxCd;
            }
        } else this.cd--;
    }
}

class OrbitGuardian extends Weapon {
    constructor(o) { super(o); this.r=80; this.dmg=0.5; }
    upgrade() { super.upgrade(); this.r+=20; this.dmg+=0.2; }
    update() {
        GAME_STATE.enemies.forEach(e => {
            if(Math.hypot(this.owner.x - e.x, this.owner.y - e.y) < this.r + e.radius) e.takeDamage(this.dmg);
        });
    }
    draw() {
        CTX.beginPath(); CTX.arc(this.owner.x, this.owner.y, this.r, 0, Math.PI*2);
        CTX.fillStyle='rgba(13, 202, 240, 0.1)'; CTX.fill();
        CTX.strokeStyle='rgba(13, 202, 240, 0.5)'; CTX.lineWidth=2; CTX.stroke();
    }
}

class ArcSlasher extends Weapon {
    constructor(o) { super(o); this.cd=0; this.maxCd=60; this.dmg=40; this.range=100; this.idx=0; }
    upgrade() { super.upgrade(); this.dmg+=10; this.range+=10; }
    update() {
        if(this.cd<=0) {
            const angles = [];
            if(this.level===1) { angles.push(this.idx===0?0:Math.PI); this.idx=1-this.idx; }
            else if(this.level===2) { angles.push(0, Math.PI); }
            else { angles.push(0, Math.PI, Math.PI/2, -Math.PI/2); }
            angles.forEach(a => {
                GAME_STATE.enemies.forEach(e => {
                    const dx=e.x-this.owner.x, dy=e.y-this.owner.y;
                    if(Math.hypot(dx,dy) < this.range) {
                        let diff = Math.atan2(dy,dx) - a;
                        while(diff > Math.PI) diff -= 2*Math.PI; while(diff < -Math.PI) diff += 2*Math.PI;
                        if(Math.abs(diff) < Math.PI/3) e.takeDamage(this.dmg);
                    }
                });
                GAME_STATE.particles.push(new SlashEffect(this.owner, a, this.range));
            });
            this.cd = this.maxCd;
        } else this.cd--;
    }
}

// ==========================================
// 5. HELPERS
// ==========================================

function startGame() {
    GAME_STATE.player = new Player(); GAME_STATE.running = true; GAME_STATE.startTime = Date.now();
    GAME_STATE.director.nextSpawn = Date.now() + 1000;
    GAME_STATE.director.nextHorde = Date.now() + 10000;
    GAME_STATE.director.nextSwarm = Date.now() + 15000;
    requestAnimationFrame(gameLoop);
}

function spawnDirector() {
    const now = Date.now(), elapsed = (now - GAME_STATE.startTime) / 1000;
    if(now > GAME_STATE.director.nextSpawn) {
        let delay = elapsed>120?200:(elapsed>60?500:(elapsed>30?1000:2000));
        spawnEnemy(null, elapsed); GAME_STATE.director.nextSpawn = now + delay;
    }
    if(now > GAME_STATE.director.nextHorde) {
        let size = elapsed>60?8:(elapsed>30?5:3);
        const cx = Math.random()<0.5?-50:CANVAS.width+50, cy = Math.random()*CANVAS.height;
        for(let i=0; i<size; i++) spawnEnemy({x: cx+(Math.random()-0.5)*80, y: cy+(Math.random()-0.5)*80}, elapsed);
        GAME_STATE.director.nextHorde = now + (elapsed>60?5000:8000);
    }
    if(now > GAME_STATE.director.nextSwarm) {
        if(elapsed > 15) {
            const size = elapsed>60?15:8, side = Math.floor(Math.random()*4);
            let sx, sy, tx, ty;
            if(side===0) { sx=Math.random()*CANVAS.width; sy=-50; tx=sx; ty=CANVAS.height+50; } 
            else if(side===1) { sx=CANVAS.width+50; sy=Math.random()*CANVAS.height; tx=-50; ty=sy; } 
            else if(side===2) { sx=Math.random()*CANVAS.width; sy=CANVAS.height+50; tx=sx; ty=-50; } 
            else { sx=-50; sy=Math.random()*CANVAS.height; tx=CANVAS.width+50; ty=sy; } 
            const angle = Math.atan2(ty-sy, tx-sx);
            for(let i=0; i<size; i++) GAME_STATE.enemies.push(new Bat(sx+(Math.random()-0.5)*100, sy+(Math.random()-0.5)*100, angle));
        } GAME_STATE.director.nextSwarm = now + 12000;
    }
}

function spawnEnemy(pos, elapsed) {
    let x = pos ? pos.x : (Math.random()<0.5?-40:CANVAS.width+40), y = pos ? pos.y : Math.random()*CANVAS.height;
    if(!pos && Math.abs(x)<50) y = Math.random()*CANVAS.height;
    const rnd = Math.random();
    if(elapsed < 30) GAME_STATE.enemies.push(new Zombie(x, y));
    else if(elapsed < 60) {
        if(rnd < 0.2) GAME_STATE.enemies.push(new Bat(x, y, Math.atan2(GAME_STATE.player.y-y, GAME_STATE.player.x-x)));
        else GAME_STATE.enemies.push(new Zombie(x, y));
    } else {
        if(rnd < 0.2) GAME_STATE.enemies.push(new Skeleton(x, y));
        else if(rnd < 0.4) GAME_STATE.enemies.push(new Bat(x, y, Math.atan2(GAME_STATE.player.y-y, GAME_STATE.player.x-x)));
        else GAME_STATE.enemies.push(new Zombie(x, y));
    }
}

function simplePursuit(entity, target, dmg) {
    const dist = Math.hypot(target.x - entity.x, target.y - entity.y);
    GAME_STATE.enemies.forEach(o => { if(o !== entity && Math.hypot(o.x-entity.x, o.y-entity.y) < entity.radius+o.radius) { entity.x+=(entity.x-o.x)*0.05; entity.y+=(entity.y-o.y)*0.05; } });
    entity.x += ((target.x - entity.x)/dist) * entity.speed; entity.y += ((target.y - entity.y)/dist) * entity.speed;
    checkPlayerCollision(entity, dmg);
}
function checkPlayerCollision(entity, dmg, destroyOnHit=false) {
    const p = GAME_STATE.player;
    if(Math.hypot(p.x - entity.x, p.y - entity.y) < entity.radius + p.radius) { p.takeDamage(dmg); if(destroyOnHit) entity.markedForDeletion = true; }
}
function outOfBounds(e) { return e.x < -200 || e.x > CANVAS.width+200 || e.y < -200 || e.y > CANVAS.height+200; }
function die(e) { e.markedForDeletion=true; GAME_STATE.enemiesKilled++; GAME_STATE.pickups.push(new XpGem(e.x, e.y, e.xpValue)); updateHUD(); }
function findNearest(p) { let t=null, d=Infinity; GAME_STATE.enemies.forEach(e => { const dist=Math.hypot(p.x-e.x, p.y-e.y); if(dist<d){d=dist;t=e;} }); return t; }

// UI
function updateHUD() {
    const p = GAME_STATE.player;
    $('#hp-bar').css('width', Math.max(0,(p.hp/p.maxHp)*100)+'%').text(p.hp + '/' + p.maxHp);
    $('#xp-bar').css('width', (p.xp/p.xpToNextLevel*100)+'%');
    $('#kill-count').text(GAME_STATE.enemiesKilled);
    $('#level-display').text(p.level);
    const el = Math.floor((Date.now()-GAME_STATE.startTime)/1000);
    $('#timer').text( Math.floor(el/60).toString().padStart(2,'0') + ':' + (el%60).toString().padStart(2,'0') );
}

const UPGRADES = [
    { type:'w', cls:MagicWand, t:"Varinha Mágica", d:"Tiros em pirâmide. +1 Projétil." },
    { type:'w', cls:OrbitGuardian, t:"Aura Sagrada", d:"Dano em área. +Raio/Dano." },
    { type:'w', cls:ArcSlasher, t:"Lâmina Arcana", d:"Ataque lateral. +Direção." },
    { type:'h', t:"Poção de Vida", d:"Recupera 50% HP." },
    { type:'s', t:"Botas de Hermes", d:"+0.5 Velocidade." }
];

function levelUpTrigger() {
    GAME_STATE.paused = true;
    const $container = $('#cards-container').empty();
    $('#custom-modal').css('display', 'flex'); 
    for(let i=0; i<3; i++) {
        const u = UPGRADES[Math.floor(Math.random()*UPGRADES.length)];
        let extra = "";
        if(u.type === 'w') { const has = GAME_STATE.player.weapons.find(w => w instanceof u.cls); extra = has ? ` <span class="badge bg-success">NV ${has.level+1}</span>` : ` <span class="badge bg-warning text-dark">NOVA</span>`; }
        const col = $('<div>').addClass('col-md-4');
        const card = $('<div>').addClass('card bg-dark text-white border-secondary upgrade-card h-100');
        const body = $('<div>').addClass('card-body');
        body.append(`<h5 class="card-title text-info">${u.t}${extra}</h5><p class="card-text text-light small">${u.d}</p>`);
        card.append(body).click(() => {
            if(u.type==='w') GAME_STATE.player.addOrUpgradeWeapon(u.cls);
            else if(u.type==='h') GAME_STATE.player.hp = Math.min(GAME_STATE.player.maxHp, GAME_STATE.player.hp+50);
            else if(u.type==='s') GAME_STATE.player.speed += 0.5;
            updateHUD(); $('#custom-modal').hide(); GAME_STATE.paused = false;
        });
        col.append(card); $container.append(col);
    }
}

function gameOver() { GAME_STATE.running = false; alert("FIM DE JOGO! Tempo: " + $('#timer').text()); location.reload(); }

function gameLoop() {
    requestAnimationFrame(gameLoop);
    if(!GAME_STATE.running || GAME_STATE.paused) return;
    spawnDirector();
    
    // Background
    if (ASSETS.background.complete && ASSETS.background.naturalHeight !== 0) {
        const pattern = CTX.createPattern(ASSETS.background, 'repeat');
        CTX.fillStyle = pattern; CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);
    } else { CTX.fillStyle = '#111'; CTX.fillRect(0, 0, CANVAS.width, CANVAS.height); }

    [GAME_STATE.pickups, GAME_STATE.enemyProjectiles, GAME_STATE.particles].forEach(list => { list.forEach((e, i) => { e.update(); if(e.draw) e.draw(); if(e.markedForDeletion) list.splice(i, 1); }); });
    GAME_STATE.player.update(); GAME_STATE.player.draw();
    GAME_STATE.enemies.forEach((e, i) => { e.update(); e.draw(); if(e.markedForDeletion) GAME_STATE.enemies.splice(i, 1); });
}