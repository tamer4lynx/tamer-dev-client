import Foundation
import Lynx
import tamerdevclient

class DevTemplateProvider: NSObject, LynxTemplateProvider, LynxTemplateResourceFetcher, LynxGenericResourceFetcher {
    private static let devClientBundle = "dev-client.lynx.bundle"
    private static let tamerDebugBundle = "tamer-debug.lynx.bundle"

    func loadTemplate(withUrl url: String!, onComplete callback: LynxTemplateLoadBlock!) {
        DispatchQueue.global(qos: .background).async {
            let result = self.loadData(url: url)
            callback?(result.data, result.error)
        }
    }

    func fetchTemplate(_ request: LynxResourceRequest, onComplete callback: @escaping LynxTemplateResourceCompletionBlock) {
        DispatchQueue.global(qos: .background).async {
            let result = self.loadData(url: request.url)
            callback(result.data.map { LynxTemplateResource(nsData: $0) }, result.error)
        }
    }

    func fetchSSRData(_ request: LynxResourceRequest, onComplete callback: @escaping LynxSSRResourceCompletionBlock) {
        DispatchQueue.global(qos: .background).async {
            let result = self.loadData(url: request.url)
            callback(result.data, result.error)
        }
    }

    func fetchResource(_ request: LynxResourceRequest, onComplete callback: @escaping LynxGenericResourceCompletionBlock) -> (() -> Void) {
        DispatchQueue.global(qos: .background).async {
            let result = self.loadData(url: request.url)
            callback(result.data, result.error)
        }
        return {}
    }

    func fetchResourcePath(_ request: LynxResourceRequest, onComplete callback: @escaping LynxGenericResourcePathCompletionBlock) -> (() -> Void) {
        let error = NSError(domain: "DevTemplateProvider", code: 501,
                            userInfo: [NSLocalizedDescriptionKey: "Resource path lookup is not supported"])
        callback(nil, error)
        return {}
    }

    private func loadData(url: String?) -> (data: Data?, error: NSError?) {
        if isEmbeddedDevShellUrl(url) {
            return loadFromBundle(url: url?.contains(Self.tamerDebugBundle) == true ? Self.tamerDebugBundle : Self.devClientBundle)
        }

        if let data = loadFromDevServer(url: url) {
            return (data, nil)
        }

        return loadFromBundle(url: normalizeBundlePath(url))
    }

    private func loadFromBundle(url: String?) -> (data: Data?, error: NSError?) {
        guard let rel = url, !rel.isEmpty,
              let resourcePath = Bundle.main.resourcePath else {
            return (nil, NSError(domain: "DevTemplateProvider", code: 404,
                                 userInfo: [NSLocalizedDescriptionKey: "Bundle not found: \(url ?? "nil")"]))
        }
        let abs = (resourcePath as NSString).appendingPathComponent(rel)
        if FileManager.default.fileExists(atPath: abs),
           let data = try? Data(contentsOf: URL(fileURLWithPath: abs)) {
            return (data, nil)
        }
        return (nil, NSError(domain: "DevTemplateProvider", code: 404,
                             userInfo: [NSLocalizedDescriptionKey: "Bundle not found: \(rel)"]))
    }

    private static func canonicalMainBundleRequestPath(_ normalized: String) -> String {
        guard let r = normalized.range(of: "/main.lynx.bundle", options: [.backwards, .caseInsensitive]) else {
            return normalized
        }
        let prefix = String(normalized[..<r.lowerBound])
        if prefix.count == 12, prefix.range(of: "^[a-fA-F0-9]{12}$", options: .regularExpression) != nil {
            return "main.lynx.bundle"
        }
        return normalized
    }

    private func loadFromDevServer(url: String?) -> Data? {
        guard var pathPart = normalizeBundlePath(url) else { return nil }
        pathPart = Self.canonicalMainBundleRequestPath(pathPart)
        guard let devRaw = DevServerPrefs.getUrl(),
              !devRaw.isEmpty else { return nil }

        let trimmedDev = devRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsed = URL(string: trimmedDev) else { return nil }

        let scheme = parsed.scheme ?? "http"
        let host = parsed.host ?? "localhost"
        let port = parsed.port.map { ":\($0)" } ?? ""
        let origin = "\(scheme)://\(host)\(port)"
        var rawPath = parsed.path
        while rawPath.hasSuffix("/") { rawPath.removeLast() }

        func pathEndsWithLynxBundle(_ path: String) -> Bool {
            path.lowercased().hasSuffix(".lynx.bundle")
        }

        if pathEndsWithLynxBundle(rawPath), pathPart.caseInsensitiveCompare("main.lynx.bundle") == .orderedSame {
            return httpFetch(url: trimmedDev)
        }

        var configuredPath = rawPath
        if pathEndsWithLynxBundle(rawPath), let idx = rawPath.lastIndex(of: "/") {
            configuredPath = String(rawPath[..<idx])
        }
        configuredPath = configuredPath.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)

        var candidates: [String] = []
        if !configuredPath.isEmpty {
            candidates.append("\(configuredPath)/\(pathPart)")
        }
        candidates.append("/{{PROJECT_BUNDLE_SEGMENT}}/\(pathPart)")
        candidates.append("/\(pathPart)")
        for candidate in candidates {
            if let data = httpFetch(url: origin + candidate) {
                return data
            }
        }
        return nil
    }

    private func isEmbeddedDevShellUrl(_ url: String?) -> Bool {
        guard let url = url else { return false }
        return url == Self.tamerDebugBundle || url.hasSuffix("/" + Self.tamerDebugBundle) || url.contains(Self.tamerDebugBundle)
            || url == Self.devClientBundle || url.hasSuffix("/" + Self.devClientBundle) || url.contains(Self.devClientBundle)
    }

    private func normalizeBundlePath(_ url: String?) -> String? {
        guard var s = url?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if let fragment = s.firstIndex(of: "#") {
            s = String(s[..<fragment])
        }
        if let query = s.firstIndex(of: "?") {
            s = String(s[..<query])
        }
        if let parsed = URL(string: s), parsed.scheme != nil, !parsed.path.isEmpty {
            s = parsed.path
        }
        s = s.replacingOccurrences(of: "\\", with: "/")
        while s.hasPrefix("/") {
            s.removeFirst()
        }
        s = stripBeforeMarker(s, marker: ".lynx.bundle/")
        s = stripBeforeMarker(s, marker: ".web.bundle/")
        s = stripBeforeMarker(s, marker: "static/")
        s = stripBeforeMarker(s, marker: "assets/")
        s = stripBeforeMarker(s, marker: "tamer-assets.json")
        let normalized = (s as NSString).standardizingPath
        if normalized == ".." || normalized.hasPrefix("../") { return nil }
        return normalized
    }

    private func stripBeforeMarker(_ value: String, marker: String) -> String {
        guard let range = value.range(of: marker) else { return value }
        if range.lowerBound == value.startIndex { return value }
        if marker.hasSuffix("/") {
            return String(value[range.upperBound...])
        }
        return String(value[range.lowerBound...])
    }

    private func httpFetch(url: String) -> Data? {
        guard let u = URL(string: url) else { return nil }
        var req = URLRequest(url: u)
        req.timeoutInterval = 10
        var result: Data?
        let sem = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: req) { data, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                result = data
            }
            sem.signal()
        }.resume()
        sem.wait()
        return result
    }
}
