import { useEffect, useState } from 'react'
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import {
  faFutbol, faTrophy, faRankingStar, faUsers, faGear, faPlay, faShoePrints, faArrowRight,
  faArrowUp, faHouse, faLock, faCheck, faEnvelope, faKey, faBolt, faGem, faCopy, faDoorOpen,
  faPlus, faChevronLeft, faChevronRight, faRightFromBracket, faUser, faXmark, faPause, faStar,
  faCaretLeft, faCaretRight,
} from '@fortawesome/free-solid-svg-icons'
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInAnonymously, updateProfile,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { ensureProfile, subscribeLeaderboard } from './services/db'
import { SKINS, getSkin } from './skins'
import { STADIUMS, MATCH_LENGTHS } from './stadiums'
import { RANKS, DIFFS, getRank, nextRank } from './ranks'
import { POWERS } from './powers'
import { controls } from './game/controls'

const OUT = '#1a0f0a'
const fmt = (n) => (n || 0).toLocaleString('en-US')
const mmss = (t) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

/* ============== Character art (SVG, drawn from skins.js colours) ============== */
const HAIR = 'M42 84 C36 60 44 40 58 38 L56 18 L78 32 L92 10 L108 32 L130 16 L130 38 C150 40 164 60 158 84 C152 66 138 56 124 58 L108 74 L96 56 L76 70 L62 58 C50 62 44 72 42 84 Z'

function Face({ s }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <circle cx="44" cy="86" r="11" fill={s.skin} stroke={OUT} strokeWidth="5" />
      <circle cx="156" cy="86" r="11" fill={s.skin} stroke={OUT} strokeWidth="5" />
      <circle cx="100" cy="82" r="58" fill={s.skin} stroke={OUT} strokeWidth="5" />
      <path d={HAIR} fill={s.hair} stroke={OUT} strokeWidth="5" />
      <circle cx="66" cy="110" r="8" fill="#ff6a6a" opacity=".5" />
      <circle cx="134" cy="110" r="8" fill="#ff6a6a" opacity=".5" />
      <ellipse cx="78" cy="94" rx="11" ry="12.5" fill="#fff" stroke={OUT} strokeWidth="3" />
      <ellipse cx="122" cy="94" rx="11" ry="12.5" fill="#fff" stroke={OUT} strokeWidth="3" />
      <circle cx="81" cy="96" r="5.5" fill="#1a1a33" />
      <circle cx="119" cy="96" r="5.5" fill="#1a1a33" />
      <circle cx="83" cy="93" r="1.8" fill="#fff" />
      <circle cx="121" cy="93" r="1.8" fill="#fff" />
      <path d="M58 74 L94 88" stroke={OUT} strokeWidth="8" />
      <path d="M142 74 L106 88" stroke={OUT} strokeWidth="8" />
      <path d="M86 122 Q100 113 114 122 Q100 134 86 122 Z" fill="#7a1c2b" stroke={OUT} strokeWidth="3" />
    </g>
  )
}

/** Round avatar (face only). `size` may be a number (px) or any CSS size. */
export function Head({ skin, size = 120 }) {
  const s = getSkin(skin)
  return (
    <div className="head" style={{ width: size, aspectRatio: '1' }}>
      <svg viewBox="26 8 148 148" width="100%" height="100%"><Face s={s} /></svg>
    </div>
  )
}

