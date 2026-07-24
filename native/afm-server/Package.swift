// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "afm-server",
    // The binary must still build and answer `--check` on older macOS, so we
    // target macOS 13. Every FoundationModels use is gated behind
    // `#if canImport(FoundationModels)` + `#available(macOS 26.0, *)`.
    platforms: [.macOS(.v13)],
    dependencies: [
        // Lightweight Swift-Concurrency HTTP server. 0.27.1 is the latest tag
        // (min platform macOS 10.15, swift-tools 6.0).
        .package(url: "https://github.com/swhitty/FlyingFox.git", from: "0.27.1"),
    ],
    targets: [
        .executableTarget(
            name: "afm-server",
            dependencies: [.product(name: "FlyingFox", package: "FlyingFox")],
            path: "Sources/AfmServer"
        ),
    ]
)
