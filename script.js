// Canvas setup
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

/// Adjust canvas to fit the window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Square properties (must be defined before resize listener)
let square = {
  x: canvas.width / 2 - 25,
  y: canvas.height / 2 - 25,
  size: 50,
  speed: 200,
  color: '#ffffff',
};

const player = {
  maxLives: 3,
  lives: 3,
  stunDuration: 1,
  stunRemaining: 0,
  regenDelay: 4,
  regenInterval: 1.5,
  regenProgress: 0,
  lastHitTime: 0,
};

const HEALTH_BAR = {
  height: 5,
  gap: 7,
  tickWidth: 1,
};


window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Update square position to stay within new canvas size
  square.x = Math.min(square.x, canvas.width - square.size);
  square.y = Math.min(square.y, canvas.height - square.size);
});

// Timer variables
let isPaused = false;
let elapsedTime = 0; // Time in seconds
let lastUpdateTime = null; // Tracks the last time the animation was updated

// FPS tracking variables
let fps = 60;
let frameCount = 0;
let lastFpsUpdate = performance.now();
const fpsUpdateInterval = 500; // Update FPS display every 500ms

// Array to store timestamps of key presses
let keyPressTimestamps = [];

// Array to store active pulses
const pulses = [];

// Particle physics (per-frame, frictionless — tuned for slingshot launches)
const physicsDefaults = {
  attractionStrength: 0.3,
  gravitySoftening: 1,
  spawnSpeedScale: 1,
  shatterThreshold: 15,
  bounceStrength: 1.3,
  squareSpeed: 200,
  squareHitLimit: 5,
};

const physics = { ...physicsDefaults };
const MAX_DELTA_TIME = 1 / 30;

function randomInitialVelocity() {
  return (Math.random() - 0.5) * physics.spawnSpeedScale;
}

