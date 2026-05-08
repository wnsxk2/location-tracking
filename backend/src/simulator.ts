import type { Server } from 'socket.io'

// 부산항 신선대 컨테이너 터미널 기준점 (WGS84)
const BASE_LAT = 35.0891
const BASE_LNG = 129.0432

const M_TO_LAT = 1 / 111320
const mToLng = (lat: number) => 1 / (111320 * Math.cos((lat * Math.PI) / 180))

// 작업 구역: 200m × 100m
// 레인 구조: X축 방향 왕복 레인 5개 (Y = 10, 25, 40, 55, 70m)
const LANES = [10, 25, 40, 55, 70]
const LANE_SPEED = 4.0  // m/s (지게차 약 14.4km/h)
const X_MIN = 5
const X_MAX = 195

// NLOS 클러스터 존: 컨테이너 스택이 쌓인 구역 (rect: [x0,y0,x1,y1])
const NLOS_ZONES: [number, number, number, number][] = [
  [60, 0, 90, 50],   // 좌측 컨테이너 블록
  [120, 50, 160, 100], // 우측 컨테이너 블록
]

function inNLOSZone(x: number, y: number): boolean {
  return NLOS_ZONES.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
}

// Box-Muller 정규분포 난수
function randn(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface Tag {
  id: string
  x: number
  y: number       // 고정된 레인 Y (왕복)
  vx: number      // +LANE_SPEED or -LANE_SPEED
  // 작업 상태: 'transit' | 'dwell' (픽업/하역 대기)
  state: 'transit' | 'dwell'
  dwellRemaining: number  // ms
}

export interface PositionPayload {
  tagId: string
  ts: number
  x: number
  y: number
  lat: number
  lng: number
  rssi: number
  isNLOS: boolean
  groundTruth: { x: number; y: number; lat: number; lng: number }
}

function makeTag(id: string, laneIdx: number, startX: number, dir: 1 | -1): Tag {
  return {
    id,
    x: startX,
    y: LANES[laneIdx],
    vx: LANE_SPEED * dir,
    state: 'transit',
    dwellRemaining: 0,
  }
}

const tags: Tag[] = [
  makeTag('T01', 0,  10,  1),
  makeTag('T02', 1, 100, -1),
  makeTag('T03', 2,  50,  1),
  makeTag('T04', 3, 170, -1),
  makeTag('T05', 4,  80,  1),
]

function toWGS84(xm: number, ym: number) {
  return {
    lat: BASE_LAT + xm * M_TO_LAT,
    lng: BASE_LNG + ym * mToLng(BASE_LAT),
  }
}

function stepTag(tag: Tag, dt: number): void {
  if (tag.state === 'dwell') {
    tag.dwellRemaining -= dt * 1000
    if (tag.dwellRemaining <= 0) {
      tag.state = 'transit'
      tag.vx = -tag.vx   // 반대 방향으로 복귀
    }
    return
  }

  tag.x += tag.vx * dt

  // 끝에 도달하면 dwell(픽업/하역) 2~5초
  if (tag.x >= X_MAX) {
    tag.x = X_MAX
    tag.state = 'dwell'
    tag.dwellRemaining = 2000 + Math.random() * 3000
  } else if (tag.x <= X_MIN) {
    tag.x = X_MIN
    tag.state = 'dwell'
    tag.dwellRemaining = 2000 + Math.random() * 3000
  }
}

export function startSimulator(io: Server): void {
  const INTERVAL_MS = 100
  const DT = INTERVAL_MS / 1000

  setInterval(() => {
    const now = Date.now()

    const payloads: PositionPayload[] = tags.map((tag) => {
      stepTag(tag, DT)

      // NLOS 존 내부면 확률 상승 (기본 5% → 존 내부 40%)
      const nlosProb = inNLOSZone(tag.x, tag.y) ? 0.40 : 0.05
      const isNLOS = Math.random() < nlosProb

      // NLOS: 큰 점프 노이즈 (σ=2.5m, 방향 편향 추가)
      const sigma = isNLOS ? 2.5 : 0.3
      const nx = randn() * sigma + (isNLOS ? (Math.random() > 0.5 ? 3 : -3) : 0)
      const ny = randn() * sigma

      const measX = tag.x + nx
      const measY = tag.y + ny

      const gt = toWGS84(tag.x, tag.y)
      const meas = toWGS84(measX, measY)

      return {
        tagId: tag.id,
        ts: now,
        x: measX,
        y: measY,
        lat: meas.lat,
        lng: meas.lng,
        rssi: isNLOS
          ? -85 - Math.floor(Math.random() * 15)
          : -60 - Math.floor(Math.random() * 20),
        isNLOS,
        groundTruth: { x: tag.x, y: tag.y, lat: gt.lat, lng: gt.lng },
      }
    })

    io.emit('positions', payloads)
  }, INTERVAL_MS)

  console.log('[simulator] started — 5 forklifts on 5 lanes @ 10Hz')
  console.log('[simulator] NLOS zones:', NLOS_ZONES.length, 'blocks defined')
}
