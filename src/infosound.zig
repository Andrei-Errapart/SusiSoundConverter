const std = @import("std");
const Io = std.Io;
const Dir = Io.Dir;
const File = Io.File;
const Allocator = std.mem.Allocator;
const fspath = std.fs.path;
const Crc32 = std.hash.crc.Crc32IsoHdlc;

const HEADER_SIZE: usize = 0x300;
const PRIMARY_OFF: usize = 0x004;
const PRIMARY_COUNT: usize = 48;
const MIDDLE_OFF: usize = 0x094;
const MIDDLE_COUNT: usize = 18; // 9 pairs
const PADDING_END: usize = 0x0AA; // end of "padding" area before DSU region
const DSU_PTR_OFF: usize = 0x0AA;
const DSU_PTR_END: usize = 0x0CE;
const EXTENDED_OFF: usize = 0x100;
const EXTENDED_COUNT: usize = 40;
const CONFIG_OFF: usize = 0x0CE;
const CONFIG_LEN: usize = 50;
const FLASH_32MBIT: usize = 4 * 1024 * 1024;
const FLASH_64MBIT: usize = 8 * 1024 * 1024;
const SAMPLE_RATE: f64 = 13021.0;

// DS6-specific constants
const DS6_HEADER_SIZE: usize = 0x627;
const DS6_PRIMARY_OFF: usize = 0x008;
const DS6_PRIMARY_COUNT: usize = 54;
const DS6_EXT1_OFF: usize = 0x100;
const DS6_EXT1_COUNT: usize = 88; // 44 pairs
const DS6_EXT2_OFF: usize = 0x2B0;
const DS6_EXT2_COUNT: usize = 156; // 78 pairs
const DS6_EXT3_OFF: usize = 0x490;
const DS6_EXT3_COUNT: usize = 16; // 8 pairs
const DS6_NAME_OFF: usize = 0x526;
const DS6_NAME_LEN: usize = 16;

const ExportCtx = struct {
    io: Io,
    arena: Allocator,
    data: []const u8,
    base_name: []const u8,
    w: *Io.Writer,
};

fn xorDecode(data: []const u8, file_offset: usize) u24 {
    const b0: u24 = data[0] ^ @as(u8, @truncate(file_offset));
    const b1: u24 = data[1] ^ @as(u8, @truncate(file_offset + 1));
    const b2: u24 = data[2] ^ @as(u8, @truncate(file_offset + 2));
    return b0 | (b1 << 8) | (b2 << 16);
}

fn isUnused(data: []const u8) bool {
    return data[0] == 0xFF and data[1] == 0xFF and data[2] == 0xFF;
}

fn fmtDuration(samples: usize) [12]u8 {
    const ms_total = (samples * 1000 + @as(usize, @intFromFloat(SAMPLE_RATE)) / 2) /
        @as(usize, @intFromFloat(SAMPLE_RATE));
    const secs = ms_total / 1000;
    const ms = ms_total % 1000;
    var buf: [12]u8 = .{' '} ** 12;
    _ = std.fmt.bufPrint(&buf, "{d}.{d:0>3}s", .{ secs, ms }) catch {};
    return buf;
}

/// Detect whether audio data is XOR-encoded by comparing smoothness.
/// Returns true if the XOR-decoded version is smoother (lower first-derivative energy).
fn isXorEncoded(data: []const u8, start: usize, size: usize) bool {
    if (size < 4 or start + size > data.len) return false;
    var raw_energy: u64 = 0;
    var dec_energy: u64 = 0;
    var prev_raw: i16 = data[start];
    var prev_dec: i16 = data[start] ^ @as(u8, @truncate(start));
    for (1..size) |i| {
        const raw: i16 = data[start + i];
        const dec: i16 = data[start + i] ^ @as(u8, @truncate(start + i));
        raw_energy += @abs(raw - prev_raw);
        dec_energy += @abs(dec - prev_dec);
        prev_raw = raw;
        prev_dec = dec;
    }
    return dec_energy < raw_energy;
}

/// Compute CRC32 of XOR-decoded audio data.
fn audioCrc32(data: []const u8, start: usize, size: usize, arena: Allocator) u32 {
    if (size == 0 or start + size > data.len) return 0;
    const decoded = arena.alloc(u8, size) catch return 0;
    const src = data[start..][0..size];
    for (0..size) |i| {
        decoded[i] = src[i] ^ @as(u8, @truncate(start + i));
    }
    return Crc32.hash(decoded);
}

