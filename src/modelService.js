import * as tf from '@tensorflow/tfjs'

// 기본 클래스 순서 (모델 학습 시 라벨 순서)
export const DEFAULT_CLASSES = ['Street', 'Casual', 'Minimal']

let cachedModel = null
let cachedLabels = null

/**
 * 모델 파일(/model/model.json)이 서버(public 폴더)에 존재하는지 확인
 */
export async function checkModelAvailability() {
  try {
    const response = await fetch('/model/model.json', { method: 'HEAD' })
    if (response.ok) {
      return { available: true }
    }
    return {
      available: false,
      reason: 'public/model/model.json 파일을 찾을 수 없습니다.',
    }
  } catch (err) {
    return {
      available: false,
      reason: err.message || '모델 파일 접근 실패',
    }
  }
}

/**
 * TensorFlow.js 모델 로드
 */
export async function loadFashionModel() {
  if (cachedModel) {
    return { model: cachedModel, labels: cachedLabels || DEFAULT_CLASSES }
  }

  // 1. 모델 가용성 확인
  const check = await checkModelAvailability()
  if (!check.available) {
    throw new Error('MODEL_NOT_FOUND')
  }

  // 2. metadata.json이 있으면 클래스 라벨 로드 (Teachable Machine 호환)
  try {
    const metaRes = await fetch('/model/metadata.json')
    if (metaRes.ok) {
      const meta = await metaRes.json()
      if (Array.isArray(meta.labels) && meta.labels.length > 0) {
        cachedLabels = meta.labels
      }
    }
  } catch {
    // metadata 없으면 기본 라벨 사용
  }

  if (!cachedLabels) {
    cachedLabels = DEFAULT_CLASSES
  }

  // 3. 모델 파일 로드 (LayersModel 우선, 실패 시 GraphModel 시도)
  try {
    cachedModel = await tf.loadLayersModel('/model/model.json')
  } catch (layersErr) {
    try {
      cachedModel = await tf.loadGraphModel('/model/model.json')
    } catch {
      throw layersErr
    }
  }

  return { model: cachedModel, labels: cachedLabels }
}

/**
 * 실제 AI 모델로 의류 이미지 추론 실행
 * @param {HTMLImageElement} imageElement
 * @returns {Promise<{ scores: { street: number, casual: number, minimal: number }, percentages: { street: number, casual: number, minimal: number }, primaryId: string }>}
 */
export async function classifyWithRealModel(imageElement) {
  const { model, labels } = await loadFashionModel()

  // 모델 입력 shape 확인 (일반적으로 [null, 224, 224, 3])
  let targetSize = [224, 224]
  try {
    const inputShape = model.inputs?.[0]?.shape
    if (Array.isArray(inputShape) && inputShape.length === 4) {
      const h = inputShape[1] || 224
      const w = inputShape[2] || 224
      targetSize = [h, w]
    }
  } catch {
    targetSize = [224, 224]
  }

  // 텐서 연산 및 메모리 누수 방지 (tf.tidy)
  const probabilities = tf.tidy(() => {
    // 1. 이미지를 텐서로 변환 (0~255)
    let tensor = tf.browser.fromPixels(imageElement)

    // 2. 모델 입력 크기로 리사이징
    tensor = tf.image.resizeBilinear(tensor, targetSize)

    // 3. 정규화 (0.0 ~ 1.0 정규화)
    tensor = tensor.toFloat().div(tf.scalar(255))

    // 4. 배치 차원 추가: [1, height, width, 3]
    const batched = tensor.expandDims(0)

    // 5. 실제 딥러닝 추론 실행
    const prediction = model.predict(batched)

    // 1차원 배열로 평탄화
    return prediction.dataSync()
  })

  // 각 클래스별 확률값(0~1) 매핑
  const classScores = {}
  labels.forEach((label, idx) => {
    const key = label.toLowerCase().trim()
    const rawVal = probabilities[idx] !== undefined ? probabilities[idx] : 0
    classScores[key] = Math.max(0, Math.min(1, rawVal))
  })

  // 스트릿, 캐주얼, 미니멀 점수 추출
  const streetProb = classScores['street'] ?? classScores[labels[0]?.toLowerCase()] ?? 0.33
  const casualProb = classScores['casual'] ?? classScores[labels[1]?.toLowerCase()] ?? 0.33
  const minimalProb = classScores['minimal'] ?? classScores[labels[2]?.toLowerCase()] ?? 0.33

  // 100점 만점 기준 점수 (실제 AI 확률 * 100)
  let streetScore = Math.round(streetProb * 100)
  let casualScore = Math.round(casualProb * 100)
  let minimalScore = Math.round(minimalProb * 100)

  // 상대적 점유 백분율(%) 계산 (합계 100%)
  const totalProb = streetProb + casualProb + minimalProb
  const streetPercent = totalProb > 0 ? Math.round((streetProb / totalProb) * 100) : 33
  const casualPercent = totalProb > 0 ? Math.round((casualProb / totalProb) * 100) : 33
  const minimalPercent = Math.max(0, 100 - streetPercent - casualPercent)

  // 1위 스타일 결정
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
