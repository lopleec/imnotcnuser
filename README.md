# imnotcnuser

Cross-platform CLI environment auditor for geo-sensitive developer tools.

Languages: [中文](#中文) | [English](#english)

---

## 中文

`imnotcnuser` 是一个基于 TypeScript + Node.js 的跨平台命令行工具，用来检查本机环境中可能影响海外开发者工具访问、风控或地区判断的信号。

它会检测网络出口、系统地区、输入法、常见应用、虚拟化和硬件信号，并输出一个可解释的 0-100 分环境评分。

> 这是启发式自检工具，不保证匿名性、访问能力，也不保证绕过任何平台政策或地区限制。

### 安装

全局安装：

```sh
npm install -g imnotcnuser
```

不安装，直接临时运行：

```sh
npx imnotcnuser
```

### 使用

```sh
imnotcnuser
```

短命令：

```sh
incu
```

常用参数：

```sh
imnotcnuser --json
imnotcnuser --no-network
imnotcnuser --timeout 10000
imnotcnuser --ip 1.2.3.4
```

参数说明：

```text
--json                 输出 JSON。
--no-network           跳过 IP 信誉 API 和 Gemini 页面访问检测。
--ip <address>         检测指定出口 IP，而不是当前公网 IP。
--timeout <ms>         网络请求和系统命令超时时间，默认 6000。
--strict-exit-code     分数低于 70 时以退出码 2 退出。
-v, --verbose          预留参数。
-h, --help             显示帮助。
```

### 示例输出

```text
imnotcnuser environment audit
Score: 98 / 100 (low risk), confidence 100%

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

### 检测内容

网络：

- 系统代理和 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`
- 通过 `ip-api.com` 和 `ipapi.is` 检测出口 IP
- 检测国家、运营商、机房/托管、代理/VPN/Tor/relay、欺诈风险等信号
- 请求 `https://gemini.google.com/app`，检查是否有明显地区不可用或访问失败

系统：

- 时区
- 系统语言和 UI locale
- 地区、日期、数字和货币格式
- 键盘和输入法，包括中文/拼音输入法信号

应用痕迹：

- WeChat、QQ、Tencent 相关应用
- Clash 相关应用名称

真实用户/设备信号：

- 主流浏览器
- Docker、容器、虚拟机信号
- 内存和根磁盘大小
- 摄像头和麦克风

### 评分

总分为 100。每个检测点都有自己的权重：

- 通过检测：获得该项全部分数
- 警告检测：获得部分分数
- 失败检测：获得很少或 0 分
- 未知/跳过检测：不计入总分，但会降低 `confidence`

默认权重：

| 分类 | 分数 | 检测项 |
| --- | ---: | --- |
| Network | 42 | Proxy 5, Exit IP 26, Gemini 11 |
| System | 33 | Time zone 10, Language 8, Region/formats 8, Input method 7 |
| Apps | 8 | WeChat/QQ 5, Clash 3 |
| Human/device | 17 | Browser 3, Container/VM 7, Memory 2, Storage 3, Camera 1, Microphone 1 |

风险等级：

| 分数 | 风险 |
| ---: | --- |
| 85-100 | low |
| 70-84 | medium |
| 50-69 | high |
| 0-49 | critical |

### JSON 输出

```sh
imnotcnuser --json
```

每个检测点会包含：

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

### 隐私说明

本工具在本机运行，不包含遥测。

网络检测会访问：

- `http://ip-api.com`
- `https://api.ipapi.is`
- `https://gemini.google.com/app`

如果不想发起外部网络请求，可以使用：

```sh
imnotcnuser --no-network
```

本地检测会读取常见系统设置和常见应用安装路径。CLI 会把检测证据输出到终端或 JSON；它不会把本机应用列表、硬件信息上传到自定义后端。

### 致谢

- [ip-api.com](https://ip-api.com/) 提供 IP 地理位置和代理/托管信号
- [ipapi.is](https://ipapi.is/) 提供 IP 情报和机房/代理风险信号
- [Google Gemini](https://gemini.google.com/) 用于可选的网页可达性检测
- [Node.js](https://nodejs.org/) 和 [TypeScript](https://www.typescriptlang.org/) 提供运行时和开发栈

### 免责声明

`imnotcnuser` 是启发式环境审计工具。由于操作系统、网络服务商、IP 情报数据库、浏览器行为和第三方网站都可能变化，检测结果可能不完整、过期或错误。

本项目不保证你能访问任何服务，不保证匿名性，也不保证你的环境符合任何平台的条款、政策、地区限制或风控规则。

请仅将本工具用于合法的自检、调试、隐私审查和环境诊断。你需要自行遵守适用法律、服务条款和组织政策。

---

## English

`imnotcnuser` is a cross-platform TypeScript + Node.js CLI that audits local environment signals that may affect access, trust, or regional risk checks for geo-sensitive developer tools.

It checks network exit, system region, input methods, installed app traces, virtualization, and device signals, then reports an explainable 0-100 environment score.

> This is a heuristic self-audit tool. It does not guarantee anonymity, access, or bypass of any service policy or regional restriction.

### Install

Install globally:

```sh
npm install -g imnotcnuser
```

Run without installing:

```sh
npx imnotcnuser
```

### Usage

```sh
imnotcnuser
```

Short command:

```sh
incu
```

Common options:

```sh
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

### Example Output

```text
imnotcnuser environment audit
Score: 98 / 100 (low risk), confidence 100%

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

### Checks

Network:

- System proxy and `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`
- Exit IP checks through `ip-api.com` and `ipapi.is`
- Country, ISP, datacenter/hosting, proxy/VPN/Tor/relay, and fraud-risk signals
- `https://gemini.google.com/app` reachability and obvious regional block responses

System:

- Time zone
- System language and UI locale
- Region, date, number, and currency formats
- Keyboard/input methods, including Chinese/Pinyin-like input methods

App traces:

- WeChat, QQ, Tencent-related apps
- Clash-like app names

Human/device signals:

- Mainstream browser presence
- Docker, container, and virtual machine signals
- Memory and root storage size
- Camera and microphone presence

### Scoring

The score is weighted out of 100 points:

- Passing checks earn full points
- Warnings earn partial points
- Failed checks earn few or no points
- Unknown/skipped checks are excluded from the score and lower `confidence`

Default weights:

| Category | Points | Checks |
| --- | ---: | --- |
| Network | 42 | Proxy 5, Exit IP 26, Gemini 11 |
| System | 33 | Time zone 10, Language 8, Region/formats 8, Input method 7 |
| Apps | 8 | WeChat/QQ 5, Clash 3 |
| Human/device | 17 | Browser 3, Container/VM 7, Memory 2, Storage 3, Camera 1, Microphone 1 |

Risk levels:

| Score | Risk |
| ---: | --- |
| 85-100 | low |
| 70-84 | medium |
| 50-69 | high |
| 0-49 | critical |

### JSON Output

```sh
imnotcnuser --json
```

Each check includes:

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

### Privacy

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

### Acknowledgements

- [ip-api.com](https://ip-api.com/) for IP geolocation and proxy/hosting signals
- [ipapi.is](https://ipapi.is/) for IP intelligence and datacenter/proxy risk signals
- [Google Gemini](https://gemini.google.com/) for the optional web reachability check
- [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/) for the runtime and implementation stack

### Disclaimer

`imnotcnuser` is a heuristic audit tool. Results can be incomplete, stale, or wrong because operating systems, network providers, IP intelligence databases, browser behavior, and third-party websites change over time.

This project does not guarantee access to any service, does not guarantee anonymity, and does not guarantee that an environment is compliant with any platform's terms, policies, regional restrictions, or risk controls.

Use this tool only for legitimate self-auditing, debugging, privacy review, and environment diagnostics. You are responsible for following applicable laws, service terms, and organizational policies.
