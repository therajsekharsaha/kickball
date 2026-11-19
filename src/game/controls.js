// Shared virtual input, written by the React on-screen buttons and read by the Phaser scene.
export const controls = { left: false, right: false, jump: false, shoot: false, pass: false, power: false }
export const resetControls = () => Object.keys(controls).forEach((k) => (controls[k] = false))
