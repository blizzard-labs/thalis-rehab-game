import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { DoubleSide } from "three";
import type { JointAngles } from "./handPoses";

/**
 * Shadow Robot Hand, ported from the archive collector's ShadowHand3D.jsx.
 * Renders a capsule-based right hand from normalized joint angles; `side="left"`
 * mirrors it across the sagittal plane. Camera is locked (no OrbitControls) for
 * the patient warm-up.
 */

type JointName =
  | "FFJ4" | "FFJ3" | "FFJ2" | "FFJ1"
  | "MFJ4" | "MFJ3" | "MFJ2" | "MFJ1"
  | "RFJ4" | "RFJ3" | "RFJ2" | "RFJ1"
  | "LFJ5" | "LFJ4" | "LFJ3" | "LFJ2" | "LFJ1"
  | "THJ5" | "THJ4" | "THJ3" | "THJ2" | "THJ1";

const JOINT_LIMITS: Record<JointName, { min: number; max: number }> = {
  FFJ4: { min: -0.349066, max: 0.349066 },
  FFJ3: { min: 0, max: 1.5708 },
  FFJ2: { min: 0, max: 1.5708 },
  FFJ1: { min: 0, max: 1.5708 },
  MFJ4: { min: -0.349066, max: 0.349066 },
  MFJ3: { min: 0, max: 1.5708 },
  MFJ2: { min: 0, max: 1.5708 },
  MFJ1: { min: 0, max: 1.5708 },
  RFJ4: { min: -0.349066, max: 0.349066 },
  RFJ3: { min: 0, max: 1.5708 },
  RFJ2: { min: 0, max: 1.5708 },
  RFJ1: { min: 0, max: 1.5708 },
  LFJ5: { min: 0, max: 0.785398 },
  LFJ4: { min: -0.349066, max: 0.349066 },
  LFJ3: { min: 0, max: 1.5708 },
  LFJ2: { min: 0, max: 1.5708 },
  LFJ1: { min: 0, max: 1.5708 },
  THJ5: { min: -1.0472, max: 1.0472 },
  THJ4: { min: 0, max: 1.22173 },
  THJ3: { min: -0.20944, max: 0.20944 },
  THJ2: { min: -0.698132, max: 0.698132 },
  THJ1: { min: 0, max: 1.5708 },
};

const SCALE = 10;

const SEGMENTS = {
  proximal: { length: 0.045 * SCALE, radius: 0.009 * SCALE },
  middle: { length: 0.025 * SCALE, radius: 0.008 * SCALE },
  distal: { length: 0.026 * SCALE, radius: 0.007 * SCALE },
  thumbProximal: { length: 0.038 * SCALE, radius: 0.011 * SCALE },
  thumbMiddle: { length: 0.032 * SCALE, radius: 0.009 * SCALE },
  thumbDistal: { length: 0.0275 * SCALE, radius: 0.008 * SCALE },
  lfMetacarpal: { length: 0.06579 * SCALE, radius: 0.007 * SCALE },
};

const normalizedToRadians = (normalized: number, jointName: JointName): number => {
  const limits = JOINT_LIMITS[jointName];
  return limits.min + normalized * (limits.max - limits.min);
};

type FingerColors = {
  thumb: string;
  index: string;
  middle: string;
  ring: string;
  pinky: string;
  palm: string;
};

const HAND_COLOR = "#f7cb8d";

// State-based finger coloring is disabled: every part renders in the single
// flat skin tone regardless of pose.
const getFingerColors = (): FingerColors => ({
  thumb: HAND_COLOR,
  index: HAND_COLOR,
  middle: HAND_COLOR,
  ring: HAND_COLOR,
  pinky: HAND_COLOR,
  palm: HAND_COLOR,
});

type ShadowJoints = Record<JointName, number>;

