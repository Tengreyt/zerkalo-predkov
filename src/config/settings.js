const requestedFit = typeof location === 'undefined'
  ? null
  : new URLSearchParams(location.search).get('fit');

/**
 * Все настраиваемые параметры системы в одном месте.
 * Пороги комплекции калибруются на живых людях через ?debug=1.
 */
export const settings = {
  /** Стратегия позиционирования костюма: 'dynamic' — по ключевым точкам, 'fixed' — план Б («волшебное зеркало»). */
  positioningStrategy: ['hybrid', 'dynamic', 'fixed'].includes(requestedFit)
    ? requestedFit
    : 'hybrid',

  /** 'single' — один главный скелет; 'multi' — все найденные люди с независимыми пресетами. */
  peopleMode: 'multi',

  pose: {
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  /** Классификация комплекции: r = shoulderRatio*0.6 + hipRatio*0.4. */
  bodyClass: {
    THIN: 0.155,
    LARGE: 0.185,
    shoulderWeight: 0.6,
    hipWeight: 0.4,
    /** Сколько кадров копим для медианы во время таймера 3-2-1. */
    medianSamples: 15,
  },

  smoothing: {
    /**
     * Адаптивный One Euro filter: на месте сильнее гасит дрожание, при движении
     * автоматически становится отзывчивее. Значения подобраны для 25–60 fps.
     */
    minCutoff: 1.15,
    beta: 0.045,
    derivativeCutoff: 1.0,
    /** Защита от единичного выброса MediaPipe, доля кадра за один видеокадр. */
    maxJump: 0.12,
  },

  overlay: {
    /** Множитель масштаба нательного костюма относительно ширины плеч. */
    bodyScaleFactor: 1.06,
    /** Множитель масштаба головного убора относительно расстояния между ушами. */
    headScaleFactor: 1.12,
    /**
     * Подъём головного убора вверх, в долях расстояния между ушами.
     * Уши ≈ уровень глаз, поэтому без подъёма шапка садится на глаза;
     * ~0.8 поднимает нижний край выше бровей (шапка сидит на макушке).
     */
    headLiftFactor: 0.8,
    /** Минимальная видимость ключевых точек, ниже — поза «неуверенная». */
    minVisibility: 0.55,
    /** Сколько кадров подряд поза может теряться до скрытия костюма. */
    maxLostFrames: 12,
    /** Сколько новых кадров держать «неуверенную» позу до показа подсказки (гистерезис). */
    hintDelayFrames: 10,
    /** Скорость затухания/появления костюма (альфа прозрачности за кадр). */
    fadeStep: 0.12,

    /** Деформация PNG по нескольким горизонтальным сечениям тела. */
    bodyWarp: {
      enabled: true,
      /** Положение смысловых рядов внутри PNG после линии плеч (0..1). */
      sourceRows: {
        waist: 0.24,
        hips: 0.42,
        knees: 0.70,
        hem: 1,
      },
      /** Ожидаемая ширина тела относительно плеч; нужна только для мягкой коррекции формы. */
      referenceWidth: {
        waist: 0.88,
        hips: 0.84,
      },
      /** Не даём шумным точкам чрезмерно растягивать фактуру костюма. */
      minShapeScale: 0.84,
      maxShapeScale: 1.16,
      /** До какой доли пути от плеч к бёдрам находится талия. */
      waistPosition: 0.66,
    },

    /** Отдельная инерция ткани рукавов поверх сглаживания точек тела. */
    sleeveSmoothing: {
      /** Базовое время следования: убирает мелкую дрожь кисти/локтя. */
      followMs: 105,
      /** При быстром движении рукав ускоряется и не отстаёт от руки. */
      fastFollowMs: 38,
      speedForFast: 720,
      /** Короткая потеря кисти держит последнюю форму вместо скачка. */
      dropoutHoldMs: 360,
      /** Плавное возвращение к статичной позе при долгой потере руки. */
      fallbackMs: 280,
      /** z-порядок меняется только после нескольких устойчивых кадров. */
      inFrontFrames: 3,
    },
  },

  /** План Б: фиксированная рамка костюма (доли от размеров видео). */
  fixedFrame: {
    centerX: 0.5,
    shoulderY: 0.32,
    shoulderWidth: 0.28,
    hipY: 0.54,
    kneeY: 0.75,
    ankleY: 0.94,
    headBottomY: 0.245,
    headWidthFromShoulders: 0.48,
  },

  timers: {
    /** Секунды обратного отсчёта перед снимком. */
    countdown: 3,
    /** Автосброс в IDLE после бездействия, мс. */
    idleResetMs: 30_000,
    /** Длительность анимации «проявки», мс. */
    processingMinMs: 1000,
  },

  photo: {
    /** Тёплый пресет поверх готового кадра (ctx.filter). */
    colorGrade: 'brightness(1.05) contrast(1.06) saturate(1.12) sepia(0.12)',
    background: { width: 1920, height: 1080 },
  },

  /** Управление жестами руки (MediaPipe GestureRecognizer, on-device). */
  gesture: {
    numHands: 1,
    minConfidence: 0.45,
    /** ML-категория ниже этого порога проверяется геометрией пальцев. */
    modelConfidence: 0.64,
    /** Стабильная частота распознавания независимо от fps камеры (~12.5 Hz). */
    intervalMs: 80,
    /** Краткая потеря руки не обрывает удержание ладони. */
    dropoutGraceFrames: 3,
    /** Ладонь подтверждения должна быть поднята и достаточно крупна в кадре. */
    confirmPalmMaxWristY: 0.72,
    confirmPalmMinSize: 0.028,
    confirmPalmMinFacing: 0.30,
    /** Любой управляющий жест работает только с поднятой и хорошо видимой кистью. */
    controlHandMaxWristY: 0.70,
    controlHandMinSize: 0.025,
    /** Минимальный интервал между дискретными действиями, мс. */
    cooldownMs: 720,
    /** Сколько держать раскрытую ладонь для подтверждения (старт / ещё раз), мс. */
    holdMs: 900,
    /** Сколько держать два пальца у края для смены костюма. */
    navigationHoldMs: 1400,
    /** Короткий провал распознавания не сбрасывает боковое удержание. */
    navigationDropoutGraceMs: 240,
    /** Сколько кадров жест должен быть стабилен, чтобы считаться распознанным. */
    debounceFrames: 2,
  },

  /** Куда ведёт QR, пока нет serverless-выдачи фото. */
  projectUrl: 'https://github.com/chgu-digital-museum/zerkalo-predkov',

  paths: {
    wasm: '/mediapipe/wasm',
    poseModel: '/models/pose_landmarker_lite.task',
    segmenterModel: '/models/selfie_multiclass.tflite',
    gestureModel: '/models/gesture_recognizer.task',
    assets: '/assets/costumes',
  },
};

/** Индексы ключевых точек MediaPipe Pose. */
export const LM = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};
