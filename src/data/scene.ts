import { assetUrl } from '../config/runtime'

export type PresentationNode = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  keywords: string[]
  kind: 'pdf' | 'video' | 'image' | 'board'
  pageNumber: string
  x: number
  y: number
  source?: string
  pageLabel?: string
  imageLabel?: string
  boardLabel?: string
}

export const frenchTriggerWords = [
  'page',
  'aller',
  'vais',
  'vas',
  'va',
  'allons',
  'allez',
  'vont',
  'allais',
  'allait',
  'allions',
  'alliez',
  'allaient',
  'irai',
  'iras',
  'ira',
  'irons',
  'irez',
  'iront',
  'irais',
  'irait',
  'irions',
  'iriez',
  'iraient',
  'aille',
  'ailles',
  'aillent',
  'allant',
  'alle',
  'allee',
  'allees',
  'alles',
  'vas y',
  'allez y',
  'allons y',
  'on y va',
  'regarder',
  'regarde',
  'regardes',
  'regardons',
  'regardez',
  'regardent',
  'regardais',
  'regardait',
  'regardions',
  'regardiez',
  'regardaient',
  'regarderai',
  'regarderas',
  'regardera',
  'regarderons',
  'regarderez',
  'regarderont',
  'regarderais',
  'regarderait',
  'regarderions',
  'regarderiez',
  'regarderaient',
  'regardant',
  'regarde y',
  'regardez y',
] as const

export const WORLD_WIDTH = 3200
export const WORLD_HEIGHT = 2000
export const FRAME_WIDTH = 480
export const FRAME_HEIGHT = 270
export const HUB_POINT = { x: 1600, y: 1020 }

export const presentationNodes: PresentationNode[] = [
  {
    id: 'signal-field',
    eyebrow: '01 / North West',
    title: 'Aube',
    subtitle: 'Premier temps du cycle.',
    keywords: ['aube', 'aurore', 'levant', 'lever du jour', 'premiere lueur', 'matin naissant'],
    kind: 'pdf',
    pageNumber: '01',
    pageLabel: 'PDF / 16:9 thesis',
    x: 260,
    y: 220,
  },
  {
    id: 'context-grid',
    eyebrow: '02 / North',
    title: 'Zenith',
    subtitle: 'Plein jour et point haut.',
    keywords: ['zenith', 'zénith', 'midi', 'plein jour', 'meridien', 'méridien', 'apogee', 'apogée solaire'],
    kind: 'board',
    pageNumber: '02',
    boardLabel: 'Keyword board',
    x: 1360,
    y: 430,
  },
  {
    id: 'motion-reel',
    eyebrow: '03 / North East',
    title: 'Crepuscule',
    subtitle: 'Bascule vers le soir.',
    keywords: ['crepuscule', 'crépuscule', 'soir tombant', 'tombee du jour', 'tombée du jour', 'brune', 'declin', 'déclin'],
    kind: 'video',
    pageNumber: '03',
    source: assetUrl('media/demo-loop.mp4'),
    x: 2460,
    y: 180,
  },
  {
    id: 'material-study',
    eyebrow: '04 / South West',
    title: 'Minuit',
    subtitle: 'Nuit dense et heure noire.',
    keywords: ['minuit', 'nuit profonde', 'heure noire', 'milieu de la nuit', 'nocturne', 'nuit noire'],
    kind: 'image',
    pageNumber: '04',
    imageLabel: 'Still reference',
    x: 340,
    y: 1330,
  },
  {
    id: 'closing-frame',
    eyebrow: '05 / South East',
    title: 'Eternite',
    subtitle: 'Temps sans bord.',
    keywords: ['eternite', 'éternité', 'infini', 'intemporel', 'perpetuel', 'perpétuel', 'sans fin', 'hors du temps'],
    kind: 'pdf',
    pageNumber: '05',
    pageLabel: 'PDF / closing page',
    x: 2360,
    y: 1450,
  },
]

export const speechCommandHints = presentationNodes.map((node) => ({
  nodeId: node.id,
  label: node.title,
  keywords: node.keywords,
  pageNumber: node.pageNumber,
}))
