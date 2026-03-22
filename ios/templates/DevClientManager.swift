import Foundation
import tamerdevclient

class DevClientManager {
    private var webSocketTask: URLSessionWebSocketTask?
    private let onReload: () -> Void
    private var session: URLSession?
    private var shouldReconnect = false
    private var reconnectWorkItem: DispatchWorkItem?

    private let reconnectDelay: TimeInterval = 3.0

    init(onReload: @escaping () -> Void) {
        self.onReload = onReload
    }

    func connect() {
        shouldReconnect = true
        openSocketIfNeeded()
    }

    private func openSocketIfNeeded() {
        guard shouldReconnect else { return }
        guard webSocketTask == nil else { return }
        guard let devUrl = DevServerPrefs.getUrl(), !devUrl.isEmpty else { return }
        guard let base = URL(string: devUrl) else { return }

        let scheme = (base.scheme == "https") ? "wss" : "ws"
        let host = base.host ?? "localhost"
        let port = base.port.map { ":\($0)" } ?? ""
        let rawPath = base.path.isEmpty ? "/" : base.path
        let dir = rawPath.hasSuffix("/") ? rawPath : rawPath + "/"
        guard let wsUrl = URL(string: "\(scheme)://\(host)\(port)\(dir)__hmr") else { return }

        session = URLSession(configuration: .default)
        let task = session!.webSocketTask(with: wsUrl)
        webSocketTask = task
        task.resume()
        receive()
    }

    private func receive() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let msg):
                if case .string(let text) = msg, text.contains("\"type\":\"reload\"") {
                    DispatchQueue.main.async { self.onReload() }
                }
                self.receive()
            case .failure:
                self.handleDisconnect()
            }
        }
    }

    private func handleDisconnect() {
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil
        guard shouldReconnect else { return }
        reconnectWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.openSocketIfNeeded()
        }
        reconnectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay, execute: work)
    }

    func disconnect() {
        shouldReconnect = false
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        session?.invalidateAndCancel()
        session = nil
    }
}
