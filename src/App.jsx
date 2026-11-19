import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { ref as dbRef, get, update, runTransaction } from 'firebase/database'
import { auth, db } from './firebase'
import {
  ensureProfile, subscribeProfile, saveMatch, buySkin, selectSkin,
  buyPower, equipPower, DIAMOND_PACKS,
  createRoom, subscribeRoom, updateRoomState, leaveRoom,
} from './services/db'
import { calcRewards } from './ranks'
import { SKINS } from './skins'
import { STADIUMS } from './stadiums'
import { enterFullscreen } from './game/fullscreen'
import PhaserGame from './game/PhaserGame'
import {
  AuthScreen, LoadingScreen, VsScreen, Menu, Mode, Shop, Settings, Ranking, Hud, Result,
  Powers, Diamonds, Multiplayer,
} from './screens'

/* ============================================================
   PAYMENT SERVER HELPERS  (fixes "Failed to fetch")
   - Set VITE_API_URL in .env (e.g. https://your-server.com) for production.
   - Otherwise it uses the same host as the page on port 3001, so it also
     works when you open the game on your phone via your PC's LAN IP.
   ============================================================ */
const API_URL = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3001`)
  .replace(/\/+$/, '')

async function api(path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
  } catch {
    throw new Error(`Cannot reach payment server (${API_URL}). Make sure it is running.`)
  }
  let data = null
  try { data = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`)
  return data
}

const createRazorpayOrder = (packId) => api('/razorpay/order', { packId })
const verifyRazorpayPayment = (resp, uid) => api('/razorpay/verify', {
  razorpay_order_id: resp.razorpay_order_id,
  razorpay_payment_id: resp.razorpay_payment_id,
  razorpay_signature: resp.razorpay_signature,
  uid,
})

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Razorpay checkout (check internet).'))
    document.body.appendChild(s)
  })
}

/* ============================================================
   JOIN ROOM  (fixes "Room not found or full")
   ============================================================ */
async function joinRoomSafe(rawCode, uid, name) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) throw new Error('Enter a room code')

  const roomRef = dbRef(db, `rooms/${code}`)
  const snap = await get(roomRef)
  if (!snap.exists()) throw new Error('Room not found. Check the code.')

  const room = snap.val()
  if (room.host === uid) throw new Error('You created this room. Share the code with a friend.')
  if (room.status === 'playing') throw new Error('Match already started.')
  if (room.guest && room.guest !== uid) throw new Error('Room is full.')

  const res = await runTransaction(dbRef(db, `rooms/${code}/guest`), (cur) => {
    if (!cur || cur === uid) return uid
    return undefined // someone else took it
  })
  if (!res.committed) throw new Error('Room is full.')

  await update(roomRef, { guestName: name || 'Guest' })
  return { committed: true }
}

/* ============================================================
   LANDSCAPE HINT (for devices that can't lock orientation, e.g. iPhone)
   ============================================================ */
const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches

function RotateHint() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#0b1b3a', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, textAlign: 'center', fontFamily: 'sans-serif', padding: 24,
    }}>
      <div style={{ fontSize: 64, transform: 'rotate(90deg)' }}>📱</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Rotate your phone to landscape</div>
    </div>
  )
}

/* ============================================================
   FULL-VIEWPORT SHELL for Loading / Auth screens
   Pinned to the viewport so it always covers the whole screen,
   on any device size or orientation, independent of #root / .app.
   ============================================================ */
const SHELL_CSS = `
.fs-shell {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  width: 100vw; height: 100vh; height: 100dvh;
  display: flex; flex-direction: column;
  margin: 0; padding: 0; overflow: hidden;
  background: #0a1650; z-index: 1;
}
.fs-shell > .stage {
  flex: 1 1 auto; width: 100%; height: 100%;
  min-height: 0; min-width: 0;
}
.fs-shell > .loading {
  justify-content: center;
  padding: calc(var(--st, 0px) + 12px) 16px calc(var(--sb, 0px) + 28px);
}
.fs-shell > .loading .logo { margin: 0 0 auto; margin-top: clamp(12px, 8vh, 80px); }
@media (max-height: 460px) {
  .fs-shell > .loading { gap: 8px; padding-bottom: 12px; }
  .fs-shell > .loading .logo { margin-top: 4px; transform: scale(0.8); transform-origin: top center; }
}
`

