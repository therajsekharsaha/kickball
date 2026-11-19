import {
  faBolt, faFire, faSnowflake, faWind, faShieldHalved, faGhost,
  faRocket, faMagnet, faClock, faStar,
} from '@fortawesome/free-solid-svg-icons'

/**
 * currency: 'free' | 'coins' | 'diamonds'
 * type:
 *   - powerShot: next shot is supercharged
 *   - speed: temporary move-speed boost
 *   - freeze: freezes opponent briefly
 *   - shield: blocks one incoming shot / absorbs knock
 *   - gravity: pulls ball toward user briefly
 *   - magnet: attracts ball when nearby
 *   - slowmo: slows opponent
 *   - clone: spawns decoy (visual taunt)
 *   - timeout: extends match by 30s (consumable)
 *   - luck: boosts coin reward next match
 */
export const POWERS = [
  // ---- 2 FREE ----
  { id: 'bolt',     name: 'Bolt',      icon: faBolt,        type: 'powerShot', currency: 'free',     price: 0,    color: '#ffd83a', desc: 'Charge your next shot into an unstoppable rocket.' },
  { id: 'dash',     name: 'Dash',      icon: faWind,        type: 'speed',     currency: 'free',     price: 0,    color: '#7cc4ff', desc: 'Sprint faster for 3 seconds.' },

  // ---- 2 COIN ----
  { id: 'flame',    name: 'Flame Shot',icon: faFire,        type: 'powerShot', currency: 'coins',    price: 800,  color: '#ff6a2b', desc: 'A burning shot that curves mid-air.' },
  { id: 'freeze',   name: 'Freeze',    icon: faSnowflake,   type: 'freeze',    currency: 'coins',    price: 1500, color: '#8fe1ff', desc: 'Freeze the opponent for 1.2s.' },

  // ---- 6 DIAMOND ----
  { id: 'shield',   name: 'Shield',    icon: faShieldHalved,type: 'shield',    currency: 'diamonds', price: 5,    color: '#59b6ff', desc: 'Absorb the next shot aimed at your goal.' },
  { id: 'ghost',    name: 'Ghost',     icon: faGhost,       type: 'dodge',     currency: 'diamonds', price: 8,    color: '#c77dff', desc: 'Phase through the ball harmlessly once.' },
  { id: 'rocket',   name: 'Rocket',    icon: faRocket,      type: 'powerShot', currency: 'diamonds', price: 10,   color: '#ff4d5a', desc: 'Maximum-velocity shot — nearly unstoppable.' },
  { id: 'magnet',   name: 'Magnet',    icon: faMagnet,      type: 'magnet',    currency: 'diamonds', price: 12,   color: '#ff8a1f', desc: 'Ball sticks to you when close for 2s.' },
  { id: 'slowmo',   name: 'Slow-Mo',   icon: faClock,       type: 'slowmo',    currency: 'diamonds', price: 15,   color: '#5fe3d0', desc: 'Slow the opponent for 2 seconds.' },
  { id: 'star',     name: 'Star Burst',icon: faStar,        type: 'luck',      currency: 'diamonds', price: 20,   color: '#ffcc33', desc: 'Double coin rewards next match.' },
]

export const getPower = (id) => POWERS.find((p) => p.id === id) || POWERS[0]
export const DEFAULT_POWER = 'bolt'