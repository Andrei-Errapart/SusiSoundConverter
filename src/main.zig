const std = @import("std");
const Io = std.Io;
const Dir = Io.Dir;
const File = Io.File;
const Allocator = std.mem.Allocator;
const path = std.fs.path;

const HEADER_SIZE: usize = 0x300;
const USER_PTR_OFFSET: usize = 0x0AA;
const FLASH_SIZE: usize = 4 * 1024 * 1024; // 32 Mbit
const TOTAL_SLOTS: usize = 12; // 4 sounds × 3 segments (Anf, Loop, End)

const DspProject = struct {
    dsd_filename: []const u8,
    wav_filenames: [TOTAL_SLOTS]?[]const u8,
};

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const io = init.io;
    const args = try init.minimal.args.toSlice(arena);

    if (args.len != 2) {
        std.debug.print("Usage: {s} <DSP_FILE>\n", .{args[0]});
        std.process.exit(1);
    }

    const dsp_path = args[1];
    const dsp_dir = path.dirname(dsp_path) orelse ".";

    // Parse DSP project file
    const dsp = try parseDsp(arena, io, dsp_path);

    // Read DS3 base file
    const ds3_path = try path.join(arena, &.{ dsp_dir, dsp.dsd_filename });
    const ds3_data = try Dir.readFileAlloc(.cwd(), io, ds3_path, arena, .limited(16 * 1024 * 1024));

    // Read WAV audio data for each slot
    var wav_audio: [TOTAL_SLOTS]?[]const u8 = .{null} ** TOTAL_SLOTS;
    for (&wav_audio, dsp.wav_filenames) |*slot_audio, wav_name_opt| {
        if (wav_name_opt) |wav_name| {
            const wav_path = try path.join(arena, &.{ dsp_dir, wav_name });
            slot_audio.* = try readWavAudio(arena, io, wav_path);
        }
    }

    // Build DSU output
    const dsu = try buildDsu(arena, ds3_data, &wav_audio);

    // Determine output path
    const dsp_stem = path.stem(path.basename(dsp_path));
    const dsu_filename = try std.fmt.allocPrint(arena, "{s}.DSU", .{dsp_stem});
    const dsu_path = try path.join(arena, &.{ dsp_dir, dsu_filename });

    // Write DSU file
    try Dir.writeFile(.cwd(), io, .{ .sub_path = dsu_path, .data = dsu });

    // Write log to stdout
    try writeLog(io, &dsp, dsu.len);
}

fn parseDsp(arena: Allocator, io: Io, dsp_path: []const u8) !DspProject {
    const data = try Dir.readFileAlloc(.cwd(), io, dsp_path, arena, .limited(1024 * 1024));

    var project = DspProject{
        .dsd_filename = &.{},
        .wav_filenames = .{null} ** TOTAL_SLOTS,
    };

    var lines = std.mem.splitSequence(u8, data, "\n");
    while (lines.next()) |raw_line| {
        const line = std.mem.trim(u8, raw_line, " \t\r");
        if (line.len == 0 or line[0] == '[' or line[0] == ';') continue;

        const eq_pos = std.mem.indexOf(u8, line, "=") orelse continue;
        const key = std.mem.trim(u8, line[0..eq_pos], " \t");
        const value = std.mem.trim(u8, line[eq_pos + 1 ..], " \t\r");
        if (value.len == 0) continue;

        if (std.mem.eql(u8, key, "DSDfilename")) {
            project.dsd_filename = try arena.dupe(u8, value);
        } else if (parseWavKey(key)) |slot| {
            project.wav_filenames[slot] = try arena.dupe(u8, value);
        }
    }

    if (project.dsd_filename.len == 0) return error.MissingDsdFilename;
    return project;
}

fn parseWavKey(key: []const u8) ?usize {
    if (!std.mem.startsWith(u8, key, "Sound")) return null;
    if (key.len < 12) return null;

    const digit = key[5];
    if (digit < '1' or digit > '4') return null;
    const sound_idx: usize = digit - '1';

    const suffix = key[6..];
    const seg_idx: usize =
        if (std.mem.eql(u8, suffix, "AnfWAV")) 0
    else if (std.mem.eql(u8, suffix, "LoopWAV")) 1
    else if (std.mem.eql(u8, suffix, "EndWAV")) 2
    else return null;

    return sound_idx * 3 + seg_idx;
}