/// Write a WAV file with raw (non-XOR-encoded) audio data (used for DSU slots).
fn writeWavFileRaw(ctx: *const ExportCtx, filename: []const u8, audio_start: usize, audio_size: usize) !void {
    if (audio_size == 0) return;
    if (audio_start + audio_size > ctx.data.len) return;

    const wav_total: usize = 44 + audio_size;
    const wav = try ctx.arena.alloc(u8, wav_total);

    writeWavHeader(wav, audio_size);
    @memcpy(wav[44..][0..audio_size], ctx.data[audio_start..][0..audio_size]);

    Dir.writeFile(.cwd(), ctx.io, .{ .sub_path = filename, .data = wav }) catch |err| {
        try ctx.w.print("  Error writing {s}: {s}\n", .{ filename, @errorName(err) });
        return;
    };
    const dur = fmtDuration(audio_size);
    try ctx.w.print("  -> {s} ({d} bytes, {s})\n", .{ filename, audio_size, std.mem.trimEnd(u8, &dur, " ") });
}

/// Write the 44-byte WAV header into buf.
fn writeWavHeader(wav: []u8, audio_size: usize) void {
    const wav_total: u32 = @intCast(44 + audio_size);
    @memcpy(wav[0..4], "RIFF");
    std.mem.writeInt(u32, wav[4..][0..4], wav_total - 8, .little);
    @memcpy(wav[8..12], "WAVE");
    @memcpy(wav[12..16], "fmt ");
    std.mem.writeInt(u32, wav[16..][0..4], 16, .little);
    std.mem.writeInt(u16, wav[20..][0..2], 1, .little);
    std.mem.writeInt(u16, wav[22..][0..2], 1, .little);
    const sr: u32 = @intFromFloat(SAMPLE_RATE);
    std.mem.writeInt(u32, wav[24..][0..4], sr, .little);
    std.mem.writeInt(u32, wav[28..][0..4], sr, .little);
    std.mem.writeInt(u16, wav[32..][0..2], 1, .little);
    std.mem.writeInt(u16, wav[34..][0..2], 8, .little);
    @memcpy(wav[36..40], "data");
    std.mem.writeInt(u32, wav[40..][0..4], @intCast(audio_size), .little);
}

fn writeWavFile(ctx: *const ExportCtx, filename: []const u8, audio_start: usize, audio_size: usize) !void {
    if (audio_size == 0) return;
    if (audio_start + audio_size > ctx.data.len) return;

    const wav_total: usize = 44 + audio_size;
    const wav = try ctx.arena.alloc(u8, wav_total);

    writeWavHeader(wav, audio_size);

    // Copy audio, XOR-decoding
    const src = ctx.data[audio_start..][0..audio_size];
    for (0..audio_size) |i| {
        wav[44 + i] = src[i] ^ @as(u8, @truncate(audio_start + i));
    }

    Dir.writeFile(.cwd(), ctx.io, .{ .sub_path = filename, .data = wav }) catch |err| {
        try ctx.w.print("  Error writing {s}: {s}\n", .{ filename, @errorName(err) });
        return;
    };
    const dur = fmtDuration(audio_size);
    try ctx.w.print("  -> {s} ({d} bytes, {s})\n", .{ filename, audio_size, std.mem.trimEnd(u8, &dur, " ") });
}

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const io = init.io;
    const args = try init.minimal.args.toSlice(arena);

    var export_wav = false;
    var start: usize = 1;
    if (args.len > 1 and std.mem.eql(u8, args[1], "-e")) {
        export_wav = true;
        start = 2;
    }

    if (start >= args.len) {
        std.debug.print("Usage: {s} [-e] <DS3_FILE> [DS3_FILE...]\n", .{args[0]});
        std.process.exit(1);
    }

    var stdout_buf: [8192]u8 = undefined;
    var stdout_writer: File.Writer = .init(.stdout(), io, &stdout_buf);
    const w = &stdout_writer.interface;

    for (args[start..]) |path| {
        try dumpFile(arena, io, w, path, export_wav);
    }
    try w.flush();
}

