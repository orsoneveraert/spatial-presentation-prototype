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

type PageBlueprint = Omit<PresentationNode, 'x' | 'y'>
type SpokeKey = 'northWest' | 'north' | 'northEast' | 'southWest' | 'southEast'

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
  'parler',
  'parle',
  'parles',
  'parlons',
  'parlez',
  'parlent',
  'parlais',
  'parlait',
  'parlions',
  'parliez',
  'parlaient',
  'parlai',
  'parlas',
  'parla',
  'parlames',
  'parlates',
  'parlerent',
  'parlerai',
  'parleras',
  'parlera',
  'parlerons',
  'parlerez',
  'parleront',
  'parlerais',
  'parlerait',
  'parlerions',
  'parleriez',
  'parleraient',
  'parlasse',
  'parlasses',
  'parlat',
  'parlassions',
  'parlassiez',
  'parlassent',
  'parlant',
  'parle moi',
  'parlez moi',
  'parle y',
  'parlez y',
] as const

export const WORLD_WIDTH = 5200
export const WORLD_HEIGHT = 3200
export const FRAME_WIDTH = 480
export const FRAME_HEIGHT = 270
export const HUB_POINT = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }

const spokeAngles: Record<SpokeKey, number> = {
  northWest: (-146 * Math.PI) / 180,
  north: (-92 * Math.PI) / 180,
  northEast: (-34 * Math.PI) / 180,
  southWest: (146 * Math.PI) / 180,
  southEast: (34 * Math.PI) / 180,
}

const spokeSequence: SpokeKey[] = ['northWest', 'north', 'northEast', 'southWest', 'southEast']
const verticalCompression = 0.74

const depthPresetsByCount: Record<number, number[]> = {
  1: [980],
  2: [760, 1280],
  3: [640, 1040, 1440],
  4: [560, 920, 1280, 1640],
  5: [520, 860, 1200, 1540, 1880],
}

const offsetPresetsByCount: Record<number, number[]> = {
  1: [0],
  2: [-18, 18],
  3: [-44, 0, 44],
  4: [-72, -24, 24, 72],
  5: [-96, -48, 0, 48, 96],
}

function pageSource(pageNumber: string) {
  return assetUrl(`media/psychodesign-remise/page-${pageNumber}.png`)
}