fn readWavAudio(arena: Allocator, io: Io, wav_path: []const u8) ![]const u8 {
    const data = try Dir.readFileAlloc(.cwd(), io, wav_path, arena, .limited(16 * 1024 * 1024));

    // Validate RIFF/WAVE header
    if (data.len < 44) return error.InvalidWav;
    if (!std.mem.eql(u8, data[0..4], "RIFF")) return error.InvalidWav;
    if (!std.mem.eql(u8, data[8..12], "WAVE")) return error.InvalidWav;

    // Find 'data' chunk
    var pos: usize = 12;
    while (pos + 8 <= data.len) {
        const chunk_id = data[pos..][0..4];
        const chunk_size = std.mem.readInt(u32, data[pos + 4 ..][0..4], .little);

        if (std.mem.eql(u8, chunk_id, "data")) {
            const audio_start = pos + 8;
            const audio_end = @min(audio_start + chunk_size, data.len);
            return data[audio_start..audio_end];
        }

        pos += 8 + chunk_size;
        if (pos % 2 != 0) pos += 1; // word-aligned chunks
    }

    return error.NoDataChunk;
}

fn buildDsu(arena: Allocator, ds3: []const u8, wav_audio: *const [TOTAL_SLOTS]?[]const u8) ![]const u8 {
    // Calculate total output size
    var extra_size: usize = 0;
    for (wav_audio) |audio_opt| {
        if (audio_opt) |audio| {
            extra_size += audio.len + 1; // audio data + trailing byte
        } else {
            extra_size += 1; // empty slot marker
        }
    }

    const total_size = ds3.len + extra_size;
    const dsu = try arena.alloc(u8, total_size);

    // Copy DS3 base data
    @memcpy(dsu[0..ds3.len], ds3);

    // Build pointer table (12 × 3-byte LE entries at 0x0AA) and append audio
    var write_pos: usize = ds3.len;

    for (wav_audio, 0..) |audio_opt, slot| {
        // Write 3-byte little-endian pointer
        const ptr_off = USER_PTR_OFFSET + slot * 3;
        dsu[ptr_off + 0] = @truncate(write_pos);
        dsu[ptr_off + 1] = @truncate(write_pos >> 8);
        dsu[ptr_off + 2] = @truncate(write_pos >> 16);

        if (audio_opt) |audio| {
            // Copy audio with clamping: 0x00→0x01, 0xFF→0xFE
            for (audio) |byte| {
                dsu[write_pos] = switch (byte) {
                    0x00 => 0x01,
                    0xFF => 0xFE,
                    else => byte,
                };
                write_pos += 1;
            }
            // Trailing byte: End segments (idx 2,5,8,11) get 0x00, others get 0xFF
            dsu[write_pos] = if (slot % 3 == 2) 0x00 else 0xFF;
            write_pos += 1;
        } else {
            // Empty slot: single 0x00
            dsu[write_pos] = 0x00;
            write_pos += 1;
        }
    }

    std.debug.assert(write_pos == total_size);
    return dsu[0..total_size];
}

fn writeLog(io: Io, dsp: *const DspProject, dsu_size: usize) !void {
    var buf: [4096]u8 = undefined;
    var writer: File.Writer = .init(.stdout(), io, &buf);
    const w = &writer.interface;

    try w.print("SUSIsound-Version:  V1.01.0001\r\n", .{});

    for (dsp.wav_filenames, 0..) |name_opt, slot| {
        const name = name_opt orelse "";
        try w.print("WAV  {d}: {s}:\r\n", .{ slot + 1, name });
    }

    try w.print("ben\xc3\xb6tigte Bytes: {d}\r\n", .{dsu_size});
    try w.print("FLASH 32Mbit: {d} frei\r\n", .{FLASH_SIZE - dsu_size});
    try w.print("Ergebnis = OK\r\n", .{});
    try w.flush();
}
