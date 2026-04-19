import Foundation
import Lynx
import AVFoundation

private final class BonjourResolver: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    var onServersChanged: (([[String: String]]) -> Void)?

    private let browser = NetServiceBrowser()
    private var services: [String: NetService] = [:]
    private var resolved: [String: [String: String]] = [:]

    override init() {
        super.init()
        browser.delegate = self
    }

    func start() {
        browser.schedule(in: .main, forMode: .common)
        browser.searchForServices(ofType: "_tamer._tcp.", inDomain: "local.")
    }

    func stop() {
        browser.stop()
        browser.remove(from: .main, forMode: .common)
        services.values.forEach { service in
            service.stop()
            service.remove(from: .main, forMode: .common)
            service.delegate = nil
        }
        services.removeAll()
        resolved.removeAll()
        onServersChanged?([])
    }

    func netServiceBrowserWillSearch(_ browser: NetServiceBrowser) {
        onServersChanged?(Array(resolved.values))
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        let key = serviceKey(service)
        service.delegate = self
        service.schedule(in: .main, forMode: .common)
        services[key] = service
        service.resolve(withTimeout: 10)
        if !moreComing {
            onServersChanged?(sortedServers())
        }
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        let key = serviceKey(service)
        services[key]?.stop()
        services[key]?.delegate = nil
        services.removeValue(forKey: key)
        resolved.removeValue(forKey: key)
        if !moreComing {
            onServersChanged?(sortedServers())
        }
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        let key = serviceKey(sender)
        guard let host = sender.hostName?.trimmingCharacters(in: CharacterSet(charactersIn: ".")),
              !host.isEmpty,
              sender.port > 0 else {
            return
        }
        resolved[key] = [
            "url": "http://\(host):\(sender.port)",
            "name": sender.name
        ]
        onServersChanged?(sortedServers())
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String : NSNumber]) {
        resolved.removeValue(forKey: serviceKey(sender))
        onServersChanged?(sortedServers())
    }

    private func serviceKey(_ service: NetService) -> String {
        "\(service.name)|\(service.type)|\(service.domain)"
    }

    private func sortedServers() -> [[String: String]] {
        resolved.values.sorted { lhs, rhs in
            (lhs["name"] ?? lhs["url"] ?? "") < (rhs["name"] ?? rhs["url"] ?? "")
        }
    }
}

@objcMembers
public final class DevClientModule: NSObject, LynxModule {

    // MARK: - LynxModule Protocol

    @objc public static var name: String { "DevClientModule" }

