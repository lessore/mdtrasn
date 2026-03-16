# Desktop V1 模块边界

## 1. 分层
1. UI Layer（桌面渲染层）
- 页面渲染、用户输入、状态展示

2. App Service Layer（应用服务层）
- 任务生命周期管理
- 运行状态聚合
- 设置与历史读写编排

3. Core Engine Layer（核心引擎层）
- 翻译执行（复用 `src/service.ts`）
- 配置读取与合并（复用 `src/config.ts`）
- 文档解析与翻译（复用 `src/markdown.ts`）

4. Infrastructure Layer（基础设施）
- 文件系统、日志、缓存、进程调用（Typora）

## 2. 模块职责原则
- UI 不直接读写底层文件，统一经由应用服务层。
- 应用服务层不实现翻译算法，只编排任务。
- 核心引擎层保持与 UI 技术栈无关。

## 3. 依赖方向
UI -> App Service -> Core Engine -> Infrastructure

禁止反向依赖，避免循环耦合。