/** Full-body character: upright, symmetrical stance (limbs hang straight, no slanted arms/legs). */
export function Fighter({ skin, flip, size = 220, className = '' }) {
  const s = getSkin(skin)
  return (
    <svg viewBox="0 0 200 270" className={`fighter ${className}`}
      style={{ width: size, transform: flip ? 'scaleX(-1)' : undefined }}>
      <ellipse cx="100" cy="263" rx="60" ry="7" fill="#0007" />
      <g strokeLinejoin="round" strokeLinecap="round" stroke={OUT} strokeWidth="4">
        <rect x="77" y="206" width="19" height="40" rx="6" fill={s.skin} />
        <rect x="104" y="206" width="19" height="40" rx="6" fill={s.skin} />
        <rect x="76" y="228" width="21" height="22" rx="5" fill="#fff" />
        <rect x="103" y="228" width="21" height="22" rx="5" fill="#fff" />
        <rect x="77" y="236" width="19" height="6" fill={s.band} stroke="none" />
        <rect x="104" y="236" width="19" height="6" fill={s.band} stroke="none" />
        <rect x="68" y="247" width="30" height="13" rx="6" fill={s.trim} />
        <rect x="102" y="247" width="30" height="13" rx="6" fill={s.trim} />
        <rect x="46" y="118" width="20" height="46" rx="10" fill={s.jersey} />
        <rect x="134" y="118" width="20" height="46" rx="10" fill={s.jersey} />
        <rect x="49" y="158" width="14" height="30" rx="7" fill={s.skin} />
        <rect x="137" y="158" width="14" height="30" rx="7" fill={s.skin} />
        <circle cx="56" cy="192" r="9" fill={s.skin} />
        <circle cx="144" cy="192" r="9" fill={s.skin} />
        <rect x="64" y="106" width="72" height="86" rx="20" fill={s.jersey} />
        <path d="M66 170 H134" stroke={s.trim} strokeWidth="5" />
        <rect x="68" y="184" width="64" height="30" rx="9" fill={s.trim} />
        <path d="M100 198 V214" strokeWidth="3" />
      </g>
      <text x="100" y="152" textAnchor="middle" transform={flip ? 'translate(200 0) scale(-1 1)' : undefined} fontFamily="Lilita One, sans-serif" fontSize="30"
        fill="#fff" stroke={OUT} strokeWidth="1.5" paintOrder="stroke">{s.num}</text>
      <g transform="translate(28 11) scale(.72)"><Face s={s} /></g>
    </svg>
  )
}

const Ball = ({ className }) => (
  <svg className={className} viewBox="0 0 60 60" aria-hidden="true">
    <circle cx="30" cy="30" r="27" fill="#fff" stroke="#1b1b1b" strokeWidth="3" />
    <path d="M30 18 L40 25 L36 37 L24 37 L20 25 Z" fill="#1b1b1b" />
    <path d="M30 18 V4 M40 25 L54 20 M36 37 L44 50 M24 37 L16 50 M20 25 L6 20" stroke="#1b1b1b" strokeWidth="2.5" />
  </svg>
)

export function RankBadge({ trophies, big }) {
  const r = getRank(trophies)
  return (
    <span className={`rank ${big ? 'big' : ''}`} style={{ color: r.color, borderColor: r.color }}>
      <Icon icon={r.icon} /> {r.name}
    </span>
  )
}

export const Stat = ({ icon, value, color }) => (
  <span className="stat"><Icon icon={icon} style={{ color }} /> {value}</span>
)

const Logo = () => (
  <div className="logo">
    <span className="l1">HEAD KICK</span>
    <span className="l2">ARENA</span>
    <Ball className="logo-ball" />
  </div>
)

const CloseBtn = ({ onClick }) => (
  <button className="closebtn" aria-label="Close" onClick={onClick}><Icon icon={faXmark} /></button>
)

const TABS = [['shop', faUser, 'Players'], ['powers', faBolt, 'Powers'], ['diamonds', faGem, 'Diamonds']]
const Tabs = ({ active, go }) => (
  <div className="tabs">
    {TABS.map(([id, ic, label]) => (
      <button key={id} className={`tab ${active === id ? 'on' : ''}`} aria-label={label}
        onClick={() => active !== id && go(id)}><Icon icon={ic} /><span>{label}</span></button>
    ))}
  </div>
)

const CurrencyPills = ({ p }) => (
  <div className="hstats">
    <span className="hpill"><i className="coin" />{fmt(p.coins)}</span>
    <span className="hpill"><Icon icon={faGem} className="gem" />{fmt(p.diamonds)}</span>
  </div>
)

/** Generic blue screen: title + close on top, scrolling body below. */
const Shell = ({ title, back, right, tabs, children }) => (
  <div className="blue-screen">
    <div className="bs-head">
      <h2 className="bigtitle">{title}</h2>
      <div className="grow" />
      {right}
      <CloseBtn onClick={back} />
    </div>
    {tabs}
    <div className="bs-body">{children}</div>
  </div>
)

