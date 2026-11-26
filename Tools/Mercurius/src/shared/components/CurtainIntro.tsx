import { useEffect, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  BufferAttribute,
  CatmullRomCurve3,
  DataTexture,
  DoubleSide,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  NearestFilter,
  Vector3,
} from 'three';
import { clothColumns, clothRows, getCurtainCloth } from './curtainCloth';
import { makeCurtainFabric } from './curtainFabric';

export const curtainIntroSeconds = 1;

const makeIllustratedShading = () => {
  const values = [100, 145, 185, 222, 255];
  const data = new Uint8Array(
    values.flatMap((value) => [value, value, value, 255]),
  );
  const map = new DataTexture(data, values.length, 1, RGBAFormat);
  map.minFilter = map.magFilter = NearestFilter;
  map.needsUpdate = true;
  return map;
};

const Fringe = ({
  positions,
  previous,
  accent,
}: {
  positions: Float32Array;
  previous: Float32Array;
  accent: string;
}) => (
  <>
    {Array.from({ length: 11 }, (_, tassel) => {
      const row = 3 + tassel * 3;
      const i = (row * (clothColumns + 1) + clothColumns) * 3;
      const drag = Math.tanh((previous[i] - positions[i]) * 10) * 0.6;
      const hang = new Vector3(drag, -1, 0.08).normalize();
      const rotation = new Quaternion().setFromUnitVectors(
        new Vector3(0, -1, 0),
        hang,
      );
      return (
        <group
          key={row}
          position={[positions[i], positions[i + 1], positions[i + 2] + 0.025]}
          quaternion={rotation}
        >
          <mesh position={[0, -0.012, 0]}>
            <sphereGeometry args={[0.018, 8, 6]} />
            <meshToonMaterial color={accent} />
          </mesh>
          <mesh position={[0, -0.035, 0]}>
            <cylinderGeometry args={[0.009, 0.009, 0.035, 6]} />
            <meshToonMaterial color="#e7c577" />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <coneGeometry args={[0.027, 0.09, 8]} />
            <meshToonMaterial color="#e7c577" />
          </mesh>
          {[-0.014, 0, 0.014].map((strand) => (
            <mesh key={strand} position={[strand, -0.125, 0.012]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.04, 3]} />
              <meshToonMaterial color="#a47a37" />
            </mesh>
          ))}
        </group>
      );
    })}
  </>
);

const Fabric = ({
  positions,
  previous,
  side,
  accent,
}: {
  positions: Float32Array;
  previous: Float32Array;
  side: number;
  accent: string;
}) => {
  const geometry = useMemo(() => {
    const columns = clothColumns * 3;
    const rows = clothRows * 3;
    const horizontal = Array.from({ length: clothRows + 1 }, (_, row) => {
      const points = Array.from({ length: clothColumns + 1 }, (_, column) => {
        const i = (row * (clothColumns + 1) + column) * 3;
        return new Vector3(positions[i], positions[i + 1], positions[i + 2]);
      });
      const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
      return Array.from({ length: columns + 1 }, (_, column) =>
        curve.getPoint(column / columns),
      );
    });
    const vertices = new Float32Array((columns + 1) * (rows + 1) * 3);
    for (let column = 0; column <= columns; column++) {
      const curve = new CatmullRomCurve3(
        horizontal.map((row) => row[column]),
        false,
        'catmullrom',
        0.5,
      );
      for (let row = 0; row <= rows; row++) {
        const point = curve.getPoint(row / rows);
        vertices.set(
          [point.x, point.y, point.z],
          (row * (columns + 1) + column) * 3,
        );
      }
    }
    const mesh = new PlaneGeometry(1, 1, columns, rows);
    mesh.setAttribute('position', new BufferAttribute(vertices, 3));
    mesh.computeVertexNormals();
    return mesh;
  }, [positions]);
  const fabric = useMemo(() => makeCurtainFabric(side, accent), [side, accent]);
  const shading = useMemo(makeIllustratedShading, []);
  useEffect(() => () => shading.dispose(), [shading]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => Object.values(fabric).forEach((map) => map.dispose()),
    [fabric],
  );
  return (
    <>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshToonMaterial
          color="#ffffff"
          map={fabric.colour}
          gradientMap={shading}
          side={DoubleSide}
          bumpMap={fabric.height}
          bumpScale={0.0025}
        />
      </mesh>
      <Fringe positions={positions} previous={previous} accent={accent} />
    </>
  );
};

export const CurtainIntro = ({
  holdFrames,
  openingFrames,
  accent = '#742d32',
}: {
  holdFrames?: number;
  openingFrames?: number;
  accent?: string;
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const cloth = useMemo(() => getCurtainCloth(fps), [fps]);
  const hold = holdFrames ?? fps * 3.0;
  const opening = openingFrames ?? fps * 0.5;
  const clothFrame = Math.min(
    fps - 1,
    Math.max(0, Math.floor(((frame - hold) / opening) * fps)),
  );
  if (frame >= hold + opening) return null;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      orthographic
      camera={{ position: [0, 0, 5], zoom: height / 3.84, near: 0.1, far: 20 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      shadows
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[-2, 3, 4]}
        intensity={2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[3, -1, 2]} intensity={1} />
      {cloth[clothFrame].map((positions, side) => (
        <Fabric
          key={side}
          positions={positions}
          previous={cloth[Math.max(0, clothFrame - 4)][side]}
          side={side}
          accent={accent}
        />
      ))}
    </ThreeCanvas>
  );
};
