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
            "clearDevServerUrl":        NSStringFromSelector(#selector(clearDevServerUrl)),
            "scanQR":                   NSStringFromSelector(#selector(scanQR)),
            "reloadWithProjectBundle":  NSStringFromSelector(#selector(reloadWithProjectBundle)),
            "startDiscovery":           NSStringFromSelector(#selector(startDiscovery)),
            "stopDiscovery":            NSStringFromSelector(#selector(stopDiscovery)),
            "getDiscoveredServers":     NSStringFromSelector(#selector(getDiscoveredServers(_:))),
            "checkServerCompatibility": NSStringFromSelector(#selector(checkServerCompatibility(_:callback:))),
        ]
    }

    // MARK: - Static Attachment Points (set by DevLauncherViewController)

    public static weak var shared: DevClientModule?

    /// Present a QR scanner; call completion with scanned URL string or nil on cancel.
    public static var presentQRScanner: ((@escaping (String?) -> Void) -> Void)?

    /// Navigate to the project view controller.
    public static var reloadProjectHandler: (() -> Void)?

    // MARK: - Instance State

    private weak var lynxContext: LynxContext?
    private var bonjourResolver: BonjourResolver?
    private var lastDiscovered: [[String: String]] = []

    // MARK: - Init

    @objc public required init(param: Any) {
        super.init()
        lynxContext = param as? LynxContext
        DevClientModule.shared = self
    }

    @objc public override init() {
        super.init()
        DevClientModule.shared = self
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

    @objc func startDiscovery() {
        guard bonjourResolver == nil else { return }
        let resolver = BonjourResolver()
        resolver.onServersChanged = { [weak self] servers in
            self?.emitDiscoveredServers(servers)
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
        let list = lastDiscovered.map { s -> NSDictionary in
            ["url": s["url"] ?? "", "name": s["name"] ?? ""] as NSDictionary
        }
        callback(list as NSArray)
    }

    @objc func checkServerCompatibility(_ baseUrl: String, callback: @escaping LynxCallbackBlock) {
        DispatchQueue.global(qos: .utility).async {
            let trimmed = baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard let url = URL(string: trimmed + "/meta.json") else {
                callback([true, []] as NSArray)
                return
            }
            var req = URLRequest(url: url)
            req.timeoutInterval = 5
            URLSession.shared.dataTask(with: req) { data, _, _ in
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let modules = json["nativeModules"] as? [[String: Any]] else {
                    callback([true, []] as NSArray)
                    return
                }
                let required = modules.compactMap { $0["moduleClassName"] as? String }
                callback([true, required] as NSArray)
            }.resume()
        }
    }

    // MARK: - Private

    private func emitScanResult(_ url: String?) {
        let payload = url.map { "{\"url\":\"\($0)\"}" } ?? "{\"url\":\"\"}"
        sendEvent("devclient:scanResult", payload: payload)
    }

    private func emitDiscoveredServers(_ servers: [[String: String]]) {
        lastDiscovered = servers
        let payloadServers = servers.map { server -> [String: Any] in
            [
                "url": server["url"] ?? "",
                "name": server["name"] ?? ""
            ]
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
}

// MARK: - DevServerPrefs

public final class DevServerPrefs {
    private static let suite = "tamer_dev_server"
    private static let keyUrl = "dev_server_url"
    private static let keyRecent = "dev_server_recent"
    private static var defaults: UserDefaults { UserDefaults(suiteName: suite) ?? .standard }

    public static func getUrl() -> String? {
        defaults.string(forKey: keyUrl)
    }

    public static func setUrl(_ url: String) {
        defaults.set(url, forKey: keyUrl)
        addRecent(url)
    }

    public static func getRecentUrls() -> [String] {
        guard let json = defaults.string(forKey: keyRecent),
              let data = json.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Array(arr.prefix(10))
    }

    public static func addRecent(_ url: String) {
        var current = getRecentUrls().filter { $0 != url }
        current.insert(url, at: 0)
        if let data = try? JSONEncoder().encode(Array(current.prefix(10))),
           let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: keyRecent)
        }
    }

    public static func clear() {
        defaults.removePersistentDomain(forName: suite)
    }
}
