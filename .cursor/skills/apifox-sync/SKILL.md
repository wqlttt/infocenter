---
name: 'apifox-sync'
description: 'Sync API endpoints to Apifox documentation. Invoke when user asks to sync interfaces to Apifox, update API docs, or add new endpoints to documentation.'
---

# Apifox Sync

This skill helps sync NestJS Controller API endpoints to Apifox documentation platform.

## When to Use

Invoke this skill when:

- User says "sync interfaces to Apifox"
- User says "update API documentation"
- User says "add new endpoints to docs"
- User mentions syncing NestJS controllers to Apifox

## Configuration

Apifox project ID: 8494271

## Workflow

### Step 1: Identify Sync Scope

**Use AskUserQuestion tool to let user select scope:**

```typescript
AskUserQuestion({
  questions: [
    {
      question: '请选择需要同步的范围：',
      header: 'Sync Scope',
      multiSelect: false,
      options: [
        {
          label: '特定 Controller 文件',
          description: '同步单个 controller 文件（如 job.controller.ts）'
        },
        {
          label: '整个模块',
          description:
            '同步整个模块下的所有 controllers（如 src/controllers/*.controller.ts）'
        },
        {
          label: '所有变更的接口',
          description: '基于 git diff main 检测变更的接口'
        },
        {
          label: '所有 Controller 接口',
          description: '同步项目中所有 controller 接口'
        }
      ]
    }
  ]
})
```

If user selects "特定 Controller 文件", ask for the specific file path.

### Step 2: Parse Controller Files

Read the specified Controller files and extract endpoint metadata:

1. **Read file content** using Read tool
2. **Parse TypeScript AST** to extract:
   - Controller prefix from `@Controller()` decorator
   - HTTP methods from `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` decorators
   - Route paths
   - Parameters from `@Query()`, `@Param()`, `@Header()`, `@Body()` decorators
   - DTO types for request/response schemas
3. **Check for Response Interceptor** - Read the interceptor file to understand response wrapping logic

### Step 3: Get Apifox Existing Endpoints

```typescript
mcp_apifox_new_mcp_getStructureInfo({
  projectId: {{projectId}},
  entityType: 'endpoint'
})
```

### Step 4: Compare and Generate Actions (MUST FOLLOW STRICTLY)

**⚠️ CRITICAL: This step MUST be completed for ALL endpoints, not just new ones.**

For each endpoint found in code:

1. **Check if exists** in Apifox by matching `method` + `path`
2. **If not exists** → Mark as **CREATE**
3. **If exists** → **MUST** get detailed info and compare:
   ```typescript
   mcp_apifox_new_mcp_getHttpEndpoint({
     pathParams: {
       projectId: {{projectId}},
       httpApiId: <entityId from step 4>
     }
   })
   ```
4. **Compare fields** (check each one):
   - `name` - endpoint name
   - `description` - endpoint description
   - `parameters` - query/path/header params (compare structure)
   - `requestBody` - body schema (compare jsonSchema)
   - `responses` - response definitions (compare jsonSchema)
5. **If any field differs** → Mark as **UPDATE** and document the difference
6. **If all fields match exactly** → Mark as **SKIP**

**❌ DO NOT:**

- Skip comparison for existing endpoints
- Assume "exists = no change needed"
- Only check method+path match

**✅ MUST DO:**

- Call getHttpEndpoint for EVERY existing endpoint
- Perform field-by-field comparison
- Show differences in the report

### Step 5: Present Changes to User (WITH INTERACTIVE OPTIONS)

**MUST use this exact format and provide clickable options:**

```
## 接口同步分析报告

**文件**: apps/exam/src/controllers/test.controller.ts

### 接口对比详情

| 方法 | 路径 | 代码状态 | Apifox状态 | 操作 | 差异说明 |
|------|------|----------|------------|------|----------|
| POST | /test/new-api | 有JSDoc | 不存在 | CREATE | - |
| GET | /test/users | 有JSDoc | 存在 | UPDATE | description不同 |
| POST | /test/login | 无JSDoc | 存在 | SKIP | 完全一致 |

### 汇总

- **将要创建**: 1 个
- **将要更新**: 1 个
- **跳过**: 1 个

### 详细变更

**CREATE (1个)**:
- POST /test/new-api - 新接口

**UPDATE (1个)**:
- GET /test/users - description: "获取用户" → "获取用户列表"

**SKIP (1个)**:
- POST /test/login - 已存在且一致
```

**Then use AskUserQuestion for confirmation:**

```typescript
AskUserQuestion({
  questions: [
    {
      question: '检测到以上变更，请选择操作：',
      header: 'Confirm Action',
      multiSelect: false,
      options: [
        { label: '确认执行', description: '执行所有 CREATE 和 UPDATE 操作' },
        {
          label: '仅创建新接口',
          description: '只执行 CREATE 操作，跳过 UPDATE'
        },
        { label: '取消', description: '不执行任何操作' }
      ]
    }
  ]
})
```

