export type SoundFormat = 'DS3' | 'DX4' | 'DSU' | 'DS6'

export type TrackTableKind =
  | 'primary'
  | 'extended'
  | 'middle'
  | 'dsu'
  | 'ds6_ext1'
  | 'ds6_ext2'
  | 'ds6_ext3'

export interface Track {
  index: number
  table: TrackTableKind
  audio: Uint8Array
  loopOffset: number
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
  flashSize: number
  dirty: boolean
}