const pageBlueprints: PageBlueprint[] = [
  {
    id: 'page-01-psychodesign',
    eyebrow: '01 / Cover',
    title: 'Psychodesign',
    subtitle: 'Page de garde et manifeste du projet.',
    keywords: ['page de garde', 'premiere de couverture', 'frontispice', 'ouverture du deck'],
    kind: 'image',
    pageNumber: '01',
    source: pageSource('01'),
  },
  {
    id: 'page-02-prevalence',
    eyebrow: '02 / Intro',
    title: 'Prevalence ADHD',
    subtitle: 'Constat statistique d entree.',
    keywords: ['prevalence adhd', 'trois pour cent', 'statistique mondiale', 'chiffre cle'],
    kind: 'image',
    pageNumber: '02',
    source: pageSource('02'),
  },
  {
    id: 'page-03-sommaire',
    eyebrow: '03 / Map',
    title: 'Sommaire',
    subtitle: 'Table d entree des douze pistes.',
    keywords: ['sommaire', 'table des matieres', 'table des contenus', 'plan des idees'],
    kind: 'image',
    pageNumber: '03',
    source: pageSource('03'),
  },
  {
    id: 'page-04-cecite-temporelle',
    eyebrow: '04 / Time Passing',
    title: 'Cecite Temporelle',
    subtitle: 'Temps ecoule et lecture analogique.',
    keywords: ['cecite temporelle', 'temps ecoule', 'derive horaire', 'horloge analogique'],
    kind: 'image',
    pageNumber: '04',
    source: pageSource('04'),
  },
  {
    id: 'page-05-clochers-pomodoro',
    eyebrow: '05 / Bells',
    title: 'Clochers et Pomodoro',
    subtitle: 'Les cloches comme metronome social.',
    keywords: ['clochers', 'pomodoro', 'metronome social', 'sonnerie civile'],
    kind: 'image',
    pageNumber: '05',
    source: pageSource('05'),
  },
  {
    id: 'page-06-time-timer',
    eyebrow: '06 / Domestic Timer',
    title: 'Minuteur Visuel',
    subtitle: 'Un time timer transpose au foyer.',
    keywords: ['minuteur visuel', 'timer domestique', 'cadreur de duree', 'compte a rebours'],
    kind: 'image',
    pageNumber: '06',
    source: pageSource('06'),
  },
  {
    id: 'page-07-horloge-gare',
    eyebrow: '07 / Station Clock',
    title: 'Horloge de Gare',
    subtitle: 'Lecture LED en temps de rush.',
    keywords: ['horloge de gare', 'quai led', 'affichage lumineux', 'lecture express'],
    kind: 'image',
    pageNumber: '07',
    source: pageSource('07'),
  },
  {
    id: 'page-08-parcours-regard',
    eyebrow: '08 / Gaze Plotting',
    title: 'Parcours du Regard',
    subtitle: 'Observer les traces oculaires du design.',
    keywords: ['parcours du regard', 'trace oculaire', 'cartographie visuelle', 'oculometrie'],
    kind: 'image',
    pageNumber: '08',
    source: pageSource('08'),
  },
  {
    id: 'page-09-propagande-temps',
    eyebrow: '09 / Time Propaganda',
    title: 'Propagande du Temps',
    subtitle: 'Rythmes neurotypiques et contraintes horaire.',
    keywords: ['propagande temporelle', 'horaire normatif', 'temps prescrit', 'agenda disciplinaire'],
    kind: 'image',
    pageNumber: '09',
    source: pageSource('09'),
  },
  {
    id: 'page-10-patterns',
    eyebrow: '10 / Design Patterns',
    title: 'Patrons de Design',
    subtitle: 'Liste de principes materiels et d usage.',
    keywords: ['patrons de design', 'motifs d usage', 'tactilite', 'wabi sabi'],
    kind: 'image',
    pageNumber: '10',
    source: pageSource('10'),
  },
  {
    id: 'page-11-energie-facilite',
    eyebrow: '11 / Pattern Studies',
    title: 'Energie et Facilite',
    subtitle: 'Deux planches de recherche sur l effort.',
    keywords: ['energie utile', 'facilite d acces', 'deploiement simple', 'effort moindre'],
    kind: 'image',
    pageNumber: '11',
    source: pageSource('11'),
  },
  {
    id: 'page-12-empilage-etapes',
    eyebrow: '12 / Pattern Studies',
    title: 'Empilage et Etapes',
    subtitle: 'Stackable et few steps en etudes.',
    keywords: ['empilage', 'peu d etapes', 'superposition', 'chemin court'],
    kind: 'image',
    pageNumber: '12',
    source: pageSource('12'),
  },
  {
    id: 'page-13-orientation',
    eyebrow: '13 / Pattern Studies',
    title: 'Orientation',
    subtitle: 'Direction et composition guidee.',
    keywords: ['orientation', 'vecteurs', 'boussole', 'ramification'],
    kind: 'image',
    pageNumber: '13',
    source: pageSource('13'),
  },
  {
    id: 'page-14-outils-adhd',
    eyebrow: '14 / Tool Atlas',
    title: 'Outils ADHD',
    subtitle: 'Une interface de categories et d aides.',
    keywords: ['boite a outils', 'catalogue d aides', 'interface de soutien', 'trousse adhd'],
    kind: 'image',
    pageNumber: '14',
    source: pageSource('14'),
  },
  {
    id: 'page-15-bidouille',
    eyebrow: '15 / Life Modding',
    title: 'Bidouille du Quotidien',
    subtitle: 'Life modding et protheses du geste.',
    keywords: ['bidouille du quotidien', 'prothese textile', 'ajustement vital', 'bricolage de vie'],
    kind: 'image',
    pageNumber: '15',
    source: pageSource('15'),
  },
  {
    id: 'page-16-rhomboide',
    eyebrow: '16 / Rhombus Model',
    title: 'Modele Rhomboide',
    subtitle: 'Objectif final, sous-buts et distractions.',
    keywords: ['modele rhomboide', 'objectif final', 'sous buts', 'parasites'],
    kind: 'image',
    pageNumber: '16',
    source: pageSource('16'),
  },
  {
    id: 'page-17-resonance',
    eyebrow: '17 / Beat Finder',
    title: 'Resonance Sonore',
    subtitle: 'Le bruit benefique pour retrouver le focus.',
    keywords: ['resonance stochastique', 'bruit benefique', 'pulsation', 'calage sonore'],
    kind: 'image',
    pageNumber: '17',
    source: pageSource('17'),
  },
  {
    id: 'page-18-geospatial',
    eyebrow: '18 / Geospatial Loss',
    title: 'Memoire Geospatiale',
    subtitle: 'Perte de trajectoire et reperes spatiaux.',
    keywords: ['amnesie spatiale', 'trajet perdu', 'repere geographique', 'memoire de route'],
    kind: 'image',
    pageNumber: '18',
    source: pageSource('18'),
  },
]

function positionOnSpoke(spoke: SpokeKey, depthIndex: number, itemCount: number) {
  const angle = spokeAngles[spoke]
  const depths = depthPresetsByCount[itemCount]
  const offsets = offsetPresetsByCount[itemCount]
  const radius = depths?.[depthIndex] ?? 980
  const offset = offsets?.[depthIndex] ?? 0
  const perpendicularAngle = angle + Math.PI / 2
  const centerX =
    HUB_POINT.x +
    Math.cos(angle) * radius +
    Math.cos(perpendicularAngle) * offset
  const centerY =
    HUB_POINT.y +
    Math.sin(angle) * radius * verticalCompression +
    Math.sin(perpendicularAngle) * offset * 0.9

  return {
    x: Math.round(centerX - FRAME_WIDTH / 2),
    y: Math.round(centerY - FRAME_HEIGHT / 2),
  }
}

function distributeAcrossSpokes(pages: PageBlueprint[]) {
  const baseCount = Math.floor(pages.length / spokeSequence.length)
  const remainder = pages.length % spokeSequence.length
  let cursor = 0

  return spokeSequence.flatMap((spoke, spokeIndex) => {
    const itemCount = baseCount + (spokeIndex < remainder ? 1 : 0)
    const spokePages = pages.slice(cursor, cursor + itemCount)
    cursor += itemCount

    return spokePages.map((page, depthIndex) => ({
      ...page,
      ...positionOnSpoke(spoke, depthIndex, itemCount),
    }))
  })
}

export const presentationNodes: PresentationNode[] = distributeAcrossSpokes(pageBlueprints)
  .sort((left, right) => Number(left.pageNumber) - Number(right.pageNumber))

export const speechCommandHints = presentationNodes.map((node) => ({
  nodeId: node.id,
  label: `p.${node.pageNumber} ${node.title}`,
  keywords: node.keywords,
  pageNumber: node.pageNumber,
}))
