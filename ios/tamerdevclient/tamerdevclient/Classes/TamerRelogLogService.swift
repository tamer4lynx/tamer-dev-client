import Foundation
import Lynx

private let maxQueue = 100
private let reconnectDelay: TimeInterval = 3.0

@objcMembers
public final class TamerRelogLogService: NSObject {
    public static let shared = TamerRelogLogService()

    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private let queue = DispatchQueue(label: "com.tamerdevclient.relog", qos: .utility)
    private var pendingQueue: [String] = []
    private let queueLock = NSLock()
    private var shouldReconnect = false
    private var isConnecting = false
    private var loggingDelegateId: NSInteger = -1

    private let sessionDelegate = RelogURLSessionDelegate()

    public static func connect() {
        shared.connect()
    }

    public static func disconnect() {
        shared.disconnect()
    }

    public static func forwardLog(level: UInt32, tag: String, message: String) {
        shared.forwardLog(level: level, tag: tag, message: message)
    }

    public func connect() {
        shouldReconnect = true
        registerLoggingDelegate()
        guard !isConnecting, webSocketTask == nil else { return }
        guard let devUrl = DevServerPrefs.getUrl(), !devUrl.isEmpty else { return }
        guard let wsURL = buildWsURL(devUrl: devUrl) else { return }
        isConnecting = true
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 5
        let session = URLSession(configuration: config, delegate: sessionDelegate, delegateQueue: nil)
        urlSession = session
        sessionDelegate.onOpen = { [weak self] in
            self?.isConnecting = false
            self?.sendConnected()
            self?.flushPending()
        }
        sessionDelegate.onClose = { [weak self] in
            self?.webSocketTask = nil
            self?.isConnecting = false
            self?.scheduleReconnect()
        }
        sessionDelegate.onFailure = { [weak self] _ in
            self?.webSocketTask = nil
            self?.isConnecting = false
            self?.scheduleReconnect()
        }
        webSocketTask = session.webSocketTask(with: wsURL)
        webSocketTask?.resume()
    }

    public func disconnect() {
        shouldReconnect = false
        unregisterLoggingDelegate()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        queueLock.lock()
        pendingQueue.removeAll()
        queueLock.unlock()
        isConnecting = false
    }

    private func registerLoggingDelegate() {
        guard loggingDelegateId < 0 else { return }
        SetJSLogsFromExternalChannels(true)
        guard let delegate = LynxLogDelegate(
            logFunction: { [weak self] level, message in
                guard let self = self, let msg = message else { return }
                self.forwardLog(level: UInt32(level.rawValue), tag: "lynx-console", message: msg)
            },
            minLogLevel: .verbose
        ) else { return }
        delegate.acceptSource = LynxLogSource(rawValue: 1 << 1)
        loggingDelegateId = AddLoggingDelegate(delegate)
    }

    private func unregisterLoggingDelegate() {
        guard loggingDelegateId >= 0 else { return }
        RemoveLoggingDelegate(loggingDelegateId)
        loggingDelegateId = -1
    }

    func forwardLog(level: UInt32, tag: String, message: String) {
        let (forwardTag, forwardMsg) = parseConsoleMessage(tag: tag, message: message)
        let payload: [String: Any] = [
            "type": "console_log",
            "tag": forwardTag,
            "message": [forwardMsg]
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let str = String(data: data, encoding: .utf8) else { return }
        queue.async { [weak self] in
            self?.send(payload: str)
        }
    }

    private func parseConsoleMessage(tag: String, message: String) -> (String, String) {
        if tag != "lynx" { return (tag, message) }
        let pattern = #"\[.*?:(?:INFO|ERROR|WARN(?:ING)?|DEBUG|VERBOSE|FATAL):lynx_console\.cc\(\d+\)]\s*(.+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .dotMatchesLineSeparators),
              let match = regex.firstMatch(in: message, range: NSRange(message.startIndex..., in: message)),
              let range = Range(match.range(at: 1), in: message) else {
            return (tag, message)
        }
        return ("lynx-console", String(message[range]))
    }

    private func buildWsURL(devUrl: String) -> URL? {
        guard let url = URL(string: devUrl),
              let scheme = url.scheme,
              let host = url.host else { return nil }
        let wsScheme = scheme == "https" ? "wss" : "ws"
        let port = url.port ?? 0
        let portPart = port > 0 ? ":\(port)" : ""
        var path = url.path
        if !path.hasSuffix("/") { path += "/" }
        path += "__hmr"
        let wsString = "\(wsScheme)://\(host)\(portPart)\(path)"
        return URL(string: wsString)
    }

    private func sendConnected() {
        let payload: [String: Any] = [
            "type": "console_log",
            "tag": "lynx-console",
            "message": ["[TamerRelog] connected"]
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            send(payload: str)
        }
    }

    private func send(payload: String) {
        guard let task = webSocketTask else {
            queueLock.lock()
            if pendingQueue.count < maxQueue { pendingQueue.append(payload) }
            queueLock.unlock()
            return
        }
        task.send(.string(payload)) { [weak self] error in
            if error != nil {
                self?.queueLock.lock()
                if self?.pendingQueue.count ?? 0 < maxQueue { self?.pendingQueue.append(payload) }
                self?.queueLock.unlock()
            }
        }
    }

    private func flushPending() {
        queueLock.lock()
        let toSend = pendingQueue
        pendingQueue.removeAll()
        queueLock.unlock()
        for payload in toSend {
            webSocketTask?.send(.string(payload)) { _ in }
        }
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        queue.asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            self?.connect()
        }
    }
}

private final class RelogURLSessionDelegate: NSObject, URLSessionWebSocketDelegate {
    var onOpen: (() -> Void)?
    var onClose: (() -> Void)?
    var onFailure: ((Error) -> Void)?

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        DispatchQueue.main.async { self.onOpen?() }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        DispatchQueue.main.async { self.onClose?() }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error { DispatchQueue.main.async { self.onFailure?(error) } }
    }
}
