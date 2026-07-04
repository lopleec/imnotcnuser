# imnotcnuser

Cross-platform CLI environment auditor for geo-sensitive developer tools.

`imnotcnuser` 是一个基于 TypeScript + Node.js 的跨平台 CLI，用来检查本机环境中可能影响海外开发者工具访问、风控或地区判断的信号。它会把网络出口、系统地区、输入法、常见应用、虚拟化和硬件信号合成一个可解释的 0-100 分环境评分。

> 这是启发式自检工具，不保证匿名性、访问能力或绕过任何平台政策。

## Features

- Cross-platform: macOS, Linux, Windows
- 检测系统代理和常见代理环境变量
- 使用 `ip-api.com` 和 `ipapi.is` 检测出口 IP、国家、机房/托管、代理/VPN/Tor/relay、欺诈风险等信号
- 请求 Gemini Web 页面，检查是否出现明显地区不可用或访问失败
- 检测时区、系统语言、地区格式、日期/数字格式、中文/拼音输入法
- 检测 WeChat/QQ/Tencent、Clash 等常见应用痕迹
- 检测主流浏览器、Docker/容器、虚拟机、内存、磁盘、摄像头、麦克风
- 输出人类可读报告，也支持 JSON 输出
- 每个检测点显示 `得分/满分`、状态、证据和扣分原因

## Install

安装已发布的 npm 包：

```sh
npm install -g imnotcnuser
```

不安装也可以直接用 npm 临时运行：

```sh
npx imnotcnuser
```

运行：

```sh
imnotcnuser
```

短命令：

```sh
incu
```

从源码运行：

```sh
git clone https://github.com/lopleec/imnotcnuser.git
cd imnotcnuser
npm install
npm run build
npm start
```

## Usage

```sh
imnotcnuser [options]
```

常用命令：

```sh
imnotcnuser
imnotcnuser --json
imnotcnuser --no-network
imnotcnuser --timeout 10000
imnotcnuser --ip 1.2.3.4
```

Options:

```text
--json                 Print machine-readable JSON.
--no-network           Skip IP reputation APIs and Gemini reachability.
--ip <address>         Audit a specific exit IP instead of the current public IP.
--timeout <ms>         Network and system command timeout, default 6000.
--strict-exit-code     Exit with code 2 when score is below 70.
-v, --verbose          Reserved for future verbose diagnostics.
-h, --help             Show help.
```

## Example Output

```text
imnotcnuser environment audit
Score: 88 / 100 (low risk), confidence 100%

NETWORK
Proxy configuration: A proxy configuration was found. (5/5, PASS)
Exit IP reputation: Exit IP did not show obvious China/datacenter/proxy risk signals. (26/26, PASS)
Gemini web reachability: Gemini responded without obvious region-block text. (11/11, PASS)

SYSTEM
System time zone: Time zone does not match the configured high-risk list. (10/10, PASS)
System language: No obvious Chinese UI language signal was found. (8/8, PASS)

SCORE MISSES
- Clash-like apps: 1/3 An installed app/path containing 'clash' was found.
```

## Scoring

总分为 100。每个检测点都有自己的权重：

- 通过检测：获得该项全部分数
- 警告检测：获得部分分数
- 失败检测：获得很少或 0 分
- 未知/跳过检测：不计入总分，但会降低 `confidence`

默认权重：

| Category | Points | Checks |
| --- | ---: | --- |
| Network | 42 | Proxy 5, Exit IP 26, Gemini 11 |
| System | 33 | Time zone 10, Language 8, Region/formats 8, Input method 7 |
| Apps | 8 | WeChat/QQ 5, Clash 3 |
| Human/device | 17 | Browser 3, Container/VM 7, Memory 2, Storage 3, Camera 1, Microphone 1 |

风险等级：

| Score | Risk |
| ---: | --- |
| 85-100 | low |
| 70-84 | medium |
| 50-69 | high |
| 0-49 | critical |

## JSON Output

```sh
imnotcnuser --json
```

JSON 中每个检测点包含：

```json
{
  "id": "network.gemini",
  "category": "network",
  "title": "Gemini web reachability",
  "status": "pass",
  "weight": 11,
  "scoreEarned": 11,
  "scoreMax": 11,
  "summary": "Gemini responded without obvious region-block text.",
  "evidence": [
    { "label": "status", "value": 200 }
  ]
}
```

## Checks

### Network

- Proxy: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and OS proxy settings
- Exit IP: `ip-api.com` and `ipapi.is`
- Gemini: `https://gemini.google.com/app`

### System

- Time zone
- UI language and locale
- Region, date, number, and currency format signals
- Keyboard/input methods, including Chinese/Pinyin-like input methods

### Apps

- WeChat, QQ, Tencent-related apps
- Clash-like app names in common install locations

### Human/device

- Mainstream browser presence
- Docker/container and virtual machine signals
- Memory and root storage size
- Camera and microphone presence

## Privacy / 隐私说明

The tool runs locally and does not include telemetry.

Network checks send requests to:

- `http://ip-api.com`
- `https://api.ipapi.is`
- `https://gemini.google.com/app`

Use `--no-network` to skip all external network checks:

```sh
imnotcnuser --no-network
```

Local checks inspect common OS settings and common installation paths. The CLI prints evidence in the terminal or JSON output; it does not upload local app lists or hardware details to a custom backend.

## Development

```sh
npm install
npm run check
npm run build
npm start
```

Run the built CLI directly:

```sh
node dist/index.js
```

Preview npm package contents:

```sh
npm pack --dry-run
```

## Publish

```sh
npm login
npm whoami
npm run check
npm run build
npm pack --dry-run
npm publish
```

For scoped packages, use:

```sh
npm publish --access public
```

## Acknowledgements / 致谢

- [ip-api.com](https://ip-api.com/) for IP geolocation and proxy/hosting signals
- [ipapi.is](https://ipapi.is/) for IP intelligence and datacenter/proxy risk signals
- [Google Gemini](https://gemini.google.com/) for the optional web reachability check
- [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/) for the runtime and implementation stack

## Disclaimer / 免责声明

`imnotcnuser` is a heuristic audit tool. Results can be incomplete, stale, or wrong because operating systems, network providers, IP intelligence databases, browser behavior, and third-party websites change over time.

This project does not guarantee access to any service, does not guarantee anonymity, and does not guarantee that an environment is compliant with any platform's terms, policies, regional restrictions, or risk controls.

Use this tool only for legitimate self-auditing, debugging, privacy review, and environment diagnostics. You are responsible for following applicable laws, service terms, and organizational policies.