// Particle class
class Particle {
  constructor(x, y, dx, dy, radius, color, colorKey) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.radius = radius;
    this.color = color;
    this.colorKey = colorKey;
    this.wasColliding = false;
    this.shouldDestroy = false;
    this.squareCollisionTimestamps = [];
  }

  draw() {
    ctx.save();

    const glowColor = this.color;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.shadowBlur = 50;
    ctx.shadowColor = glowColor.replace('1)', '0.7)');
    ctx.fillStyle = glowColor.replace('1)', '0.7)');
    ctx.fill();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius / 2, 0, Math.PI * 2);
    ctx.shadowBlur = 30;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = glowColor;
    ctx.fill();
    ctx.closePath();

    ctx.restore();
  }

  update(allParticles) {
    allParticles.forEach((other) => {
      if (other === this) return;

      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const force = physics.attractionStrength / (distance * distance + physics.gravitySoftening);

      this.dx += force * dx;
      this.dy += force * dy;
    });

    this.x += this.dx;
    this.y += this.dy;

    const velocityMagnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);

    // Boundary conditions: Bounce off walls or shatter if too fast
    if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
      // Check if velocity exceeds threshold
      if (velocityMagnitude > physics.shatterThreshold) {
        // Shatter the particle
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return; // Exit early, particle will be removed
      }
      this.dx = -this.dx; // Reverse horizontal direction
      this.x = Math.min(Math.max(this.x, this.radius), canvas.width - this.radius); // Keep within bounds
    }
    if (this.y - this.radius < 0 || this.y + this.radius > canvas.height) {
      // Check if velocity exceeds threshold
      if (velocityMagnitude > physics.shatterThreshold) {
        // Shatter the particle
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return; // Exit early, particle will be removed
      }
      this.dy = -this.dy; // Reverse vertical direction
      this.y = Math.min(Math.max(this.y, this.radius), canvas.height - this.radius); // Keep within bounds
    }

    // Collision with square (check and handle bounce)
    const collisionHandled = this.checkCollisionWithSquare();
    
    // If particle was destroyed, don't continue processing
    if (this.shouldDestroy) {
      return;
    }
    
    // If collision was handled, correct position to prevent overlap
    if (collisionHandled) {
      const closestX = Math.max(square.x, Math.min(this.x, square.x + square.size));
      const closestY = Math.max(square.y, Math.min(this.y, square.y + square.size));
      const dx = this.x - closestX;
      const dy = this.y - closestY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < this.radius) {
        // Push particle out
        const normalX = dx / distance || 0;
        const normalY = dy / distance || 0;
        const pushDistance = this.radius - distance + 0.5;
        this.x += normalX * pushDistance;
        this.y += normalY * pushDistance;
      }
    }

  }

  checkCollisionWithSquare() {
    // Calculate the closest point on the square to the particle
    const closestX = Math.max(square.x, Math.min(this.x, square.x + square.size));
    const closestY = Math.max(square.y, Math.min(this.y, square.y + square.size));

    // Calculate the distance between the particle and the closest point
    const dx = this.x - closestX;
    const dy = this.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check for collision
    const isColliding = distance < this.radius;
    
    // Only apply bounce physics on first collision (when transitioning from not colliding to colliding)
    if (isColliding && !this.wasColliding) {
      // New collision detected (particle just touched the square)
      const currentTime = performance.now();
      
      // Record collision timestamp
      this.squareCollisionTimestamps.push(currentTime);
      
      // Remove timestamps older than 1 second (1000ms)
      const oneSecondAgo = currentTime - 1000;
      this.squareCollisionTimestamps = this.squareCollisionTimestamps.filter(
        timestamp => timestamp >= oneSecondAgo
      );
      
      // Check if particle has collided more than 5 times in the last second
      if (this.squareCollisionTimestamps.length > physics.squareHitLimit) {
        // Destroy the particle with explosion
        createExplosionEffect(this.x, this.y, this.color);
        this.shouldDestroy = true;
        return true; // Collision handled - particle destroyed
      }
      
      collisionCount++;
      updateCollisionCounter();
      createPulseEffect(this.x, this.y);
      damagePlayer();

      // Calculate collision normal (direction from square to particle)
      let normalX, normalY;
      
      // Determine which edge/corner was hit
      const squareLeft = square.x;
      const squareRight = square.x + square.size;
      const squareTop = square.y;
      const squareBottom = square.y + square.size;
      
      // Check if particle hit a corner (using distance from corners)
      const distToTopLeft = Math.sqrt((this.x - squareLeft) ** 2 + (this.y - squareTop) ** 2);
      const distToTopRight = Math.sqrt((this.x - squareRight) ** 2 + (this.y - squareTop) ** 2);
      const distToBottomLeft = Math.sqrt((this.x - squareLeft) ** 2 + (this.y - squareBottom) ** 2);
      const distToBottomRight = Math.sqrt((this.x - squareRight) ** 2 + (this.y - squareBottom) ** 2);
      const minCornerDist = Math.min(distToTopLeft, distToTopRight, distToBottomLeft, distToBottomRight);
      
      // If very close to a corner, use corner normal
      if (minCornerDist < this.radius * 1.5) {
        // Corner collision - normal points from corner to particle center
        normalX = dx / distance;
        normalY = dy / distance;
      } else {
        // Edge collision - determine which edge based on closest point
        const distToLeft = Math.abs(this.x - squareLeft);
        const distToRight = Math.abs(this.x - squareRight);
        const distToTop = Math.abs(this.y - squareTop);
        const distToBottom = Math.abs(this.y - squareBottom);
        
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        
        if (minDist === distToLeft) {
          normalX = -1;
          normalY = 0;
        } else if (minDist === distToRight) {
          normalX = 1;
          normalY = 0;
        } else if (minDist === distToTop) {
          normalX = 0;
          normalY = -1;
        } else {
          normalX = 0;
          normalY = 1;
        }
      }
      
      // Normalize the normal vector
      const normalLength = Math.sqrt(normalX * normalX + normalY * normalY);
      if (normalLength > 0) {
        normalX /= normalLength;
        normalY /= normalLength;
      }
      
      // Calculate dot product of velocity and normal
      const dotProduct = this.dx * normalX + this.dy * normalY;
      
      // Only bounce if moving toward the square
      if (dotProduct < 0) {
        // Reflect velocity vector: v' = v - 2(v·n)n
        const bounceStrength = physics.bounceStrength;
        const reflectedVx = (this.dx - 2 * dotProduct * normalX) * bounceStrength;
        const reflectedVy = (this.dy - 2 * dotProduct * normalY) * bounceStrength;
        
        // Add randomness to the bounce angle (±15 degrees)
        const randomAngle = (Math.random() - 0.5) * Math.PI / 6; // ±15 degrees in radians
        const cosAngle = Math.cos(randomAngle);
        const sinAngle = Math.sin(randomAngle);
        
        // Rotate the reflected velocity vector
        this.dx = reflectedVx * cosAngle - reflectedVy * sinAngle;
        this.dy = reflectedVx * sinAngle + reflectedVy * cosAngle;
      }
      
      return true; // Collision handled
    }
    
    this.wasColliding = isColliding; // Update collision state for next frame
    return false; // No collision handling needed
  }
}

