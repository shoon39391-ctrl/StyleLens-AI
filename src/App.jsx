import { useState, useRef, useEffect } from 'react'
import './App.css'
import { classifyWithRealModel, checkModelAvailability } from './modelService'

// 지원하는 이미지 확장자 및 MIME 타입
const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE_MB = 10
const CURRENT_YEAR = new Date().getFullYear()

// 스타일별 상세 정보 및 진단 데이터
const STYLE_DEFINITIONS = {
  street: {
    id: 'street',
    name: '스트릿',
    nameEn: 'Street Style',
    tagline: '자유분방한 개성과 볼드한 트렌드 감성',
    badgeClass: 'badge-street',
    tags: ['#오버핏실루엣', '#그래픽포인트', '#그런지무드', '#서브컬처', '#청키스니커즈'],
    summary:
      '과감한 오버사이즈 실루엣과 트렌디한 스트릿웨어의 에너지가 강하게 느껴지는 스타일입니다. 규칙에 얽매이지 않는 자유로운 핏과 볼드한 아이템 매치로 독보적인 개성을 표현하고 있습니다.',
    stylingTips: [
      '와이드 카고 팬츠나 볼드한 체인 액세서리로 스트릿 무드를 극대화해 보세요.',
      '상의가 오버핏이라면 하의도 루즈하게 매치하여 밸런스 있는 그런지 룩을 완성할 수 있습니다.',
      '포인트 컬러의 비니나 청키한 볼륨감의 스니커즈를 더하면 더욱 감각적입니다.',
    ],
    recommendedItems: ['오버사이즈 후디', '와이드 카고 팬츠', '청키 스니커즈', '스트릿 볼캡'],
  },
  casual: {
    id: 'casual',
    name: '캐주얼',
    nameEn: 'Everyday Casual',
    tagline: '자연스럽고 편안한 데일리 밸런스',
    badgeClass: 'badge-casual',
    tags: ['#데님웨어', '#내추럴핏', '#실용적스타일', '#데일리룩', '#소프트밸런스'],
    summary:
      '일상 속 편안함과 실용성을 바탕으로 정제된 감각을 더한 내추럴 룩입니다. 과하지 않으면서도 안정적인 조화를 이루어 언제 어디서나 호감을 주는 세련된 데일리 웨어입니다.',
    stylingTips: [
      '깔끔한 스트레이트 데님이나 치노 팬츠와 함께 매치하면 실패 없는 코디가 완성됩니다.',
      '셔츠나 카디건을 어깨에 가볍게 걸쳐 캐주얼하면서도 위트 있는 포인트를 줄 수 있습니다.',
      '베이직한 캔버스 스니커즈나 미니멀 레더 스니커즈로 마무리를 정돈해 보세요.',
    ],
    recommendedItems: ['스트레이트 데님', '크루넥 스웨트셔츠', '캔버스 스니커즈', '코튼 셔츠'],
  },
  minimal: {
    id: 'minimal',
    name: '미니멀',
    nameEn: 'Modern Minimal',
    tagline: '절제된 실루엣과 정제된 톤온톤',
    badgeClass: 'badge-minimal',
    tags: ['#뉴트럴컬러', '#클린실루엣', '#톤온톤코디', '#테일러드', '#모던클래식'],
    summary:
      '군더더기 없는 정갈한 라인과 차분한 컬러 배색으로 완성한 세련된 모던 룩입니다. 화려한 그래픽을 덜어내고 소재의 질감과 정교한 실루엣에 집중하여 우아한 절제미를 보여줍니다.',
    stylingTips: [
      '블랙, 그레이, 오프화이트, 베이지 등 톤온톤(Tone on Tone) 배색을 적극 활용해 보세요.',
      '각이 살아있는 테일러드 블레이저나 단정한 슬랙스로 모던한 무드를 강조할 수 있습니다.',
      '간결한 실루엣의 더비 슈즈나 미니멀 로퍼, 가죽 레더 백으로 고급스러운 마무리를 연출하세요.',
    ],
    recommendedItems: ['테일러드 블레이저', '핀턱 슬랙스', '미니멀 더비 슈즈', '파인 울 니트'],
  },
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  // 분석 진행 상태: 'idle' | 'analyzing' | 'result' | 'model-missing'
  const [analysisState, setAnalysisState] = useState('idle')
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStepText, setAnalysisStepText] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [copyToast, setCopyToast] = useState(false)
  const [isModelReady, setIsModelReady] = useState(null)

  const fileInputRef = useRef(null)
  const previewImgRef = useRef(null)

  // 초기 마운트 시 실제 모델 파일 가용성 점검
  useEffect(() => {
    checkModelAvailability().then((res) => {
      setIsModelReady(res.available)
    })
  }, [])

  // 컴포넌트 언마운트 또는 새 이미지 선택 시 메모리 해제
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // 파일 유효성 검사
  const validateFile = (file) => {
    if (!file) {
      return { valid: false, message: '선택된 파일이 없습니다.' }
    }

    const fileType = file.type.toLowerCase()
    const fileName = file.name.toLowerCase()
    const isExtensionValid = VALID_EXTENSIONS.some((ext) => fileName.endsWith(ext))
    const isMimeValid = VALID_IMAGE_TYPES.includes(fileType)

    if (!isMimeValid && !isExtensionValid) {
      return {
        valid: false,
        message: '지원하지 않는 파일 형식입니다. JPG, JPEG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.',
      }
    }

    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return {
        valid: false,
        message: `파일 크기가 너무 큽니다. ${MAX_FILE_SIZE_MB}MB 이하의 이미지만 업로드해주세요.`,
      }
    }

    return { valid: true, message: '' }
  }

  // 파일 처리 핸들러
  const handleFileProcess = (file) => {
    const { valid, message } = validateFile(file)

    if (!valid) {
      setErrorMessage(message)
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setErrorMessage('')
    setSelectedFile(file)
    const newPreviewUrl = URL.createObjectURL(file)
    setPreviewUrl(newPreviewUrl)
    setAnalysisState('idle')
    setAnalysisResult(null)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileProcess(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileProcess(file)
    }
  }

  const handleDeleteImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    setErrorMessage('')
    setAnalysisState('idle')
    setAnalysisResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleChangeImage = () => {
    fileInputRef.current?.click()
  }

  // 실제 AI 모델 기반 분석 시작
  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      setErrorMessage('분석할 의류 사진을 먼저 업로드해 주세요.')
      return
    }

    setErrorMessage('')
    setAnalysisState('analyzing')
    setAnalysisProgress(20)
    setAnalysisStepText('TensorFlow.js 딥러닝 모델 가용성 확인 중...')

    // 1. 모델 파일 가용성 확인
    const modelStatus = await checkModelAvailability()

    if (!modelStatus.available) {
      // 실제 모델이 없으면 임의의 점수를 만들지 않고, 준비 가이드 화면으로 전환
      setAnalysisState('model-missing')
      setIsModelReady(false)
      return
    }

    setIsModelReady(true)
    setAnalysisProgress(50)
    setAnalysisStepText('딥러닝 모델 로드 및 텐서 전처리 중...')

    try {
      // DOM 언마운트와 무관하게 메모리 이미지 객체를 생성하여 안전하게 로드
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = previewUrl

      await new Promise((resolve, reject) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve()
          return
        }
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('이미지 로딩에 실패했습니다.'))
      })

      setAnalysisProgress(75)
      setAnalysisStepText('신경망 추론 실행 중 (Softmax 확률 연산)...')

      // 2. 실제 TensorFlow.js 모델 추론 실행
      const realPrediction = await classifyWithRealModel(img)

      setAnalysisProgress(100)
      setAnalysisStepText('분석 완료!')

      setTimeout(() => {
        const resultData = {
          primaryId: realPrediction.primaryId,
          styleInfo: STYLE_DEFINITIONS[realPrediction.primaryId] || STYLE_DEFINITIONS['street'],
          scores: realPrediction.scores,
          percentages: realPrediction.percentages,
        }

        setAnalysisResult(resultData)
        setAnalysisState('result')

        setTimeout(() => {
          const resultElement = document.getElementById('analysis-result-view')
          if (resultElement) {
            resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 100)
      }, 350)
    } catch (err) {
      console.error('모델 추론 오류:', err)
      setAnalysisState('model-missing')
      setErrorMessage(`모델 추론 중 오류가 발생했습니다: ${err.message}`)
    }
  }

  // 다시 분석하기
  const handleResetAnalysis = () => {
    setAnalysisState('idle')
    setAnalysisResult(null)
    setAnalysisProgress(0)
    setTimeout(() => {
      const uploaderElement = document.getElementById('uploader')
      if (uploaderElement) {
        uploaderElement.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
  }

  // 결과 복사하기
  const handleShareResult = async () => {
    if (!analysisResult) return
    const textToCopy = `[StyleLens AI 패션 스타일 분석 결과 (TensorFlow.js)]
🏆 1순위 추천 스타일: ${analysisResult.styleInfo.name} (${analysisResult.styleInfo.nameEn})
- 스트릿 예측 점수: ${analysisResult.scores.street}점 (${analysisResult.percentages.street}%)
- 캐주얼 예측 점수: ${analysisResult.scores.casual}점 (${analysisResult.percentages.casual}%)
- 미니멀 예측 점수: ${analysisResult.scores.minimal}점 (${analysisResult.percentages.minimal}%)

[AI 총평]
${analysisResult.styleInfo.summary}`

    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 2400)
    } catch {
      alert('결과 텍스트를 복사했습니다.')
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="app-container">
      {/* 1. 상단 헤더 & 내비게이션 */}
      <header className="header">
        <div className="header-inner">
          <div className="logo-group" onClick={handleResetAnalysis}>
            <span className="logo-mark">SL</span>
            <span className="logo-text">STYLELENS AI</span>
          </div>
          <nav className="nav-menu">
            <a href="#about" className="nav-link">소개</a>
            <a href="#uploader" className="nav-link">스타일 분석</a>
            <a href="#styles" className="nav-link">스타일 가이드</a>
          </nav>
          <div className="header-badge">
            <span className={`status-dot ${isModelReady ? 'dot-active' : 'dot-pending'}`}></span>
            <span>{isModelReady ? 'TF.js Model Ready' : 'Model Setup Needed'}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* 2. 메인 히어로 섹션 */}
        <section id="about" className="hero-section">
          <div className="hero-pill">COMPUTER VISION 2 AI CLASSIFIER</div>
          <h1 className="hero-title">
            사진 한 장으로 알아보는<br />나의 패션 스타일
          </h1>
          <p className="hero-subtitle">
            착용하고 계신 의류나 데일리 룩 사진을 업로드해 보세요.<br />
            <strong>TensorFlow.js 딥러닝 비전 모델</strong>이 <strong>스트릿(Street)</strong>, <strong>캐주얼(Casual)</strong>, <strong>미니멀(Minimal)</strong> 스타일의 정밀 예측 점수를 산출합니다.
          </p>
        </section>

        {/* 3. 업로드 및 분석 인터랙션 섹션 */}
        <section id="uploader" className="uploader-section">
          {/* A. 기본 업로드/미리보기 상태 (idle) */}
          {analysisState === 'idle' && (
            <div className="card uploader-card">
              {errorMessage && (
                <div className="alert-banner alert-error" role="alert">
                  <svg className="alert-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="alert-text">{errorMessage}</span>
                  <button
                    type="button"
                    className="alert-close"
                    onClick={() => setErrorMessage('')}
                    aria-label="안내 닫기"
                  >
                    ✕
                  </button>
                </div>
              )}

              {!previewUrl ? (
                <div
                  className={`dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <div className="dropzone-icon-wrapper">
                    <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                  </div>
                  <div className="dropzone-texts">
                    <p className="dropzone-primary-text">의류 사진을 드래그하거나 클릭하여 업로드</p>
                    <p className="dropzone-secondary-text">전신 착용샷 또는 상의/하의 코디 사진을 추천합니다</p>
                  </div>
                  <div className="format-tags">
                    <span className="format-tag">JPG</span>
                    <span className="format-tag">JPEG</span>
                    <span className="format-tag">PNG</span>
                    <span className="format-tag">WEBP</span>
                    <span className="size-limit">최대 10MB</span>
                  </div>
                  <button type="button" className="btn btn-select-file">
                    파일 선택하기
                  </button>
                </div>
              ) : (
                <div className="preview-container">
                  <div className="preview-frame">
                    <img
                      ref={previewImgRef}
                      src={previewUrl}
                      alt="업로드한 패션 의류 미리보기"
                      className="preview-image"
                      crossOrigin="anonymous"
                    />
                  </div>

                  <div className="preview-meta">
                    <div className="meta-info">
                      <span className="file-name" title={selectedFile?.name}>
                        {selectedFile?.name}
                      </span>
                      <span className="file-size">{formatFileSize(selectedFile?.size)}</span>
                    </div>

                    <div className="meta-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleChangeImage}
                      >
                        <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        사진 변경
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-ghost"
                        onClick={handleDeleteImage}
                      >
                        <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden-file-input"
                onChange={handleFileChange}
              />

              <div className="analysis-cta-area">
                <button
                  type="button"
                  className={`btn btn-cta ${!selectedFile ? 'btn-disabled' : ''}`}
                  disabled={!selectedFile}
                  onClick={handleStartAnalysis}
                >
                  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  스타일 분석 시작하기
                </button>
                {!selectedFile && (
                  <p className="cta-helper-text">
                    * 사진을 업로드하면 분석 버튼이 활성화됩니다.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* B. 모델 추론 진행 중 화면 (analyzing) */}
          {analysisState === 'analyzing' && (
            <div className="card analyzing-card">
              <div className="scanner-wrapper">
                <div className="scanner-frame">
                  <img src={previewUrl} alt="분석 대상 의류" className="scanner-image" />
                  <div className="scanner-laser"></div>
                  <div className="scanner-grid-overlay"></div>
                </div>
              </div>

              <div className="analyzing-status-box">
                <div className="analyzing-spinner"></div>
                <h3 className="analyzing-title">TensorFlow.js 딥러닝 추론 중</h3>
                <p className="analyzing-step-text">{analysisStepText}</p>

                <div className="progress-container">
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${analysisProgress}%` }}
                    ></div>
                  </div>
                  <span className="progress-percentage">{analysisProgress}%</span>
                </div>
              </div>
            </div>
          )}

          {/* C. ⚠️ 모델 파일 준비 필요 안내 화면 (모의 분류 점수 미사용) */}
          {analysisState === 'model-missing' && (
            <div className="card model-guide-card">
              <div className="guide-icon-badge">
                <svg className="guide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>

              <h2 className="guide-title">실제 AI 분류 모델 준비가 필요합니다</h2>
              <p className="guide-subtitle">
                컴퓨터비전2 과제 안내에 따라 임의의 모의(Canvas) 분류를 하지 않으며,<br />
                <strong>실제 학습된 TensorFlow.js 모델 파일이 준비되어야 진짜 예측 결과를 표시합니다.</strong>
              </p>

              <div className="guide-required-box">
                <h4 className="guide-box-title">필요한 모델 파일 경로</h4>
                <ul className="guide-file-list">
                  <li>
                    <code>public/model/model.json</code>
                    <span className="file-desc">TensorFlow.js 모델 구조 파일</span>
                  </li>
                  <li>
                    <code>public/model/weights.bin</code>
                    <span className="file-desc">학습된 딥러닝 가중치 바이너리</span>
                  </li>
                  <li>
                    <code>public/model/metadata.json</code>
                    <span className="file-desc">클래스 라벨 정보 (Street, Casual, Minimal)</span>
                  </li>
                </ul>
              </div>

              <div className="guide-how-to">
                <h4 className="guide-box-title">가장 쉬운 모델 준비 방법 (Google Teachable Machine)</h4>
                <ol className="guide-steps-list">
                  <li><strong>Teachable Machine</strong> 웹사이트에 접속합니다.</li>
                  <li><strong>이미지 프로젝트</strong>를 생성하고 3개의 클래스를 만듭니다: <code>Street</code>, <code>Casual</code>, <code>Minimal</code></li>
                  <li>각 클래스에 스타일별 의류 이미지(각 20~50장)를 업로드하고 <strong>[모델 학습시키기]</strong>를 누릅니다.</li>
                  <li><strong>[모델 내보내기]</strong> → <strong>TensorFlow.js</strong> 선택 → <strong>[다운로드]</strong> 클릭</li>
                  <li>다운로드한 파일(<code>model.json</code>, <code>weights.bin</code>, <code>metadata.json</code>)을 본 프로젝트의 <strong><code>public/model/</code></strong> 폴더에 넣으면 자동으로 실제 AI 모델 분류가 작동합니다!</li>
                </ol>
              </div>

              <div className="guide-actions">
                <button
                  type="button"
                  className="btn btn-secondary-lg"
                  onClick={handleResetAnalysis}
                >
                  업로드 화면으로 돌아가기
                </button>
              </div>
            </div>
          )}

          {/* D. 실제 AI 모델 추론 결과 화면 (result) */}
          {analysisState === 'result' && analysisResult && (
            <div id="analysis-result-view" className="result-card-wrapper">
              <div className="card result-card">
                <div className="result-header">
                  <div className="result-pill-badge">
                    <span className="sparkle-icon">✦</span> REAL TENSORFLOW.JS INFERENCE
                  </div>
                  <h2 className="result-main-title">
                    AI 분석 결과: <span className="highlight-style-name">{analysisResult.styleInfo.name}</span> 스타일
                  </h2>
                  <p className="result-sub-headline">
                    {analysisResult.styleInfo.tagline}
                  </p>
                </div>

                <div className="prediction-scoreboard-section">
                  <div className="scoreboard-title-wrap">
                    <h3 className="scoreboard-title">실제 AI 모델 예측 점수</h3>
                    <span className="scoreboard-subtitle">TensorFlow.js Softmax 확률 기반 (100점 환산)</span>
                  </div>

                  <div className="scoreboard-grid">
                    {/* 스트릿 점수 카드 */}
                    <div className={`score-card ${analysisResult.primaryId === 'street' ? 'score-card-winner' : ''}`}>
                      {analysisResult.primaryId === 'street' && (
                        <div className="winner-crown-badge">🏆 BEST MATCH</div>
                      )}
                      <div className="score-card-header">
                        <span className="score-card-style-name">스트릿 (Street)</span>
                        <span className="score-card-pct">{analysisResult.percentages.street}%</span>
                      </div>
                      <div className="score-number-display">
                        <span className="score-big-num">{analysisResult.scores.street}</span>
                        <span className="score-unit">/ 100점</span>
                      </div>
                      <div className="score-card-track">
                        <div
                          className="score-card-bar score-bar-street"
                          style={{ width: `${analysisResult.scores.street}%` }}
                        ></div>
                      </div>
                      <p className="score-card-status">
                        {analysisResult.scores.street >= 70 ? '강력한 일치' : analysisResult.scores.street >= 40 ? '보통 수준의 조화' : '낮은 일치도'}
                      </p>
                    </div>

                    {/* 캐주얼 점수 카드 */}
                    <div className={`score-card ${analysisResult.primaryId === 'casual' ? 'score-card-winner' : ''}`}>
                      {analysisResult.primaryId === 'casual' && (
                        <div className="winner-crown-badge">🏆 BEST MATCH</div>
                      )}
                      <div className="score-card-header">
                        <span className="score-card-style-name">캐주얼 (Casual)</span>
                        <span className="score-card-pct">{analysisResult.percentages.casual}%</span>
                      </div>
                      <div className="score-number-display">
                        <span className="score-big-num">{analysisResult.scores.casual}</span>
                        <span className="score-unit">/ 100점</span>
                      </div>
                      <div className="score-card-track">
                        <div
                          className="score-card-bar score-bar-casual"
                          style={{ width: `${analysisResult.scores.casual}%` }}
                        ></div>
                      </div>
                      <p className="score-card-status">
                        {analysisResult.scores.casual >= 70 ? '강력한 일치' : analysisResult.scores.casual >= 40 ? '보통 수준의 조화' : '낮은 일치도'}
                      </p>
                    </div>

                    {/* 미니멀 점수 카드 */}
                    <div className={`score-card ${analysisResult.primaryId === 'minimal' ? 'score-card-winner' : ''}`}>
                      {analysisResult.primaryId === 'minimal' && (
                        <div className="winner-crown-badge">🏆 BEST MATCH</div>
                      )}
                      <div className="score-card-header">
                        <span className="score-card-style-name">미니멀 (Minimal)</span>
                        <span className="score-card-pct">{analysisResult.percentages.minimal}%</span>
                      </div>
                      <div className="score-number-display">
                        <span className="score-big-num">{analysisResult.scores.minimal}</span>
                        <span className="score-unit">/ 100점</span>
                      </div>
                      <div className="score-card-track">
                        <div
                          className="score-card-bar score-bar-minimal"
                          style={{ width: `${analysisResult.scores.minimal}%` }}
                        ></div>
                      </div>
                      <p className="score-card-status">
                        {analysisResult.scores.minimal >= 70 ? '강력한 일치' : analysisResult.scores.minimal >= 40 ? '보통 수준의 조화' : '낮은 일치도'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="result-body-grid">
                  <div className="result-photo-column">
                    <div className="result-photo-frame">
                      <img src={previewUrl} alt="분석된 코디" className="result-photo-img" />
                      <div className="result-photo-overlay-tag">
                        {analysisResult.styleInfo.nameEn}
                      </div>
                    </div>
                    <div className="result-file-info">
                      <span>{selectedFile?.name}</span>
                    </div>
                  </div>

                  <div className="result-details-column">
                    <div className="result-keywords-group">
                      <h4 className="section-small-title">감지된 무드 키워드</h4>
                      <div className="result-tags-wrap">
                        {analysisResult.styleInfo.tags.map((tag, idx) => (
                          <span key={idx} className="result-keyword-chip">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="result-comment-box">
                      <h4 className="section-small-title">AI 에디터 스타일 총평</h4>
                      <p className="result-summary-text">{analysisResult.styleInfo.summary}</p>
                    </div>

                    <div className="result-tips-box">
                      <h4 className="section-small-title">추천 스타일링 팁</h4>
                      <ul className="result-tips-list">
                        {analysisResult.styleInfo.stylingTips.map((tip, idx) => (
                          <li key={idx} className="result-tip-item">
                            <span className="tip-bullet">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="result-items-box">
                      <h4 className="section-small-title">어울리는 추천 아이템</h4>
                      <div className="recommended-items-wrap">
                        {analysisResult.styleInfo.recommendedItems.map((item, idx) => (
                          <span key={idx} className="recommended-item-badge">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="result-actions-footer">
                  <button
                    type="button"
                    className="btn btn-secondary-lg"
                    onClick={handleResetAnalysis}
                  >
                    <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    다른 사진 분석하기
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary-lg"
                    onClick={handleShareResult}
                  >
                    <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                    </svg>
                    분석 결과 복사하기
                  </button>
                </div>

                {copyToast && (
                  <div className="toast-notification">
                    ✓ 분석 결과가 클립보드에 복사되었습니다!
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 4. 3가지 패션 스타일 소개 섹션 */}
        <section id="styles" className="styles-section">
          <div className="section-header">
            <span className="section-eyebrow">CURATED STYLES</span>
            <h2 className="section-title">세 가지 패션 무드</h2>
            <p className="section-description">
              StyleLens AI가 분류하는 핵심 스타일 가이드를 확인해보세요.
            </p>
          </div>

          <div className="styles-grid">
            <article className="style-card">
              <div className="style-card-header">
                <span className="style-number">01</span>
                <span className="style-tag">STREET</span>
              </div>
              <h3 className="style-name">스트릿 (Street)</h3>
              <p className="style-headline">자유분방한 개성과 볼드한 트렌드</p>
              <p className="style-desc">
                루즈하고 과감한 오버핏 실루엣과 감각적인 그래픽 디테일, 
                서브컬처 감성이 녹아든 에너제틱한 패션 스타일입니다.
              </p>
              <div className="style-keywords">
                <span className="keyword-chip">#오버핏</span>
                <span className="keyword-chip">#그래픽</span>
                <span className="keyword-chip">#청키스니커즈</span>
                <span className="keyword-chip">#그런지</span>
              </div>
              <div className="style-features">
                <div className="feature-item">
                  <span className="feature-label">대표 아이템</span>
                  <span className="feature-val">오버사이즈 후디, 카고 팬츠, 봄버 자켓</span>
                </div>
                <div className="feature-item">
                  <span className="feature-label">핵심 무드</span>
                  <span className="feature-val">볼드함, 과감한 레이어드, 자유로움</span>
                </div>
              </div>
            </article>

            <article className="style-card">
              <div className="style-card-header">
                <span className="style-number">02</span>
                <span className="style-tag">CASUAL</span>
              </div>
              <h3 className="style-name">캐주얼 (Casual)</h3>
              <p className="style-headline">편안하면서도 단정한 데일리 밸런스</p>
              <p className="style-desc">
                누구나 일상에서 자연스럽게 즐길 수 있는 균형 잡힌 코디로, 
                실용성과 편안함을 놓치지 않는 세련된 데일리 웨어입니다.
              </p>
              <div className="style-keywords">
                <span className="keyword-chip">#데님</span>
                <span className="keyword-chip">#스웨트셔츠</span>
                <span className="keyword-chip">#스니커즈</span>
                <span className="keyword-chip">#이지웨어</span>
              </div>
              <div className="style-features">
                <div className="feature-item">
                  <span className="feature-label">대표 아이템</span>
                  <span className="feature-val">스트레이트 데님, 셔츠, 캔버스화</span>
                </div>
                <div className="feature-item">
                  <span className="feature-label">핵심 무드</span>
                  <span className="feature-val">친근함, 자연스러움, 실용적 핏</span>
                </div>
              </div>
            </article>

            <article className="style-card">
              <div className="style-card-header">
                <span className="style-number">03</span>
                <span className="style-tag">MINIMAL</span>
              </div>
              <h3 className="style-name">미니멀 (Minimal)</h3>
              <p className="style-headline">절제된 실루엣과 정갈한 톤온톤</p>
              <p className="style-desc">
                화려한 로고와 패턴을 덜어내고, 깔끔한 재단 라인과 
                뉴트럴 컬러의 고급스러운 텍스처로 완성하는 모던 룩입니다.
              </p>
              <div className="style-keywords">
                <span className="keyword-chip">#뉴트럴톤</span>
                <span className="keyword-chip">#클린실루엣</span>
                <span className="keyword-chip">#테일러드</span>
                <span className="keyword-chip">#모던</span>
              </div>
              <div className="style-features">
                <div className="feature-item">
                  <span className="feature-label">대표 아이템</span>
                  <span className="feature-val">블레이저, 슬랙스, 톤온톤 니트, 더비</span>
                </div>
                <div className="feature-item">
                  <span className="feature-label">핵심 무드</span>
                  <span className="feature-val">정갈함, 우아한 절제미, 클래식</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>

      {/* 5. 푸터 */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">STYLELENS AI</span>
            <p className="footer-copy">
              AI 기반 패션 스타일 분류 서비스 &copy; {CURRENT_YEAR} StyleLens AI. All rights reserved.
            </p>
          </div>
          <div className="footer-meta">
            <span>지원 형식: JPG, JPEG, PNG, WEBP</span>
            <span className="separator">|</span>
            <span>Street &bull; Casual &bull; Minimal</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