function FullScreenShell({ children }) {
  return (
    <>
      <style>{SHELL_CSS}</style>
      <div className="fs-shell">{children}</div>
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [screen, setScreen] = useState('menu')
  const [match, setMatch] = useState(null)
  const [hud, setHud] = useState({ s1: 0, s2: 0, time: 120, overtime: false, power: 0, armed: false })
  const [banner, setBanner] = useState(false)
  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState(null)
  const [setup, setSetup] = useState({ time: 120, stadium: 'sunset' })
  const [portrait, setPortrait] = useState(false)
  const profileRef = useRef(null)
  profileRef.current = profile
  const go = (s, o) => { if (o) setSetup(o); setScreen(s) }

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) setProfile(null) }), [])
  useEffect(() => {
    if (!user) return
    ensureProfile(user).catch(console.error)
    return subscribeProfile(user.uid, setProfile)
  }, [user])

  useEffect(() => {
    if (screen !== 'vs') return
    const t = setTimeout(() => setScreen('play'), 1800)
    return () => clearTimeout(t)
  }, [screen])

  // Auto fullscreen + landscape lock on the first tap (browsers require a user gesture)
  useEffect(() => {
    if (!isTouch()) return
    const onTap = () => { if (!document.fullscreenElement) enterFullscreen() }
    window.addEventListener('pointerdown', onTap)
    return () => window.removeEventListener('pointerdown', onTap)
  }, [])

  // Track portrait/landscape for the rotate hint
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const upd = () => setPortrait(mq.matches)
    upd()
    mq.addEventListener?.('change', upd)
    return () => mq.removeEventListener?.('change', upd)
  }, [])

  // Loading / auth screens: always cover the entire viewport
  if (user === undefined || (user && !profile))
    return <FullScreenShell><LoadingScreen /></FullScreenShell>
  if (!user) return <FullScreenShell><AuthScreen /></FullScreenShell>

  const start = (mode, diff, opts = {}) => {
    const p = profileRef.current
    const mine = SKINS.find((s) => s.id === p.skin) || SKINS[0]
    const others = SKINS.filter((s) => s.jersey !== mine.jersey)
    const p2Skin = others[Math.floor(Math.random() * others.length)].id
    const time = opts.time || 120, stadium = opts.stadium || 'sunset'
    setHud({ s1: 0, s2: 0, time, overtime: false, power: 0, armed: false })
    setBanner(false); setPaused(false)
    setMatch({
      key: Date.now(), mode, diff,
      names: [p.name, opts.p2Name || (mode === 'two' ? 'Player 2' : 'CPU')],
      skins: [p.skin, p2Skin],
      cfg: {
        mode, diff, time, stadium, p1Skin: p.skin, p2Skin,
        p1Power: p.power || 'bolt',
        onHud: setHud,
        onGoal: (side) => setBanner(!!side),
        onEnd: async ({ s1, s2, stats }) => {
          const base = { s1, s2, stats, mode, diff, time, stadium, names: [p.name, opts.p2Name || (mode === 'two' ? 'Player 2' : 'CPU')], skins: [p.skin, p2Skin] }
          if (mode === 'ai') {
            const rewards = calcRewards(s1, s2, diff)
            try { await saveMatch(user.uid, { s1, rewards }) } catch (e) { console.error(e) }
            setResult({ ...base, rewards })
          } else setResult(base)
          setScreen('result')
        },
      },
    })
    setScreen('vs')
    if (isTouch()) enterFullscreen()
  }

  const startOnline = (code, isHost, names, skins) => {
    setHud({ s1: 0, s2: 0, time: setup.time, overtime: false, power: 0, armed: false })
    setBanner(false); setPaused(false)
    setMatch({
      key: Date.now(), mode: 'online', diff: 'normal',
      names, skins,
      cfg: {
        mode: 'online', diff: 'normal', time: setup.time, stadium: setup.stadium,
        p1Skin: skins[0], p2Skin: skins[1], p1Power: profile.power,
        roomCode: code, isHost,
        onHud: setHud,
        onGoal: (side) => setBanner(!!side),
        onEnd: ({ s1, s2, stats }) => {
          setResult({ s1, s2, stats, mode: 'online', diff: 'normal', names, skins })
          setScreen('result')
        },
      },
    })
    setScreen('vs')
    if (isTouch()) enterFullscreen()
  }

  const inGame = screen === 'vs' || screen === 'play'

  return (
    <div className="app">
      {inGame && portrait && isTouch() && <RotateHint />}

      {screen === 'menu' && <Menu p={profile} go={go} />}

      {screen === 'mode' && (
        <Mode back={() => setScreen('menu')} go={go} start={start} />
      )}

      {screen === 'settings' && (
        <Settings p={profile} back={() => setScreen('menu')} go={go} onLogout={() => signOut(auth)} />
      )}

      {screen === 'shop' && (
        <Shop
          p={profile}
          go={go}
          back={() => setScreen('menu')}
          select={(id) => selectSkin(user.uid, id)}
          buy={async (id) => {
            const r = await buySkin(user.uid, id)
            return r.committed && r.snapshot.val()?.owned?.[id]
          }}
        />
      )}

      {screen === 'rank' && <Ranking uid={user.uid} back={() => setScreen('menu')} />}

      {screen === 'powers' && (
        <Powers
          p={profile}
          go={go}
          back={() => setScreen('menu')}
          equip={(id) => equipPower(user.uid, id)}
          buy={(id) => buyPower(user.uid, id)}
        />
      )}

      {screen === 'diamonds' && (
        <Diamonds
          p={profile}
          go={go}
          back={() => setScreen('menu')}
          packs={DIAMOND_PACKS}
          checkout={async (packId) => {
            await loadRazorpay()
            const order = await createRazorpayOrder(packId)
            return new Promise((resolve, reject) => {
              if (!window.Razorpay) return reject(new Error('Razorpay not loaded'))
              const rz = new window.Razorpay({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: 'Head Kick Arena',
                description: 'Diamond pack',
                order_id: order.id,
                handler: async (resp) => {
                  try {
                    await verifyRazorpayPayment(resp, user.uid)
                    resolve(true)
                  } catch (e) { reject(e) }
                },
                modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
                theme: { color: '#ffcc33' },
              })
              rz.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed')))
              rz.open()
            })
          }}
        />
      )}

      {screen === 'multiplayer' && (
        <Multiplayer
          p={{ ...profile, uid: user.uid }}
          back={() => setScreen('mode')}
          createRoom={() => createRoom(user.uid, profile.name)}
          joinRoom={(code) => joinRoomSafe(code, user.uid, profile.name)}
          subscribeRoom={(code, cb) => subscribeRoom(code, (r) => cb(r ? { code, ...r } : r))}
          leaveRoom={leaveRoom}
          updateState={updateRoomState}
          onStart={startOnline}
        />
      )}

      {screen === 'vs' && match && <VsScreen names={match.names} skins={match.skins} />}

      {screen === 'play' && match && (
        <div className="game-wrap" style={{ background: STADIUMS.find((s) => s.id === match.cfg.stadium)?.css }}>
          <div className="game-frame">
            <PhaserGame key={match.key} cfg={match.cfg} paused={paused} />
          </div>
          <Hud
            hud={hud}
            names={match.names}
            skins={match.skins}
            banner={banner}
            paused={paused}
            onPause={() => setPaused(true)}
            onResume={() => setPaused(false)}
            onQuit={() => { setPaused(false); setMatch(null); setScreen('menu') }}
          />
        </div>
      )}

      {screen === 'result' && result && (
        <Result
          r={result}
          p={profile}
          again={() => (result.mode === 'online'
            ? setScreen('multiplayer')
            : start(result.mode, result.diff, { time: result.time, stadium: result.stadium }))}
          menu={() => { setMatch(null); setScreen('menu') }}
        />
      )}
    </div>
  )
}