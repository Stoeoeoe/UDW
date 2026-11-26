import {
  Body,
  DistanceConstraint,
  GSSolver,
  Particle,
  Vec3,
  World,
} from 'cannon-es';

export const clothColumns = 22;
export const clothRows = 36;
const step = 1 / 180;
const snapshots = new Map<number, Float32Array[][]>();
const index = (column: number, row: number) =>
  row * (clothColumns + 1) + column;

const pull = (seconds: number) => {
  const t = Math.max(0, Math.min(1, (seconds - 0.035) / 0.63));
  return t * t * (3 - 2 * t);
};

export const getCurtainCloth = (fps: number) => {
  const cached = snapshots.get(fps);
  if (cached) return cached;
  const solver = new GSSolver();
  solver.iterations = 10;
  const world = new World({ gravity: new Vec3(0, -5, 0), solver });
  const panels = [1, -1].map((side) => {
    const bodies: Body[] = [];
    const pins: { body: Body; u: number; original: Vec3 }[] = [];
    for (let row = 0; row <= clothRows; row++) {
      const v = row / clothRows;
      for (let column = 0; column <= clothColumns; column++) {
        const u = column / clothColumns;
        const pinned = row === 0;
        const position = new Vec3(
          side *
            (-1.22 +
              u * 1.38 +
              Math.sin(v * Math.PI) * Math.sin(u * 7) * 0.025),
          1.99 - v * 4.1 + Math.pow(v, 8) * Math.sin(u * 5) * 0.035,
          0.07 * Math.cos(u * Math.PI * 8.8 + v * 0.45) +
            0.025 * Math.cos(u * Math.PI * 4.2 - v * 0.9),
        );
        const body = new Body({
          mass: pinned ? 0 : 0.003,
          position,
          shape: new Particle(),
          linearDamping: 0.13,
          collisionFilterMask: 0,
        });
        world.addBody(body);
        bodies.push(body);
        if (pinned) pins.push({ body, u, original: position.clone() });
      }
    }
    const connect = (a: number, b: number, force = 80) => {
      world.addConstraint(
        new DistanceConstraint(
          bodies[a],
          bodies[b],
          bodies[a].position.distanceTo(bodies[b].position),
          force,
        ),
      );
    };
    for (let row = 0; row <= clothRows; row++) {
      for (let column = 0; column <= clothColumns; column++) {
        if (column < clothColumns)
          connect(index(column, row), index(column + 1, row));
        if (row < clothRows)
          connect(index(column, row), index(column, row + 1));
        if (column + 2 <= clothColumns)
          connect(index(column, row), index(column + 2, row), 0.25);
        if (row + 2 <= clothRows)
          connect(index(column, row), index(column, row + 2), 0.25);
        if (column < clothColumns && row < clothRows) {
          connect(index(column, row), index(column + 1, row + 1));
          connect(index(column + 1, row), index(column, row + 1));
        }
      }
    }
    return { side, bodies, pins };
  });

  // Settle under gravity, then bake the one-second opening once. Seeking reads
  // snapshots; rendering never depends on playback order or wall-clock time.
  for (let tick = 0; tick < 90; tick++) world.step(step);
  const result: Float32Array[][] = [];
  let tick = 0;
  for (let frame = 0; frame < fps; frame++) {
    const target = Math.round(frame / fps / step);
    while (tick < target) {
      const seconds = tick * step;
      const amount = pull(seconds);
      const acceleration =
        (pull(seconds + step) - 2 * amount + pull(seconds - step)) /
        (step * step);
      for (const panel of panels) {
        for (const pin of panel.pins) {
          pin.body.position.set(
            pin.original.x - panel.side * pin.u * 0.3 * amount,
            pin.original.y,
            pin.original.z,
          );
        }
        // Simulate in the moving rail's reference frame. The fabric lags the
        // pull instead of being forced through grab points along its seam.
        for (const body of panel.bodies)
          if (body.mass > 0) {
            body.force.x += panel.side * body.mass * 1.75 * acceleration * 0.3;
          }
      }
      world.step(step);
      tick++;
    }
    result.push(
      panels.map(({ bodies, side }) => {
        const vertices = new Float32Array(bodies.length * 3);
        bodies.forEach(({ position }, i) =>
          vertices.set(
            [
              position.x - side * 1.75 * pull(frame / fps),
              position.y,
              position.z,
            ],
            i * 3,
          ),
        );
        return vertices;
      }),
    );
  }
  snapshots.set(fps, result);
  return result;
};
