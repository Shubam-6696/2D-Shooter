const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Assets ---
const imgHero = document.getElementById('img-hero');
const imgDino = document.getElementById('img-dino');
const imgBg = document.getElementById('img-bg');
const imgBeam = document.getElementById('img-beam');

// --- Game State ---
let gameRunning = false; // Start false for menu
let gameResult = "";
let isRoundTransition = false;
let isPaused = false;
let pausedTime = 0; // Track how long we've been paused

// --- Round & Level System ---
let currentLevel = 1;
const maxLevels = 5;
let unlockedLevels = parseInt(localStorage.getItem('unlockedLevels')) || 1;
let currentRound = 1;
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

    // Pause toggle with Escape
    if (e.code === 'Escape' && gameRunning && !isRoundTransition) {
        togglePause();
    }

    // Restart (Only if game over and NOT in menu)
    const menuEl = document.getElementById('main-menu');
    if (!gameRunning && !isRoundTransition && e.code === 'Space') {
        // If menu is hidden (game over screen is active)
        if (menuEl.style.display === 'none') {
            if (gameResult === "VICTORY") {
                 // Victory (Level or Game) -> Return to Menu
                 showMainMenu();
            } else {
                // Game Over -> Restart Level
                resetGame();
            }
        }
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
    constructor(initialY = null) {
        // Position hero on the left side of the stone floor, synced with background
        // Floor is at y=355 (stone platform top in background)
        const hearts = getHeroHearts(); // Dynamic hearts based on level
        const minY = 120;
        const maxY = 291;
        const randomY = initialY !== null ? initialY : minY + Math.random() * (maxY - minY);
        super(150, randomY, 64, 64, 3.5, hearts, imgHero);
        this.canShoot = true;
        this.shootCooldown = 0; // Add cooldown timer
        this.minY = 120; // Upper boundary for movement
        this.maxY = 291; // Floor position (355 - 64 height)
        this.shootingAnimation = 0; // Animation timer for shooting pose
        this.beamsRemaining = getBeamsForLevel(); // Dynamic bullets based on level
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
    constructor(initialX = null, initialY = null) {
        // Position dino on the right side, with random movement
        // HP varies by level: L1-L2: 7, L3: 6, L4-L5: 5
        const dinoHp = getDinoHearts();
        const minX = 450;
        const maxX = 700;
        const minY = 120;
        const maxY = 275;
        const randomX = initialX !== null ? initialX : minX + Math.random() * (maxX - minX);
        const randomY = initialY !== null ? initialY : minY + Math.random() * (maxY - minY);
        super(randomX, randomY, 80, 80, 2.5, dinoHp, imgDino);
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
            // Randomize velocities for both axes (balanced speed)
            this.vx = (Math.random() - 0.5) * 4.8; // -2.4 to +2.4 (2.4x original)
            this.vy = (Math.random() - 0.5) * 6.25; // -3.125 to +3.125 (2.5x original)
            
            this.directionChangeTimer = 0;
            this.nextDirectionChange = 60 + Math.random() * 120; // Random 1-3 seconds
        }
        
        // Apply movement in both axes
        this.x += this.vx;
        this.y += this.vy;
        
        // Boundary checks with bounce for Y-axis
        if (this.y <= this.minY) {
            this.y = this.minY;
            this.vy = Math.abs(this.vy); // Bounce down
        } else if (this.y >= this.maxY) {
            this.y = this.maxY;
            this.vy = -Math.abs(this.vy); // Bounce up
        }
        
        // Boundary checks with bounce for X-axis
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

function getMaxRoundsForLevel() {
    // Level 1: 3 rounds, Level 2: 3 rounds, Level 3: 4 rounds, Level 4-5: 5 rounds
    if (currentLevel === 1 || currentLevel === 2) return 3;
    if (currentLevel === 3) return 4;
    return 5; // Levels 4 and 5
}

function getHeroHearts() {
    // Level 1: 5, Level 2: 4, Level 3: 3, Level 4: 2, Level 5: 2
    if (currentLevel === 5) return 2;
    return Math.max(1, 6 - currentLevel);
}

function getDinoHearts() {
    // Level 1-2: 7, Level 3: 6, Level 4-5: 5
    if (currentLevel === 1 || currentLevel === 2) return 7;
    if (currentLevel === 3) return 6;
    return 5; // Level 4 and 5
}

function getBeamsForLevel() {
    // Level 1-2: 12, Level 3: 8, Level 4-5: 5
    if (currentLevel === 1 || currentLevel === 2) return 12;
    if (currentLevel === 3) return 8;
    return 5; // Level 4 and 5
}

function togglePause() {
    if (!gameRunning || isRoundTransition) return;
    
    isPaused = !isPaused;
    const pauseScreen = document.getElementById('pause-screen');
    
    if (isPaused) {
        // Pausing - save current time
        pausedTime = Date.now();
        pauseScreen.classList.remove('hidden');
        log("Game Paused");
    } else {
        // Resuming - adjust timer
        const pauseDuration = Date.now() - pausedTime;
        roundTimer += pauseDuration; // Extend timer by pause duration
        pauseScreen.classList.add('hidden');
        log("Game Resumed");
    }
}

function resetGame() {
    currentRound = 1;
    startRound();
    document.getElementById('game-over-screen').classList.add('hidden');
    log("Game/Level Reset. Starting Level " + currentLevel + " Round 1");
}

function showMainMenu() {
    gameRunning = false;
    document.getElementById('gameCanvas').style.display = 'none'; // Optional: hide canvas? kept for bg
    document.getElementById('ui-layer').style.display = 'none';
    document.getElementById('game-over-screen').classList.add('hidden');
    document.querySelector('.controls-hint').style.display = 'none'; // Hide hint on menu
    
    // Hide touch controls on menu
    const touchControls = document.querySelector('.touch-controls');
    const pauseBtn = document.querySelector('.pause-corner-btn');
    if (touchControls) touchControls.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    
    const menu = document.getElementById('main-menu');
    menu.style.display = 'flex';
    
    // Update buttons
    document.querySelectorAll('.level-btn').forEach(btn => {
        const lvl = parseInt(btn.dataset.level);
        if (lvl <= unlockedLevels) {
            btn.classList.remove('locked');
            btn.onclick = () => startLevel(lvl);
        } else {
            btn.classList.add('locked');
            btn.onclick = null;
        }
    });
}

function startLevel(lvl) {
    currentLevel = lvl;
    currentRound = 1;
    
    // Hide Menu
    document.getElementById('main-menu').style.display = 'none';
    
    // UI Elements
    const instrScreen = document.getElementById('instructions-screen');
    const cntDown = document.getElementById('instruction-countdown');
    const uiLayer = document.getElementById('ui-layer');
    const canvas = document.getElementById('gameCanvas');
    const hint = document.querySelector('.controls-hint'); // Bottom hint
    
    // Hide Game UI initially
    uiLayer.style.display = 'none';
    canvas.style.display = 'none';
    if(hint) hint.style.display = 'none';
    
    // Show Instructions Screen
    if (instrScreen) {
        instrScreen.classList.remove('hidden');
        instrScreen.style.display = 'flex';
        
        let count = 6;
        if(cntDown) cntDown.textContent = "Game starts in " + count + "...";
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                if(cntDown) cntDown.textContent = "Game starts in " + count + "...";
            } else {
                clearInterval(interval);
                startGameplay();
            }
        }, 1000);

        // Skip Button Logic
        const skipBtn = document.getElementById('skip-instr-btn');
        if (skipBtn) {
            skipBtn.onclick = () => {
                clearInterval(interval); // Stop the timer
                startGameplay(); // Start immediately
            };
        }
    } else {
        // Fallback if screen missing
        startGameplay();
    }
    
    function startGameplay() {
        // Hide Instructions
        if (instrScreen) {
            instrScreen.classList.add('hidden');
            instrScreen.style.display = 'none';
        }
        
        // Show Game Elements
        uiLayer.style.display = 'flex';
        canvas.style.display = 'block';
        if(hint) hint.style.display = 'block';
        
        // Show touch controls in game
        const touchControls = document.querySelector('.touch-controls');
        const pauseBtn = document.querySelector('.pause-corner-btn');
        if (touchControls) touchControls.style.display = ''; 
        if (pauseBtn) pauseBtn.style.display = '';
        
        resetGame();
    }
}

