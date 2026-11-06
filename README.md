# 反诈鉴谎师

基于腾讯云元宝搜索（WSA）的家庭反诈核验原型。把家人收到的可疑消息拆成断言，去官方信源里找证据，输出四态裁决和一张能发进家庭群的提醒卡。

数据流向很简单：原始文本只停留在自己服务端，先脱敏成占位符版本，再去调检索；发给元宝搜索的永远是脱敏后的文本。两个密钥都只在服务端读取，不会进浏览器包。

## 技术栈

| 层 | 选型 |
| --- | --- |
| Web 框架 | Next.js 16（App Router / Turbopack） |
| UI | React 19 + TypeScript + Tailwind CSS |
| 检索 | 腾讯云元宝搜索 SearchPro（REST） |
| 模型 | 混元 hy3，经 `@cloudbase/node-sdk` |
| 导出 | html-to-image |
| 脚本 | tsx、puppeteer-core（截图与尺寸校验） |

## 目录

```
src/app/            页面与接口：/ 、/card 、/api/sanitize 、/api/verify
src/lib/            反诈链路：intake → decompose → retrieve → grade → verdict → brief
scripts/            回归、测量、截图、对比实验
openspec/           规格与任务清单
screenshots/        截图素材
```

## 环境准备

- Node.js 20+（本机验证 `v20.19.5` / npm `10.8.2`）
- 服务端能出网访问 `api.wsa.cloud.tencent.com` 和 CloudBase 网关
- 一个元宝搜索 API Key；要用模型模式的话，再准备成长计划的 CloudBase 密钥

## 配置环境变量

```bash
cp .env.example .env.local
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TENCENTCLOUD_WSA_APIKEY` | 是 | 元宝搜索密钥，只在服务端读取 |
| `LLM_BASE_URL` | 否 | CloudBase 网关地址，形如 `https://<env>.api.tcloudbasegateway.com/v1/ai/cloudbase` |
| `LLM_API_KEY` | 否 | 成长计划的 API Key（JWT 串） |
| `LLM_MODEL` | 否 | 默认 `hy3` |
| `LLM_ENV_ID` | 否 | 不填则从 `LLM_BASE_URL` 的域名第一段自动取 |
| `DECOMPOSER_MODE` | 否 | `llm` 走模型（失败自动降级规则）；`rule` 强制规则模式 |
| `WSA_TIMEOUT_MS` | 否 | 单次检索超时，默认 8000 |
| `WSA_MAX_REQUESTS` | 否 | 单案检索上限，默认 12 |
| `WSA_CONCURRENCY` | 否 | 并发数，默认 4 |

注意：不要给这些变量加 `NEXT_PUBLIC_` 前缀，否则会被打进浏览器包。

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000

局域网里用手机访问时，要显式绑定网卡：

```bash
npm run dev -- -H 0.0.0.0
```

## 生产部署

### 构建与启动

```bash
npm ci
npm run build
npm start -- -H 0.0.0.0 -p 3000
```

### PM2 示例

```bash
pm2 start "npm start -- -H 0.0.0.0 -p 3000" --name anti-fraud
pm2 save
```

### Nginx 反向代理（HTTPS 必需）

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**必须上 HTTPS**。复制转发链接用的是 `navigator.clipboard`，在 `http://IP` 这种非安全上下文里会被浏览器拒绝。

## 使用方式

1. 粘贴家人收到的短信、聊天记录或通话话术。
2. 选家人当前处在哪一步：仅收到消息 / 已加群或已填写信息 / 已安装远程应用或开启屏幕共享 / 已转账。这一步决定行动建议的强度。
3. 点"开始核验"，先看脱敏确认页，再点"确认并核验"。
4. 结果页给四样东西：结论、套路解剖（钩子 / 施压 / 孤立 / 索要）、下一步统计（同类案例的动作频次）、家人提醒卡。
5. 卡片可以存长图，也可以复制分享链接（`/card?d=...`），手机打开是同一张卡。

结论只有四档：

| 结论 | 含义 |
| --- | --- |
| 高危 | 找到与断言相关的官方通报 |
| 可疑 | 有官方内容但相关度不足，或证据互相冲突 |
| 存疑，需人工核实 | 证据不足，不下判断 |
| 未见异常 | 没命中官方诈骗语境，但仍建议走官方渠道再确认一次 |

### API 接口

```bash
POST /api/sanitize   {"text":"原始消息"}            # 只返回脱敏文本与占位符
POST /api/verify     {"text":"脱敏后文本","familyState":"message_only"}
```

### 性能提示

演示时优先用规则模式（`DECOMPOSER_MODE=rule`）。规则模式单案约 600ms、3 到 7 次检索；模型模式约 7 秒、12 次检索。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run spike` | 5 条预置话术跑通 SearchPro，统计一级官方信源占比 |
| `npx tsx scripts/compare.ts` | 三种做法对比实验 |
| `npx tsx scripts/metrics.ts` | 检索耗时、摘要长度、日期分布 |
| `npx tsx scripts/llm-probe.ts` | 模型拆解单测 |
| `npx tsx scripts/llm-e2e.ts` | 模型模式端到端 |
| `node scripts/capture.mjs` | 重新生成截图（需服务在跑） |
| `node scripts/mobile-check.mjs` | 三档手机宽度实测（需服务在跑） |

## 已知限制

- 只支持粘贴文本，截图输入没做。
- 规则模式按标点切句，长句拆得偏粗；模型模式拆得细但慢十倍，目前两条路并存。
- 分享链接把卡片数据编码进 URL，内容特别长时个别客户端可能截断，优先发长图。
- 反诈结论来自确定性规则，规则覆盖不到的话术会落到"存疑"或"未见异常"，不代表安全。

## 免责声明

信息核验仅供参考，不构成安全承诺或法律意见。紧急情况请拨打 96110 或 110。
