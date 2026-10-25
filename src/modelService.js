import * as tf from '@tensorflow/tfjs'

// 기본 클래스 순서
export const DEFAULT_CLASSES = ['Street', 'Casual', 'Minimal']

let cachedModel = null
let cachedLabels = null
let modelBasePath = '/model'

/**
 * 모델 경로 후보군 중 실제 존재하는 경로를 확인
 */
async function detectModelPath() {
  const candidatePaths = ['/model', '/model/tm-my-image-model']

  for (const path of candidatePaths) {
    try {
      const res = await fetch(`${path}/model.json`)
      if (res.ok) {
        return path
      }
    } catch {
      // 다음 후보 확인
    }
  }
  return null
}

/**
 * 모델 파일이 서버(public 폴더)에 존재하는지 확인
 */
export async function checkModelAvailability() {
  const detected = await detectModelPath()
  if (detected) {
    modelBasePath = detected
    return { available: true, path: detected }
  }
  return {
    available: false,
    reason: 'public/model/model.json 또는 tm-my-image-model/model.json 파일을 찾을 수 없습니다.',
  }
}

/**
 * TensorFlow.js 모델 로드
 */
export async function loadFashionModel() {
  if (cachedModel) {
    return { model: cachedModel, labels: cachedLabels || DEFAULT_CLASSES }
  }

  // 1. 모델 경로 감지
  const detected = await detectModelPath()
  if (!detected) {
    throw new Error('MODEL_NOT_FOUND')
  }
  modelBasePath = detected

  // 2. metadata.json 라벨 로드 (Teachable Machine 호환)
  try {
    const metaRes = await fetch(`${modelBasePath}/metadata.json`)
    if (metaRes.ok) {
      const meta = await metaRes.json()
      if (Array.isArray(meta.labels) && meta.labels.length > 0) {
        cachedLabels = meta.labels
      }
    }
  } catch {
    // metadata 로드 실패 시 기본값 사용
  }

  if (!cachedLabels) {
    cachedLabels = DEFAULT_CLASSES
  }

  // 3. TensorFlow.js 모델 로드
  try {
    cachedModel = await tf.loadLayersModel(`${modelBasePath}/model.json`)
  } catch (layersErr) {
    try {
      cachedModel = await tf.loadGraphModel(`${modelBasePath}/model.json`)
    } catch {
      throw layersErr
    }
  }

  return { model: cachedModel, labels: cachedLabels }
}

/**
 * 실제 학습된 AI 모델로 이미지 추론 실행
 * @param {HTMLImageElement} imageElement
 */
export async function classifyWithRealModel(imageElement) {
  const { model, labels } = await loadFashionModel()

  // 224x224 (Teachable Machine / MobileNet 표준 규격)
  const targetSize = [224, 224]

  // 텐서 연산 및 메모리 누수 방지
  const probabilities = tf.tidy(() => {
    // 1. 이미지를 텐서로 변환
    let tensor = tf.browser.fromPixels(imageElement)

    // 2. 모델 규격에 맞춰 224x224로 리사이즈
    tensor = tf.image.resizeBilinear(tensor, targetSize)

    // 3. Teachable Machine(MobileNet) 표준 정규화: (x / 127.5) - 1  -> [-1, 1] 범위
    tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1))

    // 4. 배치 차원 추가: [1, 224, 224, 3]
    const batched = tensor.expandDims(0)

    // 5. 실제 신경망 추론
    const prediction = model.predict(batched)

    // 결과 배열 추출
    return Array.from(prediction.dataSync())
  })

  // 클래스별 확률값(0.0 ~ 1.0) 매핑
  const classScores = {}
  labels.forEach((label, idx) => {
    const key = label.toLowerCase().trim()
    const rawVal = probabilities[idx] !== undefined ? probabilities[idx] : 0
    classScores[key] = Math.max(0, Math.min(1, rawVal))
  })

  // Street, Casual, Minimal 확률 추출
  const streetProb = classScores['street'] ?? 0
  const casualProb = classScores['casual'] ?? 0
  const minimalProb = classScores['minimal'] ?? 0

  // 100점 만점 기준 점수 (실제 AI 신경망 예측 확률 * 100)
  const streetScore = Math.round(streetProb * 100)
  const casualScore = Math.round(casualProb * 100)
  const minimalScore = Math.round(minimalProb * 100)

  // 백분율(%) 계산 (합계 100%로 정규화)
  const totalProb = streetProb + casualProb + minimalProb
  let streetPercent = 33
  let casualPercent = 33
  let minimalPercent = 34

  if (totalProb > 0) {
    streetPercent = Math.round((streetProb / totalProb) * 100)
    casualPercent = Math.round((casualProb / totalProb) * 100)
    minimalPercent = Math.max(0, 100 - streetPercent - casualPercent)
  }

  // 1순위 우승 스타일 결정
  let primaryId = 'street'
  if (casualProb >= streetProb && casualProb >= minimalProb) {
    primaryId = 'casual'
  } else if (minimalProb >= streetProb && minimalProb >= casualProb) {
    primaryId = 'minimal'
  }

  return {
    scores: {
      street: streetScore,
      casual: casualScore,
      minimal: minimalScore,
    },
    percentages: {
      street: streetPercent,
      casual: casualPercent,
      minimal: minimalPercent,
    },
    primaryId,
  }
}