// Reset Progress Listener
document.getElementById('reset-progress-btn').addEventListener('click', () => {
    if(confirm("Reset all progress?")) {
        localStorage.removeItem('unlockedLevels');
        unlockedLevels = 1;
        showMainMenu();
    }
});

// Pause button listeners
document.getElementById('resume-btn').addEventListener('click', () => {
    togglePause();
});

document.getElementById('quit-btn').addEventListener('click', () => {
    if(confirm("Quit to menu? (Progress in this level will be lost)")) {
        isPaused = false;
        document.getElementById('pause-screen').classList.add('hidden');
        showMainMenu();
    }
});

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
    // Timer based on level: L1-L3: 18s, L4: 25s, L5: 30s (decreases by 3s each round)
    let baseTime;
    if (currentLevel <= 3) {
        baseTime = 18;
    } else if (currentLevel === 4) {
        baseTime = 25;
    } else {
        baseTime = 30; // Level 5
    }
    roundTimeLimit = Math.max(10, baseTime - (currentRound - 1) * 3);
    roundTimer = Date.now() + roundTimeLimit * 1000;
    
    updateUI();
    log("Starting Round " + currentRound + " - Timer: " + roundTimeLimit + "s");
    
    // SAFE START: Enable game running ONLY after everything is ready
    gameRunning = true;
}

