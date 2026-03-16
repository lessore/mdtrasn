# Volcengine OpenAPI SDK Reference

本地已安装火山引擎官方 Node SDK，便于后续查询和复用。

## 本地位置

- 包目录：`/Users/lsh/Desktop/mdtrasn/node_modules/@volcengine/openapi`
- 中文说明：`/Users/lsh/Desktop/mdtrasn/node_modules/@volcengine/openapi/README_zh.md`
- 当前版本：`@volcengine/openapi@1.36.0`

## 当前项目中的接入位置

- 火山翻译适配器：`/Users/lsh/Desktop/mdtrasn/src/translator/volcengine.ts`
- 统一 provider 入口：`/Users/lsh/Desktop/mdtrasn/src/translator/index.ts`
- 配置类型：`/Users/lsh/Desktop/mdtrasn/src/types.ts`

## 已确认的翻译接口信息

- Host: `translate.volcengineapi.com`
- Service: `translate`
- Action: `TranslateText`
- Version: `2020-06-01`
- Region: `cn-north-1`

## 参考资料

- 官方文档：[火山引擎文本翻译 API](https://www.volcengine.com/docs/4640/65067?lang=zh)
- SDK 包说明：`README_zh.md`

## 备注

- 当前项目使用官方签名器生成认证头，再自行发起 HTTPS 请求，以避开当前运行环境里的代理冲突。
- 不要把 AK/SK 写入仓库；请始终通过环境变量传入。