fn dumpFile(arena: Allocator, io: Io, w: *Io.Writer, path: []const u8, export_wav: bool) !void {
    const data = Dir.readFileAlloc(.cwd(), io, path, arena, .limited(16 * 1024 * 1024)) catch |err| {
        try w.print("Error reading {s}: {s}\n", .{ path, @errorName(err) });
        return;
    };

    try w.print("=== {s} ===\n", .{path});
    try w.print("File size: {d} bytes\n", .{data.len});

    if (data.len < HEADER_SIZE) {
        try w.print("Error: file too small for header (need {d} bytes)\n\n", .{HEADER_SIZE});
        return;
    }

    // Magic
    try w.print("Magic: {X:0>2} {X:0>2}", .{ data[0], data[1] });
    if (data[0] == 0xDD and data[1] == 0x33) {
        try w.print(" (valid IntelliSound)\n", .{});
    } else if (data[0] == 0x00 and data[1] == 0xFF) {
        try w.print(" (encrypted — not supported)\n\n", .{});
        return;
    } else {
        try w.print(" (unknown)\n\n", .{});
        return;
    }

    // Build export context if requested
    const base_name = fspath.stem(fspath.basename(path));
    var exp_val: ExportCtx = undefined;
    const exp: ?*const ExportCtx = if (export_wav) blk: {
        exp_val = .{
            .io = io,
            .arena = arena,
            .data = data,
            .base_name = base_name,
            .w = w,
        };
        break :blk &exp_val;
    } else null;

    // Format tag — detect DS6 vs DS3/DX4/DSU
    try w.print("Format tag: {X:0>2} {X:0>2}", .{ data[2], data[3] });
    if (data[2] == 0x25 and data[3] == 0x05) {
        try w.print(" (DS6)\n", .{});
        return dumpDS6File(arena, w, data, exp);
    } else if (data[2] == 0xFF and data[3] == 0xFF) {
        try w.print(" (DS3)\n", .{});
    } else {
        try w.print("\n", .{});
    }

    const audio_len = data.len - HEADER_SIZE;
    const duration_s = @as(f64, @floatFromInt(audio_len)) / SAMPLE_RATE;
    try w.print("Audio region: 0x{X:0>6}–0x{X:0>6} ({d} bytes, {d:.1}s at 13021 Hz)\n", .{
        @as(usize, HEADER_SIZE), data.len, audio_len, duration_s,
    });
    try w.print("Flash usage: {d} / {d} bytes ({d} free)\n", .{
        data.len, FLASH_32MBIT, FLASH_32MBIT - @min(data.len, FLASH_32MBIT),
    });

    // --- Parse all address tables first ---

    // Primary track index
    var primary_addrs: [PRIMARY_COUNT]?u24 = .{null} ** PRIMARY_COUNT;
    var primary_used: usize = 0;
    for (0..PRIMARY_COUNT) |i| {
        const off = PRIMARY_OFF + i * 3;
        const raw = data[off..][0..3];
        if (isUnused(raw)) {
            primary_addrs[i] = null;
        } else {
            primary_addrs[i] = xorDecode(raw, off);
            primary_used += 1;
        }
    }

    // Extended track index
    var ext_addrs: [EXTENDED_COUNT]?u24 = .{null} ** EXTENDED_COUNT;
    var ext_used: usize = 0;
    for (0..EXTENDED_COUNT) |i| {
        const off = EXTENDED_OFF + i * 3;
        const raw = data[off..][0..3];
        if (isUnused(raw)) {
            ext_addrs[i] = null;
        } else {
            ext_addrs[i] = xorDecode(raw, off);
            ext_used += 1;
        }
    }

    // Middle table (DX4) — parse addresses only
    var has_middle = false;
    for (data[MIDDLE_OFF..PADDING_END]) |b| {
        if (b != 0xFF) { has_middle = true; break; }
    }
    var mid_addrs: [MIDDLE_COUNT]?u24 = .{null} ** MIDDLE_COUNT;
    if (has_middle) {
        for (0..MIDDLE_COUNT) |i| {
            const off = MIDDLE_OFF + i * 3;
            const raw = data[off..][0..3];
            if (!isUnused(raw)) {
                mid_addrs[i] = xorDecode(raw, off);
            }
        }
    }

    // DSU pointers — parse addresses only
    var has_dsu = false;
    if (!has_middle) {
        for (data[DSU_PTR_OFF..DSU_PTR_END]) |b| {
            if (b != 0xFF) { has_dsu = true; break; }
        }
    }

    // Compute proper bounds: primary extends to the first middle/extended/DSU address
    var primary_bound: usize = data.len;
    if (has_middle) {
        for (&mid_addrs) |opt| {
            if (opt) |addr| {
                if (@as(usize, addr) < primary_bound) primary_bound = @as(usize, addr);
            }
        }
    }
    for (&ext_addrs) |opt| {
        if (opt) |addr| {
            if (@as(usize, addr) < primary_bound) primary_bound = @as(usize, addr);
        }
    }
    if (has_dsu) {
        for (0..12) |slot| {
            const off = DSU_PTR_OFF + slot * 3;
            const raw = data[off..][0..3];
            const addr = @as(usize, raw[0]) | (@as(usize, raw[1]) << 8) | (@as(usize, raw[2]) << 16);
            if (addr < primary_bound) primary_bound = addr;
        }
    }

    // --- Print all tables ---

    try w.print("\n--- Primary track index (0x004–0x093, 48 entries) ---\n", .{});
    try w.print("Entries used: {d} / {d}\n\n", .{ primary_used, PRIMARY_COUNT });
    try printTrackTable(w, &primary_addrs, primary_bound, data, arena, exp, "p");

    try w.print("\n--- Extended track index (0x100–0x177, 40 entries, 20 pairs) ---\n", .{});
    try w.print("Entries used: {d} / {d}\n\n", .{ ext_used, EXTENDED_COUNT });
    if (ext_used > 0) {
        try printPairTable(w, &ext_addrs, data.len, data, arena, exp, "x");
    }

    // Print middle table or DSU pointers
    if (has_middle) {
        try dumpMiddleTableParsed(w, data, &mid_addrs, &ext_addrs, arena, exp);
    } else if (has_dsu) {
        try dumpDsuPointers(w, data, arena, exp);
    }

    // Configuration region
    try w.print("\n--- Configuration (0x0CE–0x0FF, 50 bytes, XOR-decoded) ---\n", .{});
    for (0..CONFIG_LEN) |i| {
        const off = CONFIG_OFF + i;
        const decoded = data[off] ^ @as(u8, @truncate(off));
        if (i > 0 and i % 16 == 0) try w.print("\n", .{});
        if (i % 16 == 0) try w.print("  0x{X:0>3}:", .{off});
        try w.print(" {X:0>2}", .{decoded});
    }
    try w.print("\n\n", .{});
}

