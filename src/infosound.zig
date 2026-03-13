const std = @import("std");
const Io = std.Io;
const Dir = Io.Dir;
const File = Io.File;
const Allocator = std.mem.Allocator;

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
const SAMPLE_RATE: f64 = 13021.0;

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

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const io = init.io;
    const args = try init.minimal.args.toSlice(arena);

    if (args.len < 2) {
        std.debug.print("Usage: {s} <DS3_FILE> [DS3_FILE...]\n", .{args[0]});
        std.process.exit(1);
    }

    var stdout_buf: [8192]u8 = undefined;
    var stdout_writer: File.Writer = .init(.stdout(), io, &stdout_buf);
    const w = &stdout_writer.interface;

    for (args[1..]) |path| {
        try dumpFile(arena, io, w, path);
    }
    try w.flush();
}

fn dumpFile(arena: Allocator, io: Io, w: *Io.Writer, path: []const u8) !void {
    const data = Dir.readFileAlloc(.cwd(), io, path, arena, .limited(16 * 1024 * 1024)) catch |err| {
        try w.print("Error reading {s}: {s}\n", .{ path, @errorName(err) });
        return;
    };

    try w.print("=== {s} ===\n", .{path});
    try w.print("File size: {d} bytes\n", .{data.len});

    if (data.len < HEADER_SIZE) {
        try w.print("Error: file too small for DS3 header (need {d} bytes)\n\n", .{HEADER_SIZE});
        return;
    }

    // Magic
    try w.print("Magic: {X:0>2} {X:0>2}", .{ data[0], data[1] });
    if (data[0] == 0xDD and data[1] == 0x33) {
        try w.print(" (valid DS3/DSD)\n", .{});
    } else if (data[0] == 0x00 and data[1] == 0xFF) {
        try w.print(" (encrypted — not supported)\n\n", .{});
        return;
    } else {
        try w.print(" (unknown)\n\n", .{});
        return;
    }

    // Format tag
    try w.print("Format tag: {X:0>2} {X:0>2}", .{ data[2], data[3] });
    if (data[2] == 0xFF and data[3] == 0xFF) {
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

    // Primary track index
    try w.print("\n--- Primary track index (0x004–0x093, 48 entries) ---\n", .{});
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
    try w.print("Entries used: {d} / {d}\n\n", .{ primary_used, PRIMARY_COUNT });
    try printTrackTable(w, &primary_addrs, PRIMARY_OFF, data.len);

    // Extended track index
    try w.print("\n--- Extended track index (0x100–0x177, 40 entries, 20 pairs) ---\n", .{});
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
    try w.print("Entries used: {d} / {d}\n\n", .{ ext_used, EXTENDED_COUNT });
    if (ext_used > 0) {
        try printPairTable(w, &ext_addrs, EXTENDED_OFF, data.len);
    }

    // Middle table (DX4) or DSU user sound pointers — detect which
    try dumpMiddleRegion(w, data, &ext_addrs);

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

fn printTrackTable(w: *Io.Writer, addrs: []const ?u24, base_off: usize, file_size: usize) !void {
    _ = base_off;
    // Collect all valid addresses in order to compute sizes
    try w.print("  {s:>5}  {s:>8}  {s:>8}  {s:>8}\n", .{ "Entry", "Offset", "Size", "Duration" });
    try w.print("  {s:->5}  {s:->8}  {s:->8}  {s:->8}\n", .{ "", "", "", "" });

    for (addrs, 0..) |addr_opt, i| {
        const addr = addr_opt orelse continue;

        // Find next valid address to compute size
        const size = blk: {
            for (addrs[i + 1 ..]) |next_opt| {
                if (next_opt) |next| {
                    if (next > addr) break :blk @as(usize, next) - @as(usize, addr);
                }
            }
            // Last entry: size extends to end of file
            if (@as(usize, addr) < file_size)
                break :blk file_size - @as(usize, addr);
            break :blk @as(usize, 0);
        };

        if (size == 0) {
            try w.print("  {d:>5}  0x{X:0>6}  {s:>8}  {s:>8}\n", .{ i, addr, "-", "-" });
        } else {
            const dur = fmtDuration(size);
            try w.print("  {d:>5}  0x{X:0>6}  {d:>8}  {s}\n", .{ i, addr, size, dur });
        }
    }
}

fn printPairTable(w: *Io.Writer, addrs: []const ?u24, base_off: usize, file_size: usize) !void {
    _ = base_off;
    try w.print("  {s:>4}  {s:>8}  {s:>8}  {s:>8}  {s:>8}\n", .{ "Pair", "Addr A", "Addr B", "Size", "Duration" });
    try w.print("  {s:->4}  {s:->8}  {s:->8}  {s:->8}  {s:->8}\n", .{ "", "", "", "", "" });

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
            try w.print("  {d:>4}  0x{X:0>6}  0x{X:0>6}  {s:>8}  {s:>8}\n", .{
                pair, a, b, "-", "-",
            });
        } else {
            const dur = fmtDuration(size);
            try w.print("  {d:>4}  0x{X:0>6}  0x{X:0>6}  {d:>8}  {s}\n", .{
                pair, a, b, size, dur,
            });
        }
    }
}

fn dumpMiddleRegion(w: *Io.Writer, data: []const u8, ext_addrs: []const ?u24) !void {
    // Detect region type: if 0x094-0x0A9 has non-FF data, it's a DX4 middle table.
    // Otherwise, if 0x0AA-0x0CD has non-FF data, it's DSU user sound pointers.
    var has_middle = false;
    for (data[MIDDLE_OFF..PADDING_END]) |b| {
        if (b != 0xFF) {
            has_middle = true;
            break;
        }
    }

    if (has_middle) {
        try dumpMiddleTable(w, data, ext_addrs);
    } else {
        try dumpDsuPointers(w, data);
    }
}

fn dumpMiddleTable(w: *Io.Writer, data: []const u8, ext_addrs: []const ?u24) !void {
    // DX4 middle track index: 0x094-0x0C9, 18 XOR-encoded entries = 9 pairs
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
        // For the last pair's size, use the first extended address (not EOF)
        var end_addr: usize = data.len;
        for (ext_addrs) |opt| {
            if (opt) |addr| {
                if (@as(usize, addr) < end_addr) end_addr = @as(usize, addr);
            }
        }
        try printPairTable(w, &mid_addrs, MIDDLE_OFF, end_addr);
    }
}

fn dumpDsuPointers(w: *Io.Writer, data: []const u8) !void {
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
    try w.print("  {s:>4}  {s:>5}  {s:>4}  {s:>8}  {s:>8}  {s:>8}\n", .{
        "Slot", "Sound", "Seg", "Offset", "Size", "Duration",
    });
    try w.print("  {s:->4}  {s:->5}  {s:->4}  {s:->8}  {s:->8}  {s:->8}\n", .{
        "", "", "", "", "", "",
    });

    for (0..12) |slot| {
        const off = DSU_PTR_OFF + slot * 3;
        const raw = data[off..][0..3];
        // DSU pointers are NOT XOR-scrambled — they are plain LE24
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
            try w.print("  {d:>4}  {d:>5}  {s:>4}  0x{X:0>6}  {s:>8}  {s:>8}\n", .{
                slot + 1, sound, seg, addr, "-", "-",
            });
        } else {
            const audio_size = size - 1; // minus trailing byte
            const dur = fmtDuration(audio_size);
            try w.print("  {d:>4}  {d:>5}  {s:>4}  0x{X:0>6}  {d:>8}  {s}\n", .{
                slot + 1, sound, seg, addr, audio_size, dur,
            });
        }
    }
}
