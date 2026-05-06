import Foundation
import QuartzCore
import Darwin.Mach

@objc public final class PerfSample: NSObject {
    @objc public let t: Double
    @objc public let frametimeMs: Double
    @objc public let cpuPct: Double
    @objc public let avgFps: Int

    @objc public init(t: Double, frametimeMs: Double, cpuPct: Double, avgFps: Int) {
        self.t = t
        self.frametimeMs = frametimeMs
        self.cpuPct = cpuPct
        self.avgFps = avgFps
    }

    @objc public func toDictionary() -> [String: Any] {
        return [
            "t": t,
            "frametimeMs": frametimeMs,
            "cpuPct": cpuPct,
            "avgFps": avgFps,
        ]
    }
}

public final class PerfSampler: NSObject {
    @objc public static let shared = PerfSampler()

    private let sampleIntervalMs: Int = 1000
    private let ringCapacity: Int = 120

    private var wired: Bool = false
    private var active: Bool = false
    private let stateLock = NSLock()
    private let ringQueue = DispatchQueue(label: "tamer.perf.sampler.ring")
    private var ring: [PerfSample] = []

    private var displayLink: CADisplayLink?
    private var lastFrameTimestamp: CFTimeInterval = 0
    private var frameCount: Int = 0
    private var totalFrameDeltaMs: Double = 0

    private var timerSource: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "tamer.perf.sampler.timer")

    private let coreCount: Int = max(1, ProcessInfo.processInfo.activeProcessorCount)

    public var onSample: ((PerfSample) -> Void)?

    @objc public func ensureStarted() {
        stateLock.lock()
        defer { stateLock.unlock() }
        wired = true
    }

    /// Gate sampling to project view controller / activity foreground.
    /// Inactive: no displayLink callbacks, no timer ticks, ring cleared.
    @objc public func setActive(_ shouldBeActive: Bool) {
        stateLock.lock()
        let wasActive = active
        active = shouldBeActive
        stateLock.unlock()
        if shouldBeActive && !wasActive {
            startInternal()
        } else if !shouldBeActive && wasActive {
            stopInternal()
        }
    }

    private func startInternal() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.lastFrameTimestamp = 0
            self.frameCount = 0
            self.totalFrameDeltaMs = 0
            let link = CADisplayLink(target: self, selector: #selector(self.onFrame(_:)))
            link.add(to: .main, forMode: .common)
            self.displayLink = link
        }

        let t = DispatchSource.makeTimerSource(queue: timerQueue)
        t.schedule(deadline: .now() + .milliseconds(sampleIntervalMs),
                   repeating: .milliseconds(sampleIntervalMs))
        t.setEventHandler { [weak self] in
            self?.tick()
        }
        t.resume()
        timerSource = t
    }

    private func stopInternal() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.displayLink?.invalidate()
            self.displayLink = nil
            self.lastFrameTimestamp = 0
            self.frameCount = 0
            self.totalFrameDeltaMs = 0
        }
        timerSource?.cancel()
        timerSource = nil
        ringQueue.sync {
            ring.removeAll(keepingCapacity: true)
        }
    }

    @objc public func snapshot() -> [PerfSample] {
        var copy: [PerfSample] = []
        ringQueue.sync {
            copy = ring
        }
        return copy
    }

    @objc public func snapshotDictionaries() -> [[String: Any]] {
        return snapshot().map { $0.toDictionary() }
    }

    @objc private func onFrame(_ link: CADisplayLink) {
        let ts = link.timestamp
        let last = lastFrameTimestamp
        if last != 0 {
            let deltaMs = (ts - last) * 1000.0
            frameCount += 1
            totalFrameDeltaMs += deltaMs
        }
        lastFrameTimestamp = ts
    }

    private func tick() {
        let (fps, avgMs) = consumeFrameStats()
        let cpuPct = readCpuPercent()
        let sample = PerfSample(
            t: Date().timeIntervalSince1970 * 1000.0,
            frametimeMs: avgMs,
            cpuPct: cpuPct,
            avgFps: fps
        )
        ringQueue.sync {
            if ring.count >= ringCapacity {
                ring.removeFirst(ring.count - ringCapacity + 1)
            }
            ring.append(sample)
        }
        onSample?(sample)
    }

    private func consumeFrameStats() -> (Int, Double) {
        let count = frameCount
        let avg = count > 0 ? totalFrameDeltaMs / Double(count) : 0
        frameCount = 0
        totalFrameDeltaMs = 0
        return (count, avg)
    }

    private func readCpuPercent() -> Double {
        var threadsList: thread_act_array_t?
        var threadCount: mach_msg_type_number_t = 0
        let kr = task_threads(mach_task_self_, &threadsList, &threadCount)
        guard kr == KERN_SUCCESS, let threads = threadsList else { return -1.0 }
        defer {
            let size = vm_size_t(MemoryLayout<thread_t>.size) * vm_size_t(threadCount)
            vm_deallocate(mach_task_self_, vm_address_t(UInt(bitPattern: threads)), size)
        }
        var totalPct: Double = 0
        for i in 0..<Int(threadCount) {
            var info = thread_basic_info()
            var count = mach_msg_type_number_t(
                MemoryLayout<thread_basic_info>.size / MemoryLayout<natural_t>.size)
            let kr2 = withUnsafeMutablePointer(to: &info) { ptr -> kern_return_t in
                ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { reb in
                    thread_info(threads[i], thread_flavor_t(THREAD_BASIC_INFO), reb, &count)
                }
            }
            if kr2 != KERN_SUCCESS { continue }
            if (info.flags & TH_FLAGS_IDLE) != 0 { continue }
            totalPct += Double(info.cpu_usage) / Double(TH_USAGE_SCALE) * 100.0
        }
        let normalized = totalPct / Double(coreCount)
        return max(0.0, min(100.0, normalized))
    }
}
