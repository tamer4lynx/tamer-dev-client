import UIKit

public enum ShakeDetector {
    public static func handleMotionEnded(_ motion: UIEvent.EventSubtype, onShake: () -> Void) {
        guard motion == .motionShake else { return }
        onShake()
    }
}