const mapPoseToShadowHand = (j: JointAngles): ShadowJoints => ({
  FFJ4: 0,
  FFJ3: normalizedToRadians(j.index.mcp, "FFJ3"),
  FFJ2: normalizedToRadians(j.index.pip, "FFJ2"),
  FFJ1: normalizedToRadians(j.index.dip, "FFJ1"),
  MFJ4: 0,
  MFJ3: normalizedToRadians((j.index.mcp + j.pinky.mcp) / 2, "MFJ3"),
  MFJ2: normalizedToRadians((j.index.pip + j.pinky.pip) / 2, "MFJ2"),
  MFJ1: normalizedToRadians((j.index.dip + j.pinky.dip) / 2, "MFJ1"),
  RFJ4: 0,
  RFJ3: normalizedToRadians(j.index.mcp * 0.3 + j.pinky.mcp * 0.7, "RFJ3"),
  RFJ2: normalizedToRadians(j.index.pip * 0.3 + j.pinky.pip * 0.7, "RFJ2"),
  RFJ1: normalizedToRadians(j.index.dip * 0.3 + j.pinky.dip * 0.7, "RFJ1"),
  LFJ5: normalizedToRadians(j.pinky.mcp * 0.3, "LFJ5"),
  LFJ4: 0,
  LFJ3: normalizedToRadians(j.pinky.mcp, "LFJ3"),
  LFJ2: normalizedToRadians(j.pinky.pip, "LFJ2"),
  LFJ1: normalizedToRadians(j.pinky.dip, "LFJ1"),
  THJ5: normalizedToRadians(j.thumb.cmc, "THJ5"),
  THJ4: normalizedToRadians(j.thumb.cmc * 0.9 + j.thumb.mcp * 0.3, "THJ4"),
  THJ3: 0,
  THJ2: normalizedToRadians(j.thumb.mcp, "THJ2"),
  THJ1: normalizedToRadians(j.thumb.ip, "THJ1"),
});

type Vec3 = [number, number, number];