    @objc public static var methodLookup: [String: String] {
        [
            "getDevServerUrl":          NSStringFromSelector(#selector(getDevServerUrl(_:))),
            "setDevServerUrl":          NSStringFromSelector(#selector(setDevServerUrl(_:))),
            "getRecentUrls":            NSStringFromSelector(#selector(getRecentUrls(_:))),
            "getRecentEntries":         NSStringFromSelector(#selector(getRecentEntries(_:))),
            "removeRecentUrl":          NSStringFromSelector(#selector(removeRecentUrl(_:))),
            "clearDevServerUrl":        NSStringFromSelector(#selector(clearDevServerUrl)),
            "scanQR":                   NSStringFromSelector(#selector(scanQR)),
            "reloadWithProjectBundle":  NSStringFromSelector(#selector(reloadWithProjectBundle)),
            "openProjectDirect":        NSStringFromSelector(#selector(openProjectDirect(_:))),
            "getProjectDeepLink":       NSStringFromSelector(#selector(getProjectDeepLink(_:))),
            "startDiscovery":           NSStringFromSelector(#selector(startDiscovery)),
            "stopDiscovery":            NSStringFromSelector(#selector(stopDiscovery)),
            "getDiscoveredServers":     NSStringFromSelector(#selector(getDiscoveredServers(_:))),
            "checkServerCompatibility": NSStringFromSelector(#selector(checkServerCompatibility(_:callback:))),
            "getAppInfo":               NSStringFromSelector(#selector(getAppInfo(_:))),
            "getCurrentProjectDebugInfo": NSStringFromSelector(#selector(getCurrentProjectDebugInfo(_:))),
            "dismissTamerDebugPanel":   NSStringFromSelector(#selector(dismissTamerDebugPanel)),
            "getPerfHistory":           NSStringFromSelector(#selector(getPerfHistory(_:))),
        ]
    }

    // MARK: - Static Attachment Points (set by DevLauncherViewController)

    public static weak var shared: DevClientModule?

    private static let supportedModulesLock = NSLock()
    private static var supportedModuleClassNamesInternal = Set<String>()

    private static let bundledManifestLock = NSLock()
    private static var bundledManifestResolved = false
    private static var bundledManifestClassNames = Set<String>()

    /// Same JVM-style class names as Android meta.json / discoverNativeExtensions (e.g. com.nanofuxion.tamerrouter.TamerRouterNativeModule).
    public static func attachSupportedModuleClassNames(_ names: [String]) {
        supportedModulesLock.lock()
        supportedModuleClassNamesInternal = Set(names.filter { !$0.isEmpty })
        supportedModulesLock.unlock()
    }

    /// Emits `devclient:shakeDetected` on the Lynx global event bus (e.g. from host `motionEnded` shake).
    public static func emitShakeDetected() {
        shared?.emitShakeEvent()
    }

    /// Fallback when `attachSupportedModuleClassNames` was not run (e.g. custom LynxInit): `tamer-host-native-modules.json` from app Resources (written by Tamer iOS autolink).
    private static func classNamesFromBundledHostManifest() -> Set<String> {
        bundledManifestLock.lock()
        defer { bundledManifestLock.unlock() }
        if bundledManifestResolved {
            return bundledManifestClassNames
        }
        bundledManifestResolved = true
        guard let url = Bundle.main.url(forResource: "tamer-host-native-modules", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let arr = obj["moduleClassNames"] as? [String] else {
            return []
        }
        bundledManifestClassNames = Set(arr.filter { !$0.isEmpty })
        return bundledManifestClassNames
    }

    private static func supportedModuleClassNamesSnapshot() -> Set<String> {
        supportedModulesLock.lock()
        let injected = supportedModuleClassNamesInternal
        supportedModulesLock.unlock()
        if !injected.isEmpty {
            return injected
        }
        return classNamesFromBundledHostManifest()
    }

    /// Present a QR scanner; call completion with scanned URL string or nil on cancel.
    public static var presentQRScanner: ((@escaping (String?) -> Void) -> Void)?

    /// Navigate to the project view controller.
    public static var reloadProjectHandler: (() -> Void)?

    /// Open project directly with a specific bundle URL (called from openProjectDirect).
    public static var openProjectDirectHandler: ((String) -> Void)?

    /// Dismiss the embedded Tamer debug overlay / native debug dialog (from `tamer-debug.lynx.bundle` Close action).
    public static var dismissTamerDebugPanelHandler: (() -> Void)?

    // MARK: - Instance State

    private weak var lynxContext: LynxContext?
    private var bonjourResolver: BonjourResolver?
    private var lastDiscovered: [[String: Any]] = []

    fileprivate static func makeProbeRequest(url: URL, probe: String) -> URLRequest {
        var req = URLRequest(url: url)
        req.timeoutInterval = 5
        req.setValue(probe, forHTTPHeaderField: "x-tamer-probe")
        return req
    }

    private static func packagerRunningSync(_ baseUrl: String) -> Bool {
        let trimmed = baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + "/status") else { return false }
        let sem = DispatchSemaphore(value: 0)
        var running = false
        let req = makeProbeRequest(url: url, probe: "discovery-status")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sem.signal() }
            guard let data = data, let text = String(data: data, encoding: .utf8) else { return }
            running = text.contains("packager-status:running")
        }.resume()
        _ = sem.wait(timeout: .now() + .seconds(6))
        return running
    }

    private static func fetchMetaJsonSync(_ baseUrl: String) -> [String: Any]? {
        let trimmed = baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + "/meta.json") else { return nil }
        let sem = DispatchSemaphore(value: 0)
        var result: [String: Any]?
        let req = makeProbeRequest(url: url, probe: "discovery-meta")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sem.signal() }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            result = json
        }.resume()
        _ = sem.wait(timeout: .now() + .seconds(6))
        return result
    }

    private static func metaModulesCompatibleFromJson(_ json: [String: Any], supported: Set<String>) -> Bool {
        if supported.isEmpty { return true }
        guard let modules = json["nativeModules"] as? [[String: Any]] else { return true }
        for item in modules {
            let cls = item["moduleClassName"] as? String ?? ""
            if !cls.isEmpty && !supported.contains(cls) {
                return false
            }
        }
        return true
    }

    private func enrichDiscoveredServers(_ raw: [[String: String]]) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self = self else { return }
            let supported = DevClientModule.supportedModuleClassNamesSnapshot()
            var enriched: [[String: Any]] = []
            for s in raw {
                guard let url = s["url"], !url.isEmpty else { continue }
                guard DevClientModule.packagerRunningSync(url) else { continue }
                let meta = DevClientModule.fetchMetaJsonSync(url)
                let compat = meta.map { DevClientModule.metaModulesCompatibleFromJson($0, supported: supported) } ?? true
                let bonjourName = s["name"] ?? ""
                let metaName = meta?["name"] as? String ?? ""
                let displayName = metaName.isEmpty ? bonjourName : metaName
                var row: [String: Any] = [
                    "url": url,
                    "name": displayName,
                    "compatible": compat
                ]
                if let icon = meta?["icon"] as? String, !icon.isEmpty {
                    row["iconUrl"] = icon
                }
                if let key = meta?["tamerAppKey"] as? String, !key.isEmpty {
                    row["tamerAppKey"] = key
                }
                enriched.append(row)
            }
            DispatchQueue.main.async {
                self.emitDiscoveredServers(enriched)
            }
        }
    }

    // MARK: - Init

    @objc public required init(param: Any) {
        super.init()
        lynxContext = param as? LynxContext
        DevClientModule.shared = self
        DevClientModule.ensurePerfSamplerStarted()
    }

    @objc public override init() {
        super.init()
        DevClientModule.shared = self
        DevClientModule.ensurePerfSamplerStarted()
    }

    private static var perfSamplerWired = false
    private static let perfSamplerLock = NSLock()

    private static func ensurePerfSamplerStarted() {
        perfSamplerLock.lock()
        defer { perfSamplerLock.unlock() }
        if perfSamplerWired { return }
        perfSamplerWired = true
        PerfSampler.shared.onSample = { sample in
            DispatchQueue.main.async {
                DevClientModule.shared?.emitPerfSample(sample)
            }
        }
        PerfSampler.shared.ensureStarted()
    }

    private func emitPerfSample(_ sample: PerfSample) {
        let params: [[String: Any]] = [sample.toDictionary()]
        if let ctx = lynxContext {
            ctx.sendGlobalEvent("devclient:perfSample", withParams: params)
        } else if let ctx = DevClientModule.shared?.lynxContext {
            ctx.sendGlobalEvent("devclient:perfSample", withParams: params)
        }
    }

    @objc func getPerfHistory(_ callback: LynxCallbackBlock) {
        let rows: [NSDictionary] = PerfSampler.shared.snapshotDictionaries().map { $0 as NSDictionary }
        callback(rows as NSArray)
    }

    // MARK: - LynxModule Methods

    @objc func getDevServerUrl(_ callback: LynxCallbackBlock) {
        callback(DevServerPrefs.getUrl() as Any)
    }

    @objc func setDevServerUrl(_ url: String) {
        var normalized = url.trimmingCharacters(in: .whitespaces)
        if normalized.hasSuffix("/main.lynx.bundle") {
            normalized = String(normalized.dropLast("/main.lynx.bundle".count))
        } else if normalized.hasSuffix("main.lynx.bundle") {
            normalized = String(normalized.dropLast("main.lynx.bundle".count))
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        DevServerPrefs.setUrl(normalized)
    }

    @objc func getRecentUrls(_ callback: LynxCallbackBlock) {
        callback(DevServerPrefs.getRecentUrls() as NSArray)
    }

    @objc func getRecentEntries(_ callback: LynxCallbackBlock) {
        let rows: [NSDictionary] = DevServerPrefs.getRecentEntries().map { e in
            var d: [String: Any] = ["url": e.url]
            if let k = e.tamerAppKey, !k.isEmpty { d["tamerAppKey"] = k }
            if let l = e.label, !l.isEmpty { d["label"] = l }
            if let i = e.iconUrl, !i.isEmpty { d["iconUrl"] = i }
            return d as NSDictionary
        }
        callback(rows as NSArray)
    }

    @objc func removeRecentUrl(_ url: String) {
        DevServerPrefs.removeRecentUrl(url)
    }

    @objc func clearDevServerUrl() {
        DevServerPrefs.clear()
    }

    @objc func scanQR() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let present = DevClientModule.presentQRScanner else {
                self.emitScanResult(nil)
                return
            }
            present { [weak self] result in
                self?.emitScanResult(result)
            }
        }
    }

    @objc func reloadWithProjectBundle() {
        DispatchQueue.main.async {
            DevClientModule.reloadProjectHandler?()
        }
    }

    @objc func dismissTamerDebugPanel() {
        DispatchQueue.main.async {
            DevClientModule.dismissTamerDebugPanelHandler?()
        }
    }

    @objc func openProjectDirect(_ bundleUrl: String) {
        var normalized = bundleUrl.trimmingCharacters(in: .whitespaces)
        if normalized.hasSuffix("/main.lynx.bundle") {
            normalized = String(normalized.dropLast("/main.lynx.bundle".count))
        } else if normalized.hasSuffix("main.lynx.bundle") {
            normalized = String(normalized.dropLast("main.lynx.bundle".count))
                .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        DispatchQueue.main.async {
            DevClientModule.openProjectDirectHandler?(normalized)
        }
    }

    @objc func getProjectDeepLink(_ callback: LynxCallbackBlock) {
        guard let devUrl = DevServerPrefs.getUrl(), !devUrl.isEmpty else {
            callback("" as Any)
            return
        }
        let encodedUrl = devUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? devUrl
        let deepLink = "tamerdevapp://project?bundleUrl=\(encodedUrl)"
        callback(deepLink as Any)
    }

    @objc func startDiscovery() {
        guard bonjourResolver == nil else { return }
        let resolver = BonjourResolver()
        resolver.onServersChanged = { [weak self] servers in
            self?.enrichDiscoveredServers(servers)
        }
        bonjourResolver = resolver
        DispatchQueue.main.async {
            resolver.start()
        }
    }

    @objc func stopDiscovery() {
        bonjourResolver?.stop()
        bonjourResolver = nil
    }

    @objc func getDiscoveredServers(_ callback: LynxCallbackBlock) {
        let list: [NSDictionary] = lastDiscovered.map { s in
            var dict: [String: Any] = [
                "url": (s["url"] as? String) ?? "",
                "name": (s["name"] as? String) ?? "",
                "compatible": (s["compatible"] as? Bool) ?? true
            ]
            if let icon = s["iconUrl"] as? String, !icon.isEmpty { dict["iconUrl"] = icon }
            if let key = s["tamerAppKey"] as? String, !key.isEmpty { dict["tamerAppKey"] = key }
            return dict as NSDictionary
        }
        callback(list as NSArray)
    }

    @objc func getAppInfo(_ callback: LynxCallbackBlock) {
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        let nativeVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        let lynxSdk = TamerDevClientLynxSdkInfo.sdkVersionString()
        let map: [String: Any] = [
            "bundleId": bundleId,
            "nativeAppVersion": nativeVersion,
            "lynxSdkVersion": lynxSdk
        ]
        callback(map as NSDictionary)
    }

    @objc func getCurrentProjectDebugInfo(_ callback: LynxCallbackBlock) {
        callback(DevServerPrefs.getCurrentProjectDebugInfo() as NSDictionary)
    }

    @objc func checkServerCompatibility(_ baseUrl: String, callback: @escaping LynxCallbackBlock) {
        DispatchQueue.global(qos: .utility).async {
            let supported = DevClientModule.supportedModuleClassNamesSnapshot()
            let trimmed = baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + "/meta.json") else {
                DispatchQueue.main.async {
                    callback([NSNumber(value: true), []] as NSArray)
                }
                return
            }
            let req = DevClientModule.makeProbeRequest(url: url, probe: "compatibility-meta")
            URLSession.shared.dataTask(with: req) { data, _, _ in
                if supported.isEmpty {
                    DispatchQueue.main.async {
                        callback([NSNumber(value: true), []] as NSArray)
                    }
                    return
                }
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    DispatchQueue.main.async {
                        callback([NSNumber(value: true), []] as NSArray)
                    }
                    return
                }
                let modules = json["nativeModules"] as? [[String: Any]] ?? []
                var missing: [[String: String]] = []
                for item in modules {
                    let pkg = item["packageName"] as? String ?? ""
                    let cls = item["moduleClassName"] as? String ?? ""
                    if !cls.isEmpty && !supported.contains(cls) {
                        missing.append(["packageName": pkg, "moduleClassName": cls])
                    }
                }
                let compatible = missing.isEmpty
                let outMaps: [NSDictionary] = missing.map {
                    ["packageName": $0["packageName"] ?? "", "moduleClassName": $0["moduleClassName"] ?? ""] as NSDictionary
                }
                DispatchQueue.main.async {
                    callback([NSNumber(value: compatible), outMaps] as NSArray)
                }
            }.resume()
        }
    }

    // MARK: - Private

    private func emitScanResult(_ url: String?) {
        let payload = url.map { "{\"url\":\"\($0)\"}" } ?? "{\"url\":\"\"}"
        sendEvent("devclient:scanResult", payload: payload)
    }

    private func emitDiscoveredServers(_ servers: [[String: Any]]) {
        lastDiscovered = servers
        let payloadServers: [[String: Any]] = servers.map { s in
            var row: [String: Any] = [
                "url": s["url"] as? String ?? "",
                "name": s["name"] as? String ?? "",
                "compatible": s["compatible"] as? Bool ?? true
            ]
            if let icon = s["iconUrl"] as? String, !icon.isEmpty { row["iconUrl"] = icon }
            if let key = s["tamerAppKey"] as? String, !key.isEmpty { row["tamerAppKey"] = key }
            return row
        }
        let payload = (try? JSONSerialization.data(withJSONObject: ["servers": payloadServers]))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{\"servers\":[]}"
        sendEvent("devclient:discoveredServers", payload: payload)
    }

    private func sendEvent(_ name: String, payload: String) {
        let params: [[String: Any]] = [["payload": payload]]
        if let ctx = lynxContext {
            ctx.sendGlobalEvent(name, withParams: params)
        } else if let ctx = DevClientModule.shared?.lynxContext {
            ctx.sendGlobalEvent(name, withParams: params)
        }
    }

    private func emitShakeEvent() {
        sendEvent("devclient:shakeDetected", payload: "{}")
    }
}

// MARK: - DevServerPrefs

public struct DevRecentEntry {
    public var url: String
    public var tamerAppKey: String?
    public var label: String?
    public var iconUrl: String?
}

private struct RecentEntryCodable: Codable {
    var url: String
    var tamerAppKey: String?
    var label: String?
    var iconUrl: String?
}

private struct RecentListV2: Codable {
    var v: Int = 1
    var items: [RecentEntryCodable]
}

public final class DevServerPrefs {
    private static let suite = "tamer_dev_server"
    private static let keyUrl = "dev_server_url"
    private static let keyRecent = "dev_server_recent"
    private static let keyRecentV2 = "dev_server_recent_v2"
    private static let keyMetaCache = "dev_server_meta_cache"
    private static let keyProjectInitData = "project_init_data_json"
    private static let recentLock = NSLock()
    private static var defaults: UserDefaults { UserDefaults(suiteName: suite) ?? .standard }

    public static func getProjectInitDataJson() -> String {
        defaults.string(forKey: keyProjectInitData) ?? "{}"
    }

    public static func getProjectInitTemplateData() -> LynxTemplateData {
        LynxTemplateData(json: getProjectInitDataJson())
    }

    public static func getUrl() -> String? {
        defaults.string(forKey: keyUrl)
    }

    public static func setUrl(_ url: String) {
        defaults.set(url, forKey: keyUrl)
        mergeRecentImmediate(url)
        DispatchQueue.global(qos: .utility).async {
            enrichRecentWithMeta(url)
        }
    }

    public static func getRecentUrls() -> [String] {
        loadRecentItems().map(\.url)
    }

    public static func getRecentEntries() -> [DevRecentEntry] {
        loadRecentItems().map {
            DevRecentEntry(url: $0.url, tamerAppKey: $0.tamerAppKey, label: $0.label, iconUrl: $0.iconUrl)
        }
    }

    public static func getCurrentProjectDebugInfo() -> [String: Any] {
        let currentUrl = getUrl()?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        let recent = currentUrl.flatMap { url in
            loadRecentItems().first(where: { $0.url == url })
        }
        let meta = currentUrl.flatMap { loadMetaCacheEntry(url: $0) }

        var map: [String: Any] = [:]
        if let currentUrl { map["url"] = currentUrl }
        if let icon = recent?.iconUrl ?? meta?["iconUrl"] as? String, !icon.isEmpty { map["iconUrl"] = icon }
        if let label = recent?.label ?? meta?["label"] as? String, !label.isEmpty { map["label"] = label }
        if let key = recent?.tamerAppKey ?? meta?["tamerAppKey"] as? String, !key.isEmpty { map["tamerAppKey"] = key }
        return map
    }

    public static func removeRecentUrl(_ url: String) {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        recentLock.lock()
        defer { recentLock.unlock() }
        migrateLegacyRecentIfNeeded()
        let next = loadRecentItemsUnlocked().filter { $0.url != trimmed }
        saveRecentItemsUnlocked(next)
    }

    public static func clear() {
        defaults.removePersistentDomain(forName: suite)
    }

    private static func migrateLegacyRecentIfNeeded() {
        if defaults.string(forKey: keyRecentV2) != nil { return }
        var items: [RecentEntryCodable] = []
        if let json = defaults.string(forKey: keyRecent),
           let data = json.data(using: .utf8),
           let arr = try? JSONDecoder().decode([String].self, from: data) {
            items = arr.map { RecentEntryCodable(url: $0, tamerAppKey: nil, label: nil, iconUrl: nil) }
        }
        let v2 = RecentListV2(v: 1, items: Array(items.prefix(10)))
        if let data = try? JSONEncoder().encode(v2), let s = String(data: data, encoding: .utf8) {
            defaults.set(s, forKey: keyRecentV2)
        }
    }

    private static func loadRecentItems() -> [RecentEntryCodable] {
        recentLock.lock()
        defer { recentLock.unlock() }
        migrateLegacyRecentIfNeeded()
        return loadRecentItemsUnlocked()
    }

    private static func loadRecentItemsUnlocked() -> [RecentEntryCodable] {
        guard let json = defaults.string(forKey: keyRecentV2),
              let data = json.data(using: .utf8),
              let v2 = try? JSONDecoder().decode(RecentListV2.self, from: data) else {
            return []
        }
        return v2.items
    }

    private static func saveRecentItemsUnlocked(_ items: [RecentEntryCodable]) {
        let v2 = RecentListV2(v: 1, items: Array(items.prefix(10)))
        if let data = try? JSONEncoder().encode(v2), let s = String(data: data, encoding: .utf8) {
            defaults.set(s, forKey: keyRecentV2)
        }
    }

    private static func mergeRecentImmediate(_ url: String) {
        recentLock.lock()
        defer { recentLock.unlock() }
        migrateLegacyRecentIfNeeded()
        let cur = loadRecentItemsUnlocked().filter { $0.url != url }
        let next = [RecentEntryCodable(url: url, tamerAppKey: nil, label: nil, iconUrl: nil)] + cur
        saveRecentItemsUnlocked(Array(next.prefix(10)))
    }

    private static func fetchMetaDict(url base: String) -> [String: Any]? {
        let trimmed = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let u = URL(string: trimmed + "/meta.json") else { return nil }
        let sem = DispatchSemaphore(value: 0)
        var out: [String: Any]?
        let req = DevClientModule.makeProbeRequest(url: u, probe: "connect-meta")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sem.signal() }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            out = json
        }.resume()
        _ = sem.wait(timeout: .now() + .seconds(6))
        return out
    }

    private static func loadMetaCacheEntry(url: String) -> [String: Any]? {
        guard let existing = defaults.string(forKey: keyMetaCache),
              let data = existing.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let entry = parsed[url] as? [String: Any] else {
            return nil
        }
        return entry
    }

    private static func buildProjectInitData(_ meta: [String: Any]?) -> String {
        guard let meta = meta else { return "{}" }
        var o: [String: String] = [:]
        if let s = meta["tamerAppKey"] as? String, !s.isEmpty { o["tamerAppKey"] = s }
        if let s = meta["androidPackageName"] as? String, !s.isEmpty { o["androidPackageName"] = s }
        if let s = meta["iosBundleId"] as? String, !s.isEmpty { o["iosBundleId"] = s }
        guard !o.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: o),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }

    private static func updateMetaCache(url: String, key: String?, icon: String?, label: String?) {
        var root: [String: Any] = [:]
        if let existing = defaults.string(forKey: keyMetaCache),
           let data = existing.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            root = parsed
        }
        var entry: [String: Any] = ["updatedAt": Date().timeIntervalSince1970]
        if let key = key { entry["tamerAppKey"] = key }
        if let icon = icon { entry["iconUrl"] = icon }
        if let label = label { entry["label"] = label }
        root[url] = entry
        if let data = try? JSONSerialization.data(withJSONObject: root),
           let s = String(data: data, encoding: .utf8) {
            defaults.set(s, forKey: keyMetaCache)
        }
    }

    private static func enrichRecentWithMeta(_ normalizedUrl: String) {
        let meta = fetchMetaDict(url: normalizedUrl)
        let initJson = buildProjectInitData(meta)
        defaults.set(initJson, forKey: keyProjectInitData)
        let key = (meta?["tamerAppKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        let icon = (meta?["icon"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        let label = (meta?["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        if key != nil || icon != nil || label != nil {
            updateMetaCache(url: normalizedUrl, key: key, icon: icon, label: label)
        }
        recentLock.lock()
        defer { recentLock.unlock() }
        migrateLegacyRecentIfNeeded()
        let list = loadRecentItemsUnlocked()
        let others = list.filter { $0.url != normalizedUrl }
            .filter { item in key == nil || item.tamerAppKey != key }
        let updated = RecentEntryCodable(url: normalizedUrl, tamerAppKey: key, label: label, iconUrl: icon)
        saveRecentItemsUnlocked([updated] + others)
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
