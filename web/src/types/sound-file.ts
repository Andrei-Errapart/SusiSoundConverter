export type SoundFormat = 'DSD' | 'DS3' | 'DX4' | 'DSU' | 'DS6' | 'DHE'

export type TrackTableKind =
  | 'primary'
  | 'extended'
  | 'middle'
  | 'dsu'
  | 'ds6_ext1'
  | 'ds6_ext2'
  | 'ds6_ext3'
  | 'dhe_tracks'

export interface Track {
  index: number
  table: TrackTableKind
  audio: Uint8Array
  loopOffset: number
  originalAddress?: number
}

export interface DheRecord {
  addrA: number
  addrB: number
  addrC: number
  flag1: number
  flag2: number
}

export interface TrackTable {
  kind: TrackTableKind
  label: string
  entryCount: number
  isPaired: boolean
  slots: (Track | null)[]
}

export interface SoundFile {
  filename: string
  format: SoundFormat
  tables: TrackTable[]
  config: Uint8Array
  soundName?: string
  headerTemplate: Uint8Array
  preAudioGap?: Uint8Array
  flashSize: number
  sampleRate: number
  bitDepth: number
  dheRecords?: DheRecord[]
  dirty: boolean
}