fn dumpDS6File(arena: Allocator, w: *Io.Writer, data: []const u8, exp: ?*const ExportCtx) !void {
    if (data.len < DS6_HEADER_SIZE) {
        try w.print("Error: file too small for DS6 header (need {d} bytes)\n\n", .{DS6_HEADER_SIZE});
        return;
    }

    const audio_len = data.len - DS6_HEADER_SIZE;
    const duration_s = @as(f64, @floatFromInt(audio_len)) / SAMPLE_RATE;
    try w.print("Audio region: 0x{X:0>6}–0x{X:0>6} ({d} bytes, {d:.1}s at 13021 Hz)\n", .{
        @as(usize, DS6_HEADER_SIZE), data.len, audio_len, duration_s,
    });
    try w.print("Flash usage: {d} / {d} bytes ({d} free)\n", .{
        data.len, FLASH_64MBIT, FLASH_64MBIT - @min(data.len, FLASH_64MBIT),
    });

    // Embedded sound name (XOR-decoded ASCII at 0x526)
    var name_buf: [DS6_NAME_LEN]u8 = undefined;
    for (0..DS6_NAME_LEN) |i| {
        const off = DS6_NAME_OFF + i;
        name_buf[i] = data[off] ^ @as(u8, @truncate(off));
    }
    const name = std.mem.trimEnd(u8, &name_buf, " ");
    try w.print("Sound name: \"{s}\"\n", .{name});

    // Primary track index (54 entries at 0x008)
    try w.print("\n--- Primary track index (0x008–0x0A9, {d} entries) ---\n", .{DS6_PRIMARY_COUNT});
    var primary_addrs: [DS6_PRIMARY_COUNT]?u24 = .{null} ** DS6_PRIMARY_COUNT;
    var primary_used: usize = 0;
    for (0..DS6_PRIMARY_COUNT) |i| {
        const off = DS6_PRIMARY_OFF + i * 3;
        const raw = data[off..][0..3];
        if (isUnused(raw)) {
            primary_addrs[i] = null;
        } else {
            primary_addrs[i] = xorDecode(raw, off);
            primary_used += 1;
        }
    }
    try w.print("Entries used: {d} / {d}\n\n", .{ primary_used, DS6_PRIMARY_COUNT });
    try printTrackTable(w, &primary_addrs, data.len, data, arena, exp, "p");

    // Extended table 1 (44 pairs at 0x100)
    try w.print("\n--- Extended table 1 (0x100–0x207, {d} entries, {d} pairs) ---\n", .{
        DS6_EXT1_COUNT, DS6_EXT1_COUNT / 2,
    });
    try dumpPairRegion(w, data, DS6_EXT1_OFF, DS6_EXT1_COUNT, data.len, arena, exp, "e1");

    // Extended table 2 (78 pairs at 0x2B0)
    try w.print("\n--- Extended table 2 (0x2B0–0x483, {d} entries, {d} pairs) ---\n", .{
        DS6_EXT2_COUNT, DS6_EXT2_COUNT / 2,
    });
    try dumpPairRegion(w, data, DS6_EXT2_OFF, DS6_EXT2_COUNT, data.len, arena, exp, "e2");

    // Extended table 3 (8 pairs at 0x490)
    try w.print("\n--- Extended table 3 (0x490–0x4BF, {d} entries, {d} pairs) ---\n", .{
        DS6_EXT3_COUNT, DS6_EXT3_COUNT / 2,
    });
    try dumpPairRegion(w, data, DS6_EXT3_OFF, DS6_EXT3_COUNT, data.len, arena, exp, "e3");

    // Configuration region (same offset as DS3)
    try w.print("\n--- Configuration (0x0CE–0x0FF, 50 bytes, XOR-decoded) ---\n", .{});
    for (0..CONFIG_LEN) |i| {
        const off = CONFIG_OFF + i;
        const decoded = data[off] ^ @as(u8, @truncate(off));
        if (i > 0 and i % 16 == 0) try w.print("\n", .{});
        if (i % 16 == 0) try w.print("  0x{X:0>3}:", .{off});
        try w.print(" {X:0>2}", .{decoded});
    }
    try w.print("\n\n", .{});
}