function nextRound() {
    currentRound++;
    const maxRoundsForLevel = getMaxRoundsForLevel();
    if (currentRound > maxRoundsForLevel) {
        completeLevel();
    } else {
        // Show round transition
        showRoundTransition();
    }
}

function completeLevel() {
    gameRunning = false;
    gameResult = "VICTORY";
    
    if (currentLevel < maxLevels) {
        // Unlock next
        if (currentLevel >= unlockedLevels) {
            unlockedLevels = currentLevel + 1;
            localStorage.setItem('unlockedLevels', unlockedLevels);
        }
        endGame("LEVEL COMPLETE", "Level " + (currentLevel + 1) + " Unlocked!");
        
        // Auto-return to menu after 3 seconds
        setTimeout(() => {
            showMainMenu();
        }, 3000);
    } else {
        endGame("VICTORY", "ALL LEVELS COMPLETED!");
        
        // Auto-return to menu after 3 seconds
        setTimeout(() => {
            showMainMenu();
        }, 3000);
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
    // Round 1: 1.0, Round 2: 1.2
    // Level scaling: Level 1 starts at 1.0, Level 2 starts at 1.5, etc.
    const levelBase = 1 + (currentLevel - 1) * 0.5;
    const roundAdd = (currentRound - 1) * 0.2;
    return levelBase + roundAdd;
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
    const maxRoundsForLevel = getMaxRoundsForLevel();
    if (roundEl) roundEl.textContent = 'LVL ' + currentLevel + ' - ROUND ' + Math.min(currentRound, maxRoundsForLevel) + '/' + maxRoundsForLevel;
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

    if (gameRunning && !isPaused) {
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
    // Initially hide UI layer until game starts
    // Need to add ID to ui-layer in HTML first? Or selecting by class works?
    // Let's assume user added id="ui-layer" or we select by class. 
    // Best to select by class and set ID or just use class.
    // Wait, let's fix the selector in showMainMenu.
    
    const ui = document.querySelector('.ui-layer');
    if(ui) ui.id = 'ui-layer'; // Ensure ID exists for easy toggling
    
    showMainMenu();
    animate();
    
    // Touch Controls Logic
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnShoot = document.getElementById('btn-shoot');
    
    const handleTouch = (btn, key, isPressed) => {
        if (!btn) return;
        
        const updateKey = (pressed) => {
            if (key === 'ArrowUp') keys.ArrowUp = pressed;
            if (key === 'ArrowDown') keys.ArrowDown = pressed;
            if (key === 'Space') {
                if (pressed) {
                    keys.Space = true;
                } else {
                    keys.Space = false;
                    player.canShoot = true; // heavy trigger reset
                }
            }
            
            // Visual feedback
            if (pressed) btn.classList.add('active');
            else btn.classList.remove('active');
        };

        // Add both mouse and touch events
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); updateKey(true); });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); updateKey(false); });
        btn.addEventListener('mouseleave', (e) => { updateKey(false); });
        
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); updateKey(true); }, {passive: false});
        btn.addEventListener('touchend', (e) => { e.preventDefault(); updateKey(false); }, {passive: false});
    };

    handleTouch(btnUp, 'ArrowUp');
    handleTouch(btnDown, 'ArrowDown');
    handleTouch(btnShoot, 'Space');
    
    // Pause button touch logic
    const btnPauseTouch = document.getElementById('btn-pause-touch');
    if (btnPauseTouch) {
        // Use click/touchend to toggle
        const toggleHandler = (e) => {
            e.preventDefault();
            togglePause();
            // Visual feedback
            btnPauseTouch.classList.add('active');
            setTimeout(() => btnPauseTouch.classList.remove('active'), 100);
        };
        btnPauseTouch.addEventListener('touchstart', toggleHandler, {passive: false});
        btnPauseTouch.addEventListener('mousedown', toggleHandler);
    }
};
