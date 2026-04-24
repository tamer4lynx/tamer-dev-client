import UIKit
import Lynx
import tamerdevclient
import tamerinsets
import tamerrouter
import tamersystemui

private func tamer_disableLynxLongPressMenuIfAvailable() {
    guard let cls = NSClassFromString("LynxDevtoolEnv") else { return }
    let sel = NSSelectorFromString("sharedInstance")
    guard let env = (cls as AnyObject).perform(sel)?.takeUnretainedValue() as? NSObject else { return }
    env.setValue(false, forKey: "longPressMenuEnabled")
}

class DevLauncherViewController: UIViewController {
    private var lynxView: LynxView?
    private weak var activeProjectViewController: ProjectViewController?

    override func viewDidLoad() {
        super.viewDidLoad()
        tamer_disableLynxLongPressMenuIfAvailable()
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
        setupDevClientModule()
    }

    override var canBecomeFirstResponder: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        _ = becomeFirstResponder()
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        ShakeDetector.handleMotionEnded(motion) {
            DevClientModule.emitShakeDetected()
        }
        super.motionEnded(motion, with: event)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let lynxView = lynxView {
            applyFullscreenLayout(to: lynxView)
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        TamerInsetsModule.reRequestInsets()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { SystemUIModule.statusBarStyleForHost }

    private func setupLynxView() {
        let size = fullscreenBounds().size
        let lv = LynxView { builder in
            builder.config = LynxConfig(provider: DevTemplateProvider())
            builder.screenSize = size
            builder.fontScale = 1.0
        }
        lv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        lv.insetsLayoutMarginsFromSafeArea = false
        lv.preservesSuperviewLayoutMargins = false
        view.addSubview(lv)
        applyFullscreenLayout(to: lv)
        TamerInsetsModule.attachHostView(lv)
        TamerRouterNativeModule.attachHostView(lv)
        lv.loadTemplate(fromURL: "dev-client.lynx.bundle", initData: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self, weak lv] in
            guard let self, let lv else { return }
            self.applyFullscreenLayout(to: lv)
        }
        self.lynxView = lv
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
    }

    private func fullscreenBounds() -> CGRect {
        let bounds = view.bounds
        if bounds.width > 0, bounds.height > 0 { return bounds }
        return UIScreen.main.bounds
    }

    private func presentProjectViewController(bundleUrl: String? = nil) {
        if let bundleUrl, !bundleUrl.isEmpty {
            DevServerPrefs.setUrl(bundleUrl)
        }
        if presentedViewController is ProjectViewController {
            NSLog("[DevLauncher] presentProjectViewController skipped already presenting project")
            return
        }
        guard presentedViewController == nil else {
            NSLog("[DevLauncher] presentProjectViewController skipped existing presented=%@", String(describing: presentedViewController))
            return
        }
        let projectVC = ProjectViewController()
        projectVC.modalPresentationStyle = .fullScreen
        projectVC.onDismiss = { [weak self, weak projectVC] in
            guard let self else { return }
            if self.activeProjectViewController === projectVC {
                self.restoreLauncherLynxView()
                self.activeProjectViewController = nil
            }
        }
        self.quiesceLauncherLynxView()
        self.activeProjectViewController = projectVC
        self.present(projectVC, animated: true) { [weak self] in
            self?.restoreLauncherIfPresentationDidNotStick()
        }
    }

    private func setupDevClientModule() {
        DevClientModule.presentQRScanner = { [weak self] completion in
            let scanner = QRScannerViewController()
            scanner.onResult = { url in
                scanner.dismiss(animated: true) { completion(url) }
            }
            scanner.modalPresentationStyle = .fullScreen
            self?.present(scanner, animated: true)
        }

        DevClientModule.reloadProjectHandler = { [weak self] in
            guard let self = self else { return }
            self.presentProjectViewController()
        }

        DevClientModule.openProjectDirectHandler = { [weak self] bundleUrl in
            guard let self = self else { return }
            self.presentProjectViewController(bundleUrl: bundleUrl)
        }
    }

    private func quiesceLauncherLynxView() {
        guard let lynxView else { return }
        lynxView.isHidden = true
        lynxView.alpha = 0
        lynxView.isUserInteractionEnabled = false
        NSLog("[DevLauncher] launcher LynxView hidden while project is presented")
    }

    private func restoreLauncherLynxView() {
        guard let lynxView else { return }
        lynxView.isHidden = false
        lynxView.alpha = 1
        lynxView.isUserInteractionEnabled = true
        NSLog("[DevLauncher] launcher LynxView restored")
    }

    private func restoreLauncherIfPresentationDidNotStick() {
        guard presentedViewController == nil else { return }
        restoreLauncherLynxView()
        activeProjectViewController = nil
    }
}
