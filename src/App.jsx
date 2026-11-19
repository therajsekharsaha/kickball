import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import {
  ensureProfile, subscribeProfile, saveMatch, buySkin, selectSkin,
  buyPower, equipPower, DIAMOND_PACKS, createRazorpayOrder, verifyRazorpayPayment,
  createRoom, joinRoom, subscribeRoom, updateRoomState, leaveRoom,
} from './services/db'
import { calcRewards } from './ranks'
import { SKINS } from './skins'
import { STADIUMS } from './stadiums'
import PhaserGame from './game/PhaserGame'
import {
  AuthScreen, LoadingScreen, VsScreen, Menu, Mode, Shop, Settings, Ranking, Hud, Result,
  Powers, Diamonds, Multiplayer,
} from './screens'

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

  if (user === undefined || (user && !profile))
    return <LoadingScreen />
  if (!user) return <AuthScreen />

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
  }

  return (
    <div className="app">
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
                theme: { color: '#ffcc33' },
              })
              rz.on('payment.failed', () => reject(new Error('Payment failed')))
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
          joinRoom={(code) => joinRoom(code, user.uid, profile.name)}
          subscribeRoom={subscribeRoom}
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