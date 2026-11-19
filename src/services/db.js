import {
  ref, get, set, update, onValue, runTransaction, query, orderByChild,
  limitToLast, push, remove, serverTimestamp,
} from 'firebase/database'
import { db } from '../firebase'
import { getSkin } from '../skins'
import { getPower, DEFAULT_POWER } from '../powers'
// src/services/db.js
import packsData from '../../shared/packs.json'

const newProfile = (name) => ({
  name,
  coins: 200,
  diamonds: 0,
  trophies: 0,
  wins: 0, losses: 0, draws: 0,
  goals: 0,
  bestScore: 0,
  skin: 'rookie',
  owned: { rookie: true },
  power: DEFAULT_POWER,
  ownedPowers: { bolt: true, dash: true },
  createdAt: Date.now(),
})

export async function ensureProfile(user, name) {
  const r = ref(db, `users/${user.uid}`)
  const snap = await get(r)
  if (!snap.exists()) {
    await set(r, newProfile(name || user.displayName || `Player${user.uid.slice(0, 4)}`))
  } else {
    // migrate old profiles
    const p = snap.val()
    const patch = {}
    if (p.diamonds === undefined) patch.diamonds = 0
    if (!p.power) patch.power = DEFAULT_POWER
    if (!p.ownedPowers) patch.ownedPowers = { bolt: true, dash: true }
    if (Object.keys(patch).length) await update(r, patch)
  }
}

export const subscribeProfile = (uid, cb) =>
  onValue(ref(db, `users/${uid}`), (s) => cb(s.val()))

export function subscribeLeaderboard(cb, n = 20) {
  const q = query(ref(db, 'users'), orderByChild('trophies'), limitToLast(n))
  return onValue(q, (s) => {
    const rows = []
    s.forEach((c) => rows.push({ uid: c.key, ...c.val() }))
    // highest trophies first
    rows.sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
    cb(rows)
  })
}

export function saveMatch(uid, { s1, rewards }) {
  return runTransaction(ref(db, `users/${uid}`), (p) => {
    if (!p) return p
    p.coins = (p.coins || 0) + rewards.coins
    p.trophies = Math.max(0, (p.trophies || 0) + rewards.trophies)
    p.goals = (p.goals || 0) + s1
    p.bestScore = Math.max(p.bestScore || 0, s1)
    if (rewards.result === 'win') p.wins = (p.wins || 0) + 1
    else if (rewards.result === 'loss') p.losses = (p.losses || 0) + 1
    else p.draws = (p.draws || 0) + 1
    return p
  })
}

export function buySkin(uid, skinId) {
  const price = getSkin(skinId).price
  return runTransaction(ref(db, `users/${uid}`), (p) => {
    if (!p) return p
    if (p.owned && p.owned[skinId]) return p
    if ((p.coins || 0) < price) return
    p.coins -= price
    p.owned = { ...(p.owned || {}), [skinId]: true }
    return p
  })
}

export const selectSkin = (uid, skinId) =>
  update(ref(db, `users/${uid}`), { skin: skinId })

/* ---------- POWERS ---------- */

export function buyPower(uid, powerId) {
  const power = getPower(powerId)
  if (!power || power.currency === 'free') return Promise.resolve(false)
  return runTransaction(ref(db, `users/${uid}`), (p) => {
    if (!p) return p
    if (p.ownedPowers && p.ownedPowers[powerId]) return p // already owned
    const field = power.currency === 'diamonds' ? 'diamonds' : 'coins'
    if ((p[field] || 0) < power.price) return // abort
    p[field] -= power.price
    p.ownedPowers = { ...(p.ownedPowers || {}), [powerId]: true }
    return p
  })
}

export const equipPower = (uid, powerId) =>
  update(ref(db, `users/${uid}`), { power: powerId })

/* ---------- DIAMONDS (Razorpay) ---------- */

export const DIAMOND_PACKS = packsData.DIAMOND_PACKS

/**
 * Creates a Razorpay order on your backend and returns order info.
 * You MUST have a server endpoint at VITE_API_URL/razorpay/order
 * that calls Razorpay Orders API with your secret key.
 *
 * The client then opens Razorpay Checkout, gets payment_id + signature,
 * and calls POST VITE_API_URL/razorpay/verify to credit diamonds.
 */
export async function createRazorpayOrder(packId) {
  const pack = DIAMOND_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error('Invalid pack')
  const base = import.meta.env.VITE_API_URL
  if (!base) throw new Error('VITE_API_URL not configured')
  const res = await fetch(`${base}/razorpay/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packId, amount: pack.priceINR * 100, currency: 'INR' }),
  })
  if (!res.ok) throw new Error('Order creation failed')
  return res.json() // { id, amount, currency, keyId }
}

export async function verifyRazorpayPayment(payload, uid) {
  const base = import.meta.env.VITE_API_URL
  const res = await fetch(`${base}/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, uid }),
  })
  if (!res.ok) throw new Error('Payment verification failed')
  return res.json() // { ok, diamonds }
}

/**
 * Fallback (dev only): credit diamonds directly via a secure Cloud Function.
 * NEVER expose this kind of write in production without server verification.
 */
export async function creditDiamondsDev(uid, amount) {
  return runTransaction(ref(db, `users/${uid}/diamonds`), (d) => (d || 0) + amount)
}

/* ---------- MULTIPLAYER ROOMS ---------- */

export function createRoom(uid, name) {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase()
  const roomRef = ref(db, `rooms/${code}`)
  return set(roomRef, {
    code, host: uid, hostName: name,
    guest: null, guestName: null,
    status: 'waiting',
    createdAt: serverTimestamp(),
    state: { s1: 0, s2: 0, t: 120, ball: { x: 640, y: 180 }, p1: { x: 300 }, p2: { x: 980 } },
  }).then(() => code)
}

export function joinRoom(code, uid, name) {
  return runTransaction(ref(db, `rooms/${code}`), (r) => {
    if (!r) return
    if (r.host === uid) return r
    if (r.guest) return // room full
    r.guest = uid
    r.guestName = name
    r.status = 'ready'
    return r
  })
}

export function subscribeRoom(code, cb) {
  const r = ref(db, `rooms/${code}`)
  return onValue(r, (s) => cb(s.val()))
}

export function updateRoomState(code, patch) {
  return update(ref(db, `rooms/${code}/state`), patch)
}

export function leaveRoom(code) {
  return remove(ref(db, `rooms/${code}`))
}

export function pushInput(code, uid, input) {
  return set(ref(db, `rooms/${code}/inputs/${uid}`), input)
}