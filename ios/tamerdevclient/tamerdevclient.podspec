package = JSON.parse(File.read(File.join(__dir__, "..", "..", "package.json")))
lynx_sdk = package["lynxSdk"]
if lynx_sdk.nil? || lynx_sdk.empty?
  abort("[tamerdevclient] package.json must set \"lynxSdk\" to the Lynx SDK version you ship (e.g. 3.6.0), matching CocoaPods Lynx.")
end
generated_decl = File.join(__dir__, "tamerdevclient", "Classes", "TamerDeclaredLynxSdkVersion.h")
File.write(
  generated_decl,
  <<~HEADER
    // Synced from package.json "lynxSdk" when CocoaPods loads tamerdevclient.podspec — do not edit by hand.
    #ifndef TamerDeclaredLynxSdkVersion_h
    #define TamerDeclaredLynxSdkVersion_h
    #define TAMER_DECLARED_LYNX_SDK_VERSION_STRING @"#{lynx_sdk}"
    #endif
  HEADER
)

Pod::Spec.new do |s|
  s.name             = 'tamerdevclient'
  s.version          = package["version"]
  s.summary          = 'Tamer dev client native module for iOS.'
  s.description      = 'QR scan, HMR, Bonjour discovery, and project reload for the Tamer dev app.'
  s.homepage         = "https://github.com/nanofuxion"
  s.license          = package["license"]
  s.authors          = package["author"]
  s.source           = { :path => '.' }
  s.swift_version    = '5.0'
  s.ios.deployment_target = '13.0'
  s.source_files     = 'tamerdevclient/Classes/**/*.{swift,m}'
  s.public_header_files = 'tamerdevclient/Classes/TamerDevClientLynxSdkInfo.h'
  s.dependency "Lynx"
  s.dependency "tamersystemui"
end
