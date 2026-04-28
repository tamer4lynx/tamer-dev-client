import UIKit
import Lynx
import tamerdevclient
import tamerinsets
import tamersystemui
#if canImport(tamerrouter)
import tamerrouter
#endif
#if canImport(tamernavigation)
import tamernavigation
#endif

private func tamer_project_disableLynxLongPressMenuIfAvailable() {
    guard let cls = NSClassFromString("LynxDevtoolEnv") else { return }
    let sel = NSSelectorFromString("sharedInstance")
    guard let env = (cls as AnyObject).perform(sel)?.takeUnretainedValue() as? NSObject else { return }
    env.setValue(false, forKey: "longPressMenuEnabled")
}

/// Shared with TamerNav stack spokes (`TamerNavHost.applySpokeBuilder`); required for one JS context group.
private enum TamerNavLynxRuntime {
    static let sharedGroup: LynxGroup = {
        let option = LynxGroupOption()
        return LynxGroup(name: "TamerNav", with: option)
    }()
}

class ProjectViewController: UIViewController {
    private var lynxView: LynxView?
    private var devMenuView: LynxView?
    private var devClientManager: DevClientManager?
    private var previousDismissTamerDebugPanelHandler: (() -> Void)?
    private var hasTriggeredInitialProjectLoad = false
    private var pendingInitialLoadWorkItem: DispatchWorkItem?
    var bundleUrl: String?
    var onDismiss: (() -> Void)?
    private lazy var projectDevMenuGesture: UILongPressGestureRecognizer = {
        let gesture = UILongPressGestureRecognizer(target: self, action: #selector(handleProjectDevMenuGesture(_:)))
        gesture.minimumPressDuration = 0.52
        gesture.numberOfTouchesRequired = 3
        gesture.cancelsTouchesInView = false
        return gesture
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        NSLog("[ProjectVC] viewDidLoad")
#if DEBUG
        let env = LynxEnv.sharedInstance()
        env.lynxDebugEnabled = true
        env.devtoolEnabled = true
        env.logBoxEnabled = true
#endif
        tamer_project_disableLynxLongPressMenuIfAvailable()
        view.backgroundColor = .black
        edgesForExtendedLayout = .all
        extendedLayoutIncludesOpaqueBars = true
        additionalSafeAreaInsets = .zero
        view.insetsLayoutMarginsFromSafeArea = false
        view.preservesSuperviewLayoutMargins = false
        if #available(iOS 15.0, *) {
            viewRespectsSystemMinimumLayoutMargins = false
        }
        setupLynxView()
        devClientManager = DevClientManager(bundleUrl: bundleUrl, onReload: { [weak self] in
            self?.reloadLynxView()
        })
        devClientManager?.connect()
#if DEBUG
        view.addGestureRecognizer(projectDevMenuGesture)
#endif
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        NSLog("[ProjectVC] viewWillAppear")
        // Do NOT override reloadProjectHandler — DevClientManager handles HMR via WebSocket.
        // ViewController's handler stays active and ignores repeat calls while we're presented
        // (presentedViewController is ProjectViewController → return).
        // Overriding it causes ViewController's background dev-client Lynx to loop-reload us.
#if DEBUG
        previousDismissTamerDebugPanelHandler = DevClientModule.dismissTamerDebugPanelHandler
        DevClientModule.dismissTamerDebugPanelHandler = { [weak self] in
            self?.dismissProjectDevMenu()
        }
#endif
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        triggerInitialProjectLoadIfNeeded(reason: "viewDidAppear")
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
#if DEBUG
        ShakeDetector.handleMotionEnded(motion) { [weak self] in
            self?.showProjectDevMenu()
        }
#endif
        super.motionEnded(motion, with: event)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let lynxView = lynxView {
            applyFullscreenLayout(to: lynxView)
        }
        if let devMenuView = devMenuView {
            applyFullscreenLayout(to: devMenuView)
        }
        triggerInitialProjectLoadIfNeeded(reason: "viewDidLayoutSubviews")
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        disableAutomaticInsetAdjustment()
        TamerInsetsModule.reRequestInsets()
        triggerInitialProjectLoadIfNeeded(reason: "viewSafeAreaInsetsDidChange")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { SystemUIModule.statusBarStyleForHost }

    private func buildLynxView() -> LynxView {
        let size = fullscreenBounds().size
        let lv = LynxView { builder in
            let provider = DevTemplateProvider()
#if canImport(tamernavigation)
            builder.group = TamerNavLynxRuntime.sharedGroup
#endif
            builder.config = LynxConfig(provider: provider)
            builder.templateResourceFetcher = provider
            builder.genericResourceFetcher = provider
            builder.screenSize = size
            builder.fontScale = 1.0
        }
        lv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lv.insetsLayoutMarginsFromSafeArea = false
        lv.preservesSuperviewLayoutMargins = false
        applyFullscreenLayout(to: lv)
        return lv
    }

    private func setupLynxView() {
        NSLog("[ProjectVC] setupLynxView devUrl=%@", DevServerPrefs.getUrl() ?? "")
        let lv = buildLynxView()
        lv.backgroundColor = .black
        lv.isHidden = false
        lv.alpha = 1
        lv.isUserInteractionEnabled = true
        view.addSubview(lv)
        TamerInsetsModule.attachHostView(lv)
#if canImport(tamerrouter)
        TamerRouterNativeModule.attachHostView(lv)
#endif
#if canImport(tamernavigation)
        TamerNavHost.attachRoot(lv, presenter: self)
#endif
        disableAutomaticInsetAdjustment(in: lv)
        pendingInitialLoadWorkItem?.cancel()
        pendingInitialLoadWorkItem = nil
        hasTriggeredInitialProjectLoad = false
        self.lynxView = lv
    }

    private func reloadLynxView() {
        NSLog("[ProjectVC] reloadLynxView")
        dismissProjectDevMenu()
        pendingInitialLoadWorkItem?.cancel()
        pendingInitialLoadWorkItem = nil
        TamerInsetsModule.attachHostView(nil)
#if canImport(tamerrouter)
        TamerRouterNativeModule.attachHostView(nil)
#endif
#if canImport(tamernavigation)
        TamerNavHost.attachRoot(nil, presenter: self)
#endif
        lynxView?.removeFromSuperview()
        lynxView = nil
        setupLynxView()
        triggerInitialProjectLoadIfNeeded(reason: "reloadLynxView")
    }

    private func triggerInitialProjectLoadIfNeeded(reason: String) {
        guard !hasTriggeredInitialProjectLoad else { return }
        guard isViewLoaded, view.window != nil else {
            NSLog("[ProjectVC] initial load waiting reason=%@ window=%@", reason, view.window != nil ? "attached" : "nil")
            return
        }
        let bounds = fullscreenBounds()
        guard bounds.width > 0, bounds.height > 0 else {
            NSLog("[ProjectVC] initial load deferred reason=%@ bounds=%@", reason, NSCoder.string(for: bounds))
            pendingInitialLoadWorkItem?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.triggerInitialProjectLoadIfNeeded(reason: "\(reason)-retry")
            }
            pendingInitialLoadWorkItem = workItem
            DispatchQueue.main.async(execute: workItem)
            return
        }
        guard let lynxView else { return }
        hasTriggeredInitialProjectLoad = true
        pendingInitialLoadWorkItem?.cancel()
        pendingInitialLoadWorkItem = nil
        applyFullscreenLayout(to: lynxView)
        NSLog("[ProjectVC] initial project load reason=%@ bounds=%@ safe=%@", reason, NSCoder.string(for: bounds), NSCoder.string(for: view.safeAreaInsets))
        lynxView.loadTemplate(fromURL: "main.lynx.bundle", initData: DevServerPrefs.getProjectInitTemplateData())
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak lynxView] in
            guard let self, let lynxView else { return }
            self.logViewport("project post-load", lynxView: lynxView)
            self.applyFullscreenLayout(to: lynxView)
            self.disableAutomaticInsetAdjustment()
        }
    }

    @objc private func handleProjectDevMenuGesture(_ gesture: UILongPressGestureRecognizer) {
        #if DEBUG
        if gesture.state == .began {
            showProjectDevMenu()
        }
        #endif
    }

    private func buildDevMenuView() -> LynxView {
        let size = fullscreenBounds().size
        let lv = LynxView { builder in
            let provider = DevTemplateProvider()
            builder.config = LynxConfig(provider: provider)
            builder.templateResourceFetcher = provider
            builder.genericResourceFetcher = provider
            builder.screenSize = size
            builder.fontScale = 1.0
        }
        lv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lv.insetsLayoutMarginsFromSafeArea = false
        lv.preservesSuperviewLayoutMargins = false
        lv.backgroundColor = .clear
        applyFullscreenLayout(to: lv)
        return lv
    }

    private func showProjectDevMenu() {
        #if DEBUG
        guard devMenuView == nil else { return }
        let lv = buildDevMenuView()
        view.addSubview(lv)
        lv.loadTemplate(fromURL: "tamer-debug.lynx.bundle", initData: nil)
        devMenuView = lv
        #endif
    }

    private func dismissProjectDevMenu() {
        devMenuView?.removeFromSuperview()
        devMenuView = nil
    }

    private func closeProjectView() {
        dismissProjectDevMenu()
        dismiss(animated: true)
    }

    private func applyFullscreenLayout(to lynxView: LynxView) {
        let bounds = fullscreenBounds()
        let size = bounds.size
        lynxView.frame = bounds
        lynxView.updateScreenMetrics(withWidth: size.width, height: size.height)
        lynxView.updateViewport(withPreferredLayoutWidth: size.width, preferredLayoutHeight: size.height, needLayout: true)
        lynxView.preferredLayoutWidth = size.width
        lynxView.preferredLayoutHeight = size.height
        lynxView.layoutWidthMode = .exact
        lynxView.layoutHeightMode = .exact
        logViewport("project apply", lynxView: lynxView)
    }

    private func fullscreenBounds() -> CGRect {
        let bounds = view.bounds
        if bounds.width > 0, bounds.height > 0 {
            return bounds
        }
        return UIScreen.main.bounds
    }

    private func disableAutomaticInsetAdjustment() {
        guard let lynxView else { return }
        disableAutomaticInsetAdjustment(in: lynxView)
    }

    private func disableAutomaticInsetAdjustment(in view: UIView) {
        if let scrollView = view as? UIScrollView {
            scrollView.contentInsetAdjustmentBehavior = .never
            scrollView.contentInset = .zero
            scrollView.scrollIndicatorInsets = .zero
            if #available(iOS 13.0, *) {
                scrollView.automaticallyAdjustsScrollIndicatorInsets = false
            }
        }
        view.insetsLayoutMarginsFromSafeArea = false
        view.preservesSuperviewLayoutMargins = false
        for subview in view.subviews {
            disableAutomaticInsetAdjustment(in: subview)
        }
    }

    private func logViewport(_ label: String, lynxView: LynxView) {
        let rootWidth = lynxView.rootWidth()
        let rootHeight = lynxView.rootHeight()
        let intrinsic = lynxView.intrinsicContentSize
        NSLog("[ProjectVC] %@ view=%@ safe=%@ lynxFrame=%@ lynxBounds=%@ root=%0.2fx%0.2f intrinsic=%@", label, NSCoder.string(for: view.bounds), NSCoder.string(for: view.safeAreaInsets), NSCoder.string(for: lynxView.frame), NSCoder.string(for: lynxView.bounds), rootWidth, rootHeight, NSCoder.string(for: intrinsic))
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        NSLog("[ProjectVC] viewWillDisappear dismissed=%@ moving=%@", isBeingDismissed ? "true" : "false", isMovingFromParent ? "true" : "false")
        // Do not tear down the root host when presenting child native controllers such as the
        // @tamer-navigation UINavigationController. The coordinator LynxView must remain attached
        // while a pushed native stack is visible so spoke->root events and updates still work.
        guard isBeingDismissed || isMovingFromParent else { return }
        dismissProjectDevMenu()
        devClientManager?.disconnect()
#if canImport(tamerrouter)
        TamerRouterNativeModule.attachHostView(nil)
#endif
        TamerInsetsModule.attachHostView(nil)
#if canImport(tamernavigation)
        TamerNavHost.attachRoot(nil, presenter: self)
#endif
#if DEBUG
        DevClientModule.dismissTamerDebugPanelHandler = previousDismissTamerDebugPanelHandler
#endif
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard isBeingDismissed || isMovingFromParent else { return }
        pendingInitialLoadWorkItem?.cancel()
        pendingInitialLoadWorkItem = nil
        onDismiss?()
    }
}
