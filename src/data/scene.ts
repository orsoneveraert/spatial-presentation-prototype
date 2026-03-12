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

export const WORLD_WIDTH = 5800
export const WORLD_HEIGHT = 3600
export const FRAME_WIDTH = 480
export const FRAME_HEIGHT = 270
export const HUB_POINT = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }

const spokeAngles: Record<SpokeKey, number> = {
  northWest: (-145 * Math.PI) / 180,
  north: (-90 * Math.PI) / 180,
  northEast: (-35 * Math.PI) / 180,
  southWest: (145 * Math.PI) / 180,
  southEast: (35 * Math.PI) / 180,
}

const spokeDepths = [620, 980, 1340, 1700, 2060]
const spokeOffsets = [-72, -36, 0, 36, 72]
const verticalCompression = 0.72

const pageBlueprintsBySpoke: Record<SpokeKey, PageBlueprint[]> = {
  northWest: [
    {
      id: 'signal-field',
      eyebrow: '01 / North West',
      title: 'Aube',
      subtitle: 'Premier temps du cycle.',
      keywords: ['aube', 'aurore', 'premiere lueur', 'levant'],
      kind: 'board',
      pageNumber: '01',
    },
    {
      id: 'matins-choir',
      eyebrow: '06 / North West',
      title: 'Matines',
      subtitle: 'Heure canoniale du matin.',
      keywords: ['matines', 'premier office', 'chant matinal', 'heure canoniale'],
      kind: 'board',
      pageNumber: '06',
    },
    {
      id: 'dew-vector',
      eyebrow: '07 / North West',
      title: 'Rosee',
      subtitle: 'Surface humide avant chaleur.',
      keywords: ['rosee', 'perles d eau', 'gouttes du matin', 'herbe humide'],
      kind: 'board',
      pageNumber: '07',
    },
    {
      id: 'wake-current',
      eyebrow: '08 / North West',
      title: 'Eveil',
      subtitle: 'Sortie franche du sommeil.',
      keywords: ['eveil', 'sortie du sommeil', 'mise en route', 'premier elan'],
      kind: 'board',
      pageNumber: '08',
    },
    {
      id: 'meridian-rest',
      eyebrow: '09 / North West',
      title: 'Meridienne',
      subtitle: 'Pause solaire et heure chaude.',
      keywords: ['meridienne', 'heure chaude', 'sieste solaire', 'pause solaire'],
      kind: 'board',
      pageNumber: '09',
    },
  ],
  north: [
    {
      id: 'context-grid',
      eyebrow: '02 / North',
      title: 'Zenith',
      subtitle: 'Plein jour et point haut.',
      keywords: ['zenith', 'point haut', 'apogee solaire', 'midi absolu'],
      kind: 'board',
      pageNumber: '02',
    },
    {
      id: 'afterglow-plane',
      eyebrow: '10 / North',
      title: 'Apres-midi',
      subtitle: 'Jour avance sans rupture.',
      keywords: ['apres midi', 'apresmidi', 'jour avance', 'seconde lumiere'],
      kind: 'board',
      pageNumber: '10',
    },
    {
      id: 'falling-light',
      eyebrow: '11 / North',
      title: 'Declin',
      subtitle: 'La lumiere commence a pencher.',
      keywords: ['declin', 'jour qui penche', 'lumiere descendante', 'heure oblique'],
      kind: 'board',
      pageNumber: '11',
    },
    {
      id: 'vesper-index',
      eyebrow: '12 / North',
      title: 'Vepres',
      subtitle: 'Office du soir et bascule lente.',
      keywords: ['vepres', 'office du soir', 'heure vesperale', 'vesperal'],
      kind: 'board',
      pageNumber: '12',
    },
    {
      id: 'late-watch',
      eyebrow: '13 / North',
      title: 'Veillee',
      subtitle: 'Feu tardif avant la nuit pleine.',
      keywords: ['veillee', 'feu tardif', 'soir tard', 'heure veilleuse'],
      kind: 'board',
      pageNumber: '13',
    },
  ],
  northEast: [
    {
      id: 'motion-reel',
      eyebrow: '03 / North East',
      title: 'Crepuscule',
      subtitle: 'Bascule vers le soir.',
      keywords: ['crepuscule', 'entre chien et loup', 'brune', 'tombee du jour'],
      kind: 'board',
      pageNumber: '03',
    },
    {
      id: 'night-score',
      eyebrow: '14 / North East',
      title: 'Nocturne',
      subtitle: 'Paysage sonore de nuit.',
      keywords: ['nocturne', 'ombre musicale', 'nuit chantee', 'tableau nocturne'],
      kind: 'board',
      pageNumber: '14',
    },
    {
      id: 'sleep-break',
      eyebrow: '15 / North East',
      title: 'Insomnie',
      subtitle: 'Temps casse au milieu du repos.',
      keywords: ['insomnie', 'nuit blanche', 'yeux ouverts', 'sommeil casse'],
      kind: 'board',
      pageNumber: '15',
    },
    {
      id: 'dream-basin',
      eyebrow: '16 / North East',
      title: 'Songe',
      subtitle: 'Scene interieure sans horloge.',
      keywords: ['songe', 'reve profond', 'vision dormante', 'pays du reve'],
      kind: 'board',
      pageNumber: '16',
    },
    {
      id: 'material-study',
      eyebrow: '04 / North East',
      title: 'Minuit',
      subtitle: 'Nuit dense et heure noire.',
      keywords: ['minuit', 'douze coups', 'milieu nocturne', 'heure zero de nuit'],
      kind: 'board',
      pageNumber: '04',
    },
  ],
  southWest: [
    {
      id: 'mist-layer',
      eyebrow: '17 / South West',
      title: 'Brume',
      subtitle: 'Voile pale et temps suspendu.',
      keywords: ['brume', 'voile pale', 'brouillard leger', 'air laiteux'],
      kind: 'board',
      pageNumber: '17',
    },
    {
      id: 'underpoint',
      eyebrow: '18 / South West',
      title: 'Nadir',
      subtitle: 'Point bas du repere temporel.',
      keywords: ['nadir', 'point bas', 'contre zenith', 'fond du ciel'],
      kind: 'board',
      pageNumber: '18',
    },
    {
      id: 'equal-turn',
      eyebrow: '19 / South West',
      title: 'Equinoxe',
      subtitle: 'Equilibre exact entre jour et nuit.',
      keywords: ['equinoxe', 'egal jour nuit', 'bascule egale', 'equilibre solaire'],
      kind: 'board',
      pageNumber: '19',
    },
    {
      id: 'season-pivot',
      eyebrow: '20 / South West',
      title: 'Solstice',
      subtitle: 'Pivot lumineux des saisons.',
      keywords: ['solstice', 'pivot de saison', 'long jour', 'nuit la plus longue'],
      kind: 'board',
      pageNumber: '20',
    },
    {
      id: 'quarter-wheel',
      eyebrow: '21 / South West',
      title: 'Saison',
      subtitle: 'Grande boucle qui recadre l annee.',
      keywords: ['saison', 'quart de l an', 'cycle saisonnier', 'ronde des mois'],
      kind: 'board',
      pageNumber: '21',
    },
  ],
  southEast: [
    {
      id: 'tide-trace',
      eyebrow: '22 / South East',
      title: 'Maree',
      subtitle: 'Temps marin et flux periodique.',
      keywords: ['maree', 'flux et reflux', 'heure marine', 'montante'],
      kind: 'board',
      pageNumber: '22',
    },
    {
      id: 'loop-archive',
      eyebrow: '23 / South East',
      title: 'Cycle',
      subtitle: 'Retour complet d un motif temporel.',
      keywords: ['cycle', 'tour complet', 'retour periodique', 'boucle du temps'],
      kind: 'board',
      pageNumber: '23',
    },
    {
      id: 'breathing-gap',
      eyebrow: '24 / South East',
      title: 'Intervalle',
      subtitle: 'Entre-temps net et decoupant.',
      keywords: ['intervalle', 'entre temps', 'parenthese temporelle', 'temps suspendu'],
      kind: 'board',
      pageNumber: '24',
    },
    {
      id: 'time-trace',
      eyebrow: '25 / South East',
      title: 'Memoire',
      subtitle: 'Trace durable laissee par le temps.',
      keywords: ['memoire', 'trace du temps', 'archive vive', 'souvenir durable'],
      kind: 'board',
      pageNumber: '25',
    },
    {
      id: 'closing-frame',
      eyebrow: '05 / South East',
      title: 'Eternite',
      subtitle: 'Temps sans bord.',
      keywords: ['eternite', 'hors du temps', 'sans fin', 'infini calme'],
      kind: 'board',
      pageNumber: '05',
    },
  ],
}

function positionOnSpoke(spoke: SpokeKey, depthIndex: number) {
  const angle = spokeAngles[spoke]
  const radius = spokeDepths[depthIndex]
  const offset = spokeOffsets[depthIndex]
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

export const presentationNodes: PresentationNode[] = (
  Object.entries(pageBlueprintsBySpoke) as [SpokeKey, PageBlueprint[]][]
).flatMap(([spoke, spokePages]) =>
  spokePages.map((page, depthIndex) => ({
    ...page,
    ...positionOnSpoke(spoke, depthIndex),
  })),
).sort((left, right) => Number(left.pageNumber) - Number(right.pageNumber))

export const speechCommandHints = [...presentationNodes]
  .sort((left, right) => Number(left.pageNumber) - Number(right.pageNumber))
  .map((node) => ({
    nodeId: node.id,
    label: `p.${node.pageNumber} ${node.title}`,
    keywords: node.keywords,
    pageNumber: node.pageNumber,
  }))
