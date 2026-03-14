// Header sizes
export const DS3_HEADER_SIZE = 0x300
export const DS6_HEADER_SIZE = 0x627

// DS3/DX4/DSU track tables
export const PRIMARY_OFF = 0x004
export const PRIMARY_COUNT = 48

export const MIDDLE_OFF = 0x094
export const MIDDLE_COUNT = 18 // 9 pairs
export const PADDING_END = 0x0AA

export const DSU_PTR_OFF = 0x0AA
export const DSU_PTR_END = 0x0CE
export const DSU_SLOT_COUNT = 12

export const EXTENDED_OFF = 0x100
export const EXTENDED_COUNT = 40 // 20 pairs

export const CONFIG_OFF = 0x0CE
export const CONFIG_LEN = 50

// DS6 track tables
export const DS6_PRIMARY_OFF = 0x008
export const DS6_PRIMARY_COUNT = 54

export const DS6_EXT1_OFF = 0x100
export const DS6_EXT1_COUNT = 88 // 44 pairs

export const DS6_EXT2_OFF = 0x2B0
export const DS6_EXT2_COUNT = 156 // 78 pairs

export const DS6_EXT3_OFF = 0x490
export const DS6_EXT3_COUNT = 16 // 8 pairs

export const DS6_NAME_OFF = 0x526
export const DS6_NAME_LEN = 16

// Flash capacity
export const FLASH_32MBIT = 4 * 1024 * 1024 // 4,194,304
export const FLASH_64MBIT = 8 * 1024 * 1024 // 8,388,608

// Audio
export const SAMPLE_RATE = 13021
