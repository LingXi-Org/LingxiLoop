// Fixed synthetic, normalized grayscale images; no remote assets or learner data.
export const DCT_FIXTURES: Readonly<Record<8 | 16, readonly number[]>> = Object.freeze({
  8: Object.freeze([
    32, 32, 32, 32, 192, 192, 192, 192,
    32, 32, 32, 32, 192, 192, 192, 192,
    32, 32, 240, 240, 240, 240, 192, 192,
    32, 32, 240, 64, 64, 240, 192, 192,
    32, 32, 240, 64, 64, 240, 192, 192,
    32, 32, 240, 240, 240, 240, 192, 192,
    32, 32, 32, 32, 192, 192, 192, 192,
    32, 32, 32, 32, 192, 192, 192, 192,
  ].map((value) => value / 255)),
  16: Object.freeze(Array.from({ length: 256 }, (_, index) => {
    const x = index % 16
    const y = Math.floor(index / 16)
    if (x >= 4 && x < 12 && y >= 4 && y < 12) {
      return (x >= 6 && x < 10 && y >= 6 && y < 10 ? 64 : 240) / 255
    }
    return (x < 8 ? 32 : 192) / 255
  })),
})

export const KERNEL_FIXTURES = {
  projectile: { angle: 45, speed: 10, gravity: 10, height: 0 },
  functionPlot: {
    curves: [{ id: 'parabola', a: 1, b: 0, c: 0 }, { id: 'line', a: 0, b: 0, c: 1 }],
    domain: [-2, 2],
  },
  dctImage: { size: 8, keep: 10 },
  centralLimit: { distribution: 'uniform', sampleSize: 20, trials: 1000, seed: 42 },
  montyHallGame: { seed: 42, selectedDoor: 0 },
  montyHallSimulation: { seed: 42, trials: 10000 },
} as const
