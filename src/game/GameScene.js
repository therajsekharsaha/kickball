import Phaser from 'phaser'
import { controls } from './controls'
import { getSkin } from '../skins'
import { DIFFS } from '../ranks'
import { ref, onValue, set as fbSet } from 'firebase/database'
import { db } from '../firebase'

export const W = 1280
export const H = 720
export const GROUND = 470            // the line the players' feet and the ball rest on
const GOAL_H = 215
const GOAL_TOP = GROUND - GOAL_H
const BALL_R = 28
const PW = 56, PH = 132              // player hit-box
const THEMES = {
  sunset: { sky: [0xff8a3d, 0xffd9a0], band: 0xd9824a, surround: 0xd9774a, grass: [0x47a83a, 0x52b843], sun: true },
  street: { sky: [0x4aa3e8, 0xc4e8ff], band: 0x5aa7e0, surround: 0xe0805a, grass: [0x4fb23a, 0x5bc243] },
  night:  { sky: [0x0b1b3a, 0x23408a], band: 0x16306a, surround: 0x6a4a42, grass: [0x2f8f35, 0x37a03c] },
}
const OUT = 0x1a1a33
const hex = (c) => parseInt(c.replace('#', ''), 16)
const poly = (cx, cy, r, rot) => Array.from({ length: 5 }, (_, i) => {
  const a = Phaser.Math.DegToRad(rot + i * 72)
  return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))
})

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game') }

  create() {
    this.cfg = this.registry.get('cfg')
    this.score = { p1: 0, p2: 0 }
    this.timeLeft = this.cfg.time || 120
    this.overtime = false; this.playing = false; this.ended = false
    this.online = this.cfg.mode === 'online'
    this.isHost = this.cfg.isHost
    this.roomCode = this.cfg.roomCode
    if (this.online) this.setupOnline()
    this.hudT = 0; this.superT = 0
    this.stats = { shots: [0, 0], pa: [0, 0], ph: [0, 0], poss: [0, 0] }; this.last = -1

    this.physics.world.setBounds(0, 0, W, GROUND)
    this.physics.world.setBoundsCollision(false, false, true, true)
    this.makeCommonTextures()
    this.drawStadium()
    this.keys = this.input.keyboard.addKeys('W,A,D,J,K,U,SPACE,ENTER,L,O')
    this.cur = this.input.keyboard.createCursorKeys()

    this.ballShadow = this.add.image(W / 2, GROUND - 2, 'shadow').setDepth(1)
    this.ball = this.physics.add.image(W / 2, 180, 'ball').setCircle(BALL_R, 2, 2).setBounce(0.8)
      .setCollideWorldBounds(true).setDragX(30).setMaxVelocity(1400, 1400).setDepth(7)
    this.ball.body.setGravityY(-650)
    this.trail = this.add.particles(0, 0, 'spark', {
      follow: this.ball, lifespan: 380, frequency: 16, speed: { min: 10, max: 40 },
      scale: { start: 1.2, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xb86bff, 0xffe066, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(6)

    this.p1 = this.makePlayer(this.cfg.p1Skin, 1, 0)
    this.p2 = this.makePlayer(this.cfg.p2Skin, -1, 1)
    this.p2.isAI = this.cfg.mode === 'ai'
    this.p1.speed = 380 * this.p1.spM
    this.p2.speed = this.p2.isAI ? DIFFS[this.cfg.diff].speed : 380 * this.p2.spM

      ;[this.p1, this.p2].forEach((p) => {
        this.physics.add.collider(this.ball, p.body, (ball, pb) => {
          ball.body.velocity.x += pb.body.velocity.x * 0.6
          if (ball.y < pb.y - 40) ball.body.velocity.x += (ball.x >= pb.x ? 1 : -1) * 140   // slide off the head
          p.power = Math.min(100, p.power + 2)
          this.last = p.team
        })
      })

    this.resetPositions()
    this.emitHud()
    this.time.addEvent({ delay: 1000, loop: true, callback: this.tick, callbackScope: this })
    this.time.delayedCall(900, () => (this.playing = true))
  }

  // ---------------- textures ----------------
  makeCommonTextures() {
    if (this.textures.exists('ball')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    // soccer ball
    g.fillStyle(0xffffff).fillCircle(30, 30, 28)
    g.fillStyle(0x1b1b1b).fillPoints(poly(30, 30, 9, -90), true)
    g.lineStyle(2, 0x1b1b1b)
    for (let i = 0; i < 5; i++) {
      const a = Phaser.Math.DegToRad(-90 + i * 72)
      g.lineBetween(30 + 9 * Math.cos(a), 30 + 9 * Math.sin(a), 30 + 17 * Math.cos(a), 30 + 17 * Math.sin(a))
      g.fillPoints(poly(30 + 22 * Math.cos(a), 30 + 22 * Math.sin(a), 6, -90 + i * 72 + 36), true)
    }
    g.lineStyle(3, 0x1b1b1b).strokeCircle(30, 30, 28)
    g.generateTexture('ball', 60, 60); g.clear()
    // soft shadow
    g.fillStyle(0x000000, 0.35).fillEllipse(50, 12, 100, 22)
    g.generateTexture('shadow', 100, 24); g.clear()
    // glow + spark
    for (let r = 62; r > 4; r -= 4) g.fillStyle(0xffffff, 0.035).fillCircle(64, 64, r)
    g.generateTexture('glow', 128, 128); g.clear()
    g.fillStyle(0xffffff).fillCircle(5, 5, 5)
    g.generateTexture('spark', 10, 10); g.destroy()
  }

  setupOnline() {
    const roomRef = ref(db, `rooms/${this.roomCode}`)
    this.unsub = onValue(roomRef, (snap) => {
      const r = snap.val()
      if (!r || r.status !== 'playing') return
      if (this.isHost) {
        // host reads guest inputs
        const gi = r.inputs?.[r.guest]
        if (gi) this.guestInput = gi
      } else {
        // guest reads host state
        const st = r.state
        if (st) this.applyRemoteState(st)
      }
    })
    // guest: send inputs periodically
    if (!this.isHost) {
      this.time.addEvent({
        delay: 50, loop: true, callback: () => {
          if (!this.playing) return
          const inp = {
            left: controls.left, right: controls.right, jump: controls.jump,
            shoot: controls.shoot, pass: controls.pass, power: controls.power,
          }
          if (inp.power) controls.power = false
          fbSet(ref(db, `rooms/${this.roomCode}/inputs/${this.p2 ? 'guest' : 'guest'}`), inp).catch(() => { })
        },
      })
    }
  }

  applyRemoteState(st) {
    this.ball.setPosition(st.ball.x, st.ball.y)
    this.p1.body.setPosition(st.p1.x, st.p1.y || GROUND - 84)
    this.p2.body.setPosition(st.p2.x, st.p2.y || GROUND - 84)
    if (st.s1 !== this.score.p1 || st.s2 !== this.score.p2) {
      this.score.p1 = st.s1; this.score.p2 = st.s2
      this.emitHud()
    }
    this.timeLeft = st.t ?? this.timeLeft
  }

  makeSkinTextures(id, team) {
    const key = `${id}_${team}`
    if (this.textures.exists(`body_${key}`)) return
    const s = getSkin(id)
    const skin = hex(s.skin), hair = hex(s.hair), accent = hex(s.band), shirt = hex(s.jersey)
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    const arc = (a, r) => new Phaser.Math.Vector2(50 + r * Math.cos(a), 40 + r * Math.sin(a))
    // arms hang straight down
    g.fillStyle(shirt).fillRoundedRect(21, 64, 11, 18, 5).fillRoundedRect(68, 64, 11, 18, 5)
    g.fillStyle(skin).fillRoundedRect(23, 78, 8, 10, 4).fillRoundedRect(69, 78, 8, 10, 4)
    g.lineStyle(2, OUT).strokeRoundedRect(21, 64, 11, 18, 5).strokeRoundedRect(68, 64, 11, 18, 5)
      .strokeRoundedRect(23, 78, 8, 10, 4).strokeRoundedRect(69, 78, 8, 10, 4)
    // torso + shorts
    g.fillStyle(shirt).fillRoundedRect(30, 60, 40, 30, 9)
    g.fillStyle(accent).fillRect(32, 78, 36, 3)
    g.lineStyle(3, OUT).strokeRoundedRect(30, 60, 40, 30, 9)
    g.fillStyle(0x23233a).fillRoundedRect(32, 87, 36, 9, 3)
    // ears + head
    g.fillStyle(skin).fillCircle(25, 42, 5).fillCircle(75, 42, 5)
    g.lineStyle(2.5, OUT).strokeCircle(25, 42, 5).strokeCircle(75, 42, 5)
    g.fillStyle(skin).fillCircle(50, 40, 25)
    g.lineStyle(3, OUT).strokeCircle(50, 40, 25)
    // spiky hair
    const pts = []
    for (let i = 0; i < 8; i++) { pts.push(arc(Math.PI + (i * Math.PI) / 8, 25)); pts.push(arc(Math.PI + (i * Math.PI) / 8 + Math.PI / 16, 36)) }
    pts.push(arc(Math.PI * 2, 25))
    g.fillStyle(hair).fillPoints(pts, true)
    const fringe = [[26, 40], [34, 47], [41, 41], [50, 49], [59, 41], [66, 47], [74, 40]].map(([x, y]) => new Phaser.Math.Vector2(x, y))
    g.fillPoints(fringe, true)
    g.lineStyle(2.5, OUT).strokePoints(pts, true).strokePoints(fringe, false)
    // face (calm brows, eyes, small mouth)
    g.fillStyle(0xff8a8a, 0.45).fillCircle(32, 54, 4).fillCircle(68, 54, 4)
    g.fillStyle(0xffffff).fillEllipse(41, 46, 9, 10).fillEllipse(59, 46, 9, 10)
    g.fillStyle(0x1a1a33).fillCircle(42.5, 47, 3).fillCircle(60.5, 47, 3)
    g.fillStyle(0xffffff).fillCircle(43.5, 45.5, 1).fillCircle(61.5, 45.5, 1)
    g.lineStyle(3, 0x3a2414).lineBetween(34, 40, 46, 42).lineBetween(66, 40, 54, 42)
    g.fillStyle(0x8a1c2b).fillEllipse(53, 56, 8, 5)
    g.generateTexture(`body_${key}`, 100, 96); g.clear()
    // leg (pivot at the hip, top-centre)
    g.fillStyle(0x23233a).fillRoundedRect(4, 0, 17, 8, 3)
    g.fillStyle(skin).fillRect(7, 6, 11, 11)
    g.fillStyle(0xffffff).fillRect(6, 16, 13, 10).fillStyle(accent).fillRect(6, 19, 13, 3)
    g.lineStyle(2.5, OUT).strokeRect(6, 16, 13, 10)
    g.fillStyle(0xffffff).fillRoundedRect(3, 24, 26, 12, { tl: 4, tr: 9, bl: 3, br: 6 })
    g.fillStyle(accent).fillRoundedRect(3, 31, 26, 5, { tl: 0, tr: 0, bl: 3, br: 6 })
    g.lineStyle(2.5, OUT).strokeRoundedRect(3, 24, 26, 12, { tl: 4, tr: 9, bl: 3, br: 6 })
    g.generateTexture(`leg_${key}`, 30, 36); g.destroy()
  }

  makePlayer(skinId, dir, team) {
    this.makeSkinTextures(skinId, team)
    const key = `${skinId}_${team}`
    const x = team === 0 ? 300 : W - 300
    const body = this.physics.add.image(x, GROUND - 84, `body_${key}`).setDepth(5)
    body.body.setSize(PW, PH, false).setOffset((100 - PW) / 2, 0)
    body.setCollideWorldBounds(true).setImmovable(true)
    const st = getSkin(skinId).stats
    const m = (v, lo, hi) => lo + (v / 100) * (hi - lo)   // small, balanced gameplay effect of the UI stats
    return {
      spM: m(st.speed, 0.92, 1.08), jM: m(st.jump, 0.94, 1.06), kM: m(st.shot, 0.94, 1.06), pwM: m(st.power, 0.85, 1.25),
      body, dir, team, kickT: 0, cd: 0, hit: false, kick: 'shoot', speed: 380, phase: 0,
      power: 0, armed: false, armedT: 0,
      legB: this.add.image(0, 0, `leg_${key}`).setOrigin(0.42, 0).setDepth(4),
      legF: this.add.image(0, 0, `leg_${key}`).setOrigin(0.42, 0).setDepth(6),
      shadow: this.add.image(x, GROUND - 2, 'shadow').setDepth(1),
      aura: this.add.image(x, GROUND - 80, 'glow').setDepth(3).setTint(0xb86bff).setBlendMode(Phaser.BlendModes.ADD).setScale(2).setVisible(false),
    }
  }

  // ---------------- stadium ----------------
  drawStadium() {
    const T = THEMES[this.cfg.stadium] || THEMES.street
    const g = this.add.graphics().setDepth(0)
    const lerp = Phaser.Math.Linear
    // sky + clouds / sun
    g.fillGradientStyle(T.sky[0], T.sky[0], T.sky[1], T.sky[1], 1).fillRect(0, 0, W, 300)
    if (T.sun) g.fillStyle(0xfff0b0, 0.9).fillCircle(640, 235, 80).fillStyle(0xffd27a, 0.45).fillCircle(640, 235, 130)
    else {
      g.fillStyle(0xffffff, T.sky[0] === 0x0b1b3a ? 0.22 : 0.92)
      ;[[160, 60, 1.2], [330, 110, 0.8], [900, 70, 1], [1100, 120, 0.85]].forEach(([cx, cy, k]) => {
        g.fillCircle(cx, cy, 22 * k).fillCircle(cx + 28 * k, cy + 4, 28 * k).fillCircle(cx + 62 * k, cy + 8, 20 * k).fillRect(cx - 22 * k, cy + 8, 100 * k, 20 * k)
      })
    }
    // far band (sea / skyline) then the coloured surround
    g.fillStyle(T.band).fillRect(0, 262, W, 40).fillStyle(0xffffff, 0.3).fillRect(0, 262, W, 3)
    g.fillStyle(T.surround).fillRect(0, 300, W, H - 300).fillStyle(0x000000, 0.1).fillRect(0, 300, W, 10)
    // pitch in perspective: u = left..right, v = far..near
    const FAR = { y: 340, l: 170, r: 1110 }, NEAR = { y: 620, l: -60, r: 1340 }
    const P = (u, v) => new Phaser.Math.Vector2(
      lerp(lerp(FAR.l, FAR.r, u), lerp(NEAR.l, NEAR.r, u), v), lerp(FAR.y, NEAR.y, v))
    for (let i = 0; i < 12; i++) {
      g.fillStyle(T.grass[i % 2]).fillPoints([P(i / 12, 0), P((i + 1) / 12, 0), P((i + 1) / 12, 1), P(i / 12, 1)], true)
    }
    g.fillStyle(0x000000, 0.2).fillRect(0, NEAR.y, W, H - NEAR.y)
    // pitch lines
    g.lineStyle(4, 0xffffff, 0.95)
    const path = (pts) => g.strokePoints(pts.map(([u, v]) => P(u, v)), false)
    path([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])
    path([[0.5, 0], [0.5, 1]])
    path([[0, 0.22], [0.15, 0.22], [0.15, 0.78], [0, 0.78]])
    path([[1, 0.22], [0.85, 0.22], [0.85, 0.78], [1, 0.78]])
    path([[0, 0.38], [0.06, 0.38], [0.06, 0.62], [0, 0.62]])
    path([[1, 0.38], [0.94, 0.38], [0.94, 0.62], [1, 0.62]])
    path(Array.from({ length: 41 }, (_, i) => [0.5 + 0.075 * Math.cos((i / 40) * Math.PI * 2), 0.5 + 0.17 * Math.sin((i / 40) * Math.PI * 2)]))
    // corner flags
    ;[P(0, 0), P(1, 0)].forEach((c) => {
      g.lineStyle(3, 0xf2f2f2).lineBetween(c.x, c.y, c.x, c.y - 44)
      g.fillStyle(0xe5322d).fillTriangle(c.x, c.y - 44, c.x, c.y - 28, c.x + (c.x < W / 2 ? 22 : -22), c.y - 36)
    })
    // goals (front-on, with net grid)
    ;[0, 1].forEach((side) => {
      const X = (x) => (side ? W - x : x)
      const A = { x: X(0), y: GOAL_TOP - 20 }, B = { x: X(100), y: GOAL_TOP }, C = { x: X(100), y: GROUND + 10 }, D = { x: X(0), y: GROUND - 14 }
      g.fillStyle(0xffffff, 0.12).fillPoints([A, B, C, D], true)
      g.lineStyle(1.5, 0xffffff, 0.55)
      const L = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
      for (let i = 1; i < 12; i++) { const t = i / 12; const p = L(A, D, t), q = L(B, C, t); g.lineBetween(p.x, p.y, q.x, q.y) }
      for (let j = 1; j < 7; j++) { const t = j / 7; const p = L(A, B, t), q = L(D, C, t); g.lineBetween(p.x, p.y, q.x, q.y) }
      g.lineStyle(9, 0xf2f6ff).lineBetween(B.x, B.y, C.x, C.y).lineBetween(A.x, A.y, B.x, B.y)
      g.lineStyle(2, 0x9aa8c8).lineBetween(B.x + (side ? -5 : 5), B.y, C.x + (side ? -5 : 5), C.y)
    })
  }

  // ---------------- flow ----------------
  resetPositions() {
    this.ball.setPosition(W / 2, 180).setVelocity(0, 0)
    this.p1.body.setPosition(300, GROUND - 84).setVelocity(0, 0)
    this.p2.body.setPosition(W - 300, GROUND - 84).setVelocity(0, 0)
  }

  emitHud() {
    this.cfg.onHud?.({
      s1: this.score.p1, s2: this.score.p2, time: this.timeLeft, overtime: this.overtime,
      power: Math.floor(this.p1.power), armed: this.p1.armed,
    })
  }

  tick() {
    if (!this.playing || this.overtime || this.ended) return
    this.timeLeft--
    if (this.timeLeft <= 0) {
      if (this.score.p1 === this.score.p2) this.overtime = true
      else return this.finish()
    }
    this.emitHud()
  }

  beep(f = 440, d = 0.08, type = 'square', v = 0.04) {
    const ctx = this.sound?.context
    if (!ctx || ctx.state !== 'running') return
    const o = ctx.createOscillator(), gn = ctx.createGain()
    o.type = type; o.frequency.value = f
    gn.gain.setValueAtTime(v, ctx.currentTime)
    gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d)
    o.connect(gn); gn.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d)
  }

  summary() {
    const { shots, pa, ph, poss } = this.stats
    const t = poss[0] + poss[1]
    const p1 = t ? Math.round((100 * poss[0]) / t) : 50
    const acc = (i) => (pa[i] ? Math.round((100 * ph[i]) / pa[i]) : null)
    return { shots: [...shots], poss: [p1, 100 - p1], pass: [acc(0), acc(1)] }
  }

  goal(side) {
    if (!this.playing) return
    this.playing = false
    this.score[side]++
    const scorer = side === 'p1' ? this.p1 : this.p2
    scorer.power = Math.min(100, scorer.power + 30)
    this.cameras.main.shake(250, 0.012)
      ;[523, 659, 784].forEach((f, i) => setTimeout(() => this.beep(f, 0.18, 'triangle', 0.06), i * 140))
    this.cfg.onGoal?.(side)
    this.emitHud()
    if (this.overtime) return this.finish()
    this.time.delayedCall(1700, () => {
      this.cfg.onGoal?.(null)
      this.resetPositions()
      this.playing = true
    })
  }

  finish() {
    if (this.ended) return
    this.ended = true; this.playing = false
    this.time.delayedCall(1400, () => this.cfg.onEnd?.({ s1: this.score.p1, s2: this.score.p2, stats: this.summary() }))
  }

  // ---------------- update ----------------
  update(_, dtMs) {
    const dt = Math.min(dtMs, 50) / 1000
    const two = this.cfg.mode === 'two'
    const K = this.keys, C = this.cur
    let pw = Phaser.Input.Keyboard.JustDown(K.U)
    if (controls.power) { pw = true; controls.power = false }
    const i1 = {
      left: K.A.isDown || (!two && C.left.isDown) || controls.left,
      right: K.D.isDown || (!two && C.right.isDown) || controls.right,
      jump: K.W.isDown || (!two && C.up.isDown) || controls.jump,
      shoot: K.J.isDown || K.SPACE.isDown || controls.shoot,
      pass: K.K.isDown || controls.pass,
      power: pw,
    }
    const i2 = two
      ? { left: C.left.isDown, right: C.right.isDown, jump: C.up.isDown, shoot: K.ENTER.isDown, pass: K.L.isDown, power: Phaser.Input.Keyboard.JustDown(K.O) }
      : this.ai()

    this.control(this.p1, i1, dt)
    this.control(this.p2, i2, dt)
    this.ballRules()
    if (this.playing && this.last >= 0) this.stats.poss[this.last] += dt
    this.ball.setAngularVelocity(this.ball.body.velocity.x * 0.9)

    // shadows + super-shot trail
    const sh = (img, x, y) => img.setPosition(x, GROUND - 2).setScale(Phaser.Math.Clamp(1 - (GROUND - y) / 520, 0.45, 1))
    sh(this.ballShadow, this.ball.x, this.ball.y + BALL_R)
    sh(this.p1.shadow, this.p1.body.x, this.p1.body.y + 84)
    sh(this.p2.shadow, this.p2.body.x, this.p2.body.y + 84)
    if (this.superT > 0) { this.superT -= dt; this.trail.emitting = true } else this.trail.emitting = false

    this.hudT += dt
    if (this.hudT > 0.2) { this.hudT = 0; this.emitHud() }
    if (this.online) {
      if (this.isHost) {
        this.control(this.p1, i1, dt)
        const gi = this.guestInput || {}
        const i2o = {
          left: !!gi.left, right: !!gi.right, jump: !!gi.jump,
          shoot: !!gi.shoot, pass: !!gi.pass, power: !!gi.power,
        }
        this.control(this.p2, i2o, dt)
      } else {
        // guest is p2 visually? keep local P1 control too — but host doesn't need it
        // Guest sends inputs to host and receives state. Still allow local animation.
        this.control(this.p2, { ...i1, power: i1.power }, dt)
      }
    } else {
      this.control(this.p1, i1, dt)
      this.control(this.p2, i2, dt)
    }
    if (this.online && this.isHost) {
      this.stateT = (this.stateT || 0) + dt
      if (this.stateT > 0.06) {
        this.stateT = 0
        fbSet(ref(db, `rooms/${this.roomCode}/state`), {
          s1: this.score.p1, s2: this.score.p2, t: this.timeLeft,
          ball: { x: Math.round(this.ball.x), y: Math.round(this.ball.y) },
          p1: { x: Math.round(this.p1.body.x), y: Math.round(this.p1.body.y) },
          p2: { x: Math.round(this.p2.body.x), y: Math.round(this.p2.body.y) },
        }).catch(() => { })
      }
    }
  }

  control(p, inp, dt) {
    const b = p.body
    const onGround = b.body.blocked.down
    let vx = 0
    if (!this.playing) b.setVelocityX(0)
    else {
      vx = inp.left ? -p.speed : inp.right ? p.speed : 0
      b.setVelocityX(vx)
      if (inp.jump && onGround) b.setVelocityY(-800 * p.jM)
      if (p.cd <= 0 && (inp.shoot || inp.pass)) { p.kick = inp.shoot ? 'shoot' : 'pass'; p.kickT = 0.24; p.cd = 0.42; p.hit = false; this.stats[p.kick === 'shoot' ? 'shots' : 'pa'][p.team]++; this.beep(p.kick === 'shoot' ? 180 : 260, 0.06, 'square', 0.03) }
      if (inp.power && p.power >= 100 && !p.armed) { p.armed = true; p.armedT = 8; p.power = 0; this.beep(880, 0.25, 'sawtooth', 0.05); this.emitHud() }
      p.power = Math.min(100, p.power + dt * 2.2 * p.pwM)
    }
    b.x = Phaser.Math.Clamp(b.x, 80, W - 80)
    p.cd -= dt
    if (p.armed) { p.armedT -= dt; if (p.armedT <= 0) p.armed = false }

    // kick contact
    if (p.kickT > 0) {
      p.kickT -= dt
      if (!p.hit && p.kickT < 0.18) {
        const d = Phaser.Math.Distance.Between
        const near = d(b.x + p.dir * 46, b.y + 70, this.ball.x, this.ball.y) < 66 || d(b.x + p.dir * 40, b.y + 30, this.ball.x, this.ball.y) < 64
        if (near) {
          let sx = p.kick === 'pass' ? 560 : 840
          let sy = p.kick === 'pass' ? -140 : (this.ball.y < b.y ? -520 : -380)
          if (p.armed) { sx = 1250; sy = -220; p.armed = false; this.superT = 1.4; this.cameras.main.shake(120, 0.006); this.beep(120, 0.3, 'sawtooth', 0.07) }
          sx *= p.kM
          this.ball.setVelocity(p.dir * (sx + Math.abs(b.body.velocity.x) * 0.3), sy)
          this.last = p.team
          if (p.kick === 'pass') this.stats.ph[p.team]++
          p.power = Math.min(100, p.power + 5)
          p.hit = true
        }
      }
    }

    // animation: run cycle, jump tuck, kick swing
    const moving = vx !== 0 && onGround
    if (moving) p.phase += dt * 16
    const run = moving ? Math.sin(p.phase) * 0.3 : 0
    const air = onGround ? 0 : 0.1
    const swing = p.kickT > 0 ? Math.sin((1 - p.kickT / 0.24) * Math.PI) : 0
    const kickAng = (p.kick === 'shoot' ? 1.1 : 0.7) * swing
    const hipY = b.y + 48
    p.legF.setPosition(b.x + p.dir * 7, hipY).setRotation(-p.dir * (kickAng + (p.kickT > 0 ? 0 : run + air))).setFlipX(p.dir < 0)
    p.legB.setPosition(b.x - p.dir * 7, hipY).setRotation(-p.dir * (-run - air * 0.7)).setFlipX(p.dir < 0)
    b.setFlipX(p.dir < 0)
    p.aura.setVisible(p.armed).setPosition(b.x, b.y + 10).setAlpha(0.7 + 0.3 * Math.sin(this.time.now / 90))
  }

  ai() {
    const d = DIFFS[this.cfg.diff] || DIFFS.normal
    const b = this.ball, h = this.p2.body
    const inp = { left: false, right: false, jump: false, shoot: false, pass: false, power: false }
    const target = b.x > W * 0.3 ? b.x + 64 : W - 230
    const dx = target - h.x
    if (Math.abs(dx) > 16) dx < 0 ? (inp.left = true) : (inp.right = true)
    if (Math.abs(b.x - h.x) < 170 && b.y < h.y - 30 && Math.random() < d.jump) inp.jump = true
    if (Phaser.Math.Distance.Between(h.x - 46, h.y + 74, b.x, b.y) < 84 && Math.random() < d.react) {
      Math.random() < 0.75 ? (inp.shoot = true) : (inp.pass = true)
    }
    return inp
  }

  ballRules() {
    const b = this.ball
    if (b.x < BALL_R) {
      if (b.y < GOAL_TOP) { b.setX(BALL_R); b.body.velocity.x = Math.abs(b.body.velocity.x) * 0.8 }
      else if (b.x < 14) this.goal('p2')
    } else if (b.x > W - BALL_R) {
      if (b.y < GOAL_TOP) { b.setX(W - BALL_R); b.body.velocity.x = -Math.abs(b.body.velocity.x) * 0.8 }
      else if (b.x > W - 14) this.goal('p1')
    }
  }
  shutdown() {
    if (this.unsub) this.unsub()
  }
}