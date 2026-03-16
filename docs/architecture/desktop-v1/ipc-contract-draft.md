# Desktop V1 IPC 接口草案

> 状态：Draft

## 1. 任务接口

### `task:create`
- 请求：
  - `sourcePath: string`
  - `outputOverride?: string`
  - `settings: object`
- 响应：
  - `taskId: string`

### `task:run`
- 请求：
  - `taskId: string`
  - `forceRetranslate: boolean`
- 响应：
  - `accepted: boolean`

### `task:cancel`
- 请求：`taskId: string`
- 响应：`cancelled: boolean`

### `task:retryFailures`
- 请求：`taskId: string`
- 响应：`accepted: boolean`

## 2. 状态与结果

### `task:subscribe`
- 请求：`taskId: string`
- 事件推送：
  - `status: idle|running|success|partial_failure|failure|cancelled`
  - `progress: number (0-100)`
  - `message: string`

### `task:getSummary`
- 请求：`taskId: string`
- 响应：
  - `runSummary`（映射 `RunSummary`）

## 3. 历史与设置

### `history:list`
- 请求：筛选参数（可选）
- 响应：任务摘要列表

### `history:get`
- 请求：`taskId: string`
- 响应：任务详情

### `settings:get`
- 请求：无
- 响应：当前设置对象（敏感字段脱敏）

### `settings:save`
- 请求：设置对象
- 响应：`saved: boolean`

## 4. 错误模型
- 所有接口统一返回：
  - `code: string`
  - `message: string`
  - `hint?: string`
- 建议错误码：
  - `E_PATH_INVALID`
  - `E_AUTH_MISSING`
  - `E_TRANSLATOR_TIMEOUT`
  - `E_CONFIG_INVALID`
  - `E_INTERNAL`
