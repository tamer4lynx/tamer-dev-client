import pkg from '../package.json'

export const DEV_CLIENT_PACKAGE_VERSION = (pkg as { version: string }).version
