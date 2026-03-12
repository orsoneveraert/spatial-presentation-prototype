import { useEffect, useState } from 'react'
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

function computeCamera(
  activeNodeId: string | null,
  nodes: PresentationNode[],
  viewportWidth: number,
  viewportHeight: number,
) {
  const overviewScale =
    Math.min(viewportWidth / WORLD_WIDTH, viewportHeight / WORLD_HEIGHT) * 0.9

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
    (viewportWidth * 0.94) / FRAME_WIDTH,
    (viewportHeight * 0.9) / FRAME_HEIGHT,
  )
  const nodeCenterX = activeNode.x + FRAME_WIDTH / 2
  const nodeCenterY = activeNode.y + FRAME_HEIGHT / 2

  return {
    scale: focusScale,
    x: viewportWidth / 2 - nodeCenterX * focusScale,
    y: viewportHeight / 2 - nodeCenterY * focusScale,
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

  const camera = computeCamera(
    activeNodeId,
    nodes,
    viewport.width,
    viewport.height,
  )
  return (
    <section className="stage">
      <div
        className={`stage__camera ${activeNodeId ? 'stage__camera--focused' : ''}`}
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        }}
      >
        <div className="stage__world">
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
                <span aria-hidden="true" className="frame__page-number">
                  {`p.${node.pageNumber}`}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