function Segment({
  length, radius, color, opacity,
}: { length: number; radius: number; color: string; opacity: number }) {
  return (
    <mesh position={[0, length / 2, 0]}>
      <capsuleGeometry args={[radius, length, 4, 8]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        side={DoubleSide}
      />
    </mesh>
  );
}

function StandardFinger({
  basePosition, j3Angle, j2Angle, j1Angle, color, opacity,
}: {
  basePosition: Vec3; j3Angle: number; j2Angle: number; j1Angle: number;
  color: string; opacity: number;
}) {
  return (
    <group position={basePosition}>
      <group rotation={[j3Angle, 0, 0]}>
        <Segment {...SEGMENTS.proximal} color={color} opacity={opacity} />
        <group position={[0, SEGMENTS.proximal.length, 0]} rotation={[j2Angle, 0, 0]}>
          <Segment {...SEGMENTS.middle} color={color} opacity={opacity} />
          <group position={[0, SEGMENTS.middle.length, 0]} rotation={[j1Angle, 0, 0]}>
            <Segment {...SEGMENTS.distal} color={color} opacity={opacity} />
          </group>
        </group>
      </group>
    </group>
  );
}

function LittleFinger({
  basePosition, j5Angle, j3Angle, j2Angle, j1Angle, color, opacity,
}: {
  basePosition: Vec3; j5Angle: number; j3Angle: number; j2Angle: number;
  j1Angle: number; color: string; opacity: number;
}) {
  return (
    <group position={basePosition}>
      <group rotation={[j5Angle * 0.5, 0, j5Angle]}>
        <Segment {...SEGMENTS.lfMetacarpal} color={color} opacity={opacity} />
        <group position={[0, SEGMENTS.lfMetacarpal.length, 0]}>
          <group rotation={[j3Angle, 0, 0]}>
            <Segment {...SEGMENTS.proximal} color={color} opacity={opacity} />
            <group position={[0, SEGMENTS.proximal.length, 0]} rotation={[j2Angle, 0, 0]}>
              <Segment {...SEGMENTS.middle} color={color} opacity={opacity} />
              <group position={[0, SEGMENTS.middle.length, 0]} rotation={[j1Angle, 0, 0]}>
                <Segment {...SEGMENTS.distal} color={color} opacity={opacity} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function Thumb({
  basePosition, baseRotation, j5Angle, j4Angle, j3Angle, j2Angle, j1Angle, color, opacity,
}: {
  basePosition: Vec3; baseRotation: Vec3; j5Angle: number; j4Angle: number;
  j3Angle: number; j2Angle: number; j1Angle: number; color: string; opacity: number;
}) {
  return (
    <group position={basePosition} rotation={baseRotation}>
      <group rotation={[j5Angle * 0.4, -j5Angle * 0.5, -j5Angle * 0.8]}>
        <group rotation={[j4Angle, -j4Angle * 0.3, 0]}>
          <Segment {...SEGMENTS.thumbProximal} color={color} opacity={opacity} />
          <group position={[0, SEGMENTS.thumbProximal.length, 0]} rotation={[j3Angle, 0, 0]}>
            <group rotation={[j2Angle, 0, 0]}>
              <Segment {...SEGMENTS.thumbMiddle} color={color} opacity={opacity} />
              <group position={[0, SEGMENTS.thumbMiddle.length, 0]} rotation={[j1Angle, 0, 0]}>
                <Segment {...SEGMENTS.thumbDistal} color={color} opacity={opacity} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

function Palm({ color, opacity }: { color: string; opacity: number }) {
  const w = 0.084 * SCALE;
  const h = 0.095 * SCALE;
  const d = 0.034 * SCALE;
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        side={DoubleSide}
      />
    </mesh>
  );
}

function HandModel({ jointAngles }: { jointAngles: JointAngles }) {
  const sj = useMemo(() => mapPoseToShadowHand(jointAngles), [jointAngles]);
  const colors = getFingerColors();
  const opacity = 1;
  const palmTop = 0.095 * SCALE;

  return (
    <group>
      <Palm color={colors.palm} opacity={opacity} />
      <StandardFinger
        basePosition={[0.033 * SCALE, palmTop, 0]}
        j3Angle={sj.FFJ3} j2Angle={sj.FFJ2} j1Angle={sj.FFJ1}
        color={colors.index} opacity={opacity}
      />
      <StandardFinger
        basePosition={[0.011 * SCALE, palmTop + 0.004 * SCALE, 0]}
        j3Angle={sj.MFJ3} j2Angle={sj.MFJ2} j1Angle={sj.MFJ1}
        color={colors.middle} opacity={opacity}
      />
      <StandardFinger
        basePosition={[-0.011 * SCALE, palmTop, 0]}
        j3Angle={sj.RFJ3} j2Angle={sj.RFJ2} j1Angle={sj.RFJ1}
        color={colors.ring} opacity={opacity}
      />
      <LittleFinger
        basePosition={[-0.033 * SCALE, 0.02071 * SCALE, 0]}
        j5Angle={sj.LFJ5} j3Angle={sj.LFJ3} j2Angle={sj.LFJ2} j1Angle={sj.LFJ1}
        color={colors.pinky} opacity={opacity}
      />
      <Thumb
        basePosition={[0.034 * SCALE, 0.029 * SCALE, -0.0085 * SCALE]}
        baseRotation={[0, Math.PI * 0.125, 0]}
        j5Angle={sj.THJ5} j4Angle={sj.THJ4} j3Angle={sj.THJ3}
        j2Angle={sj.THJ2} j1Angle={sj.THJ1}
        color={colors.thumb} opacity={opacity}
      />
    </group>
  );
}

export function ShadowHand3D({
  jointAngles,
  side = "right",
}: {
  jointAngles: JointAngles;
  side?: "left" | "right";
  // `dimmed` / `colorMiddleRing` accepted for API compat but no longer used:
  // hands always render in the flat skin tone at full opacity.
  dimmed?: boolean;
  colorMiddleRing?: boolean;
}) {
  // Left hand = right hand mirrored across the sagittal plane. The negative
  // scale flips triangle winding, so segment materials use DoubleSide.
  const mirror: Vec3 = side === "left" ? [-1, 1, 1] : [1, 1, 1];

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "320px" }}>
      <Canvas camera={{ position: [0, 0.6, 3.0], fov: 50 }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, 3, -3]} intensity={0.4} />
        <group scale={mirror} position={[0, -1, 0]} rotation={[0, Math.PI, 0]}>
          <HandModel jointAngles={jointAngles} />
        </group>
      </Canvas>
    </div>
  );
}

export default ShadowHand3D;