/* ============== Loading ============== */
export function LoadingScreen() {
  return (
    <div className="stage stadium-bg loading">
      <Logo />
      <div className="lbar"><i /></div>
      <div className="ltext">Preparing characters</div>
    </div>
  )
}

/* ============== Auth ============== */
export function AuthScreen() {
  const [mode, setMode] = useState('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn) => {
    setErr(''); setBusy(true)
    try { await fn() } catch (e) {
      setErr(e.code ? e.code.replace('auth/', '').replace(/-/g, ' ') : e.message)
    }
    setBusy(false)
  }

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      if (mode === 'up') {
        const n = name.trim() || 'Player'
        const cred = await createUserWithEmailAndPassword(auth, email, pass)
        await updateProfile(cred.user, { displayName: n })
        await ensureProfile(cred.user, n)
      } else await signInWithEmailAndPassword(auth, email, pass)
    })
  }

  return (
    <div className="stage stadium-bg center-stage">
      <Logo />
      <form className="dialog auth" onSubmit={submit}>
        <div className="dialog-head">{mode === 'in' ? 'Sign in' : 'Create account'}</div>
        <div className="dialog-body">
          <div className="seg">
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
          </div>
          {mode === 'up' && (
            <label className="field"><Icon icon={faUser} /><input placeholder="Player name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} /></label>
          )}
          <label className="field"><Icon icon={faEnvelope} /><input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><Icon icon={faKey} /><input type="password" required minLength={6} placeholder="Password (6+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          {err && <div className="err">{err}</div>}
          <button className="gbtn green wide" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
          <div className="row">
            <button type="button" className="gbtn blue sm" disabled={busy} onClick={() => run(async () => {
              const c = await signInWithPopup(auth, googleProvider); await ensureProfile(c.user)
            })}><Icon icon={faGoogle} /> Google</button>
            <button type="button" className="gbtn orange sm" disabled={busy} onClick={() => run(async () => {
              const c = await signInAnonymously(auth)
              await ensureProfile(c.user, `Guest${c.user.uid.slice(0, 4)}`)
            })}><Icon icon={faUser} /> Guest</button>
          </div>
        </div>
      </form>
    </div>
  )
}

/* ============== 1. Main lobby ============== */
export function Menu({ p, go }) {
  const nxt = nextRank(p.trophies)
  return (
    <div className="stage stadium-bg lobby">
      <div className="topbar">
        <span className="hpill me"><Head skin={p.skin} size="1.7em" /><span className="nmtxt">{p.name}</span></span>
        <span className="hpill"><Icon icon={faStar} className="star" />{fmt(p.trophies)}/{nxt ? nxt.min : 'MAX'}</span>
        <span className="hpill"><i className="coin" />{fmt(p.coins)}</span>
        <button className="hpill" onClick={() => go('diamonds')} aria-label="Buy diamonds">
          <Icon icon={faGem} className="gem" />{fmt(p.diamonds)}<b className="plus"><Icon icon={faPlus} /></b>
        </button>
        <div className="grow" />
        <div className="rbtns">
          <button className="rbtn" aria-label="Ranking" onClick={() => go('rank')}><Icon icon={faRankingStar} /></button>
          <button className="rbtn" aria-label="Settings" onClick={() => go('settings')}><Icon icon={faGear} /></button>
        </div>
      </div>

      <div className="lobby-center"><Logo /></div>

      <div className="pedestal">
        <Fighter skin={p.skin} />
        <div className="ped-base" />
      </div>

      <div className="lobby-bottom">
        <div className="ltabs">
          <button className="ltab on" onClick={() => go('shop')}><Icon icon={faUsers} />Players</button>
          <button className="ltab" onClick={() => go('powers')}><Icon icon={faBolt} />Powers</button>
          <button className="ltab" onClick={() => go('rank')}><Icon icon={faTrophy} />Rank</button>
          <button className="ltab" onClick={() => go('settings')}><Icon icon={faGear} />Settings</button>
        </div>
        <button className="play-btn" onClick={() => go('mode')}><Icon icon={faPlay} />Play</button>
      </div>
    </div>
  )
}