fn dumpPairRegion(w: *Io.Writer, data: []const u8, base_off: usize, count: usize, file_size: usize, arena: Allocator, exp: ?*const ExportCtx, prefix: []const u8) !void {
    var addrs: [DS6_EXT2_COUNT]?u24 = .{null} ** DS6_EXT2_COUNT; // largest possible
    var used: usize = 0;
    for (0..count) |i| {
        const off = base_off + i * 3;
        const raw = data[off..][0..3];
        if (isUnused(raw)) {
            addrs[i] = null;
        } else {
            addrs[i] = xorDecode(raw, off);
            used += 1;
        }
    }
    try w.print("Entries used: {d} / {d}\n\n", .{ used, count });
    if (used > 0) {
        try printPairTable(w, addrs[0..count], file_size, data, arena, exp, prefix);
    }
}

fn printTrackTable(w: *Io.Writer, addrs: []const ?u24, file_size: usize, data: []const u8, arena: Allocator, exp: ?*const ExportCtx, prefix: []const u8) !void {
    try w.print("  {s:>5}  {s:>8}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{ "Entry", "Offset", "Size", "Duration", "CRC32", "Enc" });
    try w.print("  {s:->5}  {s:->8}  {s:->8}  {s:->8}  {s:->8}  {s:->3}\n", .{ "", "", "", "", "", "" });

    for (addrs, 0..) |addr_opt, i| {
        const addr = addr_opt orelse continue;

        // Find next valid address to compute size
        const size = blk: {
            for (addrs[i + 1 ..]) |next_opt| {
                if (next_opt) |next| {
                    if (next > addr) break :blk @as(usize, next) - @as(usize, addr);
                }
            }
            if (@as(usize, addr) < file_size)
                break :blk file_size - @as(usize, addr);
            break :blk @as(usize, 0);
        };

        if (size == 0) {
            try w.print("  {d:>5}  0x{X:0>6}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{ i, addr, "-", "-", "-", "-" });
        } else {
            const dur = fmtDuration(size);
            const xor = isXorEncoded(data, @as(usize, addr), size);
            const crc = audioCrc32(data, @as(usize, addr), size, arena);
            const enc: []const u8 = if (xor) "XOR" else "raw";
            try w.print("  {d:>5}  0x{X:0>6}  {d:>8}  {s}  {X:0>8}  {s:>3}\n", .{ i, addr, size, dur, crc, enc });
        }

        // Export WAV
        if (exp) |ctx| {
            if (size > 0) {
                const filename = std.fmt.allocPrint(ctx.arena, "{s}_{s}{d:0>2}.wav", .{
                    ctx.base_name, prefix, i,
                }) catch continue;
                writeWavFile(ctx, filename, @as(usize, addr), size) catch {};
            }
        }
    }
}

fn printPairTable(w: *Io.Writer, addrs: []const ?u24, file_size: usize, data: []const u8, arena: Allocator, exp: ?*const ExportCtx, prefix: []const u8) !void {
    try w.print("  {s:>4}  {s:>8}  {s:>8}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{ "Pair", "Addr A", "Addr B", "Size", "Duration", "CRC32", "Enc" });
    try w.print("  {s:->4}  {s:->8}  {s:->8}  {s:->8}  {s:->8}  {s:->8}  {s:->3}\n", .{ "", "", "", "", "", "", "" });

    var pair: usize = 0;
    while (pair * 2 + 1 < addrs.len) : (pair += 1) {
        const a_opt = addrs[pair * 2];
        const b_opt = addrs[pair * 2 + 1];
        const a = a_opt orelse continue;
        const b = b_opt orelse continue;

        // Size: distance to next pair's address
        const size = blk: {
            var next_pair = pair + 1;
            while (next_pair * 2 < addrs.len) : (next_pair += 1) {
                if (addrs[next_pair * 2]) |next_a| {
                    if (@as(usize, next_a) > @as(usize, a))
                        break :blk @as(usize, next_a) - @as(usize, a);
                }
            }
            if (@as(usize, a) < file_size)
                break :blk file_size - @as(usize, a);
            break :blk @as(usize, 0);
        };

        if (size == 0) {
            try w.print("  {d:>4}  0x{X:0>6}  0x{X:0>6}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{
                pair, a, b, "-", "-", "-", "-",
            });
        } else {
            const dur = fmtDuration(size);
            const xor = isXorEncoded(data, @as(usize, a), size);
            const crc = audioCrc32(data, @as(usize, a), size, arena);
            const enc: []const u8 = if (xor) "XOR" else "raw";
            try w.print("  {d:>4}  0x{X:0>6}  0x{X:0>6}  {d:>8}  {s}  {X:0>8}  {s:>3}\n", .{
                pair, a, b, size, dur, crc, enc,
            });
        }

        // Export WAV
        if (exp) |ctx| {
            if (size > 0) {
                const filename = std.fmt.allocPrint(ctx.arena, "{s}_{s}{d:0>2}.wav", .{
                    ctx.base_name, prefix, pair,
                }) catch continue;
                writeWavFile(ctx, filename, @as(usize, a), size) catch {};
            }
        }
    }
}

fn dumpMiddleRegion(w: *Io.Writer, data: []const u8, ext_addrs: []const ?u24, arena: Allocator, exp: ?*const ExportCtx) !void {
    var has_middle = false;
    for (data[MIDDLE_OFF..PADDING_END]) |b| {
        if (b != 0xFF) {
            has_middle = true;
            break;
        }
    }

    if (has_middle) {
        try dumpMiddleTable(w, data, ext_addrs, arena, exp);
    } else {
        try dumpDsuPointers(w, data, arena, exp);
    }
}

fn dumpMiddleTable(w: *Io.Writer, data: []const u8, ext_addrs: []const ?u24, arena: Allocator, exp: ?*const ExportCtx) !void {
    try w.print("\n--- Middle track index (0x094–0x0C9, 18 entries, 9 pairs) ---\n", .{});

    var mid_addrs: [MIDDLE_COUNT]?u24 = .{null} ** MIDDLE_COUNT;
    var mid_used: usize = 0;
    for (0..MIDDLE_COUNT) |i| {
        const off = MIDDLE_OFF + i * 3;
        const raw = data[off..][0..3];
        if (isUnused(raw)) {
            mid_addrs[i] = null;
        } else {
            mid_addrs[i] = xorDecode(raw, off);
            mid_used += 1;
        }
    }
    try w.print("Entries used: {d} / {d}\n\n", .{ mid_used, MIDDLE_COUNT });

    if (mid_used > 0) {
        var end_addr: usize = data.len;
        for (ext_addrs) |opt| {
            if (opt) |addr| {
                if (@as(usize, addr) < end_addr) end_addr = @as(usize, addr);
            }
        }
        try printPairTable(w, &mid_addrs, end_addr, data, arena, exp, "m");
    }
}

/// Print middle table with pre-parsed addresses (avoids re-parsing).
fn dumpMiddleTableParsed(w: *Io.Writer, data: []const u8, mid_addrs: []const ?u24, ext_addrs: []const ?u24, arena: Allocator, exp: ?*const ExportCtx) !void {
    try w.print("\n--- Middle track index (0x094–0x0C9, 18 entries, 9 pairs) ---\n", .{});
    var mid_used: usize = 0;
    for (mid_addrs) |opt| {
        if (opt != null) mid_used += 1;
    }
    try w.print("Entries used: {d} / {d}\n\n", .{ mid_used, MIDDLE_COUNT });

    if (mid_used > 0) {
        var end_addr: usize = data.len;
        for (ext_addrs) |opt| {
            if (opt) |addr| {
                if (@as(usize, addr) < end_addr) end_addr = @as(usize, addr);
            }
        }
        try printPairTable(w, mid_addrs, end_addr, data, arena, exp, "m");
    }
}

fn dumpDsuPointers(w: *Io.Writer, data: []const u8, arena: Allocator, exp: ?*const ExportCtx) !void {
    var has_dsu = false;
    for (data[DSU_PTR_OFF..DSU_PTR_END]) |b| {
        if (b != 0xFF) {
            has_dsu = true;
            break;
        }
    }

    if (!has_dsu) return;

    const segment_names = [_][]const u8{ "Anf", "Loop", "End" };

    try w.print("\n--- DSU user sound pointers (0x0AA–0x0CD) ---\n", .{});
    try w.print("  {s:>4}  {s:>5}  {s:>4}  {s:>8}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{
        "Slot", "Sound", "Seg", "Offset", "Size", "Duration", "CRC32", "Enc",
    });
    try w.print("  {s:->4}  {s:->5}  {s:->4}  {s:->8}  {s:->8}  {s:->8}  {s:->8}  {s:->3}\n", .{
        "", "", "", "", "", "", "", "",
    });

    for (0..12) |slot| {
        const off = DSU_PTR_OFF + slot * 3;
        const raw = data[off..][0..3];
        const addr = @as(usize, raw[0]) | (@as(usize, raw[1]) << 8) | (@as(usize, raw[2]) << 16);
        const sound = 200 + slot / 3;
        const seg = segment_names[slot % 3];

        const next_addr: usize = if (slot < 11) blk: {
            const noff = DSU_PTR_OFF + (slot + 1) * 3;
            const nraw = data[noff..][0..3];
            break :blk @as(usize, nraw[0]) | (@as(usize, nraw[1]) << 8) | (@as(usize, nraw[2]) << 16);
        } else data.len;

        const size = if (next_addr > addr) next_addr - addr else 0;

        if (size <= 1) {
            try w.print("  {d:>4}  {d:>5}  {s:>4}  0x{X:0>6}  {s:>8}  {s:>8}  {s:>8}  {s:>3}\n", .{
                slot + 1, sound, seg, addr, "-", "-", "-", "-",
            });
        } else {
            const audio_size = size - 1; // minus trailing byte
            const dur = fmtDuration(audio_size);
            const xor = isXorEncoded(data, addr, audio_size);
            const crc = if (xor) audioCrc32(data, addr, audio_size, arena) else Crc32.hash(data[addr..][0..audio_size]);
            const enc: []const u8 = if (xor) "XOR" else "raw";
            try w.print("  {d:>4}  {d:>5}  {s:>4}  0x{X:0>6}  {d:>8}  {s}  {X:0>8}  {s:>3}\n", .{
                slot + 1, sound, seg, addr, audio_size, dur, crc, enc,
            });

            // Export WAV (raw, no XOR decode needed)
            if (exp) |ctx| {
                const filename = std.fmt.allocPrint(ctx.arena, "{s}_u{d:0>2}.wav", .{
                    ctx.base_name, slot + 1,
                }) catch continue;
                writeWavFileRaw(ctx, filename, addr, audio_size) catch {};
            }
        }
    }
}
