const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Assets ---
const imgHero = document.getElementById('img-hero');
const imgDino = document.getElementById('img-dino');
const imgBg = document.getElementById('img-bg');
const imgBeam = document.getElementById('img-beam');

// --- Game State ---
let gameRunning = true;
let gameResult = "";
let isRoundTransition = false;

// --- Round System ---
let currentRound = 1;
const maxRounds = 5;
let roundTimeLimit = 25; // Starting time in seconds (decreases each round)
let roundTimer = 0; // Timer in frames (60fps)
let lastTimestamp = 0;

// --- Input Handling ---
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') keys.Space = true;
    if (e.code === 'ArrowUp') keys.ArrowUp = true;
    if (e.code === 'ArrowDown') keys.ArrowDown = true;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight') keys.ArrowRight = true;

    // Restart
    if (!gameRunning && !isRoundTransition && e.code === 'Space') {
        resetGame();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        keys.Space = false;
        player.canShoot = true; // reset trigger
    }
    if (e.code === 'ArrowUp') keys.ArrowUp = false;
    if (e.code === 'ArrowDown') keys.ArrowDown = false;
    if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight') keys.ArrowRight = false;
});

// --- Entities ---
class Entity {
    constructor(x, y, width, height, speed, hp, img) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.hp = hp;
        this.maxHp = hp;
        this.img = img;
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
    }

    draw() {
        // Draw character image only (no shadow/background)
        const isValidBox = (this.img instanceof HTMLCanvasElement) ? (this.img.width > 0) : (this.img && this.img.complete && this.img.naturalWidth > 0);
        
        if (isValidBox) {
            try {
                ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
            } catch (e) {
                console.error("Error drawing image:", e);
                // Fallback
                ctx.fillStyle = 'red';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        } else {
            // Image not ready or broken
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Player extends Entity {
    constructor() {
        // Position hero on the left side of the stone floor, synced with background
        // Floor is at y=355 (stone platform top in background)
        super(150, 291, 64, 64, 3.5, 3, imgHero); // 3 hearts for player
        this.canShoot = true;
        this.shootCooldown = 0; // Add cooldown timer
        this.minY = 120; // Upper boundary for movement
        this.maxY = 291; // Floor position (355 - 64 height)
        this.shootingAnimation = 0; // Animation timer for shooting pose
        this.beamsRemaining = 8; // Limited to 8 beams
    }

    update() {
        // Vertical Move only (manual control, no horizontal movement)
        if (keys.ArrowUp) this.vy = -this.speed;
        else if (keys.ArrowDown) this.vy = this.speed;
        else this.vy = 0;

        // Apply vertical movement only
        this.y += this.vy;

        // Vertical bounds
        if (this.y < this.minY) this.y = this.minY;
        if (this.y > this.maxY) this.y = this.maxY;

        // Shooting with cooldown
        if (this.shootCooldown > 0) {
            this.shootCooldown--;
        }
        
        // Decrease shooting animation timer
        if (this.shootingAnimation > 0) {
            this.shootingAnimation--;
        }
        
        if (keys.Space && this.canShoot && this.shootCooldown === 0 && this.beamsRemaining > 0) {
            projectiles.push(new Projectile(this.x + this.width, this.y + 24, 10, true)); // Adjusted for larger sprite
            this.canShoot = false;
            this.shootCooldown = 30; // 30 frames cooldown (~0.5 seconds at 60fps)
            this.shootingAnimation = 5; // Show shooting pose for 5 frames
            this.beamsRemaining--; // Use up a beam
        }
    }

    draw() {
        ctx.save();
        
        // Add shooting recoil effect - slight backward tilt
        if (this.shootingAnimation > 0) {
            ctx.translate(this.x + this.width/2, this.y + this.height/2);
            ctx.rotate(-0.1); // Slight tilt back
            ctx.translate(-(this.x + this.width/2), -(this.y + this.height/2));
            
            // Draw muzzle flash
            ctx.fillStyle = '#ffff00';
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(this.x + this.width, this.y + 28, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // Draw hero image only (no shadow/background)
        const isValidBox = (this.img instanceof HTMLCanvasElement) ? (this.img.width > 0) : (this.img && this.img.complete && this.img.naturalWidth > 0);

        if (isValidBox) {
            try {
                ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
            } catch (e) {
                console.error("Error drawing hero:", e);
                ctx.fillStyle = 'blue';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        ctx.restore();
    }
}

class Enemy extends Entity {
    constructor() {
        // Position dino on the right side, with random movement
        super(650, 200, 80, 80, 2.5, 5, imgDino);
        this.shootTimer = 0;
        this.vx = 0; // Horizontal velocity
        this.vy = 1.5; // Vertical velocity
        this.minY = 120; // Upper boundary
        this.maxY = 275; // Lower boundary (floor 355 - 80 height)
        this.minX = 450; // Left boundary
        this.maxX = 700; // Right boundary
        this.directionChangeTimer = 0;
        this.nextDirectionChange = 60 + Math.random() * 120; // Random 1-3 seconds
    }

    update(target) {
        // Random direction change timer
        this.directionChangeTimer++;
        if (this.directionChangeTimer >= this.nextDirectionChange) {
            // Randomize velocities (slower movement)
            this.vx = (Math.random() - 0.5) * 2; // -1 to +1
            this.vy = (Math.random() - 0.5) * 2.5; // -1.25 to +1.25
            this.directionChangeTimer = 0;
            this.nextDirectionChange = 60 + Math.random() * 120;
        }
        
        // Apply movement
        this.x += this.vx;
        this.y += this.vy;
        
        // Boundary checks with bounce
        if (this.y <= this.minY) {
            this.y = this.minY;
            this.vy = Math.abs(this.vy); // Bounce down
        } else if (this.y >= this.maxY) {
            this.y = this.maxY;
            this.vy = -Math.abs(this.vy); // Bounce up
        }
        
        if (this.x <= this.minX) {
            this.x = this.minX;
            this.vx = Math.abs(this.vx); // Bounce right
        } else if (this.x >= this.maxX) {
            this.x = this.maxX;
            this.vx = -Math.abs(this.vx); // Bounce left
        }

        // Shoot logic - fire from dino's mouth toward player
        this.shootTimer++;
        if (this.shootTimer > 150) { // Fire every ~2.5 seconds
            // Beam spawns from dino's mouth (left side of dino, near top)
            const beamStartX = this.x;
            const beamStartY = this.y + 20; // Mouth area of dino
            
            // Calculate direction toward player
            const targetX = target.x + target.width / 2;
            const targetY = target.y + target.height / 2;
            const dx = targetX - beamStartX;
            const dy = targetY - beamStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Normalize and apply speed
            const speed = 8;
            const velX = (dx / distance) * speed;
            const velY = (dy / distance) * speed;
            
            projectiles.push(new Projectile(beamStartX, beamStartY, velX, false, velY));
            this.shootTimer = 0;
        }
    }
}

class Projectile {
    constructor(x, y, vx, isPlayer, vy = 0) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 10;
        this.vx = vx;
        this.vy = vy; // Vertical velocity for diagonal shots
        this.isPlayer = isPlayer;
        this.markedForDeletion = false;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy; // Apply vertical movement
        if (this.x < -50 || this.x > canvas.width + 50 || this.y < -50 || this.y > canvas.height + 50) {
            this.markedForDeletion = true;
        }
    }

    draw() {
        ctx.save();
        if (!this.isPlayer) {
            ctx.filter = 'hue-rotate(180deg)';
        }
        if (imgBeam && imgBeam.complete && imgBeam.naturalWidth > 0) {
            try {
                ctx.drawImage(imgBeam, this.x, this.y, this.width, this.height);
            } catch (e) {
                ctx.fillStyle = this.isPlayer ? 'yellow' : 'purple';
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.fillStyle = this.isPlayer ? 'yellow' : 'purple';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        ctx.restore();
    }
}

// --- Init ---
let player = new Player();
let dino = new Enemy();
let projectiles = [];

// Debug Logger
window.gameLogs = [];
function log(msg) {
    if (window.gameLogs.length < 50) window.gameLogs.push(msg);
    console.log(msg);
}

function resetGame() {
    currentRound = 1;
    startRound();
    document.getElementById('game-over-screen').classList.add('hidden');
    log("Game Reset. Starting Round 1");
}

// Image Processing Cache
const processedImages = new Map();

function processTransparentImage(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return img;
    if (processedImages.has(img.id)) return processedImages.get(img.id);

    try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctxT = c.getContext('2d');
        ctxT.drawImage(img, 0, 0);
        
        const imageData = ctxT.getImageData(0, 0, w, h);
        const data = imageData.data;
        const tolerance = 50; // Tolerance for Magenta
        
        // Helper to get pixel index
        const getIdx = (x, y) => (y * w + x) * 4;
        
        // Track visited pixels to avoid loops
        const visited = new Uint8Array(w * h); // 0 = unvisited, 1 = visited
        
        // Queue for flood fill (starts at corners)
        const queue = [];
        
        // Add corners as start points
        const corners = [[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]];
        corners.forEach(([x, y]) => {
            const idx = getIdx(x, y);
            queue.push({x, y, r: data[idx], g: data[idx+1], b: data[idx+2]});
            visited[y * w + x] = 1;
        });
        
        while (queue.length > 0) {
            const {x, y, r: r0, g: g0, b: b0} = queue.shift();
            
            // Clear current pixel
            const currentIdx = getIdx(x, y);
            data[currentIdx + 3] = 0; // Alpha 0
            
            // Check neighbors (Up, Down, Left, Right)
            const neighbors = [
                {nx: x, ny: y - 1},
                {nx: x, ny: y + 1},
                {nx: x - 1, ny: y},
                {nx: x + 1, ny: y}
            ];
            
            for (const {nx, ny} of neighbors) {
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const nVisIdx = ny * w + nx;
                    if (visited[nVisIdx] === 0) {
                        const nIdx = getIdx(nx, ny);
                        const r = data[nIdx], g = data[nIdx+1], b = data[nIdx+2];
                        
                        // Check if neighbor is similar to the STARTING corner color (r0, g0, b0)
                        const dist = Math.sqrt((r - r0) ** 2 + (g - g0) ** 2 + (b - b0) ** 2);
                        if (dist < tolerance) {
                            visited[nVisIdx] = 1;
                            queue.push({x: nx, y: ny, r: r0, g: g0, b: b0}); // Propagate original color
                        }
                    }
                }
            }
        }
        
        ctxT.putImageData(imageData, 0, 0);
        processedImages.set(img.id, c);
        return c;
    } catch (e) {
        console.error("Image processing failed:", e);
        return img;
    }
}

function startRound() {
    isRoundTransition = false; // Enable Restart
    
    // Process images to ensure transparency
    const pImg = processTransparentImage(imgHero);
    
    player = new Player();
    // Override image if processed
    if (pImg instanceof HTMLCanvasElement) player.img = pImg;
    
    // Difficulty scaling
    const difficultyMultiplier = getDifficultyMultiplier();
    
    const dImg = processTransparentImage(imgDino);
    dino = new Enemy();
    if (dImg instanceof HTMLCanvasElement) dino.img = dImg;
    
    dino.speed *= difficultyMultiplier;
    dino.shootTimer = -60;
    
    // Increase dino HP for later rounds
    if (currentRound >= 3) {
        dino.hp = 5 + (currentRound - 2); 
        dino.maxHp = dino.hp;
    }
    
    projectiles = [];
    gameRunning = true;
    gameResult = "";
    
    // Timer: 25s for round 1, decreases by 3s each round
    roundTimeLimit = Math.max(10, 25 - (currentRound - 1) * 3);
    roundTimer = Date.now() + roundTimeLimit * 1000;
    
    updateUI();
    log("Starting Round " + currentRound + " - Timer: " + roundTimeLimit + "s");
}

function nextRound() {
    currentRound++;
    if (currentRound > maxRounds) {
        // Player wins the entire game!
        endGame("VICTORY", "ALL ROUNDS COMPLETE!");
    } else {
        // Show round transition
        showRoundTransition();
    }
}

function showRoundTransition() {
    const screen = document.getElementById('game-over-screen');
    const title = document.getElementById('game-result-title');
    const subtitleEl = document.getElementById('game-result-subtitle');
    const restartMsg = document.getElementById('restart-msg');
    
    isRoundTransition = true; // Disable Restart
    
    title.textContent = "ROUND " + currentRound;
    title.style.color = "#f1c40f";
    if (subtitleEl) {
        subtitleEl.textContent = "Get Ready!";
        subtitleEl.style.display = 'block';
    }
    // Hide restart message during auto-transition
    if (restartMsg) restartMsg.style.display = 'none';
    
    screen.classList.remove('hidden');
    
    // Auto-start next round after 2 seconds
    setTimeout(() => {
        screen.classList.add('hidden');
        startRound();
    }, 2000);
}

function getDifficultyMultiplier() {
    // Round 1: 1.0, Round 2: 1.2, Round 3: 1.4, Round 4: 1.6, Round 5: 1.8
    return 1 + (currentRound - 1) * 0.2;
}

function checkCollisions() {
    if (!gameRunning) return;

    projectiles.forEach((p, index) => {
        if (p.markedForDeletion) return;

        // vs Dino
        if (p.isPlayer && rectIntersect(p, dino)) {
            dino.hp -= 1; // Each hit removes 1 HP (dino dies after 5 hits)
            p.markedForDeletion = true;
            log("Hit Dino! Hits remaining: " + dino.hp);
        }
        // vs Player
        if (!p.isPlayer && rectIntersect(p, player)) {
            player.hp -= 1; // Lose 1 heart per hit
            p.markedForDeletion = true;
            log("Hit Player! Hearts: " + player.hp + " by projectile at " + p.x + "," + p.y);
        }
    });

    if (player.hp <= 0) {
        log("Player Died. Final HP: " + player.hp);
        endGame("DEFEAT");
    }
    // Check if player ran out of beams and dino is still alive
    if (player.beamsRemaining <= 0 && dino.hp > 0 && projectiles.filter(p => p.isPlayer).length === 0) {
        log("Player ran out of beams!");
        endGame("DEFEAT", "OUT OF BULLETS!");
    }
    // Check if timer ran out (current time > end time)
    if (Date.now() >= roundTimer && dino.hp > 0) {
        log("Time's up!");
        endGame("DEFEAT", "TIME'S UP!");
    }
    if (dino.hp <= 0 && gameRunning) {
        gameRunning = false; // Stop game immediately to prevent multiple calls
        log("Dino Defeated - Round " + currentRound + " complete!");
        nextRound(); // Progress to next round
    }
}

function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.width ||
        r2.x + r2.width < r1.x ||
        r2.y > r1.y + r1.height ||
        r2.y + r2.height < r1.y);
}

function updateUI() {
    // Update round and timer display
    const roundEl = document.getElementById('round-display');
    const timerEl = document.getElementById('timer-display');
    if (roundEl) roundEl.textContent = 'ROUND ' + Math.min(currentRound, maxRounds) + '/' + maxRounds;
    if (timerEl) {
        // Calculate seconds remaining based on current time
        const secondsLeft = Math.ceil(Math.max(0, (roundTimer - Date.now()) / 1000));
        timerEl.textContent = secondsLeft + 's';
        // Flash red when low on time
        timerEl.style.color = secondsLeft <= 5 ? '#e74c3c' : '#f1c40f';
    }
    
    // Update hero hearts display
    const heartsContainer = document.getElementById('player-hearts');
    let heartsHTML = '';
    for (let i = 0; i < player.maxHp; i++) {
        if (i < player.hp) {
            heartsHTML += '❤️ '; // Full heart
        } else {
            heartsHTML += '🖤 '; // Empty heart
        }
    }
    heartsContainer.innerHTML = heartsHTML;
    
    // Update beams remaining display
    document.getElementById('beams-count').textContent = player.beamsRemaining;
    
    // Update dino HP bar (dynamic based on round)
    const dinoPct = Math.max(0, (dino.hp / dino.maxHp) * 100);
    document.getElementById('boss-hp-bar').style.width = dinoPct + '%';
    document.getElementById('dino-hits').textContent = dino.hp + '/' + dino.maxHp;
}

function endGame(result, subtitle = "") {
    gameRunning = false;
    gameResult = result;
    const screen = document.getElementById('game-over-screen');
    const title = document.getElementById('game-result-title');
    const subtitleEl = document.getElementById('game-result-subtitle');

    title.textContent = result;
    title.style.color = result === "VICTORY" ? "#2ecc71" : "#e74c3c";
    
    // Show subtitle if provided
    if (subtitleEl) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = subtitle ? 'block' : 'none';
    }
    
    // Ensure restart message is visible for actual game over
    const restartMsg = document.getElementById('restart-msg');
    if (restartMsg) restartMsg.style.display = 'block';
    
    screen.classList.remove('hidden');
}

// --- Loop ---
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgBg, 0, 0, canvas.width, canvas.height);

    if (gameRunning) {
        // Timer updated via Date.now() in UI/Logic checks
        
        player.update();
        dino.update(player);
        projectiles.forEach(p => p.update());
        projectiles = projectiles.filter(p => !p.markedForDeletion);
        checkCollisions();
        updateUI();
    }

    player.draw();
    dino.draw();
    projectiles.forEach(p => p.draw());

    requestAnimationFrame(animate);
}

window.onload = () => {
    resetGame();
    animate();
};
