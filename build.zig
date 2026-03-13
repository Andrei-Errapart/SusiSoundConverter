const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "convertsound",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/convertsound.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    b.installArtifact(exe);

    const info = b.addExecutable(.{
        .name = "infosound",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/infosound.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    b.installArtifact(info);

    const run_step = b.step("run", "Run convertsound");
    const run_cmd = b.addRunArtifact(exe);
    run_step.dependOn(&run_cmd.step);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const info_step = b.step("info", "Run infosound");
    const info_cmd = b.addRunArtifact(info);
    info_step.dependOn(&info_cmd.step);
    info_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        info_cmd.addArgs(args);
    }
}