**Wait for user selection before proceeding.**

### Step 6: Execute Sync

Based on user's selection from Step 5, execute the corresponding actions.

For each **CREATE** action:

```typescript
mcp_apifox_new_mcp_createHttpEndpoint({
  headers: { 'X-Project-Id': '{{projectId}}' },
  body: {
    method: 'post',
    path: '/test/test-apifox-mcp',
    name: '接口名称',
    description: '接口描述',
    folderId: 1001, // optional
    parameters: JSON.stringify({
      path: [...],
      query: [...],
      header: [...]
    }),
    requestBody: JSON.stringify({
      type: 'application/json',
      parameters: [...],
      jsonSchema: {...}
    }),
    responses: JSON.stringify([
      {
        name: '成功响应',
        code: 200,
        contentType: 'json',
        jsonSchema: {...}
      }
    ])
  }
})
```

For each **UPDATE** action:

```typescript
mcp_apifox_new_mcp_updateHttpEndpoint({
  headers: { 'X-Project-Id': '{{projectId}}' },
  pathParams: { http_api_id: 123456 },
  body: {
    method: 'post',
    path: '/test/test-apifox-mcp',
    name: '更新后的名称',
    description: '更新后的描述',
    parameters: JSON.stringify({...}),
    requestBody: JSON.stringify({...}),
    responses: JSON.stringify({...})
  }
})
```

After execution, report the results to user.

## Parameter Format Reference

### requestBody Format

```json
{
  "type": "application/json",
  "parameters": [
    {
      "name": "projectId",
      "type": "string",
      "required": true,
      "description": "项目ID"
    }
  ],
  "jsonSchema": {
    "type": "object",
    "properties": {
      "projectId": { "type": "string" }
    },
    "required": ["projectId"]
  }
}
```

### responses Format

```json
[
  {
    "name": "成功响应",
    "code": 200,
    "contentType": "json",
    "jsonSchema": {
      "type": "object",
      "properties": {
        "code": {
          "type": "number",
          "description": "响应状态码",
          "example": 200
        },
        "data": { "type": "object", "description": "实际响应数据" }
      },
      "required": ["code", "data"]
    }
  }
]
```

## DTO to JSON Schema Conversion

**⚠️ CRITICAL: Must properly handle required fields**

### Required vs Optional Rules

| 条件            | Required           | Optional           |
| --------------- | ------------------ | ------------------ |
| Type definition | `name: string`     | `name?: string`    |
| Decorator       | 无 `@IsOptional()` | 有 `@IsOptional()` |

### Example

```typescript
export class JobDto {
  @IsString()
  jobTitle: string // REQUIRED

  @IsOptional()
  @IsString()
  description?: string // OPTIONAL
}
```

**Generated Schema:**

```json
{
  "type": "object",
  "properties": {
    "jobTitle": { "type": "string" },
    "description": { "type": "string" }
  },
  "required": ["jobTitle"] // ⚠️ MUST include this array
}
```

## Response Interceptor Handling

**⚠️ CRITICAL: Must check ResponseInterceptor**

Read `src/core/response.decorator.ts` and `src/constant/auth.constant.ts` (for `response_whitelist`) to understand response wrapping.

### Rules

| Endpoint Type    | Schema Format                        |
| ---------------- | ------------------------------------ |
| In whitelist     | Raw DTO schema                       |
| Not in whitelist | Wrap with `{ code: 200, data: ... }` |

### Wrapped Schema Template

```json
{
  "type": "object",
  "properties": {
    "code": { "type": "number", "example": 200 },
    "data": {
      /* DTO schema here */
    }
  },
  "required": ["code", "data"]
}
```

## Best Practices & Common Mistakes

### ✅ DO

| Practice                    | Description                                                               |
| --------------------------- | ------------------------------------------------------------------------- |
| Compare before sync         | Call `getHttpEndpoint` for ALL existing endpoints, compare field-by-field |
| Get user confirmation       | Show changes in table format, use `AskUserQuestion` for confirmation      |
| Handle pagination           | Fetch ALL pages when `total > 100`                                        |
| Respect ResponseInterceptor | Check whitelist, wrap with `{ code, data }` if needed                     |
| Include required fields     | Add `required` array to JSON Schema based on DTO analysis                 |

### ❌ DON'T

| Mistake                                       | Impact                                  |
| --------------------------------------------- | --------------------------------------- |
| Only check method+path match                  | Miss field-level changes                |
| Skip `getHttpEndpoint` for existing endpoints | Can't detect differences                |
| Proceed without confirmation                  | User loses control                      |
| Miss `required` array                         | All fields appear as optional in Apifox |
| Use text input instead of `AskUserQuestion`   | Poor UX                                 |
