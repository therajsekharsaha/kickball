// Order matches the 3x2 character grid in the UI. `jersey` is the shirt colour used on the pitch.
// stats are 0-100 and lightly affect gameplay (see GameScene.makePlayer); each skin sums to ~230 so none is strictly better.
export const SKINS = [
  { id: 'rookie', name: 'Rookie', skin: '#f2b27c', hair: '#4a2a16', band: '#ff7a1a', jersey: '#ff7a1a', trim: '#1c1410', num: 10, price: 0,    stats: { speed: 48, shot: 52, jump: 46, power: 62 } },
  { id: 'frost',  name: 'Frost',  skin: '#f2d2b6', hair: '#2a6bff', band: '#2a9df4', jersey: '#2a7de8', trim: '#10204a', num: 7,  price: 500,  stats: { speed: 60, shot: 50, jump: 58, power: 40 } },
  { id: 'blaze',  name: 'Blaze',  skin: '#e8b08a', hair: '#e8323c', band: '#ffffff', jersey: '#e5393f', trim: '#3a0d10', num: 9,  price: 300,  stats: { speed: 44, shot: 66, jump: 42, power: 58 } },
  { id: 'jungle', name: 'Jungle', skin: '#b9794f', hair: '#161616', band: '#ffd54a', jersey: '#c4282f', trim: '#161616', num: 4,  price: 800,  stats: { speed: 52, shot: 46, jump: 64, power: 58 } },
  { id: 'goldie', name: 'Goldie', skin: '#f7d9b0', hair: '#ffd23a', band: '#ffffff', jersey: '#f2b705', trim: '#4a3200', num: 11, price: 2000, stats: { speed: 62, shot: 60, jump: 54, power: 44 } },
  { id: 'neon',   name: 'Neon',   skin: '#f7d9c4', hair: '#8a3cff', band: '#ff2fd6', jersey: '#7b3fe4', trim: '#1e0f45', num: 8,  price: 1200, stats: { speed: 56, shot: 56, jump: 48, power: 60 } },
]
export const getSkin = (id) => SKINS.find((s) => s.id === id) || SKINS[0]
