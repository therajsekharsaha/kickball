import { faShieldHalved, faMedal, faStar, faGem, faCrown, faTrophy } from '@fortawesome/free-solid-svg-icons'

export const RANKS = [
  { name: 'Rookie', min: 0, color: '#9aa4b2', icon: faShieldHalved },
  { name: 'Bronze', min: 100, color: '#cd7f32', icon: faMedal },
  { name: 'Silver', min: 300, color: '#c9d1d9', icon: faMedal },
  { name: 'Gold', min: 600, color: '#ffcc33', icon: faMedal },
  { name: 'Platinum', min: 1000, color: '#5fe3d0', icon: faStar },
  { name: 'Diamond', min: 1500, color: '#59b6ff', icon: faGem },
  { name: 'Master', min: 2200, color: '#c77dff', icon: faCrown },
  { name: 'Legend', min: 3000, color: '#ff5a5f', icon: faTrophy },
]

export const getRank = (t = 0) => [...RANKS].reverse().find((r) => t >= r.min) || RANKS[0]
export const nextRank = (t = 0) => RANKS.find((r) => r.min > t) || null

export const DIFFS = {
  easy: { label: 'Easy', mult: 1, win: 15, speed: 250, jump: 0.04, react: 0.12 },
  normal: { label: 'Normal', mult: 1.5, win: 25, speed: 320, jump: 0.08, react: 0.3 },
  hard: { label: 'Hard', mult: 2, win: 35, speed: 400, jump: 0.14, react: 0.7 },
}

export function calcRewards(s1, s2, diff) {
  const d = DIFFS[diff] || DIFFS.normal
  const result = s1 > s2 ? 'win' : s1 < s2 ? 'loss' : 'draw'
  const base = result === 'win' ? 50 : result === 'draw' ? 20 : 10
  const coins = Math.round((base + s1 * 10) * d.mult)
  const trophies = result === 'win' ? d.win : result === 'loss' ? -10 : 0
  return { result, coins, trophies }
}