/* ============== 2. Mode / match setup ============== */
export function Mode({ back, go, start }) {
  const [mode, setMode] = useState('cpu')     // cpu = 1v1 vs CPU | online = Tournament (rooms) | local = Practice (2 players)
  const [st, setSt] = useState(0)
  const [len, setLen] = useState(120)
  const [diff, setDiff] = useState('normal')
  const stadium = STADIUMS[st]
  const setup = { time: len, stadium: stadium.id }

  const find = () => {
    if (mode === 'cpu') start('ai', diff, setup)
    else if (mode === 'local') start('two', 'normal', setup)
    else go('multiplayer', setup)
  }
  const MODES = [['cpu', faFutbol, '1v1'], ['online', faTrophy, 'Tournament'], ['local', faUsers, 'Practice']]

  return (
    <Shell title="Select mode" back={back}>
      <div className="narrow">
        <div className="modes">
          {MODES.map(([id, ic, label]) => (
            <button key={id} className={`gcard ${mode === id ? 'sel' : ''}`} onClick={() => setMode(id)}>
              <span className="mode-ico"><Icon icon={ic} /></span>
              <b className="ctitle">{label}</b>
            </button>
          ))}
        </div>

        <div className="opts">
          <div>
            <h3 className="lbl">Stadium</h3>
            <div className="stadium-pick">
              <button className="arrow-sq" aria-label="Previous stadium"
                onClick={() => setSt((st + STADIUMS.length - 1) % STADIUMS.length)}><Icon icon={faChevronLeft} /></button>
              <div className="stadium-prev" style={{ background: stadium.css }}><span>{stadium.name}</span></div>
              <button className="arrow-sq" aria-label="Next stadium"
                onClick={() => setSt((st + 1) % STADIUMS.length)}><Icon icon={faChevronRight} /></button>
            </div>
          </div>
          <div>
            <h3 className="lbl">Match length</h3>
            <div className="chips">
              {MATCH_LENGTHS.map((l) => (
                <button key={l} className={`chip ${len === l ? 'on' : ''}`} onClick={() => setLen(l)}>{l}s</button>
              ))}
            </div>
            {mode === 'cpu' && (
              <>
                <h3 className="lbl" style={{ marginTop: 10 }}>Difficulty</h3>
                <div className="chips">
                  {Object.entries(DIFFS).map(([k, d]) => (
                    <button key={k} className={`chip ${diff === k ? 'on' : ''}`} onClick={() => setDiff(k)}>
                      {d.label} <small>x{d.mult}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mode-go">
          <button className="gbtn green xl" onClick={find}>{mode === 'local' ? 'Start practice' : 'Find match'}</button>
        </div>
      </div>
    </Shell>
  )
}

/* ============== 3. Character select (shop) ============== */
const STAT_ROWS = [['speed', 'SPEED'], ['jump', 'JUMP'], ['shot', 'SHOOT'], ['power', 'POWER']]

export function Shop({ p, back, go, buy, select }) {
  const [sel, setSel] = useState(p.skin)
  const [msg, setMsg] = useState('')
  const s = getSkin(sel)
  const owned = !!p.owned?.[s.id]
  const equipped = p.skin === s.id
  const avg = (STAT_ROWS.reduce((a, [k]) => a + s.stats[k], 0) / STAT_ROWS.length / 20).toFixed(1)
  const lvl = RANKS.indexOf(getRank(p.trophies))

  return (
    <div className="blue-screen char-screen">
      <div className="cs-top">
        <div className="cs-meta">
          <h2 className="bigtitle">{s.name}</h2>
          <span className="lvl">Level <span className="starb">{lvl}</span></span>
        </div>
        <span className="hpill"><i className="coin" />{fmt(p.coins)}</span>
        <div className="grow" />
        <CloseBtn onClick={back} />
      </div>

      <div className="cs-body">
        <div className="bpanel cs-left">
          <b>{owned ? 'Owned' : 'Price'}</b>
          <span className="val outline">{owned ? <Icon icon={faCheck} /> : <><i className="coin" />{fmt(s.price)}</>}</span>
        </div>

        <div className="cs-preview">
          {msg && <div className="toast">{msg}</div>}
          <Fighter skin={s.id} />
          {owned ? (
            <button className="gbtn green" disabled={equipped} onClick={() => select(s.id)}>
              {equipped ? 'Selected' : 'Select'}
            </button>
          ) : (
            <button className="gbtn orange" disabled={p.coins < s.price} onClick={async () => {
              setMsg('')
              const ok = await buy(s.id)
              if (!ok) setMsg('Not enough coins.')
            }}>
              {p.coins < s.price ? <Icon icon={faLock} /> : <i className="coin" />} Unlock {fmt(s.price)}
            </button>
          )}
        </div>

        <div className="bpanel">
          <div className="pw-head">Power: {avg}</div>
          {STAT_ROWS.map(([key, label]) => (
            <div key={key} className="srow">
              <span className="sn">{label}</span>
              <div className="sline">
                <div className="sbar"><i style={{ width: `${s.stats[key]}%` }} /></div>
                <em>{Math.round(s.stats[key] / 20)}</em>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Tabs active="shop" go={go} />
      <div className="strip">
        {SKINS.map((k) => (
          <button key={k.id} className={`thumb ${sel === k.id ? 'on' : ''}`} aria-label={k.name}
            onClick={() => { setSel(k.id); setMsg('') }}>
            <Head skin={k.id} size="100%" />
            <small>{k.name}</small>
            {p.skin === k.id && <span className="tick"><Icon icon={faCheck} /></span>}
            {!p.owned?.[k.id] && <span className="lock"><Icon icon={faLock} /></span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ============== Settings ============== */
export function Settings({ p, back, go, onLogout }) {
  return (
    <Shell title="Settings" back={back}>
      <div className="narrow bpanel">
        <div className="set-who">
          <Head skin={p.skin} size={72} />
          <div><b className="outline">{p.name}</b><br /><RankBadge trophies={p.trophies} big /></div>
        </div>
        <div className="mini">
          <Stat icon={faTrophy} value={`${p.trophies || 0} trophies`} color="#ffc928" />
          <Stat icon={faTrophy} value={`${p.wins || 0} wins`} color="#fff" />
          <Stat icon={faFutbol} value={`${p.goals || 0} goals`} color="#fff" />
        </div>
        <div className="big-actions">
          <button className="gbtn blue wide" onClick={() => go('diamonds')}><Icon icon={faGem} /> Buy diamonds</button>
          <button className="gbtn orange wide" onClick={onLogout}><Icon icon={faRightFromBracket} /> Sign out</button>
        </div>
      </div>
    </Shell>
  )
}

/* ============== Powers ============== */
export function Powers({ p, back, go, equip, buy }) {
  const [msg, setMsg] = useState('')
  const ownedPowers = p.ownedPowers || {}
  const section = (title, cur) => (
    <div>
      <h3 className="sec-title">{title}</h3>
      <PowerRow powers={POWERS.filter((x) => x.currency === cur)}
        p={p} owned={ownedPowers} equip={equip} buy={buy} setMsg={setMsg} />
    </div>
  )
  return (
    <Shell title="Super powers" back={back} right={<CurrencyPills p={p} />} tabs={<Tabs active="powers" go={go} />}>
      {msg && <div className="toast">{msg}</div>}
      {section('Free', 'free')}
      {section('Buy with coins', 'coins')}
      {section('Buy with diamonds', 'diamonds')}
    </Shell>
  )
}

function PowerRow({ powers, p, owned, equip, buy, setMsg }) {
  return (
    <div className="hrow">
      {powers.map((pow) => {
        const isOwned = !!owned[pow.id] || pow.currency === 'free'
        const isEquipped = p.power === pow.id
        const cur = pow.currency === 'diamonds' ? 'diamonds' : 'coins'
        const canAfford = (p[cur] || 0) >= pow.price
        return (
          <div key={pow.id} className={`gcard ${isEquipped ? 'sel' : ''}`}>
            <b className="ctitle">{pow.name}</b>
            <div className="cicon" style={{ color: pow.color }}><Icon icon={pow.icon} /></div>
            <p className="cdesc">{pow.desc}</p>
            {isOwned ? (
              <button className={`gbtn sm ${isEquipped ? 'green' : 'orange'}`}
                disabled={isEquipped} onClick={() => equip(pow.id)}>
                {isEquipped ? <><Icon icon={faCheck} /> Equipped</> : 'Equip'}
              </button>
            ) : (
              <button className="gbtn sm dark" disabled={!canAfford}
                onClick={async () => {
                  setMsg('')
                  const r = await buy(pow.id)
                  if (!(r && r.committed)) setMsg(`Not enough ${cur}.`)
                }}>
                {pow.price}
                {!canAfford ? <Icon icon={faLock} /> : pow.currency === 'diamonds' ? <Icon icon={faGem} style={{ color: '#59b6ff' }} /> : <i className="coin" />}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ============== Diamonds (Razorpay) ============== */
export function Diamonds({ p, back, go, packs, checkout }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Shell title="Diamonds" back={back} right={<CurrencyPills p={p} />} tabs={<Tabs active="diamonds" go={go} />}>
      <p className="muted center-text" style={{ marginBottom: 8 }}>
        Diamonds unlock premium Super Powers. Purchases are processed securely via Razorpay.
      </p>
      {msg && <div className="toast">{msg}</div>}
      <div className="hrow">
        {packs.map((pack) => (
          <div key={pack.id} className="gcard">
            <b className="ctitle">{pack.diamonds}</b>
            <div className="diamond-badge"><Icon icon={faGem} /></div>
            <p className="cdesc">{pack.label}</p>
            <button className="gbtn sm dark" disabled={busy}
              onClick={async () => {
                setMsg(''); setBusy(true)
                try { await checkout(pack.id) }
                catch (e) { setMsg(e.message || 'Purchase failed') }
                setBusy(false)
              }}>
              ₹{pack.priceINR}
            </button>
          </div>
        ))}
      </div>
    </Shell>
  )
}

/* ============== Multiplayer ============== */
const rivalFor = (p) => (p.skin === 'frost' ? 'rookie' : 'frost')

export function Multiplayer({ p, back, createRoom, joinRoom, subscribeRoom, leaveRoom, updateState, onStart }) {
  const [mode, setMode] = useState('menu')   // menu | host | join | lobby
  const [code, setCode] = useState('')
  const [room, setRoom] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!room?.code) return
    const unsub = subscribeRoom(room.code, (r) => {
      if (!r) { setErr('Room closed'); setMode('menu'); return }
      setRoom(r)
      if (r.status === 'playing' && r.guest === p.uid) {
        onStart(r.code, false, [r.hostName, r.guestName], [p.skin, rivalFor(p)])
      }
    })
    return unsub
    // eslint-disable-next-line
  }, [room?.code])

  const startHost = async () => {
    const names = [room.hostName, room.guestName]
    const skins = [p.skin, rivalFor(p)]
    await updateState(room.code, {})
    try {
      const { ref, update } = await import('firebase/database')
      const { db } = await import('./firebase')
      await update(ref(db, `rooms/${room.code}`), { status: 'playing' })
    } catch { /* ignore */ }
    onStart(room.code, true, names, skins)
  }

  return (
    <Shell title="Online match" back={() => { if (room?.code) leaveRoom(room.code); back() }}>
      <div className="narrow bpanel">
        {mode === 'menu' && (
          <div className="big-actions">
            <button className="gbtn green wide" disabled={busy} onClick={async () => {
              setBusy(true); setErr('')
              try { const c = await createRoom(); setCode(c); setMode('host') }
              catch (e) { setErr(e.message) }
              setBusy(false)
            }}><Icon icon={faPlus} /> Create room</button>
            <button className="gbtn blue wide" onClick={() => setMode('join')}>
              <Icon icon={faDoorOpen} /> Join room
            </button>
            {err && <div className="err">{err}</div>}
          </div>
        )}

        {mode === 'host' && (
          <div className="center-text big-actions">
            <p className="muted">Share this room code:</p>
            <div className="room-code">{code}</div>
            <button className="gbtn blue sm" onClick={() => navigator.clipboard?.writeText(code)}>
              <Icon icon={faCopy} /> Copy
            </button>
            <p className="muted">Waiting for opponent…</p>
            {room?.guestName && <p><Icon icon={faCheck} /> {room.guestName} joined!</p>}
            {room?.status === 'playing' && <p>Starting…</p>}
            {room?.guestName && room?.status !== 'playing' && (
              <button className="gbtn green wide" onClick={startHost}><Icon icon={faPlay} /> Start match</button>
            )}
            <button className="gbtn orange sm" onClick={() => { leaveRoom(code); setMode('menu'); setRoom(null) }}>Cancel</button>
          </div>
        )}

        {mode === 'join' && (
          <div className="big-actions">
            <label className="field"><Icon icon={faKey} />
              <input placeholder="Enter room code" maxLength={5}
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <button className="gbtn green wide" disabled={busy} onClick={async () => {
              setBusy(true); setErr('')
              try {
                const r = await joinRoom(code)
                if (!r.committed) throw new Error('Room not found or full')
                setRoom({ code }); setMode('lobby')
              } catch (e) { setErr(e.message) }
              setBusy(false)
            }}>Join</button>
            {err && <div className="err">{err}</div>}
          </div>
        )}

        {mode === 'lobby' && room && (
          <div className="center-text">
            <p>Connected to <b>{room.hostName}</b></p>
            <p className="muted">Waiting for host to start…</p>
          </div>
        )}
      </div>
    </Shell>
  )
}

/* ============== Ranking ============== */
export function Ranking({ uid, back }) {
  const [rows, setRows] = useState(null)
  useEffect(() => subscribeLeaderboard(setRows, 20), [])
  const myPos = rows ? rows.findIndex((r) => r.uid === uid) : -1

  return (
    <Shell title="Rank" back={back}
      right={<span className="hpill"><Icon icon={faRankingStar} style={{ color: '#ffc928' }} />{myPos >= 0 ? `#${myPos + 1}` : '—'}</span>}>
      <div className="narrow">
        {!rows && <p className="muted center-text">Loading players…</p>}
        {rows && rows.length === 0 && <p className="muted center-text">No players yet — be the first!</p>}
        {rows?.map((r, i) => (
          <div key={r.uid} className={`rrow ${r.uid === uid ? 'me' : ''}`}>
            <span className="pos">{i + 1}</span>
            <Head skin={r.skin} size={40} />
            <span className="nm">{r.name}</span>
            <RankBadge trophies={r.trophies} />
            <Stat icon={faTrophy} value={r.trophies || 0} color="#ffc928" />
          </div>
        ))}
        <div className="ladder">
          {RANKS.map((r) => (
            <span key={r.name} className="rank" style={{ color: r.color, borderColor: r.color }}>
              <Icon icon={r.icon} /> {r.name} {r.min}+
            </span>
          ))}
        </div>
      </div>
    </Shell>
  )
}

/* ============== VS intro ============== */
export function VsScreen({ names, skins }) {
  return (
    <div className="vs-screen">
      <div className="vs-side l">
        <Head skin={skins[0]} size="min(44vh, 40vw)" />
        <span className="vs-name">{names[0]}</span>
      </div>
      <div className="vs-side r">
        <Head skin={skins[1]} size="min(44vh, 40vw)" />
        <span className="vs-name">{names[1]}</span>
      </div>
      <div className="vs-mid">VS</div>
    </div>
  )
}

/* ============== 4. In-game HUD ============== */
const hold = (key) => ({
  onPointerDown: (e) => { e.preventDefault(); controls[key] = true },
  onPointerUp: () => (controls[key] = false),
  onPointerLeave: () => (controls[key] = false),
  onPointerCancel: () => (controls[key] = false),
})

export function Hud({ hud, names, skins, banner, paused, onPause, onResume, onQuit }) {
  const ready = hud.power >= 100
  return (
    <>
      <div className="gh">
        <div className="gh-board">
          <div className="gh-side l">
            <Head skin={skins[0]} size="100%" />
            <b title={names[0]}>{names[0]}</b>
            <span className="gh-sc">{hud.s1}</span>
          </div>
          <div className="gh-mid">
            <small>TIME {hud.overtime ? 'OT' : mmss(hud.time)}</small>
            <b>VS</b>
          </div>
          <div className="gh-side r">
            <span className="gh-sc">{hud.s2}</span>
            <b title={names[1]}>{names[1]}</b>
            <Head skin={skins[1]} size="100%" />
          </div>
        </div>
        <button className="gh-pause" aria-label="Pause" onClick={onPause}><Icon icon={faPause} /></button>
      </div>
      {banner && <div className="goal-banner">GOAL!</div>}
      <div className="gh-touch">
        <div className="gh-dir">
          <button className="gh-key blue" aria-label="Move left" {...hold('left')}><Icon icon={faCaretLeft} /></button>
          <button className="gh-key blue" aria-label="Move right" {...hold('right')}><Icon icon={faCaretRight} /></button>
        </div>
        <div className="gh-act">
          <button
            className={`gh-key power ${ready ? 'ready' : ''} ${hud.armed ? 'armed' : ''}`}
            style={{ '--p': hud.power }} aria-label="Super power"
            onPointerDown={(e) => { e.preventDefault(); controls.power = true }}
          ><Icon icon={faBolt} /></button>
          <button className="gh-key orange" aria-label="Pass" {...hold('pass')}>
            <Icon icon={faShoePrints} /><Icon icon={faArrowRight} className="bdg" />
          </button>
          <button className="gh-key orange" aria-label="Jump" {...hold('jump')}>
            <Icon icon={faShoePrints} /><Icon icon={faArrowUp} className="bdg" />
          </button>
          <button className="gh-key red" aria-label="Shoot" {...hold('shoot')}>
            <Icon icon={faFutbol} />
          </button>
        </div>
      </div>
      {paused && (
        <div className="overlay">
          <div className="dialog">
            <div className="dialog-head">Paused</div>
            <div className="dialog-body">
              <div className="dialog-text">Do you want to quit the match?</div>
              <div className="dialog-actions">
                <button className="gbtn green" onClick={onResume}>Resume</button>
                <button className="gbtn orange" onClick={onQuit}>Quit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ============== 5. Match results ============== */
export function Result({ r, p, again, menu }) {
  const names = r.names || [p.name, 'CPU']
  const skins = r.skins || [p.skin, rivalFor(p)]
  const win = r.s1 > r.s2 ? 0 : r.s1 < r.s2 ? 1 : -1
  const rw = r.rewards

  return (
    <div className="stage result-bg">
      <div className="dialog result-dialog">
        <div className={`dialog-head ${win === 1 ? 'lose' : ''}`}>{win === 0 ? 'You win' : win === 1 ? 'You lose' : 'Draw'}</div>
        <div className="dialog-body">
          <div className="res-row">
            <div className="res-side">
              <Head skin={skins[0]} size="clamp(54px, 16vmin, 100px)" />
              <span className="namepill">{names[0]}</span>
            </div>
            <div className="res-score">{r.s1}–{r.s2}</div>
            <div className="res-side">
              <Head skin={skins[1]} size="clamp(54px, 16vmin, 100px)" />
              <span className="namepill">{names[1]}</span>
            </div>
          </div>
          {rw && (
            <div className="res-reward">
              <span><i className="coin" />+{fmt(rw.coins)}</span>
              <span><Icon icon={faTrophy} style={{ color: '#f0a800' }} />{rw.trophies >= 0 ? '+' : ''}{rw.trophies}</span>
            </div>
          )}
          <div className="res-actions">
            <button className="rbtn" aria-label="Lobby" onClick={menu}><Icon icon={faHouse} /></button>
            <button className="gbtn blue" onClick={again}>{win === 0 ? 'Next' : 'Retry'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}