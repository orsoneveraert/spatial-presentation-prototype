import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  HUB_POINT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type PresentationNode,
} from '../data/scene'

type PresentationStageProps = {
  activeNodeId: string | null
  nodes: PresentationNode[]
  onNodeSelect: (nodeId: string) => void
  onOverview: () => void
}

type CameraState = {
  scale: number
  x: number
  y: number
}

type PanOffset = {
  x: number
  y: number
}

type DragState = {
  hasMoved: boolean
  inertiaFrame: number | null
  isPointerDown: boolean
  lastClientX: number
  lastClientY: number
  lastTimestamp: number
  pointerId: number | null
  startClientX: number
  startClientY: number
  startPanX: number
  startPanY: number
  velocityX: number
  velocityY: number
  viewKey: string | null
}

function computeCamera(
  activeNodeId: string | null,
  nodes: PresentationNode[],
  viewportWidth: number,
  viewportHeight: number,
): CameraState {
  const overviewScale =
    Math.min(viewportWidth / WORLD_WIDTH, viewportHeight / WORLD_HEIGHT) * 0.92

  if (!activeNodeId) {
    return {
      scale: overviewScale,
      x: (viewportWidth - WORLD_WIDTH * overviewScale) / 2,
      y: (viewportHeight - WORLD_HEIGHT * overviewScale) / 2,
    }
  }

  const activeNode = nodes.find((node) => node.id === activeNodeId)

  if (!activeNode) {
    return {
      scale: overviewScale,
      x: (viewportWidth - WORLD_WIDTH * overviewScale) / 2,
      y: (viewportHeight - WORLD_HEIGHT * overviewScale) / 2,
    }
  }

  const focusScale = Math.min(
    (viewportWidth * 1.018) / FRAME_WIDTH,
    (viewportHeight * 1.018) / FRAME_HEIGHT,
  )
  const nodeCenterX = activeNode.x + FRAME_WIDTH / 2
  const nodeCenterY = activeNode.y + FRAME_HEIGHT / 2

  return {
    scale: focusScale,
    x: viewportWidth / 2 - nodeCenterX * focusScale,
    y: viewportHeight / 2 - nodeCenterY * focusScale,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getAxisBounds(viewportSize: number, scaledWorldSize: number) {
  const slack = Math.min(180, Math.max(96, viewportSize * 0.08))

  if (scaledWorldSize + slack * 2 <= viewportSize) {
    const centered = (viewportSize - scaledWorldSize) / 2

    return {
      min: centered - slack,
      max: centered + slack,
    }
  }

  return {
    min: viewportSize - scaledWorldSize - slack,
    max: slack,
  }
}

function clampPan(pan: PanOffset, camera: CameraState, viewportWidth: number, viewportHeight: number) {
  const scaledWorldWidth = WORLD_WIDTH * camera.scale
  const scaledWorldHeight = WORLD_HEIGHT * camera.scale
  const xBounds = getAxisBounds(viewportWidth, scaledWorldWidth)
  const yBounds = getAxisBounds(viewportHeight, scaledWorldHeight)
  const translateX = clamp(camera.x + pan.x, xBounds.min, xBounds.max)
  const translateY = clamp(camera.y + pan.y, yBounds.min, yBounds.max)

  return {
    x: translateX - camera.x,
    y: translateY - camera.y,
  }
}

function createEmptyDragState(): DragState {
  return {
    hasMoved: false,
    inertiaFrame: null,
    isPointerDown: false,
    lastClientX: 0,
    lastClientY: 0,
    lastTimestamp: 0,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    velocityX: 0,
    velocityY: 0,
    viewKey: null,
  }
}

export function PresentationStage({
  activeNodeId,
  nodes,
  onNodeSelect,
  onOverview,
}: PresentationStageProps) {
  const [viewport, setViewport] = useState({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  })
  const [panByView, setPanByView] = useState<Record<string, PanOffset>>({})
  const [draggingViewKey, setDraggingViewKey] = useState<string | null>(null)
  const dragStateRef = useRef<DragState>(createEmptyDragState())
  const latestCameraRef = useRef<CameraState>({
    scale: 1,
    x: 0,
    y: 0,
  })
  const latestViewportRef = useRef(viewport)
  const latestViewKeyRef = useRef('__overview')
  const suppressClickTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const viewKey = activeNodeId ?? '__overview'
  const camera = useMemo(
    () =>
      computeCamera(
        activeNodeId,
        nodes,
        viewport.width,
        viewport.height,
      ),
    [activeNodeId, nodes, viewport.height, viewport.width],
  )
  const rawPan = panByView[viewKey] ?? { x: 0, y: 0 }
  const pan = clampPan(rawPan, camera, viewport.width, viewport.height)
  const isDragging = draggingViewKey === viewKey
  const shouldFloat = !activeNodeId && !isDragging

  const stopInertia = useCallback(() => {
    const currentDragState = dragStateRef.current

    if (currentDragState.inertiaFrame !== null) {
      cancelAnimationFrame(currentDragState.inertiaFrame)
      currentDragState.inertiaFrame = null
    }
  }, [])

  useEffect(() => {
    latestCameraRef.current = camera
    latestViewportRef.current = viewport
    latestViewKeyRef.current = viewKey
  }, [camera, viewKey, viewport])

  useEffect(() => {
    const focusSources = nodes
      .map((node) => node.focusSource)
      .filter((focusSource): focusSource is string => Boolean(focusSource))

    if (focusSources.length === 0) {
      return
    }

    let cancelled = false
    let preloadIndex = 0
    let timerId: number | null = null

    const preloadNext = () => {
      if (cancelled || preloadIndex >= focusSources.length) {
        return
      }

      const image = new Image()
      image.decoding = 'async'
      image.loading = 'eager'
      image.src = focusSources[preloadIndex]!
      preloadIndex += 1

      const scheduleNext = () => {
        if (cancelled || preloadIndex >= focusSources.length) {
          return
        }

        timerId = window.setTimeout(preloadNext, 120)
      }

      image.onload = scheduleNext
      image.onerror = scheduleNext
    }

    timerId = window.setTimeout(preloadNext, 360)

    return () => {
      cancelled = true

      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
    }
  }, [nodes])

  useEffect(
    () => () => {
      stopInertia()

      if (suppressClickTimeoutRef.current !== null) {
        window.clearTimeout(suppressClickTimeoutRef.current)
      }
    },
    [stopInertia],
  )

  const armClickSuppression = () => {
    if (suppressClickTimeoutRef.current !== null) {
      window.clearTimeout(suppressClickTimeoutRef.current)
    }

    suppressClickTimeoutRef.current = window.setTimeout(() => {
      suppressClickTimeoutRef.current = null
    }, 180)
  }

  const shouldSuppressClick = () => suppressClickTimeoutRef.current !== null

  const setPanForView = (targetViewKey: string, nextPan: PanOffset) => {
    setPanByView((currentPanByView) => {
      const previousPan = currentPanByView[targetViewKey]

      if (previousPan?.x === nextPan.x && previousPan?.y === nextPan.y) {
        return currentPanByView
      }

      return {
        ...currentPanByView,
        [targetViewKey]: nextPan,
      }
    })
  }

  const startInertia = () => {
    stopInertia()
    setDraggingViewKey(null)

    const step = (timestamp: number) => {
      const currentDragState = dragStateRef.current

      if (!currentDragState.viewKey || currentDragState.viewKey !== latestViewKeyRef.current) {
        currentDragState.inertiaFrame = null
        return
      }

      if (currentDragState.lastTimestamp === 0) {
        currentDragState.lastTimestamp = timestamp
      }

      const deltaTime = Math.max(timestamp - currentDragState.lastTimestamp, 16)
      currentDragState.lastTimestamp = timestamp

      const friction = Math.pow(0.9, deltaTime / 16.67)
      currentDragState.velocityX *= friction
      currentDragState.velocityY *= friction

      const speed = Math.hypot(currentDragState.velocityX, currentDragState.velocityY)

      if (speed < 0.025) {
        currentDragState.inertiaFrame = null
        return
      }

      setPanByView((currentPanByView) => {
        const currentPan = currentPanByView[currentDragState.viewKey!] ?? { x: 0, y: 0 }
        const unclampedPan = {
          x: currentPan.x + currentDragState.velocityX * deltaTime,
          y: currentPan.y + currentDragState.velocityY * deltaTime,
        }
        const clampedPan = clampPan(
          unclampedPan,
          latestCameraRef.current,
          latestViewportRef.current.width,
          latestViewportRef.current.height,
        )

        if (clampedPan.x !== unclampedPan.x) {
          currentDragState.velocityX *= 0.42
        }

        if (clampedPan.y !== unclampedPan.y) {
          currentDragState.velocityY *= 0.42
        }

        const previousPan = currentPanByView[currentDragState.viewKey!]

        if (previousPan?.x === clampedPan.x && previousPan?.y === clampedPan.y) {
          return currentPanByView
        }

        return {
          ...currentPanByView,
          [currentDragState.viewKey!]: clampedPan,
        }
      })

      currentDragState.inertiaFrame = requestAnimationFrame(step)
    }

    dragStateRef.current.lastTimestamp = 0
    dragStateRef.current.inertiaFrame = requestAnimationFrame(step)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }

    stopInertia()

    const currentDragState = dragStateRef.current
    currentDragState.isPointerDown = true
    currentDragState.pointerId = event.pointerId
    currentDragState.hasMoved = false
    currentDragState.startClientX = event.clientX
    currentDragState.startClientY = event.clientY
    currentDragState.lastClientX = event.clientX
    currentDragState.lastClientY = event.clientY
    currentDragState.startPanX = pan.x
    currentDragState.startPanY = pan.y
    currentDragState.lastTimestamp = event.timeStamp
    currentDragState.velocityX = 0
    currentDragState.velocityY = 0
    currentDragState.viewKey = viewKey

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const currentDragState = dragStateRef.current

    if (!currentDragState.isPointerDown || currentDragState.pointerId !== event.pointerId) {
      return
    }

    const deltaFromStartX = event.clientX - currentDragState.startClientX
    const deltaFromStartY = event.clientY - currentDragState.startClientY
    const movementDistance = Math.hypot(deltaFromStartX, deltaFromStartY)

    if (!currentDragState.hasMoved && movementDistance < 7) {
      return
    }

    if (!currentDragState.hasMoved) {
      currentDragState.hasMoved = true
      setDraggingViewKey(currentDragState.viewKey)
      armClickSuppression()
    }

    const nextPan = clampPan(
      {
        x: currentDragState.startPanX + deltaFromStartX,
        y: currentDragState.startPanY + deltaFromStartY,
      },
      latestCameraRef.current,
      latestViewportRef.current.width,
      latestViewportRef.current.height,
    )

    const deltaTime = Math.max(event.timeStamp - currentDragState.lastTimestamp, 16)
    currentDragState.velocityX =
      currentDragState.velocityX * 0.34 +
      ((event.clientX - currentDragState.lastClientX) / deltaTime) * 0.66
    currentDragState.velocityY =
      currentDragState.velocityY * 0.34 +
      ((event.clientY - currentDragState.lastClientY) / deltaTime) * 0.66
    currentDragState.lastClientX = event.clientX
    currentDragState.lastClientY = event.clientY
    currentDragState.lastTimestamp = event.timeStamp

    if (currentDragState.viewKey) {
      setPanForView(currentDragState.viewKey, nextPan)
    }
  }

  const finishPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const currentDragState = dragStateRef.current

    if (!currentDragState.isPointerDown || currentDragState.pointerId !== event.pointerId) {
      return
    }

    currentDragState.isPointerDown = false
    currentDragState.pointerId = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (currentDragState.hasMoved) {
      armClickSuppression()

      if (Math.hypot(currentDragState.velocityX, currentDragState.velocityY) > 0.03) {
        startInertia()
      } else {
        setDraggingViewKey(null)
        currentDragState.viewKey = null
      }

      currentDragState.hasMoved = false
      return
    }

    setDraggingViewKey(null)
    currentDragState.viewKey = null
  }

  const cameraTranslateX = camera.x + pan.x
  const cameraTranslateY = camera.y + pan.y

  return (
    <section
      className={`stage ${isDragging ? 'stage--dragging' : ''}`}
      onClickCapture={(event) => {
        if (!shouldSuppressClick()) {
          return
        }

        event.preventDefault()
        event.stopPropagation()

        if (suppressClickTimeoutRef.current !== null) {
          window.clearTimeout(suppressClickTimeoutRef.current)
          suppressClickTimeoutRef.current = null
        }
      }}
      onPointerCancel={finishPointer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
    >
      <div
        className={`stage__camera ${
          activeNodeId ? 'stage__camera--focused' : ''
        } ${isDragging ? 'stage__camera--dragging' : ''}`}
        style={{
          transform: `translate(${cameraTranslateX}px, ${cameraTranslateY}px) scale(${camera.scale})`,
        }}
      >
        <div
          className={`stage__drift ${shouldFloat ? 'stage__drift--floating' : ''} ${
            isDragging ? 'stage__drift--paused' : ''
          }`}
        >
          <div
            className="stage__world"
            style={{
              height: `${WORLD_HEIGHT}px`,
              width: `${WORLD_WIDTH}px`,
            }}
          >
            <svg
              aria-hidden="true"
              className="stage__wiring"
              viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
            >
              {nodes.map((node) => (
                <line
                  className={activeNodeId === node.id ? 'stage__line stage__line--active' : 'stage__line'}
                  key={node.id}
                  x1={HUB_POINT.x}
                  x2={node.x + FRAME_WIDTH / 2}
                  y1={HUB_POINT.y}
                  y2={node.y + FRAME_HEIGHT / 2}
                />
              ))}
            </svg>

            <button
              className="hub"
              onClick={onOverview}
              style={{
                left: HUB_POINT.x - 9,
                top: HUB_POINT.y - 9,
              }}
              aria-label="Return to overview"
              type="button"
            >
              <span className="hub__core" />
            </button>

            {nodes.map((node) => {
              const isActive = node.id === activeNodeId

              return (
                <button
                  className={`frame ${isActive ? 'frame--active' : ''} ${activeNodeId && !isActive ? 'frame--dimmed' : ''}`}
                  key={node.id}
                  onClick={() => onNodeSelect(node.id)}
                  style={{ left: node.x, top: node.y }}
                  aria-label={node.title}
                  type="button"
                >
                  {node.source ? (
                    <img
                      alt=""
                      className="frame__media"
                      decoding={isActive ? 'sync' : 'async'}
                      draggable={false}
                      fetchPriority={isActive ? 'high' : 'low'}
                      loading={isActive ? 'eager' : 'lazy'}
                      src={isActive && node.focusSource ? node.focusSource : node.source}
                    />
                  ) : null}
                  <span aria-hidden="true" className="frame__page-number">
                    {`p.${node.pageNumber}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
