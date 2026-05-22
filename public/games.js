/* =========================================================================
   Retro arcade backdrops — stateful canvas simulations driven by rAF.

   Each game is a factory: makeX() → tick(ctx, w, h, dt, opts).
   GameBackdrop.attach(canvas, factory) wires up the rAF loop, pauses
   the loop when the canvas is off-screen (IntersectionObserver) or the
   tab is hidden (visibilitychange), and resizes with the canvas.

   Auto-init: find every <canvas data-game="snake|tanks|pong|tetris|invaders|pacman">
   on DOMContentLoaded and attach the matching factory.
   ========================================================================= */
(function () {
  'use strict';

  const INK = '#201515';
  const CREAM = '#fffefb';
  const ORANGE = '#ff4f00';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function drawHUD(ctx, w, h, score, label) {
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", Menlo, monospace';
    ctx.fillStyle = 'rgba(32,21,21,0.45)';
    ctx.textBaseline = 'top';
    if (score) ctx.fillText(score, 20, 18);
    if (label) {
      ctx.textAlign = 'right';
      ctx.fillText(label, w - 20, 18);
    }
    ctx.restore();
  }

  /* ============== 1. SNAKE =============================================
     Grid-based snake controlled by a lightweight AI that wanders the
     board the way a human player would: usually heads toward the
     nearest pellet, often keeps going straight, occasionally turns
     for no reason. Avoids its own body. Stays alive forever via a
     soft-reset when it traps itself.
     ====================================================================== */
  function makeSnake() {
    let state = null;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    function init(w, h) {
      const CELL = clamp(Math.round(Math.min(w, h) / 22), 16, 32);
      const cols = Math.floor(w / CELL);
      const rows = Math.floor(h / CELL);
      const offX = Math.floor((w - cols * CELL) / 2);
      const offY = Math.floor((h - rows * CELL) / 2);

      const sx = Math.floor(cols / 2);
      const sy = Math.floor(rows / 2);
      const snake = [];
      for (let i = 0; i < 5; i++) snake.push([sx - i, sy]);

      const s = {
        w, h, CELL, offX, offY, cols, rows,
        snake,
        dir: [1, 0],
        foods: [],
        score: 0,
        stepAcc: 0,
        stepInterval: 80,
        maxLen: clamp(Math.floor((cols * rows) / 20), 12, 22),
      };

      const target = Math.max(3, Math.min(5, Math.floor((cols * rows) / 60)));
      while (s.foods.length < target) {
        const f = spawnFood(s);
        if (!f) break;
        s.foods.push(f);
      }
      return s;
    }

    function spawnFood(s) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const fx = Math.floor(Math.random() * s.cols);
        const fy = Math.floor(Math.random() * s.rows);
        let bad = false;
        for (const [bx, by] of s.snake) if (bx === fx && by === fy) { bad = true; break; }
        if (bad) continue;
        for (const [ex, ey] of s.foods) if (ex === fx && ey === fy) { bad = true; break; }
        if (bad) continue;
        return [fx, fy];
      }
      return null;
    }

    function bodyHas(s, x, y, includeTail) {
      const end = includeTail ? s.snake.length : s.snake.length - 1;
      for (let i = 0; i < end; i++) {
        if (s.snake[i][0] === x && s.snake[i][1] === y) return true;
      }
      return false;
    }

    function chooseDir(s) {
      const [hx, hy] = s.snake[0];
      const valid = [];
      for (const [dx, dy] of DIRS) {
        if (dx === -s.dir[0] && dy === -s.dir[1]) continue;
        const nx = hx + dx;
        const ny = hy + dy;
        if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
        const eatingHere = s.foods.some(([fx, fy]) => fx === nx && fy === ny);
        if (bodyHas(s, nx, ny, eatingHere)) continue;
        valid.push([dx, dy]);
      }

      if (valid.length === 0) {
        for (const [dx, dy] of DIRS) {
          if (dx === -s.dir[0] && dy === -s.dir[1]) continue;
          return [dx, dy];
        }
        return s.dir;
      }

      let nearest = null;
      let bestDist = Infinity;
      for (const [fx, fy] of s.foods) {
        const d = Math.abs(fx - hx) + Math.abs(fy - hy);
        if (d < bestDist) { bestDist = d; nearest = [fx, fy]; }
      }

      const roll = Math.random();
      if (nearest && roll < 0.72) {
        let bestDir = valid[0];
        let bestNd = Infinity;
        for (const [dx, dy] of valid) {
          const nd = Math.abs(hx + dx - nearest[0]) + Math.abs(hy + dy - nearest[1]);
          if (nd < bestNd) { bestNd = nd; bestDir = [dx, dy]; }
        }
        return bestDir;
      }
      if (roll < 0.90) {
        const fwd = valid.find(([dx, dy]) => dx === s.dir[0] && dy === s.dir[1]);
        if (fwd) return fwd;
      }
      return valid[Math.floor(Math.random() * valid.length)];
    }

    function step(s) {
      s.dir = chooseDir(s);
      const [hx, hy] = s.snake[0];
      const nx = hx + s.dir[0];
      const ny = hy + s.dir[1];

      const eating = s.foods.some(([fx, fy]) => fx === nx && fy === ny);
      if (bodyHas(s, nx, ny, eating)) {
        while (s.snake.length > 5) s.snake.pop();
        return;
      }

      s.snake.unshift([nx, ny]);
      let ate = false;
      for (let i = 0; i < s.foods.length; i++) {
        if (s.foods[i][0] === nx && s.foods[i][1] === ny) {
          s.foods.splice(i, 1);
          s.score++;
          const nf = spawnFood(s);
          if (nf) s.foods.push(nf);
          ate = true;
          break;
        }
      }
      if (!ate || s.snake.length > s.maxLen) s.snake.pop();
    }

    function update(s, dt) {
      s.stepAcc += dt;
      let guard = 0;
      while (s.stepAcc >= s.stepInterval && guard++ < 4) {
        s.stepAcc -= s.stepInterval;
        step(s);
      }
    }

    function render(ctx, s, opts) {
      const { CELL, offX, offY } = s;

      ctx.fillStyle = 'rgba(32,21,21,0.05)';
      for (let i = 0; i < s.cols; i += 2) {
        for (let j = 0; j < s.rows; j += 2) {
          ctx.fillRect(offX + i * CELL + CELL / 2 - 1, offY + j * CELL + CELL / 2 - 1, 2, 2);
        }
      }

      ctx.fillStyle = ORANGE;
      for (const [fx, fy] of s.foods) {
        const px = offX + fx * CELL + CELL / 2;
        const py = offY + fy * CELL + CELL / 2;
        ctx.beginPath();
        ctx.arc(px, py, CELL * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Segments snap to grid cells — sub-cell interpolation would make
         adjacent segments cross visually on turns. Each block is exactly
         one cell, matching the dot grid spacing. */
      const pad = Math.max(1, Math.floor(CELL * 0.08));
      for (let k = 0; k < s.snake.length; k++) {
        const [cx, cy] = s.snake[k];
        const rx = cx * CELL + offX;
        const ry = cy * CELL + offY;
        const a = 1 - k / (s.snake.length + 1);
        ctx.fillStyle = `rgba(32,21,21,${0.85 * a})`;
        ctx.fillRect(rx + pad, ry + pad, CELL - pad * 2, CELL - pad * 2);
      }

      drawHUD(ctx, s.w, s.h, `SCORE ${String(s.score * 100).padStart(4, '0')}`, opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ============== 2. TANK COMBAT ====================================== */
  function makeTanks() {
    let state = null;

    function init(w, h) {
      const tankSize = clamp(Math.min(w, h) * 0.05, 22, 36);
      const topY = 60;
      const botY = h - 60;
      return {
        w, h, tankSize,
        tankA: {
          x: w * 0.18, y: topY, dir: 1, speed: 95, pauseT: 0,
          facing: 0, bullet: null, fireCool: 1.8,
          dead: false, deadT: 0,
          startX: w * 0.18, startY: topY, startDir: 1,
        },
        tankB: {
          x: w * 0.78, y: botY, dir: -1, speed: 80, pauseT: 0,
          facing: Math.PI, bullet: null, fireCool: 2.6,
          dead: false, deadT: 0,
          startX: w * 0.78, startY: botY, startDir: -1,
        },
        explosions: [],
        scoreA: 0, scoreB: 0,
      };
    }

    function patrolStep(s, t, dt) {
      const dts = dt / 1000;
      if (t.pauseT > 0) {
        t.pauseT -= dts;
        t.facing = (t.y < s.h / 2) ? Math.PI / 2 : -Math.PI / 2;
        return;
      }
      t.x += t.dir * t.speed * dts;
      const margin = 50;
      if (t.x > s.w - margin) { t.x = s.w - margin; t.dir = -1; }
      else if (t.x < margin)  { t.x = margin;       t.dir = 1; }
      t.facing = t.dir > 0 ? 0 : Math.PI;
      if (Math.random() < 0.004) t.pauseT = 0.9 + Math.random() * 0.6;
    }

    function update(s, dt) {
      const dts = dt / 1000;
      const tanks = [s.tankA, s.tankB];

      for (const t of tanks) {
        if (t.dead) {
          t.deadT -= dts;
          if (t.deadT <= 0) {
            t.dead = false;
            t.x = t.startX; t.y = t.startY; t.dir = t.startDir;
            t.facing = t.dir > 0 ? 0 : Math.PI;
            t.bullet = null;
            t.pauseT = 0;
            t.fireCool = 2.0 + Math.random() * 1.5;
          }
          continue;
        }
        patrolStep(s, t, dt);

        if (t.bullet) {
          t.bullet.x += t.bullet.vx * dts;
          t.bullet.y += t.bullet.vy * dts;
          t.bullet.life -= dts;
          if (t.bullet.life <= 0 ||
              t.bullet.x < -20 || t.bullet.x > s.w + 20 ||
              t.bullet.y < -20 || t.bullet.y > s.h + 20) {
            t.bullet = null;
          }
        }

        t.fireCool -= dts;
        const other = t === s.tankA ? s.tankB : s.tankA;
        if (!t.dead && !t.bullet && t.fireCool <= 0 && !other.dead && t.pauseT > 0.3) {
          const dx = other.x - t.x;
          if (Math.abs(dx) < s.tankSize * 1.4) {
            const ydir = (other.y > t.y) ? 1 : -1;
            t.bullet = { x: t.x, y: t.y + ydir * s.tankSize * 0.9, vx: 0, vy: 340 * ydir, life: 2.2 };
            t.fireCool = 2.4 + Math.random() * 1.8;
          }
        }
      }

      for (const shooter of tanks) {
        if (!shooter.bullet) continue;
        const b = shooter.bullet;
        for (const target of tanks) {
          if (target === shooter || target.dead) continue;
          const hr = s.tankSize * 0.7;
          if (Math.abs(b.x - target.x) < hr && Math.abs(b.y - target.y) < hr) {
            target.dead = true;
            target.deadT = 1.6;
            shooter.bullet = null;
            s.explosions.push({ x: target.x, y: target.y, t: 0 });
            if (shooter === s.tankA) s.scoreA++; else s.scoreB++;
            break;
          }
        }
      }

      s.explosions.forEach((e) => (e.t += dts));
      s.explosions = s.explosions.filter((e) => e.t < 0.9);
    }

    function drawTank(ctx, x, y, sz, rot, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.fillRect(-sz * 0.8, -sz * 0.7, sz * 1.6, sz * 0.25);
      ctx.fillRect(-sz * 0.8,  sz * 0.45, sz * 1.6, sz * 0.25);
      ctx.fillRect(-sz * 0.7, -sz * 0.45, sz * 1.4, sz * 0.9);
      ctx.fillStyle = '#f8f4f0';
      ctx.fillRect(-sz * 0.3, -sz * 0.3, sz * 0.6, sz * 0.6);
      ctx.fillStyle = color;
      ctx.fillRect(0, -sz * 0.10, sz * 1.15, sz * 0.20);
      ctx.restore();
    }

    function render(ctx, s, opts) {
      ctx.fillStyle = 'rgba(32,21,21,0.05)';
      ctx.fillRect(40, 50, s.w - 80, 2);
      ctx.fillRect(40, s.h - 52, s.w - 80, 2);

      if (!s.tankA.dead) drawTank(ctx, s.tankA.x, s.tankA.y, s.tankSize, s.tankA.facing, INK);
      if (!s.tankB.dead) drawTank(ctx, s.tankB.x, s.tankB.y, s.tankSize, s.tankB.facing, '#7a3a1a');

      for (const t of [s.tankA, s.tankB]) {
        if (!t.bullet) continue;
        ctx.fillStyle = INK;
        ctx.fillRect(t.bullet.x - 2, t.bullet.y - 4, 4, 8);
        const tr = t.bullet.vy > 0 ? -18 : 18;
        ctx.fillStyle = 'rgba(32,21,21,0.28)';
        ctx.fillRect(t.bullet.x - 1, t.bullet.y + tr, 2, 14);
      }

      for (const e of s.explosions) {
        const p = e.t / 0.9;
        const r = s.tankSize * (0.35 + p * 2.0);
        const pieces = 14;
        for (let i = 0; i < pieces; i++) {
          const ang = (i / pieces) * Math.PI * 2;
          const dx = Math.cos(ang) * r;
          const dy = Math.sin(ang) * r;
          const sz = Math.max(3, s.tankSize * 0.16 * (1 - p));
          ctx.fillStyle = i % 2 ? ORANGE : INK;
          ctx.fillRect(e.x + dx - sz / 2, e.y + dy - sz / 2, sz, sz);
        }
      }

      const score = `P1 ${String(s.scoreA).padStart(2, '0')}    P2 ${String(s.scoreB).padStart(2, '0')}`;
      drawHUD(ctx, s.w, s.h, score, opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ============== 3. PONG ============================================= */
  function makePong() {
    let state = null;

    function init(w, h) {
      const padX = 60;
      const padY = 50;
      return {
        w, h,
        court: { l: padX, r: w - padX, t: padY, b: h - padY },
        ball: spawnBall(w, h),
        lp: h / 2, rp: h / 2,
        lpSpeed: 230, rpSpeed: 230,
        scoreL: 0, scoreR: 0,
        paddleH: 80, paddleW: 12,
        flash: 0,
      };
    }

    function spawnBall(w, h) {
      const ang = (Math.random() * 0.6 - 0.3) + (Math.random() < 0.5 ? Math.PI : 0);
      const speed = 280;
      return {
        x: w / 2, y: h / 2,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: 8,
      };
    }

    function stepToward(cur, tgt, max) {
      const d = tgt - cur;
      if (Math.abs(d) <= max) return tgt;
      return cur + Math.sign(d) * max;
    }

    function update(s, dt) {
      const dts = dt / 1000;
      const c = s.court;
      const b = s.ball;
      b.x += b.vx * dts;
      b.y += b.vy * dts;

      if (b.y - b.r < c.t)      { b.y = c.t + b.r; b.vy = -b.vy; }
      else if (b.y + b.r > c.b) { b.y = c.b - b.r; b.vy = -b.vy; }

      const leftPadX = c.l + s.paddleW;
      if (b.vx < 0 && b.x - b.r < leftPadX && b.x > c.l) {
        if (b.y > s.lp - s.paddleH / 2 && b.y < s.lp + s.paddleH / 2) {
          b.x = leftPadX + b.r;
          b.vx = Math.abs(b.vx) * 1.04;
          const hit = (b.y - s.lp) / (s.paddleH / 2);
          b.vy += hit * 140;
          s.flash = 0.15;
        }
      }

      const rightPadX = c.r - s.paddleW;
      if (b.vx > 0 && b.x + b.r > rightPadX && b.x < c.r) {
        if (b.y > s.rp - s.paddleH / 2 && b.y < s.rp + s.paddleH / 2) {
          b.x = rightPadX - b.r;
          b.vx = -Math.abs(b.vx) * 1.04;
          const hit = (b.y - s.rp) / (s.paddleH / 2);
          b.vy += hit * 140;
          s.flash = 0.15;
        }
      }

      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 520) {
        b.vx = (b.vx / speed) * 520;
        b.vy = (b.vy / speed) * 520;
      }

      if (b.x < c.l - 30) { s.scoreR++; s.ball = spawnBall(s.w, s.h); }
      else if (b.x > c.r + 30) { s.scoreL++; s.ball = spawnBall(s.w, s.h); }

      const targetL = b.vx < 0 ? b.y + Math.sin(performance.now() / 700) * 30 : s.h / 2;
      const targetR = b.vx > 0 ? b.y + Math.sin(performance.now() / 900 + 1) * 30 : s.h / 2;
      s.lp = stepToward(s.lp, targetL, s.lpSpeed * dts);
      s.rp = stepToward(s.rp, targetR, s.rpSpeed * dts);
      s.lp = clamp(s.lp, c.t + s.paddleH / 2, c.b - s.paddleH / 2);
      s.rp = clamp(s.rp, c.t + s.paddleH / 2, c.b - s.paddleH / 2);

      s.flash = Math.max(0, s.flash - dts);
    }

    function render(ctx, s, opts) {
      const c = s.court;

      ctx.fillStyle = 'rgba(32,21,21,0.22)';
      const dashH = 14;
      for (let y = c.t + 4; y < c.b - 4; y += dashH * 2) {
        ctx.fillRect(s.w / 2 - 3, y, 6, dashH);
      }

      ctx.save();
      ctx.font = 'bold 64px "Luckiest Guy", Impact, sans-serif';
      ctx.fillStyle = 'rgba(32,21,21,0.20)';
      ctx.textAlign = 'center';
      ctx.fillText(String(s.scoreL).padStart(2, '0'), s.w / 2 - 90, c.t + 60);
      ctx.fillText(String(s.scoreR).padStart(2, '0'), s.w / 2 + 90, c.t + 60);
      ctx.restore();

      ctx.fillStyle = INK;
      ctx.fillRect(c.l, s.lp - s.paddleH / 2, s.paddleW, s.paddleH);
      ctx.fillRect(c.r - s.paddleW, s.rp - s.paddleH / 2, s.paddleW, s.paddleH);

      const b = s.ball;
      if (s.flash > 0) {
        ctx.fillStyle = ORANGE;
        ctx.fillRect(b.x - b.r - 4, b.y - b.r - 4, b.r * 2 + 8, b.r * 2 + 8);
      }
      ctx.fillStyle = INK;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);

      drawHUD(ctx, s.w, s.h, '', opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ============== 4. TETRIS =========================================== */
  function makeTetris() {
    let state = null;

    const SHAPES = {
      I: [[[1,1,1,1]], [[1],[1],[1],[1]]],
      O: [[[1,1],[1,1]]],
      T: [[[0,1,0],[1,1,1]], [[1,0],[1,1],[1,0]], [[1,1,1],[0,1,0]], [[0,1],[1,1],[0,1]]],
      S: [[[0,1,1],[1,1,0]], [[1,0],[1,1],[0,1]]],
      Z: [[[1,1,0],[0,1,1]], [[0,1],[1,1],[1,0]]],
      L: [[[1,0],[1,0],[1,1]], [[1,1,1],[1,0,0]], [[1,1],[0,1],[0,1]], [[0,0,1],[1,1,1]]],
      J: [[[0,1],[0,1],[1,1]], [[1,0,0],[1,1,1]], [[1,1],[1,0],[1,0]], [[1,1,1],[0,0,1]]],
    };
    const KINDS = Object.keys(SHAPES);
    const pickKind = () => KINDS[Math.floor(Math.random() * KINDS.length)];

    function init(w, h) {
      const COLS = 10;
      const ROWS = 18;
      /* Narrow side canvases use full width for cells; wide canvases
         reserve room for the NEXT/LINES panel to the right of the well. */
      const hasSidePanel = w >= 320;
      let CELL = Math.min(Math.floor(h / (ROWS + 2)), Math.floor((w - 16) / COLS));
      if (hasSidePanel) CELL = Math.min(CELL, Math.floor(w / (COLS * 2.4)));
      CELL = clamp(CELL, 12, 28);
      const wellW = COLS * CELL;
      const wellH = ROWS * CELL;
      const wx = Math.floor((w - wellW) / 2);
      const wy = Math.floor((h - wellH) / 2);
      return {
        w, h, COLS, ROWS, CELL, wx, wy, wellW, wellH,
        board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
        cur: null,
        next: pickKind(),
        lines: 0,
        flash: 0,
        flashRows: [],
        fallSpeed: 6,
        slideSpeed: 12,
      };
    }

    function shapeOf(kind, rot) {
      const rots = SHAPES[kind];
      return rots[rot % rots.length];
    }
    function shapeCells(kind, rot) {
      const sh = shapeOf(kind, rot);
      const c = [];
      for (let r = 0; r < sh.length; r++) for (let cc = 0; cc < sh[r].length; cc++) {
        if (sh[r][cc]) c.push([cc, r]);
      }
      return c;
    }

    function fits(s, board, kind, rot, col, row) {
      const cells = shapeCells(kind, rot);
      for (const [cx, cy] of cells) {
        const bc = col + cx;
        const br = row + cy;
        if (bc < 0 || bc >= s.COLS || br >= s.ROWS) return false;
        if (br < 0) continue;
        if (board[br][bc]) return false;
      }
      return true;
    }

    function lowestLanding(s, kind, rot, col) {
      let r = -2;
      while (fits(s, s.board, kind, rot, col, r + 1)) r++;
      return r;
    }

    function aiChoose(s, kind) {
      let best = null;
      const rots = SHAPES[kind].length;
      for (let rot = 0; rot < rots; rot++) {
        const cells = shapeCells(kind, rot);
        const xs = cells.map((c) => c[0]);
        const maxX = Math.max(...xs);
        for (let col = -Math.min(...xs); col + maxX < s.COLS; col++) {
          const landRow = lowestLanding(s, kind, rot, col);
          if (landRow < 0) continue;
          const tmpBoard = s.board.map((r) => r.slice());
          let maxBR = 0;
          for (const [cx, cy] of cells) {
            const bc = col + cx, br = landRow + cy;
            if (br >= 0 && br < s.ROWS) {
              tmpBoard[br][bc] = 1;
              if (br > maxBR) maxBR = br;
            }
          }
          let lineBonus = 0;
          for (let r = 0; r < s.ROWS; r++) if (tmpBoard[r].every((v) => v)) lineBonus += 1;
          let aggregate = 0;
          let bumpiness = 0;
          let holes = 0;
          let prevH = null;
          for (let c = 0; c < s.COLS; c++) {
            let h = 0;
            let seenTop = false;
            for (let r = 0; r < s.ROWS; r++) {
              if (tmpBoard[r][c]) {
                if (!seenTop) { h = s.ROWS - r; seenTop = true; }
              } else if (seenTop) {
                holes++;
              }
            }
            aggregate += h;
            if (prevH !== null) bumpiness += Math.abs(h - prevH);
            prevH = h;
          }
          /* maxBR rewards the actual bottom row of the placed piece (not
             the piece's top-left, which can be deceptively high for tall
             rotations). bumpiness discourages creating deep wells next
             to high towers — the visual cause of pieces appearing to
             stop short of the floor. */
          const score = lineBonus * 60 - aggregate * 0.6 - holes * 4 - bumpiness * 0.5 + maxBR * 0.9;
          if (!best || score > best.score) best = { rot, col, row: landRow, score };
        }
      }
      return best || { rot: 0, col: 3, row: 0 };
    }

    function update(s, dt) {
      const dts = dt / 1000;
      s.flash = Math.max(0, s.flash - dts);

      if (s.flash > 0) return;

      if (!s.cur) {
        const kind = s.next;
        s.next = pickKind();
        const plan = aiChoose(s, kind);
        const startCol = Math.floor((s.COLS - shapeOf(kind, plan.rot)[0].length) / 2);
        s.cur = {
          kind, rot: plan.rot, col: startCol,
          targetCol: plan.col,
          row: -2, targetRow: plan.row, locked: false,
        };
        if (!fits(s, s.board, kind, plan.rot, plan.col, plan.row)) {
          s.board = Array.from({ length: s.ROWS }, () => Array(s.COLS).fill(0));
        }
        return;
      }

      const c = s.cur;
      if (c.col !== c.targetCol) {
        const step = (s.slideSpeed * dt) / 1000;
        const diff = c.targetCol - c.col;
        if (Math.abs(diff) <= step) c.col = c.targetCol;
        else c.col += Math.sign(diff) * step;
      }
      c.row += (s.fallSpeed * dt) / 1000;
      if (c.row >= c.targetRow) {
        c.row = c.targetRow;
        const col = Math.round(c.col);
        for (const [cx, cy] of shapeCells(c.kind, c.rot)) {
          const bc = col + cx, br = Math.round(c.row) + cy;
          if (br >= 0 && br < s.ROWS && bc >= 0 && bc < s.COLS) {
            s.board[br][bc] = (c.kind === 'O' || c.kind === 'L' || c.kind === 'T') ? 2 : 1;
          }
        }
        const full = [];
        for (let r = 0; r < s.ROWS; r++) if (s.board[r].every((v) => v)) full.push(r);
        if (full.length > 0) {
          s.flashRows = full.slice();
          s.flash = 0.42;
          s.cur = null;
          setTimeout(() => {
            for (const r of full) {
              s.board.splice(r, 1);
              s.board.unshift(Array(s.COLS).fill(0));
            }
            s.lines += full.length;
            s.flashRows = [];
          }, 420);
        } else {
          s.cur = null;
        }
      }
    }

    function drawCell(ctx, x, y, CELL, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = color === INK ? 'rgba(255,254,251,0.18)' : 'rgba(255,254,251,0.35)';
      ctx.fillRect(x + 2, y + 2, CELL - 4, 2);
    }

    function render(ctx, s, opts) {
      const { CELL, wx, wy, wellW, wellH, COLS, ROWS } = s;

      ctx.strokeStyle = 'rgba(32,21,21,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx - 4, wy - 4, wellW + 8, wellH + 8);

      ctx.fillStyle = 'rgba(32,21,21,0.05)';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        ctx.fillRect(wx + c * CELL + 1, wy + r * CELL + 1, CELL - 2, CELL - 2);
      }

      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!s.board[r][c]) continue;
        const isFlash = s.flashRows.includes(r);
        const color = isFlash ? CREAM : (s.board[r][c] === 2 ? ORANGE : INK);
        drawCell(ctx, wx + c * CELL, wy + r * CELL, CELL, color);
        if (isFlash) {
          ctx.fillStyle = 'rgba(255, 79, 0, 0.55)';
          ctx.fillRect(wx + c * CELL + 1, wy + r * CELL + 1, CELL - 2, CELL - 2);
        }
      }

      if (s.cur) {
        const col = s.cur.col;
        const row = s.cur.row;
        const color = (s.cur.kind === 'O' || s.cur.kind === 'L' || s.cur.kind === 'T') ? ORANGE : INK;
        for (const [cx, cy] of shapeCells(s.cur.kind, s.cur.rot)) {
          const x = wx + (col + cx) * CELL;
          const y = wy + (row + cy) * CELL;
          drawCell(ctx, x, y, CELL, color);
        }
        ctx.strokeStyle = 'rgba(32,21,21,0.20)';
        ctx.lineWidth = 1;
        for (const [cx, cy] of shapeCells(s.cur.kind, s.cur.rot)) {
          const x = wx + (Math.round(col) + cx) * CELL;
          const y = wy + (s.cur.targetRow + cy) * CELL;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
      }

      const sideX = wx + wellW + 24;
      if (sideX + 4 * CELL < s.w) {
        ctx.fillStyle = 'rgba(32,21,21,0.06)';
        ctx.fillRect(sideX, wy, 4 * CELL, 4 * CELL);
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = INK;
        ctx.fillText('NEXT', sideX + 4, wy - 6);

        const ncells = shapeCells(s.next, 0);
        const cs = CELL * 0.75;
        const nx = sideX + CELL * 0.5;
        const ny = wy + CELL * 0.6;
        ctx.fillStyle = INK;
        for (const [cx, cy] of ncells) {
          ctx.fillRect(nx + cx * cs, ny + cy * cs, cs - 2, cs - 2);
        }

        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText('LINES', sideX + 4, wy + 4 * CELL + 24);
        ctx.font = 'bold 28px "Luckiest Guy", Impact, sans-serif';
        ctx.fillText(String(s.lines).padStart(3, '0'), sideX + 4, wy + 4 * CELL + 56);
      }

      drawHUD(ctx, s.w, s.h, '', opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ============== 5. SPACE INVADERS ===================================
     Single row of invaders marches side-to-side across a shallow strip.
     Killed invaders respawn after a short delay so the assault stays
     continuous. Defender tracks an alive invader's column and fires up;
     invaders drop bombs downward. No bunkers, no fleet descent — keeps
     the playfield compact enough to live in a ~260px strip.
     ====================================================================== */
  function makeInvaders() {
    let state = null;

    const SPRITES = [
      /* crab */
      [
        [[0,1,0,1,0],[1,1,1,1,1],[1,1,0,1,1],[1,0,1,0,1],[1,1,1,1,1],[0,1,0,1,0]],
        [[1,0,0,0,1],[0,1,1,1,0],[1,1,1,1,1],[1,1,0,1,1],[1,1,1,1,1],[1,0,1,0,1]],
      ],
      /* squid */
      [
        [[0,0,1,0,0],[0,1,1,1,0],[1,1,0,1,1],[1,1,1,1,1],[0,1,0,1,0],[1,0,1,0,1]],
        [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[1,1,0,1,1],[0,1,0,1,0],[0,1,0,1,0]],
      ],
    ];

    function init(w, h) {
      const cell = clamp(Math.floor(Math.min(h * 0.22, w / 18)), 22, 36);
      const stepX = cell * 1.5;
      const count = clamp(Math.floor((w - 80) / stepX), 6, 12);
      const fleetW = (count - 1) * stepX + cell;
      const invaders = [];
      for (let i = 0; i < count; i++) {
        invaders.push({ slot: i, kind: i % 2, alive: true, respawn: 0 });
      }
      return {
        w, h, cell, stepX, count, fleetW,
        invaders,
        offX: (w - fleetW) / 2,
        offY: 14,
        marchX: 0,
        marchDir: 1,
        marchSpeed: 55,
        stepFlip: 0, stepFlipT: 0,
        defenderX: w / 2,
        defenderTargetX: w / 2,
        defenderSpeed: 170,
        bullet: null,
        fireCool: 0.6,
        bombs: [],
        bombCool: 1.1,
        explosions: [],
        score: 0,
      };
    }

    const invaderX = (s, slot) => s.offX + s.marchX + slot * s.stepX;
    const invaderY = (s) => s.offY;
    const aliveList = (s) => s.invaders.filter((v) => v.alive);

    function update(s, dt) {
      const dts = dt / 1000;

      s.marchX += s.marchDir * s.marchSpeed * dts;
      const leftEdge = s.offX + s.marchX;
      const rightEdge = leftEdge + s.fleetW;
      const margin = 20;
      if (rightEdge > s.w - margin && s.marchDir > 0) s.marchDir = -1;
      else if (leftEdge < margin && s.marchDir < 0) s.marchDir = 1;

      s.stepFlipT += dts;
      if (s.stepFlipT > 0.5) { s.stepFlipT = 0; s.stepFlip = 1 - s.stepFlip; }

      for (const inv of s.invaders) {
        if (!inv.alive) {
          inv.respawn -= dts;
          if (inv.respawn <= 0) inv.alive = true;
        }
      }

      if (Math.abs(s.defenderTargetX - s.defenderX) < 6 || Math.random() < 0.005) {
        const alive = aliveList(s);
        if (alive.length > 0) {
          const target = alive[Math.floor(Math.random() * alive.length)];
          s.defenderTargetX = clamp(invaderX(s, target.slot) + s.cell / 2, 24, s.w - 24);
        }
      }
      {
        const d = s.defenderTargetX - s.defenderX;
        const step = s.defenderSpeed * dts;
        if (Math.abs(d) <= step) s.defenderX = s.defenderTargetX;
        else s.defenderX += Math.sign(d) * step;
      }

      const defenderY = s.h - 22;
      s.fireCool -= dts;
      if (!s.bullet && s.fireCool <= 0) {
        s.bullet = { x: s.defenderX, y: defenderY - s.cell * 0.6, vy: -380 };
        s.fireCool = 0.7 + Math.random() * 0.6;
      }
      if (s.bullet) {
        s.bullet.y += s.bullet.vy * dts;
        const iy = invaderY(s);
        for (const inv of s.invaders) {
          if (!inv.alive) continue;
          const ix = invaderX(s, inv.slot);
          if (s.bullet.x > ix && s.bullet.x < ix + s.cell &&
              s.bullet.y > iy && s.bullet.y < iy + s.cell) {
            inv.alive = false;
            inv.respawn = 1.4 + Math.random() * 1.2;
            s.score += 10;
            s.explosions.push({ x: ix + s.cell / 2, y: iy + s.cell / 2, t: 0 });
            s.bullet = null;
            break;
          }
        }
        if (s.bullet && s.bullet.y < -10) s.bullet = null;
      }

      s.bombCool -= dts;
      if (s.bombCool <= 0) {
        const alive = aliveList(s);
        if (alive.length > 0) {
          const shooter = alive[Math.floor(Math.random() * alive.length)];
          s.bombs.push({
            x: invaderX(s, shooter.slot) + s.cell / 2,
            y: invaderY(s) + s.cell,
            vy: 210 + Math.random() * 80,
          });
        }
        s.bombCool = 0.7 + Math.random() * 0.9;
      }
      for (const b of s.bombs) b.y += b.vy * dts;
      s.bombs = s.bombs.filter((b) => b.y < s.h + 10);

      s.explosions.forEach((e) => (e.t += dts));
      s.explosions = s.explosions.filter((e) => e.t < 0.5);
    }

    function drawInvader(ctx, x, y, sz, kind, frame) {
      const sprite = SPRITES[kind % SPRITES.length][frame % 2];
      const cols = sprite[0].length;
      const rows = sprite.length;
      const pix = sz / Math.max(cols, rows);
      const ox = (sz - cols * pix) / 2;
      ctx.fillStyle = kind === 0 ? INK : ORANGE;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!sprite[r][c]) continue;
        ctx.fillRect(x + ox + c * pix, y + r * pix, Math.max(1, pix - 1), Math.max(1, pix - 1));
      }
    }

    function drawDefender(ctx, x, y, sz) {
      ctx.fillStyle = INK;
      ctx.fillRect(x - 2, y - sz * 0.65, 4, sz * 0.20);
      ctx.fillRect(x - sz * 0.20, y - sz * 0.45, sz * 0.40, sz * 0.18);
      ctx.fillRect(x - sz * 0.55, y - sz * 0.25, sz * 1.10, sz * 0.20);
      ctx.fillRect(x - sz * 0.85, y - sz * 0.05, sz * 1.70, sz * 0.22);
    }

    function render(ctx, s, opts) {
      ctx.fillStyle = 'rgba(32,21,21,0.03)';
      ctx.fillRect(0, 0, s.w, s.h);

      const iy = invaderY(s);
      for (const inv of s.invaders) {
        if (!inv.alive) continue;
        drawInvader(ctx, invaderX(s, inv.slot), iy, s.cell, inv.kind, s.stepFlip);
      }

      drawDefender(ctx, s.defenderX, s.h - 22, s.cell);

      if (s.bullet) {
        ctx.fillStyle = INK;
        ctx.fillRect(s.bullet.x - 2, s.bullet.y - 10, 4, 12);
      }

      ctx.fillStyle = ORANGE;
      for (const b of s.bombs) {
        ctx.fillRect(b.x - 2, b.y - 5, 4, 9);
      }

      for (const e of s.explosions) {
        const p = e.t / 0.5;
        const pieces = 10;
        const r = s.cell * 0.35 + p * s.cell * 1.2;
        for (let i = 0; i < pieces; i++) {
          const ang = (i / pieces) * Math.PI * 2;
          const sz = Math.max(2, s.cell * 0.16 * (1 - p));
          ctx.fillStyle = i % 2 ? ORANGE : INK;
          ctx.fillRect(e.x + Math.cos(ang) * r - sz / 2, e.y + Math.sin(ang) * r - sz / 2, sz, sz);
        }
      }

      ctx.fillStyle = 'rgba(32,21,21,0.40)';
      ctx.fillRect(0, s.h - 3, s.w, 2);

      drawHUD(ctx, s.w, s.h, `SCORE  ${String(s.score).padStart(4, '0')}`, opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ============== 6. PAC-MAN ========================================== */
  function makePacman() {
    let state = null;

    const MAZE = [
      '###############',
      '#.............#',
      '#.###.###.###.#',
      '#.#.........#.#',
      '#.#.##.#.##.#.#',
      '#......#......#',
      '#.##.#####.##.#',
      '#......#......#',
      '#.#.##.#.##.#.#',
      '#.#.........#.#',
      '#.###.###.###.#',
      '#.............#',
      '###############',
    ];

    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

    function init(w, h) {
      const rows = MAZE.length;
      const cols = MAZE[0].length;
      const CELL = clamp(Math.min(Math.floor(w / (cols + 2)), Math.floor(h / (rows + 2))), 18, 38);
      const wx = Math.floor((w - cols * CELL) / 2);
      const wy = Math.floor((h - rows * CELL) / 2);

      const dots = MAZE.map((line) => line.split('').map((ch) => ch === '.' ? 1 : 0));
      const walls = MAZE.map((line) => line.split('').map((ch) => ch === '#' ? 1 : 0));

      const pcx = 1, pcy = 1;
      const gcx = cols - 2, gcy = rows - 2;

      return {
        w, h, CELL, wx, wy, rows, cols, walls, dots,
        pac: { cx: pcx, cy: pcy, dx: 1, dy: 0, t: 0, mouth: 0 },
        ghost: { cx: gcx, cy: gcy, dx: -1, dy: 0, t: 0 },
        score: 0,
        speed: 4.5,
        ghostSpeed: 3.6,
      };
    }

    function passable(s, cx, cy) {
      if (cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows) return false;
      return !s.walls[cy][cx];
    }

    function pickDir(s, e, isPac) {
      const opts = [];
      for (const [dx, dy] of DIRS) {
        if (dx === -e.dx && dy === -e.dy) continue;
        if (passable(s, e.cx + dx, e.cy + dy)) opts.push([dx, dy]);
      }
      if (opts.length === 0) return [-e.dx, -e.dy];
      if (isPac) {
        const forward = opts.find(([dx, dy]) => dx === e.dx && dy === e.dy);
        if (forward && Math.random() > 0.20) return forward;
        return opts[Math.floor(Math.random() * opts.length)];
      } else {
        if (Math.random() < 0.60) {
          const pac = s.pac;
          let best = opts[0], bestDist = Infinity;
          for (const [dx, dy] of opts) {
            const d = Math.abs(e.cx + dx - pac.cx) + Math.abs(e.cy + dy - pac.cy);
            if (d < bestDist) { bestDist = d; best = [dx, dy]; }
          }
          return best;
        }
        return opts[Math.floor(Math.random() * opts.length)];
      }
    }

    function stepEntity(s, e, speed, dt, isPac) {
      e.t += (speed * dt) / 1000;
      let guard = 0;
      while (e.t >= 1 && guard++ < 8) {
        e.t -= 1;
        e.cx += e.dx;
        e.cy += e.dy;
        if (e.cx < 0) e.cx = s.cols - 1;
        if (e.cx >= s.cols) e.cx = 0;

        if (isPac && s.dots[e.cy][e.cx]) {
          s.dots[e.cy][e.cx] = 0;
          s.score += 10;
        }
        const [ndx, ndy] = pickDir(s, e, isPac);
        e.dx = ndx;
        e.dy = ndy;
        if (!passable(s, e.cx + e.dx, e.cy + e.dy)) {
          e.dx = -e.dx; e.dy = -e.dy;
        }
      }
    }

    function update(s, dt) {
      stepEntity(s, s.pac, s.speed, dt, true);
      stepEntity(s, s.ghost, s.ghostSpeed, dt, false);
      s.pac.mouth += dt / 90;

      let any = false;
      for (let r = 0; r < s.rows && !any; r++) {
        for (let c = 0; c < s.cols; c++) {
          if (s.dots[r][c]) { any = true; break; }
        }
      }
      if (!any) {
        for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
          if (MAZE[r][c] === '.') s.dots[r][c] = 1;
        }
      }
    }

    function drawGhost(ctx, x, y, r, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r, Math.PI, 0);
      ctx.lineTo(r, r * 0.9);
      const teeth = 4;
      for (let i = teeth; i >= 0; i--) {
        const px = -r + (i * 2 * r) / teeth;
        const py = r * 0.9 + (i % 2 === 0 ? -r * 0.18 : 0);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = CREAM;
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( r * 0.25, -r * 0.1, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ORANGE;
      ctx.beginPath(); ctx.arc(-r * 0.30, -r * 0.05, r * 0.10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( r * 0.30, -r * 0.05, r * 0.10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function render(ctx, s, opts) {
      const { CELL, wx, wy } = s;

      ctx.fillStyle = 'rgba(32,21,21,0.20)';
      ctx.strokeStyle = 'rgba(32,21,21,0.55)';
      ctx.lineWidth = 1.5;
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        if (!s.walls[r][c]) continue;
        const x = wx + c * CELL;
        const y = wy + r * CELL;
        ctx.fillRect(x, y, CELL, CELL);
      }
      ctx.strokeRect(wx + 1, wy + 1, s.cols * CELL - 2, s.rows * CELL - 2);

      ctx.fillStyle = ORANGE;
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        if (!s.dots[r][c]) continue;
        const x = wx + c * CELL + CELL / 2;
        const y = wy + r * CELL + CELL / 2;
        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.10, 0, Math.PI * 2);
        ctx.fill();
      }

      const pac = s.pac;
      const px = wx + (pac.cx + pac.dx * pac.t) * CELL + CELL / 2;
      const py = wy + (pac.cy + pac.dy * pac.t) * CELL + CELL / 2;
      const facing = Math.atan2(pac.dy, pac.dx);
      const mouth = (Math.sin(pac.mouth * Math.PI * 2) + 1) / 2 * 0.55 + 0.04;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(facing);
      ctx.fillStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(0, 0, CELL * 0.42, mouth, Math.PI * 2 - mouth);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const g = s.ghost;
      const gx = wx + (g.cx + g.dx * g.t) * CELL + CELL / 2;
      const gy = wy + (g.cy + g.dy * g.t) * CELL + CELL / 2;
      drawGhost(ctx, gx, gy, CELL * 0.42, INK);

      drawHUD(ctx, s.w, s.h, `1UP  ${String(s.score).padStart(4, '0')}`, opts.label);
    }

    return function tick(ctx, w, h, dt, opts) {
      if (!state || state.w !== w || state.h !== h) state = init(w, h);
      update(state, dt);
      render(ctx, state, opts);
    };
  }

  /* ---------- Backdrop runner ---------------------------------------- */
  function attach(canvas, factory, label) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = factory();
    const ctx = canvas.getContext('2d');
    let visible = false;
    let drawing = false;
    let raf = 0;
    let lastT = performance.now();

    const render = (now) => {
      if (!drawing) return;
      const dt = Math.min(64, now - lastT);
      lastT = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      tick(ctx, w, h, dt, { label });
      raf = requestAnimationFrame(render);
    };

    const start = () => {
      if (drawing) return;
      drawing = true;
      lastT = performance.now();
      raf = requestAnimationFrame(render);
    };
    const stop = () => {
      drawing = false;
      cancelAnimationFrame(raf);
    };

    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    }, { threshold: 0.01 });
    io.observe(canvas);

    const onVis = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVis);
  }

  const FACTORIES = {
    snake: { f: makeSnake, label: 'SNAKE · 1976' },
    tanks: { f: makeTanks, label: 'COMBAT · 1977' },
    pong: { f: makePong, label: 'PONG · 1972' },
    tetris: { f: makeTetris, label: 'TETRIS · 1984' },
    invaders: { f: makeInvaders, label: 'INVADERS · 1978' },
    pacman: { f: makePacman, label: 'PAC-MAN · 1980' },
  };

  function init() {
    const canvases = document.querySelectorAll('canvas[data-game]');
    canvases.forEach((c) => {
      const key = c.getAttribute('data-game');
      const entry = FACTORIES[key];
      if (!entry) return;
      attach(c, entry.f, entry.label);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
