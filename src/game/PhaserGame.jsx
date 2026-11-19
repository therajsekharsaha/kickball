import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import GameScene, { W, H } from './GameScene'
import { resetControls } from './controls'

export default function PhaserGame({ cfg, paused }) {
  const host = useRef(null)
  const gameRef = useRef(null)

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: W,
      height: H,
      backgroundColor: '#6f7680',
      render: { antialias: true, powerPreference: 'high-performance' },
      input: { activePointers: 3 },
      disableContextMenu: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { gravity: { y: 1500 }, debug: false } },
      scene: [GameScene],
      callbacks: { preBoot: (g) => g.registry.set('cfg', cfg) },
    })
    gameRef.current = game
    return () => { game.destroy(true); resetControls() }
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    const g = gameRef.current
    if (!g) return
    paused ? g.scene.pause('Game') : g.scene.resume('Game')
  }, [paused])

  return <div className="phaser-host" ref={host} />
}