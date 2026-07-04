export const PACKAGE_INFO = {
  name: "imnotcnuser",
  displayName: "imnotcnuser",
  userAgent: "Mozilla/5.0 imnotcnuser",
  repositoryUrl: "https://github.com/lopleec/imnotcnuser"
} as const;

export const CLI_TIMEOUTS = {
  defaultMs: 6000,
  minMs: 1000,
  maxMs: 30000
} as const;

export const COMMAND_TIMEOUTS = {
  shortMs: 1500,
  defaultMs: 3000,
  windowsDeviceMs: 4000,
  profilerMs: 5000
} as const;

export const SCORE_WEIGHTS = {
  network: {
    proxy: 5,
    exitIp: 26,
    gemini: 11
  },
  system: {
    timeZone: 10,
    language: 8,
    regionFormats: 8,
    inputMethod: 7
  },
  apps: {
    messaging: 5,
    clash: 3
  },
  human: {
    browser: 3,
    containerVm: 7,
    memory: 2,
    storage: 3,
    camera: 1,
    microphone: 1
  }
} as const;

export const SCORE_PENALTIES = {
  network: {
    missingProxy: -3,
    exitIpApiFailure: -6,
    exitIpChina: -26,
    exitIpHosting: -10,
    exitIpProxyVpnTor: -5,
    exitIpFraudHigh: -6,
    exitIpFraudVeryHigh: -10,
    geminiTimeout: -7,
    geminiFailure: -11
  },
  apps: {
    clashDetected: -2
  },
  human: {
    container: -7,
    virtualMachine: -5
  }
} as const;

export const NETWORK_ENDPOINTS = {
  ipApiBaseUrl: "http://ip-api.com/json",
  ipApiFields: "status,message,query,country,countryCode,city,isp,org,as,asname,proxy,hosting,mobile",
  ipapiBaseUrl: "https://api.ipapi.is",
  geminiAppUrl: "https://gemini.google.com/app"
} as const;

export const RISK_TIME_ZONES = [
  "asia/shanghai",
  "asia/chongqing",
  "asia/harbin",
  "asia/urumqi",
  "asia/hong_kong",
  "asia/macau",
  "asia/taipei",
  "prc",
  "hongkong",
  "roc"
] as const;

export const CHINESE_LOCALE_PATTERNS = [
  "zh",
  "zh_cn",
  "zh-cn",
  "zh_hans",
  "zh-hans",
  "zh_tw",
  "zh-tw",
  "zh_hant",
  "zh-hant",
  "cn",
  "hans",
  "hant"
] as const;

export const INPUT_METHOD_RISK_PATTERN = /pinyin|sogou|rime|squirrel|scim|tcim|wubi|shuangpin|chinese|simplified|traditional|zh-|zh_|0804|0404|e00e/i;

export const HARDWARE_THRESHOLDS = {
  minMemoryGb: 2,
  minStorageGb: 50
} as const;

export const NETWORK_THRESHOLDS = {
  fraudHigh: 50,
  fraudVeryHigh: 75
} as const;