// Pulse class for the expanding circle effect
class Pulse {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.color = 'rgba(255, 255, 255,'; // White color with adjustable opacity
    this.radius = 0;
    this.maxRadius = 50; // Adjust as needed
    this.opacity = 1; // Start fully opaque
    this.finished = false;
    this.filled = false; // Whether to draw as filled circle instead of stroke
  }

  update(deltaTime) {
    // Prevent negative or invalid deltaTime
    if (deltaTime <= 0 || !isFinite(deltaTime)) {
      return;
    }

    // Increase the radius
    this.radius += 200 * deltaTime; // Speed of expansion

    // Fade out
    this.opacity -= 1 * deltaTime; // Fade over 1 second

    // Clamp opacity to valid range
    this.opacity = Math.max(0, this.opacity);

    if (this.radius >= this.maxRadius || this.opacity <= 0) {
      this.finished = true; // Mark pulse as finished
    }
  }

  draw() {
    // Only draw if radius and opacity are valid
    if (this.radius < 0 || this.opacity <= 0 || this.finished) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(0, this.radius), 0, Math.PI * 2);
    
    if (this.filled) {
      // Draw filled circle for explosion effect
      ctx.fillStyle = `${this.color}${this.opacity})`;
      ctx.fill();
    } else {
      // Draw stroked circle for regular pulse
      ctx.strokeStyle = `${this.color}${this.opacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    ctx.closePath();
    ctx.restore();
  }
}

// Function to create a new pulse
function createPulseEffect(x, y) {
  pulses.push(new Pulse(x, y));
}

// Function to create an explosion effect
function createExplosionEffect(x, y, color) {
  // Extract RGB values from rgba color string (format: "rgba(r, g, b, 1)")
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const r = rgbMatch ? parseInt(rgbMatch[1]) : 255;
  const g = rgbMatch ? parseInt(rgbMatch[2]) : 255;
  const b = rgbMatch ? parseInt(rgbMatch[3]) : 255;
  
  // Create bright filled core explosion
  const core = new Pulse(x, y);
  core.color = `rgba(${r}, ${g}, ${b},`;
  core.maxRadius = 60;
  core.opacity = 1;
  core.filled = true;
  pulses.push(core);
  
  // Create multiple expanding colored pulses for explosion effect
  const numPulses = 15;
  for (let i = 0; i < numPulses; i++) {
    const pulse = new Pulse(x, y);
    // Use particle color for explosion
    pulse.color = `rgba(${r}, ${g}, ${b},`;
    pulse.maxRadius = 100 + Math.random() * 40; // Vary sizes between 100-140
    pulse.opacity = 0.9; // Start very bright
    // Add slight random offset for more dynamic explosion
    pulse.x = x + (Math.random() - 0.5) * 10;
    pulse.y = y + (Math.random() - 0.5) * 10;
    pulses.push(pulse);
  }
  
  // Create larger outer rings for impact
  for (let i = 0; i < 5; i++) {
    const ring = new Pulse(x, y);
    ring.color = `rgba(${r}, ${g}, ${b},`;
    ring.maxRadius = 120 + i * 20;
    ring.opacity = 0.6 - i * 0.1;
    pulses.push(ring);
  }
  
  // Create one bright white flash for contrast (subtle)
  const flash = new Pulse(x, y);
  flash.color = 'rgba(255, 255, 255,';
  flash.maxRadius = 80;
  flash.opacity = 0.5; // Reduced opacity so color is more prominent
  flash.filled = true;
  pulses.push(flash);
}

// Particle management
const particles = [];
const colors = {
  Red: 'rgba(220, 140, 140, 1)', // Soft muted red
  Blue: 'rgba(140, 150, 220, 1)', // Soft muted blue
  Lavender: 'rgba(180, 160, 220, 1)', // Soft lavender
  Rose: 'rgba(220, 160, 180, 1)', // Dusty rose
  Sage: 'rgba(160, 200, 160, 1)', // Pale sage green
};
const particleCounts = {
  Red: 10,
  Blue: 10,
  Lavender: 10,
  Rose: 10,
  Sage: 10,
};
const radius = 7; // Particle size

function createParticles() {
  particles.length = 0; // Clear current particles
  Object.keys(particleCounts).forEach((colorKey) => {
    for (let i = 0; i < particleCounts[colorKey]; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const dx = randomInitialVelocity();
      const dy = randomInitialVelocity();
      particles.push(new Particle(x, y, dx, dy, radius, colors[colorKey], colorKey));
    }
  });
}

// Collision tracking
let collisionCount = 0;

// Get counter elements (must be defined before updateParticleCounters is called)
const redCounter = document.getElementById('redCounter');
const blueCounter = document.getElementById('blueCounter');
const lavenderCounter = document.getElementById('lavenderCounter');
const roseCounter = document.getElementById('roseCounter');
const sageCounter = document.getElementById('sageCounter');
const totalParticles = document.getElementById('totalParticles');
const timerDisplay = document.getElementById('timerDisplay');
const collisionCounter = document.getElementById('collisionCounter');
const fpsDisplay = document.getElementById('fpsDisplay');

// Function to update collision counter display
function updateCollisionCounter() {
  collisionCounter.textContent = String(collisionCount);
}

// Function to update particle counters based on actual particles
function updateParticleCounters() {
  // Count actual particles by color
  const actualCounts = {
    Red: 0,
    Blue: 0,
    Lavender: 0,
    Rose: 0,
    Sage: 0
  };
  
  particles.forEach(particle => {
    if (particle.colorKey && actualCounts.hasOwnProperty(particle.colorKey)) {
      actualCounts[particle.colorKey]++;
    }
  });
  
  // Update particleCounts to match actual counts
  particleCounts.Red = actualCounts.Red;
  particleCounts.Blue = actualCounts.Blue;
  particleCounts.Lavender = actualCounts.Lavender;
  particleCounts.Rose = actualCounts.Rose;
  particleCounts.Sage = actualCounts.Sage;
  
  // Update UI displays
  redCounter.textContent = particleCounts.Red;
  blueCounter.textContent = particleCounts.Blue;
  lavenderCounter.textContent = particleCounts.Lavender;
  roseCounter.textContent = particleCounts.Rose;
  sageCounter.textContent = particleCounts.Sage;
  
  // Update sliders to match actual counts (only if sliders are defined)
  if (redSlider && blueSlider && lavenderSlider && roseSlider && sageSlider) {
    redSlider.value = particleCounts.Red;
    blueSlider.value = particleCounts.Blue;
    lavenderSlider.value = particleCounts.Lavender;
    roseSlider.value = particleCounts.Rose;
    sageSlider.value = particleCounts.Sage;
  }
  
  // Calculate and update total
  const total = particleCounts.Red + particleCounts.Blue + particleCounts.Lavender + particleCounts.Rose + particleCounts.Sage;
  totalParticles.textContent = String(total);
}

// Draw the black gradient background
function drawGradientBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'black'); // Black at the top
  gradient.addColorStop(1, '#1a1a1a'); // Slightly lighter shade at the bottom
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Update the timer display in the UI
function updateTimerDisplay() {
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = Math.floor(elapsedTime % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${minutes}:${seconds}`;
}

// Update FPS display in the UI
function updateFpsDisplay(currentTime) {
  frameCount++;
  const timeSinceLastUpdate = currentTime - lastFpsUpdate;
  
  if (timeSinceLastUpdate >= fpsUpdateInterval) {
    fps = Math.round((frameCount * 1000) / timeSinceLastUpdate);
    fpsDisplay.textContent = String(fps);
    frameCount = 0;
    lastFpsUpdate = currentTime;
  }
}

// Dropdown menu controls
const redSlider = document.getElementById('redSlider');
const blueSlider = document.getElementById('blueSlider');
const lavenderSlider = document.getElementById('lavenderSlider');
const roseSlider = document.getElementById('roseSlider');
const sageSlider = document.getElementById('sageSlider');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');

// Initialize particles (after sliders are defined)
createParticles();
updateParticleCounters(); // Initialize counters
updateTimerDisplay(); // Initialize timer display
updateCollisionCounter(); // Initialize collision counter

// Function to add a single particle of a specific color
function addParticle(colorKey) {
  const x = Math.random() * canvas.width;
  const y = Math.random() * canvas.height;
  const dx = randomInitialVelocity();
  const dy = randomInitialVelocity();
  particles.push(new Particle(x, y, dx, dy, radius, colors[colorKey], colorKey));
}

// Update particle counts dynamically by adding/removing particles
function updateParticleCount(color, newCount) {
  const currentCount = particleCounts[color];
  const difference = newCount - currentCount;
  
  if (difference > 0) {
    // Add particles
    for (let i = 0; i < difference; i++) {
      addParticle(color);
    }
  } else if (difference < 0) {
    // Remove particles (remove from the end of the array for this color)
    let removed = 0;
    for (let i = particles.length - 1; i >= 0 && removed < Math.abs(difference); i--) {
      if (particles[i].colorKey === color) {
        particles.splice(i, 1);
        removed++;
      }
    }
  }
  
  // Update the particleCounts to match the new count
  particleCounts[color] = newCount;
}

// Event listeners for sliders
redSlider.addEventListener('input', () => {
  updateParticleCount('Red', parseInt(redSlider.value, 10));
  updateParticleCounters();
});
blueSlider.addEventListener('input', () => {
  updateParticleCount('Blue', parseInt(blueSlider.value, 10));
  updateParticleCounters();
});
lavenderSlider.addEventListener('input', () => {
  updateParticleCount('Lavender', parseInt(lavenderSlider.value, 10));
  updateParticleCounters();
});
roseSlider.addEventListener('input', () => {
  updateParticleCount('Rose', parseInt(roseSlider.value, 10));
  updateParticleCounters();
});
sageSlider.addEventListener('input', () => {
  updateParticleCount('Sage', parseInt(sageSlider.value, 10));
  updateParticleCounters();
});

const gravitySlider = document.getElementById('gravitySlider');
const softeningSlider = document.getElementById('softeningSlider');
const spawnSpeedSlider = document.getElementById('spawnSpeedSlider');
const shatterSlider = document.getElementById('shatterSlider');
const bounceSlider = document.getElementById('bounceSlider');
const squareSpeedSlider = document.getElementById('squareSpeedSlider');
const hitLimitSlider = document.getElementById('hitLimitSlider');
const gravityValue = document.getElementById('gravityValue');
const softeningValue = document.getElementById('softeningValue');
const spawnSpeedValue = document.getElementById('spawnSpeedValue');
const shatterValue = document.getElementById('shatterValue');
const bounceValue = document.getElementById('bounceValue');
const squareSpeedValue = document.getElementById('squareSpeedValue');
const hitLimitValue = document.getElementById('hitLimitValue');
const resetPhysicsButton = document.getElementById('resetPhysicsButton');

function updatePhysicsDisplays() {
  gravityValue.textContent = physics.attractionStrength.toFixed(2);
  softeningValue.textContent = physics.gravitySoftening.toFixed(1);
  spawnSpeedValue.textContent = physics.spawnSpeedScale.toFixed(1);
  shatterValue.textContent = String(physics.shatterThreshold);
  bounceValue.textContent = physics.bounceStrength.toFixed(2);
  squareSpeedValue.textContent = String(physics.squareSpeed);
  hitLimitValue.textContent = String(physics.squareHitLimit);
}

function syncPhysicsSliders() {
  gravitySlider.value = Math.round(physics.attractionStrength * 100);
  softeningSlider.value = Math.round(physics.gravitySoftening * 10);
  spawnSpeedSlider.value = Math.round(physics.spawnSpeedScale * 10);
  shatterSlider.value = physics.shatterThreshold;
  bounceSlider.value = Math.round(physics.bounceStrength * 100);
  squareSpeedSlider.value = physics.squareSpeed;
  hitLimitSlider.value = physics.squareHitLimit;
  updatePhysicsDisplays();
}

gravitySlider.addEventListener('input', () => {
  physics.attractionStrength = parseInt(gravitySlider.value, 10) / 100;
  updatePhysicsDisplays();
});

softeningSlider.addEventListener('input', () => {
  physics.gravitySoftening = parseInt(softeningSlider.value, 10) / 10;
  updatePhysicsDisplays();
});

spawnSpeedSlider.addEventListener('input', () => {
  physics.spawnSpeedScale = parseInt(spawnSpeedSlider.value, 10) / 10;
  updatePhysicsDisplays();
});

shatterSlider.addEventListener('input', () => {
  physics.shatterThreshold = parseInt(shatterSlider.value, 10);
  updatePhysicsDisplays();
});

bounceSlider.addEventListener('input', () => {
  physics.bounceStrength = parseInt(bounceSlider.value, 10) / 100;
  updatePhysicsDisplays();
});

squareSpeedSlider.addEventListener('input', () => {
  physics.squareSpeed = parseInt(squareSpeedSlider.value, 10);
  updatePhysicsDisplays();
});

hitLimitSlider.addEventListener('input', () => {
  physics.squareHitLimit = parseInt(hitLimitSlider.value, 10);
  updatePhysicsDisplays();
});

resetPhysicsButton.addEventListener('click', () => {
  Object.assign(physics, physicsDefaults);
  syncPhysicsSliders();
});

syncPhysicsSliders();

// Function to reset the timer
function resetTimer() {
  elapsedTime = 0; // Reset the timer to 0
  lastUpdateTime = null; // Clear the last update time
}

// Pause/Resume button
pauseButton.addEventListener('click', () => {
  isPaused = !isPaused;
  pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
  if (!isPaused) {
    lastUpdateTime = performance.now(); // Reset last update time
  }
});

// Reset button
resetButton.addEventListener('click', () => {
  redSlider.value = 10;
  blueSlider.value = 10;
  lavenderSlider.value = 10;
  roseSlider.value = 10;
  sageSlider.value = 10;
  particleCounts.Red = 10;
  particleCounts.Blue = 10;
  particleCounts.Lavender = 10;
  particleCounts.Rose = 10;
  particleCounts.Sage = 10;
  createParticles();
  updateParticleCounters();
  resetPlayerHealth();

  collisionCount = 0;
  updateCollisionCounter();

  // Reset timer
  elapsedTime = 0; // Reset elapsed time to 0
  lastUpdateTime = null; // Clear last update time to ensure smooth resume

  // Resume simulation if paused
  isPaused = false;
  pauseButton.textContent = 'Pause';
});

// Key state tracking
const keysPressed = {};

// Event listeners for key presses
document.addEventListener('keydown', function(event) {
  const key = event.key.toLowerCase();
  keysPressed[key] = true;

  // Record timestamp if W, A, S, or D is pressed
  if (['w', 'a', 's', 'd'].includes(key)) {
    keyPressTimestamps.push(performance.now());
  }
});

document.addEventListener('keyup', function(event) {
  keysPressed[event.key.toLowerCase()] = false;
});

// Function to calculate the speed multiplier
function calculateSpeedMultiplier() {
  const now = performance.now();
  const threeSecondsAgo = now - 3000; // 3000 milliseconds = 3 seconds

  // Remove timestamps older than 3 seconds
  keyPressTimestamps = keyPressTimestamps.filter(timestamp => timestamp >= threeSecondsAgo);

  const pressCount = keyPressTimestamps.length;

  let speedMultiplier;

  if (pressCount <= 20) {
    // Linear increase up to 2x speed
    speedMultiplier = 1 + (pressCount / 20); // From 1x to 2x
  } else {
    // Diminishing returns after 2x speed
    speedMultiplier = 2 + ((pressCount - 20) * 0.05);
  }

  return speedMultiplier;
}

function resetPlayerHealth() {
  player.lives = player.maxLives;
  player.stunRemaining = 0;
  player.regenProgress = 0;
  player.lastHitTime = 0;
}

function damagePlayer() {
  if (player.stunRemaining > 0) return;

  player.lives = Math.max(0, player.lives - 1);
  player.lastHitTime = performance.now();
  player.regenProgress = 0;

  if (player.lives === 0) {
    player.stunRemaining = player.stunDuration;
  }
}

function updatePlayerHealth(deltaTime) {
  if (player.stunRemaining > 0) {
    player.stunRemaining = Math.max(0, player.stunRemaining - deltaTime);
    return;
  }

  if (player.lives >= player.maxLives) return;

  const sinceHit = (performance.now() - player.lastHitTime) / 1000;
  if (sinceHit < player.regenDelay) {
    player.regenProgress = 0;
    return;
  }

  player.regenProgress += deltaTime;
  while (player.regenProgress >= player.regenInterval && player.lives < player.maxLives) {
    player.regenProgress -= player.regenInterval;
    player.lives++;
  }
}

function isPlayerStunned() {
  return player.stunRemaining > 0;
}

function drawPlayerHealthBar() {
  const barWidth = square.size;
  const barHeight = HEALTH_BAR.height;
  const barX = square.x;
  const barY = square.y - HEALTH_BAR.gap - barHeight;
  const fillRatio = player.lives / player.maxLives;
  const sinceHit = (performance.now() - player.lastHitTime) / 1000;
  const isRegenerating = player.lives < player.maxLives
    && player.stunRemaining <= 0
    && sinceHit >= player.regenDelay;

  ctx.save();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  if (fillRatio > 0) {
    ctx.fillStyle = isRegenerating ? 'rgba(220, 255, 230, 1)' : '#ffffff';
    ctx.fillRect(barX, barY, barWidth * fillRatio, barHeight);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barWidth - 1, barHeight - 1);

  ctx.beginPath();
  ctx.moveTo(barX + barWidth / 3, barY);
  ctx.lineTo(barX + barWidth / 3, barY + barHeight);
  ctx.moveTo(barX + (2 * barWidth) / 3, barY);
  ctx.lineTo(barX + (2 * barWidth) / 3, barY + barHeight);
  ctx.stroke();

  if (isRegenerating && player.lives < player.maxLives) {
    const regenFill = Math.min(1, player.regenProgress / player.regenInterval);
    const segmentStart = barX + barWidth * (player.lives / player.maxLives);
    const segmentWidth = barWidth / player.maxLives;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(segmentStart, barY, segmentWidth * regenFill, barHeight);
  }

  ctx.restore();
}

function drawStunIndicator() {
  const pulse = 0.45 + 0.55 * Math.sin(performance.now() / 80);
  const pad = 6;

  ctx.save();
  ctx.strokeStyle = `rgba(255, 210, 90, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(
    square.x - pad,
    square.y - pad,
    square.size + pad * 2,
    square.size + pad * 2
  );
  ctx.setLineDash([]);

  ctx.fillStyle = `rgba(255, 210, 90, ${0.12 + pulse * 0.1})`;
  ctx.fillRect(square.x, square.y, square.size, square.size);

  const labelY = square.y - HEALTH_BAR.gap - HEALTH_BAR.height - 10;
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(255, 210, 90, ${pulse})`;
  ctx.fillText('STUNNED', square.x + square.size / 2, labelY);
  ctx.restore();
}

// Converts a hex color code to an RGB array
function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [
    (bigint >> 16) & 255, // Red
    (bigint >> 8) & 255,  // Green
    bigint & 255          // Blue
  ];
}

// Interpolates between two RGB colors
function interpolateColor(color1, color2, factor) {
  const result = color1.slice();
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
  }
  return result;
}

function drawSquare() {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const stunned = isPlayerStunned();
  ctx.fillStyle = stunned ? 'rgba(210, 210, 210, 1)' : '#ffffff';
  ctx.fillRect(square.x, square.y, square.size, square.size);

  ctx.strokeStyle = stunned ? 'rgba(255, 210, 90, 0.9)' : '#ffffff';
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';
  ctx.strokeRect(square.x, square.y, square.size, square.size);

  ctx.restore();

  drawPlayerHealthBar();
  if (stunned) {
    drawStunIndicator();
  }
}

// Animation loop
function animate(currentTime) {
  // Calculate delta time
  if (!lastUpdateTime) lastUpdateTime = currentTime;
  const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
  const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
  lastUpdateTime = currentTime;

  // Draw fresh background every frame
  drawGradientBackground();

  // Update the timer if not paused
  if (!isPaused) {
    elapsedTime += deltaTime;

    updatePlayerHealth(deltaTime);

    const speedMultiplier = calculateSpeedMultiplier();
    const canMove = !isPlayerStunned();
    const adjustedSpeed = physics.squareSpeed * speedMultiplier * deltaTime;

    if (canMove) {
      if (keysPressed['w'] && square.y > 0) {
        square.y -= adjustedSpeed;
      }
      if (keysPressed['s'] && square.y + square.size < canvas.height) {
        square.y += adjustedSpeed;
      }
      if (keysPressed['a'] && square.x > 0) {
        square.x -= adjustedSpeed;
      }
      if (keysPressed['d'] && square.x + square.size < canvas.width) {
        square.x += adjustedSpeed;
      }
    }

    // Boundary checks
    square.x = Math.max(0, Math.min(square.x, canvas.width - square.size));
    square.y = Math.max(0, Math.min(square.y, canvas.height - square.size));

    let particlesDestroyed = false;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.update(particles);

      if (particle.shouldDestroy) {
        particles.splice(i, 1);
        particlesDestroyed = true;
      }
    }

    if (particlesDestroyed) {
      updateParticleCounters();
    }

    for (const particle of particles) {
      particle.draw();
    }

    // Update pulses and remove finished ones
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      pulse.update(deltaTime);
      
      // Remove finished pulses before drawing
      if (pulse.finished) {
        pulses.splice(i, 1);
      } else {
        pulse.draw();
      }
    }
  } else {
    // Draw particles without updating their positions
    particles.forEach((particle) => {
      if (!particle.shouldDestroy) {
        particle.draw();
      }
    });

    // Draw pulses without updating (only valid ones)
    pulses.forEach((pulse) => {
      if (!pulse.finished && pulse.radius >= 0 && pulse.opacity > 0) {
        pulse.draw();
      }
    });
  }

  drawSquare();

  // Update the timer display
  updateTimerDisplay();

  // Update FPS counter
  updateFpsDisplay(currentTime);

  // Request the next frame
  requestAnimationFrame(animate);
}

// Start the animation
animate(performance.now());
