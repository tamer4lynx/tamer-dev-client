package = JSON.parse(File.read(File.join(__dir__, "..", "..", "package.json")))

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
  s.source_files     = 'tamerdevclient/Classes/**/*.swift'
  s.dependency "Lynx"
end
